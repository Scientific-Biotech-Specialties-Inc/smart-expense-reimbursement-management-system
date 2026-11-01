<?php

namespace App\Modules\Liquidations\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Ai\Contracts\AsyncOcrEngineInterface;
use App\Modules\Ai\Services\MockOcrService;
use App\Modules\Shared\Services\PasswordVerificationService;
use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Reimbursements\Jobs\DispatchReceiptToAiService;
use App\Modules\Shared\Traits\ValidatesReceiptDuplicates;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Carbon\Carbon;

class LiquidationController extends Controller
{
    use ValidatesReceiptDuplicates;

    /**
     * CashAdvance relations needed for Unified Roadmap when accessed via liquidation
     */
    private const CASH_ADVANCE_ROADMAP_WITH = [
        'requester',
        'approvalActions.approver',
        'statusHistory.changedBy',
        'statusHistory.user',
        'disbursement.disbursedBy',
        'penalties',
        'liquidations',
        'document',
    ];

    private function enrichCashAdvanceForRoadmap(?CashAdvance $advance): ?CashAdvance
    {
        if (!$advance) {
            return null;
        }
        // Ensure penalties_total - use withSum if available else collection sum
        if ($advance->relationLoaded('penalties')) {
            $penaltiesTotal = $advance->penalties->sum(fn ($p) => (float) ($p->penalty_amount ?? 0));
            $advance->setAttribute('penalties_total', (float) $penaltiesTotal);
            $advance->setAttribute('penalties_sum', (float) $penaltiesTotal);
        } elseif (!isset($advance->penalties_total)) {
            $advance->setAttribute('penalties_total', (float) \App\Modules\Liquidations\Models\PenaltyRecord::where('cash_advance_id', $advance->id)->sum('penalty_amount'));
            $advance->setAttribute('penalties_sum', (float) $advance->penalties_total);
        }

        // days_overdue
        $due = $advance->expected_liquidation_date;
        $daysOverdue = 0;
        if ($due) {
            $today = Carbon::now()->startOfDay();
            $dueDate = Carbon::parse($due)->startOfDay();
            $isTerminal = in_array($advance->status, ['liquidated', 'settled', 'rejected']);
            $isAuditing = in_array($advance->status, ['pending', 'under-review', 'approved']);
            if ($today->gt($dueDate) && !$isTerminal && !$isAuditing) {
                $daysOverdue = $today->diffInDays($dueDate);
            } elseif ($advance->relationLoaded('penalties') && $advance->penalties->isNotEmpty()) {
                $maxDays = $advance->penalties->max('days_overdue');
                if ($maxDays) {
                    $daysOverdue = max($daysOverdue, (int) $maxDays);
                }
            }
        } elseif ($advance->relationLoaded('penalties') && $advance->penalties->isNotEmpty()) {
            $daysOverdue = (int) ($advance->penalties->max('days_overdue') ?? $advance->penalties->count());
        }
        $advance->setAttribute('days_overdue', (int) $daysOverdue);

        // linked_liquidation aliases
        if ($advance->relationLoaded('liquidations')) {
            $latest = $advance->liquidations->sortByDesc('created_at')->sortByDesc('id')->first();
            $advance->setAttribute('linked_liquidation', $latest);
            $advance->setAttribute('latest_liquidation', $latest);
            $advance->setAttribute('liquidation', $latest);
        }

        // status_history normalized for roadmap
        if ($advance->relationLoaded('statusHistory')) {
            $history = $advance->statusHistory->sortBy('changed_at')->sortBy('id')->map(function ($h) {
                $actor = $h->relationLoaded('changedBy') && $h->changedBy ? $h->changedBy : ($h->relationLoaded('user') ? $h->user : null);
                return [
                    'id' => $h->id,
                    'cash_advance_id' => $h->cash_advance_id,
                    'from_status' => $h->from_status,
                    'to_status' => $h->to_status,
                    'status' => $h->to_status,
                    'changed_by' => $actor ? ['id' => $actor->id, 'name' => $actor->name, 'email' => $actor->email] : null,
                    'changed_by_id' => $h->changed_by,
                    'actor' => $actor?->name,
                    'user' => $actor ? ['id' => $actor->id, 'name' => $actor->name, 'email' => $actor->email] : null,
                    'changed_at' => $h->changed_at ?? $h->created_at,
                    'created_at' => $h->created_at,
                ];
            })->values();
            $advance->setAttribute('status_history', $history);
        }

        // Ensure outstanding_balance / expected_liquidation_date present
        $advance->setAttribute('balance', $advance->outstanding_balance !== null ? (float) $advance->outstanding_balance : (float) ($advance->amount ?? 0));
        $advance->setAttribute('outstanding_balance', $advance->outstanding_balance);
        $advance->setAttribute('expected_liquidation_date', $advance->expected_liquidation_date);

        return $advance;
    }

