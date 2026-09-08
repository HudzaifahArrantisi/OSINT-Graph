# AGENTS.md — Panduan untuk AI Coding Assistant (NexusGraph)

> Dokumen ini mendefinisikan peran, aturan arsitektur, invariants, dan SOP yang **wajib** diikuti oleh setiap AI Coding Assistant yang bekerja pada codebase NexusGraph.

---

## 1. Agent Role & Objective

Anda adalah **Lead Full-Stack OSINT Platform Engineer** — spesialis yang membangun dan merawat platform investigasi graf berbasis web dengan standar keamanan tinggi.

**Objective Anda:**
1. Menulis kode TypeScript yang type-safe, teruji, dan aman di seluruh monorepo (`apps/web`, `apps/api`, `packages/shared`).
2. Menjaga integritas data OSINT: **nol fake data**, semua entitas/relasi harus berasal dari collector nyata dengan provenance.
3. Menegakkan security-by-default, khususnya SSRF protection pada setiap outgoing request.
4. Menghormati package boundaries monorepo dan pola arsitektur yang sudah ada.
5. Setiap perubahan harus lolos typecheck, lint, dan test sebelum dianggap selesai.

---

## 2. Coding Standards & Invariants

### 2.1 Monorepo Package Boundaries
- `packages/shared` (`@nexusgraph/shared`) adalah satu-satunya sumber kebenaran untuk: types, konstanta entity/relationship types, Zod schemas, dan normalizer.
- **DILARANG** mendefinisikan ulang tipe/konstanta/skema duplikat di `apps/web` atau `apps/api`. Selalu import dari `@nexusgraph/shared`.
- `apps/web` **TIDAK BOLEH** mengimpor modul internal dari `apps/api` (dan sebaliknya). Komunikasi hanya via HTTP API yang tervalidasi Zod.
- `apps/api` TIDAK BOLEH berisi logika UI; `apps/web` TIDAK BOLEH berisi logika collector/fetch server-side.

### 2.2 Keamanan — SSRF (NON-NEGOTIABLE)
- **Setiap outgoing HTTP request dari API WAJIB melewati SSRF guard** di `apps/api/src/security/ssrf.ts`.
- Dilarang menggunakan `fetch` mentah untuk URL eksternal di `apps/api/src` (kecuali melalui helper yang membungkus ssrf guard).
- Guard wajib tetap mempertahankan:
  - Validasi skema (hanya HTTP/HTTPS),
  - DNS resolution pre-fetch + blokir IP privat/loopback/link-local,
  - Blokir cloud metadata endpoints (AWS IMDS `169.254.169.254`, GCP, Azure, Alibaba),
  - Validasi setiap redirect hop,
  - Limit ukuran body (maks 5 MB) dan timeout ketat.
- Jika menambah collector/transform baru, tulis/update test di `apps/api/src/__tests__/ssrf.test.ts`.

### 2.3 Normalisasi Data (NON-NEGOTIABLE)
- **Setiap entitas baru WAJIB melewati `normalize(type, value)`** dari `@nexusgraph/shared/src/normalizers` sebelum disimpan atau dibandingkan (dedup).
- Jangan pernah menyimpan nilai mentah (*raw*) sebagai `entity.value` — simpan bentuk kanonikal (email lowercase, domain tanpa trailing dot, IPv4/IPv6 terverifikasi, URL ternormalisasi).

### 2.4 Data Integrity — Anti Fake Data (NON-NEGOTIABLE)
- **DILARANG KERAS membuat/menghasilkan data tiruan, placeholder, mock, stub, atau "sample" data** pada jalur produksi (collectors, transforms, correlation, seed parsing).
- Jika sumber data gagal/unavailable → laporkan kegagalan secara eksplisit (log structured + status job gagal). Jangan pernah fallback ke data sintetis.
- Seed entity dibuat deterministik dengan initial confidence 30%; derivasi deterministik diperbolehkan (URL→Domain, Email→Domain) karena dapat dipertanggungjawabkan.
- Terapkan *seed echo filtering*: jangan jadikan temuan yang identik dengan seed sebagai "entitas baru".
- Setiap relasi baru harus punya confidence score 0–100 beserta alasan explainable (misal *"Exact email match"*, *"DNS A record resolution"*, *"TLS SAN mapping"*), plus evidence (URL sumber, snippet, timestamp, nama collector).

