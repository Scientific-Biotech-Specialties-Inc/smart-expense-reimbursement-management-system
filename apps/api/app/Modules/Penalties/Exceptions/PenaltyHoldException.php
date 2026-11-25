<?php

namespace App\Modules\Penalties\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class PenaltyHoldException extends RuntimeException
{
    public function __construct(
        string $message = 'Your account is on a penalty hold due to 3 active compliance strikes. Please submit a Compliance Appeal Letter to lift the hold.',
        public readonly int $activeStrikesCount = 3,
    ) {
        parent::__construct($message, 403);
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => 'PENALTY_HOLD_ACTIVE',
            'active_strikes_count' => $this->activeStrikesCount,
        ], 403);
    }
}