    private function hydrateLiquidation(Liquidation $liq): Liquidation
    {
        // Hydrate receipts
        $receiptIds = $liq->reimbursement_ids ?? [];
        if (is_array($receiptIds) && !empty($receiptIds)) {
            $liq->setAttribute('receipts', Receipt::whereIn('id', $receiptIds)->with('items')->get());
        } else {
            $liq->setAttribute('receipts', collect());
        }

        // Enrich nested cashAdvance for Unified Roadmap (no extra fetch)
        if ($liq->relationLoaded('cashAdvance') && $liq->cashAdvance) {
            $this->enrichCashAdvanceForRoadmap($liq->cashAdvance);
            // Also compute overpayment / aging on liquidation itself for frontend convenience
            $ca = $liq->cashAdvance;
            $overpayment = 0;
            $expense = (float) ($liq->total_expense_amount ?? 0);
            $snapshot = (float) ($liq->outstanding_balance ?? $ca->outstanding_balance ?? $ca->amount ?? 0);
            if ($expense > $snapshot) {
                $overpayment = $expense - $snapshot;
            }
            $liq->setAttribute('overpayment_amount', (float) $overpayment);
            $liq->setAttribute('overpaymentAmount', (float) $overpayment);
            $liq->setAttribute('penalties_total', (float) ($ca->penalties_total ?? 0));
            $liq->setAttribute('days_overdue', (int) ($ca->days_overdue ?? 0));
            // Ensure liquidation calc variance fields present
            $liq->setAttribute('variance', $snapshot - $expense);
        }

        $canManage = request()?->user()?->can('serms.liquidations.manage') ?? false;
        AuditLogService::enrichLiquidation($liq, $canManage);

        return $liq;
    }

