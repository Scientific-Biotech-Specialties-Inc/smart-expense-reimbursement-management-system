# Pull Request (PR) Guide — SERMS

Welcome to the SERMS Pull Request Guide. This document outlines the standard protocols and best practices for contributing to the Smart Expense & Reimbursement Management System (SERMS). 

Whether you are a new developer or a seasoned engineer, this beginner-friendly guide will ensure your pull requests get merged smoothly, pass code reviews, and adhere to our strict governance policies.

---

## 1. Branch Naming Convention

We use **Conventional Commits** prefixes for branch names. This makes it easy to understand what type of work is happening on any given branch.

Format: `<type>/<ticket-id>-<short-description>`

**Common Types:**
- `feat/`: New features (e.g., `feat/SERMS-123-add-login-screen`)
- `fix/`: Bug fixes (e.g., `fix/SERMS-456-fix-ocr-crash`)
- `chore/`: Maintenance, refactoring, or tooling updates (e.g., `chore/SERMS-789-update-dependencies`)
- `docs/`: Documentation updates

---

## 2. Commit Messages

All individual commit messages within your branch must also follow the **Conventional Commits** standard.

Format: `<type>(<optional scope>): <description>`

**Examples:**
- `feat(auth): add JWT expiration handling`
- `fix(ocr): resolve low confidence score fallback`
- `docs: update PR creation guide`

*Why?* Clean commit messages keep the git history readable and make rollbacks much easier.

---

## 3. Creating the Pull Request

When opening a Pull Request on GitHub, you will automatically be provided with our PR Template. Ensure the following sections are thoroughly filled out:

1. **Description & Motivation:** Briefly explain *what* you changed and *why*.
2. **Link to Issue/Ticket:** Always link the Jira or GitHub ticket so reviewers have context.
3. **Testing Steps Performed:** Detail exactly how you tested this locally (e.g., "Tested VAT calculation with receipts over PHP 1,000.00").
4. **Screenshots / Screen Recordings:** **Required** if your PR includes UI changes.
5. **Pre-merge Checklist:** Verify you have followed SERMS rules, such as checking for code reusability (A-09) and adding tests.

---

## 4. Review & Merge Process

- **Approvals Required:** **1 Approval** from a core reviewer is required before merging.
- **CI/CD Checks:** While CI/CD pipelines (like linting and tests) will run, there is currently no strict block enforcing them to pass before merge, though it is highly recommended to resolve any failures.
- **Merge Strategy:** We use **Squash and Merge**. This compresses all your individual commits into a single, clean commit on the `main` branch. The PR title will become the final commit message.

---

## 5. 🛑 Critical SERMS Best Practices to Keep in Mind

Before submitting your PR, ensure you haven't violated the core SERMS development rules:

1. **A-09: Reuse Before You Write:** Did you create a new button or utility function that already exists? Search the codebase first. Duplication is a defect!
2. **Hold-To-Confirm:** If your PR adds a destructive action (like deleting a receipt), it must use the 2000ms hold-to-confirm pattern.
3. **Audit Logging:** Any state changes (approvals, edits) must be wrapped in `AuditLogService::log()`.
4. **Immutability:** Do not delete or update rows in `audit_logs` or `penalties`. They are append-only.
5. **BIR Compliance:** If dealing with receipts, rely strictly on BIR VAT validation logic. Do not trust user inputs for VAT math.

---

By following these guidelines, you help keep the SERMS codebase secure, maintainable, and highly performant. Happy coding!
