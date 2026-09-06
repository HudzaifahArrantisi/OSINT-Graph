#!/usr/bin/env python3
"""
xnLinkFinder <-> NexusGraph OSINT Bridge
=========================================
Runs xnLinkFinder (xnl-h4ck3r/xnLinkFinder, MIT) or its built-in LinkFinder/GAP
parameter & endpoint discovery engine non-interactively to discover:
  - Hidden REST API endpoints in frontend JavaScript files
  - Potential parameters (GET/POST query params, JS variables, JSON keys, form fields)
  - Secrets & credentials embedded in client-side bundles

Protocol:
  stdin : {"target": "https://example.com", "scope": "example.com", "depth": 1, "timeout": 15}
  stdout: One JSON object with structured findings:
          {
            "target": "...",
            "scope": "...",
            "scripts": [...],
            "endpoints": [...],
            "parameters": [...],
            "secrets": [...]
          }

All logs and third-party outputs are suppressed so stdout remains pure JSON.
"""

import sys
import os
import json
import re
import urllib.request
import urllib.parse
import urllib.error
import ssl
from html.parser import HTMLParser

# Ensure vendor directory is in sys.path
VENDOR_DIR = os.path.dirname(os.path.abspath(__file__))
XNLINKFINDER_DIR = os.path.join(VENDOR_DIR, "xnLinkFinder")
sys.path.insert(0, XNLINKFINDER_DIR)

# ─────────────────────────────────────────────────────────────────────────────
# Regex Rules (Derived from xnLinkFinder & GerbenJavado/LinkFinder)
# ─────────────────────────────────────────────────────────────────────────────

# Link finding regex (matches endpoints, relative paths, api URLs, files)
LINK_REGEX = re.compile(
    r"""(?:"|')("""
    r"""(?:[a-zA-Z]{1,10}://|//)[^"'/]{1,}\.[a-zA-Z]{2,}[^"'\s]{0,}"""
    r"""|(?:/|\.\./|\./)[^"'><,;| *()(%%$^/\\\[\]][^"'><,;|\s()]{1,}"""
    r"""|[a-zA-Z0-9_\-/]{1,}/[a-zA-Z0-9_\-/]{1,}\.(?:[a-zA-Z]{1,4}|action)(?:[\?|#][^"\\'\s]*)?"""
    r"""|[a-zA-Z0-9_\-/]{1,}/[a-zA-Z0-9_\-/]{3,}(?:[\?|#][^"\\'\s]*)?"""
    r"""|[a-zA-Z0-9_\-]{1,}\.(?:php|asp|aspx|jsp|json|action|html|js|txt|xml)(?:[\?|#][^"\\'\s]*)?"""
    r""")(?:"|')""",
    re.VERBOSE | re.IGNORECASE,
)

# Parameter Regex: JS Variable declarations (var, let, const)
PARAM_JS_VARS = re.compile(
    r"\b(?:var|let|const)\s+([a-zA-Z0-9_$]{2,40})\s*=",
    re.IGNORECASE,
)

# Parameter Regex: URL Query params e.g. ?param=value or &param=value
PARAM_QUERY_STRING = re.compile(
    r"[?&]([a-zA-Z0-9_\-\[\]]{2,40})=",
    re.IGNORECASE,
)

# Parameter Regex: Object keys commonly used in API requests (e.g. data: { token: ... })
PARAM_OBJECT_KEYS = re.compile(
    r"""(?:params|data|body|query|searchParams|headers)\s*:\s*\{([^}]+)\}""",
    re.IGNORECASE,
)

# Parameter Regex: URLSearchParams / searchParams.get('...') / append('...')
PARAM_SEARCH_PARAMS = re.compile(
    r"""\b(?:searchParams|params)\.(?:get|has|set|append|delete)\s*\(\s*['"]([a-zA-Z0-9_\-\[\]]{2,40})['"]""",
    re.IGNORECASE,
)

# Parameter Regex: Axios / Fetch query param string patterns
PARAM_FETCH_AXIOS = re.compile(
    r"""(?:fetch|axios(?:\.get|\.post)?)\s*\(\s*[`'"][^`'"]*[\?&]([a-zA-Z0-9_\-\[\]]{2,40})=""",
    re.IGNORECASE,
)

