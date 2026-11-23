# Request View Modals — Audit Trail Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified, collapsible Audit Trail section to all 5 request and payout view modals (Reimbursements, Payouts, Cash Advances, Liquidation Admin Review, and Liquidation Employee Settlement/View) backed by full `AuditLogService::log()` coverage and batch-hydrated `audit_trail` payloads.

**Architecture:** We extend `AuditLog` with an `actor` relation and enhance `AuditLogService` with missing transactional mutation logs across `ReimbursementService`, `CashAdvanceService`, and `LiquidationController`, plus batch-enrichment methods (`enrichReimbursements`, `enrichCashAdvances`, `enrichLiquidation`) that merge `audit_logs` with historical fallbacks (`statusHistory`, `approvalActions`, `disbursement`, `payout`, `penalties`), compute sanitized field diffs, and mask `ip_address` for non-admins. On the frontend, a single reusable `<BaseAuditTrail />` component (`A-09` compliant) with Medium Date + Time formatting (`formatDateTime`) is integrated into all 5 modals.

**Tech Stack:** Laravel 13 (PHP 8.3), PHPUnit, Vue 3 (Composition API), Pinia, Tailwind CSS 3.4, Lucide Vue Next, Vitest.

**Spec:** [`docs/superpowers/specs/2026-10-22-request-audit-trail-design.md`](file:///c:/Projects/smart-expense-management-system/docs/superpowers/specs/2026-10-22-request-audit-trail-design.md)

## Global Constraints

- **Canonical Governance (`AGENTS.md`):** Never run `UPDATE` or `DELETE` on `audit_logs` or `penalties` tables.
- **Reusability (`A-09`):** One reusable `<BaseAuditTrail />` component in `apps/web/src/components/base/BaseAuditTrail.vue` — zero duplicate timeline markup across modals.
- **Medium Date Formatting Standard:** All human-facing dates/timestamps must use Medium Date Format (e.g., `Oct 22, 2026, 2:30 PM` via `formatDateTime`).
- **Clean Surfaces (`DSD.md`):** No colored top borders (`border-t-*` with colors) on cards, callouts, or panels.
- **Privacy:** `ip_address` in `audit_trail` entries must only be exposed to users with management permissions (`canManage` / `auth.isAdmin`).
- **Git Operations:** Do NOT run `git commit` or push without explicit user permission.

---

### Task 1: Backend `AuditLog` Actor Relation & `AuditLogService` Trail Builder

**Files:**
- Modify: `apps/api/app/Modules/AuditLogs/Models/AuditLog.php`
- Modify: `apps/api/app/Modules/AuditLogs/Services/AuditLogService.php`
- Test: `apps/api/tests/Feature/RequestAuditTrailTest.php`

**Interfaces:**
- Produces:
  - `AuditLog::actor(): BelongsTo`
  - `AuditLogService::enrichReimbursements($reimbursements, bool $canManage): void`
  - `AuditLogService::enrichReimbursement(Reimbursement $reimbursement, bool $canManage): Reimbursement`
  - `AuditLogService::enrichCashAdvances($advances, bool $canManage): void`
  - `AuditLogService::enrichCashAdvance(CashAdvance $advance, bool $canManage): CashAdvance`
  - `AuditLogService::enrichLiquidations($liquidations, bool $canManage): void`
  - `AuditLogService::enrichLiquidation(Liquidation $liquidation, bool $canManage): Liquidation`

- [ ] **Step 1: Write the failing test in `apps/api/tests/Feature/RequestAuditTrailTest.php`**

```php
<?php

namespace Tests\Feature;

use App\Modules\AuditLogs\Models\AuditLog;
use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RequestAuditTrailTest extends TestCase
{
    use RefreshDatabase;

    public function test_audit_log_service_builds_sanitized_reimbursement_trail_and_masks_ip_for_employee(): void
    {
        $employee = User::factory()->create(['name' => 'Juan Dela Cruz', 'role' => 'employee']);
        $admin = User::factory()->create(['name' => 'Alex Reyes', 'role' => 'admin']);

        $reimbursement = Reimbursement::create([
            'user_id' => $employee->id,
            'description' => 'Field Client Lunch',
            'amount' => 1200.00,
            'date' => '2026-10-20',
            'cutoff_period' => '2026-10-B',
            'status' => 'revise',
            'revision_count' => 1,
            'admin_notes' => 'Please attach itemized OR.',
            'submitted_by_name' => $employee->name,
        ]);

        AuditLogService::log(
            actorId: $employee->id,
            actorRole: 'employee',
            actionType: 'CLAIM_SUBMITTED',
            entityType: 'reimbursement',
            entityId: $reimbursement->id,
            beforeState: null,
            afterState: ['amount' => '1200.00', 'description' => 'Field Client Lunch'],
            ipAddress: '10.0.0.15'
        );

        AuditLogService::log(
            actorId: $admin->id,
            actorRole: 'admin',
            actionType: 'CLAIM_REVISED',
            entityType: 'reimbursement',
            entityId: $reimbursement->id,
            beforeState: ['status' => 'pending', 'amount' => '1200.00'],
            afterState: ['status' => 'revise', 'amount' => '1500.00', 'admin_notes' => 'Please attach itemized OR.'],
            ipAddress: '192.168.1.10'
        );

        $forAdmin = AuditLogService::enrichReimbursement($reimbursement->fresh(['user', 'payout']), true);
        $trailAdmin = $forAdmin->getAttribute('audit_trail');

        $this->assertCount(2, $trailAdmin);
        $this->assertSame('CLAIM_SUBMITTED', $trailAdmin[0]['action_type']);
        $this->assertSame('Juan Dela Cruz', $trailAdmin[0]['actor_name']);
        $this->assertSame('10.0.0.15', $trailAdmin[0]['ip_address']);

        $this->assertSame('CLAIM_REVISED', $trailAdmin[1]['action_type']);
        $this->assertSame('Alex Reyes', $trailAdmin[1]['actor_name']);
        $this->assertSame('Please attach itemized OR.', $trailAdmin[1]['comment']);
        $this->assertSame('192.168.1.10', $trailAdmin[1]['ip_address']);
        $this->assertNotEmpty($trailAdmin[1]['changes']);
        $this->assertSame('Amount', $trailAdmin[1]['changes'][0]['field']);

        $forEmployee = AuditLogService::enrichReimbursement($reimbursement->fresh(['user', 'payout']), false);
        $trailEmployee = $forEmployee->getAttribute('audit_trail');
        $this->assertNull($trailEmployee[0]['ip_address']);
        $this->assertNull($trailEmployee[1]['ip_address']);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=RequestAuditTrailTest` (in `apps/api`)
Expected: FAIL with `Call to undefined method App\Modules\AuditLogs\Services\AuditLogService::enrichReimbursement()`

- [ ] **Step 3: Implement `AuditLog::actor()` and `AuditLogService` enrichment & diff methods**

Update `apps/api/app/Modules/AuditLogs/Models/AuditLog.php` to add the `actor()` relationship:
```php
    public function actor()
    {
        return $this->belongsTo(\App\Modules\Users\Models\User::class, 'actor_id');
    }
```

Update `apps/api/app/Modules/AuditLogs/Services/AuditLogService.php` to add:
- Action metadata map (`ACTION_META`: maps `CLAIM_SUBMITTED`, `CLAIM_RESUBMITTED`, `CLAIM_UPDATED`, `CLAIM_APPROVED`, `CLAIM_REVISED`, `CLAIM_REJECTED`, `CLAIM_GRANTED`, `PAYOUT_ACKNOWLEDGED`, `CASH_ADVANCE_SUBMITTED`, `CASH_ADVANCE_RESUBMITTED`, `CASH_ADVANCE_UPDATED`, `CASH_ADVANCE_APPROVED`, `CASH_ADVANCE_REVISED`, `CASH_ADVANCE_REJECTED`, `CASH_ADVANCE_DISBURSED`, `CASH_ADVANCE_ACKNOWLEDGED`, `LIQUIDATION_SUBMITTED`, `LIQUIDATION_RESUBMITTED`, `LIQUIDATION_UPDATED`, `LIQUIDATION_APPROVED`, `LIQUIDATION_REVISED`, `LIQUIDATION_REJECTED`, `OVERDUE_PENALTY` to human-readable `label` and `tone`).
- `computeSanitizedDiff(?array $before, ?array $after): array` comparing whitelisted business fields (`amount`, `description`, `purpose`, `date`, `cutoff_period`, `expected_disbursement_date`, `expected_liquidation_date`, `total_expense_amount`, `outstanding_balance`, `shortfall_explanation`, `user_comment`, `payout_method`) while ignoring `signature`, `granter_signature`, `employee_signature`, `updated_at`, `created_at`.
- Batch enrichment methods `enrichReimbursements`, `enrichReimbursement`, `enrichCashAdvances`, `enrichCashAdvance`, `enrichLiquidations`, `enrichLiquidation` that batch-fetch `AuditLog::with('actor')`, synthesize fallback baseline events when older/seeded records lack explicit `audit_logs` rows, deduplicate, and strip `ip_address` when `!$canManage`.

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=RequestAuditTrailTest` (in `apps/api`)
Expected: PASS

---

### Task 2: Complete `AuditLogService::log()` & Trail Hydration Across Reimbursements, Cash Advances & Liquidations

**Files:**
- Modify: `apps/api/app/Modules/Reimbursements/Services/ReimbursementService.php`
- Modify: `apps/api/app/Modules/CashAdvances/Services/CashAdvanceService.php`
- Modify: `apps/api/app/Modules/CashAdvances/Http/Controllers/CashAdvanceController.php`
- Modify: `apps/api/app/Modules/Liquidations/Http/Controllers/LiquidationController.php`
- Test: `apps/api/tests/Feature/RequestAuditTrailTest.php`

**Interfaces:**
- Consumes: `AuditLogService::log()`, `AuditLogService::enrichReimbursements()`, `AuditLogService::enrichReimbursement()`, `AuditLogService::enrichCashAdvances()`, `AuditLogService::enrichCashAdvance()`, `AuditLogService::enrichLiquidations()`, `AuditLogService::enrichLiquidation()`
- Produces: `audit_trail` array on all Reimbursement, CashAdvance, and Liquidation API responses (`GET` index, `GET` show, `POST`/`PATCH` mutation responses).

- [ ] **Step 1: Add feature tests in `apps/api/tests/Feature/RequestAuditTrailTest.php` for all 3 modules' endpoints and mutations**

Add test methods to `apps/api/tests/Feature/RequestAuditTrailTest.php`:
- `test_reimbursement_store_and_resubmit_record_audit_logs_and_return_audit_trail()`
- `test_cash_advance_and_liquidation_lifecycle_returns_unified_audit_trail()`

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=RequestAuditTrailTest` (in `apps/api`)
Expected: FAIL because `storeReimbursement`, `updateReimbursement`, `CashAdvanceService` methods, and `LiquidationController::update` do not yet log or enrich `audit_trail`.

- [ ] **Step 3: Add `AuditLogService::log()` and enrichment calls in Services and Controllers**

1. In `ReimbursementService.php`:
   - `storeReimbursement()`: Call `AuditLogService::log($user->id, $user->role ?? 'employee', 'CLAIM_SUBMITTED', 'reimbursement', $reimbursement->id, null, $reimbursement->toArray())`.
   - `updateReimbursement()`: Capture `$beforeState = $reimbursement->toArray()`, perform update, and call `AuditLogService::log($user->id, $user->role ?? ($canManage ? 'admin' : 'employee'), $wasRevise ? 'CLAIM_RESUBMITTED' : 'CLAIM_UPDATED', 'reimbursement', $reimbursement->id, $beforeState, $reimbursement->fresh()->toArray())`.
   - `listReimbursements()`, `showReimbursement()`, `approveReimbursement()`, `rejectReimbursement()`, `grantReimbursement()`, `acknowledgePayout()`: Call `AuditLogService::enrichReimbursements()` / `AuditLogService::enrichReimbursement()` before returning.
2. In `CashAdvanceService.php`:
   - `createAdvance()`: Log `CASH_ADVANCE_SUBMITTED`.
   - `approveAdvance()`: Log `CASH_ADVANCE_APPROVED` with `comment` in `after_state['comment']`.
   - `rejectAdvance()`: Log `CASH_ADVANCE_REJECTED` (if terminal) or `CASH_ADVANCE_REVISED` with `comment` in `after_state['comment']`.
   - `disburseAdvance()`: Log `CASH_ADVANCE_DISBURSED` with `channel` and `reference` in `after_state`.
   - `acknowledgeAdvance()`: Log `CASH_ADVANCE_ACKNOWLEDGED`.
   - `updateAdvance()`: Log `CASH_ADVANCE_RESUBMITTED` (if `$oldStatus === 'revise'`) or `CASH_ADVANCE_UPDATED` with `$beforeState` and `$afterState`.
3. In `CashAdvanceController.php`:
   - In `index()`: Call `AuditLogService::enrichCashAdvances($advances, $user->can('serms.cash_advances.manage'))`.
   - In `enrichAdvance()`: Ensure single-record calls (`show`, `store`, `approve`, `reject`, `disburse`, `acknowledge`, `update`) also enrich `audit_trail` via `AuditLogService::enrichCashAdvance($advance, request()->user()?->can('serms.cash_advances.manage') ?? false)`.
4. In `LiquidationController.php`:
   - In `update()`: Capture `$beforeState = $liquidation->toArray()` and `$wasRevise = $liquidation->status === 'revise'`, then call `AuditLogService::log($user->id, $user->role ?? 'employee', $wasRevise ? 'LIQUIDATION_RESUBMITTED' : 'LIQUIDATION_UPDATED', 'liquidation', $liquidation->id, $beforeState, $liquidation->fresh()->toArray(), $request->ip())`.
   - In `hydrateLiquidation()`: Call `AuditLogService::enrichLiquidation($liq, request()->user()?->can('serms.liquidations.manage') ?? false)`.

- [ ] **Step 4: Run backend tests to verify all pass**

Run: `php artisan test --filter=RequestAuditTrailTest` (in `apps/api`)
Expected: PASS

---

### Task 3: Frontend `formatDateTime` Helper & Reusable `<BaseAuditTrail />` Component

**Files:**
- Modify: `apps/web/src/utils/formatters.js`
- Create: `apps/web/src/components/base/BaseAuditTrail.vue`
- Create: `apps/web/src/components/base/BaseAuditTrail.test.js`

**Interfaces:**
- Produces:
  - `formatDateTime(dateStr)` in `apps/web/src/utils/formatters.js` -> e.g. `"Oct 22, 2026, 2:30 PM"`
  - `BaseAuditTrail.vue` with props: `entries: Array`, `isAdmin: Boolean`, `showDomainBadge: Boolean`, `initialVisibleCount: Number`, `defaultExpanded: Boolean`

- [ ] **Step 1: Write the failing Vitest unit test in `apps/web/src/components/base/BaseAuditTrail.test.js`**

```javascript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BaseAuditTrail from "./BaseAuditTrail.vue";
import { formatDateTime } from "@/utils/formatters";

const SAMPLE_ENTRIES = [
  {
    id: "log-1",
    domain: "cash_advance",
    domain_label: "Cash Advance",
    action_type: "CASH_ADVANCE_SUBMITTED",
    label: "Submitted",
    tone: "info",
    actor_name: "Maria Cruz",
    actor_role: "Employee",
    ip_address: "10.0.0.12",
    comment: "Initial travel request",
    changes: [],
    created_at: "2026-10-20T08:00:00Z",
  },
  {
    id: "log-2",
    domain: "cash_advance",
    domain_label: "Cash Advance",
    action_type: "CASH_ADVANCE_REVISED",
    label: "Revision Requested (Attempt 1/3)",
    tone: "warning",
    actor_name: "Alex Reyes",
    actor_role: "Finance Manager",
    ip_address: "192.168.1.10",
    comment: "Please update meal allowance breakdown.",
    changes: [],
    created_at: "2026-10-21T10:30:00Z",
  },
  {
    id: "log-3",
    domain: "cash_advance",
    domain_label: "Cash Advance",
    action_type: "CASH_ADVANCE_RESUBMITTED",
    label: "Resubmitted",
    tone: "info",
    actor_name: "Maria Cruz",
    actor_role: "Employee",
    ip_address: "10.0.0.12",
    comment: null,
    changes: [
      { field: "Amount", before: "₱5,000.00", after: "₱4,500.00" },
    ],
    created_at: "2026-10-22T14:15:00Z",
  },
];

describe("BaseAuditTrail", () => {
  it("formats date-time in Medium Date Format", () => {
    const formatted = formatDateTime("2026-10-22T14:15:00Z");
    expect(formatted).toContain("Oct");
    expect(formatted).toContain("2026");
  });

  it("renders entries in Latest First order by default and toggles to Oldest First", async () => {
    const wrapper = mount(BaseAuditTrail, {
      props: { entries: SAMPLE_ENTRIES, isAdmin: true, showDomainBadge: true },
    });

    const items = wrapper.findAll("[data-testid='audit-trail-item']");
    expect(items).toHaveLength(3);
    expect(items[0].text()).toContain("Resubmitted");
    expect(items[2].text()).toContain("Submitted");

    await wrapper.find("[data-testid='audit-trail-sort-toggle']").trigger("click");
    const reordered = wrapper.findAll("[data-testid='audit-trail-item']");
    expect(reordered[0].text()).toContain("Submitted");
    expect(reordered[2].text()).toContain("Resubmitted");
  });

  it("shows IP address only when isAdmin is true", () => {
    const adminWrapper = mount(BaseAuditTrail, {
      props: { entries: SAMPLE_ENTRIES, isAdmin: true },
    });
    expect(adminWrapper.text()).toContain("192.168.1.10");

    const employeeWrapper = mount(BaseAuditTrail, {
      props: { entries: SAMPLE_ENTRIES, isAdmin: false },
    });
    expect(employeeWrapper.text()).not.toContain("192.168.1.10");
  });

  it("toggles field changes diff table when View Changes is clicked", async () => {
    const wrapper = mount(BaseAuditTrail, {
      props: { entries: SAMPLE_ENTRIES, isAdmin: false },
    });

    expect(wrapper.text()).not.toContain("₱5,000.00");
    await wrapper.find("[data-testid='audit-trail-diff-toggle']").trigger("click");
    expect(wrapper.text()).toContain("₱5,000.00");
    expect(wrapper.text()).toContain("₱4,500.00");
  });
});
```

- [ ] **Step 2: Run Vitest to verify it fails**

Run: `npx vitest run src/components/base/BaseAuditTrail.test.js` (in `apps/web`)
Expected: FAIL with module not found `BaseAuditTrail.vue`

- [ ] **Step 3: Implement `formatDateTime` in `apps/web/src/utils/formatters.js` and create `apps/web/src/components/base/BaseAuditTrail.vue`**

In `apps/web/src/utils/formatters.js`:
```javascript
export function formatDateTime(
  dateStr,
  options = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("en-US", options);
}
```

Create `apps/web/src/components/base/BaseAuditTrail.vue` implementing:
- Collapsible section header with `History` icon, `"Audit Trail"` title, count badge, sort-order toggle (`Latest First` / `Oldest First`), and collapse/expand chevron.
- Vertical timeline list with status-colored indicator dots, action label badge, optional domain pill (`Cash Advance` / `Liquidation`), actor name + role pill, `formatDateTime(entry.created_at)`, and Admin-only IP address badge (`v-if="isAdmin && entry.ip_address"`).
- Comment callout box (`v-if="entry.comment"`).
- Collapsible `"View Changes"` diff drawer (`v-if="entry.changes?.length"`).
- `"Show all X events"` / `"Show less"` toggle when `entries.length > initialVisibleCount`.

- [ ] **Step 4: Run Vitest to verify it passes**

Run: `npx vitest run src/components/base/BaseAuditTrail.test.js` (in `apps/web`)
Expected: PASS

---

### Task 4: Integrate `<BaseAuditTrail />` Into All 5 Request & Payout View Modals

**Files:**
- Modify: `apps/web/src/components/reimbursements/ReimbursementDetailsModal.vue`
- Modify: `apps/web/src/components/payouts/PayoutDetailsModal.vue`
- Modify: `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.vue`
- Modify: `apps/web/src/components/liquidations/LiquidationReviewModal.vue`
- Modify: `apps/web/src/components/liquidations/LiquidationSettlementForm.vue`
- Modify: `apps/web/src/views/LiquidationsView.vue`
- Test: `apps/web/src/components/reimbursements/ReimbursementDetailsModal.test.js`, `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.test.js`, `apps/web/src/components/liquidations/LiquidationReviewModal.test.js`

**Interfaces:**
- Consumes: `<BaseAuditTrail />` from `@/components/base/BaseAuditTrail.vue`

- [ ] **Step 1: Add component tests for `<BaseAuditTrail />` presence in `ReimbursementDetailsModal.test.js`, `CashAdvanceDetailsModal.test.js`, and `LiquidationReviewModal.test.js`**

Add test assertions verifying that when `audit_trail` entries are passed on `viewingRecord`, `record`, or `reviewingCase`, the `[data-testid="audit-trail-section"]` is rendered inside each modal.

- [ ] **Step 2: Run modal tests to verify they fail**

Run: `npx vitest run src/components/reimbursements/ReimbursementDetailsModal.test.js src/components/cash-advances/CashAdvanceDetailsModal.test.js src/components/liquidations/LiquidationReviewModal.test.js` (in `apps/web`)
Expected: FAIL because `<BaseAuditTrail />` is not yet mounted in the modals.

- [ ] **Step 3: Mount `<BaseAuditTrail />` in all 5 modals and pass `audit_trail` through `LiquidationsView.vue`**

1. **`ReimbursementDetailsModal.vue`:** Import `BaseAuditTrail` and place `<BaseAuditTrail :entries="viewingRecord.audit_trail || []" :is-admin="auth.isAdmin" />` at the bottom of the scrollable content area (after Receipts).
2. **`PayoutDetailsModal.vue`:** Import `BaseAuditTrail` and place `<BaseAuditTrail :entries="record.audit_trail || []" :is-admin="isAdmin" />` at the bottom of the scrollable body (after Employee's Acknowledgement section).
3. **`CashAdvanceDetailsModal.vue`:** Import `BaseAuditTrail`, compute `auditTrailEntries` merging `record.audit_trail` and `linkedLiquidation.audit_trail` (deduped by `id`), and place `<BaseAuditTrail :entries="auditTrailEntries" :is-admin="auth.isAdmin" :show-domain-badge="true" />` at the bottom of both the Admin View and Employee View scrollable content sections.
4. **`LiquidationReviewModal.vue`:** Import `BaseAuditTrail`, compute `auditTrailEntries` from `reviewingCase.audit_trail || roadmapLiquidation?.audit_trail || roadmapCashAdvance?.audit_trail || []`, and place `<BaseAuditTrail :entries="auditTrailEntries" :is-admin="true" :show-domain-badge="true" />` at the bottom of the scrollable content area.
5. **`LiquidationSettlementForm.vue` & `LiquidationsView.vue`:** Ensure `reviewingCase` mapping in `LiquidationsView.vue` preserves `audit_trail: s.audit_trail || advance?.audit_trail || []`, and mount `<BaseAuditTrail v-if="existingLiquidation || (selectedAdvance?.audit_trail && selectedAdvance.audit_trail.length)" :entries="existingLiquidation?.audit_trail || selectedAdvance?.audit_trail || []" :is-admin="auth.isAdmin" :show-domain-badge="true" />` in `LiquidationSettlementForm.vue` above the submit actions.

- [ ] **Step 4: Run Vitest suite to verify all modal tests pass**

Run: `npx vitest run src/components/base/BaseAuditTrail.test.js src/components/reimbursements/ReimbursementDetailsModal.test.js src/components/cash-advances/CashAdvanceDetailsModal.test.js src/components/liquidations/LiquidationReviewModal.test.js` (in `apps/web`)
Expected: PASS

---

### Task 5: Update Canonical Documentation & Changelog (`SERMS.md`, `SDD.md`, `CHANGELOG.md`)

**Files:**
- Modify: `docs/SERMS.md`
- Modify: `docs/SDD.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/DOC_CHANGELOG.md`

- [ ] **Step 1: Update `docs/SERMS.md` & `docs/SDD.md` to document the `BaseAuditTrail.vue` component and unified `audit_trail` hydration**
- [ ] **Step 2: Record the documentation update in `docs/CHANGELOG.md` and `docs/DOC_CHANGELOG.md` using Medium Date Format (`Oct 22, 2026`)**
