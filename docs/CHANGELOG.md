# Changelog — SERMS

> **Canonical Changelog Location:** The comprehensive historical changelog for SERMS is maintained in [`DOC_CHANGELOG.md`](DOC_CHANGELOG.md).

Please refer to [**`DOC_CHANGELOG.md`**](DOC_CHANGELOG.md) for the complete version history, release notes, and Architectural Decision Records (ADRs).

---

## [Unreleased] - Nov 21, 2026

### Added
- **Smart Multi-Receipt Auto-Split & Per-Card Isolation (`docs/SERMS.md`, `apps/web`):**
  - Updated `docs/SERMS.md` with the Smart Multi-Receipt Auto-Split workflow and `split_receipts` / `segment_indices` polling & callback contract across Reimbursements, My Expense, and Liquidations.
  - **`receiptUtils.js`:** Added shared A-09 helpers `hasSplitReceipts()`, `formatSplitReceiptsToastMessage()`, `resolveSplitSegmentIndices()`, and `isDuplicateOcrResponse()`.
  - **`useReceiptUploads.js`:** Added 1-file fallback in `submitSegments()`, enforced the 6-file cap, checked `split_receipts` before early `rejected`/`failed` returns in `startPolling()`, expanded multi-receipt placeholders into individual draft cards (preserving `isMultiReceipt` only when a group owns `> 1` image), guarded blob URL revocation against sibling reuse, and isolated per-card rejections/duplicates with dynamic index lookup.
  - **`FileUpload.vue`:** Updated liquidation `startPolling()` / OCR resolution to check `split_receipts` before `failed`/`rejected` early returns, partition `entry.pages` / `entry.previews`, insert child entries in-place while emitting `update:modelValue`, and evaluate each split entry independently (`hydrateEntry`, `handleRejectedEntry`, or `ocrStatus = 'failed'`) with sibling-safe blob cleanup.
  - **`ReimbursementFormView.vue`:** Updated `onReceiptSelect()` to fall back directly to `addReceiptFiles()` on 1-file Multi Receipt selections, enforce the 6-file cap on multi-file selections, and reset `uploadMode` to `'single'` on selection or cancel.
  - **Vitest Coverage:** Added `useReceiptUploads.test.js` and `FileUpload.test.js`, and extended `receiptUtils.test.js`, `ReceiptUploadModal.spec.js`, and `ReimbursementFormView.duplicate-cancel.test.js`.

### Changed
- **Liquidation Minimum Balance Enforcement (`docs/SERMS.md`, `docs/PRD.md`, `apps/api`, `apps/web`):**
  - Updated `docs/SERMS.md` and `docs/PRD.md` to mandate `total_expense_amount >= outstanding_balance` on liquidation submissions and edits (`422` validation error on `total_expense_amount` when below balance), replacing shortfall-permitted submission flow.
  - Enforced the check in `LiquidationController@store` and `LiquidationController@update`, `LiquidationSettlementForm.vue` (button disable + inline `role="alert"`), `LiquidationsView.vue` (submit confirmation guard), and `useLiquidationSubmit.js`, with updated PHPUnit and Vitest suites.

## [Unreleased] - Nov 16, 2026

### Changed
- **Non-Overridable Receipt Quality Rejection & Draft Auto-Purge (`apps/web`):**
  - **`ReceiptQualityRejectionModal.vue`:** Added support for `rejectionCode === "unreadable"` (`Unreadable or Damaged Receipt` header, `Unreadable Receipt` badge, and damaged-receipt scanning tips), completely removed the `Continue Anyway` override button across all rejection codes (`blurry`, `too_dark`, `too_small`, `faded`, `unreadable`, `not_a_receipt`, `duplicate`), restricted `Upload in Segments` to `too_small`, and added a `Close` button wired to `emit("close")` alongside `<BaseModal @close>`.
  - **`useReceiptUploads.js` & `FileUpload.vue`:** Added immediate auto-purge (`purgeRejectedReceipt` in `useReceiptUploads.js`, `handleRejectedEntry` + `removeFile` in `FileUpload.vue`) across HTTP 422, initial 201 `rejected`, and polled `rejected` responses (excluding `ocr_failed` offline errors) so rejected drafts are immediately removed from form state, blob URLs/poll timers are cleaned up, and persisted draft records are deleted via `DELETE /api/serms/reimbursements/receipts/{id}`. Converted legacy `continueAnyway` / `submitWithForce` / `handleContinueAnyway` handlers to clear the modal without overriding.
  - **`ReceiptUploadModal.vue` & `ReimbursementFormView.vue`:** Wired `@close="clearQualityRejection"` on `<ReceiptQualityRejectionModal>` and tightened `canSaveNew` in `ReceiptUploadModal.vue` to reject any entry with `isRejected` or `status === "rejected"`.
  - **`receiptUtils.js`, `ExpenseCard.vue`, & `MyExpenseView.vue`:** Added `"rejected"` and `"automatic-rejected"` to `EDIT_FORBIDDEN_STATUSES` while keeping `"final-rejected"`, `"rejected"`, and `"automatic-rejected"` deletable in `DELETE_FORBIDDEN_STATUSES`, and updated the My Expense automatic-rejected banner/card copy to instruct users to delete and re-upload clearer receipts instead of editing.
  - **Vitest Tests:** Updated `ReceiptQualityRejectionModal.test.js`, `receiptUtils.test.js`, `FileUpload.missing-fields.test.js`, `ReceiptUploadModal.spec.js`, `ReimbursementFormView.duplicate-cancel.test.js`, and `MyExpenseView.delete.test.js`, and added `useReceiptUploads.rejection.test.js`.