    /**
     * List all liquidations.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        $with = array_merge(['user', 'cashAdvance'], array_map(fn($r) => "cashAdvance.$r", self::CASH_ADVANCE_ROADMAP_WITH));

        if (!$request->user()->can('serms.liquidations.manage')) {
            $liquidations = Liquidation::where('user_id', $user->id)
                ->with($with)
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->get();
        } else {
            $liquidations = Liquidation::with($with)
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->get();
        }

        foreach ($liquidations as $liq) {
            $this->hydrateLiquidation($liq);
        }

        return response()->json($liquidations);
    }

    /**
     * Scan receipt image(s) and dispatch to the real async OCR pipeline.
     *
     * Mirrors Reimbursements\ReceiptService::storeReceipt — stores files on
     * Supabase, creates a Receipt in `processing` state, and dispatches
     * DispatchReceiptToAiService via AsyncOcrEngineInterface. The AI service
     * downloads from Supabase and POSTs results back to the OCR callback
     * endpoint (reimbursement or liquidation), where OcrCallbackService applies
     * vendor_name / total_amount / tin etc.
     */
    public function scan(Request $request)
    {
        $request->validate([
            'files' => 'required|array|min:1',
            'files.*' => 'required|file|mimes:jpeg,png,pdf|max:2048',
        ]);

        $files = $request->file('files');

        $filePaths = [];
        $fileHashes = [];
        $fileTypes = [];
        $fileSizes = [];

        foreach ($files as $file) {
            $fileType = $file->extension();
            if ($fileType === 'jpg') {
                $fileType = 'jpeg';
            }

            // Store on Supabase (same disk as reimbursements)
            try {
                $path = $file->store('receipts', 'supabase');
            } catch (\Throwable $e) {
                Log::error('LiquidationController@scan: Supabase store failed', [
                    'file' => $file->getClientOriginalName(),
                    'error' => $e->getMessage(),
                ]);
                throw $e;
            }
            $filePaths[] = $path;
            $fileHashes[] = hash_file('sha256', $file->getRealPath());
            $fileTypes[] = $fileType;
            $fileSizes[] = $file->getSize();
        }

        // Duplicate guard — same as ReceiptService::storeReceipt
        try {
            $this->validateDuplicateReceipt($fileHashes);
        } catch (ValidationException $e) {
            // Best-effort cleanup of just-uploaded objects so duplicates don't orphan files
            foreach ($filePaths as $path) {
                try {
                    Storage::disk('supabase')->delete($path);
                } catch (\Throwable $ignored) {
                    Log::warning('LiquidationController@scan: failed to cleanup duplicate upload', ['path' => $path]);
                }
            }
            throw $e;
        }

        $isMock = MockOcrService::isMockRequest();
        $mock = $isMock ? MockOcrService::generate($files[0]?->getClientOriginalName() ?? 'receipt.jpg') : [];

        try {
            $receipt = Receipt::create([
                'uploaded_by' => $request->user()->id,
                'file_path' => $filePaths,
                'file_hash' => $fileHashes,
                'file_type' => $fileTypes,
                'file_size_bytes' => $fileSizes,
                'vendor_name' => $mock['vendor_name'] ?? null,
                'transaction_date' => $mock['transaction_date'] ?? null,
                'total_amount' => $mock['total_amount'] ?? null,
                'vat_amount' => $mock['vat_amount'] ?? null,
                'tin' => $mock['tin'] ?? null,
                'invoice_number' => $mock['invoice_number'] ?? null,
                'vat_classification' => $mock['vat_classification'] ?? ($isMock ? 'vat' : null),
                'currency' => $mock['currency'] ?? ($isMock ? 'PHP' : null),
                'location' => $mock['location'] ?? null,
                'ocr_confidence_score' => $mock['ocr_confidence_score'] ?? null,
                'ocr_flagged' => false,
                'is_draft' => true,
                'status' => $isMock ? 'processed' : 'processing',
            ]);
            if ($isMock && !empty($mock['items'])) {
                $receipt->items()->createMany($mock['items']);
            }
        } catch (\Throwable $e) {
            Log::error('LiquidationController@scan: failed to create receipt row', [
                'error' => $e->getMessage(),
            ]);
            // Cleanup storage on DB failure
            foreach ($filePaths as $path) {
                try { Storage::disk('supabase')->delete($path); } catch (\Throwable $ignored) {}
            }
            throw $e;
        }

        // Dispatch async OCR (sync connection runs inline if no worker, matching ReceiptService)
        // Mock mode skips the pipeline entirely — receipt is already processed.
        $connection = config('services.ai_service.ocr_queue_connection', 'sync');
        if (!$isMock) {
        try {
            $job = (new DispatchReceiptToAiService($receipt))->onConnection($connection);
            Bus::dispatch($job);
        } catch (\Throwable $e) {
            Log::error('LiquidationController@scan: failed to dispatch OCR job', [
                'receipt_id' => $receipt->id,
                'connection' => $connection,
                'error' => $e->getMessage(),
            ]);

            // Leave receipt in a clear `failed` state so the UI can offer Retry
            try {
                $receipt->update([
                    'status' => 'failed',
                    'ocr_flagged' => true,
                    'rejection_code' => 'ocr_failed',
                    'rejection_reason' => 'OCR could not be started. Please retry OCR.',
                ]);
            } catch (\Throwable $ignored) {}

            // Don't swallow — let caller see the failure via the row's failed status
            // but still return 201 so the frontend can poll/retry.
        }
        }

        // Audit log — every DB mutation requires it
        try {
            AuditLogService::log(
                actorId: $request->user()->id,
                actorRole: $request->user()->role,
                actionType: 'RECEIPT_CREATED',
                entityType: 'receipt',
                entityId: $receipt->id,
                beforeState: null,
                afterState: $receipt->fresh()->load('items')->toArray(),
                ipAddress: $request->ip()
            );
        } catch (\Throwable $e) {
            Log::warning('LiquidationController@scan: audit log failed', ['receipt_id' => $receipt->id, 'error' => $e->getMessage()]);
        }

        $fresh = $receipt->fresh()->load('items');

        return response()->json([
            'message' => $isMock ? 'Receipt uploaded with mock OCR data.' : 'Receipt uploaded for OCR processing.',
            'data' => [
                'id' => $fresh->id,
                'status' => $fresh->status,
                'vendor_name' => $fresh->vendor_name,
                'transaction_date' => $fresh->transaction_date ? $fresh->transaction_date->format('Y-m-d') : null,
                'total_amount' => $fresh->total_amount,
                'vat_amount' => $fresh->vat_amount,
                'tin' => $fresh->tin,
                'invoice_number' => $fresh->invoice_number,
                'location' => $fresh->location,
                'currency' => $fresh->currency,
                'vat_classification' => $fresh->vat_classification,
                'items' => $fresh->items->map(fn ($item) => [
                    'name' => $item->name,
                    'quantity' => $item->qty,
                    'qty' => $item->qty,
                    'price' => $item->price,
                ])->values()->all(),
                'ocr_confidence_score' => $fresh->ocr_confidence_score,
                'ocr_flagged' => (bool) $fresh->ocr_flagged,
                'rejection_code' => $fresh->rejection_code,
                'rejection_reason' => $fresh->rejection_reason,
                'file_path' => $filePaths,
                'file_hash' => $fileHashes,
                'file_type' => $fileTypes,
                'file_size_bytes' => $fileSizes,
            ],
        ], 201);
    }

