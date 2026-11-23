# Payout Epic (EP 5: G2-042 to G2-053) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the remaining stories of Epic 5 (Payout) — `G2-042`, `G2-043`, `G2-044`, `G2-045`, `G2-046`, `G2-047`, `G2-050`, `G2-051`, `G2-052`, and `G2-053` — completing the end-to-end reimbursement approval, payout granting, employee signature acknowledgement, and admin payout monitoring & audit workflows.

**Architecture:**
1. **Backend (`apps/api/app/Modules/Reimbursements`)**: Add `approved_by` and `approved_at` columns to `reimbursements` (recorded on `G2-042` approve); expand `grantReimbursement()` (`G2-043`–`G2-047`) to validate and create the linked `Payout` record (`payouts` table) in a single transaction with `AuditLogService::log()`; add `POST /api/reimbursements/{id}/acknowledge` (`G2-050`) so the owning employee can sign and lock their payout; and enforce immutability & role-based guards (`G2-053`) so granted payouts cannot be edited, deleted, or accessed by other employees.
2. **Reusable Frontend Primitives (`apps/web/src/components/base`)**: Create `BaseSignaturePad.vue` (reusable HTML5 canvas signature pad with draw/clear and `v-model` base64 PNG binding) and extend `BaseUtilityToolbar.vue` with a `#extra-filters` slot inside the `Filters` popover for admin multi-criteria filtering.
3. **Frontend Reimbursements & Payouts (`apps/web/src`)**: Create `GrantPayoutModal.vue` (`G2-043`–`G2-046`) with read-only request/approval/grant dates, amount, and approver, editable `Granted by`, required `Payout Method` (`Cash`, `E-wallet`, `Card`, `Visa`, `Other` + conditional specification input), `BaseSignaturePad`, and the confirmation step (*"Has the money been handed to the employee?"* + password verification); upgrade `PayoutDetailsModal.vue` for employee acknowledgement signing (`G2-050`) and admin read-only audit inspection (`G2-052`); and upgrade `PayoutView.vue`, `PayoutsTable.vue`, and `usePayoutFilters.js` for admin monitoring (`G2-051`).

**Tech Stack:** Laravel 13 (PHP 8.3), Vue 3 (Composition API, Pinia), Tailwind CSS 3.4, Lucide Vue Next, PHPUnit, Vitest (`@vue/test-utils`).

**Spec:** `docs/Sprint-5.xlsx` (EP 5 - Payout: `G2-042` through `G2-053`)

## Global Constraints

- **Reusability (`A-09`):** Reuse `BaseModal.vue`, `BaseButton.vue`, `StatusBadge.vue`, `BaseKpiGrid.vue`, `BaseUtilityToolbar.vue`, `ActionDropdownMenu.vue`, `BasePagination.vue`, and the new `BaseSignaturePad.vue`. Never use raw `<button>` or custom badge markup where base components apply.
- **Audit Immutability:** Every database mutation (`approve`, `grant`, `acknowledge`) must invoke `AuditLogService::log()` inside the same `DB::transaction()`.
- **Medium Date Format:** All human-readable dates displayed in the UI must use `formatDate()` (`Oct 14, 2026` style).
- **Protection of Granted Records (`G2-053`):** Once a reimbursement/payout is `granted`, it cannot be edited, deleted, or granted a second time by any role; employees can only view/acknowledge their own payouts (`403 Forbidden` otherwise).

---

## File Map

