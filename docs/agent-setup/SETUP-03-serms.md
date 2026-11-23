# SETUP-03 — smart-expense-reimbursement-management-system / SERMS (One-Shot Subagent Guide)

> **How to use this file:** This guide ships **inside the repo** at `docs/agent-setup/SETUP-03-serms.md` — the repo is already cloned to the user's machine. Feed this entire file to a subagent (or AI agent) and say _"Follow this guide end-to-end starting from the repo root."_ The subagent must execute every phase in order and handle everything itself. It must **STOP and ask the user** only at the marked `USER-INPUT-GATE`s (secret `.env` values). Nothing else requires user intervention.
>
> **Last verified:** Sept 6, 2026 · **Guide version:** 1.1.0 (in-repo edition — assumes the already-cloned repo) · **Covers repo:** `smart-expense-reimbursement-management-system` (`dev` branch default)

---

## 1. Subagent Directive (read first, obey strictly)

You are the **setup subagent** for SERMS — the Modular Monolith financial-compliance app (Laravel 13 API + Vue 3 SPA + MySQL + Redis + Supabase + external OCR + auth-module SSO).

Rules:

1. Execute phases **0 → 8 in order**. Do not skip verification phases.
2. **Assume Windows 11 + Windows PowerShell 5.1** unless `uname` proves otherwise. PowerShell commands first; Bash/WSL variants noted.
3. Prefer **Docker Compose (golden path)**. Bare-metal (`composer run dev` + `npm run dev`) is a documented fallback only.
4. **Never invent secrets.** At each `USER-INPUT-GATE`, stop, show exact keys, accept user values, then continue. Safe local placeholders are allowed only when the user explicitly says "use local defaults".
5. Quote paths with spaces. Verify parents with `Test-Path -LiteralPath "<parent>"` before creating anything.
6. SERMS integrates with **two sibling stacks** (`capstone-auth-module` for SSO/token verify, `ocr-pipeline` for receipt OCR). If they are not running, SERMS still boots — those features degrade. Note integration status explicitly in your final report; do not fake it as working.
7. Finish only when **Definition of Done (§9)** is fully green. Report evidence (command + output), never claims.
8. Obey repo governance while working: canonical spec is `docs/SERMS.md` (read before changing code/docs); never mutate `audit_logs`/`penalties` semantics; every doc change here is already covered by this guide's changelog entry — do not invent extra migrations.
9. **Do not create or add new files, and do not change the codebase, unless it is necessary to finish setup.** Setup legitimately creates: `apps/api/.env` and `apps/web/.env` copied from their `.env.example` files, the external Docker network, containers/volumes, applied migrations/seeds, and cache clears this guide explicitly orders. Anything beyond that — new source files, edits to app code or configs, dependency changes — is out of scope: STOP, explain why you believe it is necessary, and ask the user first.
10. **Use the repo's other docs as references whenever you need them.** If a step is ambiguous or fails, consult the canonical read order (`docs/SERMS.md` first, then `PRD`/`SAD`/`SDD`/`DSD`/`OPS`/`QAD`/`Build`, plus `AGENTS.md`) before improvising — and cite which doc resolved it in your report. If any doc conflicts with this guide, STOP and ask the user instead of guessing.

---

## 2. What You Are Setting Up

