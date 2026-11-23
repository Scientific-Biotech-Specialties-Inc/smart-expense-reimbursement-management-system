# Issue Creation Guide — SERMS

Welcome to the SERMS Issue Creation Guide. This document outlines how to properly report bugs, request features, track tech debt, and ask questions within the Smart Expense & Reimbursement Management System (SERMS).

Following this guide ensures the engineering team has all the context needed to triage and resolve your issue quickly.

---

## 1. Issue Types

We categorize all incoming issues into the following types. Please select the appropriate template when opening a new issue:

1. **🐛 Bug Report:** For reporting unexpected behavior, crashes, or UI issues.
2. **✨ Feature Request:** For proposing new features or enhancements to existing workflows.
3. **🔧 Tech Debt / Chore:** For tracking refactoring, dependency updates, or internal developer experience improvements.
4. **🔒 Security Vulnerability:** For reporting sensitive security flaws (Do not post these publicly! See our security policy).
5. **💬 Question / Support:** For asking how to use a feature or seeking clarification on SERMS rules.

---

## 2. Bug Report Guidelines

A good bug report makes it easy for developers to reproduce the issue. When filing a bug, you must include:

- **Steps to Reproduce:** A numbered list of exact actions taken before the bug occurred.
- **Expected vs. Actual Behavior:** What did you expect to happen, and what actually happened?
- **Environment Details:** OS, Browser, and if known, the Laravel/Vue environment version.
- **Screenshots / Screen Recordings:** Visual proof is mandatory for UI/UX bugs.
- **Relevant Logs:** Any stack traces, error codes (e.g., `403 Forbidden`), or console errors.
- **Severity/Priority Assessment:** A brief estimate of the bug's impact (e.g., "Critical - blocks reimbursement submissions").

---

## 3. Feature Request Guidelines

When proposing a new feature, focus on the *problem* first, not just the solution. Include:

- **Problem Statement / Use Case:** What user pain point are you trying to solve?
- **Proposed Solution:** How do you envision the feature working within SERMS?
- **Alternatives Considered:** What other workarounds or solutions did you think about?
- **Additional Context / Mockups:** Wireframes, sketches, or references to other tools.

---

## 4. Triage and Labeling Process

To help maintainers route issues efficiently:
- **Authors should apply initial labels** (e.g., `bug`, `enhancement`, `tech-debt`).
- **Do not assign the issue to yourself or anyone else**; leave the `Assignees` field blank. Our maintainers will review the backlog and assign the issue during sprint planning.

---

## 5. Security Vulnerabilities

**CRITICAL:** Never open a public GitHub issue for a security vulnerability! 
Because SERMS handles sensitive financial and compliance data, all security issues (like unauthorized access, data leaks, or encryption flaws) must be reported privately to the core engineering team.

---

By following these guidelines, you help us keep SERMS stable, secure, and continuously improving. Thank you for your contributions!
