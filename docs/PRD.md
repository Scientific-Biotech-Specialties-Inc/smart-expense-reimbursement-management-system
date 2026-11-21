# Product Requirements Document (PRD): Smart Expense & Reimbursement Management System (SERMS)

**Project:** Smart Expense & Reimbursement Management System (SERMS)  
**Client / Partner:** Science Biotech Specialties Inc. (SBSI) — [https://sbsi.com.ph/about-us/](https://sbsi.com.ph/about-us/)  
**Academic Context:** 3rd & 4th Year Capstone Project (Capstone 1: Ended July 2026 · Capstone 2: September–December 2026)  
**Date:** 2026-09-01  
**Version:** 1.5.1  
**Owner:** SERMS Engineering & Product Team  
**Status:** Active  
**Last reconciled:** 2026-09-01 (Documentation suite refactor & standardization of 'What this is' sections across all docs)  
**Canonical Spec:** [SERMS.md](SERMS.md) · **Related Docs:** [index.md](index.md) · [SAD.md](SAD.md) · [SDD.md](SDD.md) · [DSD.md](DSD.md) · [Build.md](Build.md) · [OPS.md](OPS.md) · [QAD.md](QAD.md) · [CHANGELOG.md](CHANGELOG.md) · [AGENTS.md](../AGENTS.md)

---

> **What this is:** The Product Requirements Document (PRD) detailing the business objectives, client problem statement for Science Biotech Specialties Inc. (SBSI), user personas, functional domain requirements (reimbursements, cash advances, liquidations, daily penalties, duplicate detection, BIR VAT compliance), and key user journeys within the integrated Capstone enterprise ecosystem.

---

## 1. App Overview & Client Context

- **The Client:** Science Biotech Specialties Inc. (SBSI), a healthcare diagnostic and biotechnology solutions company in the Philippines.
- **Problem Solved:** Manages the operational challenges of distributed financial transactions for SBSI's field engineers and laboratory service staff, replacing manual, error-prone spreadsheets.
- **Academic Milestone:** Capstone project requiring end-to-end integration of 4 sub-systems (CMS, SERMS, PRS, TS) via `capstone-auth-module` and formal client turnover to SBSI during Capstone 2 (Sept–Dec 2026).
- **Core Value Proposition:** An automated, audit-ready ecosystem ensuring every cent is accounted for, using AI-assisted OCR (via `ocr-pipeline` with <= 1.5B LLM models) to minimize manual entry errors, enforcing strict BIR tax policies, and automated overdue penalty calculations.
- **Success Metrics & KPIs:**
  - Acceleration of the cash advance reconciliation lifecycle.
  - 100% verification of mutations through immutable audit logs.
  - High accuracy rate of OCR receipt processing with confidence scoring.
  - Zero tolerance for BIR VAT and threshold policy bypasses.

## 2. Target Audience & Roles

- **SBSI Field Engineers & Sales Representatives:** Submitting field travel/supplies expenses and liquidating cash advances.
- **Finance & Audit Teams (Accounting Department):** Reviewing claims, verifying BIR VAT classifications, approving disbursements/liquidations, and closing settlements.
- **Administrators:** Defining corporate policies, approval thresholds, penalty rates, and user access levels.

## 3. Key Features & Functional Requirements

### Must-Have

- **AI-Powered OCR Receipt Extraction (`ocr-pipeline`):** Asynchronous extraction of vendor name, date, total amount, VAT amount, TIN, and invoice number using lightweight <= 1.5B parameter models + Tesseract OCR across both Reimbursements and Liquidations. Stores confidence score and flags manual verification if confidence is below 0.80.
- **BIR VAT Classification:** Automated classification of receipts as VAT or NON-VAT based on Philippine BIR validation logic.
- **Cash Advance & Liquidation Lifecycle:** Track cash disbursements, enforce liquidation expenses equal to or exceeding the current outstanding balance (including accrued penalties), track overpayment variance for reimbursement forwarding, and handle settlement closure.
- **Revise / 3-Strike Rejection Workflow:** Returned submissions transition to `revise` status with incremented `revision_count`; submissions exceeding 3 revision cycles automatically transition to terminal `rejected`.
- **Admin Password Verification:** Enforce mandatory password re-verification on all high-privilege approval, rejection, and disbursement actions.
- **Daily Penalty Assessment:** Apply a strict 7-day grace period followed by a daily penalty (PHP 50.00/day) for unliquidated funds.
- **Duplicate Receipt Detection:** 90-day lookup window based on vendor, date, amount, and invoice number. Require override justification (minimum 20 characters) if a duplicate is flagged.
- **Immutable Audit Logging:** Append-only audit logging of all state transitions (actor, role, action, entity, state before/after, IP, timestamp).
- **Role-Based Access Control (RBAC):** Strict permissions and role-scoped dashboards mediated via `capstone-auth-module`.
- **Dashboard Reporting & Exports:** Export actions (XLSX, CSV, PDF) scoped by role and audit logged.

### Should-Have

- **Payload Pre-Encryption:** Encrypt sensitive payload data (AES-256-GCM + RSA wrapper) before transmission from client to server.

### Nice-to-Have

- **Database-Driven Dashboard Analytics:** High-density visualization of expense trends and liquidation statuses, using database-level pre-aggregation.

## 4. Key User Flows

1. **Reimbursement Submission:** User uploads receipt -> file stored in Supabase Bucket -> OCR queue job triggered -> `ocr-pipeline` processes receipt and sends callback -> duplicate check and VAT classification -> user confirms data and submits.
2. **Cash Advance Request & Approval:** Employee requests advance -> routed based on active thresholds -> accounting manager approves (with password verification) -> finance team records disbursement reference -> advance status set to UNLIQUIDATED.
3. **Liquidation & Settlement:** Employee submits liquidation report with receipt attachments scanned via `ocr-pipeline` -> system enforces `total_expense_amount >= outstanding_balance` (blocking under-balance submissions and updates) and computes any overpayment variance -> accounting audits and approves -> status set to LIQUIDATED.
4. **Revision & Rejection:** Admin returns claim for revision (`revise`) -> employee edits and resubmits -> if revision count exceeds 3, system automatically transitions status to terminal `rejected`.
5. **Penalty Assessment:** Scheduled nightly job runs -> flags advances past 7-day grace -> computes and appends immutable penalty records.

## 5. Non-Goals

- Real-time synchronous OCR processing during request lifecycle.
- Manual override of VAT classification that bypasses BIR validation logic.
- Auto-approval or auto-rejection of financial requests by the AI system.
- Direct independent authentication bypassing `capstone-auth-module`.
