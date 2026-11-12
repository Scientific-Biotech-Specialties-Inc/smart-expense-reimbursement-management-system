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

            $fullName = trim(($decoded->first_name ?? '') . ' ' . ($decoded->last_name ?? ''));
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
                        'name' => $fullName,
                        'role' => $sermsRole,
                        'department' => $department,
                    ]);
                } else {
                    $user = User::create([
                        'auth_id' => $userId,
                        'email' => $email,
                        'name' => $fullName,
                        'role' => $sermsRole,
                        'department' => $department,
                    ]);
                }
            } else {
                // Update user details if they changed
                $user->update([
                    'email' => $email,
                    'name' => $fullName,
                    'role' => $sermsRole,
                    'department' => $department,
                ]);
            }

            // Fetch fine-grained permissions from shared Redis cache
            $permissions = [];
            if ($userId) {
                $permissions = \Illuminate\Support\Facades\Cache::get("user_permissions:{$userId}", []);
            }

            // Assign permissions to user object dynamically so it can be used throughout the app
            $user->setAttribute('permissions', $permissions);
            $user->setAttribute('is_admin', $user->hasAdminPrivileges());

            // Dynamically register gates for this request based on fetched permissions
            if (is_array($permissions)) {
                foreach ($permissions as $permission) {
                    \Illuminate\Support\Facades\Gate::define($permission, function ($u) use ($permission) {
                        $userPermissions = $u->getAttribute('permissions') ?? [];
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
