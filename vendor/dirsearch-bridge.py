#!/usr/bin/env python3
"""
dirsearch <-> NexusGraph OSINT Bridge
=====================================
Runs web path discovery to brute-force discover hidden directories,
admin panels, backup files, config files, and API endpoints on a target website.

Key Capabilities:
1. Zero-dependency standard library engine (urllib.request + ThreadPoolExecutor + ssl)
   so it loads and runs out-of-the-box on vanilla Python without requiring 12+ third-party
   packages (requests, httpx, colorama, beautifulsoup4, etc.).
2. High-speed concurrency (15-20 workers) to ensure full discovery finishes well
   within API transform limits (3 to 8 seconds).
3. Resilient protocol probing (automatically checks HTTPS, with HTTP fallback).
4. Wildcard / Soft-404 detection to eliminate false positives on catch-all servers.
5. Curated OSINT priority wordlist + dirsearch common.txt integration.
6. Deep categorization and risk classification (admin, backup, config, api, git, etc.).

Protocol:
  stdin : {"target": "https://example.com", "extensions": ["php","html","js"],
           "timeout": 5, "max_entries": 200}
  stdout: One JSON object with structured results:
          {
            "target": "...",
            "total_tested": 200,
            "results": [
              {"url": "...", "path": "...", "status": 200, "length": 4532,
               "content_type": "text/html", "redirect": "", "elapsed": 0.234,
               "category": "admin_panel", "risk_level": "high"}
            ],
            "stats": {"tested": 200, "found": 12, "duration_seconds": 4.2}
          }

All logs and third-party outputs are suppressed so stdout remains pure JSON.
"""

import sys
import os
import json
import time
import ssl
import urllib.request
import urllib.parse
import urllib.error
import concurrent.futures
import warnings

# Suppress SSL and general warnings
warnings.filterwarnings("ignore")

# Ensure vendor/dirsearch directory is in sys.path
VENDOR_DIR = os.path.dirname(os.path.abspath(__file__))
DIRSEARCH_DIR = os.path.join(VENDOR_DIR, "dirsearch")
if os.path.isdir(DIRSEARCH_DIR):
    sys.path.insert(0, DIRSEARCH_DIR)

# Suppress dirsearch's internal colorama / logging
os.environ["NO_COLOR"] = "1"

# Safe optional import of dirsearch internal modules (never crashes if dependencies are missing)
HAS_DIRSEARCH_LIB = False
try:
    from lib.core.api import DirsearchFuzzer, FuzzerConfig, Wordlist  # noqa: F401, E402
    from lib.core.settings import SCRIPT_PATH  # noqa: F401, E402
    HAS_DIRSEARCH_LIB = True
