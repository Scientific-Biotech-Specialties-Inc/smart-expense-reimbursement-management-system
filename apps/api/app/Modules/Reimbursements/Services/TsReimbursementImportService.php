<?php

namespace App\Modules\Reimbursements\Services;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class TsReimbursementImportService
{
    public function __construct(
        private readonly ReceiptService $receiptService
    ) {}

    /**
     * Validate and import an inbound Ticketing System (TS) reimbursement submission.
     *
     * @return array{created: bool, reimbursement: Reimbursement}
     */
    public function importFromRequest(Request $request): array
    {
        $normalized = $this->normalizeAndValidate($request);
        $ticketId = (int) $normalized['ticket_id'];
        $files = $normalized['receipts'];

        // Fast-path idempotency check before uploading files to Supabase.
        $existing = $this->findLatestByTicketId($ticketId);
        if ($existing && $this->isActiveStatus((string) $existing->status)) {
            AuditLogService::enrichReimbursement($existing, false);

            return [
                'created'       => false,
                'reimbursement' => $existing,
            ];
        }

        $uploadedPaths = [];
        $createdReceipts = [];
        $ipAddress = $request->ip();

        try {
            $txResult = DB::transaction(function () use ($normalized, $ticketId, $files, $ipAddress, &$uploadedPaths, &$createdReceipts) {
                $lockedExisting = $this->findLatestByTicketId($ticketId, true);
                if ($lockedExisting && $this->isActiveStatus((string) $lockedExisting->status)) {
                    return [
                        'created'       => false,
                        'reimbursement' => $lockedExisting,
                    ];
                }

                $user = $this->resolveOrCreateEmployee($normalized);
                $expenseCategoryId = $this->resolveExpenseCategoryId($normalized);

                $receiptIds = [];
                foreach ($files as $file) {
                    $storedFile = $this->receiptService->storeAndValidateUploadedFiles([$file]);
                    $uploadedPaths = array_merge($uploadedPaths, $storedFile['file_path']);

                    $receipt = Receipt::create([
                        'uploaded_by'          => $user->id,
                        'file_path'            => $storedFile['file_path'],
                        'file_hash'            => $storedFile['file_hash'],
                        'file_type'            => $storedFile['file_type'],
                        'file_size_bytes'      => $storedFile['file_size_bytes'],
                        'expense_category_id'  => $expenseCategoryId,
                        'ocr_confidence_score' => null,
                        'ocr_flagged'          => false,
                        'is_archived'          => false,
                        'is_draft'             => false,
                        'status'               => 'processing',
                    ]);

                    AuditLogService::log(
                        actorId: $user->id,
                        actorRole: $user->role ?? 'employee',
                        actionType: 'RECEIPT_CREATED',
                        entityType: 'receipt',
                        entityId: $receipt->id,
                        beforeState: null,
                        afterState: $receipt->toArray(),
                        ipAddress: $ipAddress
                    );

                    $createdReceipts[] = $receipt;
                    $receiptIds[] = $receipt->id;
                }

                $reimbursement = Reimbursement::create([
                    'user_id'              => $user->id,
                    'receipt_id'           => $receiptIds[0] ?? null,
                    'description'          => $normalized['description'],
                    'expense_category_id'  => $expenseCategoryId,
                    'ticket_id'            => $ticketId,
                    'ticket_number'        => $normalized['ticket_number'],
                    'amount'               => $normalized['amount'],
                    'date'                 => $normalized['expense_date'],
                    'report_file_path'     => null,
                    'status'               => 'pending',
                    'submitted_by_name'    => $user->name,
                    'source_system'        => 'ts',
                    'source_submission_id' => (string) $ticketId,
                    'is_request'           => true,
                ]);

                $reimbursement->receipts()->attach($receiptIds);

                $formattedAmount = NotificationService::formatPeso($reimbursement->amount);
                $link = "/reimbursements?view={$reimbursement->id}";

                NotificationService::notifyUser(
                    userId: $user->id,
                    type: 'reimbursement_submitted',
                    module: 'Reimbursement',
                    title: 'Reimbursement Submitted',
                    message: "Your reimbursement of {$formattedAmount} for Ticket {$reimbursement->ticket_number} was submitted.",
                    recordLink: $link,
                    recordType: 'reimbursement',
                    recordId: $reimbursement->id
                );

                NotificationService::notifyAdmins(
                    type: 'admin_reimbursement_submitted',
                    module: 'Reimbursement',
                    title: 'New TS Reimbursement Request',
                    message: "{$user->name} submitted a reimbursement request of {$formattedAmount} from Ticket {$reimbursement->ticket_number}.",
                    recordLink: $link,
                    recordType: 'reimbursement',
                    recordId: $reimbursement->id,
                    excludeUserId: $user->id
                );

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: $user->role ?? 'employee',
                    actionType: 'TS_REIMBURSEMENT_RECEIVED',
                    entityType: 'reimbursement',
                    entityId: $reimbursement->id,
                    beforeState: null,
                    afterState: $reimbursement->toArray(),
                    ipAddress: $ipAddress
                );

                return [
                    'created'       => true,
                    'reimbursement' => $reimbursement,
                ];
            });
        } catch (\Throwable $e) {
            $this->receiptService->cleanupStoredFiles($uploadedPaths);

            if (!$e instanceof ValidationException) {
                Log::error('TsReimbursementImportService::importFromRequest failed.', [
                    'ticket_id'     => $ticketId,
                    'ticket_number' => $normalized['ticket_number'] ?? null,
                    'error'         => $e->getMessage(),
                ]);
            }

            throw $e;
        }

        if ($txResult['created']) {
            foreach ($createdReceipts as $receipt) {
                $this->receiptService->dispatchOcrJob($receipt);
            }
        }

