# NexusGraph Design System & UI/UX Guidelines (Anti-Slop Security Workstation)

> **Untuk AI Coding Assistant & Developer:** Dokumen ini adalah spesifikasi desain resmi dan kanonikal untuk seluruh antarmuka frontend NexusGraph (`apps/web`). Setiap komponen baru atau modifikasi UI **wajib** mematuhi aturan warna, tipografi, ikonografi, dan pola tata letak yang tercantum di sini.

---

## 1. Filosofi Desain: Anti-Slop Security Workstation

NexusGraph adalah platform investigasi graf OSINT dan intelijen digital tingkat tinggi untuk analis keamanan profesional. Desain antarmuka NexusGraph mengusung prinsip **"Anti-Slop Security Workstation"**:

1. **Monochrome First (Bukan Neon / Sci-Fi Slop)**:
   - Hindari warna neon mencolok, glowing halos (`shadow-[0_0_24px_...]`), dan gradien pelangi bergaya "cyberpunk cliché".
   - Antarmuka mengutamakan hitam, abu-abu gelap, dan putih kontras tinggi yang tenang, profesional, dan nyaman digunakan untuk investigasi berjam-jam tanpa menyebabkan kelelahan visual (*visual fatigue*).

2. **Intelligence Data Dominates**:
   - Data graf, entitas, relasi, dan barang bukti (*evidence*) adalah fokus utama. Elemen dekoratif antarmuka tidak boleh bersaing merebut perhatian dari data temuan.

3. **High Density & Precision**:
   - Informasi disajikan padat namun terstruktur secara hierarkis (*dense but readable*).
   - Metrik teknis, hash, IP address, domain, port, dan query parameter selalu disajikan dengan ketelitian visual maksimal.

4. **Zero AI Cliché**:
   - Dilarang keras menggunakan emoji atau ikon klise AI seperti bintang kilau (`Sparkles` ✨), roket (`Rocket` 🚀), atau tongkat sihir (`Wand`). Selalu gunakan ikon SVG semantik dari `lucide-react`.

---

## 2. Palet Warna Resmi (Color Palette Tokens)

Sistem warna NexusGraph didefinisikan secara presisi pada `apps/web/tailwind.config.js` dan `apps/web/src/index.css`:

### 2.1 Backgrounds & Surface (Dark Monochrome)

| Token CSS | HEX Code | Penggunaan Komponen |
| :--- | :--- | :--- |
| `app` / `--bg` | `#050505` | Background canvas kanvas React Flow utama & halaman |
| `surface` / `--surface` | `#0a0a0a` | Background modal dialog, floating docks, header bar, card utama |
| `surface-2` / `--surface-2` | `#121212` | Background sub-card, input field, table row hover, badge kontainer |
| `surface-3` / `--surface-3` | `#1a1a1a` | Background pill chip sekunder, tag atribut terstruktur, panel nested |
| `surface.hover` | `#222222` | State hover pada surface dan container interaktif |

### 2.2 Borders & Dividers

| Token CSS | HEX Code | Penggunaan Komponen |
| :--- | :--- | :--- |
| `border-subtle` | `#181818` | Garis pemisah internal (divider row, tab divider tipis) |
| `border` / `border.DEFAULT` | `#262626` / `#222222` | Border standar untuk kartu, panel modal, dock, dan input field |
| `border-strong` | `#404040` | Border state hover pada card, divider utama header, batas fokus |

### 2.3 Text & Kontras

| Token CSS | HEX Code | Penggunaan Komponen |
| :--- | :--- | :--- |
| `text` / `text.DEFAULT` | `#ededed` / `#ffffff` | Judul, heading utama, nilai entitas kanonikal, metrik penting |
| `text-secondary` | `#a1a1a1` | Label field, deskripsi singkat, kategori tab tidak aktif |
| `text-muted` | `#666666` | Timestamp, counter sekundar, metadata minor, placeholder input |

### 2.4 Active & Interactive States (High Contrast Monochrome)

| State | Tailwind Class | Keterangan |
| :--- | :--- | :--- |
| **Primary Action (Active / CTA)** | `bg-white text-black font-semibold hover:bg-neutral-200 border border-white` | Tombol aksi utama, tab aktif, filter modul terpilih |
| **Secondary Action** | `bg-[#141414] text-neutral-300 hover:text-white border border-[#282828] hover:border-neutral-500` | Tombol sekunder (Copy, Export, Cancel) |
| **Ghost / Icon Button** | `text-neutral-400 hover:text-white hover:bg-[#1a1a1a]` | Tombol ikon (Close modal, minimap toggle, zoom) |
| **Selected Node / Row** | `border-white ring-1 ring-white/40 text-white bg-[#161616]` | Node graf terpilih, baris tabel terfokus |

### 2.5 Aksen Modul Engine (Muted & Pastel Dot Only)

