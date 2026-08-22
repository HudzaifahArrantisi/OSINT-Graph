# MASTER PROMPT - Build OSINT Investigation Graph From Zero

Kamu adalah senior full-stack engineer, software architect, UI engineer, dan application security engineer.
Tugasmu adalah membangun proyek **OSINT Investigation Graph / NexusGraph** dari **0 sampai MVP yang selesai, dapat dijalankan, diuji, dan dideploy**.

Jangan hanya membuat skeleton atau contoh kode. Implementasikan proyek nyata secara bertahap sampai seluruh fitur MVP yang masuk scope benar-benar bekerja.

---

## 0. ATURAN UTAMA

Sebelum menulis kode apa pun, WAJIB membaca tiga dokumen berikut yang berada di root repository:

1. `PRD.md`
2. `designSystem.md`
3. `ARCHITECTURE.md`

Anggap tiga file tersebut sebagai source of truth utama.

Urutan prioritas ketika ada konflik:

1. Security dan correctness
2. `PRD.md`
3. `ARCHITECTURE.md`
4. `designSystem.md`
5. Preferensi implementasi teknis terbaik yang masih sesuai scope

Jangan mengabaikan requirement hanya karena implementasinya sedikit lebih sulit.

Jangan meminta saya mengonfirmasi setiap keputusan teknis kecil. Ambil keputusan yang masuk akal, dokumentasikan asumsi, lalu lanjutkan implementasi.

Jangan berhenti setelah membuat frontend saja.
Jangan berhenti setelah membuat schema database saja.
Jangan berhenti setelah membuat API saja.
Jangan berhenti pada mock data jika fitur tersebut seharusnya dapat bekerja dengan data nyata.

Tujuan akhir:

> Repository siap dijalankan oleh developer lain dengan setup yang jelas, database siap, authentication siap, frontend siap, API siap, collector MVP siap, graph bekerja, evidence bekerja, correlation bekerja, export bekerja, testing tersedia, security hardening diterapkan, dan deployment terdokumentasi.

---

# 1. PRODUK

Nama kerja: **NexusGraph**

Produk:

> Lightweight web-based OSINT investigation and public digital-footprint correlation platform.

Konsep inti:

```text
Seed
  ↓
Collectors
  ↓
Normalization
  ↓
Entities
  ↓
Relationships
  ↓
Evidence
  ↓
Correlation Engine
  ↓
Confidence Score
  ↓
Investigation Graph
  ↓
Timeline / Notes / Report
```

Produk hanya boleh menggunakan:

- public information
- user-provided information
- sumber yang memang diizinkan secara hukum/licensing

Dilarang membangun fitur untuk:

- bypass authentication
- private account access
- credential stuffing
- unauthorized account access
- invasive private geolocation tracking
- exploitation terhadap target pihak ketiga
- stalking/harassment workflow

Gunakan bahasa UI seperti:

- `Likely related`
- `Possible relationship`
- `Observed evidence`
- `Analyst note`

Jangan mengklaim identitas seseorang sebagai fakta hanya berdasarkan korelasi lemah.

---

# 2. STACK FINAL

Gunakan stack ringan berikut untuk MVP.

## Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- `@xyflow/react`
- TanStack Query
- Zustand
- Lucide React
- Zod

## Backend

- Hono
- TypeScript
- Cloudflare Workers compatible

## Database / Auth

- Supabase PostgreSQL
- Supabase Auth

## Deployment

- Cloudflare Pages atau hosting Cloudflare yang sesuai untuk frontend
- Cloudflare Workers untuk API
- Supabase untuk database/auth

## Tidak wajib untuk MVP

- Neo4j
- Redis
- Kafka
- Kubernetes
- microservices
- Python worker cluster
- WebSocket
- Durable Objects

Semua komponen berat harus ditunda sampai benar-benar dibutuhkan.

---

# 3. TUJUAN ENGINEERING

Bangun aplikasi dengan prinsip:

