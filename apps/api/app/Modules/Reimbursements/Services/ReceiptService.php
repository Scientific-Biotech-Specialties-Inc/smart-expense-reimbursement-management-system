<?php

namespace App\Modules\Reimbursements\Services;

use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Ai\Services\MockOcrService;
use App\Modules\Reimbursements\Jobs\DispatchReceiptToAiService;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Illuminate\Auth\Access\AuthorizationException;
use App\Modules\Shared\Traits\ValidatesReceiptDuplicates;
use App\Modules\Ai\Contracts\AsyncOcrEngineInterface;

class ReceiptService
{
    use ValidatesReceiptDuplicates;
    /**
     * List all receipts for the user.
     */
    public function listReceipts(User $user, bool $canManage, array $filters = [])
    {
        $query = Receipt::with('category', 'uploader', 'items')
            ->withCount('reimbursements');

        // Exclude uncommitted drafts so in-flight form uploads never leak into My Expense
        if (empty($filters['include_drafts'])) {
            $query->where('receipts.is_draft', false);
        }

        if (!$canManage || ($filters['scope'] ?? null) === 'mine') {
            $query->where('uploaded_by', $user->id);
        }

        if (!empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $query->where(function ($subQuery) use ($search) {
                $subQuery
                    ->where('vendor_name', 'like', "%{$search}%")
                    ->orWhere('invoice_number', 'like', "%{$search}%")
                    ->orWhere('file_path', 'like', "%{$search}%");
            });
        }

        if (!empty($filters['status']) && strtolower((string) $filters['status']) !== 'all') {
            $query->where('status', strtolower((string) $filters['status']));
        }

        if (!empty($filters['category']) && strtolower((string) $filters['category']) !== 'all') {
            $category = (string) $filters['category'];
            $query->whereHas('category', function ($subQuery) use ($category) {
                $subQuery->where('name', $category);
            });
        }

        $sort = strtolower(trim((string) ($filters['sort'] ?? 'newest')));
        switch ($sort) {
            case 'oldest':
                $query->orderBy('created_at', 'asc')->orderBy('id', 'asc');
                break;
            case 'name-asc':
                $query->orderByRaw('LOWER(COALESCE(vendor_name, \'\')) ASC')->orderBy('id', 'asc');
                break;
            case 'name-desc':
                $query->orderByRaw('LOWER(COALESCE(vendor_name, \'\')) DESC')->orderBy('id', 'desc');
                break;
            case 'price-desc':
                $query->orderBy('total_amount', 'desc')->orderBy('id', 'desc');
                break;
            case 'price-asc':
                $query->orderBy('total_amount', 'asc')->orderBy('id', 'asc');
                break;
            case 'category-asc':
                $query->leftJoin('expense_categories', 'receipts.expense_category_id', '=', 'expense_categories.id')
                    ->select('receipts.*')
                    ->orderByRaw('LOWER(COALESCE(expense_categories.name, \'\')) ASC')
                    ->orderBy('receipts.id', 'asc');
                break;
            case 'status-asc':
                $query->orderBy('status', 'asc')->orderBy('id', 'asc');
                break;
            case 'newest':
            default:
                $query->orderByDesc('created_at')->orderByDesc('id');
                break;
        }

        $perPage = (int) ($filters['per_page'] ?? 10);
        $perPage = max(1, min($perPage, 10));

        return $query->paginate($perPage);
    }

    /**
     * Get a single receipt by ID, ensuring only the owner can view their My Expense receipt.
     */
    public function getReceipt(User $user, int $id, bool $canManage = false)
    {
        $receipt = Receipt::with('category', 'uploader', 'items')
            ->withCount('reimbursements')
            ->findOrFail($id);

        if ($receipt->uploaded_by !== $user->id) {
            throw new AuthorizationException('Access denied. You do not have permission to view this record.');
        }

        return $receipt;
    }