| Item | Value (verified from repo) |
| :--- | :--- |
| Repo URL | `https://github.com/Zanti00/smart-expense-reimbursement-management-system.git` |
| Local folder note | This repo — you are already inside the clone (this guide ships at `docs/agent-setup/` in it). The folder may be named `smart-expense-reimbursement-management-system` (full clone name) or `smart-expense-management-system` (short workspace name, same project); do not rename without user approval. |
| Backend | Laravel `^13.7` on PHP `^8.3`, Modular Monolith (`app/Modules/*`), Queues, Sanctum/JWT — see `apps/api/composer.json` |
| Frontend | Vue `^3.4.0`, Vite `^5.2.0`, Pinia, Tailwind `^3.4.3`, `lucide-vue-next ^0.373.0`, Chart.js — see `apps/web/package.json` |
| Infra | Docker Compose: `mysql` (8.0), `redis` (alpine), `php` (FPM, entrypoint-automated), `api` (Nginx `:8000`), `api_queue` (queue worker), `web` (Vite dev `:5002`), `phpmyadmin` (`:8080`) |
| Host ports | API `8000`, web `5002→5002`, MySQL `3306`, phpMyAdmin `8080→80`; `php`/`redis`/`api_queue` internal |
| Networks | `serms_network` (internal) + `shared-capstone-network` (external, must exist) |
| Integrations | `AUTH_SERVICE_URL=http://auth-service:8000` (container DNS; needs auth stack Up on same network); `AI_SERVICE_URL=http://ocr_api:8010` (needs OCR stack Up); Supabase S3 bucket for receipts; PRS reimbursement-status webhook (optional locally) |
| Time / disk | 15–30 min first boot (plus Docker install if missing); ~5–8 GB images + volumes |

> **Port-conflict warning:** SERMS API and `capstone-auth-module` both bind host `8000`. Do **not** run both stacks' port-8000 services simultaneously without remapping. Recommended bring-up order: `capstone-auth-module` → `ocr-pipeline` → SERMS, stopping or remapping colliding host ports as needed. Container-to-container names (`serms_api:8000`, `auth-service:8000`, `ocr_api:8010`) do not collide — only host bindings do.

---

## 3. Phase 0 — Host Triage (never skip, never fails)

```powershell
$PSVersionTable.PSVersion; [Environment]::OSVersion.VersionString
Get-Command git -ErrorAction SilentlyContinue; git --version
Get-Command docker -ErrorAction SilentlyContinue; docker --version; docker compose version
Get-Command node -ErrorAction SilentlyContinue; node --version; npm --version
Get-Command php -ErrorAction SilentlyContinue; php --version
Get-Command composer -ErrorAction SilentlyContinue; composer --version
Get-Command winget -ErrorAction SilentlyContinue; winget --version
Test-Path -LiteralPath "C:\Projects"
docker network ls | Select-String "shared-capstone-network"
docker ps --format "{{.Names}} ({{.Status}}) ({{.Ports}})"
```

**Interpretation:**

- `docker` missing → install Docker Desktop (Phase 1A). Required for golden path.
- `git` missing → install Git (Phase 1B).
- `node` missing or `< v18` (repo README floor) — but prefer `v20 LTS` to match sibling stacks → install Node 20 (Phase 1C). Needed for host-side `npm run build/test` and bare-metal fallback.
- `php`/`composer` missing → only needed for bare-metal backend; Docker path carries PHP 8.3-FPM inside `php`/`api_queue` images. Install only for no-Docker fallback.
- `shared-capstone-network` absent → create in Phase 3.
- Port `8000`/`3306`/`5002`/`8080` already `LISTENING` → note now; Phase 6 resolves.

---

## 4. Phase 1 — Zero-State Prerequisite Installer

Do only the sub-steps needed per Phase 0.

### 1A. Docker Desktop (required for golden path)

```powershell
winget install --id Docker.DockerDesktop -e --accept-package-agreements --accept-source-agreements
# Fallback: https://www.docker.com/products/docker-desktop/ (enable WSL 2 backend, reboot if asked)
```

Start **Docker Desktop**, wait for steady tray + green status, then in a **fresh** PowerShell:

```powershell
docker --version; docker compose version; docker info
```

Socket error `//./pipe/dockerDesktopLinuxEngine` → Desktop not running. Start/restart it.

### 1B. Git (required)

```powershell
winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
# Fallback: https://git-scm.com/download/win
git --version
```

### 1C. Node.js 20 LTS (required for host checks + frontend build/test)

```powershell
winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
# Fallback: https://nodejs.org/en/download (20.x LTS)
# New PowerShell, then:
node --version  # expect v20.x (repo floor is 18.x, 20 preferred)
npm --version
```