except Exception:
    HAS_DIRSEARCH_LIB = False

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# ─────────────────────────────────────────────────────────────────────────────
# Curated top-priority OSINT paths (hidden files, dotfiles, internal paths, admin, configs)
# ─────────────────────────────────────────────────────────────────────────────
PRIORITY_PATHS = [
    # ─── 1. Hidden Files & Dotfiles (.env*, .git*, .ht*, etc.) ───────────
    ".env", ".env.local", ".env.production", ".env.staging", ".env.development",
    ".env.backup", ".env.old", ".env.save", ".env.example", ".env.sample", ".env.test", ".env.dev",
    ".git/config", ".git/HEAD", ".git/index", ".git/logs/HEAD", ".gitignore",
    ".gitattributes", ".gitlab-ci.yml", ".travis.yml",
    ".svn/entries", ".svn/wc.db",
    ".htaccess", ".htpasswd", ".htaccess.bak", ".htaccess.old", ".htaccess.save",
    ".DS_Store", "._.DS_Store", ".localized",
    ".user.ini", ".editorconfig", ".dockerignore", "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    ".npmrc", ".yarnrc", ".bowerrc",
    ".bash_history", ".bash_profile", ".bashrc",
    ".ssh/id_rsa", ".ssh/id_rsa.pub", ".ssh/authorized_keys",
    ".well-known/security.txt", ".well-known/assetlinks.json", ".well-known/apple-app-site-association",
    ".vscode/settings.json", ".idea/workspace.xml", ".idea/modules.xml",

    # ─── 2. Hidden & Internal Directories (_admin, secret, internal, etc.) ───
    "_admin", "_admin/", "_administrator", "_administrator/",
    "_backup", "_backup/", "_backups", "_backups/",
    "_test", "_test/", "_tests", "_tests/",
    "_debug", "_debug/", "_api", "_api/",
    "_old", "_old/", "_temp", "_temp/", "_tmp", "_tmp/",
    "_files", "_files/", "_logs", "_logs/", "_config", "_config/",
    "secret", "secret/", "secret/admin", "secret/login",
    "hidden", "hidden/", "private", "private/",
    "internal", "internal/", "confidential", "confidential/",
    "backoffice", "backoffice/", "backend", "backend/",
    "adm", "adm/", "master", "master/", "core", "core/", "system", "system/", "sysadmin", "sysadmin/",
    "app/config", "app/config/", "config/database.php", "config/app.php",
    "storage/logs", "storage/logs/", "storage/logs/laravel.log",
    "storage/framework", "storage/framework/", "storage/app", "storage/app/",
    "telescope", "telescope/", "horizon", "horizon/", "nova", "nova/", "filament", "filament/",
    "staging", "staging/", "dev", "dev/", "development", "development/",
    "test", "test/", "testing", "testing/", "beta", "beta/", "demo", "demo/",

    # ─── 3. Hidden & Backup Extension Variants (.bak, .old, .save, ~, .swp) ─
    "wp-config.php.bak", "wp-config.php.old", "wp-config.php.save", "wp-config.php~",
    "wp-config.php.swp", "wp-config.php.swo", "wp-config.old", "wp-config.bak", "wp-config.txt",
    "config.php.bak", "config.php.old", "config.php.save", "config.php~", "config.php.swp",
    "database.php.bak", "database.php.old", "koneksi.php.bak", "koneksi.php.old",
    "settings.php.bak", "settings.py.bak", "web.config.bak", "web.config.old",
    "index.php.bak", "index.php.old", "index.php~", "index.php.swp",
    "db.sqlite", "db.sqlite3", "database.sqlite", "database.sqlite3",
    "database.sql.gz", "backup.sql.gz", "dump.sql.gz", "backup.tar.gz", "backup.tar.bz2",

    # ─── 4. Admin Panels, Auth & Portals ─────────────────────────────────
    "wp-login.php", "wp-admin/", "admin", "admin/", "administrator",
    "administrator/", "admin/login", "admin/dashboard", "admin.php", "login.php",
    "login", "masuk", "cpanel", "panel", "manager", "dashboard",
    "adminer.php", "pma.php", "phpmyadmin", "phpmyadmin/", "portal", "portal/",
    "user/login", "auth/login", "siakad", "siakad/", "elearning", "elearning/",
    "moodle", "moodle/", "cbt", "cbt/", "ujian", "ujian/", "ppdb", "ppdb/",

    # ─── 5. Exposed Manifests & Dependency Configurations ────────────────
    "composer.json", "composer.lock", "package.json", "package-lock.json",
    "yarn.lock", "pnpm-lock.yaml", "tsconfig.json", "web.config",
    "php.ini", "robots.txt", "sitemap.xml",

    # ─── 6. Sensitive Documents (PDF, Office Word, Excel, CSV) ───────────
    # PDF Documents
    "laporan.pdf", "laporan-tahunan.pdf", "annual-report.pdf", "report.pdf",
    "dokumen.pdf", "panduan.pdf", "buku-panduan.pdf", "manual.pdf", "sop.pdf",
    "profil.pdf", "profil-sekolah.pdf", "company-profile.pdf",
    "surat-keputusan.pdf", "sk.pdf", "kalender-akademik.pdf", "jadwal.pdf",
    "kurikulum.pdf", "silabus.pdf", "proposal.pdf", "brosur.pdf",
    "anggaran.pdf", "keuangan.pdf", "rekap.pdf", "audit.pdf",
    "data-siswa.pdf", "data-guru.pdf", "data-alumni.pdf", "daftar-nilai.pdf",
    "ijazah.pdf", "raport.pdf", "akreditasi.pdf", "sertifikat.pdf",
    "formulir.pdf", "form.pdf", "invoice.pdf", "catalog.pdf",
    # Office Documents (.doc, .docx)
    "laporan.docx", "laporan.doc", "dokumen.docx", "dokumen.doc",
    "surat.docx", "surat.doc", "sk.docx", "sk.doc", "proposal.docx", "proposal.doc",
    "formulir.docx", "formulir.doc", "form.docx", "biodata.docx",
    # Spreadsheets & Data Exports (.xlsx, .xls, .csv)
    "data.xlsx", "data.xls", "data.csv", "database.csv", "export.csv", "backup.csv",
    "rekap.xlsx", "rekap.xls", "keuangan.xlsx", "anggaran.xlsx",
    "data-siswa.xlsx", "data-guru.xlsx", "alumni.xlsx", "nilai.xlsx",
    "users.csv", "members.csv", "kontak.xlsx", "pegawai.xlsx",

    # ─── 7. Database Backups & Archive Dumps (.sql, .zip, .tar.gz) ──────
    "backup.sql", "db.sql", "database.sql", "dump.sql", "data.sql", "users.sql",
    "backup.zip", "backups.zip", "site.zip", "www.zip", "web.zip", "db.zip",
    "files.zip", "archive.zip", "backup.tar.gz", "backup.bak",

    # ─── 8. PHP Server Scripts & Sensitive Handlers (.php) ──────────────
    "wp-config.php", "xmlrpc.php",
    "config.php", "koneksi.php", "db.php", "database.php", "conn.php",
    "setting.php", "settings.php", "upload.php", "uploader.php",
    "file_upload.php", "upload-file.php", "file.php", "download.php",
    "export.php", "import.php", "backup.php", "dump.php", "phpinfo.php",
    "info.php", "test.php", "check.php", "cek.php", "status.php", "ajax.php",
    "proses.php", "process.php", "api.php", "data.php", "sql.php",

    # ─── 9. Frontend JavaScript & Configuration Files (.js, .json) ──────
    "config.js", "env.js", "environment.js", "settings.js", "constants.js",
    "secret.js", "auth.js", "api.js", "app.js", "main.js", "bundle.js",
    "runtime.js", "vendor.js", "service-worker.js", "sw.js",
    "manifest.json", "asset-manifest.json",

    # ─── 10. API Endpoints & Documentation ───────────────────────────────
    "api", "api/", "api/v1", "api/v1/", "api/v2", "api/v2/",
    "api/swagger", "api/docs", "swagger.json", "swagger.yaml",
    "openapi.json", "openapi.yaml", "graphql", "graphql/",

    # ─── 11. System Logs & Sensitive Directories ─────────────────────────
    "logs", "logs/", "log", "log/", "error.log", "access.log", "debug.log",
    "tmp", "tmp/", "upload", "uploads", "uploads/", "files", "files/",
    "documents", "documents/", "dokumen", "dokumen/", "backup", "backup/",
    "server-status", "server-info",
]