| Action | File Path | Responsibility |
| --- | --- | --- |
| Create | `apps/api/app/Modules/Reimbursements/Database/Migrations/2026_10_21_000002_add_approval_fields_to_reimbursements_table.php` | Add `approved_by` and `approved_at` columns to `reimbursements` (`G2-042`) |
| Modify | `apps/api/app/Modules/Reimbursements/Models/Reimbursement.php` | Add `approved_by`, `approved_at` to `$fillable` and `$casts` |
| Modify | `apps/api/app/Modules/Reimbursements/Http/Requests/GrantReimbursementRequest.php` | Validate `granted_by`, `payout_method`, `payout_method_other`, `granter_signature`, `password` (`G2-045`, `G2-046`) |
| Create | `apps/api/app/Modules/Reimbursements/Http/Requests/AcknowledgePayoutRequest.php` | Validate `employee_signature` on employee payout acknowledgement (`G2-050`) |
| Modify | `apps/api/app/Modules/Reimbursements/Services/ReimbursementService.php` | Save approver/timestamp on approve (`G2-042`); create `Payout` record on grant (`G2-047`); implement `acknowledgePayout()` (`G2-050`); lock granted records from update/delete (`G2-053`) |
| Modify | `apps/api/app/Modules/Reimbursements/Http/Controllers/ReimbursementController.php` | Pass validated payout data to `grantReimbursement()` and add `acknowledge()` action |
| Modify | `apps/api/app/Modules/Reimbursements/routes/api.php` | Register `POST /{id}/acknowledge` route |
| Modify | `apps/api/tests/Feature/ReimbursementLogicTest.php` | Feature tests for `G2-042`–`G2-047`, `G2-050`, `G2-053` |
| Modify | `apps/api/tests/Feature/ReimbursementPasswordVerificationTest.php` | Update grant test payload to include required payout fields |
| Create | `apps/web/src/components/base/BaseSignaturePad.vue` | Reusable HTML5 canvas signature pad component (`G2-046`, `G2-050`) |
| Create | `apps/web/src/components/base/BaseSignaturePad.test.js` | Unit tests for `BaseSignaturePad.vue` |
| Modify | `apps/web/src/components/base/BaseUtilityToolbar.vue` | Support `#extra-filters` slot inside the `Filters` popover (`G2-051`) |
| Modify | `apps/web/src/components/base/BaseUtilityToolbar.test.js` | Unit test for `#extra-filters` slot |
| Create | `apps/web/src/components/reimbursements/GrantPayoutModal.vue` | Admin Payout modal for `Grant Claim` (`G2-043`–`G2-046`) |
| Create | `apps/web/src/components/reimbursements/GrantPayoutModal.test.js` | Unit tests for `GrantPayoutModal.vue` |
| Modify | `apps/web/src/stores/reimbursement.js` | Update `grant(id, payload)` and add `acknowledgePayout(id, employeeSignature)` |
| Modify | `apps/web/src/composables/reimbursements/useReimbursementDecisions.js` | Support opening/submitting `GrantPayoutModal` with payout payload |
| Modify | `apps/web/src/views/ReimbursementsView.vue` | Wire `GrantPayoutModal` for `grantingId` instead of generic `DecisionConfirmationModal` |
| Modify | `apps/web/src/components/reimbursements/ReimbursementDetailsModal.vue` | Show approver and approval date in progress tracker/details (`G2-042`) |
| Modify | `apps/web/src/components/payouts/PayoutDetailsModal.vue` | Add employee acknowledgement signature pad (`G2-050`) & admin read-only audit details (`G2-052`) |
| Modify | `apps/web/src/composables/payouts/usePayoutFilters.js` | Support admin all-employees view and filters: employee, payout method, acknowledgement status, date range (`G2-051`) |
| Modify | `apps/web/src/components/payouts/PayoutsTable.vue` | Add `Employee` column for admin view (`G2-051`) |
| Modify | `apps/web/src/views/PayoutView.vue` | Role-aware KPIs (Admin 3 cards vs Employee 4 cards), admin extra filters in `BaseUtilityToolbar`, and employee sign handler (`G2-050`–`G2-052`) |
| Modify | `apps/web/src/views/PayoutView.test.js` | Comprehensive tests covering `G2-048`–`G2-053` |

---

### Task 1: Backend Approval Tracking, Payout Granting, Acknowledgement & Audit Protection (`G2-042`–`G2-047`, `G2-050`, `G2-053`)

**Files:**
- Create: `apps/api/app/Modules/Reimbursements/Database/Migrations/2026_10_21_000002_add_approval_fields_to_reimbursements_table.php`
- Modify: `apps/api/app/Modules/Reimbursements/Models/Reimbursement.php`
- Modify: `apps/api/app/Modules/Reimbursements/Http/Requests/GrantReimbursementRequest.php`
- Create: `apps/api/app/Modules/Reimbursements/Http/Requests/AcknowledgePayoutRequest.php`
- Modify: `apps/api/app/Modules/Reimbursements/Services/ReimbursementService.php`
- Modify: `apps/api/app/Modules/Reimbursements/Http/Controllers/ReimbursementController.php`
- Modify: `apps/api/app/Modules/Reimbursements/routes/api.php`
- Modify: `apps/api/tests/Feature/ReimbursementLogicTest.php`
- Modify: `apps/api/tests/Feature/ReimbursementPasswordVerificationTest.php`