### 1D. PHP 8.3 + Composer (bare-metal only — skip if using Docker)

```powershell
winget install --id PHP.PHP.8.3 -e --accept-package-agreements --accept-source-agreements
winget install --id Composer.Composer -e --accept-package-agreements --accept-source-agreements
# Fallbacks: https://windows.php.net/download/ (8.3 Thread Safe) + https://getcomposer.org/download/
php --version; composer --version
```

> Open a **new** PowerShell window after any install before continuing.

---

## 5. Phase 2 — Locate the Repo (already cloned — verify, do not re-clone)

This guide ships inside the clone. Start from the repo root (the directory containing `docker-compose.yml` and `apps/`):

```powershell
# Verify you are at the repo root:
Test-Path -LiteralPath ".\docker-compose.yml"
Test-Path -LiteralPath ".\apps\api"
Test-Path -LiteralPath ".\apps\web"
git status -sb; git branch --show-current; git log --oneline -3
```

Never re-clone over uncommitted work. Record the actual path + branch/commit for the final report. All relative paths below assume repo root.

> **Folder-name note:** a fresh clone creates `smart-expense-reimbursement-management-system`, but an existing workspace may use the short name `smart-expense-management-system` (same project). Either is fine — do not rename without user approval.
>
> **Fallback only:** if the repo is somehow missing from this machine, clone it with `git clone https://github.com/Zanti00/smart-expense-reimbursement-management-system.git` and start over from Phase 0 in the fresh clone.

---

## 6. Phase 3 — Shared Network + Environment Files

### 3A. External network (idempotent)

```powershell
docker network ls | Select-String "shared-capstone-network"
# If no output:
docker network create shared-capstone-network
```

`docker-compose.yml` requires it (`shared-capstone-network: external: true` for `php`, `api`, `api_queue`, `web`). `up` fails without it.

### 3B. USER-INPUT-GATE — `.env` values (STOP here if secrets are missing)

There is **no root `.env`** for SERMS. Two app-level files matter:

**File A — `apps/api/.env`** (Laravel; template `apps/api/.env.example`; entrypoint auto-copies + generates `APP_KEY` + migrates):

| Key | What to do |
| :--- | :--- |
| `APP_KEY` | Leave blank on first boot — entrypoint runs `key:generate --force`. If already set, keep it. |
| `DB_*` | Keep compose defaults (`mysql`/`serms`/`root`/`secret`) for Docker. Bare-metal: point at host MySQL. |
| `REDIS_HOST` / `CACHE_STORE` | Keep `redis`/`redis` for Docker. |
| `AUTH_SERVICE_URL` (`http://auth-service:8000`), `JWT_SECRET` / `JWT_PUBLIC_KEY_PATH` (`storage/oauth-public.key`) | Ask user. Local default `http://auth-service:8000` works only when the auth stack is Up on `shared-capstone-network`. `JWT_*` must match the auth-module's Passport keys for token verification — copy the public key material per `docs/SDD.md` auth-proxy section; never invent a JWT secret for shared envs. |
| `SUPABASE_URL`, `SUPABASE_REGION`, `SUPABASE_BUCKET`, `SUPABASE_ENDPOINT`, `SUPABASE_ACCESS_KEY_ID`, `SUPABASE_SECRET_ACCESS_KEY` | **Ask user.** Entrypoint uses placeholders by default; receipt uploads fail without real Supabase creds (from Supabase dashboard). Local boot succeeds, uploads do not. |
| `AI_SERVICE_URL` (`http://ocr_api:8010` in compose; `http://ai-service:8000` in `.env.example` — normalize to `http://ocr_api:8010`), `AI_SERVICE_API_KEY`, `AI_SERVICE_TIMEOUT` (`10`), `AI_SERVICE_CALLBACK_BASE_URL` (`http://serms_api:8000`) | Ask user. `AI_SERVICE_API_KEY` must equal OCR `CALLBACK_API_KEY` (`ocr-callback-key-change-me` by default on both sides). Mismatches break OCR callbacks silently. |
| `PRS_REIMBURSEMENT_*` (`API_KEY`, `STATUS_API_URL`, `STATUS_API_KEY`, `TIMEOUT`) | Optional locally. Keep compose defaults (`prs-serms-local-service-key` / `serms-prs-local-service-key`) unless integrating a live PRS instance — then ask for real values. |
| `MAIL_*`, `AWS_*` | Keep `log`/blank local defaults unless user supplies real mail/S3 values. |

