# Modal Button Sizing Guardrails & Dialog Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce canonical button sizing guardrails across modal dialogs so buttons size intrinsically to their labels with standard padding and proper alignment, updating `docs/DESIGN.md`, dialog UI components, and all affected modal dialogs.

**Architecture:** Update `docs/DESIGN.md` Section VI & VII to explicitly mandate intrinsic button sizing (no `w-full` or `flex-1` stretching in modal footers on tablet/desktop viewports). Document this in `DialogDescription.vue` / `DialogFooter.vue`. Refactor modal footers in `ReimbursementDetailsModal.vue`, `ReceiptDetailsModal.vue`, `LiquidationReceiptModal.vue`, `CashAdvanceDetailsModal.vue`, `ConfirmModal.vue`, `DeleteConfirmModal.vue`, and `ReceiptViewModal.vue` to replace `flex-1` / `w-full` with intrinsic sizing (`px-4`/`px-5`, `py-2.5` / `min-h-9`), right-alignment (`justify-end`), or centered layouts (`justify-center`).

**Tech Stack:** Vue 3, Vite, Tailwind CSS 3.4, Vitest, `@vue/test-utils`, Radix Vue (`radix-vue`).

**Spec:** User request: "on buttons such as this in admin side reimbursement modal make them follow the @docs/DESIGN.md rules which shouldn't occupy its entire parent container and should follow its button size depending on the label e.g. 'Approve Claim' and add some paddings around it then that's the size of the button. if there is no such rule in @apps/web/src/components/ui/dialog/DialogDescription.vue then add one. also find other these types of buttons which occupies most of its parent container then report it to me after before creating implementation plan" -> Approved option: "do no. 2, include other modals above and update the rule in docs/DESIGN.md".

## Global Constraints

- Never inject arbitrary ad-hoc Tailwind classes (e.g. `p-[13px]`, `w-[327px]`). Spacing must adhere to the 8px grid (`px-4`, `px-5`, `py-2`, `py-2.5`, `gap-2`, `gap-3`).
- Preserve Tailwind 3.4 compatibility without using Tailwind v4 syntax.
- Buttons must use Poppins font (`font-sans`), standard heights (`h-9`, `py-2.5`), and horizontal padding (`px-4`, `px-5`).
- In modal footers, action buttons must size according to their content + padding and must not stretch with `flex-1` or `w-full` on desktop viewports (`sm:`).
- Confirmation modals (Delete, Confirm) use centered footers (`justify-center`); form/workflow modals use right-aligned footers (`justify-end`).
- All existing modal functionality, emissions (`emit('approve')`, `emit('reject')`, `emit('grant')`, `emit('confirm')`), and tests must continue to pass without regression.

---

### Task 1: Formalize Modal Button Sizing Rules in `docs/DESIGN.md` and Dialog UI Components

**Files:**
- Modify: `docs/DESIGN.md:274-317`
- Modify: `apps/web/src/components/ui/dialog/DialogDescription.vue:1-20`
- Modify: `apps/web/src/components/ui/dialog/DialogFooter.vue:1-14`

**Interfaces:**
- Consumes: None (documentation and component standard specification).
- Produces: Official design system guardrails for modal button sizing and layout.

- [ ] **Step 1: Update `docs/DESIGN.md` Section VI.5 & VI.6**

Add explicit button sizing and container occupation guardrails in `docs/DESIGN.md` under Section VI.5 ("Action Confirmation Modal Dialogs") and Section VI.6 ("Form & Creation Modals"), and Section VII ("Interaction & Micro-Feedback State Matrix").

Specifically:
- In Section VI.5: Mandate centered action footers where buttons size intrinsically to their labels with `px-5 py-2.5` (or standard `Button` variants), prohibiting `flex-1` or `w-full` stretching on tablet/desktop.
- In Section VI.6: Mandate right-aligned footers (`justify-end gap-2 sm:gap-3`) with intrinsic button widths based on label text + padding (`px-4` / `px-5`), never occupying the entire parent container.
- In Section VII: Add a "Modal Action Buttons & Dropdown Controls" guardrail entry.

