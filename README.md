# NexusGraph — OSINT Investigation Graph & Footprint Correlation Platform

> **NexusGraph** is a lightweight, web-based OSINT investigation and public digital-footprint correlation platform designed for security researchers, SOC analysts, fraud investigators, and defensive cybersecurity practitioners.

---

## 1. Project Overview

NexusGraph converts fragmented public digital traces into an interactive, explainable relationship graph. It collects public indicators, normalizes artifacts into canonical entities, correlates connections with heuristic confidence scoring, attaches provenance-backed evidence, and generates exportable investigation dossiers.

```text
Seed (Domain / IP / Email / Username / URL)
  ↓
Allowed OSINT Collectors (DNS / URL / TLS / GitHub / Username)
  ↓
Validation & SSRF Filter
  ↓
Canonical Normalization
  ↓
Correlation Engine (Heuristic Scoring & Explainability)
  ↓
Interactive Investigation Graph (React Flow)
  ↓
Detail Panel & Evidence Provenance / Timeline / Analyst Notes / Export
```

---

## 2. Features

- **Investigation Case Management**: Create, edit, archive, tag, and manage prioritized security dossiers with strict user isolation (PostgreSQL RLS).
- **Interactive Graph Workspace**: React Flow (`@xyflow/react`) canvas with custom entity nodes, relationship edges, zoom/pan, minimap, and three layout algorithms (Force-directed, Hierarchical, Radial).
- **5 Modular OSINT Collectors**:
  - **DNS Collector**: Public A, AAAA, MX, NS, CNAME, TXT resolution using DNS-over-HTTPS (DoH).
  - **URL Metadata Collector**: Status code, title, security headers, redirects with full SSRF defense.
  - **TLS Certificate Collector**: Certificate Transparency (crt.sh) log analysis, SAN discovery, and issuer mapping.
  - **GitHub Public Collector**: Public repositories, languages, org links, and profile metadata.
  - **Username Presence Collector**: Checks handle presence across an allowlist of platforms using non-intrusive HEAD requests.
- **SSRF Defense-in-Depth**:
  - Validates URLs, restricts to HTTP/HTTPS.
  - Resolves DNS and blocks loopback (`127.0.0.0/8`), private IPv4 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), IPv6 link-local/ULA.
  - Blocks Cloud Metadata Endpoints (AWS IMDS `169.254.169.254`, ECS, Alibaba).
  - Validates every redirect hop and enforces byte size / timeout limits.
- **Correlation & Confidence Engine**: Heuristic scoring (0–100%) with documented reasons (e.g. *Exact email match*, *DNS resolution*, *Shared TLS certificate*).
- **Provenance & Evidence Drawer**: Every edge and entity tracks source URLs, collection timestamps, extracted payloads, and collector metadata.
- **Investigation Timeline & Notes**: Chronological timeline of observations and Markdown-enabled analyst case notes.
- **Multi-Format Export**: Generate structured **Markdown Dossiers**, raw **JSON dumps**, or tabular **CSV spreadsheets** with one click.

---

## 3. Tech Stack

- **Monorepo**: `pnpm` workspaces
- **Frontend (`apps/web`)**:
  - React 19 + TypeScript + Vite
  - Tailwind CSS (Security workstation dark-first design system)
  - `@xyflow/react` (React Flow) for graph visualization
  - TanStack Query (React Query) for server state management
  - Zustand for client state (auth, filters, selections, toasts)
  - Lucide React for entity icons
- **Backend (`apps/api`)**:
  - Hono on Node.js (dev) and Cloudflare Workers (prod)
  - Zod for strict request/response schema validation
  - Structured JSON logging with request ID tracing
  - In-memory rate limiting (20 runs/hr per user)
- **Database & Auth**:
  - Supabase PostgreSQL with Row Level Security (RLS)
  - Supabase Auth (JWT session management)

---

## 4. Repository Structure

