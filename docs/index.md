# Documentation Index — SERMS

**Project:** Smart Expense & Reimbursement Management System (SERMS)  
**Client / Partner:** Science Biotech Specialties Inc. (SBSI) — [https://sbsi.com.ph/about-us/](https://sbsi.com.ph/about-us/)  
**Academic Context:** 3rd & 4th Year Capstone Project (Capstone 1: Ended July 2026 · Capstone 2: September–December 2026)  
**Date:** 2026-09-01  
**Version:** 1.5.1  
**Owner:** SERMS Engineering Team  
**Status:** Active  
**Last reconciled:** 2026-09-01 (Documentation suite refactor & standardization of 'What this is' sections across all docs)  
**Canonical Spec:** [SERMS.md](SERMS.md) · **Related Docs:** [PRD.md](PRD.md) · [SAD.md](SAD.md) · [SDD.md](SDD.md) · [DSD.md](DSD.md) · [Build.md](Build.md) · [OPS.md](OPS.md) · [QAD.md](QAD.md) · [CHANGELOG.md](CHANGELOG.md) · [AGENTS.md](../AGENTS.md)

---

> **What this is:** The central entry point, navigation hub, and health check dashboard for the entire SERMS documentation suite. It maps all canonical specifications, architectural documents, operational guides, and design manuals, providing document status, last reconciled timestamps, and cross-document reading orders for developers and AI agents.

---

## 1. Document Suite

| Document                           | File                   | Version | Status | Description                                           | Last Reconciled |
| ---------------------------------- | ---------------------- | ------- | ------ | ----------------------------------------------------- | --------------- |
| **SERMS** — Master Specification   | [SERMS.md](SERMS.md)   | 1.5.1   | Canonical | Authoritative single source of truth for all SERMS docs & code | 2026-09-01 |
| **PRD** — Product Requirements     | [PRD.md](PRD.md)       | 1.5.1   | Active | Goals, SBSI client context, Capstone ecosystem, and workflows | 2026-09-01 |
| **SAD** — Software Architecture    | [SAD.md](SAD.md)       | 1.5.1   | Active | High-level software architecture, ecosystem, and AI model | 2026-09-01 |
| **SDD** — System Design            | [SDD.md](SDD.md)       | 1.5.1   | Active | Monolithic modular system design, crypto, and OCR flows | 2026-09-01 |
| **DSD** — Design System            | [DSD.md](DSD.md)       | 1.5.1   | Active | Clinical visual guidelines, typography, and 23-status badge map | 2026-09-01 |
| **Build** — Build & Setup Guide    | [Build.md](Build.md)   | 1.5.1   | Active | Environment setup, dev instructions, and golden paths | 2026-09-01 |
| **index** — Documentation Index    | [index.md](index.md)   | 1.5.1   | Active | Entry point and health status of SERMS documentation  | 2026-09-01 |
| **AGENTS** — Agent Quickstart      | [../AGENTS.md](../AGENTS.md) | 1.5.1 | Active | AI agent guidelines derived from Build.md             | 2026-09-01 |
| **OPS** — Operations Runbook       | [OPS.md](OPS.md)       | 1.5.1   | Active | Azure student infra, SLO targets, and runbooks        | 2026-09-01 |
| **QAD** — QA & Test Plan           | [QAD.md](QAD.md)       | 1.5.1   | Active | Testing strategy, Vitest/PHPUnit guides, and gates    | 2026-09-01 |
| **CHANGELOG** — Historical Changelog | [CHANGELOG.md](CHANGELOG.md) | 1.5.1 | Active | Comprehensive historical changelog for agents & developers | 2026-09-01 |
| **Tech Stack & Tools** — Full System Audit | [TECH_STACK_AND_TOOLS.md](TECH_STACK_AND_TOOLS.md) | 1.0.0 | Active | Complete stack, frameworks, tools, and runtime matrix across SERMS and ocr-pipeline | Nov 6, 2026 |
| **Implemented Features** — Feature Catalog | [IMPLEMENTED_FEATURES.md](IMPLEMENTED_FEATURES.md) | 1.0.0 | Active | Functional feature inventory across all 9 modules of SERMS and ocr-pipeline | Nov 6, 2026 |
| **Known Issues & Limits** — Risk Ledger | [KNOWN_ISSUES_AND_LIMITATIONS.md](KNOWN_ISSUES_AND_LIMITATIONS.md) | 1.0.0 | Active | Failure modes, handwriting/thermal limits, 2B AI ceiling, and G-01..G-12 gaps | Nov 6, 2026 |
| **API & Integrations** — Interface Specs | [API_DOCUMENTATION_AND_INTEGRATION.md](API_DOCUMENTATION_AND_INTEGRATION.md) | 1.5.0 | Active | Complete REST API reference, payload pre-encryption, and webhook schemas | Nov 6, 2026 |
| **Technical Implementation** — Code Guide | [TECHNICAL_IMPLEMENTATION_DETAILS.docx](TECHNICAL_IMPLEMENTATION_DETAILS.docx) · [MD](TECHNICAL_IMPLEMENTATION_DETAILS.md) | 1.1.0 | Active | Low-level algorithms, pure-PHP OAEP, seam stitching, and math engines (Word/Docs & MD with image diagrams) | Nov 6, 2026 |
| **PR Guide** — Pull Request Guide | [../documentations/PR_GUIDE.md](../documentations/PR_GUIDE.md) | 1.0 | Draft | Guidelines, naming conventions, and best practices for creating PRs | 2026-07-13 |
| **Issue Guide** — Issue Creation Guide | [../documentations/ISSUE_GUIDE.md](../documentations/ISSUE_GUIDE.md) | 1.0 | Draft | Guidelines and templates for reporting bugs and feature requests | 2026-07-13 |
| **Branch Guide** — Branch Creation Guide | [../documentations/BRANCH_GUIDE.md](../documentations/BRANCH_GUIDE.md) | 1.0 | Draft | GitFlow strategy, branch naming, and syncing guidelines | 2026-07-13 |

### Materialized Artifacts

These are **generated from canonical docs** — edit the doc and re-materialize; never hand-edit the artifact directly.

| Artifact                                                                                                                            | Canonical Source                              | Description                            |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------- |
| `../AGENTS.md` (project-root build rules)                                                                                           | [Build.md](Build.md)                          | High-level agent quickstart guidelines |

---

## 2. Change Log

All project, architectural, and documentation changes are recorded in **[`docs/CHANGELOG.md`](CHANGELOG.md)**. AI subagents and developers must consult that file for historical context.

---

## 3. Incident Log (Postmortems)

No incidents recorded yet.

---

## 4. Health Check

Quick triage checks for agents running at the start of a session:

- [ ] Every document's **Last Reconciled** date is newer than the last code change to its area.
- [ ] No document has been in `Draft` longer than expected without movement.
- [ ] System architecture and AI governance rules in SAD.md are reconciled with active guidelines.
- [ ] `AGENTS.md` in the project root matches [Build.md](Build.md).
- [ ] Pinned stack versions in the Build Guide match live dependencies (`composer.json`, `package.json`).
- [ ] Every open Postmortem's action items are closed (or tracked somewhere durable).
