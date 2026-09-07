#!/usr/bin/env python3
"""
dirsearch <-> NexusGraph OSINT Bridge
=====================================
Runs the vendored dirsearch engine (maurosoria/dirsearch, GPLv2) via its
importable Python API (DirsearchFuzzer + FuzzerConfig) to brute-force
discover hidden directories, admin panels, backup files, config files,
and API endpoints on a target website.

Protocol:
  stdin : {"target": "https://example.com", "extensions": ["php","html","js"],
           "timeout": 5, "max_entries": 500}
  stdout: One JSON object with structured results:
          {
            "target": "...",
            "total_tested": 500,
            "results": [
              {"url": "...", "path": "...", "status": 200, "length": 4532,
               "content_type": "text/html", "redirect": "", "elapsed": 0.234}
            ],
            "stats": {"tested": 500, "found": 12, "duration_seconds": 45.2}
          }

All logs and third-party outputs are suppressed so stdout remains pure JSON.
"""

import sys
import os
import json
import time

# Ensure vendor/dirsearch is importable
VENDOR_DIR = os.path.dirname(os.path.abspath(__file__))
DIRSEARCH_DIR = os.path.join(VENDOR_DIR, "dirsearch")
sys.path.insert(0, DIRSEARCH_DIR)

# Suppress dirsearch's internal colorama / logging before import
os.environ["NO_COLOR"] = "1"

import warnings
warnings.filterwarnings("ignore")
try:
    import urllib3
    urllib3.disable_warnings()
except ImportError:
    pass

from lib.core.api import DirsearchFuzzer, FuzzerConfig, Wordlist  # noqa: E402
# pyrefly: ignore [missing-import]
from lib.core.settings import SCRIPT_PATH  # noqa: E402

# ─────────────────────────────────────────────────────────────────────────────
# Curated top-priority OSINT paths (admin panels, backups, configs, API)
# These are always tested first regardless of wordlist size cap
# ─────────────────────────────────────────────────────────────────────────────
PRIORITY_PATHS = [
    # Admin panels
    "admin", "admin/", "administrator", "administrator/", "admin/login",
    "admin/dashboard", "wp-admin/", "wp-login.php", "cpanel", "panel",
    "manager", "manage", "dashboard", "control", "controlpanel",
    "admin.php", "admin.html", "login.php", "login.html", "login",
    # Backups
    "backup", "backup/", "backups", "db.sql", "database.sql",
    "dump.sql", "backup.sql", "backup.zip", "backup.tar.gz",
    "site.zip", "www.zip", "web.zip", "db_backup.sql",
    # Configuration
    ".env", ".env.local", ".env.production", ".env.development",
    ".env.backup", ".env.old", "config.php", "config.yml",
    "config.json", "config.xml", "configuration.php", "settings.php",
    "settings.json", "wp-config.php", "wp-config.php.bak",
    "web.config", "application.yml", "application.properties",
    ".htaccess", ".htpasswd", "php.ini", "phpinfo.php",
    # API endpoints
    "api", "api/", "api/v1", "api/v2", "api/v3",
    "api/swagger", "api/docs", "swagger.json", "swagger.yaml",
    "openapi.json", "api-docs", "graphql", "graphql/",
    # Version control
    ".git/", ".git/config", ".git/HEAD", ".svn/", ".svn/entries",
    ".hg/", ".gitignore", ".gitattributes",
    # Info disclosure
    "info.php", "phpinfo.php", "test.php", "debug", "debug/",
    "status", "health", "healthcheck", "server-status",
    "server-info", ".DS_Store", "Thumbs.db", "crossdomain.xml",
    # Logs
    "logs", "logs/", "log", "log/", "error.log", "access.log",
    "debug.log", "app.log",
    # Sensitive directories
    "private", "private/", "internal", "internal/", "staging",
    "test", "test/", "dev", "dev/", "tmp", "tmp/", "temp",
    "upload", "uploads", "uploads/", "files", "files/",
    "data", "data/", "includes", "include",
    # Database interfaces
    "phpmyadmin", "phpmyadmin/", "adminer", "adminer.php",
    "pma", "pma/", "mysql", "db", "database",
]