- [ ] **Step 2: Add Design Guidance JSDoc to `DialogDescription.vue` and `DialogFooter.vue`**

In `apps/web/src/components/ui/dialog/DialogDescription.vue` and `apps/web/src/components/ui/dialog/DialogFooter.vue`, add standard JSDoc / header comment explaining:
```vue
<!--
  ONE UI Dialog Component Guide:
  - Dialog action buttons and selects in footers must size intrinsically to their text
    content plus standard padding (px-4 or px-5), rather than stretching to fill the
    parent container (avoid w-full or flex-1 on desktop viewports).
  - Use sm:justify-end (forms/workflows) or justify-center (confirmation dialogs).
  - See docs/DESIGN.md Section VI.5 & VI.6.
-->
```

- [ ] **Step 3: Verify documentation accuracy**

Verify that all added rules conform strictly to the 8px grid and canonical design tokens.

- [ ] **Step 4: Commit**

```bash
git add docs/DESIGN.md apps/web/src/components/ui/dialog/DialogDescription.vue apps/web/src/components/ui/dialog/DialogFooter.vue
git commit -m "docs: formalize modal button sizing and footer alignment guardrails"
```

---

### Task 2: Refactor Admin Action Buttons in `ReimbursementDetailsModal.vue`

**Files:**
- Modify: `apps/web/src/components/reimbursements/ReimbursementDetailsModal.vue:377-424`
- Test: `apps/web/src/components/reimbursements/ReimbursementDetailsModal.test.js`

**Interfaces:**
- Consumes: `emit('approve', id)`, `emit('reject', id, action)`, `emit('grant', id)`.
- Produces: Right-aligned intrinsic-sized actions for Pending, Revise, and Approved states.

- [ ] **Step 1: Write failing test in `ReimbursementDetailsModal.test.js`**

Add unit tests to `apps/web/src/components/reimbursements/ReimbursementDetailsModal.test.js` testing that:
1. When viewing a pending reimbursement as admin, the `Approve Claim` button and `Actions ▾` select do NOT have `flex-1` class on desktop.
2. The footer container has `sm:justify-end`.
3. The `Approve Claim` button has `px-5` and `w-full sm:w-auto`.
4. The `Grant Claim` button for approved reimbursements does NOT have `w-full` without `sm:w-auto` and aligns to `sm:justify-end`.

Run:
```bash
npm --prefix apps/web test src/components/reimbursements/ReimbursementDetailsModal.test.js
```
Expected: FAIL (assertion fails because currently `flex-1` and unconditional `w-full` are present).

- [ ] **Step 2: Implement minimal fix in `ReimbursementDetailsModal.vue`**

In `apps/web/src/components/reimbursements/ReimbursementDetailsModal.vue`:
1. Update lines 377–406:
```vue
        <!-- Footer Actions (Admin: Pending/Revise) -->
        <footer
          v-if="auth.isAdmin && viewingRecord && ['pending','revise'].includes(normalizeStatus(viewingRecord.status))"
          class="px-6 py-4 border-t border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end shrink-0"
        >
          <p
            v-if="isOwnSubmission"
            class="text-sm text-danger text-center sm:text-left w-full"
          >
            You cannot process your own request.
          </p>
          <template v-else>
            <div class="w-full sm:w-auto">
              <select
                @change="emit('reject', viewingRecord.id, ($event.target.value)); $event.target.value=''"
                class="w-full sm:w-auto py-2.5 px-4 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg bg-white hover:bg-slate-50 transition-colors text-center cursor-pointer"
                value=""
              >
                <option value="" disabled selected>Actions ▾</option>
                <option value="revise">Request Revision</option>
                <option value="reject">Reject</option>
              </select>
            </div>
            <button
              class="w-full sm:w-auto px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
              @click="emit('approve', viewingRecord.id)"
            >
              Approve Claim
            </button>
          </template>
        </footer>
```
2. Update lines 409–423:
```vue
        <!-- Footer Actions (Admin: Approved → Grant) -->
        <footer
          v-if="auth.isAdmin && viewingRecord && normalizeStatus(viewingRecord.status) === 'approved'"
          class="px-6 py-4 border-t border-slate-100 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-end"
        >
          <button
            v-if="!isOwnSubmission"
            class="w-full sm:w-auto px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
            @click="emit('grant', viewingRecord.id)"
          >
            <Wallet class="w-4 h-4" /> Grant Claim
          </button>
          <p v-else class="text-sm text-danger text-center sm:text-right">
            You cannot process your own request.
          </p>
        </footer>
```

