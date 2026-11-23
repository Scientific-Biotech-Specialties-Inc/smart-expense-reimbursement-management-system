# Smart Expense & Reimbursement Management System (SERMS)

The Smart Expense & Reimbursement Management System (SERMS) is a high-precision financial management platform designed for organizations requiring rigorous tracking of field expenses, cash advances, and liquidations. Built with a "Clinical Engineering" design philosophy, the system prioritizes data density, mechanical reliability, and strict compliance with fiscal policies.

## Overview

SERMS solves the operational challenges of managing distributed financial transactions in high-stakes environments, such as clinical laboratory services. It replaces manual, error-prone workflows with an automated, audit-ready ecosystem that ensures every cent is accounted for.

### Core Objectives
- **Fiscal Velocity**: Accelerate the reconciliation lifecycle of cash advances.
- **Audit Integrity**: Provide immutable logging and verifiable evidence for all financial mutations.
- **Operational Precision**: Utilize AI-assisted OCR to minimize manual data entry errors.
- **Policy Enforcement**: Automatically apply late penalties and validation boundaries.

### Target Users
- **Field Engineers & Sales Representatives**: Submitting field expenses and liquidating advances.
- **Finance & Audit Teams**: Reviewing claims, verifying receipts, and closing settlements.
- **Administrators**: Defining corporate policies, thresholds, and tax classifications.

## Features

### Reimbursement Module
- **AI-Powered OCR**: Asynchronous external AI service for automated extraction of vendor, date, and amount via webhook.
- **VAT Classification**: Automated classification of receipts into VAT and NON-VAT categories.
- **Duplicate Detection**: 90-day lookup for duplicate receipt submissions based on vendor, date, and amount.
- **Submission Guardrails**: Mandatory receipt attachments and report verification.

### Cash Advance & Liquidation Lifecycle
- **Disbursement Tracking**: Comprehensive tracking of cash issued to employees for field operations.
- **Reconciliation Engine**: Automated variance calculation (Overpayment vs. Abono/Reimbursement).
- **Automated Penalty Assessment**: A strict 7-day grace period followed by a daily penalty (PHP 55.00/day) for unliquidated funds.
- **Settlement Closure**: Multi-stage workflow from `UNLIQUIDATED` to `LIQUIDATED` status.

### Governance & Security
- **Immutable Audit Logs**: Append-only event logging for all critical system actions.
- **RBAC (Role-Based Access Control)**: Granular permissions for Users, Approvers, and Admins.
- **Compliance Standards**: BIR-compliant data structures and reporting formats.
- **Deterministic Confirmations**: Hold-to-confirm interactions for destructive actions to prevent accidental data loss.

## Tech Stack

### Frontend
- **Framework**: Vue 3 (Composition API)
- **Build Tool**: Vite
- **State Management**: Pinia (Modular Stores)
- **Styling**: Tailwind CSS v3 (Custom Grid & Color Palette)
- **Iconography**: Lucide-Vue-Next
- **Data Visualization**: Chart.js

### Backend
- **Framework**: Laravel 13
- **Language**: PHP 8.3
- **Queueing**: Laravel Queues (Asynchronous OCR & Penalty Computation)
- **Authentication**: Laravel Sanctum

### Infrastructure & Services
- **Database**: PostgreSQL / MySQL (Relational Schema)
- **Storage**: Supabase Bucket (Receipt Storage)
- **AI/ML**: External AI Service (Webhook-based asynchronous processing)

## System Architecture

SERMS follows a **Modular Monolith** architectural pattern, ensuring high cohesion within business domains while maintaining a simplified deployment model.

### Major Components
- **Core API**: Centralized business logic, validation, and data persistence.
- **Worker Service**: Handles asynchronous tasks like OCR processing and daily penalty calculations.
- **Client Application**: A high-density, SPA (Single Page Application) optimized for analytical readability.
- **Storage Layer**: Hybrid storage using relational databases for transactional data and object storage for receipt images.

### Data Flow Overview
1. **Input**: User uploads a receipt image via the Client App.
2. **Async Processing**: The API stores the file in Supabase and dispatches an OCR Job.
3. **Extraction**: The Worker dispatches the receipt to an external AI service, which processes it and calls back to a webhook with extracted data and a confidence score.
4. **Validation**: The system performs duplicate checks and VAT classification.
5. **Finalization**: User confirms extracted data, and the record enters the approval workflow.

## Installation Guide

