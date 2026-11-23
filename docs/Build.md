# Project Build Guide

**Project:** Smart Expense & Reimbursement Management System (SERMS)  
**Client / Partner:** Science Biotech Specialties Inc. (SBSI) — [https://sbsi.com.ph/about-us/](https://sbsi.com.ph/about-us/)  
**Academic Context:** 3rd & 4th Year Capstone Project (Capstone 1: Ended July 2026 · Capstone 2: September–December 2026)  
**Date:** 2026-09-03  
**Version:** 1.5.2  
**Owner:** SERMS Engineering Team  
**Status:** Active  
**Last reconciled:** 2026-09-03 (Transferred error handling architecture patterns and rules to Build Guide)  
**Canonical Spec:** [SERMS.md](SERMS.md) · **Related Docs:** [index.md](index.md) · [PRD.md](PRD.md) · [SAD.md](SAD.md) · [SDD.md](SDD.md) · [DSD.md](DSD.md) · [OPS.md](OPS.md) · [QAD.md](QAD.md) · [CHANGELOG.md](CHANGELOG.md) · [AGENTS.md](../AGENTS.md)

---

> **What this is:** The developer operating manual and repository build guide for whoever builds or maintains SERMS — human engineers or AI agents on any IDE. It details environment setup (Docker & local), pinned stack dependencies, golden-path backend/frontend implementation patterns, non-negotiable development guardrails, seeded test accounts, and the Definition of Done. **This guide materializes directly to the project-root [`AGENTS.md`](../AGENTS.md)**.

---

## 1. How to Build From These Docs

The documentation suite is governed by **[`docs/SERMS.md`](SERMS.md)** (the canonical source of truth). Read in this order before writing code:

1. **[SERMS Master Spec](SERMS.md)** — The primary canonical single source of truth for all requirements, architecture, design, and governance.
2. **[CHANGELOG](CHANGELOG.md)** — Historical context, previous architectural decisions, and recent design updates.
3. **[PRD](PRD.md)** — Core business rules, modules (reimbursement, cash advance, penalties), compliance guidelines, and flows.
4. **[SAD](SAD.md)** — Software architecture, layering, and AI execution model.
5. **[SDD](SDD.md)** — Architectural design (Modular Monolith layout, DB schema, auth proxy, external integration, queue jobs).
6. **[DSD](DSD.md)** — Visual primitives (clean card borders, font weights, status configurations, base component specs).
7. **[OPS](OPS.md)** — Operations runbook, SLOs, and incident response.
8. **[QAD](QAD.md)** — QA test plan, receipt testing fixtures dataset, and verification gates.
9. **This guide** — Developer setup, stack versions, local commands, and code patterns.

---

## 2. Dev Environment Setup & Commands

SERMS runs in a containerized environment via Docker Compose, exposing the backend API at `http://localhost:8000` and the web frontend at `http://localhost:5002`.

### Docker Commands

```powershell
# Start all containers in the background (ensures mysql, redis, php, api, api_queue, and web boot)
docker compose up -d

# View container logs
docker compose logs -f

# Run database migrations inside the PHP container
docker compose exec php php artisan migrate

# Seed the database
docker compose exec php php artisan db:seed

# Stop and remove all containers
docker compose down
```

### Local Dev (No Docker Option)

If you prefer to run services bare-metal on your host:

```powershell
# Backend (Laravel 13) - Starts PHP server, Queue listener, and log tailer concurrently
cd apps/api
composer run dev

# Frontend (Vue 3 / Vite)
cd apps/web
npm run dev
```

---

## 3. Pinned Stack & Dependency Rules

Do not rely on training memory for package capabilities or APIs. Below is the verified tech stack for SERMS:

### Pinned Stack

| Layer | Technology | Pinned Version | Configuration / Location |
|-------|------------|----------------|--------------------------|
| Backend Runtime | PHP | `^8.3` | `apps/api/composer.json` |
| Backend Framework | Laravel | `^13.7` | Modular Monolith layout |
| Frontend Runtime | Node / Vue 3 | `^3.4.0` | `apps/web/package.json` |
| Styling | Tailwind CSS | `^3.4.3` | `apps/web/tailwind.config.js` |
| Icons | lucide-vue-next | `^0.373.0` | Sourced dynamically in layouts |

### Code Execution Commands

- **Backend Linting:** `docker compose exec php ./vendor/bin/pint`
- **Backend Tests:** `docker compose exec php php artisan test`
- **Frontend Build:** `cd apps/web && npm run build`

---

## 4. Golden-Path Code Patterns

### Backend (Laravel Modules)
Every backend controller, service, request validator, and model must reside strictly inside `app/Modules/{ModuleName}`.

#### 1. Controller Pattern (Enforces RBAC + Sanitization)
```php
namespace App\Modules\Expenses\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Expenses\Http\Requests\StoreReceiptRequest;
use App\Modules\Expenses\Services\ExpenseService;
use Illuminate\Http\JsonResponse;

class ReceiptController extends Controller
{
    protected ExpenseService $expenseService;

    public function __construct(ExpenseService $expenseService)
    {
        $this->expenseService = $expenseService;
    }

    public function store(StoreReceiptRequest $request): JsonResponse
    {
        // Enforce RBAC permission
        $this->authorize('serms.expenses.upload');

        $receipt = $this->expenseService->createReceipt(
            $request->user(),
            $request->validated()
        );

        return response()->json([
            'id' => $receipt->id,
            'status' => $receipt->status,
            'message' => 'Receipt uploaded successfully.'
        ], 201);
    }
}
```

#### 2. Service Pattern (Enforces DB Transactions + Auditing)
```php
namespace App\Modules\Expenses\Services;

use App\Modules\Expenses\Models\Receipt;
use App\Modules\AuditLogs\Services\AuditLogService;
use Illuminate\Support\Facades\DB;
use App\Modules\Users\Models\User;

class ExpenseService
{
    public function createReceipt(User $user, array $data): Receipt
    {
        return DB::transaction(function () use ($user, $data) {
            $receipt = Receipt::create([
                'uploaded_by' => $user->id,
                'file_path' => $data['file_path'],
                'file_hash' => $data['file_hash'],
                'status' => 'processed',
            ]);

            // IMMUTABLE AUDIT LOG ENTRY
            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role,
                actionType: 'UPLOAD_RECEIPT',
                entityType: 'Receipt',
                entityId: $receipt->id,
                beforeState: null,
                afterState: $receipt->toArray(),
                ipAddress: request()->ip()
            );

            return $receipt;
        });
    }
}
```

#### 3. Error Handling & Boundary Resilience Pattern (Enforces Atomic Rollbacks + Actionable Logging)
```php
namespace App\Modules\Expenses\Services;

use App\Modules\Shared\Exceptions\ExternalServiceException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class ReceiptProcessingService
{
    public function processExternalBoundary(string $filePath): array
    {
        // Explicit try-catch at integration/system execution boundaries (Supabase, OCR queue, external APIs)
        try {
            return DB::transaction(function () use ($filePath) {
                // Perform state mutations inside transaction
                // ...
                return ['status' => 'processed'];
            });
        } catch (Throwable $e) {
            // NEVER silently swallow exceptions inside DB transactions or system boundaries
            Log::error('System boundary operation failed', [
                'file_path' => $filePath,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            // Re-throw or map to domain exception to preserve atomic rollback
            throw new ExternalServiceException('Failed processing receipt boundary operation: ' . $e->getMessage(), previous: $e);
        }
    }
}
```

---

### Frontend (Vue 3 / Pinia)

#### 1. Pinia Store Structure
```javascript
import { defineStore } from "pinia";
import { ref } from "vue";

export const useReceiptsStore = defineStore("receipts", () => {
  const receipts = ref([]);
  const isLoading = ref(false);

  async function fetchReceipts() {
    isLoading.value = true;
    try {
      const response = await fetch("/api/expenses", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("serms_token")}`,
          Accept: "application/json",
        },
      });
      if (response.ok) {
        receipts.value = await response.json();
      }
    } finally {
      isLoading.value = false;
    }
  }

  return { receipts, isLoading, fetchReceipts };
});
```

#### 2. Vue Base Components Usage
Never write custom structural elements if a base component already exists in `src/components/base/`.
```vue
<script setup>
import { onMounted } from 'vue'
import { useReceiptsStore } from '@/stores/receipts'
import BaseTable from '@/components/base/BaseTable.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'