# Stem keywords for dynamic synthesis with provided file extensions
ROOT_STEMS = [
    "env", "git", "config", "koneksi", "db", "database", "backup", "upload",
    "login", "admin", "test", "info", "api", "secret", "settings",
    "private", "hidden", "internal", "data", "dump", "app", "server", "master", "auth",
    "laporan", "dokumen", "panduan", "kurikulum", "sk", "profil",
    "rekap", "anggaran", "keuangan", "siswa", "guru", "alumni",
]


def load_wordlist(extensions: list[str] | None = None, max_entries: int = 350) -> list[str]:
    """Load curated wordlist: priority paths + synthesized hidden/extensions + common.txt."""
    seen = set()
    paths = []
    for p in PRIORITY_PATHS:
        clean = p.strip()
        k = clean.rstrip("/").lower()
        if k and k not in seen:
            seen.add(k)
            paths.append(clean)

    # Synthesize hidden dotfiles and extensions
    clean_exts = [e.lstrip(".").lower() for e in (extensions or []) if e.strip()]

    for stem in ROOT_STEMS:
        # 1. Dotfile synthesis: .{stem}
        cand_dot = f".{stem}"
        k = cand_dot.lower()
        if k not in seen:
            paths.append(cand_dot)
            seen.add(k)

        # 2. Hidden directory synthesis: _{stem}/
        cand_hidden_dir = f"_{stem}/"
        k = cand_hidden_dir.rstrip("/").lower()
        if k not in seen:
            paths.append(cand_hidden_dir)
            seen.add(k)

        # 3. Backup and swap extensions for sensitive files
        for b_ext in ["bak", "old", "save", "swp", "backup"]:
            cand_bak = f"{stem}.php.{b_ext}"
            k = cand_bak.lower()
            if k not in seen:
                paths.append(cand_bak)
                seen.add(k)
            cand_bare_bak = f"{stem}.{b_ext}"
            k2 = cand_bare_bak.lower()
            if k2 not in seen:
                paths.append(cand_bare_bak)
                seen.add(k2)

        # 4. Standard extension synthesis
        for ext in clean_exts:
            candidate = f"{stem}.{ext}"
            k = candidate.lower()
            if k not in seen:
                paths.append(candidate)
                seen.add(k)
            if len(paths) >= max_entries:
                break
        if len(paths) >= max_entries:
            break

    # Try loading from dirsearch's bundled common.txt if we still need more
    if len(paths) < max_entries:
        common_path = os.path.join(DIRSEARCH_DIR, "db", "categories", "common.txt")
        if os.path.isfile(common_path):
            try:
                with open(common_path, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        k = line.rstrip("/").lower()
                        if k not in seen:
                            paths.append(line)
                            seen.add(k)
                        if len(paths) >= max_entries:
                            break
            except OSError:
                pass

    return paths[:max_entries]


def classify_path(path: str, status: int = 200) -> dict:
    """Classify a discovered path into a security-relevant category."""
    p = path.lower().rstrip("/")
    filename = p.split("/")[-1]

    # 1. Hidden Files (Dotfiles, backup files, editor temporary swaps)
    backup_exts = (".bak", ".old", ".save", ".swp", ".swo", ".orig", ".backup", "~")
    if filename.startswith(".") or any(p.endswith(ext) for ext in backup_exts) or filename.endswith((".bak", ".old", ".save")):
        if ".env" in filename:
            return {"category": "hidden_file", "keyword": ".env"}
        if ".git" in p:
            return {"category": "hidden_file", "keyword": ".git"}
        if ".ht" in filename:
            return {"category": "hidden_file", "keyword": ".htaccess"}
        return {"category": "hidden_file", "keyword": filename}

    # 2. Hidden & Internal Directories (Starting with _ or named secret/hidden/private)
    if any(segment.startswith("_") for segment in p.split("/")) or any(
        k in p for k in ["secret", "hidden", "private", "internal", "confidential", "backoffice"]
    ):
        return {"category": "hidden_directory", "keyword": "internal"}

    # 3. Documents (PDF, Office Word, Excel, CSV)
    doc_exts = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".odt", ".rtf"]
    if any(p.endswith(ext) for ext in doc_exts):
        ext_name = p.split(".")[-1].upper()
        return {"category": "sensitive_document", "keyword": ext_name}

    # 4. Exposed Configurations & Dependency Manifests
    if any(p.endswith(f) for f in [
        "composer.json", "composer.lock", "package.json", "package-lock.json",
        "yarn.lock", "pnpm-lock.yaml", "tsconfig.json", "web.config", "robots.txt", "sitemap.xml"
    ]):
        return {"category": "config_file", "keyword": filename}

    # 5. Frontend JavaScript & Configs
    if any(p.endswith(ext) for ext in [".js", ".mjs", ".jsx"]):
        return {"category": "source_code_js", "keyword": "js"}

    # 6. Server-side PHP scripts
    if "admin" in p and p.endswith(".php"):
        return {"category": "admin_panel", "keyword": "admin.php"}
    if any(k in p for k in ["login", "masuk", "auth", "signin"]) and p.endswith(".php"):
        return {"category": "login_portal", "keyword": "login.php"}
    if any(k in p for k in ["config", "koneksi", "conn", "setting", "setup", "install"]) and p.endswith(".php"):
        return {"category": "config_file", "keyword": "config.php"}
    if any(k in p for k in ["upload", "uploader"]) and p.endswith(".php"):
        return {"category": "upload_directory", "keyword": "upload.php"}
    if any(k in p for k in ["backup", "dump"]) and p.endswith(".php"):
        return {"category": "backup_file", "keyword": "backup.php"}
    if p.endswith((".php", ".phtml", ".php5")):
        return {"category": "server_script_php", "keyword": "php"}

    # 7. Standard Categories
    categories = {
        "admin_panel": [
            "admin", "administrator", "wp-admin", "cpanel", "panel",
            "manager", "dashboard", "control", "manage", "controlpanel",
            "siakad", "sim", "elearning", "moodle", "cbt", "ppdb",
        ],
        "login_portal": [
            "login", "signin", "sign-in", "auth", "authenticate",
            "wp-login", "user/login", "account/login", "masuk",
        ],
        "backup_file": [
            "backup", "backups", ".bak", ".old", ".zip", ".tar",
            ".gz", ".sql", "dump", "db_backup", ".rar", ".7z", "sqlite",
        ],
        "config_file": [
            "config", "configuration", "settings", "wp-config",
            "web.config", "application.yml", "application.properties", "php.ini",
        ],
        "api_endpoint": [
            "api", "swagger", "openapi", "graphql", "api-docs",
            "rest", "v1", "v2", "v3",
        ],
        "version_control": [
            ".git", ".svn", ".hg", ".gitignore",
        ],
        "info_disclosure": [
            "phpinfo", "info.php", "test.php", "debug", "status",
            "health", "server-status", "server-info", ".ds_store",
        ],
        "database_interface": [
            "phpmyadmin", "adminer", "pma", "mysql", "database",
        ],
        "log_file": [
            "log", "logs", "error.log", "access.log", "debug.log", "app.log",
        ],
        "upload_directory": [
            "upload", "uploads", "files", "media", "attachments", "download",
        ],
        "sensitive_directory": [
            "staging", "dev", "tmp", "temp", "data", "includes", "documents", "dokumen",
        ],
    }

    for category, keywords in categories.items():
        for kw in keywords:
            if kw in p:
                return {"category": category, "keyword": kw}

    return {"category": "discovered_path", "keyword": ""}