**File B — `apps/web/.env`** (Vite; template `apps/web/.env.example`):

```ini
VITE_AUTH_MODULE_URL=http://localhost:5173
VITE_API_BASE_URL=http://localhost:5173
```

Keep both pointing at the auth gateway (`:5173`) per current frontend auth-proxy design (see `docs/SDD.md`). Only change if the auth gateway runs on a different host/port — then ask user.

Commands:

```powershell
Test-Path -LiteralPath ".\apps\api\.env"; Test-Path -LiteralPath ".\apps\web\.env"
Copy-Item -LiteralPath ".\apps\api\.env.example" -Destination ".\apps\api\.env" -ErrorAction SilentlyContinue
Copy-Item -LiteralPath ".\apps\web\.env.example" -Destination ".\apps\web\.env" -ErrorAction SilentlyContinue
```

Fill user-supplied Supabase/Auth/AI/PRS values now. After any `apps/api/.env` edit post-boot: `docker compose exec php php artisan config:clear; docker compose restart php api api_queue` (entrypoint caches config on boot).

> **STOP condition:** Without Supabase creds, record "receipt uploads will fail until Supabase is configured" explicitly — do not mark uploads as verified. Without matching Auth/AI keys, record those integrations as "degraded (keys pending)".

---

## 7. Phase 4 — Build, Start, Migrate, Seed

```powershell
# From repo root:
docker compose up -d
# (First boot builds php + web images; mysql/redis/phpmyadmin pull.)
docker compose ps
docker compose logs --tail=100 php
```

What the `php` entrypoint (`apps/api/docker-entrypoint.sh`) does automatically — **do not run manually unless logs prove a skip**:

1. Waits for `mysql:3306` (`mysqladmin ping` loop, uses `DB_HOST`/`DB_PORT`).
2. Ensures `vendor/`, `bootstrap/cache`, `storage/*` exist; `composer install` if `vendor/autoload.php` missing.
3. Copies `.env.example` → `.env` if missing; generates `APP_KEY` if blank.
4. `optimize:clear`; `migrate --force`; `config:cache` + `event:cache`; `route:clear` (route caching deliberately disabled — bind-mounted source + shared bootstrap volume would serve stale `routes-v7.php`).
5. `SERMS_SERVICE_ROLE=worker` containers (`api_queue`) wait for `vendor/autoload.php` + `config.php`, then `exec "php artisan queue:work --sleep=1 --tries=3"`.

**Manual steps you must still run** (not automatic):

```powershell
# Seed roles/users/policies/test accounts (required for login + RBAC debugging):
docker compose exec php php artisan db:seed --force
# If migrations were skipped or failed:
docker compose exec php php artisan migrate --force
docker compose logs --tail=40 php
docker compose logs --tail=30 api_queue
```

Wait until `mysql` is `healthy`, `php`/`api`/`api_queue`/`web` are `Up`, and `php` logs show `Database is ready!` → `Running database migrations...` → `Building Laravel boot caches...` with no `SQLSTATE` errors (up to ~90s first boot while MySQL initializes `serms_mysql_data`).

---

## 8. Phase 5 — Verify (must all pass before declaring done)

```powershell
docker compose ps
docker compose exec -T php php artisan --version
# API liveness (Nginx → php-fpm):
curl.exe http://localhost:8000/up
Invoke-WebRequest -Uri "http://localhost:8000/up" -UseBasicParsing | Select-Object StatusCode, Content
# Frontend + DB admin:
Start-Process "http://localhost:5002"
Start-Process "http://localhost:8080"  # phpMyAdmin (server mysql, user root / serms_user, pass secret)
docker compose logs --tail=30 php
docker compose logs --tail=20 api_queue
```