- clean architecture secukupnya
- modular
- strongly typed
- secure by default
- observable
- testable
- easy to maintain
- easy to deploy

Jangan over-engineer.

Tidak perlu membuat 20 abstraction layer untuk CRUD sederhana.

Gunakan struktur yang mudah dipahami solo developer.

---

# 4. STRUKTUR REPOSITORY

Buat struktur monorepo ringan seperti:

```text
nexusgraph/
├─ apps/
│  ├─ web/
│  └─ api/
├─ packages/
│  ├─ shared/
│  ├─ config/
│  └─ validation/
├─ supabase/
│  ├─ migrations/
│  └─ seed/
├─ docs/
├─ scripts/
├─ .env.example
├─ package.json
├─ pnpm-workspace.yaml
├─ README.md
├─ PRD.md
├─ designSystem.md
├─ ARCHITECTURE.md
└─ MASTER_BUILD_PROMPT.md
```

Kalau repository sudah memiliki struktur berbeda, pertahankan bagian yang baik dan lakukan migrasi seminimal mungkin.

---

# 5. SEBELUM CODING

Lakukan analisis internal berdasarkan tiga dokumen.

Buat terlebih dahulu:

1. dependency decision
2. folder structure
3. database schema plan
4. API route plan
5. component plan
6. collector interface
7. testing strategy

Kemudian langsung implementasikan.

Jangan hanya menuliskan plan ke chat. Plan digunakan untuk mengarahkan pekerjaan.

---

# 6. PHASE 1 - PROJECT BOOTSTRAP

Implementasikan:

- pnpm workspace
- TypeScript config
- ESLint
- Prettier
- Vite React app
- Tailwind
- Hono API
- shared types
- environment validation
- basic logging
- error handling
- health endpoint

Endpoint pertama:

```text
GET /health
```

Response:

```json
{
  "status": "ok"
}
```

Pastikan:

```bash
pnpm install
pnpm dev
```

dapat menjalankan project tanpa error.

---

# 7. PHASE 2 - SUPABASE DATABASE

Implementasikan schema PostgreSQL berdasarkan PRD dan ARCHITECTURE.

Minimal table:

```text
profiles
investigations
entities
relationships
evidence
timeline_events
notes
collector_runs
```

Gunakan:

- UUID
- foreign keys
- created_at / updated_at
- indexes yang relevan
- JSONB untuk metadata yang memang dinamis

Implementasikan RLS untuk data user-owned.

User tidak boleh membaca atau mengubah case milik user lain.

Jangan mempercayai `ownerId`, `caseId`, atau `entityId` hanya karena dikirim frontend.

Server harus memvalidasi ownership.

---

# 8. PHASE 3 - AUTHENTICATION

Implementasikan Supabase Auth.

Minimal:

- login
- register
- logout
- session restore
- protected route
- current user

UI harus memiliki:

- login page
- register page
- loading state
- error state
- empty state

Jangan mengandalkan auth hanya di frontend.

API juga wajib memvalidasi session/token.

---

# 9. PHASE 4 - INVESTIGATION CASES

Implementasikan CRUD case:

```text
Create
Read
Update
Archive
Close
Delete where appropriate
```

Field:

```text
id
owner_id
title
description
status
priority
tags
created_at
updated_at
```

Status:

```text
DRAFT
ACTIVE
ARCHIVED
CLOSED
```

Buat halaman:

```text
/dashboard
/investigations
/investigations/:id
/investigations/new
```

---

# 10. PHASE 5 - SEED INPUT

Implementasikan seed creation.

Supported:

```text
USERNAME
EMAIL
DOMAIN
IP_ADDRESS
URL
ORGANIZATION
SOCIAL_PROFILE
```

Input harus:

- divalidasi
- dinormalisasi
- disimpan raw value-nya bila diperlukan sebagai evidence/input history
- diberi type

Gunakan Zod.

Contoh:

```text
Example.COM
```

harus memiliki normalized value yang konsisten untuk query.

