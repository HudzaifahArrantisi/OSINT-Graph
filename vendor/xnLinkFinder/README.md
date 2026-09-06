# xnLinkFinder Engine for NexusGraph OSINT Platform
**Repository:** [https://github.com/xnl-h4ck3r/xnLinkFinder](https://github.com/xnl-h4ck3r/xnLinkFinder)  
**Author:** xnl-h4ck3r  

---

## 🔍 Kegunaan dalam NexusGraph
Engine ini diintegrasikan ke dalam kategori **DOMAIN** dan **URL (URL Web)** pada platform NexusGraph untuk:
1. **Membongkar Parameter JavaScript Frontend**:
   - Mendeteksi parameter GET/POST yang tertanam dalam query string URL (`?token=`, `?apiKey=`, `?redirect=`).
   - Mengekstrak deklarasi variabel JavaScript (`var`, `let`, `const`) yang menyimpan state atau kunci parameter request.
   - Mendeteksi pemanggilan `URLSearchParams.get()`, `axios({ params: { ... } })`, dan `fetch()`.
   - Mengambil nama input dan form tersembunyi (`name=""`, `id=""`).
2. **Endpoint Discovery**:
   - Menemukan hidden REST API routes, routing internal frontend (Next.js/React Router/Vue), dan path skrip eksternal.
3. **Pendeteksian Hardcoded Secrets**:
   - Mengidentifikasi pola token JWT, API Keys, atau header otorisasi yang bocor di bundel JavaScript frontend.

---

## ⚙️ Instalasi Python (Opsional / Upgrade Engine)
NexusGraph telah menyertakan engine bridge mandiri (`vendor/xnlinkfinder-bridge.py`) yang langsung dapat dijalankan tanpa dependensi luar. Namun untuk menggunakan versi CLI penuh xnLinkFinder, Anda dapat menginstalnya secara global di Python:

```bash
# Instalasi langsung dari Git
pip install git+https://github.com/xnl-h4ck3r/xnLinkFinder.git

# Atau instalasi paket PyPI
pip install xnLinkFinder
```

Untuk mengklon repo ke direktori ini jika ingin mengedit kode sumber engine xnLinkFinder secara manual:
```bash
git clone --depth 1 https://github.com/xnl-h4ck3r/xnLinkFinder.git vendor/xnLinkFinder
```

---

## 🛠️ Konfigurasi Parameter (config.yml)
File konfigurasi `config.yml` telah disesuaikan agar fokus pada pembongkaran parameter kode JavaScript:
- `respParamJSVars: True` (Ekstraksi variabel JS)
- `respParamLinksFound: True` (Ekstraksi query parameter URL)
- `respParamJSON: True` (Ekstraksi JSON keys dalam skrip)
- `respParamInputField: True` (Ekstraksi nama field input & template)