**Interfaces:**
- Produces:
  - `Reimbursement`: `approved_by` (string|null), `approved_at` (ISO datetime|null), `payout` relation.
  - `POST /api/reimbursements/{id}/grant` accepting `{ granted_by, payout_method, payout_method_other?, granter_signature, password? }` and creating the `Payout` row while setting `status = 'granted'`.
  - `POST /api/reimbursements/{id}/acknowledge` accepting `{ employee_signature }` and updating `payout.employee_signature` and `payout.acknowledged_at` (locked once signed).

- [ ] **Step 1: Write the failing backend tests in `ReimbursementLogicTest.php`**

Add tests to `apps/api/tests/Feature/ReimbursementLogicTest.php` for:
1. `test_approve_saves_approving_admin_and_timestamp` (`G2-042`)
2. `test_grant_creates_payout_record_and_blocks_duplicate_or_unapproved_grant` (`G2-043`–`G2-047`)
3. `test_employee_can_acknowledge_own_granted_payout_once_and_not_others` (`G2-050`, `G2-053`)
4. `test_granted_reimbursement_cannot_be_updated_or_deleted` (`G2-053`)

```php
    public function test_approve_saves_approving_admin_and_timestamp(): void
    {
        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Client Lunch',
            'amount' => 1200.00,
            'date' => '2026-10-01',
            'cutoff_period' => '2026-10-A',
            'status' => 'pending',
            'submitted_by_name' => $this->employee->name,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'first_name' => 'Admin',
            'last_name' => 'User',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/approve', []);

        $response->assertStatus(200);
        $this->assertEquals('approved', $response->json('data.status'));
        $this->assertEquals($this->admin->name, $response->json('data.approved_by'));
        $this->assertNotNull($response->json('data.approved_at'));
    }

    public function test_grant_creates_payout_record_and_blocks_duplicate_or_unapproved_grant(): void
    {
        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Conference Travel',
            'amount' => 3500.00,
            'date' => '2026-10-02',
            'cutoff_period' => '2026-10-A',
            'status' => 'approved',
            'approved_by' => 'Finance Approver',
            'approved_at' => '2026-10-05 12:00:00',
            'submitted_by_name' => $this->employee->name,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'first_name' => 'Admin',
            'last_name' => 'User',
        ]);

        // Selecting Other without payout_method_other fails validation (G2-045)
        $invalidResponse = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/grant', [
            'granted_by' => 'Cashier Jane',
            'payout_method' => 'Other',
            'granter_signature' => 'data:image/png;base64,granterSig',
        ]);
        $invalidResponse->assertStatus(422);

        // Valid grant (G2-044, G2-045, G2-046, G2-047)
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/grant', [
            'granted_by' => 'Cashier Jane',
            'payout_method' => 'Other',
            'payout_method_other' => 'GCash Corporate',
            'granter_signature' => 'data:image/png;base64,granterSig',
        ]);

        $response->assertStatus(200);
        $this->assertEquals('granted', $response->json('data.status'));
        $this->assertEquals('Cashier Jane', $response->json('data.payout.granted_by'));
        $this->assertEquals('Finance Approver', $response->json('data.payout.approved_by'));
        $this->assertEquals('Other', $response->json('data.payout.payout_method'));
        $this->assertEquals('GCash Corporate', $response->json('data.payout.payout_method_other'));
        $this->assertEquals('3500.00', $response->json('data.payout.amount'));

        // Duplicate grant is blocked (G2-047)
        $secondGrant = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/grant', [
            'granted_by' => 'Cashier Jane',
            'payout_method' => 'Cash',
            'granter_signature' => 'data:image/png;base64,granterSig',
        ]);
        $secondGrant->assertStatus(403);
    }

    public function test_employee_can_acknowledge_own_granted_payout_once_and_not_others(): void
    {
        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Granted Reimbursement',
            'amount' => 1500.00,
            'date' => '2026-10-01',
            'cutoff_period' => '2026-10-A',
            'status' => 'granted',
            'submitted_by_name' => $this->employee->name,
        ]);

        \App\Modules\Reimbursements\Models\Payout::create([
            'reimbursement_id' => $reimbursement->id,
            'request_date' => '2026-10-01',
            'approved_at' => '2026-10-05 14:00:00',
            'granted_at' => '2026-10-10 10:00:00',
            'approved_by' => 'Finance Manager',
            'granted_by' => 'Cashier Jane',
            'payout_method' => 'Cash',
            'amount' => 1500.00,
            'granter_signature' => 'data:image/png;base64,granterSig',
        ]);

        $otherUser = User::create([
            'name' => 'Other Emp',
            'email' => 'other@example.com',
            'role' => 'employee',
            'grade' => 'L1',
            'department' => 'IT',
        ]);

        $otherToken = $this->generateMockToken([
            'email' => $otherUser->email,
            'role' => $otherUser->role,
            'first_name' => 'Other',
            'last_name' => 'Emp',
        ]);

        // Other employee cannot acknowledge (G2-050, G2-053)
        $forbidden = $this->withHeaders([
            'Authorization' => 'Bearer ' . $otherToken,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/acknowledge', [
            'employee_signature' => 'data:image/png;base64,empSig',
        ]);
        $forbidden->assertStatus(403);

        // Owning employee acknowledges (G2-050)
        $empToken = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => $this->employee->role,
            'first_name' => 'John',
            'last_name' => 'Doe',
        ]);

        $ok = $this->withHeaders([
            'Authorization' => 'Bearer ' . $empToken,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/acknowledge', [
            'employee_signature' => 'data:image/png;base64,empSig',
        ]);
        $ok->assertStatus(200);
        $this->assertEquals('data:image/png;base64,empSig', $ok->json('data.payout.employee_signature'));
        $this->assertNotNull($ok->json('data.payout.acknowledged_at'));

        // Cannot re-sign once acknowledged (G2-050 Task 3)
        $resign = $this->withHeaders([
            'Authorization' => 'Bearer ' . $empToken,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/acknowledge', [
            'employee_signature' => 'data:image/png;base64,newSig',
        ]);
        $resign->assertStatus(403);
    }

    public function test_granted_reimbursement_cannot_be_updated_or_deleted(): void
    {
        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Locked Granted Claim',
            'amount' => 1500.00,
            'date' => '2026-10-01',
            'cutoff_period' => '2026-10-A',
            'status' => 'granted',
            'submitted_by_name' => $this->employee->name,
        ]);

        $adminToken = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'first_name' => 'Admin',
            'last_name' => 'User',
        ]);

        $patchRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $adminToken,
            'Accept' => 'application/json',
        ])->patchJson('/api/reimbursements/' . $reimbursement->id, [
            'admin_notes' => 'Trying to edit granted record',
        ]);
        $patchRes->assertStatus(403);
    }
```