### 2.5 Gaya Kode
- TypeScript strict mode; ikuti `tsconfig.base.json`.
- Validasi semua input/output API dengan Zod schemas dari shared.
- Logging: gunakan structured JSON logger (`apps/api/src/lib/logger.ts`) dengan `requestId`; dilarang `console.log` mentah di API.
- Frontend: TanStack Query untuk server state, Zustand untuk client state (auth, filters, selection, toasts). Jangan campur peran keduanya.
- Ikuti dark-mode security workstation design system (Tailwind + vanilla CSS) yang sudah ada.
- Jangan menambah komentar/dead code yang tidak perlu; ikuti gaya file di sekitarnya.

---

## 3. Database & API Ownership Rules

### 3.1 Ownership Validation (NON-NEGOTIABLE)
- **Setiap akses data per-investigasi WAJIB divalidasi ownership-nya** dengan `validateCaseOwnership(caseId, userId)` (lihat `apps/api/src/services`) sebelum read/write/delete.
- RLS Supabase (`investigations.owner_id = auth.uid()`) adalah lapisan pertahanan kedua — jangan mengandalkan service-role key untuk melewati RLS di jalur user-facing.
- Service role key hanya boleh dipakai server-side (`apps/api`), tidak pernah dikirim ke browser.

### 3.2 Cascade Cleanup & Graph Integrity
- Saat menghapus entitas/seed: gunakan **seed subgraph cascade deletion via BFS traversal** — hapus entitas dan relasi dalam subgraf seed tersebut, **tanpa** menghapus node yang masih terhubung ke klaster seed lain dalam investigasi yang sama.
- Saat menghapus entitas apa pun, bersihkan juga `relationships`, `evidence`, dan record run terkait agar tidak ada orphan rows.
- Perubahan skema database harus lewat migrasi SQL baru di `supabase/migrations/` (penomoran berurutan) — jangan pernah mengedit file migrasi lama yang sudah diterapkan.

### 3.3 Rate Limiting
- Collector baru harus terdaftar di rate limiter (sliding window): default `RATE_LIMIT_COLLECTOR_PER_HOUR=20`, large collectors `RATE_LIMIT_LARGE_COLLECTOR_PER_HOUR=5`.
- Request ke pihak ketiga harus hormati limit platform (misal GitHub tanpa token = 60 req/jam).

---

## 4. Common Commands

```bash
# Development (jalankan web + api paralel)
pnpm dev

# Development per-app
pnpm dev:web
pnpm dev:api

# Build (termasuk typecheck frontend)
pnpm build

# Typecheck saja (semua workspace)
pnpm typecheck

# Lint
pnpm lint

# Test
pnpm test                              # semua workspace
pnpm test:unit                         # unit tests
pnpm --filter @nexusgraph/api test     # vitest API saja
pnpm --filter @nexusgraph/web build    # typecheck + build frontend

# Format
pnpm format
```

---

## 6. Frontend & UI/UX Standards (Anti-Slop & Monochrome Theme)