const store = useReceiptsStore()

const columns = [
  { key: 'id', label: 'ID' },
  { key: 'vendor_name', label: 'Vendor' },
  { key: 'status', label: 'Status' },
]

onMounted(() => {
  store.fetchReceipts()
})
</script>

<template>
  <div class="space-y-4">
    <BaseTable :columns="columns" :rows="store.receipts" :loading="store.isLoading">
      <template #cell-status="{ value }">
        <StatusBadge :status="value" />
      </template>
    </BaseTable>
  </div>
</template>
```

---

## 5. Development Guardrails

- **Canonical Source of Truth Rule (AI & Developer Rule):** [`docs/SERMS.md`](SERMS.md) is the primary, authoritative single source of truth for all requirements, architecture, design, and governance. All developers and AI agents must cross-reference `docs/SERMS.md` first before modifying code or downstream documentation. If requirements change, `docs/SERMS.md` must be updated first before any downstream document or code file.
- **Never create raw CSS files:** Add utility classes directly or append to `@layer components` in [`index.css`](../apps/web/src/assets/index.css).
- **Never bypass the Audit Log:** All service mutations (`create`, `update`, `delete`) must log their actions using `AuditLogService::log()`.
- **Never export without auditing:** All report downloads (XLSX, CSV, PDF) must be triggered via controller endpoints that write an audit log entry specifying the filters and user who performed the export.
- **Never perform high-cost in-memory math or loops for analytics:** Dashboard metrics and report summaries must leverage raw database aggregate functions (e.g. `SUM()`, `COUNT()`, `GROUP BY`) to ensure high-performance scannability.
- **Never transmit sensitive PII or financial mutations in plaintext:** Use client-side payload pre-encryption (AES-256-GCM + RSA wrapper) before sending sensitive forms (e.g., cash advance requests, policy changes) to the server.
- **Never hardcode paths:** For file references, use relative links or Supabase Bucket configurations.
- **Never run blocking loops on requests:** OCR service dispatching and penalty calculations must run inside Queue Jobs.
- **Robust Error Handling (AI & Developer Rule):** Implement explicit `try-catch` blocks at system execution & integration boundaries (Supabase storage uploads, Tesseract OCR queue tasks, external HTTP APIs, filesystem I/O, background jobs). Never use empty or silent `catch` blocks—always log actionable error context and re-throw, map to structured domain exceptions, or return formatted HTTP 4xx/5xx error responses. Never catch and swallow exceptions inside `DB::transaction()` blocks without rethrowing to guarantee atomic database rollbacks. Allow unhandled internal runtime exceptions to bubble up to Laravel's centralized Exception Handler or Vue's global error handler.
- **Never write or push to Git without explicit permission (AI Rule):** AI agents are encouraged to check and inspect Git (e.g., `git log`, `git diff`, `git status`) in read-only mode to gather context and info about the latest changes. However, AI agents must never write, commit, alter Git history, or push to Git without explicit user permission. Always ask the user before performing any mutating Git actions.
- **Always check historical context (AI Subagent Rule):** AI subagents and developers must check [`docs/CHANGELOG.md`](CHANGELOG.md) whenever they need background on previous architectural decisions, design evolutions, or feature histories before making changes.
- **Always gather context before execution (AI Rule):** If a user's prompt or task lacks sufficient context, details, or information, AI agents and developers must ask questions or interview the user via the `/grill-me` skill interface to deepen understanding before proceeding.
- **Reusability & Anti-Duplication Rule — Frontend (AI & Developer Rule):** Developers and subagents must thoroughly scan the codebase for pre-existing reusable components (in `src/components/base/`), composables (in `src/composables/`), utility helpers, and functions before creating new ones. If no existing reusable component or utility exists for a recurring UI/logic pattern, create a clean, reusable abstraction first rather than writing duplicated or inline one-off implementations.
- **Reusability & Anti-Duplication Rule — Backend (AI & Developer Rule):** Before implementing new API routes or controllers, check if an existing endpoint, module controller action, service method, or repository query already fulfills or can be extended to fulfill the requirement. Reuse existing endpoints and services rather than creating duplicate routes, controllers, or redundant database queries.
- **Cross-Project Access Rule for Sister Repositories (AI & Subagent Rule):** AI agents and subagents are permitted to access, inspect, and search sister repositories (`capstone-auth-module`, `capstone-azure-infra`, `ocr-pipeline`, `CMS`, `PRS`, `TS`) whenever they need additional architecture, schema, route contracts, or infrastructure context. However, agents are **strictly restricted to READ and SEARCH operations only** (e.g. `view_file`, `grep_search`, `list_dir`). AI agents must **NEVER modify, write to, delete, or commit/push changes to any other project** unless explicitly instructed and permitted by the user.
- **Browser Testing & Interactive Debugging (GEMINI & AI Agents Rule):** Use browser testing (`browser_subagent`, DevTools, interactive browser actions, DOM/console log inspection, network payload checking, and screenshot verification) **judiciously and only when strictly applicable** (e.g., complex multi-step interactive workflows, visual regression, or DOM/CSS layout verification that cannot be validated via faster Vitest/PHPUnit tests). Do NOT run heavy browser subagents for simple UI tweaks, static logic, or non-visual tasks where faster local verification suffices, avoiding unnecessary testing delays and token consumption.
- **Proactive Skill & Workflow Ingestion (AI & Subagent Rule):** AI agents and subagents must actively check and leverage applicable skills from `.agents/skills/` (and built-in skills) before executing specialized tasks. When authoring features or bug fixes, utilize `test-driven-development`; for investigating errors or unexpected behavior, invoke `systematic-debugging`; for exploring requirements or creative design, use `brainstorming`; for multi-step implementation tasks, follow `writing-plans` and `executing-plans`; and before claiming completion, always invoke `verification-before-completion`. Agents must read the relevant `SKILL.md` before proceeding.
- **Role-Based Debugging Credentials (AI Subagents & Developers):** When debugging or testing user roles, permissions, approval workflows, and multi-tenant views, subagents and developers must use the official seeded test credentials documented in the *Seeded Test Accounts & Debugging Credentials* section below.
- **Medium Date Formatting Standard (AI & Subagent Rule):** Whenever creating, displaying, or formatting human-readable dates across UI components, templates, notifications, documentation, or subagent conversational responses, AI subagents and developers must always use the **Medium Date Format** (e.g., `Sept 1, 2026`, `Oct 14, 2026`, `Jan 15, 2026`) instead of numerical or raw ISO formats (such as `2026-09-01` or `09/01/2026`). Internal storage/database layers may continue to persist standard ISO `YYYY-MM-DD`, but all human-facing presentation layers must strictly use the medium date format.
- **Always maintain the Documentation Change Log (AI & Developer Rule):** Always append a change log entry in [`docs/CHANGELOG.md`](CHANGELOG.md) whenever creating, modifying, or updating documentation guides or specifications in either `docs/` or `documentations/`.
- **Constructive Pushback & Logical Rigor (AI & Subagent Rule):** AI agents and subagents must never practice sycophancy or blindly agree with user prompts, opinions, or instructions. If a user request, proposed design, architectural direction, or implementation approach is flawed, suboptimal, violates project axioms (e.g., A-09 reusability, BIR compliance, audit immutability), or introduces technical debt, the agent MUST actively push back, articulate the exact logical reasoning and architectural risks, and propose an evidence-backed alternative. Every pushback, critique, or technical recommendation must have a clear, verifiable logical basis and cite relevant code, system constraints, or industry standards—never baseless disagreement or performative objection.
- **Automated Testing & Integration Test Mandate (AI & Developer Rule):** Whenever introducing a new feature, module action, API endpoint, or modifying existing functionality, developers and AI agents must author corresponding automated tests (such as integration/feature tests in `tests/Feature` for backend logic and component/store integration tests in Vitest for frontend logic) to verify its operational status and correctness. No feature or function is considered complete or ready for PR merge without automated test coverage demonstrating that it works as specified.

---

## 6. Seeded Test Accounts & Debugging Credentials

When debugging authentication, role-based access control (RBAC), approval thresholds, disbursements, and submission flows, use these pre-seeded test accounts:

| Role / Persona | Email | Password | Department / Grade | Purpose & Scopes |
| -------------- | ----- | -------- | ------------------ | ---------------- |
| **Employee (Standard)** | `employee@example.com` | `password` | Operations / L2 | Regular expense upload, reimbursement requests, cash advances, liquidation submissions |
| **Accounting / Finance** | `sum@sbsi.com` | `password` | Accounting / Finance | Primary accounting verification, disbursements, settlement validation |
| **IT Administrator** | `admin@example.com` | `password` | IT / L5 | System administration, user management, audit log inspection, global settings |
| **Approver / Finance Manager** | `approver@example.com` | `password` | Finance / L4 | Cash advance approvals, threshold sign-offs, reimbursement approvals |
| **Finance Administrator** | `finance-admin@example.com` | `password` | Finance / Admin | Financial compliance, expense category oversight, audit reporting |
| **Finance Officer** | `finance@example.com` | `password` | Finance / Employee | Financial operations, receipt verification, payment matching |
| **Operations Manager** | `manager@example.com` | `password` | Operations / Manager | Departmental expense approval, operational budget sign-off |
| **Sales Representative** | `sales@example.com` | `password` | Operations / Sales | Field sales reimbursements, client entertainment claims, travel advances |
| **Accounting Staff (SBSI)** | `employee.accounting@sbsi.com` | `password` | Accounting / Accountant | Client-specific accounting reviews, BIR VAT compliance |
| **Finance Manager (SBSI)** | `manager.finance@sbsi.com` | `password` | Finance / Manager | High-tier approval thresholds, budget disbursements |
| **Operations Manager (SBSI)** | `manager.operations@sbsi.com` | `password` | Operations / Manager | Field operations oversight, regional cash advance sign-offs |
| **Sales Supervisor (SBSI)** | `supervisor.sales@sbsi.com` | `password` | Sales & Marketing / Supervisor | First-line expense validations, team travel approvals |
| **Super Admin (SBSI)** | `superadmin@sbsi.com` | `password` | Executive / Super Admin | Full ecosystem administrative privileges across integrated systems |
| **IT Support Engineer (SBSI)** | `employee.it@sbsi.com` | `password` | IT / Employee | IT support tickets, technical access verification |

---

## 7. Definition of Done

- [ ] Code conforms to `A-09` reusability constraints (no duplicate components or utility helpers).
- [ ] Every database mutation has a corresponding `AuditLogService::log()` call in the same database transaction.
- [ ] System boundary operations feature explicit `try-catch` blocks with logging/rethrowing and zero silent error swallowing.
- [ ] Sensitive inputs are encrypted on the client side and verified/decrypted server-side.
- [ ] Export actions for reports are written to the audit logs with filters used.
- [ ] Pre-aggregated database aggregation is used for dashboard visual components.
- [ ] Applicable skills from `.agents/skills/` (e.g., `test-driven-development`, `systematic-debugging`, `writing-plans`, `verification-before-completion`) were engaged where relevant.
- [ ] Documentation changes in `docs/` or `documentations/` are recorded in the Changelog in `docs/DOC_CHANGELOG.md`.
- [ ] Automated integration/unit tests (PHPUnit / Vitest) are created or updated for all newly introduced or modified features and functions to verify operational status.
- [ ] All unit and integration tests (PHPUnit / Vitest) run without failure.

---

## 8. Document Materialization

This guide serves as the source of truth for repository setup. 

| Source File | Destination File | Automation |
|-------------|------------------|------------|
| `docs/Build.md` | [`AGENTS.md`](../AGENTS.md) | Copy exact contents on save |

Re-materialize this guide whenever stack versions, directory structures, or base components change.


