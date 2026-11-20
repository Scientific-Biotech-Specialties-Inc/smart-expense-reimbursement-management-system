# Changelog — SERMS

> **Canonical Changelog Location:** The comprehensive historical changelog for SERMS is maintained in [`DOC_CHANGELOG.md`](DOC_CHANGELOG.md).

Please refer to [**`DOC_CHANGELOG.md`**](DOC_CHANGELOG.md) for the complete version history, release notes, and Architectural Decision Records (ADRs).

---

## [Unreleased] - Nov 16, 2026

### Changed
- **Non-Overridable Receipt Quality Rejection & Draft Auto-Purge (`apps/web`):**
  - **`ReceiptQualityRejectionModal.vue`:** Added support for `rejectionCode === "unreadable"` (`Unreadable or Damaged Receipt` header, `Unreadable Receipt` badge, and damaged-receipt scanning tips), completely removed the `Continue Anyway` override button across all rejection codes (`blurry`, `too_dark`, `too_small`, `faded`, `unreadable`, `not_a_receipt`, `duplicate`), restricted `Upload in Segments` to `too_small`, and added a `Close` button wired to `emit("close")` alongside `<BaseModal @close>`.
  - **`useReceiptUploads.js` & `FileUpload.vue`:** Added immediate auto-purge (`purgeRejectedReceipt` in `useReceiptUploads.js`, `handleRejectedEntry` + `removeFile` in `FileUpload.vue`) across HTTP 422, initial 201 `rejected`, and polled `rejected` responses (excluding `ocr_failed` offline errors) so rejected drafts are immediately removed from form state, blob URLs/poll timers are cleaned up, and persisted draft records are deleted via `DELETE /api/serms/reimbursements/receipts/{id}`. Converted legacy `continueAnyway` / `submitWithForce` / `handleContinueAnyway` handlers to clear the modal without overriding.
  - **`ReceiptUploadModal.vue` & `ReimbursementFormView.vue`:** Wired `@close="clearQualityRejection"` on `<ReceiptQualityRejectionModal>` and tightened `canSaveNew` in `ReceiptUploadModal.vue` to reject any entry with `isRejected` or `status === "rejected"`.
  - **`receiptUtils.js`, `ExpenseCard.vue`, & `MyExpenseView.vue`:** Added `"rejected"` and `"automatic-rejected"` to `EDIT_FORBIDDEN_STATUSES` while keeping `"final-rejected"`, `"rejected"`, and `"automatic-rejected"` deletable in `DELETE_FORBIDDEN_STATUSES`, and updated the My Expense automatic-rejected banner/card copy to instruct users to delete and re-upload clearer receipts instead of editing.
  - **Vitest Tests:** Updated `ReceiptQualityRejectionModal.test.js`, `receiptUtils.test.js`, `FileUpload.missing-fields.test.js`, `ReceiptUploadModal.spec.js`, `ReimbursementFormView.duplicate-cancel.test.js`, and `MyExpenseView.delete.test.js`, and added `useReceiptUploads.rejection.test.js`.