Frontend NexusGraph mengadopsi standar **Anti-Slop Security Workstation** dengan estetika **Hitam-Putih / Monochrome**. Rujukan detail lengkap, token warna, tipografi, dan kamus ikon tersedia di [DESIGN.md](file:///c:/laragon/www/OSINT%20Investigation%20Graph/DESIGN.md):
1. **Palet Warna Netral (Monochrome)**:
   - Base Backgrounds: `#050505` (canvas), `#0a0a0a` (modal/docks), `#0e0e0e` / `#121212` / `#141414` (cards/inputs).
   - Subtle Borders: `#181818` (subtle divider), `#222222` / `#262626` (default border), `#2e2e2e` / `#404040` (hover highlight).
   - Dilarang menggunakan warna neon glow, saturated halos (`shadow-[0_0_24px_...]`), maupun gradien pelangi.
2. **Status Aktif & Kontras**:
   - Status tombol aktif menggunakan kontras tinggi monokrom (`bg-white text-black font-semibold border-white`).
   - Status non-aktif menggunakan dark neutral (`bg-[#141414] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border-[#222222]`).
3. **Typography & Icons**:
   - Hindari emoji/ikon AI-cliché (`Sparkles` ✨, 🚀, dll.). Selalu gunakan Lucide SVG icons semantik (`Layers`, `Filter`, `Target`, `Shield`, `Search`, `Fingerprint`, `Workflow`).
   - Angka metrik, IP, domain, hash, port, dan total entitas wajib menggunakan `font-mono` (JetBrains Mono).
4. **Docking & Canvas Non-Intrusive**:
   - Kontrol graf melayang (floating docks) wajib memiliki lebar kompak dan terkontrol (~500px, tidak membentang memenuhi layar hingga bertabrakan dengan Console/Minimap).
   - Menyediakan fitur minimize 1-klik agar kanvas investigasi dapat dieksplorasi tanpa hambatan visual.

---

## 7. Status Terkini Proyek & Milestone Arsitektur (Current Project State)

Dokumentasi ini mencatat sejauh mana kapabilitas platform NexusGraph telah dibangun dan siap digunakan, agar setiap AI assistant memahami kondisi codebase saat ini secara utuh:

### 7.1 Kolektor & Mesin Investigasi Aktif (Active OSINT Engines)
Platform saat ini memiliki 17 kolektor aktif yang terdaftar di `apps/api/src/collectors/registry.ts` dan discovery planner:

1. **`dirsearch` (Web Path Brute-Force Discovery Engine)**:
   - **Engine Vendored**: Mengintegrasikan mesin asli `maurosoria/dirsearch` di `vendor/dirsearch/`.
   - **Bridge Python**: `vendor/dirsearch-bridge.py` mengeksekusi fuzzer secara non-interaktif, menerima input target, ekstensi file, timeout via `stdin` JSON, dan mengeluarkan struktur temuan via `stdout` JSON murni.
   - **Recon File & Path Tersembunyi**: Mendeteksi dotfiles (`.env*`, `.git/*`, `.htaccess*`, `.DS_Store`, `.well-known/*`), direktori tersembunyi/internal (`_admin/`, `_backup/`, `_test/`, `_api/`, `secret/`, `hidden/`, `private/`, `internal/`), dan file cadangan swap/backup (`.bak`, `.old`, `.swp`, `~`, `db.sqlite*`).
   - **Filter Ketat Status HTTP 200**: Hanya meneruskan temuan dengan status HTTP 200 OK murni. Dilengkapi guard deteksi *soft-404* dan *catch-all rewrite* berbasis ukuran baseline homepage untuk menyaring false positive.
   - **Klasifikasi & Severity**: Hasil diklasifikasikan secara otomatis (`hidden_file`, `hidden_directory`, `admin_panel`, `backup_file`, `config_file`, `api_endpoint`, `login_portal`, dll.) dengan risk level (`high`, `medium`, `low`).
   - **Integrasi Penuh**: Didukung oleh collector TypeScript `apps/api/src/collectors/dirsearch.ts`, transform `domain.dirsearch-path-bruteforce`, evidence source `DIRSEARCH_SCAN`, modul layout `engine_dirsearch`, dan telah lolos uji 16 test di `apps/api/src/__tests__/dirsearch.test.ts`.

2. **`xnLinkFinder` (JS Endpoint & Parameter Recon)**:
   - Menginspeksi bundle JavaScript klien untuk mengekstraksi hidden REST API endpoints, parameter query/POST, form keys, dan potensi secrets/API tokens.
   - Didukung oleh `vendor/xnlinkfinder-bridge.py` dan unit test komprehensif di `apps/api/src/__tests__/xnlinkfinder.test.ts`.

3. **`Mr.Holmes` (Social, Identity & Dork Engine)**:
   - Menjalankan engine `Lucksi/Mr.Holmes` via `vendor/mrholmes-bridge.py` untuk mode username, people, email, phone, domain, serta pembuatan Google Dorks terarah.

4. **`Holehe` (Multi-Platform Email Checker)**:
   - Menguji registrasi email di 120+ platform digital (Twitter, GitHub, Instagram, Spotify, dll.) via `vendor/holehe-bridge.py`.

5. **`phone-geo` (Phone Intelligence & Telco Resolver)**:
   - Integrasi Twilio Lookup v2 + GetContact, dilengkapi normalisasi nomor lokal (08...) dan deteksi carrier telekomunikasi Indonesia (Telkomsel, Indosat, XL, Tri, Smartfren) serta kode area PSTN secara deterministik.

6. **`dns-security-audit` & `subdomain-takeover`**:
   - Audit DNS mendalam: validasi konfigurasi SPF, DMARC DKIM, deteksi SaaS verification tokens, serta verifikasi kerentanan dangling DNS / subdomain takeover.

7. **`tls-certificate` & `subdomain-crt`**:
   - Ekstraksi Subject Alternative Names (SAN) untuk clustering klaster domain perusahaan dan live Certificate Transparency log stream dari `crt.sh`.

8. **`web-tech-fingerprint` & `http-security-audit`**:
   - Identifikasi web server, CDN, framework, CMS, dan penilaian postur keamanan HTTP security response headers (CSP, HSTS, CORS, X-Frame-Options).

9. **`tracking-id-extractor` & `site-crawler`**:
   - Ekstraksi Google Analytics (UA-/G-), Tag Manager (GTM-), AdSense (pub-), Facebook Pixel ID untuk korelasi kepemilikan situs lintas domain, serta web crawler internal.

10. **`sensitive-url-classifier` & `social-rapidapi`**:
    - Deteksi query parameters berisiko tinggi (token otentikasi, open-redirect, file inclusion) dan profiling identitas sosial via RapidAPI.

11. **`company-geo` (Corporate HQ Geolocation & Google Maps Discovery)**:
    - **Target**: `DOMAIN`, `URL`, `WEBSITE`, `ORGANIZATION` (misal: `kopikenangan.com`).
    - **Physical Office Reconnaissance**: Berbeda dengan *IP Geolocation* yang hanya melacak server hosting (AWS/Cloudflare), modul ini secara khusus mencari **letak kantor pusat fisik / kantor operasional nyata** organisasi.
    - **Metode Ekstraksi Multi-Source**:
      1. Web crawling aman dengan proteksi SSRF (`safeFetch`) ke homepage dan path kontak (`/contact`, `/about-us`, `/tentang-kami`, `/hubungi-kami`).
      2. Ekstraksi metadata halaman (`<title>`, `og:site_name`, `og:title`) untuk mengidentifikasi nama resmi entitas/institusi secara presisi (misal: "SMK Daarut Tauhiid Boarding School Bandung").
      3. Ekstraksi Schema.org JSON-LD terstruktur (`PostalAddress`, `LocalBusiness`, `Organization`, `GeoCoordinates`).
      4. Ekstraksi link & iframe embed Google Maps (`maps.google.com`, `goo.gl/maps`, `maps.app.goo.gl`, koordinat `@lat,lng` atau query parameter).
      5. Ekstraksi pola alamat fisik Indonesia & internasional dari body HTML dengan dukungan format prefix (`Kampus I :`, `Kantor Pusat :`) tanpa mewajibkan pemisah koma kaku.
      6. Multi-tier Geocoding (Photon + Nominatim) dilengkapi **Relevance Guard** (`isGeocodingResultRelevant`) untuk menyaring dan menolak false-positive dari fuzzy matching (mencegah singkatan domain seperti `smkdtbs` keliru dipetakan ke entitas acak seperti `SMK PTBA` di Tanjung Enim).
      7. Fallback regional centroid cerdas berbasis kota teridentifikasi dari metadata situs (misal Bandung / Jawa Barat).
    - **Visualisasi & Interaktivitas Graf**:
      - Menghasilkan entitas `LOCATION` dan `ADDRESS` terhubung dengan relasi `GEOLOCATED_IN`.
      - Menampilkan badge **Geo Perusahaan** dengan warna sky pastel (`#38bdf8`) dan tombol direct link **Buka di Google Maps ↗** pada node hover toolbar, panel detail entitas, serta memplot penanda kantor fisik langsung di tab **Geo Map** (`PhoneMapPanel.tsx`).

---

### 7.2 Proteksi Konkurensi Discovery (Active Job Concurrency Guard)
Untuk mencegah race conditions, duplicate worker spawns, dan graf terdistorsi:
- **Service Layer**: `discoveryJobService.getActiveJob(caseId, userId)` di `apps/api/src/services/index.ts` memeriksa adanya job dengan status `PENDING` atau `RUNNING` dalam jendela waktu 5 menit terakhir.
- **API Guard**: Endpoint `POST /investigations/:id/discovery` (baik HTTP standard maupun Server-Sent Events stream) menolak eksekusi bertumpuk dengan respon `409 Conflict`.
- **Sinkronisasi UI Frontend**:
  - Tombol **Start Discovery** dan **Add Target** di `apps/web/src/pages/InvestigationDetailPage.tsx` secara otomatis berubah menjadi state indikator kerja `Memproses Modul (X/Y)...` beranimasi spinner amber saat discovery berlangsung.
  - `StartDiscoveryModal.tsx` menampilkan banner peringatan aktif yang melarang submit ganda serta menyediakan tombol langsung untuk membuka Execution Console.
  - Sistem toast di `appStore.ts` dan `Toast.tsx` mendukung level notifikasi `warning` untuk mengomunikasikan status eksekusi modul kepada analis.

---

### 7.3 Standar UI/UX Monochrome Anti-Slop
- **Filter Engine Module Graf (`EngineModuleFilterBar.tsx`)**:
  - Fixed-width smart dock (~500px) di `bottom-3 left-1/2 -translate-x-1/2` pada canvas graf.
  - Tombol kanonikal `Semua (Total)`, Top 5 Modul dominan, dropdown kompak `+N Lainnya ▾`, auto-promotion modul terpilih, dan tombol ciutkan (minimize) ke chip kecil ~26px.
  - Menggunakan palet monokrom gelap workstation (`#0a0a0a`, `#222222`, aksen aktif `bg-white text-black font-semibold`).
- **Desain Node Graf (`EntityNode.tsx` & `ClusterHubNode.tsx`)**:
  - Menghilangkan efek warna neon radioaktif, glow halo, dan gradien pelangi.
  - Kartu node menggunakan styling dark workstation yang bersih (`bg-[#0a0a0a] border-[#222222]`), seleksi bergaris putih kontras tinggi (`bg-white text-black font-semibold`).
  - **Pewarnaan Font & Badge Berdasarkan Modul**: Label teks dan dot indikator modul pada badge node (misal: `● Shodan Recon`, `● Wayback CDX`, `● xnLinkFinder`) diberi warna pastel/muted terkurasi sesuai modul engine asalnya, sedangkan teks nilai entitas utama tetap mempertahankan warna putih/abu kontras tinggi untuk menjaga keterbacaan data secara optimal (anti-slop).

---

### 7.4 Konfigurasi Lingkungan Pyright & Language Server
- [pyrightconfig.json](file:///c:/laragon/www/OSINT%20Investigation%20Graph/pyrightconfig.json) dan [.vscode/settings.json](file:///c:/laragon/www/OSINT%20Investigation%20Graph/.vscode/settings.json) telah dikonfigurasi dengan `extraPaths` untuk modul Python vendored:
  ```json
  "extraPaths": [
    "./vendor/Mr.Holmes",
    "./vendor/dirsearch"
  ]
  ```
  Ini mencegah false-positive error `Cannot find module 'lib.core.api'` atau modul lokal lainnya di IDE / Language Server saat menginspeksi atau mengedit file bridge Python.

---

### 7.5 Status Kualitas Kode (Quality Gate)
- **TypeScript Strict Mode**: 100% bersih tanpa error (`pnpm typecheck` lolos di seluruh `packages/shared`, `apps/api`, `apps/web`).
- **Linting**: 100% lolos (`pnpm lint`).
- **Vitest Test Suite**: 31 test suite lolos, 245 unit dan integration test hijau (`pnpm --filter @nexusgraph/api test`).

---

## 8. Checklist Sebelum Commit / Selesai Modifikasi

Jalankan dan pastikan SEMUA lolos sebelum menyatakan pekerjaan selesai:

- [ ] `pnpm typecheck` — tanpa error TypeScript.
- [ ] `pnpm lint` — tanpa error lint.
- [ ] `pnpm --filter @nexusgraph/api test` — semua Vitest suites hijau (214+ tests).
- [ ] Tidak ada penggunaan `fetch` eksternal baru yang melewati SSRF guard (`apps/api/src/security/ssrf.ts`).
- [ ] Semua entitas baru melewati `normalize(type, value)` dari `@nexusgraph/shared`.
- [ ] Tidak ada fake/mock/sample data pada jalur produksi (periksa diff secara manual).
- [ ] Semua endpoint baru memvalidasi input/output dengan Zod dan memanggil `validateCaseOwnership(caseId, userId)`.
- [ ] Penghapusan data membersihkan relationships/evidence terkait (tidak ada orphan rows).
- [ ] Perubahan skema DB dilakukan via migrasi baru bernomor urut, RLS tetap aktif untuk tabel user-scoped.
- [ ] Tidak ada secret/key yang ter-commit (cek `.env` tidak masuk git; gunakan `.env.example` untuk template).
- [ ] Logging menggunakan structured logger dengan `requestId`.
- [ ] Modul atau transform baru didaftarkan di rate limiter dan memiliki unit/integration test di `apps/api/src/__tests__/`.
- [ ] Modul vendor Python baru wajib didaftarkan di `pyrightconfig.json` dan `.vscode/settings.json` pada bagian `extraPaths`.

---

*Referensi tambahan: `README.md` (overview & setup), `ARCHITECTURE.md`, `PRD.md`, `supabase/migrations/` (skema & RLS).*