Jangan menghapus raw input yang berguna untuk provenance.

---

# 11. PHASE 6 - ENTITY MODEL

Implementasikan entity CRUD/service.

Entity types:

```text
PERSON
USERNAME
EMAIL
DOMAIN
URL
IP_ADDRESS
ORGANIZATION
REPOSITORY
SOCIAL_PROFILE
TECHNOLOGY
CERTIFICATE
DOCUMENT
```

Entity minimal:

```text
id
case_id
type
value
normalized_value
title
metadata
confidence
first_seen
last_seen
created_at
updated_at
```

Buat service untuk:

- upsert entity
- deduplicate entity dalam case
- find entity by normalized value
- update confidence

---

# 12. PHASE 7 - RELATIONSHIP MODEL

Implementasikan:

```text
USES_USERNAME
OWNS_DOMAIN
RESOLVES_TO
LINKS_TO
MENTIONS
HOSTED_ON
USES_EMAIL
BELONGS_TO
RELATED_TO
SAME_AS
POSSIBLY_SAME_AS
OBSERVED_ON
```

Relationship:

```text
id
case_id
source_entity_id
target_entity_id
relationship_type
confidence
evidence_count
reason
created_at
```

Aturan penting:

> Relationship harus berasal dari evidence atau secara eksplisit diberi label analyst-created.

Jangan membuat relationship diam-diam.

---

# 13. PHASE 8 - EVIDENCE

Evidence adalah first-class object.

Implementasikan:

```text
id
case_id
entity_id nullable
relationship_id nullable
source_url
source_type
title
extracted_value
collector
collected_at
content_hash
notes
confidence
metadata
created_at
```

Setiap collector harus mengembalikan evidence.

UI harus dapat menampilkan:

- source URL
- source type
- collected time
- collector
- confidence
- extracted data
- analyst notes

Pisahkan dengan jelas:

```text
Observed Evidence
Analyst Interpretation
```

---

# 14. PHASE 9 - GRAPH ENGINE

Gunakan `@xyflow/react`.

Implementasikan graph page dengan:

- pan
- zoom
- drag
- select node
- select edge
- fit view
- reset view
- search
- filter
- highlight relationship/path
- hide selected node
- collapse neighborhood jika mudah diimplementasikan

Buat custom node berdasarkan type:

```text
Domain
Email
Username
IP
Repository
Certificate
Organization
Technology
etc.
```

Gunakan Lucide icons.

Node harus memiliki:

- label
- type
- confidence indicator
- selected state
- risk/evidence indicator jika relevan

Graph layout default harus tetap terbaca untuk 5-50 node.

Sediakan:

- force-like layout jika feasible
- hierarchical layout
- radial layout

Kalau library tambahan tidak diperlukan, gunakan utility layout sederhana.

Jangan menambahkan dependency hanya untuk kosmetik.

---

# 15. PHASE 10 - NODE DETAIL PANEL

Saat node dipilih, tampilkan side panel.

Section/tab:

```text
Overview
Relationships
Evidence
Timeline
Raw Data
```

Contoh:

```text
ENTITY
example.com

DOMAIN

Confidence
92%

First Seen
2026-08-01

Last Seen
2026-08-22

Relationships
12

Evidence
7
```

Semua data harus berasal dari API/database nyata.

---

# 16. PHASE 11 - COLLECTOR SYSTEM

Buat registry collector modular.

Interface:

```ts
export interface CollectorContext {
  caseId: string;
  signal: AbortSignal;
  requestId: string;
}

export interface Collector {
  name: string;
  supports(inputType: string): boolean;
  run(
    input: unknown,
    ctx: CollectorContext
  ): Promise<CollectorResult>;
}
```

Collector result:

```ts
interface CollectorResult {
  source: string;
  collectedAt: string;
  entities: EntityCandidate[];
  relationships: RelationshipCandidate[];
  evidence: EvidenceCandidate[];
  warnings?: string[];
}
```