    /**
     * Polling endpoint for a single liquidation receipt.
     * Mirrors ReceiptController@show but scoped to liquidations.
     */
    public function showReceipt(Request $request, $id)
    {
        $receipt = Receipt::with(['category', 'items', 'uploader'])->findOrFail($id);

        $canManage = $request->user()->can('serms.reimbursements.manage')
            || $request->user()->can('serms.liquidations.manage');

        if (!$canManage && (int) $receipt->uploaded_by !== (int) $request->user()->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json(['data' => $receipt]);
    }

    /**
     * Retry OCR for a liquidation receipt.
     */
    public function retryOcr(Request $request, $id)
    {
        $receipt = Receipt::findOrFail($id);

        $canManage = $request->user()->can('serms.liquidations.manage')
            || $request->user()->can('serms.reimbursements.manage');

        if ((int) $receipt->uploaded_by !== (int) $request->user()->id && !$canManage) {
            return response()->json(['message' => 'Forbidden. You can only retry your own receipts.'], 403);
        }

        $beforeState = $receipt->toArray();

        $receipt->update([
            'status' => 'processing',
            'ocr_flagged' => false,
            'rejection_code' => null,
            'rejection_reason' => null,
        ]);

        try {
            DispatchReceiptToAiService::dispatch($receipt);
        } catch (\Throwable $e) {
            Log::error('LiquidationController@retryOcr: dispatch failed', ['receipt_id' => $receipt->id, 'error' => $e->getMessage()]);
            $receipt->update([
                'status' => 'failed',
                'ocr_flagged' => true,
                'rejection_code' => 'ocr_failed',
                'rejection_reason' => 'OCR retry could not be started. Please try again.',
            ]);
            return response()->json(['message' => 'OCR retry failed.', 'data' => $receipt->fresh()], 500);
        }

        AuditLogService::log(
            actorId: $request->user()->id,
            actorRole: $request->user()->role,
            actionType: 'RECEIPT_OCR_RETRY',
            entityType: 'receipt',
            entityId: $receipt->id,
            beforeState: $beforeState,
            afterState: $receipt->fresh()->toArray(),
            ipAddress: $request->ip()
        );

        return response()->json([
            'message' => 'OCR reprocessing started.',
            'data' => $receipt->fresh()->load(['category', 'items', 'uploader']),
        ]);
    }

    /**
     * Submit a cash advance liquidation.
     */
    public function store(Request $request)
    {
        $user = $request->user();

        return DB::transaction(function () use ($user, $request) {
            $validated = $request->validate([
                'cash_advance_id' => 'required|exists:cash_advances,id',
                'receipts' => 'required', // JSON string for multipart or array for json request
                'report_attachment' => 'nullable|file|mimes:jpeg,png,pdf,doc,docx|max:5120',
                'total_expense_amount' => 'required|numeric|min:0.00',
                'shortfall_explanation' => 'nullable|string',
            ]);

            // Decode receipts JSON string if it is not already an array
            $receiptsData = is_string($validated['receipts'])
                ? json_decode($validated['receipts'], true)
                : $validated['receipts'];

            if (!is_array($receiptsData)) {
                return response()->json(['message' => 'Invalid receipts data format.'], 422);
            }

            $advance = CashAdvance::findOrFail($validated['cash_advance_id']);

            if ($advance->user_id !== $user->id) {
                return response()->json(['message' => 'Forbidden. You do not own this cash advance.'], 403);
            }

            // Defense-in-depth: liquidation requires Phase 2 (acknowledged/signed).
            // Disbursed-but-not-acknowledged advances are Phase 1 preview-only.
            if ($advance->acknowledged_at === null) {
                return response()->json(['message' => 'Conflict. Cash advance must be acknowledged before liquidation.'], 409);
            }

            if (!in_array($advance->status, ['signed', 'overdue', 'incomplete'])) {
                return response()->json(['message' => 'Conflict. Cash advance is not in a reconcilable state.'], 409);
            }

            // Update each receipt in database with user-edited fields
            $receiptIds = [];
            foreach ($receiptsData as $receiptData) {
                if (!isset($receiptData['id'])) continue;
                $receipt = Receipt::findOrFail($receiptData['id']);
                $receipt->update([
                    'vendor_name' => $receiptData['vendor_name'] ?? $receiptData['vendor'] ?? $receipt->vendor_name,
                    'transaction_date' => $receiptData['transaction_date'] ?? $receiptData['date'] ?? $receipt->transaction_date,
                    'total_amount' => $receiptData['total_amount'] ?? $receiptData['amount'] ?? $receipt->total_amount,
                    'vat_amount' => $receiptData['vat_amount'] ?? $receiptData['vat'] ?? $receiptData['tax'] ?? $receipt->vat_amount,
                    'tin' => $receiptData['tin'] ?? $receipt->tin,
                    'invoice_number' => $receiptData['invoice_number'] ?? $receiptData['invoiceNumber'] ?? $receipt->invoice_number,
                    'expense_category_id' => $receiptData['expense_category_id'] ?? $receiptData['categoryId'] ?? $receipt->expense_category_id ?? null,
                    'location' => $receiptData['location'] ?? $receipt->location ?? null,
                    'currency' => $receiptData['currency'] ?? $receipt->currency ?? 'PHP',
                    'vat_classification' => $receiptData['vat_classification'] ?? $receiptData['vatClassification'] ?? $receipt->vat_classification ?? 'vat',
                    'status' => 'pending', // Awaiting admin audit
                ]);

                if (isset($receiptData['items']) && is_array($receiptData['items'])) {
                    $receipt->items()->delete();
                    foreach ($receiptData['items'] as $item) {
                        if (!empty($item['name']) || isset($item['price'])) {
                            $receipt->items()->create([
                                'name' => $item['name'] ?? 'Item',
                                'qty' => $item['qty'] ?? 1,
                                'price' => $item['price'] ?? 0,
                            ]);
                        }
                    }
                }

                $receiptIds[] = $receipt->id;
            }

            // Snapshot the cash advance's current outstanding balance
            $currentOutstandingBalance = $advance->outstanding_balance ?? $advance->amount;

            // Calculate variance based on the current balance, not original amount
            $variance = $currentOutstandingBalance - $validated['total_expense_amount'];

            // Enforce: shortfalls require an explanation
            if ($variance > 0 && empty($validated['shortfall_explanation'])) {
                return response()->json([
                    'message' => 'Validation error.',
                    'errors' => [
                        'shortfall_explanation' => ['Shortfall explanation is required when total expense is less than the advanced amount.']
                    ]
                ], 422);
            }

            // Handle Report Attachment Upload
            $reportFilePath = null;
            if ($request->hasFile('report_attachment')) {
                $file = $request->file('report_attachment');
                $reportFilePath = $file->store('report_letters', 'supabase');
            }

            $liquidation = Liquidation::create([
                'cash_advance_id' => $advance->id,
                'user_id' => $user->id,
                'status' => 'pending',
                'reimbursement_ids' => $receiptIds,
                'total_expense_amount' => $validated['total_expense_amount'],
                'outstanding_balance' => $currentOutstandingBalance,
                'shortfall_explanation' => $validated['shortfall_explanation'] ?? null,
                'report_file_path' => $reportFilePath,
            ]);

            // Commit receipts to user's expense history
            if (!empty($receiptIds)) {
                Receipt::whereIn('id', $receiptIds)->update(['is_draft' => false]);
            }

            // Change advance status to under-review while admin audits
            $advance->update(['status' => 'under-review']);

            // Create status history log for cash advance
            \App\Modules\CashAdvances\Models\CashAdvanceStatusHistory::create([
                'cash_advance_id' => $advance->id,
                'from_status' => $advance->status,
                'to_status' => 'under-review',
                'changed_by' => $user->id,
            ]);

            // Audit Log
            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role,
                actionType: 'LIQUIDATION_SUBMITTED',
                entityType: 'liquidation',
                entityId: $liquidation->id,
                beforeState: null,
                afterState: $liquidation->toArray(),
                ipAddress: $request->ip()
            );

            NotificationService::notifyUser(
                userId: $user->id,
                type: 'liquidation_submitted',
                module: 'Liquidation',
                title: 'Liquidation Submitted',
                message: "Your liquidation of " . NotificationService::formatPeso($liquidation->total_expense_amount) . " for Cash Advance #{$advance->id} was submitted.",
                recordLink: "/liquidations?view={$liquidation->id}",
                recordType: 'liquidation',
                recordId: $liquidation->id
            );

            NotificationService::notifyAdmins(
                type: 'admin_liquidation_submitted',
                module: 'Liquidation',
                title: 'New Liquidation Settlement',
                message: "{$user->name} submitted a liquidation of " . NotificationService::formatPeso($liquidation->total_expense_amount) . " for Cash Advance #{$advance->id}.",
                recordLink: "/liquidations?view={$liquidation->id}",
                recordType: 'liquidation',
                recordId: $liquidation->id,
                excludeUserId: $user->id
            );

            if (!empty($liquidation->shortfall_explanation)) {
                NotificationService::notifyAdmins(
                    type: 'admin_employee_note_added',
                    module: 'Liquidation',
                    title: 'Employee Note on Liquidation',
                    message: "{$user->name} added a note on Liquidation #{$liquidation->id}: \"{$liquidation->shortfall_explanation}\"",
                    recordLink: "/liquidations?view={$liquidation->id}",
                    recordType: 'liquidation',
                    recordId: $liquidation->id,
                    excludeUserId: $user->id
                );
            }

            return response()->json([
                'message' => 'Liquidation settlement submitted for audit successfully.',
                'data' => $liquidation,
            ], 210);
        });
    }