| Check | Expected |
| :--- | :--- |
| `docker compose ps` | `serms_mysql` (healthy), `serms_redis_internal`, `serms_php`, `serms_api`, `serms_api_queue`, `serms_web`, `serms_phpmyadmin` all `Up` |
| `GET http://localhost:8000/up` | `200` |
| `GET http://localhost:5002` in browser | SERMS SPA loads (Vite dev; first load compiles — allow ~30s) |
| `GET http://localhost:8080` | phpMyAdmin login; `serms` DB + migrated tables visible |
| `docker compose exec php php artisan migrate:status` | All migrations `Ran` (no `Pending`) |
| Seeded login (see table below) | Can log in via UI or `POST /api/login` per `routes/`; `401` only with wrong creds, `403` only on forbidden RBAC action, `409` only on duplicates |
| `api_queue` logs | `queue:work` processing (no `SQLSTATE`, no Redis `Connection refused`) |
| Optional: `docker compose exec php php artisan test` | PHPUnit passes; `npm run test` in `apps/web` (or `docker compose exec web npm run test`) → Vitest passes |

**Seeded test accounts** (from `docs/Build.md` §6 — use for role-based debugging, never commit new passwords):

| Role | Email | Password |
| :--- | :--- | :--- |
| Employee (Standard) | `employee@example.com` | `password` |
| Accounting / Finance | `sum@sbsi.com` | `password` |
| IT Admin | `admin@example.com` | `password` |
| Approver / Finance Mgr | `approver@example.com` | `password` |
| Finance Admin | `finance-admin@example.com` | `password` |
| Finance Officer | `finance@example.com` | `password` |
| Operations Mgr | `manager@example.com` | `password` |
| Sales Rep | `sales@example.com` | `password` |

Integration status to report (not all green is normal for solo SERMS boot):

- Auth SSO (`AUTH_SERVICE_URL`): green only if `capstone-auth-module` stack is Up on `shared-capstone-network` and JWT keys match.
- OCR (`AI_SERVICE_URL`): green only if `ocr-pipeline` stack is Up and `AI_SERVICE_API_KEY` == OCR `CALLBACK_API_KEY`.
- Supabase receipts: green only with real Supabase creds.
- PRS webhooks: green only with live PRS values.

---

## 9. Phase 6 — Troubleshooting (consult before retrying blindly)

| Symptom | Cause → Fix |
| :--- | :--- |
| `network shared-capstone-network ... not found` | Missed §6-3A → `docker network create shared-capstone-network`, `up -d` again. |
| `port is already allocated` (`8000`/`3306`/`5002`/`8080`) | Auth stack holds `8000`, or local MySQL holds `3306` → stop the holder (`down` in other repo / stop local MySQL) or remap the colliding host port. |
| `php` loops `Database ... is not available yet` | `serms_mysql` still initializing → `docker compose ps`, `docker compose logs mysql`, wait up to 2 min; on persistent failure `docker compose up -d --force-recreate mysql`. |
| `SQLSTATE[HY000] [2002]` in `php`/`api_queue` | DB host/creds mismatch between compose env and `apps/api/.env` → align `DB_HOST=mysql`, `DB_DATABASE=serms`, user/pass; `restart php api_queue`. |
| `MissingAppKeyException` | Keygen skipped → `docker compose exec php php artisan key:generate --force`; `restart php`. |
| New API route `404`s after code pull | Stale route cache paranoia — entrypoint already does `route:clear`; if manually cached, `docker compose exec php php artisan route:clear`. Never `route:cache` in this compose layout (see entrypoint comment). |
| `web` shows blank / Vite HMR errors | `node_modules` volume sync or `VITE_*` mispoint → `docker compose logs web`, confirm `VITE_API_BASE_URL`/`VITE_AUTH_MODULE_URL`; `docker compose up -d --build --force-recreate web`. |
| Receipt upload fails (`Supabase`/`S3` errors) | Placeholder Supabase creds → supply real `SUPABASE_*` in `apps/api/.env`, `restart php api_queue`. |
| OCR dispatch/callback never completes | OCR stack down or `AI_SERVICE_API_KEY` ≠ OCR `CALLBACK_API_KEY` → bring OCR Up, align keys, check `api_queue` + OCR `worker` logs. |
| Auth verify fails / redirects to login loop | Auth stack down or JWT key mismatch → bring auth Up, align `JWT_*` / public key per `docs/SDD.md`. |
| `vendor/` stale after branch switch | Entrypoint heals via `composer install`/`dump-autoload` on lock change; else `docker compose exec php composer install` then `restart php api_queue`. |