Collector tidak boleh langsung mengubah graph/database secara bebas.

Pipeline wajib:

```text
Collector
 ↓
Validate
 ↓
Normalize
 ↓
Deduplicate
 ↓
Correlate
 ↓
Persist
 ↓
Graph refresh
```

---

# 17. MVP COLLECTORS

Buat collector berikut dalam urutan ini.

## Collector 1 - DNS

Input:

```text
example.com
```

Collect public DNS data yang wajar.

Bentuk hubungan contoh:

```text
DOMAIN
 ├── RESOLVES_TO → IP
 ├── OBSERVED_ON → nameserver
 └── OBSERVED_ON → mail server
```

Gunakan library/runtime API yang cocok dengan Cloudflare Workers.

Jika Node-specific DNS package tidak kompatibel dengan Workers, gunakan public-safe resolver/API atau abstraction yang bisa diganti.

Jangan mengorbankan portability hanya demi library kecil.

## Collector 2 - URL Metadata

Collect hanya metadata publik yang aman:

- status code
- final URL
- title
- content type
- redirects
- selected headers
- basic metadata

## Collector 3 - TLS Certificate

Collect public metadata:

- subject
- issuer
- validity
- SAN
- fingerprint jika tersedia

## Collector 4 - GitHub Public Metadata

Hanya public information.

Collect:

- repository
- public profile
- organization
- public repository metadata
- publicly visible links
- public commit metadata bila legal dan sesuai API

Jangan mengakses private repository.
Jangan mencari credential.
Jangan melakukan password attacks.

## Collector 5 - Username Presence

Gunakan provider allowlist kecil.

Untuk MVP tidak perlu puluhan website.

Simpan provider config agar mudah diperluas.

---

# 18. SSRF SECURITY

Ini wajib dikerjakan sebelum URL collector dianggap selesai.

Implementasikan defense-in-depth:

1. parse URL
2. only HTTP/HTTPS
3. normalize hostname
4. DNS resolve
5. reject localhost
6. reject private IP ranges
7. reject loopback
8. reject link-local
9. reject metadata service destinations
10. validate every redirect
11. enforce timeout
12. enforce response size limit
13. restrict content types where practical
14. abort oversized/infinite responses
15. log request id and collector metadata

Jangan gunakan naive string checks seperti:

```ts
url.includes('localhost')
```

Gunakan actual network destination validation.

Tambahkan unit tests untuk SSRF payload examples.

---

# 19. PHASE 12 - NORMALIZATION

Implementasikan normalizer terpisah untuk:

### Domain

Normalize:

- casing
- trailing dot bila relevan
- URL hostname extraction

### Email

Normalize:

- whitespace
- domain casing

### URL

Normalize:

- protocol casing
- hostname casing
- default ports
- trailing slash rules sesuai strategi canonicalization

### Username

Trim whitespace.
Preserve original display value.

Jangan kehilangan raw observed value.

---

# 20. PHASE 13 - CORRELATION ENGINE

Implementasikan explicit rules.

Contoh:

```text
Exact public email match
→ SAME_AS candidate
→ high confidence
```

```text
Exact username match
→ POSSIBLY_SAME_AS candidate
→ medium confidence
```

```text
Domain resolves to IP
→ RESOLVES_TO
→ very high confidence
```

```text
Website explicitly links repository
→ LINKS_TO
→ high confidence
```

```text
Same profile URL discovered from independent source
→ RELATED_TO / SAME_AS candidate
```

Semua relationship harus menyimpan:

```text
confidence
reason
evidence_count
```

---

# 21. CONFIDENCE ENGINE

Gunakan heuristic scoring yang mudah dijelaskan.

Kategori:

```text
90-100 Very High
75-89 High
50-74 Medium
25-49 Low
0-24 Very Low
```

Contoh faktor:

```text
Exact match                     +40
Direct public reference         +30
Multiple independent sources    +20
Temporal consistency            +10
Contradicting evidence          -30
Weak similarity                 -10
```

