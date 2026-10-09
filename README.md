# ⚡ EquiGen — Autonomous AI Equity Research Analyst

[![Next.js](https://img.shields.io/badge/Next.js-15.1.11-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Autonomous Agents](https://img.shields.io/badge/Architecture-Multi--Agent%20Swarm-emerald?style=flat-square)](./Architecture.md)
[![Groq](https://img.shields.io/badge/LLM-Groq%20Llama%203.3%20%2F%20GPT--4o-orange?style=flat-square)](https://groq.com/)
[![Puppeteer](https://img.shields.io/badge/PDF-Puppeteer%20(Headless)-green?style=flat-square)](https://pptr.dev/)
[![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL%2016%20Prisma-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)

**EquiGen** is an enterprise-grade AI Equity Research platform designed for institutional brokerages, research desks, and SEBI-registered analysts. It autonomously plans, executes, and synthesizes institutional-quality equity research reports by scraping live exchange filings (BSE/NSE), running quantitative 3-tier DCF valuation models, monitoring live sector news feeds, and performing statutory SEBI RA (2014) compliance audits.

---

## 🚀 Key Capabilities

### 1. 🤖 Autonomous Multi-Agent Swarm
* **Natural-Language Research Intent**: Enter intents such as *"Initiation of coverage on Eternal Limited — 5-year DCF, compare margins vs M&M, fetch Q3 concall guidance on margin recovery."*
* **Master Planner Decomposition**: Breaks intents into 6 ordered execution milestones:
  1. `Fetch Documents`: Scrapes audited annual reports, investor presentations, and concalls from BSE/NSE.
  2. `Extract Financials`: Parses revenue, EBITDA, PAT, debt, and cash flow historicals.
  3. `Build Financial Model`: 5-year DCF projection, WACC computation, and Bull/Base/Bear scenarios.
  4. `Peer Benchmark`: Aggregates live Google News RSS, ET Markets feeds, and sector valuation multiples.
  5. `Synthesise`: Assembles the living draft note across 7 institutional sections.
  6. `Compliance Audit`: Enforces SEBI (Research Analysts) Regulations 2014 disclaimers and checks.
* **Human-in-the-Loop Analyst Steering**: Pause, redirect, adjust valuation assumptions (e.g. WACC, growth rates), or skip milestones mid-flight via the **Steering Panel**.
* **Real-Time Telemetry Stream**: Server-Sent Events (SSE) stream tool calls, execution progress, and draft updates live to the UI without page refreshes. Streams are refused unless the run is owned by the requesting tenant.

### 2. 📊 Dynamic 3-Statement Engine & Live-Formula Excel Export
* **Circular Financial Mechanics**: P&L directly drives Balance Sheet and Cash Flow with zero balance sheet discrepancy ($\Delta = \text{₹0.00}$). Asserted across every projection year in `tests/unit/financial-modeling/three-statement-engine.test.ts`.
* **Working Capital Cycle Schedule**: Receivables (DSO), Inventory (DIO), and Payables (DPO) schedules dynamically feed Operating Cash Flow and track Cash Conversion Cycle (CCC).
* **Single Valuation Engine**: DCF, the sensitivity grid, and the Monte Carlo simulation all call the *same* 3-statement engine, so the displayed matrix cannot disagree with the headline target price.
* **Fail-Closed Driver Validation**: Invalid drivers (`wacc <= terminalGrowth`, a non-positive or unknown share count, unusable revenue) **throw** rather than returning a placeholder price. An unassessable valuation is reported as such and never as a ₹1 or `Infinity` target.
* **Real WACC**: $\text{Ke} = r_f + \beta \times \text{ERP}$ combined with a rating-graded cost of debt, $\text{WACC} = \text{Ke}\cdot\frac{E}{D+E} + \text{Kd}(1-t)\cdot\frac{D}{D+E}$. Both components are disclosed in the report; $r_f$ is a stated static assumption, not a live G-Sec fetch.
* **Reproducible Stochastic Results**: Monte Carlo uses a seeded PRNG and the seed is persisted on the result, so a valuation can be re-derived exactly.
* **Live Excel Generation (160+ Formulas)**: Generates institutional `.xlsx` workbooks with active calculation formulas (`=SUM()`, `=EBITDA-Capex-ΔWC`, `=PV()`, `=NPV()`) rather than static numeric dumps.

### 3. 📈 Historical Valuation Multiples Bands (±1σ, ±2σ Corridors)
* **Statistical Corridors**: Computes 3Y and 5Y historical P/E and EV/EBITDA trading corridors: Mean ($\mu$), Standard Deviation ($\sigma$), and $\pm 1\sigma, \pm 2\sigma$ bands.
* **Cyclical Regime Detection**: Flags whether the stock is trading at an **Extreme Cyclical Peak (+2σ)** (multiple compression risk) or **Deep Value / Cyclical Trough (-2σ)** (contrarian entry point).
* **Empirical Mean-Reversion Tracking**: Evaluates historical subsequent 12-month returns following extreme corridor touches.

### 4. 🔍 Forensic Accounting & Quality Health Audit
* **Overall Health Score (0-100)**: Quantitative risk classification across earnings quality, solvency, and corporate governance.
* **Explicit Coverage Tracking**: Every metric records what was and was not assessed. **Absence of data is reported as `not_assessed`, never as a passing score** — a company the system has never heard of is *not* scored as low risk.
* **Accrual Indicator (single-factor)**: CFO/PAT conversion and accrual divergence. Reported as a single-factor accrual indicator, explicitly **not** the 8-variable Beneish M-Score; it carries `isBeneishMScore: false` so no consumer can mistake it for one.
* **Altman Z-Score**: Requires **all five** factors disclosed. If any is missing it reports `not_assessed` and names the missing items rather than substituting default values and printing a published zone threshold.
* **Governance Flags**: Promoter pledging percentages, contingent liabilities vs net worth, and auditor opinion. Auditor quality reads **"Not Assessed"** when no report text is available — never a default of "Clean".

### 5. 🏢 Unified Institutional Workspace & 1-Click IC Memo
* **Consolidated Workspace**: Seamlessly integrates Executive Thesis, 3-Statement DCF Modeler, 5-Year Financials, Forensic Audit, and Regulatory Disclosures in one unified view.
* **Compliance Audit Trail**: A governance record of the SEBI audit, reviewer actions and state transitions is available alongside the draft.
* **SEBI RA (2014) Digital Sign-Off**: Mandatory statutory disclosures and analyst certification stamp.

### 6. 📄 Publication-Grade PDF Engine
* **A4 Print Layout**: Generates institutional A4 research notes with executive summaries, DCF valuation grids, concall highlights, and SEBI certification blocks.
* **Puppeteer Headless Compilation**: Server-side rendering using Puppeteer with exact print CSS and inline SVG charts.
* **SEBI RA Sign-Off**: Reviewers can review, digitally certify, and stamp reports with their official SEBI registration credentials before publishing.

### 7. 📑 Assisted Document Ingestion (Mode 2)
* **Drag-and-Drop Prospectus Processing**: Ingest raw `.pdf` or `.txt` financial reports.
* **Vision & OCR Fallback**: Automatically invokes Groq Vision (`llama-3.2-11b-vision-preview`) for charts/graphics or Tesseract OCR for scanned pages when raw text yields fewer than 100 characters.
* **Math Auditor**: Validates extracted financials for arithmetic impossibilities — negative revenue, EBITDA exceeding revenue, PAT exceeding revenue — and flags a likely **lakhs-vs-crores unit mismatch** when the PAT margin is implausibly high.
* **Self-Correction Retry Loop**: On an audit failure the LangGraph pipeline re-routes back to the extraction node and re-extracts, up to 2 retries.

---

## 🏗️ System Architecture

For in-depth architectural diagrams, subagent specifications, SSE event schemas, and data provenance safeguards, please see:
👉 **[Architecture.md](./Architecture.md)**

---

## ⚡ Quick Start & Installation

### Prerequisites
* **Node.js 20+** and **pnpm 10+** installed globally (`packageManager` is pinned to `pnpm@10.22.0`).
* **PostgreSQL 15 or 16** running locally or via Docker.
* A **Groq API key** from [console.groq.com](https://console.groq.com) and/or an **OpenAI API key**.
* An **OpenRouter API key** (optional, used as an auxiliary free fallback).

```bash
npm install -g pnpm
```

### Installation Steps

1. **Clone the repository and install dependencies**:
   ```bash
   pnpm install
   ```

2. **Rebuild native PDF canvas bindings**:
   ```bash
   pnpm rebuild @napi-rs/canvas
   ```

3. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```
   The app has **no defaults** for the secrets below — it refuses to start without
   them rather than falling back to a hardcoded key. See [SECURITY.md](./SECURITY.md)
   for full deployment prerequisites.

   ```env
   # ── LLM provider keys ────────────────────────────────────────────────
   GROQ_API_KEY="gsk_your_groq_api_key"
   OPENAI_API_KEY="sk-your_openai_api_key"
   OPENROUTER_API_KEY="sk-or-your_openrouter_api_key"

   # ── Database ─────────────────────────────────────────────────────────
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/equigen_db?sslmode=disable"

   # ── Required secrets ────────────────────────────────────────────────
   # HMAC key for session JWTs. At least 32 characters.
   #   openssl rand -base64 48
   JWT_SECRET=""

   # AES-256-GCM key that encrypts every tenant's stored BYOK provider key.
   # Exactly 64 hex characters (32 bytes) — NOT 32 alphanumeric characters.
   #   openssl rand -hex 16
   # Rotating this makes existing ciphertext unreadable; see SECURITY.md.
   ENCRYPTION_KEY=""

   # Optional. Empty disables the credential entirely (local dev only).
   API_SECRET=""

   # Required for headless callers (agent runner, CI, Playwright).
   #   openssl rand -hex 32
   INTERNAL_API_SECRET=""

   # ── App ──────────────────────────────────────────────────────────────
   NEXT_PUBLIC_APP_URL="http://localhost:3000"

   # ── Feature flags (both default OFF) ─────────────────────────────────
   # Grants sandboxed Python execution as the app process. Admin/reviewer only.
   ENABLE_SANDBOX_EXECUTION="false"
   # Anonymous demo login. Always refused in production regardless of this value.
   ENABLE_DEMO_LOGIN="false"
   ```

4. **Initialize Database & Run Migrations**:
   ```bash
   pnpm exec prisma generate
   pnpm exec prisma db push
   ```

5. **Start Development Server**:
   ```bash
   pnpm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 💻 Developer Commands

| Command | Description |
| :--- | :--- |
| `pnpm run dev` | Starts Next.js development server with hot module reload on port 3000. |
| `pnpm test` / `pnpm test:unit` | Runs the Vitest unit & integration suite (31 files, 372 tests). |
| `pnpm test:e2e` | Runs the Playwright end-to-end suite (needs Postgres + a browser). |
| `pnpm typecheck` | Runs `tsc --noEmit`. |
| `pnpm run build` | Builds the production Next.js bundle. |
| `pnpm run start` | Runs the compiled production application. |
| `pnpm run lint` | Runs ESLint over the codebase (0 errors, 0 warnings enforced). |
| `pnpm audit:secrets` | Scans git-tracked files for committed credentials. Also runs first in CI. |
| `pnpm audit:deps` | Dependency audit; fails on high-severity advisories. |
| `pnpm exec prisma studio` | Launches Prisma web GUI to inspect database tables and records. |
| `pnpm exec prisma db push` | Pushes schema changes in `schema.prisma` directly to PostgreSQL. |
| `docker compose up -d db` | Launches a local PostgreSQL 16 container (bound to `127.0.0.1` only). |

---

## 🗺️ API Route Overview

Every route below requires an authenticated tenant session (`requireTenantSession`).
Exceptions are the `/api/auth/*` entry points and `/api/billing/webhook`, which is
authenticated by provider signature rather than a session.

### Planning & execution

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/agent/plan` | `POST`, `GET`, `DELETE` | Decomposes goals into milestones; retrieves a plan (owner-scoped) or lists the caller's plans. |
| `/api/agent/plan/[id]/approve` | `PUT` | Reviewer approval before execution. Requires a reviewer/admin role. |
| `/api/agent/execute` | `POST` | Dispatches the `MasterOrchestrator` to execute the multi-agent DAG. |
| `/api/agent/cancel` | `POST` | Cancels an in-flight plan or extraction job. |
| `/api/agent/steer` | `POST` | Analyst steering (`pause`, `resume`, `redirect`, `cancel`, …). Ownership enforced; `actorId` is taken from the session, never the body. |
| `/api/agent/stream` | `GET` | SSE stream of live trajectory and subagent events. Refused unless the run is owned by the caller. |
| `/api/agent/session` | `GET` | Returns the research session bound to a report or plan. |
| `/api/agent/run-document` | `POST` | Runs the document-fetch milestone. |
| `/api/agent/run-modeling` | `POST` | Runs the DCF / 3-statement milestone. |
| `/api/agent/run-market-intel` | `POST` | Runs peer benchmarking and market data. |
| `/api/agent/run-synthesis` | `POST` | Assembles the draft note and runs the cross-section consistency check. |
| `/api/agent/run-compliance` | `POST` | Runs the SEBI RA (2014) compliance audit. |

### Report authoring & approval

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/agent/chat` | `POST` | Copilot turn against a research session (owner-scoped). |
| `/api/agent/modify` | `POST` | Applies a copilot edit to a draft report. Refused once a report is signed off. |
| `/api/report` | `POST` | Compiles a branded A4 PDF from validated report data. Always renders as `draft`. |
| `/api/approve` | `POST` | SEBI sign-off. The only path that may set `approved`/`published`; reviewer identity and registration number come from the authenticated session. |
| `/api/proposals` | `GET`, `POST`, `PATCH` | Field-correction proposals. Approving one mutates the report body and requires a reviewer/admin role. |
| `/api/reports/assign` | `POST` | Assigns a report to a reviewer **within the same organisation**. |
| `/api/download` | `GET` | Serves the publication-grade PDF, subject to the authenticity gate. |
| `/api/excel/export` | `GET`, `POST` | Generates the live-formula Excel model, subject to the same gate. |
| `/api/upload` | `POST` | Multipart upload (`.pdf` / `.csv` / `.txt`, ≤ 100 MB). The binary is parsed, never written to disk. |

### Data & analysis

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/extract` | `POST` | Submits a document for assisted extraction. |
| `/api/extract/status` | `GET` | Progress and checkpoints of an extraction job (owner-scoped). |
| `/api/extract/batch` | `GET`, `POST` | Submits and monitors a multi-document batch. |
| `/api/extract/resume` | `POST` | Resumes a failed extraction from its checkpoint. |
| `/api/valuation-bands` | `GET` | Historical P/E and EV/EBITDA corridors at ±1σ, ±2σ. |
| `/api/eval` | `GET` | Authenticity evaluation helpers. |
| `/api/eval/run` | `GET` | Full pipeline evaluation for a ticker (tenant-scoped). |
| `/api/sandbox/execute` | `POST` | Sandboxed Python. **Off by default** (`ENABLE_SANDBOX_EXECUTION`), admin/reviewer only, rate-limited. |

### Workspace & settings

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/history` | `GET`, `POST`, `DELETE` | Report list, draft save, delete. Status is **not** writable here. |
| `/api/audit` | `GET` | Immutable audit trail for a report the caller owns. |
| `/api/settings/org` | `GET`, `PATCH` | Organisation profile (admin only for writes). |
| `/api/settings/keys` | `GET`, `POST` | Manages AES-256-GCM encrypted BYOK credentials. Returns only a boolean, never the key. |
| `/api/auth/signin`, `/api/auth/signup`, `/api/auth/signout`, `/api/auth/me` | — | Session lifecycle. Sign-up may only create `analyst`/`reviewer`; `admin` is granted solely to the first user of a new organisation. |
| `/api/auth/demo` | `POST` | Anonymous demo login. **Disabled by default and always refused in production.** |
| `/api/billing/checkout`, `/api/billing/subscription` | `GET`, `POST` | Subscription management. |
| `/api/billing/webhook` | `POST` | Provider-signed webhook (verified by HMAC with a replay window; not session-authenticated). |

---

## 🔒 Security & Data Integrity

EquiGen is a multi-tenant research platform where a wrong number is a compliance
problem, so the guiding rule is **fail closed**: unknown or unverifiable data is
reported as `not_assessed` / `NOT RATED` / `n/a`, never inferred, defaulted, or
rendered as a pass.

* **Tenant isolation** — every route authenticates via `requireTenantSession` and
  authorises via `canAccessTenantRecord`. Firm admins manage their own firm; only the
  `INTERNAL_API_SECRET` platform-operator identity crosses tenants. Ownership is
  proven from the database row, never from a caller-supplied id.
* **Enforced publication gate** — reports are checked for authenticity, cross-section
  consistency, and SEBI compliance before export or approval. A missing or unreadable
  check **blocks** distribution; an override requires a reviewer/admin role plus a
  written justification, and is recorded in the audit trail.
* **Binding verification** — the consistency checker (all sections vs the model),
  the pipeline evaluation, and the compliance audit all gate the final status rather
  than running and being discarded.
* **Single state machine** — `transitionReportStatus` is the only path to
  `approved`/`published`. Sign-off identity and SEBI registration number come from the
  authenticated session, never the request body.
* **No fabricated figures** — the report renderer emits only what the engines
  computed. Missing peers, a missing financial history, an unavailable sensitivity grid
  and an absent reference price each produce an explicit statement, never an estimated
  substitute.

See **[SECURITY.md](./SECURITY.md)** for deployment prerequisites, required secrets and
their rotation, feature flags that default off, and the surfaces that were reviewed
and found clean.

---

## 📄 Regulatory & Compliance Note

EquiGen reports include statutory disclosure sections compliant with the **SEBI (Research Analysts) Regulations, 2014**. Research notes include analyst certifications, standard risk warnings, and conflict-of-interest declarations. The platform provides digital sign-off gating where certified reviewers can review findings and append their official SEBI registration number prior to final PDF publication.

The sign-off identity and registration number are read from the authenticated reviewer's
account, not from the request, so the attestation names the reviewer who actually
performed the review. A report whose authenticity, consistency or compliance checks
cannot be verified is held at `pending_review` and is not distributable.

---

## 📄 License

Proprietary. Developed for EquiGen research systems. All rights reserved.