### Prerequisites
- PHP 8.3 or higher
- Node.js 18.x or higher
- Composer 2.x
- PostgreSQL/MySQL

### Backend Setup (apps/api)
When running via Docker (e.g., `docker compose up`), the backend setup is completely automated. The entrypoint script will:
- Copy `.env.example` to `.env`
- Run `composer install`
- Generate the `APP_KEY`
- Run database migrations

You do not need to run these manually.

### Supabase Configuration
SERMS uses Supabase for receipt image storage. You will need to obtain API credentials from your Supabase dashboard and add them to your `.env` file (the entrypoint uses placeholder values by default):
```ini
SUPABASE_URL=your_project_url
SUPABASE_REGION=your_project_region
SUPABASE_BUCKET=cash_advances
SUPABASE_ENDPOINT=your_project_endpoint
SUPABASE_ACCESS_KEY_ID=your_access_key
SUPABASE_SECRET_ACCESS_KEY=your_secret_key
```

### Frontend Setup (apps/web)
1. Navigate to `apps/web`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure API base URL in `.env`.

## Running the Project

### Development Environment
To run the full stack concurrently (including queue workers and Vite):
```bash
# In apps/api
composer run dev
```
This command initializes:
- Local PHP server (`php artisan serve`)
- Queue listener (`php artisan queue:listen`)
- Vite development server

### Production Build
```bash
# Build Frontend
cd apps/web
npm run build

# Optimize Backend
cd apps/api
php artisan optimize
```

## Project Structure

```text
├── apps/
│   ├── api/                # Laravel 13 Backend (API & Workers)
│   │   ├── app/            # Core business logic
│   │   ├── database/       # Migrations and seeders
│   │   └── routes/         # API endpoint definitions
│   └── web/                # Vue 3 Frontend (SPA)
│       ├── src/            # Components, stores, and views
│       └── docs/           # Technical and design specifications
├── infrastructure/         # Deployment and CI/CD configurations
└── packages/               # Shared libraries and utilities
```

## Configuration

### Key Environment Variables
| Variable | Description |
| :--- | :--- |
| `DB_CONNECTION` | Database driver (mysql/pgsql) |
| `SUPABASE_KEY` | Secret key for object storage |
| `SUPABASE_BUCKET` | Destination bucket for receipt uploads |
| `OCR_CONFIDENCE_THRESHOLD` | Threshold for flagging manual review (Default: 0.80) |
| `AI_SERVICE_URL` | Base URL of the external AI service |
| `AI_SERVICE_API_KEY` | Shared secret for webhook authentication |
| `DAILY_PENALTY_AMOUNT` | PHP amount applied to overdue liquidations |

## Database Design

The system revolves around four primary entities:
- **Users**: Identity and role management (Employee, Approver, Admin).
- **Reimbursements**: Individual expense claims with OCR metadata.
- **CashAdvances**: Financial issuance records.
- **Liquidations**: Reconciliation records linking expenses to cash advances.
- **AuditLogs**: Immutable record of all state transitions.

## Security Considerations
- **Input Validation**: Strict schema validation for all API requests.
- **File Security**: MIME-type validation and file size limits (2MB) for all uploads.
- **Audit Trails**: Every financial mutation is logged with actor ID and IP address.
- **Session Security**: Enforced session timeouts (90 mins for users, 60 mins for admins).

## Performance and Scalability
- **Asynchronous Processing**: OCR and heavy computations are offloaded to Laravel Queues to ensure UI responsiveness.
- **Pre-aggregated Analytics**: Dashboard KPIs use pre-calculated metrics to avoid expensive table scans.
- **Indexing Strategy**: Strategic indexing on `vendor`, `date`, and `hash` fields for fast duplicate detection.

## Testing
The project utilizes PHPUnit for backend testing and Vitest for frontend unit tests.
```bash
# Run Backend Tests
cd apps/api
php artisan test

# Run Frontend Tests
cd apps/web
npm run test
```

## Contributing Guidelines
1. **Branching**: Use `feature/` and `fix/` prefixes for all new branches.
2. **Coding Standards**: Follow PSR-12 for PHP and ESLint/Prettier for JavaScript.
3. **Pull Requests**: All PRs require at least one approval and must pass all CI checks.

## License
This project is licensed under the MIT License - see the LICENSE file for details.

## Authors and Acknowledgements
- **Development Team**: Antigravity Engineering
- **Acknowledgements**: Inspired by modern clinical data management standards.