Daily commands:

```powershell
docker compose up -d
docker compose logs -f
docker compose exec php php artisan migrate
docker compose exec php php artisan db:seed --force
docker compose exec php ./vendor/bin/pint        # backend lint
docker compose exec php php artisan test         # backend tests
docker compose down                              # stop, keep volumes
# docker compose down -v                         # DESTRUCTIVE: wipes MySQL — ask user first
```

Bare-metal fallback (only if user refuses Docker):

```powershell
# Backend (starts server + queue + log tailer concurrently):
Set-Location -LiteralPath ".\apps\api"; composer run dev
# Frontend (second terminal):
Set-Location -LiteralPath ".\apps\web"; npm install; npm run dev
```

---

## 10. Phase 7 — Stop / Reset

- **Stop (safe):** `docker compose down` — keeps `serms_mysql_data`, `serms_api_vendor`, `serms_api_bootstrap_cache`.
- **Full reset (destructive):** `docker compose down -v` — wipes MySQL + vendor/cache volumes (fresh migrate+seed required). Only with explicit user approval.
- **Rebuild images:** `docker compose up -d --build` (after `Dockerfile`/lock changes).

---

## 11. Definition of Done (all boxes must be checked)

- [ ] Docker Desktop running, `shared-capstone-network` exists.
- [ ] Repo present at recorded path, branch/commit recorded.
- [ ] `apps/api/.env` + `apps/web/.env` present; Supabase/Auth/AI/PRS keys explicitly resolved (real values or user-accepted placeholders with degradation noted).
- [ ] `docker compose ps` shows all 7 services `Up`, `mysql` healthy.
- [ ] `GET http://localhost:8000/up` → `200`; SPA loads at `http://localhost:5002`; phpMyAdmin reachable at `http://localhost:8080`.
- [ ] `migrate:status` shows no `Pending`; `db:seed` applied (test logins work).
- [ ] `api_queue` worker running with no Redis/DB errors.
- [ ] Integration status reported honestly: Auth SSO (up/degraded), OCR (up/degraded), Supabase (configured/placeholder), PRS (live/local-default).
- [ ] Report lists: repo path, branch/commit, container states, health outputs, seed result, integration matrix, and any deviations.

---

## 12. Appendix — File Map (where things live)

```text
.
├── apps/api/               # Laravel 13 Modular Monolith (app/Modules/*, Dockerfile, docker-entrypoint.sh, .env.example)
├── apps/web/               # Vue 3 + Vite + Pinia + Tailwind (Dockerfile, .env.example)
├── nginx/nginx.conf        # API gateway (Nginx :8000 → serms_php:9000, 10M uploads)
├── docker-compose.yml      # mysql + redis + php + api + api_queue + web + phpmyadmin
└── docs/                   # SERMS.md (canonical spec — read first) → PRD/SAD/SDD/DSD/OPS/QAD/Build + agent-setup/ (these guides)
```

Canonical read order before changing code: `docs/SERMS.md` → `docs/CHANGELOG.md` (`DOC_CHANGELOG.md`) → `PRD` → `SAD` → `SDD` → `DSD` → `OPS` → `QAD` → `Build` → `AGENTS.md`. Full stack pins, golden-path patterns, guardrails, and test accounts: `docs/Build.md`.