- [ ] **Step 2: Run the backend test to verify it fails**

Run: `php artisan test --filter=ReimbursementLogicTest` (in `apps/api`)
Expected: FAIL (`approved_by` is null, `payout` not created on `/grant`, `/acknowledge` 404, `patchJson` on granted returns 200 instead of 403).

- [ ] **Step 3: Implement backend migration, requests, service methods, controller action, and route**

1. Create `apps/api/app/Modules/Reimbursements/Database/Migrations/2026_10_21_000002_add_approval_fields_to_reimbursements_table.php`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reimbursements', function (Blueprint $table) {
            $table->string('approved_by')->nullable()->after('status');
            $table->timestamp('approved_at')->nullable()->after('approved_by');
        });
    }

    public function down(): void
    {
        Schema::table('reimbursements', function (Blueprint $table) {
            $table->dropColumn(['approved_by', 'approved_at']);
        });
    }
};
```

2. Update `apps/api/app/Modules/Reimbursements/Models/Reimbursement.php` to include `'approved_by'` and `'approved_at'` in `$fillable` and `'approved_at' => 'datetime'` in `$casts`.

3. Update `apps/api/app/Modules/Reimbursements/Http/Requests/GrantReimbursementRequest.php`:
```php
<?php

namespace App\Modules\Reimbursements\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class GrantReimbursementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'password' => 'nullable|string',
            'approved_by' => 'nullable|string|max:255',
            'granted_by' => 'required|string|max:255',
            'payout_method' => 'required|string|in:Cash,E-wallet,Card,Visa,Other',
            'payout_method_other' => 'required_if:payout_method,Other|nullable|string|max:255',
            'granter_signature' => 'required|string',
        ];
    }
}
```

4. Create `apps/api/app/Modules/Reimbursements/Http/Requests/AcknowledgePayoutRequest.php`:
```php
<?php