Pastikan total di-clamp 0-100.

Tampilkan reason di UI.

Jangan menjadikan score seolah-olah probabilitas ilmiah.

---

# 22. PHASE 14 - TIMELINE

Implementasikan timeline berdasarkan:

- evidence collected_at
- first_seen
- last_seen
- analyst-created event
- relationship observations

UI harus memungkinkan filter date range.

---

# 23. PHASE 15 - NOTES

Notes:

- case note
- entity note
- relationship note
- evidence note

Gunakan Markdown untuk rendering.

Simpan editor content dengan aman.

Sanitize output saat rendering Markdown.

---

# 24. PHASE 16 - SEARCH + FILTER

Global search:

- entity value
- normalized value
- evidence URL
- notes
- tags

Graph filter:

```text
Entity type
Relationship type
Confidence
Collector/source
Date range
```

Search tidak boleh hanya melakukan client-side filtering untuk dataset besar.

Untuk MVP, server-side filtering/search API sederhana sudah cukup.

---

# 25. PHASE 17 - EXPORT

Implementasikan:

```text
JSON
CSV
Markdown
```

Export harus berasal dari case tertentu.

Jangan export data milik case user lain.

Markdown report minimal memiliki:

```text
Case Summary
Seeds
Key Entities
Relationships
Confidence Summary
Evidence
Timeline
Analyst Notes
```

---

# 26. DESIGN SYSTEM IMPLEMENTATION

Baca `designSystem.md` dan ikuti secara konsisten.

UI harus terasa seperti:

- security investigation workspace
- professional
- dark-first
- data-dense tetapi tetap terbaca
- bukan cyberpunk berlebihan
- bukan dashboard template generik

Gunakan komponen konsisten untuk:

- Button
- Input
- Select
- Modal
- Drawer
- Badge
- Card
- Tooltip
- Tabs
- Table
- EmptyState
- LoadingState
- ErrorState
- GraphNode
- EvidenceCard
- ConfidenceBadge
- TimelineItem

Jangan memasukkan gradient neon, glow berlebihan, atau animasi yang mengganggu investigasi.

---

# 27. UX STATES

Semua fitur utama wajib memiliki:

- loading
- empty
- success
- error
- unauthorized
- not found

Contoh:

```text
No investigation yet.
Create your first case to begin collecting public evidence.
```

Jangan tampilkan blank screen jika data kosong.

---

# 28. API DESIGN

Buat API versioning sederhana:

```text
/api/v1
```

Minimal route groups:

```text
POST   /auth/session
GET    /me

GET    /investigations
POST   /investigations
GET    /investigations/:id
PATCH  /investigations/:id
DELETE /investigations/:id

GET    /investigations/:id/entities
POST   /investigations/:id/entities

GET    /investigations/:id/relationships
POST   /investigations/:id/relationships

GET    /investigations/:id/evidence
POST   /investigations/:id/evidence

GET    /investigations/:id/timeline
GET    /investigations/:id/graph

POST   /investigations/:id/collect
GET    /investigations/:id/collector-runs

GET    /investigations/:id/export/json
GET    /investigations/:id/export/csv
GET    /investigations/:id/export/markdown
```

Gunakan shared Zod schemas agar request/response konsisten.

Jangan expose raw database row secara langsung.

---

# 29. COLLECTOR JOB MODEL

MVP boleh synchronous untuk collector ringan.

Namun desain service harus siap dipindahkan ke async job.

Simpan:

```text
collector_runs
```

Field minimal:

```text
id
case_id
collector
status
started_at
finished_at
request_id
input_type
input_summary
result_count
warning_count
error_message
```

Status:

```text
QUEUED
RUNNING
COMPLETED
FAILED
CANCELLED
```

---

# 30. OBSERVABILITY

Tambahkan:

- request id
- structured logging
- collector run logging
- error logging
- duration logging

Jangan log:

- passwords
- auth tokens
- secret API keys
- full sensitive payloads

---

