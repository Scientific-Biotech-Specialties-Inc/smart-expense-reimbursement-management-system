<?php

namespace App\Modules\Shared\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use App\Modules\Users\Models\User;
use Illuminate\Support\Facades\Auth;

class AuthenticateWithExternalService
{
    /**
     * Handle an incoming request by validating the token via the
     * capstone-auth-module and provisioning a local user profile.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $authorizationHeader = $request->header('Authorization');
        
        $token = null;
        if ($authorizationHeader && str_starts_with($authorizationHeader, 'Bearer ')) {
            $token = str_replace('Bearer ', '', $authorizationHeader);
        } elseif ($request->hasCookie('access_token')) {
            $token = $request->cookie('access_token');
        }

        if (!$token) {
            \Illuminate\Support\Facades\Log::error("No token found. Header: " . ($authorizationHeader ?: 'null') . " Cookie: " . ($request->cookie('access_token') ?: 'null'));
            return response()->json([
                'message' => 'Unauthorized. Bearer token or cookie missing.',
            ], 401);
        }

        $token = urldecode($token);

        $keyPath = env('JWT_PUBLIC_KEY_PATH', storage_path('oauth-public.key'));
        if (!file_exists($keyPath)) {
            $keyPath = base_path($keyPath);
        }

        if (!file_exists($keyPath)) {
            \Illuminate\Support\Facades\Log::error("Public key not found at: {$keyPath}");
            return response()->json(['message' => 'Unauthorized. Public key configuration missing.'], 401);
        }

        try {
            $publicKey = file_get_contents($keyPath);
            $decoded = \Firebase\JWT\JWT::decode($token, new \Firebase\JWT\Key($publicKey, 'RS256'));

            // Check if the JWT ID (jti) is blacklisted in Redis
            if (\Illuminate\Support\Facades\Cache::has("jwt_blacklist:{$decoded->jti}")) {
                return response()->json(['message' => 'Unauthorized. Token has been revoked.'], 401);
            }

            $email = $decoded->email ?? null;
            if (!$email) {
                \Illuminate\Support\Facades\Log::error("Token payload missing email. Payload: " . json_encode($decoded));
                return response()->json(['message' => 'Unauthorized. Invalid token payload (missing email).'], 401);
            }

            $firstName = trim((string) ($decoded->first_name ?? ''));
            $lastName = trim((string) ($decoded->last_name ?? ''));
            $fullName = trim($firstName . ' ' . $lastName);
            $department = $decoded->department ?? 'General';
            $normalizedDepartment = strtolower(trim((string) $department));
            $sermsRole = $normalizedDepartment === 'accounting' ? 'admin' : 'employee';

            $userId = $decoded->sub ?? null;

            if (!$userId) {
                \Illuminate\Support\Facades\Log::error("Token payload missing sub. Payload: " . json_encode($decoded));
                return response()->json(['message' => 'Unauthorized. Invalid token payload (missing user ID).'], 401);
            }

            // Find or create the user in the local SERMS database to maintain foreign keys
            $user = User::where('auth_id', $userId)->first();

            if (!$user) {
                // Fallback to finding by email in case they were created before auth_id was added
                $user = User::where('email', $email)->first();
                if ($user) {
                    $user->update([
                        'auth_id' => $userId,
                        'name' => $user->name ?: $fullName,
                        'first_name' => $user->first_name ?: ($firstName ?: null),
                        'last_name' => $user->last_name ?: ($lastName ?: null),
                        'role' => $sermsRole,
                        'department' => $department,
                    ]);
                } else {
                    $user = User::create([
                        'auth_id' => $userId,
                        'email' => $email,
                        'name' => $fullName,
                        'first_name' => $firstName ?: null,
                        'last_name' => $lastName ?: null,
                        'role' => $sermsRole,
                        'department' => $department,
                    ]);
                }
            } else {
                // Update company-controlled details; only backfill name parts if not yet set locally
                $updateFields = [
                    'email' => $email,
                    'role' => $sermsRole,
                    'department' => $department,
                ];
                if (empty($user->first_name) && $firstName !== '') {
                    $updateFields['first_name'] = $firstName;
                }
                if (empty($user->last_name) && $lastName !== '') {
                    $updateFields['last_name'] = $lastName;
                }
                if (empty($user->name) && $fullName !== '') {
                    $updateFields['name'] = $fullName;
                }
                $user->update($updateFields);
            }

            // Record login activity once per unique JWT token (G2-110)
            $loginCacheKey = 'serms_login_logged:' . ($decoded->jti ?? sha1($token));
            if (\Illuminate\Support\Facades\Cache::add($loginCacheKey, true, 86400)) {
                $user->forceFill(['last_login_at' => now()])->save();
                \App\Modules\AuditLogs\Services\AuditLogService::log(
                    $user->id,
                    $user->role ?? $sermsRole,
                    'USER_LOGIN',
                    'user',
                    $user->id,
                    null,
                    ['login_at' => now()->toIso8601String()],
                    $request->ip()
                );
            }

            // Fetch fine-grained permissions from shared Redis cache
            $permissions = [];
            if ($userId) {
                $permissions = \Illuminate\Support\Facades\Cache::get("user_permissions:{$userId}", []);
            }

            // Assign permissions to user object dynamically so it can be used throughout the app
            $user->permissions = $permissions;

            // Dynamically register gates for this request based on fetched permissions
            if (is_array($permissions)) {
                foreach ($permissions as $permission) {
                    \Illuminate\Support\Facades\Gate::define($permission, function ($u) use ($permission) {
                        $userPermissions = $u->permissions ?? [];
                        return in_array($permission, $userPermissions);
                    });
                }
            }

            // Grant management permissions only to Accounting department users.
            $defaultPermissions = [
                'serms.reimbursements.manage',
                'serms.cash_advances.manage',
                'serms.liquidations.manage',
            ];
            foreach ($defaultPermissions as $permission) {
                if (!\Illuminate\Support\Facades\Gate::has($permission)) {
                    \Illuminate\Support\Facades\Gate::define($permission, function ($u) {
                        return method_exists($u, 'hasAdminPrivileges')
                            ? $u->hasAdminPrivileges()
                            : strtolower(trim((string) ($u->department ?? ''))) === 'accounting';
                    });
                }
            }

            // Set the authenticated user for the current request without starting a session
            Auth::setUser($user);

            // Associate user profile with current request so $request->user() works
            $request->setUserResolver(function () use ($user) {
                return $user;
            });

            return $next($request);

        } catch (\Firebase\JWT\ExpiredException $e) {
            return response()->json(['message' => 'Unauthorized. Token has expired.'], 401);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Offline JWT verification failed: ' . $e->getMessage());
            return response()->json(['message' => 'Unauthorized. Invalid token.'], 401);
        }
    }
}