namespace App\Modules\Reimbursements\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AcknowledgePayoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'employee_signature' => 'required|string',
        ];
    }
}
```

5. Update `apps/api/app/Modules/Reimbursements/Services/ReimbursementService.php`:
   - In `approveReimbursement()`: guard `if ($reimbursement->status !== 'pending') { throw new AuthorizationException('Only pending reimbursements can be approved.'); }`, and update `['status' => 'approved', 'approved_by' => $user->name, 'approved_at' => now()]`. Return `$reimbursement->load(['receipts.category', 'user', 'expenseCategory', 'payout'])`.
   - In `grantReimbursement(User $user, int $id, ?string $password, string $ipAddress, Request $requestContext, array $payoutData = [])`:
     - Verify status is strictly `'approved'` and no `Payout` exists yet (`if ($reimbursement->status !== 'approved' || $reimbursement->payout()->exists())`).
     - Create `Payout` row with `reimbursement_id`, `request_date` (`$reimbursement->date ?? $reimbursement->created_at`), `approved_at` (`$reimbursement->approved_at ?? now()`), `granted_at` (`now()`), `approved_by` (`$reimbursement->approved_by ?? ($payoutData['approved_by'] ?? 'Approver')`), `granted_by` (`$payoutData['granted_by'] ?? $user->name`), `payout_method` (`$payoutData['payout_method'] ?? 'Cash'`), `payout_method_other` (`$payoutData['payout_method_other'] ?? null`), `amount` (`$reimbursement->amount`), `granter_signature` (`$payoutData['granter_signature'] ?? null`).
     - Log `CLAIM_GRANTED` via `AuditLogService::log()` and return `$reimbursement->load(['receipts.category', 'user', 'expenseCategory', 'payout'])`.
   - Add `acknowledgePayout(User $user, int $id, string $employeeSignature, string $ipAddress)`:
     - Find reimbursement with `payout`. Verify `$reimbursement->user_id === $user->id` and `$reimbursement->status === 'granted'`.
     - Verify `$payout` exists and `empty($payout->acknowledged_at) && empty($payout->employee_signature)` (otherwise throw `AuthorizationException('Payout has already been acknowledged.')`).
     - Update `$payout->update(['employee_signature' => $employeeSignature, 'acknowledged_at' => now()])` and log `PAYOUT_ACKNOWLEDGED` via `AuditLogService::log()`.
     - Return `$reimbursement->load(['receipts.category', 'user', 'expenseCategory', 'payout'])`.
   - In `updateReimbursement()`: add guard at the very top:
     ```php
     if ($reimbursement->status === 'granted') {
         throw new \Illuminate\Auth\Access\AuthorizationException('Granted reimbursement records are locked and cannot be modified.');
     }
     ```
   - Update `ReimbursementPasswordVerificationTest.php` grant calls so they pass valid `granted_by`, `payout_method`, and `granter_signature` fields alongside `password`.

- [ ] **Step 4: Run backend tests to verify they pass**

Run: `php artisan test tests/Feature/ReimbursementLogicTest.php tests/Feature/ReimbursementPasswordVerificationTest.php` (in `apps/api`)
Expected: PASS (all tests green).

---

### Task 2: Reusable `BaseSignaturePad.vue` & `BaseUtilityToolbar.vue` Extra Filters Slot (`G2-046`, `G2-050`, `G2-051`)

**Files:**
- Create: `apps/web/src/components/base/BaseSignaturePad.vue`
- Create: `apps/web/src/components/base/BaseSignaturePad.test.js`
- Modify: `apps/web/src/components/base/BaseUtilityToolbar.vue`
- Modify: `apps/web/src/components/base/BaseUtilityToolbar.test.js`

**Interfaces:**
- `BaseSignaturePad.vue`:
  - Props: `modelValue: { type: String, default: "" }`, `label: { type: String, default: "Signature" }`, `placeholder: { type: String, default: "Draw your signature here" }`, `disabled: { type: Boolean, default: false }`
  - Emits: `update:modelValue` (emits data URL string when drawn, `""` when cleared)
- `BaseUtilityToolbar.vue`:
  - Adds support for `<slot name="extra-filters" />` inside the Filters popover and shows the `Filters` button when `hasFilters || $slots['extra-filters']`.

- [ ] **Step 1: Write failing unit tests in `BaseSignaturePad.test.js` and `BaseUtilityToolbar.test.js`**

```javascript
// apps/web/src/components/base/BaseSignaturePad.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import BaseSignaturePad from "./BaseSignaturePad.vue";