- [ ] **Step 3: Run tests to verify they pass**

Run:
```bash
npm --prefix apps/web test src/components/reimbursements/ReimbursementDetailsModal.test.js
```
Expected: PASS (all tests pass).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/reimbursements/ReimbursementDetailsModal.vue apps/web/src/components/reimbursements/ReimbursementDetailsModal.test.js
git commit -m "fix(reimbursements): size admin modal action buttons intrinsically with right alignment"
```

---

### Task 3: Refactor Decision Buttons in `ReceiptDetailsModal.vue` and `LiquidationReceiptModal.vue`

**Files:**
- Modify: `apps/web/src/components/reimbursements/ReceiptDetailsModal.vue:128-137`
- Modify: `apps/web/src/components/liquidations/LiquidationReceiptModal.vue:54-69`
- Create / Update Test: `apps/web/src/components/reimbursements/ReceiptDetailsModal.test.js`

**Interfaces:**
- Consumes: `emit('request-decision', action)`, `isProcessing`, `isSubmitting`, `isOwnSubmission`.
- Produces: Right-aligned intrinsic-sized decision buttons (`Reject`, `Approve`, `Accept`).

- [ ] **Step 1: Write test for `ReceiptDetailsModal.vue`**

Create test file `apps/web/src/components/reimbursements/ReceiptDetailsModal.test.js` checking that:
- Decision action container has `flex justify-end gap-2` (not 50% split).
- Buttons use `px-4 py-2` or `px-5 py-2.5` and do not have `flex-1`.

Run:
```bash
npm --prefix apps/web test src/components/reimbursements/ReceiptDetailsModal.test.js
```
Expected: FAIL.

- [ ] **Step 2: Update `ReceiptDetailsModal.vue`**

In `apps/web/src/components/reimbursements/ReceiptDetailsModal.vue`, update lines 128–137:
```vue
        <!-- Decision Buttons -->
        <div v-else class="flex items-center justify-end gap-2">
          <button
            class="px-4 py-2 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
            :disabled="isProcessing || isSubmitting || isOwnSubmission"
            @click="emit('request-decision', 'Reject')"
          >
            <XCircle class="w-3.5 h-3.5" /> Reject
          </button>
          <button
            class="px-5 py-2 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors shadow-sm"
            :disabled="isApproveDisabled"
            @click="emit('request-decision', 'Approve')"
          >
            <CheckCircle class="w-3.5 h-3.5" /> Approve
          </button>
        </div>
```

- [ ] **Step 3: Update `LiquidationReceiptModal.vue`**

In `apps/web/src/components/liquidations/LiquidationReceiptModal.vue`, update lines 54–69:
```vue
        <!-- Decision Buttons -->
        <div v-else class="flex items-center justify-end gap-2">
          <button
            class="px-4 py-2 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 flex items-center justify-center gap-1.5 transition-colors"
            @click="emit('request-decision', 'rejected')"
          >
            <XCircle class="w-3.5 h-3.5" /> Reject
          </button>
          <button
            class="px-5 py-2 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            @click="emit('request-decision', 'accepted')"
          >
            <CheckCircle class="w-3.5 h-3.5" /> Accept
          </button>
        </div>