def load_wordlist(max_entries: int = 500) -> list[str]:
    """Load curated wordlist: priority paths + top entries from common.txt."""
    paths = list(PRIORITY_PATHS)
    seen = set(p.rstrip("/").lower() for p in paths)

    # Try loading from dirsearch's bundled common.txt
    common_path = os.path.join(DIRSEARCH_DIR, "db", "categories", "common.txt")
    if os.path.isfile(common_path):
        try:
            with open(common_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    key = line.rstrip("/").lower()
                    if key not in seen:
                        paths.append(line)
                        seen.add(key)
                    if len(paths) >= max_entries:
                        break
        except OSError:
            pass

    # Fallback to main dicc.txt if we still need more
    if len(paths) < max_entries:
        dicc_path = os.path.join(DIRSEARCH_DIR, "db", "dicc.txt")
        if os.path.isfile(dicc_path):
            try:
                with open(dicc_path, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        key = line.rstrip("/").lower()
                        if key not in seen:
                            paths.append(line)
                            seen.add(key)
                        if len(paths) >= max_entries:
                            break
            except OSError:
                pass

    return paths[:max_entries]


def classify_path(path: str, status: int) -> dict:
    """Classify a discovered path into a security-relevant category."""
    p = path.lower().rstrip("/")

    categories = {
        "admin_panel": [
            "admin", "administrator", "wp-admin", "cpanel", "panel",
            "manager", "dashboard", "control", "manage", "controlpanel",
        ],
        "login_portal": [
            "login", "signin", "sign-in", "auth", "authenticate",
            "wp-login", "user/login", "account/login",
        ],
        "backup_file": [
            "backup", "backups", ".bak", ".old", ".zip", ".tar",
            ".gz", ".sql", "dump", "db_backup",
        ],
        "config_file": [
            ".env", "config", "configuration", "settings", "wp-config",
            "web.config", "application.yml", "application.properties",
            ".htaccess", ".htpasswd", "php.ini",
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
            "health", "server-status", "server-info", ".DS_Store",
        ],
        "database_interface": [
            "phpmyadmin", "adminer", "pma", "mysql", "database",
        ],
        "log_file": [
            "log", "logs", "error.log", "access.log", "debug.log",
        ],
        "upload_directory": [
            "upload", "uploads", "files", "media", "attachments",
        ],
        "sensitive_directory": [
            "private", "internal", "staging", "dev", "tmp", "temp",
            "data", "includes",
        ],
    }

    for category, keywords in categories.items():
        for kw in keywords:
            if kw in p:
                return {"category": category, "keyword": kw}

    # Status-based fallback
    if status in (301, 302, 307, 308):
        return {"category": "redirect", "keyword": ""}
    if status == 403:
        return {"category": "forbidden", "keyword": ""}

    return {"category": "discovered_path", "keyword": ""}


def get_risk_level(category: str) -> str:
    """Map category to risk level."""
    high_risk = {"admin_panel", "backup_file", "config_file", "version_control", "database_interface"}
    medium_risk = {"login_portal", "api_endpoint", "info_disclosure", "log_file"}
    if category in high_risk:
        return "high"
    if category in medium_risk:
        return "medium"
    return "low"


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

    extensions = payload.get("extensions", ["php", "html", "js", "txt", "bak"])
    timeout = payload.get("timeout", 5.0)
    max_entries = payload.get("max_entries", 500)

    # Load wordlist
    word_paths = load_wordlist(max_entries=max_entries)
    wordlist = Wordlist(word_paths)

    # Configure fuzzer
    config = FuzzerConfig(
        url=target,
        wordlist=wordlist,
        extensions=tuple(str(e).strip(".") for e in extensions),
        timeout=float(timeout),
        follow_redirects=False,
        exclude_status_codes=frozenset({404, 400, 429, 500, 502, 503, 504}),
        verify_tls=False,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    )

    fuzzer = DirsearchFuzzer(config)

    start_time = time.time()
    found_results = []
    errors = []

    try:
        raw_results = fuzzer.run()
        for r in raw_results:
            classification = classify_path(r.path, r.status)
            found_results.append({
                "url": r.url,
                "path": r.path,
                "status": r.status,
                "length": r.length,
                "content_type": r.content_type,
                "redirect": r.redirect,
                "elapsed": round(r.elapsed, 3),
                "category": classification["category"],
                "risk_level": get_risk_level(classification["category"]),
            })
    except Exception as e:
        errors.append(str(e))

    duration = round(time.time() - start_time, 2)

    output = {
        "target": target,
        "total_tested": len(word_paths),
        "results": found_results[:200],  # Cap at 200 results max
        "stats": {
            "tested": len(word_paths),
            "found": len(found_results),
            "duration_seconds": duration,
            "extensions": extensions,
        },
    }
    if errors:
        output["errors"] = errors

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