describe("BaseSignaturePad", () => {
  it("renders canvas and placeholder, emits data URL on draw, and clears when Clear is clicked", async () => {
    const wrapper = mount(BaseSignaturePad, {
      props: {
        modelValue: "",
        placeholder: "Sign inside box",
      },
    });

    expect(wrapper.text()).toContain("Sign inside box");
    const canvas = wrapper.find("canvas");
    expect(canvas.exists()).toBe(true);

    // Mock canvas 2d context and toDataURL
    const ctxMock = {
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
    };
    canvas.element.getContext = vi.fn(() => ctxMock);
    canvas.element.toDataURL = vi.fn(() => "data:image/png;base64,mockSig");

    await canvas.trigger("pointerdown", { clientX: 10, clientY: 10, pointerId: 1 });
    await canvas.trigger("pointermove", { clientX: 25, clientY: 25 });
    await canvas.trigger("pointerup");

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeTruthy();
    expect(emitted[emitted.length - 1][0]).toBe("data:image/png;base64,mockSig");

    const clearBtn = wrapper.find('[data-testid="clear-signature-btn"]');
    await clearBtn.trigger("click");
    expect(wrapper.emitted("update:modelValue").slice(-1)[0][0]).toBe("");
  });
});
```

And in `apps/web/src/components/base/BaseUtilityToolbar.test.js`, add a test verifying that `#extra-filters` slot content renders inside the popover when the Filters button is clicked.

- [ ] **Step 2: Run the component tests to verify they fail**

Run: `npx vitest run src/components/base/BaseSignaturePad.test.js src/components/base/BaseUtilityToolbar.test.js` (in `apps/web`)
Expected: FAIL (`BaseSignaturePad.vue` does not exist; `#extra-filters` slot not rendered).

- [ ] **Step 3: Implement `BaseSignaturePad.vue` and update `BaseUtilityToolbar.vue`**

Create `apps/web/src/components/base/BaseSignaturePad.vue` using `BaseButton.vue` for the Clear action and emitting `update:modelValue` with `canvas.toDataURL("image/png")` on stroke completion and `""` on clear.
Update `apps/web/src/components/base/BaseUtilityToolbar.vue` using `useSlots()` so `hasFilters` is `computed(() => props.statuses.length > 0 || props.categories.length > 0 || Boolean(slots["extra-filters"]))` and renders `<slot name="extra-filters" />` inside the popover container.

- [ ] **Step 4: Run the component tests to verify they pass**

Run: `npx vitest run src/components/base/BaseSignaturePad.test.js src/components/base/BaseUtilityToolbar.test.js` (in `apps/web`)
Expected: PASS.

---

### Task 3: Admin Grant Payout Modal & Reimbursements Integration (`G2-042`–`G2-047`)

**Files:**
- Create: `apps/web/src/components/reimbursements/GrantPayoutModal.vue`
- Create: `apps/web/src/components/reimbursements/GrantPayoutModal.test.js`
- Modify: `apps/web/src/stores/reimbursement.js`
- Modify: `apps/web/src/composables/reimbursements/useReimbursementDecisions.js`
- Modify: `apps/web/src/components/reimbursements/ReimbursementDetailsModal.vue`
- Modify: `apps/web/src/views/ReimbursementsView.vue`

**Interfaces:**
- `GrantPayoutModal.vue`:
  - Props:
    - `isOpen: Boolean`
    - `record: Object` (the approved reimbursement record)
    - `defaultGrantedBy: String` (defaults to `auth.user?.name`)
    - `isSubmitting: Boolean`
  - Emits:
    - `close`
    - `confirm` with payload `{ granted_by, payout_method, payout_method_other, granter_signature, password }`