    /**
     * Store a newly uploaded receipt (single or multi-page) in the database.
     */
    public function storeReceipt(User $user, array $validated, $file)
    {
        return DB::transaction(function () use ($user, $validated, $file) {
            $files = is_array($file) ? $file : [$file];
            $storedFile = $this->storeReceiptFiles($files);

            $this->validateDuplicateReceipt($storedFile['file_hash']);

            $isMock = MockOcrService::isMockRequest($validated);
            $mock = $isMock ? MockOcrService::generate($files[0]?->getClientOriginalName() ?? 'receipt.jpg') : [];
            $isDraft = (bool) ($validated['is_draft'] ?? false);

            $receipt = Receipt::create([
                'uploaded_by'          => $user->id,
                'file_path'            => $storedFile['file_path'],
                'file_hash'            => $storedFile['file_hash'],
                'file_type'            => $storedFile['file_type'],
                'file_size_bytes'      => $storedFile['file_size_bytes'],
                'expense_category_id'  => $validated['expense_category_id'] ?? null,
                'vendor_name'          => $validated['vendor_name'] ?? $mock['vendor_name'] ?? null,
                'transaction_date'     => $validated['transaction_date'] ?? $mock['transaction_date'] ?? null,
                'total_amount'         => $validated['total_amount'] ?? $mock['total_amount'] ?? null,
                'subtotal'             => $validated['subtotal'] ?? $mock['subtotal'] ?? null,
                'vat_amount'           => $validated['vat_amount'] ?? $mock['vat_amount'] ?? null,
                'tin'                  => $validated['tin'] ?? $mock['tin'] ?? null,
                'invoice_number'       => $validated['invoice_number'] ?? $mock['invoice_number'] ?? null,
                'vat_classification'   => $validated['vat_classification'] ?? $mock['vat_classification'] ?? null,
                'currency'             => $validated['currency'] ?? $mock['currency'] ?? ($isMock ? 'PHP' : null),
                'location'             => $validated['location'] ?? $mock['location'] ?? null,
                'ocr_confidence_score' => $mock['ocr_confidence_score'] ?? null,
                'ocr_flagged'          => false,
                'is_archived'          => false,
                'is_draft'             => $isDraft,
                'status'               => $isMock ? 'processed' : 'processing',
            ]);

            if (!empty($validated['items'])) {
                $receipt->items()->createMany($validated['items']);
            } elseif ($isMock && !empty($mock['items'])) {
                $receipt->items()->createMany($mock['items']);
            }

            if ($isMock) {
                $receipt->load('category', 'items', 'uploader');

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: $user->role,
                    actionType: 'RECEIPT_CREATED',
                    entityType: 'receipt',
                    entityId: $receipt->id,
                    beforeState: null,
                    afterState: $receipt->toArray(),
                    ipAddress: request()->ip(),
                );

                if (!$isDraft) {
                    $amountText = $receipt->total_amount ? ' (' . NotificationService::formatPeso($receipt->total_amount) . ')' : '';
                    NotificationService::notifyUser(
                        userId: $user->id,
                        type: 'receipt_processed',
                        module: 'My Expense',
                        title: 'Receipt Processed',
                        message: "Your My Expense receipt #{$receipt->id}{$amountText} was uploaded and processed.",
                        recordLink: "/my-expense?view={$receipt->id}",
                        recordType: 'receipt',
                        recordId: $receipt->id
                    );
                }

                return $receipt;
            }

            // Dispatch to the external AI OCR + categorization service (callback-based;
            // runs inline by default so it works without a dedicated queue worker).
            $this->dispatchOcrJob($receipt);

            $receipt->load('category', 'items', 'uploader');

            // Audit Log
            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role,
                actionType: 'RECEIPT_CREATED',
                entityType: 'receipt',
                entityId: $receipt->id,
                beforeState: null,
                afterState: $receipt->toArray(),
                ipAddress: request()->ip(),
            );

            if (!$isDraft) {
                $amountText = $receipt->total_amount ? ' (' . NotificationService::formatPeso($receipt->total_amount) . ')' : '';
                NotificationService::notifyUser(
                    userId: $user->id,
                    type: 'receipt_uploaded',
                    module: 'My Expense',
                    title: 'Receipt Uploaded',
                    message: "Your My Expense receipt #{$receipt->id} was uploaded and sent for OCR processing.",
                    recordLink: "/my-expense?view={$receipt->id}",
                    recordType: 'receipt',
                    recordId: $receipt->id
                );
            }

            return $receipt;
        });
    }

    /**
     * Update a receipt.
     *
     * Admins may edit any receipt (including status / admin_notes).
     * The receipt owner (uploader) may correct the OCR-extracted fields of
     * their own receipt after the OCR pipeline has processed it, but may NOT
     * set status or admin_notes.
     */
    public function updateReceipt(User $user, int $id, array $data, bool $canManage)
    {
        return DB::transaction(function () use ($user, $id, $data, $canManage) {
            $receipt = Receipt::with('items')->findOrFail($id);

            // Authorization: admin OR the uploader (owner) of the receipt.
            if (!$canManage && $receipt->uploaded_by !== $user->id) {
                throw new AuthorizationException('Unauthorized.');
            }

            // Admin-only fields: admin_notes may only be set by admins.
            // A non-admin owner may promote their own (non-attached) receipt to
            // 'processed' to correct a poor OCR result, but no other status change
            // is permitted. An attached receipt must keep mirroring its
            // reimbursement, so the promotion is ignored for attached receipts.
            $updateData = collect($data);
            if (!$canManage) {
                $updateData = $updateData->except(['admin_notes']);
                if ($updateData->has('status')) {
                    $canPromote = $updateData->get('status') === 'processed'
                        && !$receipt->reimbursements()->exists();
                    if ($canPromote) {
                        $updateData['ocr_flagged'] = false;
                    } else {
                        $updateData = $updateData->except(['status']);
                    }
                }
            }
            $updateData = $updateData->toArray();

            // Normalize vat_classification to lowercase when present.
            if (array_key_exists('vat_classification', $updateData)) {
                $updateData['vat_classification'] = strtolower((string) $updateData['vat_classification']);
            }

            $beforeState = $receipt->toArray();

            $receipt->update($updateData);

            // Items sync: replace existing line items when `items` is supplied.
            if (array_key_exists('items', $data)) {
                $receipt->items()->delete();

                if (!empty($data['items'])) {
                    $receipt->items()->createMany($data['items']);
                }
            }

            // Audit Log (required by AGENTS.md for every DB mutation).
            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role,
                actionType: 'RECEIPT_UPDATED',
                entityType: 'receipt',
                entityId: $receipt->id,
                beforeState: $beforeState,
                afterState: $receipt->fresh()->toArray(),
                ipAddress: request()->ip(),
            );

            if ($canManage && (int) $receipt->uploaded_by !== (int) $user->id) {
                if (!empty($updateData['admin_notes'])) {
                    NotificationService::notifyUser(
                        userId: (int) $receipt->uploaded_by,
                        type: 'receipt_admin_note',
                        module: 'My Expense',
                        title: 'Admin Note on Receipt',
                        message: "Admin note added to Receipt #{$receipt->id}: \"{$updateData['admin_notes']}\"",
                        recordLink: "/my-expense?view={$receipt->id}",
                        recordType: 'receipt',
                        recordId: $receipt->id
                    );
                }

                if (!empty($updateData['status'])) {
                    NotificationService::notifyUser(
                        userId: (int) $receipt->uploaded_by,
                        type: "receipt_{$updateData['status']}",
                        module: 'My Expense',
                        title: 'Receipt Status Updated',
                        message: "Your Receipt #{$receipt->id} status was updated to {$updateData['status']}.",
                        recordLink: "/my-expense?view={$receipt->id}",
                        recordType: 'receipt',
                        recordId: $receipt->id
                    );
                }
            }

            return $receipt->fresh(['category', 'items', 'uploader'])
                ->loadCount('reimbursements');
        });
    }

    /**
     * Let the uploader re-submit a receipt with corrected metadata, or replace
     * the image and re-run the OCR pipeline.
     *
     * Behavior:
     *  - New file whose hash collides with a DIFFERENT, non-deleted receipt →
     *    flag the receipt as a duplicate (status rejected, rejection_code
     *    'duplicate', ocr_flagged true) and do NOT run OCR.
     *  - New file that is the same image re-uploaded for this very receipt, or a
     *    brand-new image with no collision → silently re-run OCR (status
     *    processing, ocr_flagged false, dispatch the OCR job).
     *  - No new file (metadata-only edit) → preserve the legacy behavior
     *    (status processed, no OCR dispatch) so manual-entry corrections stay.
     *
     * This flow is intentionally separate from retryOcrReceipt(), which keeps
     * its own duplicate semantics untouched (see lines 258-290).
     */
    public function resubmitReceipt(User $user, int $id, array $data, $file = null)
    {
        return DB::transaction(function () use ($user, $id, $data, $file) {
            $receipt = Receipt::with('items')->findOrFail($id);

            if ($receipt->uploaded_by !== $user->id) {
                throw new AuthorizationException('Unauthorized. You can only resubmit your own receipts.');
            }

            if (in_array($receipt->status, ['approved', 'pending', 'pending-admin-re-review', 'final-rejected'], true)) {
                throw ValidationException::withMessages([
                    'status' => ['Receipts with status approved, pending, pending-admin-re-review, or final-rejected cannot be edited.'],
                ]);
            }

            // Receipt image re-upload / replacement is disabled. The on-file image
            // must be preserved, so any supplied file is rejected outright and the
            // existing receipt image is never overwritten. Metadata-only edits
            // (no file) remain fully supported below.
            if ($file !== null) {
                throw ValidationException::withMessages([
                    'file' => ['Receipt image re-upload is not permitted. Existing receipt images cannot be replaced.'],
                ]);
            }

            $updateData = collect($data)
                ->except(['file', 'items'])
                ->toArray();

            if (array_key_exists('vat_classification', $updateData)) {
                $updateData['vat_classification'] = strtolower((string)$updateData['vat_classification']);
            }

            // Metadata-only edit (no replacement file): preserve legacy behavior.
            if (!$file) {
                $updateData['status'] = 'processed';
                $updateData['ocr_flagged'] = false;

                $beforeState = $receipt->toArray();

                $receipt->update($updateData);

                if (array_key_exists('items', $data)) {
                    $receipt->items()->delete();

                    if (!empty($data['items'])) {
                        $receipt->items()->createMany($data['items']);
                    }
                }

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: $user->role,
                    actionType: 'RECEIPT_UPDATED',
                    entityType: 'receipt',
                    entityId: $receipt->id,
                    beforeState: $beforeState,
                    afterState: $receipt->fresh()->toArray(),
                    ipAddress: request()->ip(),
                );

                return $receipt->fresh(['category', 'items', 'uploader'])
                    ->loadCount('reimbursements');
            }

            // New file supplied → decide duplicate vs. OCR re-run.
            //
            // We compute the file hash FIRST and short-circuit duplicates
            // before persisting the uploaded file to storage. This avoids
            // leaving orphan files on the storage disk for receipts that are
            // rejected as duplicates (the previous code stored the file and
            // only then detected the collision).
            $beforeState = $receipt->toArray();

            $fileHash = hash_file('sha256', $file->getRealPath());

            // Collision with a DIFFERENT, non-deleted receipt → flag as duplicate.
            if ($this->duplicateReceiptExists($fileHash, $receipt->id)) {
                $updateData['status'] = 'rejected';
                $updateData['rejection_code'] = 'duplicate';
                $updateData['rejection_reason'] = 'Duplicate receipt detected based on file hash.';
                $updateData['ocr_flagged'] = true;

                $receipt->update($updateData);

                if (array_key_exists('items', $data)) {
                    $receipt->items()->delete();

                    if (!empty($data['items'])) {
                        $receipt->items()->createMany($data['items']);
                    }
                }

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: $user->role,
                    actionType: 'RECEIPT_OCR_REJECTED',
                    entityType: 'receipt',
                    entityId: $receipt->id,
                    beforeState: $beforeState,
                    afterState: $receipt->fresh()->toArray(),
                    ipAddress: request()->ip(),
                );

                return $receipt->fresh(['category', 'items', 'uploader'])
                    ->loadCount('reimbursements');
            }

            // Not a duplicate → persist the file, then re-run OCR.
            try {
                $newFile = $this->storeReceiptFiles([$file]);
            } catch (\Throwable $e) {
                Log::error('resubmitReceipt: failed to persist uploaded file to storage.', [
                    'receipt_id' => $receipt->id,
                    'error' => $e->getMessage(),
                ]);
                throw $e;
            }

            $updateData = array_merge($updateData, $newFile);

            // Same image re-uploaded for this receipt, or a brand-new image →
            // silently re-run OCR.
            $updateData['status'] = 'processing';
            $updateData['ocr_flagged'] = false;

            $receipt->update($updateData);

            if (array_key_exists('items', $data)) {
                $receipt->items()->delete();

                if (!empty($data['items'])) {
                    $receipt->items()->createMany($data['items']);
                }
            }

            // Dispatch OCR (runs inline by default — no dedicated worker required).
            $this->dispatchOcrJob($receipt);

            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role,
                actionType: 'RECEIPT_OCR_RETRY',
                entityType: 'receipt',
                entityId: $receipt->id,
                beforeState: $beforeState,
                afterState: $receipt->fresh()->toArray(),
                ipAddress: request()->ip(),
            );

            return $receipt->fresh(['category', 'items', 'uploader'])
                ->loadCount('reimbursements');
        });
    }

    /**
     * Re-run the OCR pipeline for an existing receipt.
     */
    public function retryOcrReceipt(User $user, int $id)
    {
        return DB::transaction(function () use ($user, $id) {
            $receipt = Receipt::with('items')->findOrFail($id);

            if ($receipt->uploaded_by !== $user->id) {
                throw new AuthorizationException('Unauthorized. You can only retry OCR for your own receipts.');
            }

            $beforeState = $receipt->toArray();

            $receipt->update([
                'status' => 'processing',
                'ocr_flagged' => false,
            ]);

            DispatchReceiptToAiService::dispatch($receipt);

            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role,
                actionType: 'RECEIPT_OCR_RETRY',
                entityType: 'receipt',
                entityId: $receipt->id,
                beforeState: $beforeState,
                afterState: $receipt->fresh()->toArray(),
                ipAddress: request()->ip(),
            );

            return $receipt->fresh(['category', 'items', 'uploader'])
                ->loadCount('reimbursements');
        });
    }

    /**
     * Store uploaded files on the configured Supabase disk and return DB column arrays.
     */
    private function storeReceiptFiles(array $files): array
    {
        $filePaths = [];
        $fileHashes = [];
        $fileTypes = [];
        $fileSizes = [];

        foreach ($files as $file) {
            if (!$file) continue;

            $fileType = $file->extension();
            if ($fileType === 'jpg') {
                $fileType = 'jpeg';
            }

            $filePaths[] = $file->store('receipts', 'supabase');
            $fileHashes[] = hash_file('sha256', $file->getRealPath());
            $fileTypes[] = $fileType;
            $fileSizes[] = $file->getSize();
        }

        return [
            'file_path'       => $filePaths,
            'file_hash'       => $fileHashes,
            'file_type'       => $fileTypes,
            'file_size_bytes' => $fileSizes,
        ];
    }

    /**
     * Dispatch the OCR pipeline job for a receipt.
     *
     * The OCR job is callback-based: the external AI service accepts the file
     * synchronously and POSTs results back via the ocr-callback endpoint. To keep
     * the feature working in single-instance deployments that do NOT run a
     * dedicated queue worker (e.g. Azure App Service, local `php artisan serve`),
     * it defaults to the `sync` connection so it runs inline within the request.
     * Deployments that DO run a worker can set AI_SERVICE_OCR_QUEUE_CONNECTION
     * (e.g. "database") to offload it.
     *
     * Failures are caught here so a dispatch / OCR-start error never rolls back the
     * surrounding DB transaction or leaves the user guessing — the receipt is left
     * in a clear `failed` state (surfaced by the UI) instead of silently stalling.
     */
    private function dispatchOcrJob(Receipt $receipt): void
    {
        $connection = config('services.ai_service.ocr_queue_connection', 'sync');

        try {
            // Build the job, set its connection, then dispatch the instance.
            // (Calling ->dispatch() on an already-built job hits the trait's
            // static dispatch() which re-instantiates with no args — so we use
            // Bus::dispatch on the instance instead.) `sync` runs the job inline.
            $job = (new DispatchReceiptToAiService($receipt))->onConnection($connection);
            Bus::dispatch($job);
        } catch (\Throwable $e) {
            Log::error('ReceiptService: failed to dispatch OCR job.', [
                'receipt_id' => $receipt->id,
                'connection' => $connection,
                'error'      => $e->getMessage(),
            ]);

            $receipt->update([
                'status'           => 'failed',
                'ocr_flagged'      => true,
                'rejection_code'   => 'ocr_failed',
                'rejection_reason' => 'OCR could not be started. Please retry OCR.',
            ]);
        }
    }

    /**
     * Purge physical files from storage and vector embedding from ocr-pipeline.
     */
    public function purgeReceiptArtifacts(Receipt $receipt): void
    {
        // 1. Delete physical files from Supabase storage
        $filePaths = is_array($receipt->file_path) ? $receipt->file_path : (array) $receipt->file_path;
        foreach ($filePaths as $path) {
            if ($path && !str_starts_with($path, 'http://') && !str_starts_with($path, 'https://')) {
                try {
                    Storage::disk('supabase')->delete($path);
                } catch (\Throwable $e) {
                    Log::warning('purgeReceiptArtifacts: failed to delete file from storage', [
                        'receipt_id' => $receipt->id,
                        'path'       => $path,
                        'error'      => $e->getMessage(),
                    ]);
                }
            }
        }

        // 2. Purge AI vector embedding from ocr-pipeline pgvector
        try {
            app(AsyncOcrEngineInterface::class)->deleteReceiptEmbedding($receipt->id);
        } catch (\Throwable $e) {
            Log::warning('purgeReceiptArtifacts: failed to purge AI embedding', [
                'receipt_id' => $receipt->id,
                'error'      => $e->getMessage(),
            ]);
        }
    }

    /**
     * Delete a receipt.
     */
    public function deleteReceipt(User $user, int $id, bool $canManage, string $ipAddress)
    {
        return DB::transaction(function () use ($user, $id, $canManage, $ipAddress) {
            $receipt = Receipt::findOrFail($id);

            // Check RBAC: Only uploader or admin can delete
            if ($receipt->uploaded_by !== $user->id && !$canManage) {
                throw new AuthorizationException('Unauthorized. You can only delete your own receipts.');
            }

            if (!$canManage && in_array($receipt->status, ['approved', 'pending', 'pending-admin-re-review', 'final-rejected'])) {
                throw ValidationException::withMessages([
                    'receipt' => ['Receipts with status approved, pending, pending-admin-re-review, or final-rejected cannot be deleted.']
                ]);
            }

            // Check constraints: Block deletion if linked to a Reimbursement
            if ($receipt->reimbursements()->exists()) {
                throw ValidationException::withMessages([
                    'receipt' => ['Cannot delete a receipt that is attached to a reimbursement.']
                ]);
            }

            $beforeState = $receipt->toArray();
            
            // Purge physical files and ocr-pipeline vector embedding
            $this->purgeReceiptArtifacts($receipt);

            // Audit Log
            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role,
                actionType: 'RECEIPT_DELETED',
                entityType: 'receipt',
                entityId: $receipt->id,
                beforeState: $beforeState,
                afterState: ['deleted_at' => now()->toDateTimeString()],
                ipAddress: $ipAddress
            );

            if ($receipt->is_draft) {
                $receipt->items()->delete();
                $receipt->forceDelete();
            } else {
                $receipt->delete();
            }
        });
    }
}