    /**
     * Show detailed liquidation details.
     */
    public function show(Request $request, $id)
    {
        $user = $request->user();
        $with = array_merge(['user', 'cashAdvance'], array_map(fn($r) => "cashAdvance.$r", self::CASH_ADVANCE_ROADMAP_WITH));
        $liquidation = Liquidation::with($with)->findOrFail($id);

        if (!$request->user()->can('serms.liquidations.manage') && $liquidation->user_id !== $user->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $this->hydrateLiquidation($liquidation);

        return response()->json($liquidation);
    }

    /**
     * Audit and close a liquidation settlement.
     */
    public function audit(Request $request, $id)
    {
        $user = $request->user();

        if (!$request->user()->can('serms.liquidations.manage')) {
            return response()->json(['message' => 'Unauthorized. Only admins can audit liquidations.'], 403);
        }

        $validated = $request->validate([
            'status' => 'required|in:approved,revise,rejected',
            'password' => 'required|string',
            'admin_note' => 'nullable|string|min:10|required_if:status,revise|required_if:status,rejected',
        ]);

        return DB::transaction(function () use ($user, $id, $validated, $request) {
            // Verify password against external auth service
            if (!PasswordVerificationService::verify($request, $validated['password'])) {
                throw ValidationException::withMessages([
                    'password' => ['Invalid password. Please try again.']
                ]);
            }

            $liquidation = Liquidation::where('id', $id)->lockForUpdate()->firstOrFail();
            $advance = CashAdvance::where('id', $liquidation->cash_advance_id)->lockForUpdate()->firstOrFail();
            $receiptIds = is_array($liquidation->reimbursement_ids) ? $liquidation->reimbursement_ids : [];

            // Self-approval/self-rejection check
            if ($liquidation->user_id === $user->id) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Conflict. Self-audit is prohibited.');
            }

            $beforeState = $liquidation->toArray();

            if ($validated['status'] === 'approved') {
                $currentBalance  = (float) ($advance->outstanding_balance ?? $advance->amount);
                $approvedExpense = (float) $liquidation->total_expense_amount;
                $newBalance      = max($currentBalance - $approvedExpense, 0);
                
                $variance = (float) $liquidation->outstanding_balance - $approvedExpense;
                $newAdvanceStatus = ($variance > 0) ? 'incomplete' : 'liquidated';

                $liquidation->update([
                    'status'              => 'liquidated',
                    'admin_note'          => $validated['admin_note'] ?? null,
                    'outstanding_balance' => $newBalance,
                ]);

                if (!empty($receiptIds)) {
                    Receipt::whereIn('id', $receiptIds)->update([
                        'status' => 'approved',
                        'admin_notes' => $validated['admin_note'] ?? null,
                    ]);
                }

                $advance->update([
                    'status'              => $newAdvanceStatus,
                    'outstanding_balance' => $newBalance,
                ]);

                $actionType = 'LIQUIDATION_APPROVED';
            } else {
                // 3-strike workflow (2 revises + 1 terminal = 3 total): both 'revise' and 'rejected' increment revision_count
                // Admin's choice maps to 'revise' until threshold exceeded, then auto 'rejected' (terminal)
                // 2 revises allowed (<=2 revise, >=3 rejected) — 1st/2nd = revise, 3rd = terminal rejected, 3 total
                $currentCount = (int) ($liquidation->revision_count ?? 0);
                $newCount = $currentCount + 1;
                $requestedStatus = $validated['status']; // 'revise' or 'rejected'
                $finalStatus = $newCount <= 2 ? 'revise' : 'rejected';
                $isTerminal = $finalStatus === 'rejected';

                $liquidation->update([
                    'status'         => $finalStatus,
                    'revision_count' => $newCount,
                    'admin_note'     => $validated['admin_note'],
                ]);

                if (!empty($receiptIds)) {
                    Receipt::whereIn('id', $receiptIds)->update([
                        'status' => $finalStatus,
                        'admin_notes' => $validated['admin_note'],
                    ]);
                }

                // Balance unchanged on revise/rejection — no payment was accepted.
                // The cash advance returns to incomplete state.
                $advance->update(['status' => 'incomplete']);

                $actionType = $isTerminal ? 'LIQUIDATION_REJECTED' : 'LIQUIDATION_REVISED';
            }

            // Record status history for cash advance
            \App\Modules\CashAdvances\Models\CashAdvanceStatusHistory::create([
                'cash_advance_id' => $advance->id,
                'from_status' => 'under-review',
                'to_status' => $advance->status,
                'changed_by' => $user->id,
            ]);

            // Audit Log
            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role,
                actionType: $actionType,
                entityType: 'liquidation',
                entityId: $liquidation->id,
                beforeState: $beforeState,
                afterState: $liquidation->fresh()->toArray(),
                ipAddress: $request->ip()
            );

            $formattedAmount = NotificationService::formatPeso($liquidation->total_expense_amount);
            $noteText = !empty($validated['admin_note']) ? " Admin note: \"{$validated['admin_note']}\"" : '';
            if ($actionType === 'LIQUIDATION_APPROVED') {
                NotificationService::notifyUser(
                    userId: $liquidation->user_id,
                    type: 'liquidation_settled',
                    module: 'Liquidation',
                    title: 'Liquidation Settled',
                    message: "Your liquidation of {$formattedAmount} for Cash Advance #{$advance->id} was approved and settled.{$noteText}",
                    recordLink: "/liquidations?view={$liquidation->id}",
                    recordType: 'liquidation',
                    recordId: $liquidation->id
                );
            } else {
                $statusType = $isTerminal ? 'liquidation_rejected' : 'liquidation_revised';
                $statusTitle = $isTerminal ? 'Liquidation Rejected' : 'Liquidation Needs Revision';
                $statusVerb = $isTerminal ? 'rejected' : 'returned for revision';
                NotificationService::notifyUser(
                    userId: $liquidation->user_id,
                    type: $statusType,
                    module: 'Liquidation',
                    title: $statusTitle,
                    message: "Your liquidation of {$formattedAmount} for Cash Advance #{$advance->id} was {$statusVerb}.{$noteText}",
                    recordLink: "/liquidations?view={$liquidation->id}",
                    recordType: 'liquidation',
                    recordId: $liquidation->id
                );
            }

            return response()->json([
                'message' => 'Liquidation settlement audit complete.',
                'data' => $liquidation,
            ]);
        });
    }

    /**
     * Update a pending liquidation settlement (employee self-edit).
     */
    public function update(Request $request, $id)
    {
        $user = $request->user();
        $liquidation = Liquidation::findOrFail($id);

        if ($liquidation->user_id !== $user->id) {
            return response()->json(['message' => 'Forbidden. You do not own this liquidation.'], 403);
        }

        if ($liquidation->status === 'rejected') {
            return response()->json(['message' => 'Rejected liquidations (exceeded revision limit) cannot be edited.'], 409);
        }

        if (!in_array($liquidation->status, ['pending', 'revise'])) {
            return response()->json(['message' => 'Only pending or revise liquidations can be edited.'], 409);
        }

        $validated = $request->validate([
            'receipts' => 'sometimes',
            'report_attachment' => 'nullable|file|mimes:jpeg,png,pdf,doc,docx|max:5120',
            'total_expense_amount' => 'sometimes|numeric|min:0.00',
            'shortfall_explanation' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($user, $liquidation, $validated, $request) {
            $wasRevise = $liquidation->status === 'revise';
            $beforeState = $liquidation->toArray();

            // Handle receipts update
            if (isset($validated['receipts'])) {
                $receiptsData = is_string($validated['receipts'])
                    ? json_decode($validated['receipts'], true)
                    : $validated['receipts'];

                if (is_array($receiptsData)) {
                    $receiptIds = [];
                    foreach ($receiptsData as $receiptData) {
                        if (!isset($receiptData['id'])) continue;
                        $receipt = Receipt::findOrFail($receiptData['id']);
                        $receipt->update([
                            'vendor_name' => $receiptData['vendor_name'] ?? $receiptData['vendor'] ?? $receipt->vendor_name,
                            'transaction_date' => $receiptData['transaction_date'] ?? $receiptData['date'] ?? $receipt->transaction_date,
                            'total_amount' => $receiptData['total_amount'] ?? $receiptData['amount'] ?? $receipt->total_amount,
                            'vat_amount' => $receiptData['vat_amount'] ?? $receiptData['vat'] ?? $receiptData['tax'] ?? $receipt->vat_amount,
                            'tin' => $receiptData['tin'] ?? $receipt->tin,
                            'invoice_number' => $receiptData['invoice_number'] ?? $receiptData['invoiceNumber'] ?? $receipt->invoice_number,
                            'expense_category_id' => $receiptData['expense_category_id'] ?? $receiptData['categoryId'] ?? $receipt->expense_category_id ?? null,
                            'location' => $receiptData['location'] ?? $receipt->location ?? null,
                            'currency' => $receiptData['currency'] ?? $receipt->currency ?? 'PHP',
                            'vat_classification' => $receiptData['vat_classification'] ?? $receiptData['vatClassification'] ?? $receipt->vat_classification ?? 'vat',
                            'status' => 'pending',
                        ]);

                        if (isset($receiptData['items']) && is_array($receiptData['items'])) {
                            $receipt->items()->delete();
                            foreach ($receiptData['items'] as $item) {
                                if (!empty($item['name']) || isset($item['price'])) {
                                    $receipt->items()->create([
                                        'name' => $item['name'] ?? 'Item',
                                        'qty' => $item['qty'] ?? 1,
                                        'price' => $item['price'] ?? 0,
                                    ]);
                                }
                            }
                        }

                        $receiptIds[] = $receipt->id;
                    }
                    $liquidation->reimbursement_ids = $receiptIds;
                }
            }

            // Handle report attachment
            if ($request->hasFile('report_attachment')) {
                if ($liquidation->report_file_path) {
                    Storage::disk('supabase')->delete($liquidation->report_file_path);
                }
                $liquidation->report_file_path = $request->file('report_attachment')->store('report_letters', 'supabase');
            }

            if (isset($validated['total_expense_amount'])) {
                $liquidation->total_expense_amount = $validated['total_expense_amount'];
            }

            if (array_key_exists('shortfall_explanation', $validated)) {
                $liquidation->shortfall_explanation = $validated['shortfall_explanation'];
            }

            // Reset revise → pending on re-submission (rejected terminal stays rejected)
            if ($liquidation->status === 'revise') {
                $liquidation->status = 'pending';
            }

            $liquidation->save();

            $actionType = $wasRevise ? 'LIQUIDATION_RESUBMITTED' : 'LIQUIDATION_UPDATED';
            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role ?? 'employee',
                actionType: $actionType,
                entityType: 'liquidation',
                entityId: $liquidation->id,
                beforeState: $beforeState,
                afterState: $liquidation->fresh()->toArray(),
                ipAddress: $request->ip()
            );

            NotificationService::notifyAdmins(
                type: 'admin_liquidation_resubmitted',
                module: 'Liquidation',
                title: 'Liquidation Resubmitted',
                message: "{$user->name} updated/resubmitted Liquidation #{$liquidation->id} (" . NotificationService::formatPeso($liquidation->total_expense_amount) . ").",
                recordLink: "/liquidations?view={$liquidation->id}",
                recordType: 'liquidation',
                recordId: $liquidation->id,
                excludeUserId: $user->id
            );

            return response()->json([
                'message' => 'Liquidation updated successfully.',
                'data' => $liquidation,
            ]);
        });
    }

    /**
     * Delete a pending liquidation settlement.
     */
    public function destroy(Request $request, $id)
    {
        $user = $request->user();
        $liquidation = Liquidation::findOrFail($id);

        if ($liquidation->user_id !== $user->id) {
            return response()->json(['message' => 'Forbidden. You do not own this liquidation.'], 403);
        }

        if ($liquidation->status !== 'pending') {
            return response()->json(['message' => 'Only pending liquidations can be deleted.'], 409);
        }

        $validated = $request->validate([
            'password' => 'required|string',
        ]);

        // Verify password
        if (!PasswordVerificationService::verify($request, $validated['password'])) {
            throw ValidationException::withMessages([
                'password' => ['Invalid password. Please try again.']
            ]);
        }

        return DB::transaction(function () use ($liquidation) {
            $advance = CashAdvance::findOrFail($liquidation->cash_advance_id);

            // Remove report file from storage
            if ($liquidation->report_file_path) {
                Storage::disk('supabase')->delete($liquidation->report_file_path);
            }

            // Revert cash advance status back to reconcilable state
            $advance->update(['status' => 'incomplete']);

            \App\Modules\CashAdvances\Models\CashAdvanceStatusHistory::create([
                'cash_advance_id' => $advance->id,
                'from_status' => 'under-review',
                'to_status' => 'incomplete',
                'changed_by' => auth()->id(),
            ]);

            $liquidation->delete();

            return response()->json([
                'message' => 'Liquidation deleted successfully.',
            ]);
        });
    }
}