```

- [ ] **Step 4: Run tests to verify**

Run:
```bash
npm --prefix apps/web test src/components/reimbursements/ReceiptDetailsModal.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/reimbursements/ReceiptDetailsModal.vue apps/web/src/components/liquidations/LiquidationReceiptModal.vue apps/web/src/components/reimbursements/ReceiptDetailsModal.test.js
git commit -m "fix(modals): align receipt decision buttons to end with intrinsic padding"
```

---

### Task 4: Refactor Action Buttons in `CashAdvanceDetailsModal.vue`

**Files:**
- Modify: `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.vue:700-732,960-977`
- Test: `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.test.js`

**Interfaces:**
- Consumes: `requestConfirmation(action)`, `confirmAcknowledge()`.
- Produces: Intrinsic-width actions for `Actions ▾`, `Approve`, `Disburse`, and centered Acknowledge modal actions.

- [ ] **Step 1: Write test for CashAdvanceDetailsModal button classes**

Add a test in `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.test.js` checking that:
- Admin actions in footer have `w-full sm:w-auto` instead of `flex-1 sm:max-w-[200px]`.
- Acknowledge modal buttons are centered and not stretched with `flex-1`.

Run:
```bash
npm --prefix apps/web test src/components/cash-advances/CashAdvanceDetailsModal.test.js
```
Expected: FAIL.

- [ ] **Step 2: Update `CashAdvanceDetailsModal.vue`**

In `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.vue`:
1. In admin footer actions (lines 700–732):
```vue
              <template v-if="['pending','revise'].includes(record.status)">
                <div class="w-full sm:w-auto">
                  <select
                    @change="requestConfirmation($event.target.value); $event.target.value=''"
                    class="w-full sm:w-auto py-2.5 px-4 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg bg-white hover:bg-slate-50 transition-colors text-center cursor-pointer"
                    value=""
                  >
                    <option value="" disabled selected>Actions ▾</option>
                    <option value="revise">Request Revision</option>
                    <option value="reject">Reject</option>
                  </select>
                </div>
                <button
                  class="w-full sm:w-auto py-2.5 px-5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
                  type="button"
                  @click="requestConfirmation('approve')"
                >
                  <CheckCircle class="w-4 h-4" />
                  Approve
                </button>
              </template>
              <template v-if="record.status === 'approved'">
                <button
                  class="w-full sm:w-auto py-2.5 px-5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
                  type="button"
                  @click="requestConfirmation('disburse')"
                >
                  <Wallet class="w-4 h-4" />
                  Disburse
                </button>
              </template>
```
2. In Acknowledge confirmation modal (lines 960–977):
```vue
      <div class="mt-6 flex justify-center gap-3">
        <BaseButton
          variant="secondary"
          class="px-5 min-h-10"
          type="button"
          @click="showAcknowledgeModal = false"
        >
          Cancel
        </BaseButton>
        <BaseButton
          variant="primary"
          class="px-5 min-h-10"
          type="button"
          @click="confirmAcknowledge"
        >
          Yes, I Acknowledge
        </BaseButton>
      </div>