def get_risk_level(category: str) -> str:
    """Map category to risk level."""
    high_risk = {
        "hidden_file", "hidden_directory", "admin_panel", "backup_file",
        "config_file", "version_control", "database_interface"
    }
    medium_risk = {
        "sensitive_document", "server_script_php", "source_code_js",
        "login_portal", "api_endpoint", "info_disclosure",
        "log_file", "upload_directory", "sensitive_directory"
    }
    if category in high_risk:
        return "high"
    if category in medium_risk:
        return "medium"
    return "low"


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Custom redirect handler to capture 301/302/307/308 without auto-following."""
    def redirect_request(self, *args, **kwargs):
        return None


def create_ssl_opener() -> urllib.request.OpenerDirector:
    """Create an opener with permissive SSL context and no automatic redirection."""
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    https_handler = urllib.request.HTTPSHandler(context=ssl_ctx)
    return urllib.request.build_opener(https_handler, NoRedirectHandler())


def probe_target(target: str, opener: urllib.request.OpenerDirector, timeout: float = 3.0) -> str:
    """
    Test target reachability. If target starts with https:// but fails,
    test if http:// responds, and return the working scheme.
    """
    if not target.startswith(("http://", "https://")):
        target = f"https://{target}"

    # Quick test of base target
    try:
        req = urllib.request.Request(
            target,
            headers={"User-Agent": USER_AGENT, "Accept": "*/*", "Connection": "close"},
        )
        with opener.open(req, timeout=timeout):
            return target
    except urllib.error.HTTPError:
        # Received HTTP status (e.g. 403, 401, 301, 200) -> server is reachable
        return target
    except Exception:
        # Try alternate scheme if https was tried
        if target.startswith("https://"):
            alt = "http://" + target[8:]
            try:
                req = urllib.request.Request(
                    alt,
                    headers={"User-Agent": USER_AGENT, "Accept": "*/*", "Connection": "close"},
                )
                with opener.open(req, timeout=timeout):
                    return alt
            except Exception:
                pass

    return target


def detect_wildcard(base_url: str, opener: urllib.request.OpenerDirector, timeout: float = 3.0) -> dict:
    """
    Detect wildcard 200 (soft-404) and homepage baseline length to filter catch-all echoes.
    """
    info = {
        "has_wildcard": False,
        "wildcard_len": 0,
        "homepage_len": 0,
    }
    # 1. Baseline root homepage length
    try:
        req = urllib.request.Request(
            base_url.rstrip("/") + "/",
            headers={"User-Agent": USER_AGENT, "Accept": "*/*", "Connection": "close"},
        )
        with opener.open(req, timeout=timeout) as resp:
            content = resp.read(8192)
            info["homepage_len"] = len(content)
    except Exception:
        pass

    # 2. Probe random non-existent path
    random_path = f"__nexus_probe_{int(time.time())}_notfound.html"
    probe_url = urllib.parse.urljoin(base_url.rstrip("/") + "/", random_path)
    try:
        req = urllib.request.Request(
            probe_url,
            headers={"User-Agent": USER_AGENT, "Accept": "*/*", "Connection": "close"},
        )
        with opener.open(req, timeout=timeout) as resp:
            content = resp.read(8192)
            info["has_wildcard"] = True
            info["wildcard_len"] = len(content)
    except Exception:
        pass

    return info


def check_path(
    base_url: str,
    path: str,
    opener: urllib.request.OpenerDirector,
    timeout: float,
    wildcard_info: dict,
) -> dict | None:
    """Test a single path concurrently and return structured finding only if status is HTTP 200 OK."""
    clean_path = path.lstrip("/")
    url = urllib.parse.urljoin(base_url.rstrip("/") + "/", clean_path)
    start_time = time.time()
    has_wildcard = wildcard_info.get("has_wildcard", False)
    wildcard_len = wildcard_info.get("wildcard_len", 0)
    homepage_len = wildcard_info.get("homepage_len", 0)

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
        "Connection": "close",
    }
    req = urllib.request.Request(url, headers=headers)

    try:
        with opener.open(req, timeout=timeout) as resp:
            elapsed = round(time.time() - start_time, 3)
            status = resp.getcode()

            # Strict Filter: ONLY accept HTTP 200 OK responses
            if status != 200:
                return None

            content_type = resp.headers.get("Content-Type", "").split(";")[0].strip()
            content_length = resp.headers.get("Content-Length")
            body_sample = resp.read(4096)
            length = int(content_length) if content_length and content_length.isdigit() else len(body_sample)

            # Filter wildcard / soft-404 false positives
            if has_wildcard and abs(length - wildcard_len) <= 48:
                return None

            # Filter catch-all rewrites returning homepage for subpaths (unless path itself is root)
            if clean_path and homepage_len > 0 and abs(length - homepage_len) <= 16:
                if "html" in content_type and body_sample and b"<html" in body_sample.lower():
                    return None

            classification = classify_path(clean_path, status)
            return {
                "url": url,
                "path": clean_path,
                "status": 200,
                "length": length,
                "content_type": content_type or "text/html",
                "redirect": "",
                "elapsed": elapsed,
                "category": classification["category"],
                "risk_level": get_risk_level(classification["category"]),
            }
    except urllib.error.HTTPError:
        # Exclude all HTTP errors (404, 403, 401, 500, etc.) — strictly status 200 only
        return None
    except Exception:
        # Connection reset, timeout, unreachable host
        return None


def run_concurrent_fuzzer(
    target: str,
    word_paths: list[str],
    timeout: float = 4.0,
    max_workers: int = 15,
) -> tuple[list[dict], list[str], float]:
    """Execute high-speed concurrent path discovery across the wordlist."""
    opener = create_ssl_opener()
    resolved_target = probe_target(target, opener, timeout=min(3.0, timeout))
    wildcard_info = detect_wildcard(resolved_target, opener, timeout=min(3.0, timeout))

    start_time = time.time()
    found_results: list[dict] = []
    errors: list[str] = []

    seen_paths = set()
    workers = min(max_workers, max(4, len(word_paths)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(check_path, resolved_target, p, opener, timeout, wildcard_info): p
            for p in word_paths
        }
        for future in concurrent.futures.as_completed(futures):
            try:
                res = future.result()
                if res:
                    k = res["path"].lower().rstrip("/")
                    if k not in seen_paths:
                        seen_paths.add(k)
                        found_results.append(res)
            except Exception as e:
                errors.append(str(e))

    # Sort results: high risk first, then by status code
    def sort_key(r: dict) -> tuple[int, int]:
        risk_prio = {"high": 0, "medium": 1, "low": 2}
        return (risk_prio.get(r.get("risk_level", "low"), 2), r.get("status", 999))

    found_results.sort(key=sort_key)
    duration = round(time.time() - start_time, 2)
    return found_results, errors, duration


def main():
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw)
    except (json.JSONDecodeError, ValueError) as e:
        json.dump({"error": f"Invalid JSON input: {e}"}, sys.stdout)
        sys.exit(1)

    target = payload.get("target", "").strip()
    if not target:
        json.dump({"error": "Missing 'target' field"}, sys.stdout)
        sys.exit(1)

    # Ensure target has scheme
    if not target.startswith(("http://", "https://")):
        target = f"https://{target}"

    extensions = payload.get("extensions", [
        "php", "html", "js", "pdf", "docx", "doc", "xlsx", "xls", "csv", "txt", "bak", "sql", "zip", "env", "old", "save"
    ])
    timeout = float(payload.get("timeout", 2.5))
    max_entries = int(payload.get("max_entries", 350))
    max_workers = int(payload.get("max_workers", 35))

    # Load wordlist (prioritizing OSINT high-value endpoints and synthesized extensions)
    word_paths = load_wordlist(extensions=extensions, max_entries=max_entries)

    # Execute high-speed concurrent fuzzer
    found_results, errors, duration = run_concurrent_fuzzer(
        target=target,
        word_paths=word_paths,
        timeout=timeout,
        max_workers=max_workers,
    )

    output = {
        "target": target,
        "total_tested": len(word_paths),
        "results": found_results[:150],  # Cap at 150 structured findings
        "stats": {
            "tested": len(word_paths),
            "found": len(found_results),
            "duration_seconds": duration,
            "extensions": extensions,
            "engine": "concurrent-osint-fuzzer",
            "has_dirsearch_lib": HAS_DIRSEARCH_LIB,
        },
    }
    if errors:
        output["errors"] = errors[:10]

    json.dump(output, sys.stdout, ensure_ascii=False)
    sys.stdout.flush()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        json.dump({"error": str(e)}, sys.stdout)
        sys.stdout.flush()
        sys.exit(1)
