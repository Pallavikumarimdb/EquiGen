# Bull AI Equity Research Report Generator

A production-quality full-stack Next.js 15 (App Router) application designed to parse financial files (PDF, CSV, TXT), extract key metrics using Groq (Llama 3.3 70B), render high-DPI charts, and compile downloadable Geojit-style equity research reports as PDFs.

## Architecture & Project Structure

The project implements a clean architecture and a modular folder structure separating concerns between raw parser handlers, AI structured parsing, rendering templates, validation schemas, and Next.js Route Handlers.

```
src/
  app/                  # Next.js App Router Pages, Layouts, and API Route Handlers
    api/
      upload/           # POST /api/upload - Accepts files, parses raw structure
      extract/          # POST /api/extract - Submits raw text to Llama 3.3
      report/           # POST /api/report - Generates charts and compiles PDF
      download/         # GET /api/download - Streams the compiled A4 PDF file
  components/           # Reusable UI React components (Dashboard, buttons, loaders)
  hooks/                # Custom React hooks managing states and API calls
  types/                # Core TypeScript interfaces defining domain models
  lib/                  # Core services, parsers, and utilities
    ai/                 # Groq client configuration, system prompts, self-correction
    extractors/         # High-level business logic orchestrating extraction
    parsers/            # Raw text extractors for PDF (pdf-parse), CSV, and TXT files
    report/             # Valuation calculations, metric presentation mapping
    charts/             # High-DPI vertical bar and EBITDA Margin line chart generators
    pdf/                # PDF Generation Engine using Playwright chromium printing
    templates/          # Geojit-style HTML/CSS A4 page templates
    validation/         # Zod schemas validating API payloads and AI responses
    utils/              # Tailwind class merges and string helpers
```

## Getting Started

### Prerequisites

Make sure you have **pnpm** installed globally:

```bash
npm install -g pnpm
```

### Installation

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Copy the environment template:
   ```bash
   cp .env.example .env.local
   ```
   Insert your `GROQ_API_KEY` inside `.env.local`.

3. Install Playwright browser dependencies:
   ```bash
   npx playwright install chromium
   ```

### Running Locally

Run the Next.js development server:
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

---

## Running with Docker

This application includes a multi-stage production Dockerfile utilizing the Microsoft Playwright Jammy base image, which comes precompiled with native canvas libraries and headless chromium binaries.

### Using Docker Compose

1. Build and launch the container:
   ```bash
   docker-compose up --build
   ```

2. The application will be live at [http://localhost:3000](http://localhost:3000).

---

## Key Design & Reliability Features

- **Self-Correcting LLM Parser**: Groq response validation retries up to 3 times, passing parsing/schema Zod error messages back to the model to correct outputs automatically.
- **Fail-Safe Charting**: If the native `canvas` dependencies fail, the compiler falls back to a text-only PDF layout without crashing.
- **Header & Footer Pagination**: Playwright injects professional running headers and footer page indicators (`Page X of Y`).
- **Empty State & Timeout Guard**: All network fetches, Chromium page renders, and API completion streams are guarded with strict timeouts (15s - 25s) to prevent thread blockages.
