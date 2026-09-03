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
* **Real-Time Telemetry Stream**: Server-Sent Events (SSE) stream tool calls, execution progress (17% → 100%), and draft updates live to the UI without page refreshes.

### 2. 🛡️ Data Integrity & Transparency
* **No Synthetic Data in Researched Reports**: Completed reports are compiled directly from audited exchange filings and live models stored in `ReportHistory`.
* **Terminal Data Quality Report**: Each pipeline execution outputs an audit block detailing live vs fallback status across all 6 data sources.
* **Transparent Fallbacks**: If live filings are restricted or unavailable, models explicitly flag `isDerivedFromRealData: false` and inject statutory disclaimers.

### 3. 📄 Publication-Grade PDF Engine
* **A4 Print Layout**: Generates institutional A4 research notes with executive summaries, DCF valuation grids, concall highlights, and SEBI certification blocks.
* **Puppeteer Headless Compilation**: Server-side rendering using Puppeteer with exact print CSS and inline SVG charts.
* **SEBI RA Sign-Off**: Reviewers can review, digitally certify, and stamp reports with their official SEBI registration credentials before publishing.

### 4. 📑 Assisted Document Ingestion (Mode 2)
* **Drag-and-Drop Prospectus Processing**: Ingest raw `.pdf` or `.txt` financial reports.
* **Vision & OCR Fallback**: Automatically invokes Groq Vision (`llama-3.2-11b-vision-preview`) for charts/graphics or Tesseract OCR for scanned pages when raw text yields fewer than 100 characters.
* **Math Auditor Node**: Automatically validates extracted financial statements (e.g. EBITDA ≤ Revenue, PAT ≤ EBITDA) and feeds discrepancies back into a self-correction retry loop.

---

## 🏗️ System Architecture

For in-depth architectural diagrams, subagent specifications, SSE event schemas, and data provenance safeguards, please see:
👉 **[Architecture.md](./Architecture.md)**

---

## ⚡ Quick Start & Installation

### Prerequisites
* **Node.js 20+** and **pnpm 9+** installed globally.
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
   Configure the following variables in `.env`:
   ```env
   # LLM Provider Keys
   GROQ_API_KEY="gsk_your_groq_api_key"
   OPENAI_API_KEY="sk-your_openai_api_key"
   OPENROUTER_API_KEY="sk-or-your_openrouter_api_key"

   # Database Connection (PostgreSQL 16)
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/equigen_db?sslmode=disable"

   # BYOK Key Encryption (Must be exactly 32 alphanumeric characters)
   ENCRYPTION_KEY="your-32-character-secret-key-12"

   # Application URL
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
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
| `pnpm run build` | Builds the production Next.js bundle. |
| `pnpm run start` | Runs the compiled production application. |
| `pnpm run lint` | Runs ESLint over the codebase (0 errors, 0 warnings enforced). |
| `pnpm exec prisma studio` | Launches Prisma web GUI to inspect database tables and records. |
| `pnpm exec prisma db push` | Pushes schema changes in `schema.prisma` directly to PostgreSQL. |
| `docker compose up -d db` | Launches a local PostgreSQL 16 container via Docker Compose. |

---

## 🗺️ API Route Overview

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/agent/plan` | `POST`, `GET` | Decomposes goals into milestones; retrieves plan and report sections. |
| `/api/agent/execute` | `POST` | Dispatches the `MasterOrchestrator` to execute the multi-agent DAG. |
| `/api/agent/stream` | `GET` | Server-Sent Events (SSE) streaming live trajectory and subagent events. |
| `/api/agent/steering` | `POST` | Submits analyst steering commands (`pause`, `resume`, `redirect`, `skip`). |
| `/api/agent/plan/[id]/approve` | `PUT` | Analyst plan approval before execution kicks off. |
| `/api/download` | `GET` | Compiles or serves publication-grade A4 PDF reports via Puppeteer. |
| `/api/extract` | `POST` | Submits raw files for assisted document extraction (Mode 2). |
| `/api/extract/status` | `GET` | Polls progress and state checkpoints of manual extraction jobs. |
| `/api/history` | `GET` | Returns list of completed reports for the authenticated organization. |
| `/api/settings/keys` | `GET`, `POST` | Manages AES-256-GCM encrypted Bring-Your-Own-Key (BYOK) API credentials. |

---

## 📄 Regulatory & Compliance Note

EquiGen reports include statutory disclosure sections compliant with the **SEBI (Research Analysts) Regulations, 2014**. Research notes include analyst certifications, standard risk warnings, and conflict-of-interest declarations. The platform provides digital sign-off gating where certified reviewers can review findings and append their official SEBI registration number prior to final PDF publication.

---

## 📄 License

Proprietary. Developed for EquiGen research systems. All rights reserved.