- Behavior (`G2-043`–`G2-046`):
  - Step 1 (Payout Form):
    - Read-only auto-filled fields (`G2-044` & `G2-045`):
      - **Date of Request**: `formatDate(record.date || record.created_at)`
      - **Date of Approval**: `formatDate(record.approved_at || record.updated_at)`
      - **Date of Granting**: `formatDate(new Date().toISOString())`
      - **Amount to Receive**: `formatAmount(record.amount, record.currency || 'PHP')`
      - **Approved By**: `record.approved_by || 'Approver'` (read-only input)
    - Editable required fields (`G2-045`):
      - **Granted By**: text input pre-filled with `defaultGrantedBy` (`auth.user?.name`)
      - **Payout Method**: `<select>` with options `Cash`, `E-wallet`, `Card`, `Visa`, `Other`
      - **Specify Method** (`v-if="payoutMethod === 'Other'"`): required text input
    - Granter Signature (`G2-046`):
      - `<BaseSignaturePad v-model="granterSignature" />` (required before proceeding)
  - Step 2 (Handover & Password Confirmation — `G2-046` Task 3):
    - Displays confirmation banner: **"Has the money been handed to the employee?"**
    - Requires admin password input before final submission.

- [ ] **Step 1: Write failing tests in `GrantPayoutModal.test.js`**

Test:
1. Auto-fills read-only request date, approval date, granting date, amount, and approved by (`G2-044`, `G2-045`).
2. Requires `Granted by`, `Payout Method`, conditional `Other` specification (`G2-045`), and `granterSignature` (`G2-046`) before enabling the Submit button.
3. Clicking Submit shows the confirmation step *"Has the money been handed to the employee?"* (`G2-046` Task 3) and emits `confirm` with `{ granted_by, payout_method, payout_method_other, granter_signature, password }`.

- [ ] **Step 2: Run `GrantPayoutModal.test.js` to verify it fails**

Run: `npx vitest run src/components/reimbursements/GrantPayoutModal.test.js` (in `apps/web`)
Expected: FAIL (`GrantPayoutModal.vue` does not exist).

- [ ] **Step 3: Implement `GrantPayoutModal.vue` and wire into `useReimbursementDecisions.js`, `reimbursement.js`, `ReimbursementDetailsModal.vue`, and `ReimbursementsView.vue`**

1. Create `apps/web/src/components/reimbursements/GrantPayoutModal.vue` wrapping `BaseModal.vue`, `BaseButton.vue`, and `BaseSignaturePad.vue`.
2. In `apps/web/src/stores/reimbursement.js`, update `grant(id, payload)`:
   - Accept either a string password (for backwards compatibility) or an object `{ password, granted_by, payout_method, payout_method_other, granter_signature }` and `JSON.stringify` it to `POST /api/serms/reimbursements/${id}/grant`.
   - Also add `acknowledgePayout(id, employeeSignature)` calling `POST /api/serms/reimbursements/${id}/acknowledge`.
3. In `apps/web/src/composables/reimbursements/useReimbursementDecisions.js`:
   - Update `confirmGrant(payoutPayload)` to pass `payoutPayload` to `store.grant(grantingId.value, payoutPayload)`.
4. In `apps/web/src/components/reimbursements/ReimbursementDetailsModal.vue`:
   - Display `viewingRecord.approved_by` and `formatDate(viewingRecord.approved_at)` when status is `approved` or `granted` (`G2-042` Task 3).