Untuk membedakan modul kolektor/engine asal temuan pada graf (misal: *dirsearch*, *xnLinkFinder*, *Holehe*, *Shodan*), digunakan aksen warna pastel/muted yang **hanya diterapkan pada indikator dot kecil (`w-1.5 h-1.5`) dan teks modul kecil**, sedangkan **teks nilai entitas utama tetap putih/abu netral**:

```typescript
// Contoh Engine Module Meta:
{
  dirsearch: { color: '#fb923c', shortName: 'dirsearch' },      // Muted Orange
  xnlinkfinder: { color: '#a78bfa', shortName: 'xnLink' },      // Muted Lavender
  shodan: { color: '#f87171', shortName: 'Shodan' },            // Muted Salmon Red
  crtsh: { color: '#38bdf8', shortName: 'crt.sh' },             // Muted Sky Blue
  dns_audit: { color: '#34d399', shortName: 'DNS Audit' },      // Muted Mint Green
  holehe: { color: '#f472b6', shortName: 'Holehe' },            // Muted Rose
  company_geo: { color: '#38bdf8', shortName: 'Geo HQ' },        // Muted Sky Pastel
}
```

---

## 3. Tipografi (Typography)

Sistem tipografi menggunakan dua font terkurasi dari Google Fonts:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

### 3.1 Inter (`font-sans`)
Digunakan untuk antarmuka pengguna umum:
- Navigation bar, label tab, label form, heading modal.
- Pesan bantuan, tooltip, deskripsi modul, tombol CTA.
- Ketentuan: Gunakan font-weight `medium` (500) atau `semibold` (600). Hindari text shadow.

### 3.2 JetBrains Mono (`font-mono`)
Wajib digunakan untuk seluruh data intelijen dan representasi teknis:
- Domain, subdomain, hostname, URL, API endpoint.
- IP Address (IPv4 / IPv6), subnet mask, open ports (`80, 443, 8080`).
- Hash kriptografi (MD5, SHA-256), Tracking ID (`UA-XXXXX`, `GTM-XXXXX`, `pub-XXXXX`).
- Confidence percentage score (`85% confidence`).
- Evidence counts, relationship count, node counter (`30 Nodes`, `12 Subdomains`).

### 3.3 Skala Ukuran Font

| Utility Class | Ukuran Font / Line Height | Kasus Penggunaan |
| :--- | :--- | :--- |
| `text-[8px]` / `text-[8.5px]` | 8px / 10px | Badge engine module di node graf, counter kecil |
| `text-[10px]` / `text-[10.5px]` | 10px / 14px | Metadata timestamp, confidence score, source provenance |
| `text-xs` | 12px / 16px (0.75rem) | Nilai entitas node graf, isi tabel data, tab navigation |
| `text-sm` | 14px / 20px (0.875rem) | Body text, input field, tombol form |
| `text-base` | 16px / 24px (1rem) | Sub-heading panel, judul modal |
| `text-lg` / `text-xl` | 18px – 20px | Header utama halaman investigasi, skor audit |

---

## 4. Standar Ikonografi (Lucide SVG Icons)

Gunakan **Lucide React** (`lucide-react`) untuk semua ikon di seluruh aplikasi.

### 4.1 Aturan Wajib Ikon
- ❌ **DILARANG**: `Sparkles` ✨ (AI magic cliché), `Rocket` 🚀, emoji unicode mentah (`🎯`, `🔍`, `⚠️`).
- ✅ **WAJIB**: Ikon semantik Lucide yang mencerminkan fungsi investigasi nyata.

### 4.2 Kamus Pasangan Ikon Semantik

| Domain / Fungsi | Ikon Lucide yang Direkomendasikan | Keterangan |
| :--- | :--- | :--- |
| **Investigation Seed Target** | `Target` | Menandakan titik awal penargetan investigasi |
| **Transforms / Intelligence Engine** | `Workflow` / `Zap` | Menandakan alur eksekusi transform deterministik |
| **Identity / Tracking ID / Analytics** | `Fingerprint` | Menandakan fingerprinting unik entitas |
| **Security Posture & Headers** | `ShieldCheck` / `ShieldAlert` | Menandakan postur keamanan server |
| **Web Server / Hosting Infra** | `Server` / `Cpu` | Menandakan infrastruktur origin/edge hosting |
| **Domain / Subdomain / DNS** | `Globe2` | Menandakan resolusi web dan domain |
| **IP Address / Network** | `Network` | Menandakan simpul jaringan |
| **Office Location / Corporate HQ** | `MapPin` | Menandakan koordinat fisik kantor nyata |
| **Site Crawler / robots / sitemap** | `FileText` / `FolderSearch` | Menandakan inspeksi dokumen web crawler |
| **Evidence & Provenance** | `Layers` | Menandakan tumpukan bukti dan sumber data |
| **Copy Value** | `Copy` / `Check` | Aksi menyalin nilai dengan feedback instan |
| **External Navigation** | `ExternalLink` | Navigasi aman ke tab peramban baru |