```text
nexusgraph/
├── apps/
│   ├── api/                 # Hono API backend (Cloudflare Workers compatible)
│   │   ├── src/
│   │   │   ├── collectors/  # DNS, URL, TLS, GitHub, Username collectors & pipeline
│   │   │   ├── correlation/ # Heuristic correlation rules & confidence scoring
│   │   │   ├── middleware/  # Auth, CORS, rate limiting, request ID, logging
│   │   │   ├── routes/      # Investigations, entities, relationships, evidence, export
│   │   │   ├── security/    # SSRF defense validator & safe fetch
│   │   │   └── services/    # Data persistence & ownership verification
│   │   └── wrangler.toml    # Cloudflare Workers configuration
│   └── web/                 # React + Vite frontend
│       ├── src/
│       │   ├── components/  # Graph canvas, entity nodes, detail panel, modals, UI
│       │   ├── lib/         # API client, Supabase client, graph layout algorithms
│       │   ├── pages/       # Login, Register, Dashboard, Cases, Detail Workspace
│       │   └── stores/      # Zustand auth & app stores
├── packages/
│   └── shared/              # Shared TypeScript types, Zod schemas, constants, normalizers
├── supabase/
│   └── migrations/          # 001_initial_schema.sql (PostgreSQL tables, indexes, RLS)
├── .env.example             # Environment variables template
├── package.json             # Root monorepo workspace configuration
└── pnpm-workspace.yaml
```

---

## 5. Getting Started & Local Setup

### Prerequisites

- **Node.js**: `>= 20.0.0`
- **pnpm**: `>= 9.0.0` (`npm install -g pnpm`)
- **Supabase Project**: Free tier at [supabase.com](https://supabase.com)

### 1. Clone & Install Dependencies

```bash
git clone <repo-url>
cd "OSINT Investigation Graph"
pnpm install
```

### 2. Configure Database & Migrations

1. Go to your Supabase project dashboard.
2. Open the **SQL Editor**.
3. Copy and run the contents of [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql).
   - This creates all tables (`investigations`, `entities`, `relationships`, `evidence`, `timeline_events`, `notes`, `collector_runs`, `profiles`), indexes, and Row Level Security (RLS) policies.

### 3. Setup Environment Variables

Copy `.env.example` to `.env` in the root directory:

```bash
cp .env.example .env
```

Fill in your Supabase credentials:

```ini
# Supabase Frontend (Anon Key)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...

# Supabase Backend (Service Role Key)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Optional GitHub Token (increases rate limit from 60 to 5000 req/hr)
GITHUB_TOKEN=

# API Base URL
API_BASE_URL=http://localhost:8787
VITE_API_BASE_URL=http://localhost:8787
```

### 4. Run Development Servers

Run both frontend (`apps/web` on port 5173) and backend (`apps/api` on port 8787):

```bash
pnpm dev
```

Or run individually:

```bash
# Frontend only (http://localhost:5173)
pnpm dev:web

# API only (http://localhost:8787)
pnpm dev:api
```

---

## 6. Running Tests & Quality Verification

```bash
# Run unit & security tests (SSRF, Normalizers, Correlation)
pnpm --filter @nexusgraph/api test:unit

# Typecheck across all workspace packages
pnpm -r typecheck

# Build production bundles for frontend and API
pnpm -r build
```

---

## 7. Deployment

### Frontend (Cloudflare Pages / Vercel)

Build the static distribution:

```bash
pnpm --filter @nexusgraph/web build
```

Deploy the `apps/web/dist` directory to Cloudflare Pages.

Set environment variables in Cloudflare Pages dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`

### Backend (Cloudflare Workers)

Deploy the API using Wrangler:

```bash
cd apps/api
npx wrangler deploy
```

Set secret environment variables:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put GITHUB_TOKEN
```

---

## 8. Responsible OSINT Boundary

NexusGraph is intentionally engineered strictly for **defensive cybersecurity, lawful research, threat intelligence, and self-footprint auditing**:
- ❌ **No credential stuffing or password discovery**
- ❌ **No private account bypass or unauthorized access**
- ❌ **No invasive geolocation tracking or physical surveillance**
- ❌ **No third-party target vulnerability exploitation**
- ❌ **No unauthenticated identity claims** (inferred relationships are labeled as *Likely related* or *Possible match* with explainable heuristic confidence scores).

---

## 9. License

MIT License.
