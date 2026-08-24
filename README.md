# ⚡ EquiGen — AI-Powered Equity Research Engine

[![Next.js](https://img.shields.io/badge/Next.js-15.1.11-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Groq](https://img.shields.io/badge/LLM-GPT%20OSS%20120B%20(Groq)-orange?style=flat-square)](https://groq.com/)
[![Puppeteer](https://img.shields.io/badge/PDF-Puppeteer%20(Headless)-green?style=flat-square)](https://pptr.dev/)
[![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL%2016-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)

EquiGen is an enterprise-grade AI engine that automates the generation of publication-ready, Geojit-style equity research reports. By combining local document extraction, Groq GPT OSS 120B / Qwen 3.6, server-side SVG charting, and Puppeteer headless rendering, EquiGen translates raw financial structures into institutional A4 PDFs.

---

## 🚀 Key Features

*   **Multiformat Ingestion**: Instantly parse `.pdf` and `.txt` files containing raw balance sheets, earnings call transcripts, or financial reports (with experimental `.csv` support built-in).
*   **Self-Correcting LLM Extraction**: Queries `openai/gpt-oss-120b` over Groq with strict JSON schemas enforced via LangChain `.withStructuredOutput()`. If extracted financials fail mathematical validation (e.g. EBITDA > Revenue), a **self-correction retry loop** feeds the errors back to the model.
*   **Stateful Background Jobs**: Extraction runs as a background job stored in PostgreSQL (`ExtractionJob` table). The frontend polls `/api/extract/status`. If Groq rate-limits mid-job, the job saves its step checkpoint and auto-resumes from that exact point.
*   **Multi-Provider AI Support**: Switch between **Groq** (GPT OSS 120B) and **OpenAI** (GPT-4o Mini) from the settings panel. BYOK (bring-your-own-key) keys are AES-256-GCM encrypted before being stored in the database.
*   **Print-Ready HTML & SVG Charts**: Dynamically constructs publication-grade layouts with SVG combo charts (bars and line charts) embedded directly in HTML and rendered via Puppeteer.
*   **AI Co-Pilot & Interactive Chat**: Multi-turn agentic chat session linked to the report where users can interactively ask questions, search original source pages, request recalculations, and approve/reject proposed corrections.
*   **State-Gated Corrections & Audit Logs**: Detailed append-only audit trail logging state transitions, sign-off events, and field corrections. Proposes corrections that can be approved/applied to automatically fork draft baselines, ensuring compliance.
*   **Fail-Safe Page Ingestion**: Scanned or image-heavy PDF pages fall back to either Groq Vision (`llama-3.2-11b-vision-preview`) for charts/graphics, or local Tesseract OCR for plain-text scans.
*   **SEBI RA Sign-off Flow**: Reviewers can enter their SEBI Research Analyst registration number to publish a report. Published reports get an attestation block embedded in the PDF.
*   **Report History**: All generated reports are persisted to PostgreSQL with full search and restore support, with localStorage as an offline fallback.

---

## 🏗️ Architecture & Core Pipeline

For full details on the system architecture, Map-Reduce chunking pipeline, visual-first page extraction fallbacks, and the LangGraph orchestrator, please refer to:
👉 **[Architecture.md](file:///d:/13.my-startups/EquiGen/Architecture.md)**

---

## ⚡ Setup & Installation

### Prerequisites

*   **Node.js 20+** and **pnpm** (version 9 or 10) installed globally.
*   **PostgreSQL** (version 15 or 16) running locally or via Docker.
*   A **Groq API key** from [console.groq.com](https://console.groq.com) (for GPT OSS / Qwen extraction) or an **OpenAI API key** (for GPT fallback).
*   **OpenRouter API key** (optional, for free fallback model routing).

```bash
npm install -g pnpm
```

### Installation

1. **Clone the repository and install dependencies**:
   ```bash
   pnpm install
   ```

2. **Rebuild native packages**:
   Some PDF canvas rendering libraries require local node-gyp rebuilding:
   ```bash
   pnpm rebuild @napi-rs/canvas
   ```

3. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and fill in the required variables:
   ```env
   GROQ_API_KEY=gsk_YOUR_KEY_HERE
   DATABASE_URL="postgresql://postgres:password@localhost:5432/equigen?sslmode=disable"
   ENCRYPTION_KEY="exactly-32-chars-random-secret"
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   ```
   *Note: `ENCRYPTION_KEY` must be exactly 32 characters long. It is used to securely encrypt Bring-Your-Own-Key values in the database via AES-256-GCM.*

4. **Initialize the Database**:
   Generate the Prisma client and push the schema to the database:
   ```bash
   pnpm exec prisma generate
   pnpm exec prisma migrate dev
   ```

5. **Download OCR Tessdata (Optional)**:
   If parsing scanned PDFs, download the English OCR training data into the root directory:
   ```bash
   # curl
   curl -L https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata -o eng.traineddata
   ```

---

## 💻 Developer Workflow & Local Development

This section outlines standard developer workflows for developing, running, database management, and testing the EquiGen workspace.

### 1. Database Operations & Management
If you do not have a PostgreSQL server running natively, spin one up via Docker:
```bash
docker compose up -d db
```

#### Handy DB Commands:
*   **Open Prisma Studio**: Inspect and modify database records (jobs, histories, keys) via a GUI:
    ```bash
    pnpm exec prisma studio
    ```
*   **Sync Database Schema**: If you modify `schema.prisma`, sync the changes directly without creating a migration:
    ```bash
    pnpm exec prisma db push
    ```
*   **Reset the Database**: Wipe all tables, run migrations, and start fresh:
    ```bash
    pnpm exec prisma migrate reset
    ```

### 2. Running the Local Server
Start the Next.js development server:
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application. The dev server features Hot Module Replacement (HMR) and prints detailed rate-limiting and model-routing telemetry directly to the console.

---

## 📄 License

Proprietary. Developed for EquiGen research systems. All rights reserved.