5. In `apps/web/src/views/ReimbursementsView.vue`:
   - Render `<GrantPayoutModal :is-open="!!grantingId" :record="viewingRecord || store.items.find(i => i.id === grantingId)" :default-granted-by="auth.user?.name" :is-submitting="isReviewSubmitting" @close="cancelGrant" @confirm="confirmGrant" />` and remove `grantingId` from `DecisionConfirmationModal`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/reimbursements/GrantPayoutModal.test.js src/components/reimbursements/ReimbursementDetailsModal.test.js` (in `apps/web`)
Expected: PASS.

---

### Task 4: Employee Signature Acknowledgement & Admin Payout Module (`G2-050`, `G2-051`, `G2-052`, `G2-053`)

**Files:**
- Modify: `apps/web/src/composables/payouts/usePayoutFilters.js`
- Modify: `apps/web/src/components/payouts/PayoutsTable.vue`
- Modify: `apps/web/src/components/payouts/PayoutDetailsModal.vue`
- Modify: `apps/web/src/views/PayoutView.vue`
- Modify: `apps/web/src/views/PayoutView.test.js`

**Interfaces:**
- `usePayoutFilters(store, auth)`:
  - When `auth.isAdmin` is `true`, lists all `granted` payouts across all employees (sorted newest to oldest by `grantedDate` / `id`), and exposes reactive filters: `activeEmployee` (`"All"` or employee name), `activeMethod` (`"All"`, `"Cash"`, `"E-wallet"`, `"Card"`, `"Visa"`, `"Other"`), `activeStatus` (`"All"`, `"Acknowledged"`, `"Awaiting Acknowledgement"`), `dateFrom` (`""`), and `dateTo` (`""`), plus `employeeOptions` and `methodOptions`.
  - Maps `employeeName`, `approvedBy`, `employeeSignature`, and `acknowledgedAt` on each row.
- `PayoutsTable.vue`:
  - Accepts `isAdmin: { type: Boolean, default: false }` and renders the `Employee` column (`row.employeeName`) when `isAdmin` is `true`.
- `PayoutDetailsModal.vue`:
  - Props: `record`, `isAdmin: Boolean`, `isSubmitting: Boolean`
  - Emits: `close`, `acknowledge(signatureDataUrl)`
  - Displays `Approved By` (`record.approvedBy`) as well as `Granted By`, dates, amount, payout method, and `Granter's Signature` (`G2-049`, `G2-052`).
  - Employee Acknowledgement section (`G2-050` & `G2-052`):
    - If `record.acknowledged`: displays the saved `Employee's Signature` image (`record.employeeSignature`) and formatted acknowledgement date/time (`formatDate(record.acknowledgedAt)`), locked from editing (`G2-050` Task 3, `G2-052` Task 3).
    - If `!record.acknowledged && !isAdmin`: renders `<BaseSignaturePad v-model="employeeSignature" />` and an **"Acknowledge Payout"** `BaseButton` (disabled until signed) that emits `acknowledge(employeeSignature)`.
    - If `!record.acknowledged && isAdmin`: displays read-only `"Awaiting Acknowledgement"` status (`G2-052` Task 3).
- `PayoutView.vue`:
  - Role-aware KPIs:
    - Admin (`G2-051` Task 4): 3 summary cards — **Total Payouts**, **Total Amount Released**, and **Awaiting Acknowledgement**.
    - Employee (`G2-048`): 4 summary cards — **Total Payouts**, **Total Amount Received**, **Acknowledged**, and **Awaiting Acknowledgement**.
  - Role-aware Filters (`G2-051` Task 3):
    - Admin passes `#extra-filters` into `BaseUtilityToolbar.vue` with Employee selector, Payout Method selector, and Date Range (`dateFrom` / `dateTo`) inputs.

- [ ] **Step 1: Expand `PayoutView.test.js` with failing tests for `G2-050`, `G2-051`, and `G2-052`**

Add tests to `apps/web/src/views/PayoutView.test.js` for:
1. Employee signing to acknowledge an unsigned payout (`G2-050`) and locking the signature pad once acknowledged.
2. Admin Payout view (`G2-051`): lists all employees' Granted payouts, displays the 3 Admin KPI cards (*Total Payouts*, *Total Amount Released*, *Awaiting Acknowledgement*), renders the Employee column, and filters by employee, payout method, acknowledgement status, and date range.
3. Admin Payout Details modal (`G2-052`): shows `Approved by`, `Granted by`, dates, granter signature, and either the employee's signature + acknowledgement date or `"Awaiting Acknowledgement"` in read-only mode (no signature pad shown to admin).

- [ ] **Step 2: Run `PayoutView.test.js` to verify the new tests fail**

Run: `npx vitest run src/views/PayoutView.test.js` (in `apps/web`)
Expected: FAIL on the new `G2-050`, `G2-051`, `G2-052` assertions.

- [ ] **Step 3: Implement updates in `usePayoutFilters.js`, `PayoutsTable.vue`, `PayoutDetailsModal.vue`, and `PayoutView.vue`**

Update the four files to fulfill `G2-050`, `G2-051`, `G2-052`, and `G2-053`.

- [ ] **Step 4: Run the full frontend and backend test suites to verify everything passes**

Run:
- `npx vitest run` (in `apps/web`)
- `php artisan test tests/Feature/ReimbursementLogicTest.php tests/Feature/ReimbursementPasswordVerificationTest.php` (in `apps/api`)
Expected: All tests PASS with 0 errors.
