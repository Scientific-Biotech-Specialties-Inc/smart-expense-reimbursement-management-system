<?php

namespace App\Modules\Penalties\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Penalties\Services\PenaltyStrikeService;
use App\Modules\Users\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class PenaltyController extends Controller
{
    public function __construct(
        private readonly PenaltyStrikeService $strikeService
    ) {}

    private function authorizeAdmin(User $user): ?JsonResponse
    {
        if (!$user->hasAdminPrivileges()) {
            return response()->json([
                'message' => 'Forbidden. Administrator privileges required.',
            ], 403);
        }

        return null;
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->strikeService->getEmployeeSummary($request->user()),
        ]);
    }

    public function submitAppeal(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'explanation' => 'required|string|min:10|max:2000',
            'letter_file' => 'required|file|mimes:pdf,jpg,jpeg,png|max:2048',
        ]);

        try {
            $appeal = $this->strikeService->submitAppeal(
                $request->user(),
                $validated['explanation'],
                $request->file('letter_file')
            );

            return response()->json([
                'message' => 'Appeal submitted successfully.',
                'data' => $appeal,
            ], 201);
        } catch (ConflictHttpException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }
    }

    public function adminOverview(Request $request): JsonResponse
    {
        if ($forbidden = $this->authorizeAdmin($request->user())) {
            return $forbidden;
        }

        $standing = (string) $request->query('standing', 'all');
        $search = $request->query('search');

        return response()->json([
            'data' => $this->strikeService->getAdminOverview($search, $standing),
        ]);
    }

    public function adminStrikes(Request $request): JsonResponse
    {
        if ($forbidden = $this->authorizeAdmin($request->user())) {
            return $forbidden;
        }

        $strikes = $this->strikeService->getAdminStrikes(
            $request->query('status'),
            $request->query('module'),
            $request->query('search')
        );

        return response()->json([
            'data' => $strikes,
        ]);
    }

    public function reviewAppeal(Request $request, int $id): JsonResponse
    {
        if ($forbidden = $this->authorizeAdmin($request->user())) {
            return $forbidden;
        }

        $validated = $request->validate([
            'decision' => 'required|in:approve,reject',
            'comment' => 'nullable|string|max:2000',
        ]);

        try {
            $appeal = $this->strikeService->reviewAppeal(
                $request->user(),
                $id,
                $validated['decision'],
                $validated['comment'] ?? null
            );

            return response()->json([
                'message' => $validated['decision'] === 'approve'
                    ? 'Appeal approved and active strikes reset to 0/3.'
                    : 'Appeal rejected.',
                'data' => $appeal,
            ]);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        } catch (ConflictHttpException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }
    }

    public function issueManualStrike(Request $request): JsonResponse
    {
        if ($forbidden = $this->authorizeAdmin($request->user())) {
            return $forbidden;
        }

        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
            'source_module' => 'required|in:cash_advance,liquidation,reimbursement',
            'source_id' => 'required|integer|min:1',
            'reason' => 'required|string|min:5|max:1000',
        ]);

        try {
            $strike = $this->strikeService->issueManualStrike(
                $request->user(),
                (int) $validated['user_id'],
                $validated['source_module'],
                (int) $validated['source_id'],
                $validated['reason']
            );

            return response()->json([
                'message' => 'Compliance strike issued successfully.',
                'data' => $strike,
            ], 201);
        } catch (ConflictHttpException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }
    }

    public function waiveStrike(Request $request, int $id): JsonResponse
    {
        if ($forbidden = $this->authorizeAdmin($request->user())) {
            return $forbidden;
        }

        $validated = $request->validate([
            'reason' => 'required|string|min:3|max:1000',
        ]);

        try {
            $strike = $this->strikeService->waiveStrike(
                $request->user(),
                $id,
                $validated['reason']
            );

            return response()->json([
                'message' => 'Strike waived successfully.',
                'data' => $strike,
            ]);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        } catch (ConflictHttpException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }
    }

    public function resetUserStrikes(Request $request, int $userId): JsonResponse
    {
        if ($forbidden = $this->authorizeAdmin($request->user())) {
            return $forbidden;
        }

        $validated = $request->validate([
            'reason' => 'required|string|min:3|max:1000',
        ]);

        try {
            $result = $this->strikeService->resetUserStrikes(
                $request->user(),
                $userId,
                $validated['reason']
            );

            return response()->json([
                'message' => 'Employee active strikes reset to 0/3.',
                'data' => $result,
            ]);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        } catch (ConflictHttpException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }
    }

    public function userRecords(Request $request, int $userId): JsonResponse
    {
        if ($forbidden = $this->authorizeAdmin($request->user())) {
            return $forbidden;
        }

        return response()->json([
            'data' => $this->strikeService->getUserRecordsForPicker($userId),
        ]);
    }
}
