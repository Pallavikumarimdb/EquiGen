# ⚡ EquiGen — AI-Powered Equity Research Engine

[![Next.js](https://img.shields.io/badge/Next.js-15.1.11-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Groq](https://img.shields.io/badge/LLM-Llama%203.3%2070B%20(Groq)-orange?style=flat-square)](https://groq.com/)
[![Puppeteer](https://img.shields.io/badge/PDF-Puppeteer%20(Headless)-green?style=flat-square)](https://pptr.dev/)
[![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL%2016-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)

EquiGen is an enterprise-grade AI engine that automates the generation of publication-ready, Geojit-style equity research reports. By combining local document extraction, Groq Llama 3.3, server-side SVG charting, and Puppeteer headless rendering, EquiGen translates raw financial structures into institutional A4 PDFs.

---

## 🚀 Key Features

*   **Multiformat Ingestion**: Instantly parse `.pdf`, `.csv`, and `.txt` files containing raw balance sheets, earnings call transcripts, or financial reports.
*   **Self-Correcting LLM Extraction**: Queries `llama-3.3-70b-versatile` over Groq with strict JSON schemas enforced via LangChain `.withStructuredOutput()`. If extracted financials fail mathematical validation (e.g. EBITDA > Revenue), a **self-correction retry loop** feeds the errors back to the model.
*   **Stateful Background Jobs**: Extraction runs as a background job stored in PostgreSQL (`ExtractionJob` table). The frontend polls `/api/extract/status`. If Groq rate-limits mid-job, the job saves its step checkpoint and auto-resumes from that exact point.
*   **Multi-Provider AI Support**: Switch between **Groq** (Llama 3.3 70B) and **OpenAI** (GPT-4o Mini) from the settings panel. BYOK (bring-your-own-key) keys are AES-256-GCM encrypted before being stored in the database.
*   **Print-Ready HTML & SVG Charts**: Dynamically constructs publication-grade layouts with SVG combo charts (bars and line charts) embedded directly in HTML and rendered via Puppeteer.
*   **AI Co-Pilot & Interactive Chat**: Multi-turn agentic chat session linked to the report where users can interactively ask questions, search original source pages, request recalculations, and approve/reject proposed corrections.
*   **State-Gated Corrections & Audit Logs**: Detailed append-only audit trail logging state transitions, sign-off events, and field corrections. Proposes corrections that can be approved/applied to automatically fork draft baselines, ensuring compliance.
*   **Fail-Safe Page Ingestion**: Scanned or image-heavy PDF pages fall back to either Groq Vision (`llama-3.2-11b-vision-preview`) for charts/graphics, or local Tesseract OCR for plain-text scans.
*   **SEBI RA Sign-off Flow**: Reviewers can enter their SEBI Research Analyst registration number to publish a report. Published reports get an attestation block embedded in the PDF.
*   **Report History**: All generated reports are persisted to PostgreSQL with full search and restore support, with localStorage as an offline fallback.

---

## 🛠️ Architecture & Core Pipeline

```mermaid
graph TD
    A[Raw Financial File] -->|Ingest & Parse| B(Parser Coordinator)
    B -->|pdf-extractor / papaparse / txt| C[Unified Text Extract]
    C -->|POST /api/extract| D[ExtractionJob created in DB]
    D -->|Background Worker| E[LangGraph Research Pipeline]

    subgraph LangGraph Research Pipeline - Sequential
      E --> F[Step 0: Map-Reduce Chunker]
      F -->|Condensed Context| G[Step 1: extract_general]
      G --> H[Step 2: extract_swot]
      H --> I[Step 3: extract_financials]
      I --> J[Math Auditor Node]
      J -->|Validation Failed + retry < 2| I
      J -->|Passed / Max Retries| K[Save to ReportHistory DB]
    end

    K --> L[Poll /api/extract/status]
    L -->|completed| M[Fetch ReportHistory from DB]
    M --> N(Report Presentation Mapper)
    N -->|Generate HTML + SVGs| O[Puppeteer headless browser]
    O -->|Render to PDF| P[A4 PDF Buffer]
    P -->|base64 in DB| Q[GET /api/download or inline preview]
```

### 📄 Fallback-First Page Ingestion Pipeline

To handle mixed digital and scanned prospectuses, the PDF extractor uses a stateful, page-by-page pipeline:

1. **Native Ingestion (Fast & Free)**: Extracts text natively from each PDF page using `unpdf`.
2. **Threshold Criteria**: If a page yields **fewer than 100 characters**, the pipeline flags the page for image rendering.
3. **High-DPI Page Rendering**: Renders the target page to a PNG data URL using `@napi-rs/canvas`.
4. **Visual Inspection**: Scans the page for embedded graphics using `unpdf.extractImages`.
   - **Groq Vision Fallback**: If non-trivial graphics (width > 120px, height > 120px) are found, invokes `llama-3.2-11b-vision-preview` to interpret charts and tables visually.
   - **Tesseract OCR Fallback**: If no graphics are found, runs local `tesseract.js` OCR for scanned text at zero API cost.

---

## 🤖 AI Orchestration (LangChain & LangGraph)

### 🔌 The Role of LangChain
*   **Unified Model Switcher**: Provides a uniform interface over **Groq** (Llama 3.3 70B) and **OpenAI** (GPT-4o Mini) providers.
*   **Dynamic API Keys**: Users can input their own custom API keys in the settings panel. Keys are encrypted AES-256-GCM and stored in the database — they are NOT stored in plaintext anywhere server-side.
*   **Native Schema Enforcement**: Uses LangChain's `.withStructuredOutput(...)` API to enforce strict Zod schemas at the model-provider call level.

### 🕸️ The Role of LangGraph

LangGraph orchestrates a **sequential, stateful multi-step** research workflow with intermediate checkpointing to the database:

1. **Step 0 — Map-Reduce Preprocessor**: If raw text exceeds 25,000 characters, the document is split into overlapping chunks (12,000 chars with 1,200-char overlap). Each chunk is processed by `llama-3.1-8b-instant` (500K TPM) to extract localized SWOT signals and financials. The results are merged into a high-density condensed context, reducing prompt sizes by ~90%.
2. **Step 1 — General Details Extraction**: `extract_general` extracts company name, ticker, industry overview, and business overview.
3. **Step 2 — SWOT & Thesis Extraction**: `extract_swot` extracts highlights, risks, investment thesis, and future growth drivers.
4. **Step 3 — Financials Extraction + Math Audit**: `extract_financials` extracts Revenue, EBITDA, PAT series plus current/target price and recommendation. A math auditor then validates (EBITDA ≤ Revenue, PAT ≤ EBITDA) and triggers a retry loop (max 1 retry) if inconsistencies are found.

Each step saves its output to the `ExtractionJob` record so that if a rate-limit interrupts mid-pipeline, the job can resume from the failed step instead of restarting from scratch.

### ⚖️ Model Router & Rate Limiter

*   **`model-router.ts`**: Before each extraction call, estimates the token size of the prompt. If it exceeds the primary model's TPM ceiling, automatically reroutes to `llama-3.1-8b-instant`. Otherwise, waits for real budget headroom using the `TokenBudgetManager`.
*   **`TokenBudgetManager`**: Tracks actual token usage per model in a sliding 60-second window, preventing rate-limit collisions.
*   **`retry-wrapper.ts`**: On genuine 429 errors, parses Groq's `"try again in Xs"` hint and waits exactly that long before retrying once. If still rate-limited, throws a typed `RateLimitError` to signal `throttled` status in the DB.

---

## ⚡ Setup & Installation

### Prerequisites

- **Node.js 20+** and **pnpm** installed globally
- **PostgreSQL** running locally or via Docker (see Docker section below)
- A **Groq API key** from [console.groq.com](https://console.groq.com)

```bash
npm install -g pnpm
```

### Installation

1. **Clone the workspace and install packages**:
   ```bash
   pnpm install
   ```

2. **Rebuild native packages** (canvas for PDF page rendering):
   ```bash
   pnpm rebuild @napi-rs/canvas
   ```

3. **Setup environment variables**:
   ```bash
   cp .env.example .env
   ```
   Fill in your `.env`:
   ```env
   GROQ_API_KEY=gsk_YOUR_KEY_HERE
   DATABASE_URL=postgresql://postgres:password@localhost:5432/equigen
   ENCRYPTION_KEY=<exactly-32-chars-random-secret>
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
   > ⚠️ `ENCRYPTION_KEY` is required to encrypt BYOK API keys in the database. Generate a random 32-character string (e.g., `openssl rand -hex 16`).

4. **Run database migrations**:
   ```bash
   pnpm exec prisma migrate dev
   ```
   > Or if using Docker DB (see below), start the DB first, then run migrations.

5. **(Optional) Download Tesseract OCR language data**:
   Only required if you process scanned/image-heavy PDFs. Place in the project root:
   ```bash
   # PowerShell
   Invoke-WebRequest https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata -OutFile eng.traineddata

   # curl
   curl -L https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata -o eng.traineddata
   ```
   > Skip this if you only process digital (text-based) PDFs.

---

## 💻 Developer Workflow

### Start the database (Docker)
```bash
docker compose up db
```

### Run local development server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) to view the interactive dashboard.

### Type-check
```bash
npx tsc --noEmit
```

### Lint
```bash
pnpm lint
```

---

## 🐳 Docker Deployment

EquiGen includes a multi-stage `Dockerfile` (based on `node:20-bullseye-slim`) and a `docker-compose.yml` that bundles the app with PostgreSQL.

> ⚠️ **Note**: The PDF engine uses Puppeteer (headless browser) — chromium execution dependencies are required in the deployment environment.

### Using Docker Compose

1. **Set environment variables** in `.env` (copy from `.env.example`).

2. **Build and start all services**:
   ```bash
   docker-compose up --build
   ```

3. **Run migrations** after the DB is up:
   ```bash
   docker-compose exec app pnpm exec prisma migrate deploy
   ```

4. The application will be live at [http://localhost:3000](http://localhost:3000).

### Persistent Volumes

Docker Compose mounts two volumes:
- `postgres_data` → PostgreSQL data directory (reports, settings, history)
- `reports_data` → `/app/public/temp` — generated PDF artifacts

---

## 🔐 Security Notes

- **API Keys**: User-supplied API keys (BYOK) are encrypted with AES-256-GCM using the server-side `ENCRYPTION_KEY` before being written to the database. Keys are never logged or returned to clients.
- **`ENCRYPTION_KEY`**: Must be set in production. If omitted, the application will fall back to an insecure hardcoded key (this is a known issue — see below).
- **Authentication**: There is currently **no authentication layer** on the API routes. It is strongly recommended to deploy EquiGen behind a VPN, reverse proxy with IP allowlist, or add Next.js Auth before exposing to the internet.

---

## 📄 License

Proprietary. Developed for EquiGen research systems. All rights reserved.