```

- [ ] **Step 3: Run tests to verify**

Run:
```bash
npm --prefix apps/web test src/components/cash-advances/CashAdvanceDetailsModal.test.js
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/cash-advances/CashAdvanceDetailsModal.vue apps/web/src/components/cash-advances/CashAdvanceDetailsModal.test.js
git commit -m "fix(cash-advances): size admin actions and acknowledge modal buttons intrinsically"
```

---

### Task 5: Refactor Base Confirmation Modals and `ReceiptViewModal.vue`

**Files:**
- Modify: `apps/web/src/components/base/ConfirmModal.vue:63-79`
- Modify: `apps/web/src/components/base/DeleteConfirmModal.vue:104-121`
- Modify: `apps/web/src/components/expenses/ReceiptViewModal.vue:54-70`
- Create / Update Test: `apps/web/src/components/base/ConfirmModal.test.js`

**Interfaces:**
- Consumes: `cancelText`, `confirmText`, `danger`, `loading`, `close`, `confirm`.
- Produces: Centered intrinsic buttons in confirmation dialogs, right-aligned intrinsic actions in `ReceiptViewModal`.

- [ ] **Step 1: Write test for `ConfirmModal.vue` & `DeleteConfirmModal.vue`**

Create `apps/web/src/components/base/ConfirmModal.test.js` verifying that:
- `ConfirmModal` actions container uses `justify-center` and buttons have `px-5 min-h-10` without `flex-1`.
- `DeleteConfirmModal` actions container uses `justify-center` and buttons have `px-5 min-h-10` without `flex-1`.

Run:
```bash
npm --prefix apps/web test src/components/base/ConfirmModal.test.js
```
Expected: FAIL.

- [ ] **Step 2: Update `ConfirmModal.vue`**

In `apps/web/src/components/base/ConfirmModal.vue`, update lines 63–79:
```vue
      <!-- Action Footer with BaseButton (Section VI.5: Centered Action Footer) -->
      <div class="flex justify-center gap-3 mt-8">
        <BaseButton
          variant="secondary"
          class="px-5 min-h-10"
          @click="$emit('close')"
        >
          {{ cancelText }}
        </BaseButton>
        <BaseButton
          :variant="danger ? 'destructive' : 'primary'"
          :loading="loading"
          class="px-5 min-h-10"
          @click="$emit('confirm')"
        >
          {{ confirmText }}
        </BaseButton>
      </div>
```

- [ ] **Step 3: Update `DeleteConfirmModal.vue`**

In `apps/web/src/components/base/DeleteConfirmModal.vue`, update lines 104–121:
```vue
      <!-- Centered Action Footer per Section VI.5 -->
      <div class="flex justify-center gap-3 mt-6">
        <BaseButton
          variant="secondary"
          class="px-5 min-h-10"
          @click="close"
        >
          Cancel
        </BaseButton>
        <BaseButton
          variant="destructive"
          class="px-5 min-h-10"
          :disabled="password.length === 0"
          @click="handleConfirm"
        >
          Confirm Delete
        </BaseButton>
      </div>
```

- [ ] **Step 4: Update `ReceiptViewModal.vue`**

In `apps/web/src/components/expenses/ReceiptViewModal.vue`, update lines 54–70:
```vue
    <template #actions>
      <div class="flex items-center justify-end gap-2">
        <button
          v-if="canEdit"
          @click="editReceipt"
          class="btn btn-secondary px-4 py-2"
        >
          <Pencil class="w-4 h-4" /> Edit
        </button>
        <button
          v-if="canDelete"
          @click="emit('delete', receipt.id); close();"
          class="btn btn-danger !px-3 py-2"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </template>
```

- [ ] **Step 5: Run tests to verify**

Run:
```bash
npm --prefix apps/web test src/components/base/ConfirmModal.test.js
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/base/ConfirmModal.vue apps/web/src/components/base/DeleteConfirmModal.vue apps/web/src/components/expenses/ReceiptViewModal.vue apps/web/src/components/base/ConfirmModal.test.js
git commit -m "fix(modals): center confirmation actions and size buttons intrinsically"
```

---

### Task 6: Full Regression Verification & Design Compliance Sweep

**Files:**
- Test: All web unit tests

- [ ] **Step 1: Run complete web test suite**

Run:
```bash
npm --prefix apps/web test -- --run
```
Expected: All test suites PASS with zero regressions.

- [ ] **Step 2: Run button scanner script to verify no rogue `flex-1` buttons remain in modal footers**

Run:
```bash
node C:\Users\mobar\.gemini\antigravity\brain\b71f40c9-12fe-4588-9835-59d0b233154e\scratch\scan-buttons.js
```
Verify that none of the modal footers (`ReimbursementDetailsModal`, `ReceiptDetailsModal`, `LiquidationReceiptModal`, `CashAdvanceDetailsModal`, `ConfirmModal`, `DeleteConfirmModal`, `ReceiptViewModal`) have unconstrained `flex-1` or `w-full` buttons.

- [ ] **Step 3: Commit any lingering test fixtures or documentation cleanups**

```bash
git status
```
Ensure working tree is clean.