# 31. TESTING

Wajib membuat tests.

## Unit

- normalization
- validation
- confidence score
- correlation rules
- utility functions
- SSRF validation

## Integration

- auth + API
- case CRUD
- entity persistence
- relationship persistence
- collector pipeline
- evidence persistence
- graph payload

## Frontend

- login state
- case creation
- graph rendering
- node selection
- filters
- evidence panel
- export actions

## Security

Test minimal:

- unauthorized case access
- IDOR
- invalid UUID
- malformed URL
- SSRF payload
- oversized response handling
- redirect SSRF
- rate limit bypass attempts

Jalankan test setelah setiap major phase.

---

# 32. CODE QUALITY

Wajib:

- TypeScript strict mode
- no `any` kecuali benar-benar dibutuhkan dan diberi alasan
- reusable types
- meaningful naming
- error boundaries where useful
- no secrets committed
- `.env.example`
- comments hanya untuk logic yang tidak obvious

Jangan menulis komentar seperti:

```ts
// this adds two numbers
```

Dokumentasikan WHY, bukan WHAT.

---

# 33. README

Buat README yang benar-benar bisa digunakan developer lain.

Isi minimal:

```text
Project overview
Features
Architecture
Tech stack
Requirements
Environment variables
Supabase setup
Local development
Database migration
Running tests
Deployment
Security considerations
Collector limitations
Known limitations
Roadmap
```

Berikan command konkret.

Contoh:

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
```

---

# 34. ENVIRONMENT VARIABLES

Buat `.env.example` tanpa secret nyata.

Gunakan nama yang jelas, misalnya:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GITHUB_TOKEN=
```

Hanya secret server yang boleh digunakan di Worker/backend.

Jangan pernah mengirim service-role key ke browser.

---

# 35. DEPLOYMENT

Target deployment:

```text
Frontend → Cloudflare
API      → Cloudflare Workers
DB/Auth  → Supabase
```

Pastikan:

- production env documented
- CORS benar
- auth callback benar
- API URL configurable
- database migrations documented
- secrets tidak masuk source control

---

# 36. ACCEPTANCE CRITERIA

Proyek dianggap selesai ketika semua hal berikut terpenuhi.

### Boot

```text
pnpm install
pnpm dev
```

berhasil.

### Auth

User dapat:

- register
- login
- logout
- restore session

### Case

User dapat:

- create case
- edit case
- archive case
- delete/close sesuai policy

### Seed

User dapat memasukkan:

- domain
- URL
- username
- email
- IP

### Collector

Minimal 3 collector benar-benar bekerja:

- DNS
- URL metadata
- TLS certificate

GitHub + username collector juga diimplementasikan jika source/API tersedia secara stabil dan legal.

### Graph

Graph dapat:

- render node
- render edge
- pan
- zoom
- select
- filter
- search
- fit view

### Entity detail

Node selection menampilkan:

- overview
- relationships
- evidence
- timeline

### Correlation

Relationship mempunyai:

- confidence
- reason
- evidence count

### Evidence

Evidence menyimpan:

- source
- collected time
- collector
- extracted data

### Export

JSON, CSV, Markdown dapat dihasilkan.

### Security

- auth enforced
- ownership enforced
- SSRF defense active
- validation active
- rate limiting active
- secrets protected

### Quality

```text
lint passes
unit tests pass
integration tests pass
build passes
```

---

# 37. IMPLEMENTATION DISCIPLINE

Kerjakan dalam urutan berikut:

```text
READ DOCS
 ↓
BOOTSTRAP
 ↓
DATABASE
 ↓
AUTH
 ↓
CASE
 ↓
ENTITY
 ↓
RELATIONSHIP
 ↓
EVIDENCE
 ↓
GRAPH
 ↓
COLLECTORS
 ↓
NORMALIZATION
 ↓
CORRELATION
 ↓
TIMELINE
 ↓
NOTES
 ↓
SEARCH/FILTER
 ↓
EXPORT
 ↓
SECURITY HARDENING
 ↓
TESTING
 ↓
README
 ↓
BUILD
 ↓
FINAL VERIFICATION
```

