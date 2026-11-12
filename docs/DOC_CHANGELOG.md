# Changelog — SERMS

**Project:** Smart Expense & Reimbursement Management System (SERMS)  
**Client / Partner:** Science Biotech Specialties Inc. (SBSI) — [https://sbsi.com.ph/about-us/](https://sbsi.com.ph/about-us/)  
**Academic Context:** 3rd & 4th Year Capstone Project (Capstone 1: Ended July 2026 · Capstone 2: September–December 2026)  
**Date:** Nov 11, 2026  
**Version:** 1.9.9  
**Owner:** SERMS Engineering Team  
**Status:** Active  
**Last reconciled:** Nov 11, 2026 (Cash Advance Modal Document Name & Download Fix)  
**Canonical Spec:** [SERMS.md](SERMS.md) · **Related Docs:** [index.md](index.md) · [PRD.md](PRD.md) · [SAD.md](SAD.md) · [SDD.md](SDD.md) · [DSD.md](DSD.md) · [Build.md](Build.md) · [OPS.md](OPS.md) · [QAD.md](QAD.md) · [AGENTS.md](../AGENTS.md)

---

> **What this is:** The chronological ledger and historical archive of all notable feature additions, architectural decision records (ADRs), security mitigations, database migrations, breaking changes, and documentation revisions across the SERMS lifecycle, structured in accordance with Keep a Changelog and Semantic Versioning.

---

All notable changes, architectural decisions, and documentation updates for the Smart Expense & Reimbursement Management System (SERMS) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note for AI Subagents & Developers:** Always consult this file when you need chronological historical context, previous architectural pivots, or design rationale before modifying codebase features or documentation guides.

## [2.0.0] - Nov 12, 2026

### Added
- **Unified Profile Signature on Signature Pads & Test Seeder (`apps/web` & `apps/api`):**
  - **`BaseSignaturePad.vue` Enhancements:** Added `allowProfileSignature`, `savedSignature`, and `showHelperNote` props; added automatic pre-fill from `auth.user.signature` on mount; integrated a "Use Saved Signature" (`Sparkles`) toolbar button that appears when a saved signature is available and the pad is blank or redrawn; and unified the "Pre-filled from your profile signature" helper badge across all signature touchpoints.
  - **Cash Advance Acknowledgement Unification (`CashAdvanceDetailsModal.vue`):** Replaced legacy raw `<canvas>` and manual stroke capture handlers with reusable `<BaseSignaturePad />`, eliminating duplicate drawing logic (Axiom A-09) and enabling 1-click saved signature acknowledgement for disbursed cash advances.
  - **Payout Modals Cleanup (`GrantPayoutModal.vue` & `PayoutDetailsModal.vue`):** Delegated pre-fill notification and re-application to `BaseSignaturePad.vue`, preventing duplicate badge markup.
  - **Dedicated Test Seeder (`SignatureTestingSeeder.php`):** Created idempotent seeder populating demo signatures on `employee@example.com` and `sum@sbsi.com`, plus 4 test scenarios: disbursed Cash Advance (ready for employee signature acknowledgement), signed Cash Advance (ready for liquidation testing), approved Reimbursement (ready for admin payout grant with signature), and granted Reimbursement with Payout (ready for employee payout acknowledgement signature).
  - **Automated Tests:** Authored Vitest unit tests in `BaseSignaturePad.test.js` & `CashAdvanceDetailsModal.test.js` and PHPUnit feature tests in `SignatureTestingSeederTest.php` (all passing).
- **User Profile Module (Sprint 6 EP 12 / G2-104 to G2-110) (`apps/api` & `apps/web`):**
  - **Database Migration (`users` table):** Added `first_name`, `middle_name`, `last_name`, `contact_number`, `signature` (`longText`), `signature_path`, and `last_login_at` columns with automatic `employee_id` (`EMP-000X`), `avatar_url`, and `has_signature` Eloquent model accessors.
  - **Backend API & Dual-Sync Service (`ProfileService` & `ProfileController`):** Delivered `/api/profile` endpoints supporting profile updates (dual-synced with `capstone-auth-module`), photo upload/deletion (`supabase` bucket `avatars/`), hybrid signature saving/removal (`supabase` bucket `signatures/` + Base64 PNG), client-encrypted password updates (RSA forwarded to `capstone-auth-module`), and user-scoped login/change activity logs.
  - **Login Tracking & Audit Trail Integration:** Updated `AuthenticateWithExternalService` to record `USER_LOGIN` audit logs once per unique JWT token (`jti` cache-locking) and registered profile mutation actions (`PROFILE_UPDATED`, `PROFILE_PHOTO_UPDATED`, `PROFILE_PHOTO_REMOVED`, `PASSWORD_CHANGED`, `SIGNATURE_UPDATED`, `SIGNATURE_REMOVED`) with field-level diff tracking in `AuditLogService`.
  - **Frontend Profile Page (`ProfileView.vue`):** Built a responsive, clinical design layout featuring a top header card with avatar upload/removal, role pill, joined date, admin compliance notice (G2-105), and 3 integrated tabs:
    1. **Personal & Work:** View/Edit personal details (first/middle/last name, contact number) while preserving read-only company fields (email, role, employee ID, department, date joined), paired with a Digital Signature card (with "Configured" status).
    2. **Security:** Change password form with client-side payload pre-encryption, visibility toggles, and live 6-point complexity checklist.
    3. **Activity Log:** 2-column feed displaying Last Login time callout, recent logins list, and chronological account changes with sanitized field diffs.
  - **Removed Redundant Status Indicators:** Removed non-essential "Active" pulsing indicators and synthetic account status badges from the profile header, personal details, signature configuration, and login history cards to align with actual SERMS entity models.
  - **Signature Pre-Filling Integration:** Enhanced `<BaseSignaturePad />` to draw existing Base64 PNG signatures on canvas and wired saved signature pre-filling into `GrantPayoutModal.vue` (`Granter's Signature`) and `PayoutDetailsModal.vue` (`Employee's Signature`) with clear/redraw support.
  - **Top Bar Avatar Display:** Updated `AppLayout.vue` top bar to render the user's custom profile photo image with fallback to initials.
  - **Distraction-Free Layout & Back Navigation (`AppLayout.vue` & `ProfileView.vue`):** Configured `/profile` route with `hideSidebar: true`, dynamically hiding the sidebar chrome, overlay, and toggle button to grant full width to the profile canvas; removed the breadcrumbs label and replaced it with a clean, borderless and transparent Back button (`<ArrowLeft /> Back`) that redirects the user to the last page they visited (with safe `/dashboard` fallback).
  - **Comprehensive Automated Test Coverage:** Authored 10 PHPUnit feature tests in `ProfileControllerTest.php` and 8 Vitest unit tests in `ProfileView.test.js` & `AppLayout.test.js`, passing with 100% green status.

## [1.9.9] - Nov 11, 2026

### Fixed
- **Cash Advance View Modal Document Name Truncation & Download (`apps/web`):**
  - Resolved issue where clicking and downloading an attached document in `CashAdvanceDetailsModal.vue` caused the filename to be hidden or truncated.
  - Implemented safe `documentDisplayName` and `hasDocument` computed properties that preserve the filename and prevent disappearing text when `store.fetchDocument()` resolves or when `file_name` is absent in API payloads.
  - Added truncation formatting (`truncate max-w-[260px] sm:max-w-[420px]`, `shrink-0` on icons, `max-w-full`, and `:title="documentDisplayName"`) to ensure long document filenames do not overflow or push action icons off-screen.
  - Integrated `getFileUrl()` from `@/utils/fileUtils` for robust Supabase storage URL resolution, added loading indicator state (`Loader2`), keyboard accessibility handlers (`@keydown.enter`, `@keydown.space`), and error toast handling.
  - Added automated test cases in `CashAdvanceDetailsModal.test.js` covering document name truncation, preservation on download click, and fallback behavior.

## [1.9.8] - Nov 9, 2026

### Added
- **Sidebar Branding Dashboard Navigation (`apps/web`):**
  - Wrapped the SBSI logo and "Smart Expense Reimbursement Management System" text lockup in the sidebar header with `<RouterLink to="/dashboard">`.
  - Added click handler to dismiss the mobile drawer (`mobileOpen = false`) when navigated on mobile devices.
  - Added unit test in `apps/web/src/layouts/AppLayout.test.js` validating the brand link renders, targets `/dashboard`, and encloses the logo image and system label.

## [1.9.7] - Nov 9, 2026

### Changed
- **Modal Action Button Layout Standardization (`apps/web` & `docs/DESIGN.md`):**
  - Updated confirmation modal dialog action button containers from horizontally centered (`justify-center`) to right-aligned (`justify-end gap-3`) across `DeleteConfirmModal.vue`, `ConfirmModal.vue`, and `CashAdvanceDetailsModal.vue` acknowledge dialogs.
  - Aligned all dialogs with `docs/DESIGN.md` Section VI.5 ("Right-Aligned Action Footer") and updated `DialogFooter.vue` design guidelines to mandate right-aligned footers (`sm:justify-end`) consistently across all modal types.
- **Duplicate Receipt Modal Cancel Action (`apps/web`):**
  - Added "Cancel" button beside "Upload New One" in `DuplicateReceiptModal.vue`.
  - Added `handleCancel()` to close the modal, dispatch `remove-duplicate-receipt` to clean up the rejected duplicate from the UI without triggering the file uploader dialog, and redirect the user back to `/reimbursements`.
  - Added unit test suite `apps/web/src/components/expenses/DuplicateReceiptModal.spec.js` covering modal event trigger, cancel action with `/reimbursements` navigation, and upload new action.

## [1.9.6] - Nov 7, 2026

### Added
- **End-to-End Receipt Discount Extraction, Reconciliation & UI (`discount_amount` & `discount_type`):**
  - **Database & API Persistence (`apps/api`):** Added migration `2026_11_07_000001_add_discount_fields_to_receipts_table.php` introducing `discount_amount` (`decimal(12, 2)`, default `0.00`) and `discount_type` (`string(50)`, nullable, default `'none'`, canonical values: `none`, `senior`, `pwd`, `student`, `promo`, `employee`, `other`). Updated `Receipt` model, `OcrCallbackRequest`, `OcrCallbackService`, `ReceiptService`, `ExpenseService`, and all receipt Store/Update/Resubmit request validators.
  - **OCR Pipeline Discount Extraction & Classification (`ocr-pipeline`):** Expanded `LABELS["discount_amount"]` in `app/core/layout.py` and added `classify_discount_type()` to detect Senior Citizen (`SC`/`OSCA`), PWD, Student, Promo/Voucher/Coupon, Employee/Staff, and generic discounts. Updated `app/core/reconcile.py` (`resolve_money`, `_fill_gaps`, `_reconcile`), `app/core/items.py`, and `app/core/extraction.py` to sum multiple discount lines, preserve gross item prices, handle Philippine statutory VAT-exempt discount math (`Less VAT` separate from `discount_amount`), and emit `discount_amount` and `discount_type` in `OcrCallbackPayload`.
  - **SERMS Discount UI & Admin Review (`apps/web`):** Added `DISCOUNT_TYPE_OPTIONS`, `normalizeDiscountType`, `formatDiscountTypeLabel`, and `receiptDiscountAmount` in `receiptUtils.js`. Added Discount Type dropdown and Discount Amount input to `ScannedReceiptsList.vue` and `ReceiptUploadModal.vue` (with automatic `0.00` reset/disable when `None` is selected, auto-switching to `Other` when a positive amount is typed, and `Total = max(0, sum(items) - discount_amount)` recalculation). Updated `BaseReceiptDetailModal.vue`, `ReceiptViewModal.vue`, `LiquidationReceiptModal.vue`, `ReceiptDetailsModal.vue`, and `useReimbursementDetails.js` so discounts display in receipt summaries and Admins can edit and save `discount_type` and `discount_amount` during reimbursement review.

## [1.9.5] - Nov 6, 2026

### Added
- **Exported Technical Documentation Suite (`docs/`):**
  - **`docs/TECH_STACK_AND_TOOLS.md`:** Comprehensive technical stack, framework, and tooling audit comparing SERMS (Laravel 13, Vue 3, MySQL 8.0, Redis) and `ocr-pipeline` (FastAPI, Celery, MongoDB 7, PostgreSQL 16 + pgvector, PaddleOCR, Tesseract, Ollama).
  - **`docs/IMPLEMENTED_FEATURES.md`:** Complete functional feature inventory covering all 9 SERMS modules (reimbursements, segmented uploads, 3-strike revisions, cash advance approvals, liquidations, variance math, audit logging, export engine) and `ocr-pipeline` features (virtual strip tiling, blur checks, BIR classification, Ollama JSON assist, pgvector deduplication).
  - **`docs/KNOWN_ISSUES_AND_LIMITATIONS.md`:** Operational risk ledger documenting OCR failure modes on handwritten and faded thermal slips, the $\le 1.5\text{B}-2.0\text{B}$ client AI parameter ceiling, CPU inference latency (5–20s), context truncation (2048/256 tokens), OpenMP CPU thrashing mitigation, Azure \$100 student budget constraints, and compliance gaps G-01 through G-12.
  - **`docs/API_DOCUMENTATION_AND_INTEGRATION.md`:** Exhaustive REST API reference, Web Crypto API pre-encryption wire envelope (`RSA-OAEP` + `AES-256-GCM`), S2S webhook callback schemas, and PRS synchronization contracts.
  - **`docs/TECHNICAL_IMPLEMENTATION_DETAILS.md` & `docs/TECHNICAL_IMPLEMENTATION_DETAILS.docx`:** Deep-dive code-level architecture guide covering the pure-PHP OAEP-SHA256 decoding engine, atomic idempotency MySQL locks, daily penalty calculations, Laplacian variance blur math, OpenCV/Tesseract strip stitching, OpenMP thread constraints, and pgvector cosine similarity algorithms. Refactored to native Word/Google Docs format (`.docx`) and standalone pre-rendered PNG diagram assets (`docs/diagrams/`) to resolve Google Docs rendering limitations.
  - **`docs/diagrams/`:** Exported pre-rendered visual assets: `system_topology.png`, `daily_penalty_accrual.png`, `image_quality_gate.png`, and `end_to_end_sequence.png`.
  - **`docs/index.md`:** Updated Document Suite registry with active references to the newly exported documentation files and compiled `.docx` guide.

## [1.9.4] - Nov 6, 2026

### Fixed
- **Reimbursement Total Field Decimal Truncation:**
  - Added reusable `truncateDecimal(value, digits = 2)` utility in `apps/web/src/utils/formatters.js` to strictly truncate numeric input/values to at most two decimal digits without rounding up centavos.
  - Updated `ScannedReceiptsList.vue` reimbursement receipt Total input with `step="0.01"`, `min="0"`, real-time decimal truncation on `@input`, trailing-dot cleanup on `@blur`, and defensive sanitization in `handleAmountChange`.
  - Updated `ReimbursementFormView.vue` and `receiptUtils.js` (`buildPrefilledReceiptDraft`) so pre-filled and edit-mode receipt amounts, as well as calculated total claims, are truncated to two decimal places.
  - Authored comprehensive unit tests in `apps/web/src/utils/formatters.test.js`, `apps/web/src/components/reimbursements/ScannedReceiptsList.test.js`, and `apps/web/src/utils/receiptUtils.test.js`.

## [1.9.3] - Oct 28, 2026

### Added
- **Receipt Upload Draft Lifecycle & 3-Layer Purge (`fix/cancel-receipt-not-saving`):**
  - **Draft State & "My Expense" Isolation:** Added `is_draft` boolean column to `receipts` (migration `2026_10_28_000001_add_is_draft_to_receipts_table.php`). Unsubmitted uploads inside Reimbursement and Liquidation forms are saved as drafts (`is_draft = true`), hiding them from "My Expense" lists and suppressing premature notifications until the claim or liquidation report is submitted.
  - **3-Layer Cancellation & Purge:** When a user removes a draft receipt or cancels an in-progress form, SERMS automatically:
    1. Purges physical files from Supabase S3 storage (`Storage::disk('supabase')->delete($path)`).
    2. Purges the 384-dimensional vector embedding in `ocr-pipeline` (`DELETE /api/duplicate/embeddings/{receipt_id}`) to prevent false semantic duplicate blocks upon re-upload.
    3. Permanently deletes the draft database record and `file_hash`, recording `RECEIPT_DELETED` in audit logs.
  - **Scheduled Orphan Pruner:** Created `receipts:prune-orphans --hours=24` artisan command (scheduled daily in `routes/console.php`) to automatically clean up abandoned draft receipts for users who close their browser tabs without clicking Cancel.
  - **Frontend Form Cancellation Hooks:** Integrated draft cleanup into `useReceiptUploads.js`, `ReimbursementFormView.vue`, `FileUpload.vue`, `LiquidationSettlementForm.vue`, and `LiquidationsView.vue`, with strict guards ensuring receipts forwarded from "My Expense" or pre-existing liquidation receipts are never touched.

## [1.9.2] - Oct 25, 2026

### Added
- **Receipt-Only Quality Guardrails & Manual Entry Override (`feat/receipt-guardrails`):**
  - **Two-Stage Non-Receipt Detection:** Integrated multi-heuristic fast pre-OCR rejection (face cascade detection + color saturation vs horizontal text edge density) in `ocr-pipeline` alongside post-OCR token/keyword validation (`is_likely_receipt`), blocking non-receipts (selfies, scenery photos, screenshots) from polluting `pgvector` embeddings and MongoDB stores with `rejection_code: "not_a_receipt"`.
  - **Differentiated Warning & User Copy:** Updated `ReceiptQualityRejectionModal.vue` to distinguish "Blurry Receipt Image Detected" vs "Unrecognized Receipt Image", providing tailored guidance for blurry versus non-receipt images and suppressing segmented upload suggestions for non-receipts.
  - **Quality & Rejection Override Flow:** Enabled manual entry bypass across all three receipt upload flows (My Expense `ReceiptUploadModal.vue`, Reimbursements `useReceiptUploads.js`, and Liquidations `FileUpload.vue`). Users can click "Continue Anyway (Enter Manually)" to clear rejection status, mark `isQualityOverridden = true`, unlock the form for manual detail entry, and promote to `processed` upon save.
  - **Automated Verification:** Added PHPUnit callback integration test (`test_not_a_receipt_ocr_sets_status_rejected`) and Vitest modal unit tests (`ReceiptQualityRejectionModal.test.js`), passing 100% of test suites.

## [1.9.1] - Oct 24, 2026

### Changed
- **Test Account Credential Re-Seeding & Synchronization:** Re-provisioned Accounting/Finance test account `Summer Love` (`sum@sbsi.com`) in the central `capstone-auth-module` authentication service (`auth-service`) with credentials (`password`), assigned to the `Accounting` department with the `Admin` role to align with SERMS RBAC requirements. Synchronized documentation across `docs/Build.md` and `docs/agent-setup/SETUP-03-serms.md` to reference `password` consistently with `AGENTS.md`.

## [1.9.0] - 2026-10-22

### Added
- **Idempotency & Duplicate Request Prevention System (`feat/idempotency`):**
  - **Design Specification & Implementation Plan:** Authored `docs/superpowers/specs/2026-10-22-idempotency-system-design.md` and `docs/superpowers/plans/2026-10-22-idempotency-system.md` covering application-wide duplicate prevention across all mutating HTTP requests (`POST`, `PUT`, `PATCH`, `DELETE`).
  - **Database Ledger Table (`idempotency_keys`):** Added migration `apps/api/database/migrations/2026_10_22_000001_create_idempotency_keys_table.php` and Eloquent model `App\Modules\Shared\Models\IdempotencyKey` with unique composite constraint on `(user_id, idempotency_key)`, SHA-256 request hashing, and 24-hour expiration indexing.
  - **Global Middleware Engine (`EnsureIdempotency`):** Created `apps/api/app/Modules/Shared/Http/Middleware/EnsureIdempotency.php` registered globally in `apps/api/bootstrap/app.php`. Intercepts mutating requests, validates payload digest, returns cached deterministic replays with header `X-Idempotent-Replay: true`, flags payload mismatches with `422 Unprocessable Entity`, and halts concurrent in-flight collisions with `409 Conflict`.
  - **Automated Ledger Pruning Command:** Created `php artisan idempotency:prune` (`apps/api/app/Console/Commands/PruneIdempotencyKeys.php`) for automatic purging of expired keys.
  - **Concurrency & Strike Counter Hardening:** Added unique constraint on `cash_advance_disbursements.cash_advance_id` and added `lockForUpdate()` pessimistic row locks across `CashAdvanceService::rejectAdvance`, `ReimbursementService::rejectReimbursement`, and `LiquidationController::audit` to prevent race condition strike double-increments.
  - **Client-Side Universal UUID Auto-Injection (`apiFetch.js`):** Updated `apps/web/src/utils/apiFetch.js` to automatically attach `X-Idempotency-Key` with a valid UUIDv4 token for all `POST`, `PUT`, `PATCH`, and `DELETE` requests while preserving custom caller keys and safe `GET` method exemptions.
  - **Root Confirmation Modal Shielding:** Hardened `ConfirmModal.vue` with immediate synchronous `isClicked` lock, `DeleteConfirmModal.vue` with `loading`/`isSubmitting` prop enforcement and Enter-key suppression, and `DecisionConfirmationModal.vue` with `isSubmitting` enter-key guarding.
  - **View & Composable Re-Entry Guards:** Bound `:loading="submitting"` to `ConfirmModal` in `ReimbursementFormView.vue` and `LiquidationsView.vue`, added re-entry short-circuits in `useReimbursementSubmit.js`, `useLiquidationSubmit.js`, and `useReimbursementDecisions.js`, and hardened action buttons in `CashAdvanceDetailsModal.vue`, `CashAdvanceFormView.vue`, `SegmentedReceiptUpload.vue`, `PolicyView.vue`, and `NotificationsView.vue`.
  - **Automated Test Suites:** Authored comprehensive PHPUnit feature tests (`IdempotencyModelTest`, `IdempotencyMiddlewareTest`, `IdempotencyPruneCommandTest`, `ConcurrencyStrikeLockTest`) and Vitest test suites (`apiFetch.test.js`, `ConfirmModal.test.js`, `DeleteConfirmModal.test.js`), passing 100% of test assertions.

## [1.8.0] - 2026-10-22

### Added
- **Request Audit Trail Section & Unified Lifecycle Timeline (`feat/audit-trail`):**
  - **Zero-Overhead Batch Hydration:** Extended `AuditLogService` with `enrichReimbursements`, `enrichCashAdvances`, and `enrichLiquidations` to batch-hydrate records with an `audit_trail` array in single API queries (`GET /api/reimbursements`, `GET /api/cash-advances`, `GET /api/liquidations`, and their `{id}` detail endpoints) with zero extra HTTP round-trips when opening detail modals.
  - **Dual-Source Chronological Synthesis:** Built hybrid chronological synthesis (`buildReimbursementLifecycleTrail`, `buildCashAdvanceLifecycleTrail`, `buildLiquidationLifecycleTrail`) that merges canonical immutable `audit_logs` records with existing entity timestamps and workflow action tables (`approvalActions`, `disbursements`, `penalties`), guaranteeing complete, unbroken chronological timelines for legacy and newly created records alike.
  - **Role-Scoped IP Address Privacy Masking:** Configured `AuditLogService::formatLogEntry()` to restrict client IP address visibility exclusively to users with administrator privileges (`serms.reimbursements.manage` or accounting department membership). Regular employee accounts receive `ip_address: null` at the service layer before JSON transmission.
  - **Field-Level Diff Sanitization:** Implemented `computeSanitizedDiff()` in `AuditLogService` to strip internal metadata (`id`, timestamps, credentials) from `before_state` vs `after_state` payloads, formatting currency and dates for clear audit viewing.
  - **Mutation Logging Across Financial Workflows:** Added `AuditLogService::log()` calls across `ReimbursementService` (create, update, approve, reject, acknowledge), `CashAdvanceService` (create, approve, reject, disburse, acknowledge, update), and `LiquidationController` (update, hydrate) within active database transactions.
  - **Reusable `<BaseAuditTrail />` Component (`apps/web/src/components/base/BaseAuditTrail.vue`):** Developed a unified, DSD.md-compliant audit trail component structured as a single clean table card with columns for `Time`, `User`, and `Action`. Features collapsible section header, event count badge, sort-order toggle (`Latest First` / `Oldest First`), subtle outline action badges, Medium Date Format timestamps, inline comments, field change diffs, and pagination capping (default 4 items with `"Show all X events"` / `"Show less"` toggle).
  - **Universal Modal Integration:** Embedded `<BaseAuditTrail />` across all 5 request and settlement view modals:
    1. `ReimbursementDetailsModal.vue`
    2. `PayoutDetailsModal.vue`
    3. `CashAdvanceDetailsModal.vue` (both Admin and Employee templates)
    4. `LiquidationReviewModal.vue`
    5. `LiquidationSettlementForm.vue`
  - **Multi-Format Export Engine (`apps/web/src/utils/auditTrailExport.js`):** Built instant client-side export utility supporting XLSX (Excel Spreadsheet XML), CSV (RFC-4180 with UTF-8 BOM), PDF (pure PDF 1.4 corporate report with table pagination and SBSI header), and JSON downloads directly from the `<BaseAuditTrail />` header links (`Download Log: XLSX / CSV / PDF / JSON`).
  - **Medium Date & Time Formatter (`apps/web/src/utils/formatters.js`):** Implemented `formatDateTime(dateStr, options)` rendering dates in the canonical Medium Date Format (e.g. `Oct 22, 2026 · 8:30 PM`) per SERMS Section 8.2 Guardrail 12.
  - **Canonical Documentation Updates:** Documented the request audit trail hydration pattern, privacy masking, and UI component standards in `docs/SERMS.md` (Section 6.4) and `docs/SDD.md` (Sections 3 & 7).

## [1.7.0] - 2026-10-17

### Added
- **Email Notifications and Settings Epic (EP 9: `G2-074` to `G2-079`) Implementation:** Delivered end-to-end email notification infrastructure using Brevo SMTP / Laravel Mail with queued worker processing (`SendNotificationEmailJob` with 3 retries, exponential backoff, and failure logging in `email_logs`), branded SBSI HTML Blade template (`sbsi-notification.blade.php`), `notification_settings` and `email_logs` database migrations and models, two-stage liquidation deadline reminders (`liquidation_due_soon` at `1..3` days, `liquidation_due_today` at `0` days, and overdue penalty alerts), role-scoped Notification Settings UI (`/settings/notifications`), user preference checking (`'skipped by user setting'`) keeping in-app notifications intact, and comprehensive backend and frontend test coverage.
- **Reimbursement Submission Validation & Draft Safeguards:** Added client-side detection to prevent submission of stale or unpersisted temporary receipt IDs (`temp-*`), disabled submission buttons when any receipt is rejected or unpersisted, surfaced clear backend error messages in toast alerts, and added failed validation logging in `StoreReimbursementRequest`.
- **Test Database In-Memory Safeguard:** Added explicit `:memory:` database, `array` session driver, and `array` cache store enforcement in `apps/api/config/database.php` and `tests/TestCase.php` to prevent Docker container environment variables (`DB_DATABASE=serms`) from creating disk artifacts and locking SQLite during automated test runs.
- **Email Notifications and Settings Epic (EP 9: `G2-074` to `G2-079`) Implementation Plan:** Authored [`docs/superpowers/plans/2026-10-22-email-notifications-epic.md`](file:///c:/Projects/smart-expense-management-system/docs/superpowers/plans/2026-10-22-email-notifications-epic.md) covering Brevo SMTP / Laravel Mail queued dispatch (`SendNotificationEmailJob` with 3 retries and backoff), branded SBSI HTML Blade template (`sbsi-notification.blade.php`), `email_logs` and `notification_settings` tables, two-stage liquidation deadline reminders (`liquidation_due_soon` at `1..3` days left and `liquidation_due_today` at `0` days left, plus overdue alerts), role-scoped Notification Settings UI (`/settings/notifications`), and pre-send preference checking (`'skipped by user setting'`) with independent in-app notifications.
- **Notifications Epic (EP 8: `G2-065` to `G2-073`) Implementation Plan:** Authored [`docs/superpowers/plans/2026-10-22-notifications-epic.md`](file:///c:/Projects/smart-expense-management-system/docs/superpowers/plans/2026-10-22-notifications-epic.md) covering the `notifications` table, `NotificationService` cross-module triggers (`Reimbursements`, `Cash Advances`, `Liquidations`, `My Expense`), daily scheduled liquidation deadline & overdue checks (`CheckLiquidationDeadlines`), anchored top-bar bell dropdown with 30-second auto-polling, `/notifications` history page, and deep-linking (`useNotificationDeepLink.js`) with `403 Forbidden` access-denied protection.
- **Report Epic (EP 6: `G2-054` to `G2-061`) Single-Record PDF Export Engine:** Implemented zero-dependency pure PDF generator (`ReportGeneratorService`), `/api/reports/{type}/{id}` download endpoint (`ReportController`), strict RBAC & immutable audit logging (`AuditLogService::log()`), frontend export composable (`useReportExport.js`), and export triggers across Reimbursements, Cash Advances, and Liquidations. Resolved mojibake by adopting standard ISO `PHP ` currency formatting and eliminated all blue vertical sidebars in favor of a clean, minimalist corporate layout.
- **Collision-Proof PDF Record Summary & Notes Box Geometry:** Fixed vertical coordinate overlap where `PURPOSE / BUSINESS RATIONALE` (and notes callout boxes) collided with the 5th scalar row (`AMOUNT ADVANCED` and `PENALTY AMOUNT`) in liquidation reports. Replaced legacy single-point anchor with top-down bounding geometry ensuring 14pt vertical separation, clean word-wrapping up to 2 lines, and dynamic card bottom boundary calculation.
- **Liquidation Countdown Progress Tracker Test Seeder:** Added [`LiquidationCountdownTestSeeder.php`](file:///c:/Projects/smart-expense-management-system/apps/api/app/Modules/Liquidations/Database/Seeders/LiquidationCountdownTestSeeder.php) (and alias [`LiquidationCountdownSeeder.php`](file:///c:/Projects/smart-expense-management-system/apps/api/database/seeders/LiquidationCountdownSeeder.php)) to seed target account `summer love` (`sum@sbsi.com`) with liquidations having due dates 10 days from now (`2026-10-30`) and 1 month from now (`2026-11-20`) with associated cash advances, disbursements, and receipts to test the countdown progress tracker (`DaysLeftBadge.vue`). Covered with feature test suite [`LiquidationCountdownTestSeederTest.php`](file:///c:/Projects/smart-expense-management-system/apps/api/tests/Feature/LiquidationCountdownTestSeederTest.php).
- **ONE UI Design System Specification:** Placed `documentations/DESIGN.md` — the canonical ONE UI Design System & Frontend Guardrails specification covering logo/brand marks, typography (Poppins/Montserrat), canonical colour palette, 8px spacing grid, elevation/shadow levels, component standards (sidebar, header, metric cards, modals, forms, selects, toasts, banners, tables, badges), interaction state matrix, and loading state bifurcation.
- **Specialized Contextual Color Tokens:** Added `primary.hover` (`#2F2F8E`), `primary.pressed` (`#1E1E66`), `destructive.hover` (`#DC2626`), `destructive.pressed` (`#B91C1C`), `warning.banner` (`#FFFDF0`), `warning.icon` (`#D97706`), `avatar` (`#A7A7C8`), and `eyebrow` (`#8086A3`) to `tailwind.config.js` and `index.css` `:root` variables per Section III of DESIGN.md.

### Changed
- **Countdown Progress Tracker Dynamic Status Colors & Persistent Visibility (`g2-063`):** Updated [`DaysLeftBadge.vue`](file:///c:/Projects/smart-expense-management-system/apps/web/src/components/base/DaysLeftBadge.vue) to always display when a valid due date is present (removed `isSettledOrLiquidated` exclusion). Implemented a 3-tier dynamic color palette: **Green** (`bg-emerald-50 text-emerald-700 border-emerald-200`, fill `bg-emerald-600`) when $> 10$ days remain; **Yellow** (`bg-amber-50 text-amber-700 border-amber-200`, fill `bg-amber-500`) when in the middle ($4 - 10$ days remain); and **Red** (`bg-red-50 text-red-700 border-red-200`, fill `bg-red-600`) when close to deadline ($\le 3$ days) or overdue. Unit test suite [`DaysLeftBadge.test.js`](file:///c:/Projects/smart-expense-management-system/apps/web/src/components/base/DaysLeftBadge.test.js) updated to validate all states and thresholds.
- **Toast Hover-Pause (Section VI.8):** Implemented pause-on-hover timer logic in `useToast.js` — timer pauses when cursor enters toast, resumes on leave. Changed default auto-dismiss duration from 5000ms to 4000ms per spec. Added slide-out-right leave animation to `ToastNotification.vue`.
- **Button Interaction States (Section VII):** Updated `Button.vue` (shadcn) — primary uses `hover:bg-primary-hover` / `active:bg-primary-pressed`, destructive uses `hover:bg-destructive-hover` / `active:bg-destructive-pressed`, secondary/outline use default border (`#CBD5E1`) with `hover:border-slate-300` (`#94A3B8`). Updated `.btn-primary`, `.btn-cta`, `.btn-danger`, `.btn-secondary` CSS utility classes with exact spec hover/pressed colours and `scale(0.98)`.
- **DeleteConfirmModal (Section VI.5):** Refactored to centered header pattern with circular status icon badge on top, BaseButton components replacing raw `<button>` elements, and shadcn Dialog wrapper.
- **BaseWarningBanner (Section VI.9):** Warning type now uses `bg-warning-banner` (`#FFFDF0`), `border-amber-300` (`#FCD34D`), and `text-warning-icon` (`#D97706`) per persistent banner spec.
- **KPI Metric Cards (Section VI.4):** Made borderless with pure white surface (`bg-white`), added `shadow-md` + `-translate-y-1` hover lift. Metric numbers changed to Dark Slate (`#1E293B`), category labels to eyebrow colour (`#8086A3`).
- **AppLayout (Section VI.1–VI.2):** Avatar uses `bg-avatar` token. Active nav links use `border-brand-deep-border`. Default nav text/icons changed to `text-white/60` per `rgba(255,255,255,0.6)`. Page title and user display name use `text-slate-700` (`#1E293B`).
- **Badge Class (Section VI.11):** Removed `uppercase` from `.badge` CSS class — spec mandates Title Case badge labels.
- **Input Field (Section VI.6):** Default border changed from `border-black/10` to `border-slate-200` (`#E2E8F0`), background from `bg-white/90` to pure `bg-white` per Section III surface spec.
- **Tailwind Border Token:** Fixed `border` colour from `#E2E8F0` to `#CBD5E1` to match CSS `--border` variable and spec Section III.

## [1.6.0] - 2026-10-16

### Added
- **Headless UI Primitives (`@/components/ui/`):**
  - Integrated `radix-vue` headless primitives, `class-variance-authority`, `tailwind-merge`, and `clsx` via `cn()` utility (`apps/web/src/utils/cn.js`).
  - Implemented Tier 1 primitives: Button (`ui/button`), Badge (`ui/badge`), Card (`ui/card`), Dialog (`ui/dialog`), DropdownMenu (`ui/dropdown-menu`), and Skeleton (`ui/skeleton`).
  - Added `components.json` for shadcn-vue schema interoperability.
  - Added unit test suite `apps/web/src/components/ui/ui-primitives.test.js` validating all headless primitives.
  - Added `apps/web/src/layouts/AppLayout.test.js` validating navigation chrome rendering and theme adherence.

### Changed
- **ONE UI Token & Variable Infrastructure:**
  - Modernized `apps/web/src/assets/index.css` with semantic `:root` CSS variables matching ONE UI canonical tokens (`--primary` `#252578`, `--secondary` `#2E85D8`, `--brand-deep` `#3A3A85`, `--brand-deep-border` `#4E4E91`, `--card` `#FFFFFF`, `--background` `#F8F9FA`, `--destructive` `#EF4444`).
  - Configured `apps/web/tailwind.config.js` with `tailwindcss-animate`, 4 elevation shadow levels (`shadow-xs`, `shadow-sm`, `shadow-lg`, `shadow-2xl`), and CSS variable bindings while preserving Tailwind CSS 3.4.
- **Layered Adapter Pattern Refactoring (`@/components/base/`):**
  - Refactored `BaseButton.vue` to wrap `ui/button` while preserving hold-to-confirm (`requireHold`), danger button mapping, and bifurcated `Loader2` action spinner.
  - Refactored `StatusBadge.vue` to wrap `ui/badge`, enforcing Title Case formatting and 3 visual status tiers (`Approved`, `Pending`, `Rejected`, etc.).
  - Refactored `BaseInput.vue` with 8px vertical rhythm, uppercase tracking eyebrow labels, and `#2E85D8` focus rings.
  - Refactored `BaseModal.vue` and `ConfirmModal.vue` to wrap `ui/dialog` with `VisuallyHidden` accessible dialog titles and backdrops.
  - Refactored `ToastNotification.vue` with top-right viewport positioning (`top: 24px; right: 24px; z-index: 1200;`), Level 3 shadow, 4px left strip, and pause-on-hover timers.
- **Navigation & Layout Chrome Modernization:**
  - Refactored `AppLayout.vue` with ONE UI sidebar navigation (Brand Primary `#252578`, Brand Deep active link `#3A3A85` with `#4E4E91` container border, 260px expanded / 70px collapsed widths, uppercase category eyebrows).
  - Modernized top header with Lucide `PanelLeft` sidebar toggle, user initials avatar (`#A7A7C8`), and Radix `DropdownMenu` profile popover.
- **Complex Table & Modal Widgets Modernization:**
  - Refactored `BaseTable.vue` to Section VI.10 specifications (56px row height, uppercase Poppins headers, BaseButton pagination).
  - Refactored `ActionDropdownMenu.vue` to wrap Radix DropdownMenu primitives, removing ad-hoc coordinate calculations.
  - Modernized raw buttons in `DecisionConfirmationModal.vue`, `ReceiptUploadModal.vue`, `CashAdvanceDetailsModal.vue`, and `LiquidationSettlementForm.vue` to `<BaseButton>`.

---

## [1.5.8] - 2026-10-08

### Added
- **Automated CI Workflow (`.github/workflows/ci.yml`):**
  - Continuous integration pipeline running Vitest test suite (`apps/web`) and PHPUnit test suite (`apps/api`) on pull requests and pushes to `staging` and `main`.
  - Configured dependency caching for npm and composer to optimize CI execution times.
- **Automated Testing & Integration Test Mandate:**
  - Added strict convention and Definition of Done mandate in `AGENTS.md` and `docs/Build.md` requiring developers and AI agents to author automated tests (such as integration/feature tests in `tests/Feature` and Vitest component/store tests) whenever introducing or modifying features and functions.

---

## [1.5.7] - 2026-10-08

### Removed
- **Graphify Knowledge Graph Integration:**
  - Removed project-level knowledge graph artifacts (`graphify-out/` directory containing AST cache, graphs, and reports).
  - De-registered Git hooks (`.git/hooks/post-commit`, `.git/hooks/post-checkout`) and custom Git merge driver (`merge.graphify`).
  - Removed Graphify merge attribute from `.gitattributes`.
  - Removed OpenCode tool-execution hook plugin and configuration (`.opencode/`).
  - Removed Graphify agent rules and prompt instructions from `AGENTS.md`.

---

## [1.5.6] - 2026-09-06

### Added
- **One-Shot Agent Setup Guides (`docs/agent-setup/SETUP-0{1,2,3}-*.md`):**
  - Added three standalone subagent-executable setup guides covering zero-state hosts (no Git/Docker/Node/PHP/Python preinstalled): `SETUP-01-capstone-auth-module.md` (Laravel 13 + Vue 3.5 + MySQL 8.0 + Redis + Nginx gateway, host ports 5173/8000/33066, 32-char `INTERNAL_ENCRYPTION_KEY` gate), `SETUP-02-ocr-pipeline.md` (Python 3.12 + FastAPI + Celery + Mongo 7 + pgvector + Ollama `qwen2.5:1.5b`, host ports 8010/6380/27017/5433/11434, `alembic upgrade head` gate), and `SETUP-03-serms.md` (Laravel 13 Modular Monolith + Vue 3.4 + MySQL + Supabase + auth/OCR integrations, host ports 8000/5002/3306/8080, Supabase/Auth/AI key gates).
  - Each guide enforces ordered phases (host triage → zero-state installer via `winget` + official fallbacks → clone → `shared-capstone-network` → `USER-INPUT-GATE` secret collection → `compose up --build` → migrations/seeds → verification matrix → troubleshooting → Definition of Done), documents the `8000` host-port collision between auth-module and SERMS, and requires evidence-based completion reporting.

### Changed
- **Setup guides relocated into their home repos (single-source rule):**
  - `SETUP-01-capstone-auth-module.md` now lives at `docs/agent-setup/` in `capstone-auth-module` (v1.1.0 in-repo edition, registered in that repo's `docs/README.md` hub); `SETUP-02-ocr-pipeline.md` now lives at `docs/agent-setup/` in `ocr-pipeline` (v1.1.0 in-repo edition, registered in that repo's `docs/index.md` suite table + change log).
  - All three guides now assume the repo is already cloned (locate-and-verify Phase 2 with clone-as-fallback-only) since the guide ships with the clone.
  - SERMS `docs/agent-setup/` keeps only its own `SETUP-03-serms.md` (v1.1.0) plus a pointer `README.md` cross-linking all three canonical homes — no duplicate copies across repos.
- **Subagent guardrails tightened in all three setup guides:**
  - Each guide's directive now forbids creating/adding new files or changing the codebase unless necessary to finish setup (anything beyond `.env` copies, network/containers/volumes, migrations/seeds/keys, and ordered cache clears requires STOP + user approval).
  - Each guide now requires consulting the repo's other docs (`AGENTS.md`, `docs/` hub/suite, canonical read order) as references whenever a step is ambiguous or fails, citing the resolving doc and stopping on conflicts instead of guessing.

---

## [1.5.5] - 2026-09-06

### Added
- **Constructive Pushback & Logical Rigor Rule (Anti-Sycophancy):**
  - Added explicit AI and subagent governance across [`AGENTS.md`](../AGENTS.md), [`docs/Build.md`](Build.md), [`docs/SERMS.md`](SERMS.md), and [`.agents/rules/smart-expense-reimbursement-management-system.md`](../.agents/rules/smart-expense-reimbursement-management-system.md) mandating constructive pushback against flawed, suboptimal, or non-compliant user inputs.
  - Required that all critiques, pushbacks, and technical recommendations be strictly backed by sound logical basis, architectural principles, and verifiable evidence rather than arbitrary or performative dissent.

---

## [1.5.4] - 2026-09-05

### Added
- **Reusable Receipt Image Preview Component (`ReceiptImagePreview.vue`):**
  - Extracted the standardized receipt image preview card into `src/components/base/ReceiptImagePreview.vue`, encapsulating the 1-based index badge, cleaned filename, vertical `aspect-[3/4]` frame with `BaseReceiptImage` (`object-contain`), processing/uploading spinners, and action slot/delete trigger (conforming to Axiom A-09).
  - Integrated interactive hover preview and click-to-preview lightbox backed by `ImagePreviewModal.vue` with zoom, pan, rotate, and reset controls.

### Changed
- **Liquidation Request View & Review Surfaces:**
  - Upgraded [`LiquidationReviewModal.vue`](apps/web/src/components/liquidations/LiquidationReviewModal.vue) receipts section to render the standardized `ReceiptImagePreview` card layout with full-screen zoom inspection support.
  - Enhanced [`BaseReceiptDetailModal.vue`](apps/web/src/components/base/BaseReceiptDetailModal.vue) with clickable zoom trigger and integrated `ImagePreviewModal` so receipt detail inspections across liquidations and expenses support full-resolution lightbox viewing.
  - Refactored [`ScannedReceiptsList.vue`](apps/web/src/components/reimbursements/ScannedReceiptsList.vue) to reuse `ReceiptImagePreview.vue`, eliminating redundant inline preview markup.

---

## [1.5.3] - 2026-09-05

### Fixed
- **Unified Roadmap Stepper & Flow Map Streamlining:**
  - Removed intermediate "Under Review" and "Decision" steps, streamlining the lifecycle into 6 canonical steps (`Request` → `Approval` → `Disbursed` → `Acknowledged` → `Liquidation` → `Settled`).
  - Fixed terminal settlement logic in `stepState()` where `isTerminalSuccess` was unreachable, resolving the bug where approved settlements remained stuck in "Pending".
  - Prevented Approver/Disburser admin actors from leaking into Step 5 (Liquidation) prior to employee submission by introducing strict future guards and isolating liquidation submitter/auditor history.
  - Fixed missing step metadata (approver, disburser, dates) in the Cash Advance View Modal by preserving relational history in `CashAdvancesView.vue`, enriching `roadmapCashAdvance` and `roadmapHistory` in `CashAdvanceDetailsModal.vue`, and adding robust fallbacks for approvals, disbursements, and acknowledgments in `UnifiedRoadmapStepper.vue`.

---

## [1.5.2] - 2026-09-03

### Changed
- **Error Handling Architecture Transfer:** Transferred and centralized the explicit boundary `try-catch`, database transaction integrity, and error handling rules from [`AGENTS.md`](../AGENTS.md) into [`docs/Build.md`](Build.md). Added a dedicated backend Golden-Path code pattern (`#### 3. Error Handling & Boundary Resilience Pattern`) showcasing proper exception handling, actionable contextual logging, and re-throwing to preserve atomic `DB::transaction` rollbacks.

---

## [1.5.1] - 2026-09-01

### Changed
- **Documentation Suite Refactor & Standardization:** Added prominent, standardized `> **What this is:**` sections across all 10 core documentation files in `docs/` (`index.md`, `SERMS.md`, `PRD.md`, `SAD.md`, `SDD.md`, `DSD.md`, `Build.md`, `OPS.md`, `QAD.md`, `CHANGELOG.md`), detailing the exact role, purpose, audience, and canonical hierarchy of each document.
- **Header Metadata Alignment:** Standardized metadata blocks across all documentation files with uniform Project, Client/Partner (SBSI), Academic Context (Capstone 1 & 2), Date, Version (1.5.1), Status, Canonical Spec links, and Related Docs cross-references.
- **Index & Link Integrity:** Corrected relative links in `docs/index.md` (e.g., `PR_GUIDE.md` -> `../documentations/PR_GUIDE.md`), updated document suite tables with latest version numbers and last reconciled dates.
- **Schema & Component Specifications:** Reconciled `revision_count` column and asynchronous OCR callback services in `docs/SDD.md` and updated 23-status badge mapping in `docs/SERMS.md` and `docs/DSD.md`.
- **Root AGENTS Materialization:** Re-materialized `../AGENTS.md` from `docs/Build.md` to guarantee perfect synchronization across developer and AI agent entrypoints.
- **Medium Date Formatting Standard (AI & Subagent Rule):** Added mandatory instruction across `docs/Build.md`, `AGENTS.md`, `docs/SERMS.md`, `docs/DSD.md`, and `.agents/rules/` requiring AI subagents and developers to format and display human-readable dates in the **Medium Date Format** (e.g. `Sept 1, 2026`).

---

## [1.5.0] - 2026-08-26

### Added
- **Liquidation OCR Pipeline Integration:** Liquidation receipt uploads now call the real `ocr-pipeline` (`AsyncOcrEngineInterface` / `AiServiceOcrEngine`) instead of `TesseractOcrEngine` placeholder (`Fake Vendor (Mocked AI)` / 1250.00). Added `LiquidationController::scan` async dispatch (Supabase store → `Receipt(status=processing)` → `Bus::dispatch(DispatchReceiptToAiService)` → `POST /api/ocr/process`), plus `GET /liquidations/receipts/{id}` (polling) and `POST /liquidations/receipts/{id}/retry-ocr`. Added `LiquidationOcrCallbackController` + `POST /liquidations/receipts/{id}/ocr-callback` (`auth.ai-service-api`) reusing `OcrCallbackService` for vendor/tin/total/VAT/items hydration. Frontend `FileUpload.vue` `simulateOCR` now handles `processing` → 3s polling (via `GET /reimbursements/receipts/{id}` with liquidation fallback), surfaces `rejected`/`failed` with `Retry OCR`, blocks submit while `ocrStatus === 'processing'` (`LiquidationsView::isReceiptOcrProcessing` → `hasIncompleteReceiptFields`), and displays confidence badge.

### Changed
- **LiquidationController:** Removed sync `OcrEngineInterface::extractReceiptData(tempPaths)` fake; now uses `ValidatesReceiptDuplicates` guard + `AsyncOcrEngine` dispatch with audit `RECEIPT_CREATED` / `RECEIPT_OCR_RETRY`. Duplicate uploads clean up Supabase objects before 422.
- **FileUpload.vue:** Rewrote `simulateOCR` to `hydrateEntry`/`startPolling`/`retryOcr` lifecycle, 422 duplicate vs quality branching, `pollTimers` map, `onBeforeUnmount` cleanup, `Retry OCR` button, processing/rejected/failed UI states.
- **LiquidationsView.vue:** Added `isReceiptOcrProcessing` computed to gate liquidation submit during OCR.

### Fixed
- **LiquidationsServiceProvider:** Now aliases `auth.ai-service-api` so liquidation callback route is resolvable regardless of provider boot order.

## [1.4.2] - 2026-08-24

### Fixed
- **Cash Advance Admin Password Bypass (Security):** Fixed critical authorization bypass where `POST /{id}/approve`, `POST /{id}/reject` (action=revise/reject), and `POST /{id}/disburse` proceeded without password verification, incorrectly incrementing `revision_count` and flipping status to `revise`/`rejected`/`approved`/`disbursed` even with wrong/empty password. Root cause was missing `PasswordVerificationService::verify()` in `CashAdvanceController`/`CashAdvanceService` and missing `password` validation in `Approve/Reject/DisburseCashAdvanceRequest` (so `validated()` stripped it), plus frontend `cashAdvance.js`/`CashAdvanceDetailsModal.vue` dropping `adminPassword`. Enforced strict `password: required|string` validation, added service-level guard `PasswordVerificationService::verify()` at top of `DB::transaction` BEFORE any `revision_count` increment/status update (abort with 422 `errors.password` preserving rollback), controller 422/403 handling, and frontend wiring `adminPassword.value` through `DecisionConfirmationModal` → store (with 422 `errors.password` toast, modal stays open). Behavior now matches `ReimbursementService`/`LiquidationController::audit` and `CashAdvanceService::deleteAdvance` correct pattern.

### Changed
- **Requests:** `ApproveCashAdvanceRequest`, `RejectCashAdvanceRequest`, `DisburseCashAdvanceRequest` now require `password`.
- **Frontend:** `stores/cashAdvance.js` signatures `approveRequest(id,comment,password)`, `rejectRequest(id,comment,action,password)`, `disburseRequest(id,payload,password)` and `CashAdvanceDetailsModal.vue` `confirmAdminDecision()` now require and forward password, surfacing 422 password errors.

## [1.4.1] - 2026-08-24

### Fixed
- **Cash Advance Revision 500 (ENUM truncation):** Fixed `SQLSTATE[01000]: Data truncated for column 'action'` when requesting revision (`POST /{id}/reject` action=`revise`). Root cause was `cash_advance_approval_actions.action` ENUM limited to `['approved','rejected']` while `CashAdvanceService::rejectAdvance()` correctly inserted `'revised'` (past tense consistent with `approved`/`rejected`) for counts 1-3. Added migration `2026_08_24_000003` to extend ENUM to `['approved','rejected','revised']`. Hardened `CashAdvanceService` with defensive `allowedActions` guard (422) and boundary try-catch with `Log::error` that converts enum violations to 422 while preserving `DB::transaction` rollback. Terminal 4th strike still forces `rejected`.

### Changed
- **CashAdvanceApprovalAction:** Added docblock for allowed actions and migration note.

## [1.4.0] - 2026-08-24

### Added
- **Revise / 3-Strike Rejection Workflow:** Admins now choose `Revise` (needs revision) or `Reject` via dropdown for reimbursements, cash advances, and liquidations. Both actions set status to `revise` and increment `revision_count`; when `revision_count > 3` the system auto-transitions to terminal `rejected`. Added `revise` status badge (`bg-orange-500`, "Needs Revision"). Updated `StatusBadge.vue`, `DecisionConfirmationModal`, Pinia stores, and audit logs (`CLAIM_REVISED` / `CLAIM_REJECTED`).
- **DB Migrations:** `revision_count` integer column added to `reimbursements`, `cash_advances`, and `liquidations` tables with threshold enforcement in services/controllers.

### Changed
- **Rejection Logic:** Former direct `status='rejected'` on admin action now maps to `status='revise'` until threshold exceeded. Employee self-edit now allowed on `pending` and `revise` (previously `pending`/`rejected`). `rejected` is system-derived only (terminal).
- **Docs:** `SERMS.md` §7.3 badge map and `DSD.md` §2 status table updated to 23-status map including `revise`.

## [1.3.1] - 2026-08-19

### Added
- **Browser Testing & Interactive Debugging Rule (Gemini & AI Agents):** Added explicit rule to `AGENTS.md` and `docs/Build.md` requiring Gemini and AI agents to prioritize browser testing (`browser_subagent`, DevTools, interactive DOM/console inspection, and screenshot verification) when debugging frontend issues, responsive layouts, and UI flows whenever applicable.
- **Seeded Test Accounts & Debugging Credentials Register:** Added comprehensive reference table to `AGENTS.md` and `docs/Build.md` documenting seeded accounts (`employee@example.com`, `sum@sbsi.com`, `admin@example.com`, `approver@example.com`, `finance-admin@example.com`, `finance@example.com`, `manager@example.com`, `sales@example.com`, `superadmin@sbsi.com`, `employee.accounting@sbsi.com`, `manager.finance@sbsi.com`, `manager.operations@sbsi.com`, `supervisor.sales@sbsi.com`, `employee.it@sbsi.com`) across roles and departments to assist subagents in role-based debugging and authentication flows.

---

## [1.3.0] - 2026-08-17

### Added
- **Client Profile & Background (SBSI):** Documented client organization — Science Biotech Specialties Inc. (SBSI, `https://sbsi.com.ph/about-us/`) — and integrated operational requirements for laboratory and field engineers into `SERMS.md`, `PRD.md`, `SAD.md`, and `SDD.md`.
- **Capstone Academic Context & Turnover Schedule:** Documented 3rd & 4th year Capstone project requirements across all documentation suites. Recorded timeline: Capstone 1 concluded July 2026; Capstone 2 runs September–December 2026 focusing on multi-system integration, Azure deployment, and final client turnover.
- **Multi-System Enterprise Ecosystem:** Documented the 4 integrated sub-systems (CMS - Customer Management System, SERMS - Smart Expense Reimbursement Management System, PRS - Productivity Report System, TS - Ticketing System) and the central `capstone-auth-module` reverse proxy / SSO gateway.
- **Cloud Infrastructure (`capstone-azure-infra`):** Documented the deployment architecture in `docs/OPS.md` and `docs/SERMS.md` deployed on Microsoft Azure using Azure for Students ($100 USD/year credit limit) orchestrating SERMS, `capstone-auth-module`, and `ocr-pipeline`.
- **Lightweight AI Model Ceiling (1.5B Parameters):** Recorded SBSI client server constraint strictly capping AI models to <= 1.5B parameters (e.g. Qwen 2.5 1.5B / SmolLM + Tesseract OCR in `ocr-pipeline`).
- **Client Server Tech Decisions & Override Register:**
  - **MySQL 8.0 & Vue 3:** Recommended and approved by SBSI.
  - **Redis (Status: Overridden):** Containerized in Docker for caching & queue processing; configured with transparent fallback to MySQL database driver for client turnover compliance.
  - **MongoDB (Status: Overridden):** Isolated exclusively inside the external `ocr-pipeline` AI service project; zero direct MongoDB dependencies in SERMS.
- **Cross-Project Access Rule for Sister Repositories:** Added explicit instructions to `AGENTS.md`, `docs/Build.md`, and `docs/SERMS.md` granting AI subagents permission to inspect and search sister repositories (`capstone-auth-module`, `capstone-azure-infra`, `ocr-pipeline`, `CMS`, `PRS`, `TS`) in read and search mode only (`view_file`, `grep_search`, `list_dir`) for additional context, while strictly prohibiting write, edit, delete, or commit actions unless explicitly permitted by the user.

---

## [1.2.0] - 2026-08-17

### Added
- **SERMS Master Specification (`docs/SERMS.md`):** Authored the unified canonical single source of truth document for the entire SERMS ecosystem. Consolidates product vision & BIR rules (PRD), software architecture & AI model (SAD), modular system design, crypto & OCR sequence (SDD), design system & 22-status badge map (DSD), build setup & non-negotiable guardrails (Build/AGENTS), operations & SLOs (OPS), and QA test plans & receipt datasets (QAD). Established strict governance requiring all agents and developers to cross-reference `docs/SERMS.md` first before modifying code or downstream docs.
- **Fullstack Reusability & Anti-Duplication Rules:** Added explicit rules in `docs/Build.md` and `AGENTS.md` requiring developers and subagents to inspect existing components, composables, utils, and backend endpoints/services before writing new code, and to extract modular abstractions first rather than introducing duplicated inline code or redundant endpoints.
- **Real Receipt Upload Testing Guide:** Added testing procedures and sample receipt fixtures dataset documentation to `docs/QAD.md` utilizing images in `docs/receipts/` (`receipt 1.jpg`, `receipt 2.jpg`, `receipt 3.jpg`) for OCR queue verification, BIR VAT checks, and duplicate detection testing by subagents.
- **Clean Component & Border Rules:** Added explicit rules to `docs/DSD.md` prohibiting colored top borders (`border-t`), colored top accent bars, and heavy background/border trims on cards and panels unless specifically requested by the user.
- **Documentation Change Log Governance:** Added rules across `AGENTS.md` and `docs/Build.md` requiring every documentation change in `docs/` and `documentations/` to be logged in `docs/CHANGELOG.md`.
- **Read-Only Git Inspection Rule:** Added clear convention to `AGENTS.md` and `docs/Build.md` encouraging AI agents to inspect `git status`, `git log`, and `git diff` in read-only mode for richer context while strictly forbidding write/commit/push mutations without explicit user consent.
- **SAD.md Development Guardrails Linkage:** Linked `docs/SAD.md` directly to canonical `docs/Build.md` (§5 Development Guardrails) and summarized fullstack reusability, immutable auditing, boundary error handling, payload encryption, and git inspection rules.
- **Dedicated Changelog:** Extracted historical change log from `docs/index.md` into this standalone `docs/CHANGELOG.md`.

### Changed
- **SDD.md — Module Roster & Cross-Cutting Services:** Updated the Module Roster in `docs/SDD.md` with complete namespace mappings, route prefixes, controllers, services, and queue workers for all 9 modules (`CashAdvances`, `Reimbursements`, `Expenses`, `Liquidations`, `AuditLogs`, `Notifications`, `Ai`, `Users`, and `Shared`). Expanded the Cross-Cutting Services table with `AiServiceOcrEngine` and `TesseractOcrEngine`.
- **SDD.md — Architecture & OCR Pipeline Flow:** Revised High-Level Architecture Mermaid diagram in `docs/SDD.md` to explicitly illustrate the External AI OCR Service within External Cloud & AI Services, along with bidirectional OCR pipeline flows (Worker dispatching `POST /api/ocr` and AI Service calling back to `POST /api/serms/ai/ocr-callback`). Added External AI OCR Service entry to External Integrations catalog table.
- **DSD.md — Status Badge Map:** Fully synchronized status color table with `StatusBadge.vue` config, including all 22 statuses (`granted`, `paid`, `settled`, `unliquidated`, `overpayment`, `reject`, `automatic-rejected`, `pending-admin-re-review`, `draft`, `flagged`, and fallback). Corrected discrepancies for `pending` (`bg-amber-500`), `disbursed` (`bg-blue-600`), and `under-review` (`bg-violet-600`).
- **DSD.md — Typography System:** Updated Google Fonts `@import` weights in `DSD.md` and documented centralized typography CSS variables (`--font-primary`, `--font-mono`), Tailwind font tokens, centralized text utility classes (`.text-page-title`, `.text-section-title`, `.text-field-label`, `.text-body`, `.text-caption`, `.text-value`, `.text-value-lg`), and component label tracking (`11px`, `tracking-[0.02em]`).

---

## [1.1.0] - 2026-08-15

### Added
- **Boundary Error Handling Rule:** Implemented strict error handling rules in `docs/Build.md`, `AGENTS.md`, `docs/SAD.md`, and AI governance specifications requiring explicit `try-catch` blocks at system execution boundaries (Supabase storage, OCR queue tasks, external HTTP APIs, filesystem I/O, background jobs) with zero silent swallowing.

### Removed
- Cleaned up obsolete subagent references from `docs/SAD.md` and `docs/index.md`.

---

## [1.0.0] - 2026-07-12

### Added
- **Security & Analytics Optimization:** Smart-merged `docs/PRD.md`, `docs/SAD.md`, `docs/SDD.md`, `docs/DSD.md`, `docs/Build.md`, and `docs/index.md` to reflect client-side pre-encryption (AES-256-GCM + RSA wrapper) for sensitive mutations and database-driven SQL aggregation (`SUM`, `COUNT`, `GROUP BY`) for dashboard/report analytics.
- **Operational Guides:** Generated `AGENTS.md`, `docs/OPS.md`, and `docs/QAD.md`.

---

## [0.1.0] - 2026-07-05

### Added
- **Foundation Documentation:** Initialized project workspace with core architectural and design specifications:
  - `docs/PRD.md`: Business requirements, OCR workflow, BIR VAT compliance, cash advances, and liquidations.
  - `docs/SAD.md`: Modular monolith software architecture, security layers, and AI governance.
  - `docs/SDD.md`: Domain-driven module design, schema, and API integrations.
  - `docs/DSD.md`: Visual design primitives, clinical color tokens, typography, and base component specs.
  - `docs/Build.md`: Canonical developer operating manual and setup guide, materialized to root `AGENTS.md`.
  - `docs/index.md`: Master documentation index.