        $reimbursement = $txResult['reimbursement']->load([
            'receipts.items',
            'receipts.category',
            'user',
            'expenseCategory',
        ]);
        AuditLogService::enrichReimbursement($reimbursement, false);

        return [
            'created'       => $txResult['created'],
            'reimbursement' => $reimbursement,
        ];
    }

    /**
     * Find the latest reimbursement linked to a TS ticket ID.
     */
    public function findLatestByTicketId(int $ticketId, bool $lock = false): ?Reimbursement
    {
        $query = Reimbursement::with(['receipts.items', 'receipts.category', 'user', 'expenseCategory', 'payout'])
            ->where(function ($q) use ($ticketId) {
                $q->where('ticket_id', $ticketId)
                    ->orWhere(function ($sub) use ($ticketId) {
                        $sub->where('source_system', 'ts')
                            ->where('source_submission_id', (string) $ticketId);
                    });
            })
            ->orderByDesc('id');

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->first();
    }

    private function isActiveStatus(string $status): bool
    {
        return strtolower(trim($status)) !== 'rejected';
    }

    /**
     * Normalize multipart aliases and validate payload fields and files.
     *
     * @return array<string, mixed>
     */
    private function normalizeAndValidate(Request $request): array
    {
        $raw = $request->all();

        $employee = $raw['employee'] ?? [];
        if (is_string($employee)) {
            $decoded = json_decode($employee, true);
            $employee = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($employee)) {
            $employee = [];
        }

        $uploadedFiles = $request->file('receipts') ?? $request->file('attachments');
        $files = $uploadedFiles === null
            ? []
            : (is_array($uploadedFiles) ? array_values($uploadedFiles) : [$uploadedFiles]);

        $data = [
            'ticket_id'           => $raw['ticket_id'] ?? null,
            'ticket_number'       => $raw['ticket_number'] ?? null,
            'employee_email'      => $raw['employee_email'] ?? ($employee['email'] ?? null),
            'employee_name'       => $raw['employee_name'] ?? ($employee['name'] ?? null),
            'employee_id'         => $raw['employee_id'] ?? ($employee['id'] ?? null),
            'department'          => $raw['department'] ?? ($employee['department'] ?? null),
            'amount'              => $raw['amount'] ?? null,
            'expense_category_id' => $raw['expense_category_id'] ?? null,
            'expense_category'    => $raw['expense_category'] ?? null,
            'description'         => $raw['description'] ?? ($raw['purpose'] ?? null),
            'expense_date'        => $raw['expense_date'] ?? ($raw['date'] ?? null),
            'receipts'            => $files,
        ];

        $validator = Validator::make($data, [
            'ticket_id'           => ['required', 'integer', 'min:1'],
            'ticket_number'       => ['required', 'string', 'max:64'],
            'employee_email'      => ['required', 'email', 'max:255'],
            'employee_name'       => ['required', 'string', 'max:255'],
            'employee_id'         => ['nullable', 'max:64'],
            'department'          => ['nullable', 'string', 'max:255'],
            'amount'              => ['required', 'numeric', 'min:0.01'],
            'expense_category_id' => ['nullable', 'integer', 'exists:expense_categories,id'],
            'expense_category'    => ['nullable', 'max:100'],
            'description'         => ['required', 'string', 'max:255'],
            'expense_date'        => ['required', 'date'],
            'receipts'            => ['required', 'array', 'min:1'],
            'receipts.*'          => ['required', 'file', 'mimes:jpeg,jpg,png,pdf', 'max:2048'],
        ]);

        if ($validator->fails()) {
            throw new ValidationException($validator);
        }

        // Validate numeric expense_category references an existing category if no explicit ID was supplied.
        if (empty($data['expense_category_id']) && is_numeric($data['expense_category'])) {
            $category = ExpenseCategory::find((int) $data['expense_category']);
            if (!$category) {
                throw ValidationException::withMessages([
                    'expense_category' => ['The selected expense category is invalid.'],
                ]);
            }
            $data['expense_category_id'] = $category->id;
        }

        return $data;
    }

    private function resolveOrCreateEmployee(array $normalized): User
    {
        $email = strtolower(trim((string) $normalized['employee_email']));
        $existing = User::whereRaw('LOWER(email) = ?', [$email])->first();
        if ($existing) {
            return $existing;
        }

        $authId = null;
        if (!empty($normalized['employee_id']) && is_numeric($normalized['employee_id'])) {
            $candidateAuthId = (int) $normalized['employee_id'];
            if ($candidateAuthId > 0 && !User::where('auth_id', $candidateAuthId)->exists()) {
                $authId = $candidateAuthId;
            }
        }

        return User::create([
            'auth_id'    => $authId,
            'email'      => $email,
            'name'       => trim((string) $normalized['employee_name']),
            'role'       => 'employee',
            'department' => trim((string) ($normalized['department'] ?? '')) ?: 'Field Service',
        ]);
    }

    private function resolveExpenseCategoryId(array $normalized): ?int
    {
        if (!empty($normalized['expense_category_id'])) {
            return (int) $normalized['expense_category_id'];
        }

        $rawCategory = trim((string) ($normalized['expense_category'] ?? ''));
        if ($rawCategory === '') {
            return null;
        }

        if (is_numeric($rawCategory)) {
            return ExpenseCategory::find((int) $rawCategory)?->id;
        }

        $existing = ExpenseCategory::whereRaw('LOWER(TRIM(name)) = ?', [strtolower($rawCategory)])->first();
        if ($existing) {
            return $existing->id;
        }

        return ExpenseCategory::firstOrCreate(['name' => $rawCategory])->id;
    }
}