---

## 5. Pola Komponen UI (UI Patterns)

### 5.1 Modal Dialog (`Modal.tsx` & Spesialisasi Modal)
- **Backdrop**: `fixed inset-0 bg-black/80 backdrop-blur-xs`
- **Kontainer**: `bg-[#0a0a0a] border border-[#262626] rounded-modal shadow-2xl p-5 sm:p-6`
- **Header**: Judul `text-base font-semibold text-white`, tombol close `btn-icon` di sudut kanan atas.
- **Tab Bar**: Border bawah `border-b border-[#222222]`. Tab aktif: `bg-white text-black font-semibold shadow-sm`. Tab inaktif: `text-neutral-400 hover:text-white hover:bg-[#141414]`.
- **Card Bagian Dalam**: `bg-[#0e0e0e] border border-[#222222] rounded-lg p-3.5`.
- **Label & Value**: Label menggunakan `text-neutral-400 font-sans`, value menggunakan `text-neutral-200 font-mono font-medium`.

### 5.2 Kartu Node Graf (`EntityNode.tsx`)
- **Tampilan Default**:
  - Ukuran: `w-[195px] min-h-[46px]`
  - Background: `bg-[#0a0a0a]/95 border-[#222222] text-neutral-300 rounded-md`
- **Tampilan Hover**:
  - Background: `bg-[#121212] border-neutral-400 text-neutral-100 shadow-md`
- **Tampilan Terpilih (Selected)**:
  - Background: `bg-[#161616] border-white ring-1 ring-white/40 text-white shadow-xl`
- **Badge Modul**:
  - Terletak di baris atas kartu node, menampilkan dot modul (`w-1.5 h-1.5`), ikon engine (`w-2.5 h-2.5`), dan singkatan nama engine. Saat terpilih, berubah menjadi kontras tinggi `bg-white text-black border-white`.
- **NodeToolbar (Hover)**:
  - Muncul di atas node dengan `z-[99999]`, background `bg-[#0a0a0a]/98 backdrop-blur-md border border-[#262626] rounded-md shadow-2xl p-3`, menyediakan ringkasan cepat, tombol salin, navigasi URL, dan direct pivot.

### 5.3 Floating Docks (`EngineModuleFilterBar.tsx` & Canvas Controls)
- **Lebar Kompak & Terkontrol**: Lebar dock ~500px, posisi `bottom-3 left-1/2 -translate-x-1/2`.
- **Sidebar-Aware**: Dilengkapi `ResizeObserver` atau listener perubahan lebar sidebar agar posisi dock tidak bertabrakan dengan Console, Minimap, atau Detail Panel.
- **Minimize Capability**: Menyediakan tombol ciutkan 1-klik (`h-7 px-2.5`) agar analis dapat menjelajahi kanvas graf tanpa halangan.
- **Styling**: `bg-[#0a0a0a]/95 backdrop-blur-md border border-[#222222] rounded-full shadow-2xl`. Tombol aktif menggunakan `bg-white text-black font-semibold`.

### 5.4 Form Inputs & Controls
- **Input Field**:
  - `bg-[#121212] border border-[#262626] rounded-input px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400`
- **Primary Button**:
  - `bg-white text-black font-semibold px-3.5 py-1.5 rounded-button hover:bg-neutral-200 transition-colors`
- **Secondary Button**:
  - `bg-[#141414] text-neutral-300 border border-[#282828] hover:border-neutral-500 hover:text-white px-3.5 py-1.5 rounded-button transition-colors`

---

## 6. AI Coding Assistant Guardrails (Panduan Mutlak)

Ketika Anda membuat atau mengubah file antarmuka di `apps/web`:

1. **JANGAN gunakan warna cyan/teal/purple/pink terang sebagai latar belakang tombol atau kartu utama**. Semua tombol aksi dan header modal harus menggunakan palet monokrom (`bg-white text-black` untuk aktif, `bg-[#121212]` / `bg-[#141414]` untuk kartu).
2. **JANGAN menambahkan efek glow radioaktif** (`box-shadow: 0 0 20px cyan`, `drop-shadow-[0_0_15px_...]`).
3. **JANGAN mengimpor atau merender `Sparkles` dari `lucide-react`**. Gunakan `Target` untuk seed, `Fingerprint` untuk tracking/social attributes, `Workflow` atau `Zap` untuk transforms.
4. **JANGAN gunakan font sans-serif untuk data teknis**. Semua IP, domain, hash, port, dan query parameter WAJIB memiliki kelas `font-mono`.
5. **PASTIKAN tag JSX seimbang**. Selalu verifikasi bahwa setiap tag `<div>` memiliki pasangan penutup yang tepat tanpa tag ganda atau hilang.
6. **JALANKAN typecheck** (`pnpm --filter @nexusgraph/web typecheck`) setiap kali selesai memodifikasi kode frontend untuk memastikan nol error kompilasi TypeScript.
