# --- STAGE 1: Dependency Installer ---
FROM node:20-bullseye-slim AS deps
WORKDIR /app

# Install system dependencies needed for node-canvas compilation if rebuilding from source
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Copy package structures
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

# --- STAGE 2: Builder ---
FROM node:20-bullseye-slim AS builder
WORKDIR /app
RUN npm install -g pnpm

# Copy node modules and project files
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# --- STAGE 3: Production Runner ---
# Use the official Microsoft Playwright image as base to get pre-installed browser binaries
FROM mcr.microsoft.com/playwright:v1.45.0-jammy AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy build artifacts and config files
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

# Ensure correct permissions for temporary folders
RUN mkdir -p public/temp/charts public/temp/reports && chmod -R 777 public/temp

# Next.js App Router listens on port 3000
EXPOSE 3000

CMD ["node", "node_modules/next/dist/bin/next", "start"]