Setelah setiap phase:

1. cek TypeScript
2. cek lint
3. jalankan test terkait
4. perbaiki error
5. baru lanjut

Jika ada dependency atau API yang ternyata tidak kompatibel dengan environment, pilih alternatif yang paling ringan dan update dokumentasi.

---

# 38. JANGAN MELAKUKAN INI

Jangan:

- membuat mock dashboard yang tidak terhubung database
- membuat graph statis dengan data hardcoded sebagai hasil akhir
- menambahkan AI chatbot hanya untuk terlihat AI
- memasang Neo4j sejak awal tanpa kebutuhan
- membuat microservices untuk collector sederhana
- melakukan scraping agresif
- menambahkan collector yang melanggar Terms of Service
- menyimpan secret di frontend
- mempercayai authorization dari client
- menganggap similarity sebagai identitas pasti
- membuat fitur private account discovery
- membuat fitur exploitation

---

# 39. UX FINAL YANG DIHARAPKAN

Alur utama user:

```text
Login
 ↓
Dashboard
 ↓
New Investigation
 ↓
Masukkan seed
 ↓
Pilih collectors
 ↓
Run Investigation
 ↓
Progress collector
 ↓
Graph muncul
 ↓
Klik entity
 ↓
Evidence panel
 ↓
Review relationship confidence
 ↓
Timeline
 ↓
Export report
```

User harus dapat memahami:

- data ini berasal dari mana
- kapan dikumpulkan
- kenapa dua entity dianggap berhubungan
- seberapa kuat hubungan tersebut

---

# 40. OUTPUT AKHIR YANG WAJIB DIBERIKAN AGENT

Ketika implementasi selesai, berikan ringkasan final:

```text
IMPLEMENTATION COMPLETE

Implemented:
- ...
- ...

Collectors:
- ...

Security:
- ...

Tests:
- ...

Build:
- ...

Deployment:
- ...

Known limitations:
- ...

Next recommended improvements:
- ...
```

Tetapi jangan mengklaim sesuatu selesai jika belum benar-benar dijalankan/verifikasi.

Jika ada bagian yang gagal karena external API credentials belum tersedia, implementasikan abstraction + graceful error state + mock/test adapter, dokumentasikan kebutuhan credential, dan lanjutkan bagian lainnya.

---

# 41. PERINTAH EKSEKUSI

Sekarang:

1. Baca `PRD.md`.
2. Baca `designSystem.md`.
3. Baca `ARCHITECTURE.md`.
4. Inspect repository saat ini.
5. Tentukan apakah repository kosong atau sudah memiliki kode.
6. Jangan menghapus pekerjaan yang valid.
7. Implementasikan seluruh MVP dari 0 sampai selesai.
8. Buat file dan folder yang dibutuhkan.
9. Install dependencies yang diperlukan.
10. Buat migration/database schema.
11. Implementasikan backend.
12. Implementasikan frontend.
13. Implementasikan collector pipeline.
14. Implementasikan graph.
15. Implementasikan evidence/correlation/timeline/export.
16. Terapkan security hardening.
17. Jalankan lint.
18. Jalankan unit tests.
19. Jalankan integration tests.
20. Jalankan production build.
21. Perbaiki error sampai build/test/lint clean.
22. Update README.
23. Pastikan `.env.example` tersedia.
24. Pastikan tidak ada secret di repository.
25. Tampilkan ringkasan implementasi yang benar-benar sudah diverifikasi.

**Jangan berhenti setelah planning. Eksekusi seluruh pekerjaan sampai batas MVP yang didefinisikan tiga dokumen sumber.**

Jika menemukan keputusan teknis yang tidak ditentukan, pilih opsi yang paling ringan, aman, maintainable, dan kompatibel dengan React + TypeScript + Hono + Cloudflare + Supabase.
