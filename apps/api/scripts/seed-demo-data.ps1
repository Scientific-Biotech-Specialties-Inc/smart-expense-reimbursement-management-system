<#
.SYNOPSIS
    Seeds realistic, LINKED demo data for the SERMS monorepo
    (Smart Expense & Reimbursement Management System).

.DESCRIPTION
    Single-file demo data seeder. It materializes an embedded PHP payload to a
    temporary file (with a <?php tag) and executes it through

        php artisan tinker --execute="require '<file>';"

    which reuses the app models + AuditLogService (A-09 "Reuse before you
    write"). The temp file lives in the scripts/ dir, which the docker-compose
    stack bind-mounts at /var/www/scripts, so the same file is reachable from
    both the host and the serms_php container.

    Covered entities and statuses:
      * Receipts (expenses)   : processing, processed, pending, approved,
                                rejected, flagged, submitted, failed
      * Reimbursements        : pending, approved, rejected, granted,
                                submitted, processing
      * Cash Advances         : pending, approved, rejected, disbursed,
                                signed, under-review, liquidated, overdue,
                                settled, incomplete   (all enum values)
      * Liquidations          : pending, approved, rejected, liquidated
                                (all enum values)

    Every mutation also writes an audit_logs entry with action_type prefixed
    "SEED_", which makes the script idempotent: re-running deletes the rows it
    previously created (found via the SEED_ markers) and reseeds them.

.USAGE
    From PowerShell (anywhere):

        \apps\api\scripts\seed-demo-data.ps1              # reset + reseed (default)
        \apps\api\scripts\seed-demo-data.ps1 -NoReset     # append without cleanup
        \apps\api\scripts\seed-demo-data.ps1 -OnlyReset   # delete seeded rows only
        \apps\api\scripts\seed-demo-data.ps1 -UseHostPhp  # force host php instead of docker
        \apps\api\scripts\seed-demo-data.ps1 -Force      # allow even if APP_ENV=production

    Execution path auto-detected:
      1. docker compose exec -T php php artisan tinker  (preferred, documented env)
      2. host `php artisan tinker`                      (fallback)

.PREREQUISITES
    * Backend running: docker compose up -d (see docs/Build.md)
    * composer install already run (apps/api/vendor exists)
    * php artisan migrate already run (schema present)
    * apps/api/.env configured (DB_* variables)

.NOTES
    * Seed users are looked up from the users table (real login accounts
      provisioned by capstone-auth-module). Today that is employee@example.com.
      Every employee-role user gets the full set; approver/admin-role users get
      a smaller set.
    * If no approver/admin user exists, demo actor accounts approver@example.com
      and admin@example.com are created (required as FK actors for approval
      actions, disbursements, and audit trails).
    * Placeholder image: apps/web/public/mock_receipt.png (served at
      /mock_receipt.png). DB file_path values follow the supabase convention
      (receipts/mock_receipt.png) and the frontend falls back to /mock_receipt.png.
    * Refuses to run when APP_ENV=production unless -Force is used.
    * stdin-piping large payloads to `docker compose exec php artisan tinker`
      was rejected during development: PsySH in the container evaluates piped
      multi-line input unreliably. The --execute=require mechanism above is used
      instead (both paths verified).
#>
[CmdletBinding()]
param(
    [switch]$NoReset,
    [switch]$OnlyReset,
    [switch]$UseHostPhp,
    [switch]$Force
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiRoot    = Split-Path -Parent $scriptRoot
$payloadFile = Join-Path $scriptRoot '.seed-demo-data.payload.tmp.php'
$payloadFileName = Split-Path -Leaf $payloadFile
$utf8NoBom  = New-Object System.Text.UTF8Encoding($false)

function Test-HostPhp {
    try { $null = & php -v 2>$null; return $LASTEXITCODE -eq 0 } catch { return $false }
}
function Test-DockerPhp {
    try { $null = & docker compose exec -T php php -v 2>$null; return $LASTEXITCODE -eq 0 } catch { return $false }
}

# ---- production guard --------------------------------------------------
$envFile = Join-Path $apiRoot '.env'
if (Test-Path $envFile) {
    $envLine = Get-Content $envFile | Where-Object { $_ -match '^APP_ENV=' } | Select-Object -First 1
    if ($envLine) {
        $appEnv = ($envLine -replace '^APP_ENV=', '').Trim()
        if ($appEnv -eq 'production' -and -not $Force) {
            Write-Error "Refusing to seed against APP_ENV=production. Use -Force to override."
            exit 1
        }
    }
}

# ---- executor detection ------------------------------------------------
$useDocker = $false
if ($UseHostPhp) {
    if (-not (Test-HostPhp)) { Write-Error 'php was not found on PATH (required with -UseHostPhp).'; exit 1 }
    $useDocker = $false
} elseif (Test-DockerPhp) {
    $useDocker = $true
} elseif (Test-HostPhp) {
    $useDocker = $false
} else {
    Write-Error 'No execution path available: docker (serms_php container) and host php were both unavailable.'
    exit 1
}

$doReset = (-not $NoReset)
$doOnly  = $OnlyReset

# ---- embedded PHP payload (parts assembled below) ----------------------
# NOTE: all class names fully qualified WITHOUT a leading backslash; pure
# ASCII; no apostrophes inside single-quoted PHP strings.
$payloadPart1 = @'
// =====================================================================
// SERMS demo data seeder - tinker payload (invoked by seed-demo-data.ps1)
// Reuses app models + AuditLogService (A-09). Idempotent via SEED_ markers.
// =====================================================================

function seed_audit($actorId, $actorRole, $actionType, $entityType, $entityId, $before = null, $after = null) {
    App\Modules\AuditLogs\Services\AuditLogService::log(
        (int) $actorId,
        (string) $actorRole,
        (string) $actionType,
        (string) $entityType,
        (int) $entityId,
        $before,
        $after,
        '127.0.0.1'
    );
}

function seed_pick_actor($requesterId) {
    $actor = App\Modules\Users\Models\User::whereIn('role', ['approver', 'admin'])
        ->where('id', '!=', $requesterId)
        ->orderBy('id')
        ->first();
    if (!$actor) {
        $actor = App\Modules\Users\Models\User::where('id', '!=', $requesterId)
            ->orderBy('id')
            ->first();
    }
    return $actor;
}

function seed_receipt($user, $catId, $vendor, $amount, $status, $opts = []) {
    $now = Carbon\Carbon::now();
    $path = 'receipts/mock_receipt.png';
    $hash = hash('sha256', implode('|', [$path, $user->id, $vendor, $amount, $status]));
    $isVat = isset($opts['vat_classification']) ? $opts['vat_classification'] : 'vat';
    $receipt = App\Modules\Reimbursements\Models\Receipt::create([
        'uploaded_by' => $user->id,
        'file_path' => [$path],
        'file_hash' => [$hash],
        'file_type' => ['png'],
        'file_size_bytes' => [random_int(48000, 235000)],
        'vendor_name' => $vendor,
        'transaction_date' => isset($opts['date']) ? $opts['date'] : $now->copy()->subDays(random_int(3, 60))->toDateString(),
        'total_amount' => $amount,
        'vat_amount' => isset($opts['vat']) ? $opts['vat'] : ($isVat === 'vat' ? round($amount * 0.12 / 1.12, 2) : 0.00),
        'tin' => isset($opts['tin']) ? $opts['tin'] : '123-456-789-000',
        'invoice_number' => isset($opts['invoice']) ? $opts['invoice'] : 'INV-' . strtoupper(substr(hash('md5', $vendor . $user->id), 0, 8)),
        'vat_classification' => $isVat,
        'currency' => isset($opts['currency']) ? $opts['currency'] : 'PHP',
        'location' => isset($opts['location']) ? $opts['location'] : 'Manila',
        'ocr_confidence_score' => isset($opts['confidence']) ? $opts['confidence'] : 94.00,
        'ocr_flagged' => isset($opts['flagged']) ? $opts['flagged'] : false,
        'is_archived' => false,
        'expense_category_id' => $catId,
        'admin_notes' => isset($opts['admin_notes']) ? $opts['admin_notes'] : null,
        'status' => $status,
        'rejection_code' => isset($opts['rejection_code']) ? $opts['rejection_code'] : null,
        'rejection_reason' => isset($opts['rejection_reason']) ? $opts['rejection_reason'] : null,
        'deletion_warning_sent' => false,
    ]);
    if (isset($opts['items'])) {
        foreach ($opts['items'] as $item) {
            App\Modules\Reimbursements\Models\ReceiptItem::create([
                'receipt_id' => $receipt->id,
                'name' => $item[0],
                'quantity' => $item[1],
                'price' => $item[2],
            ]);
        }
    }
    seed_audit($user->id, $user->role, 'SEED_RECEIPT', 'receipt', $receipt->id, null, $receipt->toArray());
    return $receipt;
}

function seed_reimbursement($user, $receipts, $description, $catId, $amount, $status, $opts = []) {
    $reimbursement = App\Modules\Reimbursements\Models\Reimbursement::create([
        'user_id' => $user->id,
        'receipt_id' => $receipts->first()->id,
        'description' => $description,
        'expense_category_id' => $catId,
        'amount' => $amount,
        'date' => isset($opts['date']) ? $opts['date'] : Carbon\Carbon::now()->subDays(10)->toDateString(),
        'status' => $status,
        'rejection_comment' => isset($opts['rejection_comment']) ? $opts['rejection_comment'] : null,
        'report_file_path' => isset($opts['report_file_path']) ? $opts['report_file_path'] : null,
        'admin_notes' => isset($opts['admin_notes']) ? $opts['admin_notes'] : null,
        'submitted_by_name' => $user->name,
        'source_system' => isset($opts['source_system']) ? $opts['source_system'] : null,
        'source_submission_id' => isset($opts['source_submission_id']) ? $opts['source_submission_id'] : null,
        'is_request' => isset($opts['is_request']) ? $opts['is_request'] : false,
    ]);
    $reimbursement->receipts()->attach($receipts->pluck('id')->all());
    seed_audit($user->id, $user->role, 'SEED_REIMBURSEMENT', 'reimbursement', $reimbursement->id, null, $reimbursement->toArray());
    return $reimbursement;
}

function seed_cash_advance($user, $approver, array $def) {
    $uid = $user->id;
    $approverId = $approver->id;
    $ca = App\Modules\CashAdvances\Models\CashAdvance::create([
        'user_id' => $uid,
        'purpose' => $def['purpose'],
        'amount' => $def['amount'],
        'outstanding_balance' => isset($def['outstanding']) ? $def['outstanding'] : null,
        'expected_disbursement_date' => $def['disb_date'],
        'expected_liquidation_date' => $def['liq_date'],
        'status' => $def['status'],
        'signature' => isset($def['signature']) ? $def['signature'] : null,
        'acknowledged_at' => isset($def['acknowledged_at']) ? $def['acknowledged_at'] : null,
    ]);
    $ca->submitted_at = isset($def['submitted_at']) ? $def['submitted_at'] : Carbon\Carbon::now();
    $ca->save();

    foreach ($def['history'] as $h) {
        App\Modules\CashAdvances\Models\CashAdvanceStatusHistory::create([
            'cash_advance_id' => $ca->id,
            'from_status' => $h[0],
            'to_status' => $h[1],
            'changed_by' => $h[2],
            'changed_at' => $h[3],
        ]);
    }

    foreach ($def['actions'] as $a) {
        App\Modules\CashAdvances\Models\CashAdvanceApprovalAction::create([
            'cash_advance_id' => $ca->id,
            'approver_id' => $a['approver_id'],
            'action' => $a['action'],
            'comment' => isset($a['comment']) ? $a['comment'] : null,
            'actioned_at' => $a['at'],
        ]);
    }

    if (isset($def['disbursement'])) {
        $d = $def['disbursement'];
        App\Modules\CashAdvances\Models\CashAdvanceDisbursement::create([
            'cash_advance_id' => $ca->id,
            'disbursed_by_id' => $d['by'],
            'disbursement_date' => $d['date'],
            'channel' => $d['channel'],
            'reference_number' => $d['reference'],
        ]);
    }

    if (isset($def['document'])) {
        App\Modules\CashAdvances\Models\CashAdvanceDocument::create([
            'cash_advance_id' => $ca->id,
            'file_path' => 'cash_advances/documents/mock_receipt.png',
            'file_type' => 'image/png',
            'file_name' => isset($def['document']['file_name']) ? $def['document']['file_name'] : 'advance-request.png',
        ]);
    }

    if (isset($def['penalties'])) {
        foreach ($def['penalties'] as $day => $amt) {
            App\Modules\Liquidations\Models\PenaltyRecord::create([
                'cash_advance_id' => $ca->id,
                'days_overdue' => $day,
                'penalty_amount' => $amt,
            ]);
            seed_audit($approverId, $approver->role, 'SEED_PENALTY', 'penalty', $ca->id, null, ['days_overdue' => $day, 'penalty_amount' => $amt]);
        }
    }

    seed_audit($uid, $user->role, 'SEED_CASH_ADVANCE', 'cash_advance', $ca->id, null, $ca->toArray());
    return $ca;
}

function seed_liquidation($user, $ca, $status, $receiptIds, $totalExpense, $opts = []) {
    $liquidation = App\Modules\Liquidations\Models\Liquidation::create([
        'cash_advance_id' => $ca->id,
        'user_id' => $user->id,
        'status' => $status,
        'reimbursement_ids' => $receiptIds,
        'total_expense_amount' => $totalExpense,
        'outstanding_balance' => isset($opts['outstanding_balance']) ? $opts['outstanding_balance'] : $ca->amount,
        'shortfall_explanation' => isset($opts['shortfall_explanation']) ? $opts['shortfall_explanation'] : null,
        'admin_note' => isset($opts['admin_note']) ? $opts['admin_note'] : null,
        'report_file_path' => isset($opts['report_file_path']) ? $opts['report_file_path'] : null,
    ]);
    seed_audit($user->id, $user->role, 'SEED_LIQUIDATION', 'liquidation', $liquidation->id, null, $liquidation->toArray());
    return $liquidation;
}

function seed_cleanup() {
    $marked = function ($entityType) {
        return App\Modules\AuditLogs\Models\AuditLog::where('entity_type', $entityType)
            ->where('action_type', 'like', 'SEED_%')
            ->pluck('entity_id')
            ->all();
    };
    $reimbIds = $marked('reimbursement');
    $advIds   = $marked('cash_advance');
    $liqIds   = $marked('liquidation');
    $rcptIds  = $marked('receipt');
    $penIds   = $marked('penalty');

    Illuminate\Support\Facades\DB::transaction(function () use ($reimbIds, $advIds, $liqIds, $rcptIds, $penIds) {
        if ($reimbIds) {
            App\Modules\Reimbursements\Models\Reimbursement::whereIn('id', $reimbIds)->delete();
        }
        if ($liqIds) {
            App\Modules\Liquidations\Models\Liquidation::whereIn('id', $liqIds)->delete();
        }
        if ($penIds) {
            App\Modules\Liquidations\Models\PenaltyRecord::whereIn('id', $penIds)->delete();
        }
        if ($advIds) {
            App\Modules\CashAdvances\Models\CashAdvance::whereIn('id', $advIds)->delete();
        }
        if ($rcptIds) {
            App\Modules\Reimbursements\Models\Receipt::whereIn('id', $rcptIds)->forceDelete();
        }
        Illuminate\Support\Facades\DB::table('audit_logs')->where('action_type', 'like', 'SEED_%')->delete();
    });
    return count($reimbIds) + count($advIds) + count($liqIds) + count($rcptIds) + count($penIds);
}

'@
$payloadPart2 = @'
function seed_full_user($user, $cat) {
    $uid = $user->id;
    $now = Carbon\Carbon::now();
    $approver = seed_pick_actor($uid);
    if (!$approver) {
        throw new Exception('No approver/admin actor available for user ' . $uid);
    }
    $approverId = $approver->id;

    // ------------------------------------------------------------------
    // 1. RECEIPTS (expenses)
    // ------------------------------------------------------------------
    // Pool A - claimed by reimbursements
    $rPending  = seed_receipt($user, $cat['Meals'], 'Kanin Club BGC', 275.00, 'pending', ['date' => $now->copy()->subDays(12)->toDateString(), 'invoice' => 'INV-KCB-001', 'location' => 'BGC, Taguig']);
    $rApproved = seed_receipt($user, $cat['Accommodation'], 'Waterfront Hotel Manila', 2100.00, 'approved', ['date' => $now->copy()->subDays(18)->toDateString(), 'invoice' => 'INV-WHM-002', 'location' => 'Manila']);
    $rRejected = seed_receipt($user, $cat['Supplies'], 'National Book Store', 900.00, 'rejected', ['date' => $now->copy()->subDays(25)->toDateString(), 'invoice' => 'INV-NBS-003', 'rejection_code' => 'duplicate', 'rejection_reason' => 'Duplicate receipt detected based on semantic similarity.']);
    $rGranted1 = seed_receipt($user, $cat['Travel'], 'Cebu Pacific Air', 3650.00, 'processed', ['date' => $now->copy()->subDays(30)->toDateString(), 'invoice' => 'INV-CPA-004', 'location' => 'Cebu']);
    $rGranted2 = seed_receipt($user, $cat['Transportation'], 'Grab Philippines', 320.50, 'processed', ['date' => $now->copy()->subDays(30)->toDateString(), 'invoice' => 'INV-GRP-005', 'location' => 'Cebu']);
    $rSubmitted = seed_receipt($user, $cat['Travel'], 'PRS Imported Expense', 1100.00, 'submitted', ['date' => $now->copy()->subDays(6)->toDateString(), 'invoice' => 'INV-PRS-006']);
    $rClaimProc = seed_receipt($user, $cat['Meals'], 'Jollibee Ortigas', 450.00, 'processed', ['date' => $now->copy()->subDays(4)->toDateString(), 'invoice' => 'INV-JBO-007', 'location' => 'Ortigas']);

    // Pool B - used in liquidation reports
    $lUr1   = seed_receipt($user, $cat['Accommodation'], 'Cebu Waterfront Hotel', 4000.00, 'pending', ['date' => $now->copy()->subDays(9)->toDateString(), 'invoice' => 'INV-CWH-008', 'location' => 'Cebu City']);
    $lUr2   = seed_receipt($user, $cat['Travel'], 'Cebu Pacific Air Advance', 4000.00, 'pending', ['date' => $now->copy()->subDays(8)->toDateString(), 'invoice' => 'INV-CPA-009', 'location' => 'Cebu City']);
    $lOv1   = seed_receipt($user, $cat['Meals'], 'Baguio Food Court', 2000.00, 'pending', ['date' => $now->copy()->subDays(14)->toDateString(), 'invoice' => 'INV-BFC-010', 'location' => 'Baguio']);
    $lOv2   = seed_receipt($user, $cat['Transportation'], 'Victory Liner', 2000.00, 'pending', ['date' => $now->copy()->subDays(13)->toDateString(), 'invoice' => 'INV-VLN-011', 'location' => 'Baguio']);
    $lShort = seed_receipt($user, $cat['Supplies'], 'Office Depot Phil', 4500.00, 'approved', ['date' => $now->copy()->subDays(16)->toDateString(), 'invoice' => 'INV-ODP-012', 'location' => 'Makati']);
    $lFull  = seed_receipt($user, $cat['Accommodation'], 'Rizal Park Hotel', 10000.00, 'approved', ['date' => $now->copy()->subDays(28)->toDateString(), 'invoice' => 'INV-RPH-013', 'location' => 'Manila']);
    $lSettled = seed_receipt($user, $cat['Travel'], 'PAL Domestic', 7500.00, 'approved', ['date' => $now->copy()->subDays(55)->toDateString(), 'invoice' => 'INV-PAL-014', 'location' => 'Davao']);
    $lLegacy = seed_receipt($user, $cat['Accommodation'], 'Legacy Advance Hotel', 4000.00, 'pending', ['date' => $now->copy()->subDays(20)->toDateString(), 'invoice' => 'INV-LAH-015', 'location' => 'Makati']);
    $lRej   = seed_receipt($user, $cat['Others'], 'Unverified Vendor', 3000.00, 'rejected', ['date' => $now->copy()->subDays(7)->toDateString(), 'invoice' => 'INV-UNV-016', 'rejection_code' => 'blurry', 'rejection_reason' => 'Receipt image quality too low for OCR verification.']);

    // Pool C - standalone dashboard expenses
    $rFree    = seed_receipt($user, $cat['Supplies'], 'SM Appliances', 1240.00, 'processed', ['date' => $now->copy()->subDays(3)->toDateString(), 'invoice' => 'INV-SMA-017', 'location' => 'Quezon City']);
    $rOCR     = seed_receipt($user, $cat['Meals'], 'Draft Upload Cafe', 150.00, 'processing', ['date' => $now->copy()->subDays(1)->toDateString(), 'invoice' => 'INV-DUC-018']);
    $rFlagged = seed_receipt($user, $cat['Travel'], 'Blurry Taxi Receipt', 780.00, 'flagged', ['date' => $now->copy()->subDays(2)->toDateString(), 'invoice' => 'INV-BTR-019', 'confidence' => 62.00, 'flagged' => true, 'vat_classification' => 'non-vat', 'vat' => 0.00]);
    $rFailed  = seed_receipt($user, $cat['Others'], 'Broken Upload', 0.00, 'failed', ['date' => $now->copy()->subDays(5)->toDateString(), 'invoice' => 'INV-BUP-020']);

    // ------------------------------------------------------------------
    // 2. REIMBURSEMENTS
    // ------------------------------------------------------------------
    seed_reimbursement($user, collect([$rPending]), 'Client meeting meal reimbursement', $cat['Meals'], 275.00, 'pending', ['date' => $now->copy()->subDays(11)->toDateString()]);
    seed_reimbursement($user, collect([$rApproved]), 'Team offsite accommodation claim', $cat['Accommodation'], 2100.00, 'approved', ['date' => $now->copy()->subDays(17)->toDateString()]);
    seed_reimbursement($user, collect([$rRejected]), 'Office supplies overclaim', $cat['Supplies'], 900.00, 'rejected', ['date' => $now->copy()->subDays(24)->toDateString(), 'rejection_comment' => 'Duplicate with prior claim (INV-NBS-003).', 'admin_notes' => 'Duplicate with prior claim.']);
    seed_reimbursement($user, collect([$rGranted1, $rGranted2]), 'Field service travel reimbursement', $cat['Travel'], 3970.50, 'granted', ['date' => $now->copy()->subDays(29)->toDateString(), 'source_system' => 'prs', 'source_submission_id' => 'PRS-' . $uid . '-001', 'is_request' => true]);
    seed_reimbursement($user, collect([$rSubmitted]), 'PRS imported reimbursement request', $cat['Travel'], 1100.00, 'submitted', ['date' => $now->copy()->subDays(5)->toDateString(), 'source_system' => 'prs', 'source_submission_id' => 'PRS-' . $uid . '-002', 'is_request' => true]);
    seed_reimbursement($user, collect([$rClaimProc]), 'Team lunch reimbursement in flight', $cat['Meals'], 450.00, 'processing', ['date' => $now->copy()->subDays(3)->toDateString()]);

'@
$payloadPart3 = @'
    // ------------------------------------------------------------------
    // 3. CASH ADVANCES + LIQUIDATIONS (fully linked)
    // ------------------------------------------------------------------

    // (1) pending
    seed_cash_advance($user, $approver, [
        'purpose' => 'Client entertainment budget for Q3',
        'amount' => 3200.00,
        'status' => 'pending',
        'disb_date' => $now->copy()->addDays(3)->toDateString(),
        'liq_date' => $now->copy()->addDays(17)->toDateString(),
        'submitted_at' => $now->copy()->subDays(1)->toDateTimeString(),
        'history' => [[null, 'pending', $uid, $now->copy()->subDays(1)->toDateTimeString()]],
        'actions' => [],
    ]);

    // (2) approved
    seed_cash_advance($user, $approver, [
        'purpose' => 'Regional sales conference',
        'amount' => 6500.00,
        'status' => 'approved',
        'disb_date' => $now->copy()->addDays(1)->toDateString(),
        'liq_date' => $now->copy()->addDays(9)->toDateString(),
        'submitted_at' => $now->copy()->subDays(4)->toDateTimeString(),
        'history' => [
            [null, 'pending', $uid, $now->copy()->subDays(4)->toDateTimeString()],
            ['pending', 'approved', $approverId, $now->copy()->subDays(2)->toDateTimeString()],
        ],
        'actions' => [
            ['approver_id' => $approverId, 'action' => 'approved', 'comment' => 'Approved within threshold.', 'at' => $now->copy()->subDays(2)->toDateTimeString()],
        ],
    ]);

    // (3) rejected
    seed_cash_advance($user, $approver, [
        'purpose' => 'New equipment purchase',
        'amount' => 1800.00,
        'status' => 'rejected',
        'disb_date' => $now->copy()->subDays(12)->toDateString(),
        'liq_date' => $now->copy()->addDays(5)->toDateString(),
        'submitted_at' => $now->copy()->subDays(20)->toDateTimeString(),
        'history' => [
            [null, 'pending', $uid, $now->copy()->subDays(20)->toDateTimeString()],
            ['pending', 'rejected', $approverId, $now->copy()->subDays(18)->toDateTimeString()],
        ],
        'actions' => [
            ['approver_id' => $approverId, 'action' => 'rejected', 'comment' => 'Insufficient justification for the requested amount.', 'at' => $now->copy()->subDays(18)->toDateTimeString()],
        ],
    ]);

    // (4) disbursed (with a legacy approved liquidation)
    $ca4 = seed_cash_advance($user, $approver, [
        'purpose' => 'Trade show participation',
        'amount' => 4000.00,
        'outstanding' => 4000.00,
        'status' => 'disbursed',
        'disb_date' => $now->copy()->subDays(12)->toDateString(),
        'liq_date' => $now->copy()->addDays(5)->toDateString(),
        'submitted_at' => $now->copy()->subDays(25)->toDateTimeString(),
        'history' => [
            [null, 'pending', $uid, $now->copy()->subDays(25)->toDateTimeString()],
            ['pending', 'approved', $approverId, $now->copy()->subDays(23)->toDateTimeString()],
            ['approved', 'disbursed', $approverId, $now->copy()->subDays(12)->toDateTimeString()],
        ],
        'actions' => [
            ['approver_id' => $approverId, 'action' => 'approved', 'comment' => 'Approved.', 'at' => $now->copy()->subDays(23)->toDateTimeString()],
        ],
        'disbursement' => ['by' => $approverId, 'date' => $now->copy()->subDays(12)->toDateString(), 'channel' => 'Bank Transfer', 'reference' => 'REF-DSB-401'],
        'document' => ['file_name' => 'trade-show-advance.png'],
    ]);
    seed_liquidation($user, $ca4, 'approved', [$lLegacy->id], 4000.00, ['outstanding_balance' => 4000.00]);

    // (5) signed
    seed_cash_advance($user, $approver, [
        'purpose' => 'Field equipment maintenance run',
        'amount' => 2500.00,
        'outstanding' => 2500.00,
        'status' => 'signed',
        'disb_date' => $now->copy()->subDays(20)->toDateString(),
        'liq_date' => $now->copy()->addDays(2)->toDateString(),
        'signature' => 'SEED-SIG-' . $uid,
        'acknowledged_at' => $now->copy()->subDays(19)->toDateTimeString(),
        'submitted_at' => $now->copy()->subDays(30)->toDateTimeString(),
        'history' => [
            [null, 'pending', $uid, $now->copy()->subDays(30)->toDateTimeString()],
            ['pending', 'approved', $approverId, $now->copy()->subDays(28)->toDateTimeString()],
            ['approved', 'disbursed', $approverId, $now->copy()->subDays(20)->toDateTimeString()],
            ['disbursed', 'signed', $uid, $now->copy()->subDays(19)->toDateTimeString()],
        ],
        'actions' => [
            ['approver_id' => $approverId, 'action' => 'approved', 'comment' => 'Approved.', 'at' => $now->copy()->subDays(28)->toDateTimeString()],
        ],
        'disbursement' => ['by' => $approverId, 'date' => $now->copy()->subDays(20)->toDateString(), 'channel' => 'GCash', 'reference' => 'REF-GCAS-502'],
        'document' => ['file_name' => 'maintenance-run-advance.png'],
    ]);

    // (6) under-review (pending liquidation; past due date, UI renders overdue)
    $ca6 = seed_cash_advance($user, $approver, [
        'purpose' => 'Cebu site audit travel',
        'amount' => 8000.00,
        'outstanding' => 8000.00,
        'status' => 'under-review',
        'disb_date' => $now->copy()->subDays(30)->toDateString(),
        'liq_date' => $now->copy()->subDays(5)->toDateString(),
        'signature' => 'SEED-SIG-' . $uid,
        'acknowledged_at' => $now->copy()->subDays(29)->toDateTimeString(),
        'submitted_at' => $now->copy()->subDays(35)->toDateTimeString(),
        'history' => [
            [null, 'pending', $uid, $now->copy()->subDays(35)->toDateTimeString()],
            ['pending', 'approved', $approverId, $now->copy()->subDays(33)->toDateTimeString()],
            ['approved', 'disbursed', $approverId, $now->copy()->subDays(30)->toDateTimeString()],
            ['disbursed', 'signed', $uid, $now->copy()->subDays(29)->toDateTimeString()],
            ['signed', 'under-review', $uid, $now->copy()->subDays(2)->toDateTimeString()],
        ],
        'actions' => [
            ['approver_id' => $approverId, 'action' => 'approved', 'comment' => 'Approved.', 'at' => $now->copy()->subDays(33)->toDateTimeString()],
        ],
        'disbursement' => ['by' => $approverId, 'date' => $now->copy()->subDays(30)->toDateString(), 'channel' => 'Bank Transfer', 'reference' => 'REF-DSB-603'],
        'document' => ['file_name' => 'cebu-audit-advance.png'],
    ]);
    seed_liquidation($user, $ca6, 'pending', [$lUr1->id, $lUr2->id], 8000.00, ['outstanding_balance' => 8000.00]);

    // (7) liquidated (full payment, variance 0)
    $ca7 = seed_cash_advance($user, $approver, [
        'purpose' => 'Annual client gala sponsorship',
        'amount' => 10000.00,
        'outstanding' => 0.00,
        'status' => 'liquidated',
        'disb_date' => $now->copy()->subDays(45)->toDateString(),
        'liq_date' => $now->copy()->subDays(25)->toDateString(),
        'signature' => 'SEED-SIG-' . $uid,
        'acknowledged_at' => $now->copy()->subDays(44)->toDateTimeString(),
        'submitted_at' => $now->copy()->subDays(60)->toDateTimeString(),
        'history' => [
            [null, 'pending', $uid, $now->copy()->subDays(60)->toDateTimeString()],
            ['pending', 'approved', $approverId, $now->copy()->subDays(58)->toDateTimeString()],
            ['approved', 'disbursed', $approverId, $now->copy()->subDays(45)->toDateTimeString()],
            ['disbursed', 'signed', $uid, $now->copy()->subDays(44)->toDateTimeString()],
            ['signed', 'under-review', $uid, $now->copy()->subDays(25)->toDateTimeString()],
            ['under-review', 'liquidated', $approverId, $now->copy()->subDays(22)->toDateTimeString()],
        ],
        'actions' => [
            ['approver_id' => $approverId, 'action' => 'approved', 'comment' => 'Approved.', 'at' => $now->copy()->subDays(58)->toDateTimeString()],
        ],
        'disbursement' => ['by' => $approverId, 'date' => $now->copy()->subDays(45)->toDateString(), 'channel' => 'Bank Transfer', 'reference' => 'REF-DSB-704'],
        'document' => ['file_name' => 'gala-sponsorship-advance.png'],
    ]);
    seed_liquidation($user, $ca7, 'liquidated', [$lFull->id], 10000.00, ['outstanding_balance' => 10000.00]);

    // (8) overdue (penalties applied; late liquidation submitted as pending)
    $ca8 = seed_cash_advance($user, $approver, [
        'purpose' => 'Baguio team offsite',
        'amount' => 5000.00,
        'outstanding' => 5250.00, // 5000 + 5 penalty days x 50
        'status' => 'overdue',
        'disb_date' => $now->copy()->subDays(40)->toDateString(),
        'liq_date' => $now->copy()->subDays(10)->toDateString(),
        'signature' => 'SEED-SIG-' . $uid,
        'acknowledged_at' => $now->copy()->subDays(39)->toDateTimeString(),
        'submitted_at' => $now->copy()->subDays(45)->toDateTimeString(),
        'history' => [
            [null, 'pending', $uid, $now->copy()->subDays(45)->toDateTimeString()],
            ['pending', 'approved', $approverId, $now->copy()->subDays(43)->toDateTimeString()],
            ['approved', 'disbursed', $approverId, $now->copy()->subDays(40)->toDateTimeString()],
            ['disbursed', 'signed', $uid, $now->copy()->subDays(39)->toDateTimeString()],
            ['signed', 'overdue', $approverId, $now->copy()->subDays(9)->toDateTimeString()],
        ],
        'actions' => [
            ['approver_id' => $approverId, 'action' => 'approved', 'comment' => 'Approved.', 'at' => $now->copy()->subDays(43)->toDateTimeString()],
        ],
        'disbursement' => ['by' => $approverId, 'date' => $now->copy()->subDays(40)->toDateString(), 'channel' => 'GCash', 'reference' => 'REF-GCAS-805'],
        'document' => ['file_name' => 'baguio-offsite-advance.png'],
        'penalties' => [1 => 50.00, 2 => 50.00, 3 => 50.00, 4 => 50.00, 5 => 50.00],
    ]);
    seed_liquidation($user, $ca8, 'pending', [$lOv1->id, $lOv2->id], 4000.00, [
        'outstanding_balance' => 5250.00,
        'shortfall_explanation' => 'Liquidation submitted late; remaining balance subject to payroll deduction and daily penalties.',
    ]);

    // (9) settled (terminal: liquidation liquidated, outstanding 0)
    $ca9 = seed_cash_advance($user, $approver, [
        'purpose' => 'Mindanao site deployment',
        'amount' => 7500.00,
        'outstanding' => 0.00,
        'status' => 'settled',
        'disb_date' => $now->copy()->subDays(90)->toDateString(),
        'liq_date' => $now->copy()->subDays(60)->toDateString(),
        'signature' => 'SEED-SIG-' . $uid,
        'acknowledged_at' => $now->copy()->subDays(89)->toDateTimeString(),
        'submitted_at' => $now->copy()->subDays(95)->toDateTimeString(),
        'history' => [
            [null, 'pending', $uid, $now->copy()->subDays(95)->toDateTimeString()],
            ['pending', 'approved', $approverId, $now->copy()->subDays(93)->toDateTimeString()],
            ['approved', 'disbursed', $approverId, $now->copy()->subDays(90)->toDateTimeString()],
            ['disbursed', 'signed', $uid, $now->copy()->subDays(89)->toDateTimeString()],
            ['signed', 'under-review', $uid, $now->copy()->subDays(60)->toDateTimeString()],
            ['under-review', 'settled', $approverId, $now->copy()->subDays(55)->toDateTimeString()],
        ],
        'actions' => [
            ['approver_id' => $approverId, 'action' => 'approved', 'comment' => 'Approved.', 'at' => $now->copy()->subDays(93)->toDateTimeString()],
        ],
        'disbursement' => ['by' => $approverId, 'date' => $now->copy()->subDays(90)->toDateString(), 'channel' => 'Bank Transfer', 'reference' => 'REF-DSB-905'],
        'document' => ['file_name' => 'mindanao-deployment-advance.png'],
    ]);
    seed_liquidation($user, $ca9, 'liquidated', [$lSettled->id], 7500.00, [
        'outstanding_balance' => 7500.00,
        'admin_note' => 'Advance fully liquidated and settled. No outstanding balance.',
    ]);

    // (10) incomplete (partial liquidation -> shortfall)
    $ca10 = seed_cash_advance($user, $approver, [
        'purpose' => 'Quezon City supplier meetings',
        'amount' => 6000.00,
        'outstanding' => 1500.00, // 6000 - 4500 approved expenses
        'status' => 'incomplete',
        'disb_date' => $now->copy()->subDays(50)->toDateString(),
        'liq_date' => $now->copy()->subDays(15)->toDateString(),
        'signature' => 'SEED-SIG-' . $uid,
        'acknowledged_at' => $now->copy()->subDays(49)->toDateTimeString(),
        'submitted_at' => $now->copy()->subDays(55)->toDateTimeString(),
        'history' => [
            [null, 'pending', $uid, $now->copy()->subDays(55)->toDateTimeString()],
            ['pending', 'approved', $approverId, $now->copy()->subDays(53)->toDateTimeString()],
            ['approved', 'disbursed', $approverId, $now->copy()->subDays(50)->toDateTimeString()],
            ['disbursed', 'signed', $uid, $now->copy()->subDays(49)->toDateTimeString()],
            ['signed', 'under-review', $uid, $now->copy()->subDays(15)->toDateTimeString()],
            ['under-review', 'incomplete', $approverId, $now->copy()->subDays(12)->toDateTimeString()],
        ],
        'actions' => [
            ['approver_id' => $approverId, 'action' => 'approved', 'comment' => 'Approved.', 'at' => $now->copy()->subDays(53)->toDateTimeString()],
        ],
        'disbursement' => ['by' => $approverId, 'date' => $now->copy()->subDays(50)->toDateString(), 'channel' => 'Bank Transfer', 'reference' => 'REF-DSB-106'],
        'document' => ['file_name' => 'qc-supplier-advance.png'],
    ]);
    seed_liquidation($user, $ca10, 'liquidated', [$lShort->id], 4500.00, [
        'outstanding_balance' => 6000.00,
        'shortfall_explanation' => 'Unused funds returned to petty cash; remaining balance will be covered by payroll deduction.',
    ]);

    // (11) incomplete (rejected liquidation round)
    $ca11 = seed_cash_advance($user, $approver, [
        'purpose' => 'Manila training week',
        'amount' => 3000.00,
        'outstanding' => 3000.00,
        'status' => 'incomplete',
        'disb_date' => $now->copy()->subDays(25)->toDateString(),
        'liq_date' => $now->copy()->subDays(5)->toDateString(),
        'signature' => 'SEED-SIG-' . $uid,
        'acknowledged_at' => $now->copy()->subDays(24)->toDateTimeString(),
        'submitted_at' => $now->copy()->subDays(30)->toDateTimeString(),
        'history' => [
            [null, 'pending', $uid, $now->copy()->subDays(30)->toDateTimeString()],
            ['pending', 'approved', $approverId, $now->copy()->subDays(28)->toDateTimeString()],
            ['approved', 'disbursed', $approverId, $now->copy()->subDays(25)->toDateTimeString()],
            ['disbursed', 'signed', $uid, $now->copy()->subDays(24)->toDateTimeString()],
            ['signed', 'under-review', $uid, $now->copy()->subDays(5)->toDateTimeString()],
            ['under-review', 'incomplete', $approverId, $now->copy()->subDays(3)->toDateTimeString()],
        ],
        'actions' => [
            ['approver_id' => $approverId, 'action' => 'approved', 'comment' => 'Approved.', 'at' => $now->copy()->subDays(28)->toDateTimeString()],
        ],
        'disbursement' => ['by' => $approverId, 'date' => $now->copy()->subDays(25)->toDateString(), 'channel' => 'GCash', 'reference' => 'REF-GCAS-117'],
        'document' => ['file_name' => 'manila-training-advance.png'],
    ]);
    seed_liquidation($user, $ca11, 'rejected', [$lRej->id], 3000.00, [
        'outstanding_balance' => 3000.00,
        'admin_note' => 'Receipts are not valid for the claimed amounts. Please resubmit with valid receipts.',
    ]);
}
'@
$payloadPart4 = @'
function seed_reduced_user($user, $cat) {
    $uid = $user->id;
    $now = Carbon\Carbon::now();
    $approver = seed_pick_actor($uid);
    if (!$approver) {
        throw new Exception('No approver/admin actor available for user ' . $uid);
    }
    $approverId = $approver->id;

    $rProcessed = seed_receipt($user, $cat['Meals'], 'Cafe de Manila', 500.00, 'processed', ['date' => $now->copy()->subDays(2)->toDateString(), 'invoice' => 'INV-CDM-021']);
    $rPending = seed_receipt($user, $cat['Travel'], 'Bus Transit Corp', 750.00, 'pending', ['date' => $now->copy()->subDays(6)->toDateString(), 'invoice' => 'INV-BTC-022']);
    $rApproved = seed_receipt($user, $cat['Accommodation'], 'Hotel Sogo Manila', 1250.00, 'approved', ['date' => $now->copy()->subDays(11)->toDateString(), 'invoice' => 'INV-HSM-023']);
    $rLiq = seed_receipt($user, $cat['Travel'], 'Airline Booking Desk', 3000.00, 'pending', ['date' => $now->copy()->subDays(4)->toDateString(), 'invoice' => 'INV-ABD-024']);

    seed_reimbursement($user, collect([$rPending]), 'Official travel claim pending', $cat['Travel'], 750.00, 'pending', ['date' => $now->copy()->subDays(5)->toDateString()]);
    seed_reimbursement($user, collect([$rApproved]), 'Official travel claim approved', $cat['Accommodation'], 1250.00, 'approved', ['date' => $now->copy()->subDays(10)->toDateString()]);

    $ca = seed_cash_advance($user, $approver, [
        'purpose' => 'Provincial coordination trip',
        'amount' => 3000.00,
        'outstanding' => 3000.00,
        'status' => 'under-review',
        'disb_date' => $now->copy()->subDays(15)->toDateString(),
        'liq_date' => $now->copy()->subDays(2)->toDateString(),
        'signature' => 'SEED-SIG-' . $uid,
        'acknowledged_at' => $now->copy()->subDays(14)->toDateTimeString(),
        'submitted_at' => $now->copy()->subDays(18)->toDateTimeString(),
        'history' => [
            [null, 'pending', $uid, $now->copy()->subDays(18)->toDateTimeString()],
            ['pending', 'approved', $approverId, $now->copy()->subDays(16)->toDateTimeString()],
            ['approved', 'disbursed', $approverId, $now->copy()->subDays(15)->toDateTimeString()],
            ['disbursed', 'signed', $uid, $now->copy()->subDays(14)->toDateTimeString()],
            ['signed', 'under-review', $uid, $now->copy()->subDays(1)->toDateTimeString()],
        ],
        'actions' => [
            ['approver_id' => $approverId, 'action' => 'approved', 'comment' => 'Approved.', 'at' => $now->copy()->subDays(16)->toDateTimeString()],
        ],
        'disbursement' => ['by' => $approverId, 'date' => $now->copy()->subDays(15)->toDateString(), 'channel' => 'Bank Transfer', 'reference' => 'REF-DSB-R01'],
        'document' => ['file_name' => 'provincial-coordination-advance.png'],
    ]);
    seed_liquidation($user, $ca, 'pending', [$rLiq->id], 3000.00, ['outstanding_balance' => 3000.00]);
}

function seed_main($doReset, $onlyReset) {
    $now = Carbon\Carbon::now();

    // preflight: required tables exist
    $requiredTables = ['users', 'expense_categories', 'receipts', 'reimbursements', 'reimbursement_receipts', 'receipt_items', 'cash_advances', 'cash_advance_status_history', 'cash_advance_approval_actions', 'cash_advance_disbursements', 'cash_advance_documents', 'liquidations', 'penalties', 'audit_logs'];
    $missing = [];
    foreach ($requiredTables as $t) {
        if (!Illuminate\Support\Facades\Schema::hasTable($t)) {
            $missing[] = $t;
        }
    }
    if ($missing) {
        return ['error' => 'Missing tables: ' . implode(', ', $missing) . '. Run "php artisan migrate" first.'];
    }

    if ($doReset) {
        seed_cleanup();
    }
    if ($onlyReset) {
        return ['reset_only' => true, 'cleaned_up' => true];
    }

    // ensure default expense categories (reuse existing seeder logic - A-09)
    App\Modules\Reimbursements\Models\ExpenseCategory::ensureDefaults();
    $cat = App\Modules\Reimbursements\Models\ExpenseCategory::pluck('id', 'name')->all();
    if (!isset($cat['Meals']) || !isset($cat['Travel']) || !isset($cat['Supplies']) || !isset($cat['Accommodation']) || !isset($cat['Transportation']) || !isset($cat['Others'])) {
        return ['error' => 'Default expense categories are missing after ensureDefaults().'];
    }

    // ---- user discovery ----
    $seedUsers = [];
    $addUser = function (App\Modules\Users\Models\User $u) use (&$seedUsers) {
        $seedUsers[$u->id] = $u;
    };

    $existing = App\Modules\Users\Models\User::all();
    foreach ($existing as $u) {
        $addUser($u);
    }

    // Fresh install: create the canonical demo account if the users table is empty.
    if (count($existing) === 0) {
        $addUser(App\Modules\Users\Models\User::firstOrCreate(['email' => 'employee@example.com'], ['name' => 'General Employee', 'role' => 'employee', 'grade' => 'L2', 'department' => 'OPERATIONS']));
    }

    // Ensure approver/admin actor accounts exist (needed as FK actors for
    // approval actions, disbursements, and audit trails). They are demo login
    // accounts and receive their own (reduced) request sets.
    if (!App\Modules\Users\Models\User::where('role', 'approver')->exists()) {
        $addUser(App\Modules\Users\Models\User::firstOrCreate(['email' => 'approver@example.com'], ['name' => 'General Approver', 'role' => 'approver', 'grade' => 'L4', 'department' => 'FINANCE']));
    }
    if (!App\Modules\Users\Models\User::where('role', 'admin')->exists()) {
        $addUser(App\Modules\Users\Models\User::firstOrCreate(['email' => 'admin@example.com'], ['name' => 'Accounting Admin', 'role' => 'admin', 'grade' => 'L5', 'department' => 'ACCOUNTING']));
    }

    // ---- seed per user ----
    $full = 0;
    $reduced = 0;
    foreach ($seedUsers as $user) {
        if ($user->role === 'employee') {
            seed_full_user($user, $cat);
            $full++;
        } else {
            seed_reduced_user($user, $cat);
            $reduced++;
        }
    }

    // ---- summary ----
    $markerCount = function ($entityType) {
        return App\Modules\AuditLogs\Models\AuditLog::where('entity_type', $entityType)
            ->where('action_type', 'like', 'SEED_%')
            ->count();
    };

    return [
        'users_seeded_full' => $full,
        'users_seeded_reduced' => $reduced,
        'users' => array_values(array_map(function ($u) { return $u->email; }, $seedUsers)),
        'receipts' => $markerCount('receipt'),
        'reimbursements' => $markerCount('reimbursement'),
        'cash_advances' => $markerCount('cash_advance'),
        'liquidations' => $markerCount('liquidation'),
        'penalties' => $markerCount('penalty'),
        'audit_logs' => App\Modules\AuditLogs\Models\AuditLog::where('action_type', 'like', 'SEED_%')->count(),
        'placeholder_image' => 'apps/web/public/mock_receipt.png (served at /mock_receipt.png)',
    ];
}

// ================== main ==================
echo 'SEED_RESULT=' . json_encode(seed_main($SEED_RESET, $SEED_ONLY_RESET)) . PHP_EOL;
'@
# ---- assemble payload, compose flags line, write temp file ---------------
$payload = $payloadPart1 + $payloadPart2 + $payloadPart3 + $payloadPart4

$flagsLine = '$SEED_RESET = ' + $(if ($doReset) { 'true' } else { 'false' }) + '; $SEED_ONLY_RESET = ' + $(if ($doOnly) { 'true' } else { 'false' }) + ';'
$fullPayload = '<?php' + "`r`n" + $flagsLine + "`r`n" + $payload
[System.IO.File]::WriteAllText($payloadFile, $fullPayload, $utf8NoBom)

try {
    Write-Host ''
    Write-Host '============================================================'
    Write-Host ' SERMS demo data seeder'
    Write-Host " Mode: $(if ($doOnly) { 'ONLY RESET (delete seeded rows)' } elseif ($doReset) { 'RESET + RESEED' } else { 'APPEND (no reset)' })"
    Write-Host " Executor: $(if ($useDocker) { 'docker compose exec php' } else { 'host php' })"
    Write-Host '============================================================'
    Write-Host ''

    $hostPayloadPath = $payloadFile -replace '\\', '/'
    $containerPayloadPath = '/var/www/scripts/' + $payloadFileName

    if ($useDocker) {
        $executeArg = "--execute=require '$containerPayloadPath';"
        $output = & docker compose exec -T php php artisan tinker $executeArg 2>&1
    } else {
        $executeArg = "--execute=require '$hostPayloadPath';"
        $output = & php artisan tinker $executeArg 2>&1
    }
    $exitCode = $LASTEXITCODE

    $output | ForEach-Object { Write-Output (($_) | Out-String).TrimEnd() }
    Write-Host ''
    Write-Host "Tinker exit code: $exitCode"
    exit $exitCode
} finally {
    if (Test-Path $payloadFile) { Remove-Item $payloadFile -Force -ErrorAction SilentlyContinue }
}