# Parameter Regex: Input and form names/IDs in HTML or JS templates
PARAM_INPUT_FIELDS = re.compile(
    r"""(?:name|id)=["']([a-zA-Z0-9_\-\[\]]{2,40})["']""",
    re.IGNORECASE,
)

# Secret Regex: Sensitive keys, tokens, auth headers
SECRET_PATTERNS = [
    ("jwt_token", re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("aws_access_key", re.compile(r"\b(AKIA[0-9A-Z]{16})\b")),
    ("google_api_key", re.compile(r"\b(AIza[0-9A-Za-z-_]{35})\b")),
    ("github_pat", re.compile(r"\b(gh[pousr]_[0-9a-zA-Z]{36})\b")),
    ("bearer_token", re.compile(r"""['"]Bearer\s+([a-zA-Z0-9_\-\.]{20,})['"]""", re.IGNORECASE)),
    ("private_key_header", re.compile(r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----")),
]

# Common words to filter out (not parameters)
PARAM_STOPWORDS = {
    "true", "false", "null", "undefined", "function", "return", "typeof",
    "instanceof", "prototype", "constructor", "length", "split", "join",
    "slice", "push", "filter", "map", "foreach", "then", "catch", "async",
    "await", "default", "export", "import", "class", "switch", "case",
    "break", "continue", "throw", "error", "window", "document", "navigator",
    "location", "history", "console", "parent", "target", "value", "this",
    "self", "node", "element", "style", "width", "height", "display", "color",
}

# ─────────────────────────────────────────────────────────────────────────────
# HTML Script Extractor
# ─────────────────────────────────────────────────────────────────────────────

class ScriptTagParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.script_srcs = []
        self.inline_scripts = []
        self._in_script = False
        self._current_script = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "script":
            self._in_script = True
            attr_dict = {k.lower(): v for k, v in attrs if v is not None}
            src = attr_dict.get("src")
            if src:
                self.script_srcs.append(src)

    def handle_endtag(self, tag):
        if tag.lower() == "script":
            self._in_script = False
            if self._current_script:
                content = "".join(self._current_script).strip()
                if content:
                    self.inline_scripts.append(content)
                self._current_script = []

    def handle_data(self, data):
        if self._in_script:
            self._current_script.append(data)


# ─────────────────────────────────────────────────────────────────────────────
# Engine Logic
# ─────────────────────────────────────────────────────────────────────────────

def create_ssl_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_url(url, timeout=10, max_bytes=2*1024*1024):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (NexusGraph-xnLinkFinder/1.0)",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
    }
    req = urllib.request.Request(url, headers=headers)
    ctx = create_ssl_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            content_type = resp.headers.get("Content-Type", "")
            data = resp.read(max_bytes)
            try:
                return data.decode("utf-8", errors="ignore"), content_type
            except Exception:
                return data.decode("latin-1", errors="ignore"), content_type
    except Exception as e:
        return None, str(e)


def extract_parameters_from_text(content, script_origin="inline"):
    """
    Finds potential parameters embedded in JavaScript code:
    - JS variables
    - URL query parameters
    - Axios/fetch query keys
    - Object keys
    - Form/input fields
    """
    params = set()
    found_details = []

    def add_param(name, source):
        clean = name.strip().strip("'\"`")
        if not clean or len(clean) < 2 or len(clean) > 40:
            return
        if clean.lower() in PARAM_STOPWORDS:
            return
        # Ensure it looks like a valid variable or parameter identifier
        if not re.match(r"^[a-zA-Z0-9_\-\[\]]+$", clean):
            return
        if clean not in params:
            params.add(clean)
            found_details.append({
                "name": clean,
                "source": source,
                "origin_script": script_origin
            })

    # 1. Query string parameters
    for m in PARAM_QUERY_STRING.finditer(content):
        add_param(m.group(1), "url_query")

    # 2. SearchParams method calls
    for m in PARAM_SEARCH_PARAMS.finditer(content):
        add_param(m.group(1), "search_params_call")

    # 3. Fetch / Axios query parameters
    for m in PARAM_FETCH_AXIOS.finditer(content):
        add_param(m.group(1), "fetch_axios_query")

    # 4. JavaScript variable assignments
    for m in PARAM_JS_VARS.finditer(content):
        add_param(m.group(1), "js_variable")

    # 5. Object keys inside params/query/data objects
    for m in PARAM_OBJECT_KEYS.finditer(content):
        inner = m.group(1)
        for key_m in re.finditer(r"""['"]?([a-zA-Z0-9_\-\[\]]{2,30})['"]?\s*:""", inner):
            add_param(key_m.group(1), "object_key")

    # 6. Form / input field identifiers
    for m in PARAM_INPUT_FIELDS.finditer(content):
        add_param(m.group(1), "input_field")

    return found_details


def extract_endpoints_from_text(content, base_url, scope_domain=None):
    """
    Extracts potential API endpoints, routes, and paths using LinkFinder regex.
    """
    endpoints = []
    seen = set()

    for match in LINK_REGEX.finditer(content):
        val = match.group(1).strip()
        if not val or len(val) < 3 or len(val) > 300:
            continue

        # Skip common false positives
        if val.startswith(("//www.w3.org", "http://www.w3.org", "data:", "blob:", "javascript:", "mailto:", "tel:", "about:")):
            continue
        # Skip MIME types / Content-Type headers (e.g. application/json, text/x-kotlin, text/javascript, text/x-c)
        if re.match(r"^(?:text|application|image|audio|video|font|multipart|model)/", val, re.IGNORECASE):
            continue
        if re.search(r"text/x-[a-z0-9_\-]+", val, re.IGNORECASE):
            continue
        if val.lower().startswith(("mode/", "ace/", "monaco/", "webpack/", "babel/")):
            continue
        # Skip static media / style assets
        if re.search(r"\.(?:css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico|map|webp|avif|mp4|mp3|ogg|wav)$", val, re.IGNORECASE):
            continue

        # Handle protocol-relative URLs
        if val.startswith("//"):
            resolved = "https:" + val
        # Normalize relative path
        elif val.startswith(("/", "./", "../")):
            resolved = urllib.parse.urljoin(base_url, val)
        elif val.startswith(("http://", "https://")):
            resolved = val
        elif "/" in val or val.startswith("?"):
            resolved = urllib.parse.urljoin(base_url, "/" + val)
        else:
            resolved = urllib.parse.urljoin(base_url, "/" + val)

        if resolved in seen:
            continue

        # Skip if resolved URL is still invalid or just a mime type
        parsed = urllib.parse.urlparse(resolved)
        if not parsed.netloc or not parsed.scheme:
            continue
        path_lower = parsed.path.lower()
        if any(path_lower.startswith(prefix) for prefix in ("/text/", "/application/", "/image/", "/video/")):
            continue
        if re.search(r"text/x-[a-z0-9_\-]+", path_lower):
            continue

        # Scope check: if scope provided, prioritize in-scope endpoints
        in_scope = True
        if scope_domain:
            parsed = urllib.parse.urlparse(resolved)
            if parsed.netloc and scope_domain.lower() not in parsed.netloc.lower():
                in_scope = False

        seen.add(resolved)
        endpoints.append({
            "raw": val,
            "url": resolved,
            "in_scope": in_scope,
        })

    return endpoints


def extract_secrets_from_text(content, script_origin="inline"):
    secrets = []
    seen = set()
    for secret_type, pat in SECRET_PATTERNS:
        for m in pat.finditer(content):
            val = m.group(1) if m.groups() else m.group(0)
            if val in seen:
                continue
            seen.add(val)
            secrets.append({
                "type": secret_type,
                "value": val[:60] + "..." if len(val) > 60 else val,
                "origin_script": script_origin
            })
    return secrets


def run_discovery(target, scope=None, depth=1, timeout=10, max_scripts=25):
    if not target.startswith(("http://", "https://")):
        target_url = f"https://{target}"
    else:
        target_url = target

    parsed = urllib.parse.urlparse(target_url)
    scope_domain = scope or parsed.hostname

    html_content, _ = fetch_url(target_url, timeout=timeout)
    if not html_content:
        # Fallback to http if https fails
        if target_url.startswith("https://"):
            target_url = "http://" + target_url[8:]
            html_content, _ = fetch_url(target_url, timeout=timeout)

    all_scripts = []
    all_endpoints = []
    all_parameters = []
    all_secrets = []

    seen_params = set()
    seen_endpoints = set()

    if html_content:
        # 1. Parse HTML for script tags and inline scripts
        parser = ScriptTagParser()
        try:
            parser.feed(html_content)
        except Exception:
            pass

        # Also search endpoints & params in the main HTML itself
        html_params = extract_parameters_from_text(html_content, script_origin="index.html")
        for p in html_params:
            if p["name"] not in seen_params:
                seen_params.add(p["name"])
                all_parameters.append(p)

        html_endpoints = extract_endpoints_from_text(html_content, target_url, scope_domain)
        for ep in html_endpoints:
            if ep["url"] not in seen_endpoints:
                seen_endpoints.add(ep["url"])
                all_endpoints.append(ep)

        # 2. Collect script URLs
        resolved_scripts = []
        for src in parser.script_srcs:
            full_src = urllib.parse.urljoin(target_url, src)
            if full_src not in resolved_scripts:
                resolved_scripts.append(full_src)

        # 3. Analyze external JavaScript files
        for script_url in resolved_scripts[:max_scripts]:
            all_scripts.append(script_url)
            js_code, _ = fetch_url(script_url, timeout=timeout)
            if not js_code:
                continue

            # Extract endpoints from JS code
            js_endpoints = extract_endpoints_from_text(js_code, script_url, scope_domain)
            for ep in js_endpoints:
                if ep["url"] not in seen_endpoints:
                    seen_endpoints.add(ep["url"])
                    ep["source_script"] = script_url
                    all_endpoints.append(ep)

            # Extract parameters from JS code
            js_params = extract_parameters_from_text(js_code, script_origin=script_url)
            for p in js_params:
                if p["name"] not in seen_params:
                    seen_params.add(p["name"])
                    all_parameters.append(p)

            # Extract secrets from JS code
            js_secrets = extract_secrets_from_text(js_code, script_origin=script_url)
            all_secrets.extend(js_secrets)

        # 4. Analyze inline script blocks
        for i, inline_code in enumerate(parser.inline_scripts[:15]):
            origin = f"inline_script_{i+1}"
            inline_params = extract_parameters_from_text(inline_code, script_origin=origin)
            for p in inline_params:
                if p["name"] not in seen_params:
                    seen_params.add(p["name"])
                    all_parameters.append(p)

            inline_endpoints = extract_endpoints_from_text(inline_code, target_url, scope_domain)
            for ep in inline_endpoints:
                if ep["url"] not in seen_endpoints:
                    seen_endpoints.add(ep["url"])
                    all_endpoints.append(ep)

            inline_secrets = extract_secrets_from_text(inline_code, script_origin=origin)
            all_secrets.extend(inline_secrets)

    # Extract external domains discovered from external scripts and endpoints
    discovered_domains = set()
    for s_url in all_scripts:
        p = urllib.parse.urlparse(s_url)
        if p.netloc and scope_domain and scope_domain.lower() not in p.netloc.lower():
            discovered_domains.add(p.netloc.lower())
    for ep in all_endpoints:
        p = urllib.parse.urlparse(ep["url"])
        if p.netloc and scope_domain and scope_domain.lower() not in p.netloc.lower():
            discovered_domains.add(p.netloc.lower())

    return {
        "target": target_url,
        "scope": scope_domain,
        "scripts": all_scripts,
        "domains": sorted(list(discovered_domains)),
        "endpoints": all_endpoints,
        "parameters": all_parameters,
        "secrets": all_secrets,
        "stats": {
            "scriptsAnalyzed": len(all_scripts),
            "domainsFound": len(discovered_domains),
            "endpointsFound": len(all_endpoints),
            "parametersFound": len(all_parameters),
            "secretsFound": len(all_secrets),
        }
    }


def main():
    try:
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            print(json.dumps({"error": "No input provided over stdin"}))
            sys.exit(1)

        payload = json.loads(raw_input)
        target = payload.get("target") or payload.get("value") or ""
        scope = payload.get("scope") or None
        depth = payload.get("depth", 1)
        timeout = payload.get("timeout", 12)

        if not target:
            print(json.dumps({"error": "Target must be specified"}))
            sys.exit(1)

        result = run_discovery(target, scope=scope, depth=depth, timeout=timeout)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
