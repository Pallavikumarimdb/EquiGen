# Bull AI Equity Research Report Generator

A production-quality full-stack Next.js 15 (App Router) application designed to extract financial information using Groq (Llama 3.3 70B) and generate downloadable Geojit-style equity research reports as PDFs.

## Architecture & Project Structure

The project implements a clean architecture and a modular folder structure to separate concerns between parser logic, AI extraction, PDF rendering templates, validation schemas, and Next.js routing endpoints.

```
src/
  app/                  # Next.js App Router (Layouts, Pages, and Route Handlers)
    api/
      report/
        generate/       # Route handler for file parsing & AI extraction
        download/       # Route handler for PDF report rendering
  components/           # Reusable UI React components (shadcn/ui layout)
  hooks/                # Custom React hooks managing states and API calls
  types/                # Core TypeScript interfaces defining domain models
  lib/                  # Core services, parsers, and utilities
    ai/                 # Groq client connection, prompt templates, & extraction helper
    extractors/         # High-level business logic orchestrating extraction
    parsers/            # File parser handlers for PDF, CSV, and TXT files
    report/             # Post-processing calculations, ratio computations, etc.
    charts/             # Formatting and QuickChart helper links for PDF embedding
    pdf/                # PDF Generation Engine (using pdfkit or react-pdf)
    templates/          # Geojit-style brand themes, colors, and layout tokens
    validation/         # Zod schema definitions for API inputs and LLM outputs
    utils/              # Utility helpers (Tailwind class merges, currency formatters)
```

## Getting Started

### Prerequisites

Make sure you have **pnpm** installed globally:

```bash
npm install -g pnpm
```

### Installation

1. Clone the repository and install dependencies:
   ```bash
   pnpm install
   ```

2. Copy the environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Provide your `GROQ_API_KEY` in `.env.local`.

### Running Locally

Run the Next.js development server:
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Key Design Principles
- **Clean Architecture**: Domain model types are isolated from specific parser or AI implementations.
- **Robust Schema Validation**: Every API request and AI JSON payload is validated using Zod.
- **Geojit-Style Reports**: Brand design system tokens (primary dark blues/golds, professional metrics) are modularized under `src/lib/templates`.
