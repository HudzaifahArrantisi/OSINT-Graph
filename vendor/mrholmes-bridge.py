#!/usr/bin/env python3
# Mr.Holmes <-> NexusGraph Bridge
#
# Runs the ORIGINAL Mr.Holmes Python OSINT engine (Lucksi/Mr.Holmes, GPL-3.0)
# non-interactively, one mode per Mr.Holmes main-menu category:
#
#   (1)  SOCIAL-ACCOUNT-OSINT -> mode "username"
#   (10) PEOPLE-OSINT         -> mode "people"   (name-based social enumeration)
#   (8)  E-MAIL               -> mode "email"
#   (2)  PHONE-NUMBER-OSINT   -> mode "phone"
#   (3)  DOMAIN/IP-OSINT      -> mode "domain"
#   (9)  DORKS-GENERATOR      -> implicit in email/phone/domain modes
#
# Protocol:
#   stdin : {"mode": "...", "value": "..."}
#   stdout: one JSON object (mode-specific, see run_* functions)
#
# All Mr.Holmes console noise is redirected so stdout stays clean.

import sys
import os
import json
import io
import re
import contextlib

VENDOR_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Mr.Holmes")
os.chdir(VENDOR_ROOT)
sys.path.insert(0, VENDOR_ROOT)

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
DOMAIN_REGEX = re.compile(r"^[A-Za-z0-9._-]{3,100}$")
USERNAME_REGEX = re.compile(r"^[A-Za-z0-9._-]{2,50}$")
PHONE_REGEX = re.compile(r"^\+?[0-9][0-9\s()-]{5,20}$")


def ensure_configuration():
    cfg_dir = os.path.join(VENDOR_ROOT, "Configuration")
    cfg = os.path.join(cfg_dir, "Configuration.ini")
    if not os.path.isfile(cfg):
        os.makedirs(cfg_dir, exist_ok=True)
        with open(cfg, "w", encoding="utf-8") as f:
            f.write(
                "[Settings]\n"
                "language = english\n"
                "Mode = Dark\n"
                "Theme = Dark\n"
                "useragent_List = Useragents/Useragent.txt\n"
            )


def ensure_runtime_files():
    ua = os.path.join(VENDOR_ROOT, "Useragents", "Useragent.txt")
    os.makedirs(os.path.dirname(ua), exist_ok=True)
    if not os.path.isfile(ua):
        with open(ua, "w", encoding="utf-8") as f:
            f.write("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")


def neutralize_input():
    import builtins

    builtins.input = lambda prompt="": "0"


def temp_report(subdir, name):
    d = os.path.join(VENDOR_ROOT, "Temp", "Bridge", subdir)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, name)
    if os.path.isfile(path):
        os.remove(path)
    open(path, "w").close()
    return path


# ─────────────────────────────────────────────────────────────────────
# Mode (1)/(10): SOCIAL-ACCOUNT-OSINT / PEOPLE-OSINT
# ─────────────────────────────────────────────────────────────────────
def run_username(value, subject="USERNAME"):
    from Core.Support import Requests_Search

    sites_file = os.path.join(VENDOR_ROOT, "Site_lists", "Username", "site_list.json")
    with open(sites_file, encoding="utf-8") as f:
        data = json.load(f)

    report_dir = os.path.join(VENDOR_ROOT, "GUI", "Reports", "Usernames", value)
    os.makedirs(report_dir, exist_ok=True)
    report = os.path.join(report_dir, value + ".txt")
    json_file = os.path.join(report_dir, value + ".json")
    json_file2 = os.path.join(report_dir, "Name.json")

    found = []
    errors = []
    successfull = []
    successfullName = []
    Tags = []
    MostTags = []
    ScraperSites = []

    for sites in data:
        for key, site in sites.items():
            name = site.get("name", key)
            error = site.get("Error")
            tag = site.get("Tag", []) or []
            exception_chars = site.get("exception", [])
            if isinstance(exception_chars, str):
                exception_chars = [exception_chars]
            invalid = any(c and c.strip() and c in value for c in exception_chars)
            if invalid or not site.get("user") or not site.get("user2"):
                continue
            site1 = site["user"].replace("{}", value)
            site2 = site["user2"].replace("{}", value)

            before = len(successfull)
            try:
                Requests_Search.Search.search(
                    error, report, site1, site2, None, sites, key, value,
                    subject, successfull, name, successfullName,
                    site.get("Scrapable", "False"), ScraperSites, False,
                    site.get("main", ""), json_file, json_file2, tag, Tags, MostTags,
                )
            except Exception as e:  # noqa: BLE001
                errors.append("{}: {}".format(name, e))
                continue
            if len(successfull) > before:
                found.append({"name": name, "url": site1, "tags": tag})

    return {
        "mode": "username",
        "value": value,
        "found": found,
        "errors": errors,
        "totalChecked": sum(len(s) for s in data),
    }


def run_people(value):
    """Mr.Holmes People-OSINT replaces spaces with underscores then runs the
    same social enumeration across its platform list."""
    normalized = value.strip().replace(" ", "_")
    result = run_username(normalized, subject="PERSON")
    result["mode"] = "people"
    return result


# ─────────────────────────────────────────────────────────────────────
# Mode (8): E-MAIL — validator + account lookups + dorks
# ─────────────────────────────────────────────────────────────────────
def extract_dorks(report_path):
    dorks = []
    seen = set()
    with open(report_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            # The original engine writes template lines as "| https://..."
            line = line.strip().lstrip("|").strip()
            if line.startswith("http") and line not in seen:
                seen.add(line)
                dorks.append(line)
    return dorks


def generate_dorks(value, lists, report):
    """Use the original Dorks.Search.dork engine over the given template lists."""
    from Core.Support import Dorks

    for template_list, engine in lists:
        list_path = os.path.join(VENDOR_ROOT, template_list)
        if os.path.isfile(list_path):
            try:
                Dorks.Search.dork(value, report, list_path, engine)
            except Exception:  # noqa: BLE001
                pass
    return extract_dorks(report)


def run_email(value):
    from Core.Support.Mail import Mail_Validator
    from Core.Support.Mail import Lookup

    report_dir = os.path.join(VENDOR_ROOT, "GUI", "Reports", "E-Mail", value)
    os.makedirs(report_dir, exist_ok=True)
    report = os.path.join(report_dir, value + ".txt")
    lookup_report = temp_report("Email", "lookup.txt")

    valid = bool(Mail_Validator.Validator.Mail(value, report))

    providers = []
    github_users = []

    if valid:
        with contextlib.redirect_stdout(io.StringIO()):
            try:
                Lookup.List.Gmail(lookup_report, value, "GMAIL/G-SUITE")
            except Exception as e:  # noqa: BLE001
                providers.append({"name": "GMAIL/G-SUITE", "linked": None, "error": str(e)})
            try:
                Lookup.List.Twitter(lookup_report, value, "TWITTER")
            except Exception as e:  # noqa: BLE001
                providers.append({"name": "TWITTER", "linked": None, "error": str(e)})
            try:
                Lookup.List.Spotify(lookup_report, value, "SPOTIFY")
            except Exception as e:  # noqa: BLE001
                providers.append({"name": "SPOTIFY", "linked": None, "error": str(e)})
            try:
                Lookup.List.Github(lookup_report, value, "GITHUB")
            except Exception as e:  # noqa: BLE001
                providers.append({"name": "GITHUB", "linked": None, "error": str(e)})
            try:
                Lookup.List.Gravatar(lookup_report, value, "GRAVATAR")
            except Exception as e:  # noqa: BLE001
                providers.append({"name": "GRAVATAR", "linked": None, "error": str(e)})
            try:
                Lookup.List.Imgur(lookup_report, value, "IMGUR")
            except Exception as e:  # noqa: BLE001
                providers.append({"name": "IMGUR", "linked": None, "error": str(e)})

        # Parse the original engine's verdict lines
        known = ["GMAIL/G-SUITE", "TWITTER", "SPOTIFY", "GITHUB", "GRAVATAR", "IMGUR"]
        parsed = {}
        with open(lookup_report, encoding="utf-8", errors="replace") as f:
            content = f.read()
        for line in content.splitlines():
            line = line.strip()
            m = re.search(r"IS LINKED TO (\d+) ([A-Z/-]+) ACCOUNTS?", line)
            if m:
                parsed[m.group(2)] = True
                continue
            for prov in known:
                if ("IS LINKED TO A {} ACCOUNT".format(prov)) in line:
                    parsed[prov] = True
                elif ("IS NOT LINKED TO A {} ACCOUNT".format(prov)) in line:
                    parsed[prov] = False

        existing = {p["name"] for p in providers}
        for prov in known:
            if prov in parsed and not any(p["name"] == prov for p in providers):
                providers.append({"name": prov, "linked": parsed[prov]})

        # GitHub search results include usernames/profile links
        current_user = None
        for line in content.splitlines():
            line = line.strip()
            m = re.match(r"USER FOUND:\s*(\S+)", line)
            if m:
                current_user = m.group(1)
                continue
            if current_user and line.startswith("LINK:"):
                url = line.replace("LINK:", "").strip()
                github_users.append({"username": current_user, "url": url})
                current_user = None

    dork_report = temp_report("Email", "dorks.txt")
    dorks = generate_dorks(
        value,
        [("Site_lists/E-Mail/Google_dorks.txt", "GOOGLE"), ("Site_lists/E-Mail/Yandex_dorks.txt", "YANDEX")],
        dork_report,
    )

    return {
        "mode": "email",
        "value": value,
        "valid": valid,
        "providers": providers,
        "githubUsers": github_users,
        "dorks": dorks,
    }


# ─────────────────────────────────────────────────────────────────────
# Mode (2): PHONE-NUMBER-OSINT — carrier, metadata, geolocation + lookups
# ─────────────────────────────────────────────────────────────────────
def run_phone(value):
    phone_meta = {
        "valid": None,
        "possible": None,
        "carrier": None,
        "country": None,
        "countryCode": None,
        "countryPrefix": None,
        "area": None,
        "timezones": [],
        "locations": [],
        "formats": {},
        "lookups": [],
    }

    try:
        import phonenumbers
        from phonenumbers import carrier as p_carrier
        from phonenumbers import geocoder as p_geocoder
        from phonenumbers import timezone as p_timezone
        import urllib.request
        import urllib.parse

        raw_val = value.strip()
        digits = re.sub(r"[^\d]", "", raw_val)
        if raw_val.startswith("+"):
            formatted_val = raw_val
        elif digits.startswith("0") and len(digits) >= 10:
            formatted_val = "+62" + digits[1:]
        elif digits.startswith("62") and len(digits) >= 10:
            formatted_val = "+" + digits
        else:
            formatted_val = "+" + digits

        parsed = phonenumbers.parse(formatted_val, None)

        phone_meta["valid"] = phonenumbers.is_valid_number(parsed)
        phone_meta["possible"] = phonenumbers.is_possible_number(parsed)

        code_num = parsed.country_code
        number_code = f"+{code_num}"
        phone_meta["countryPrefix"] = number_code
        phone_meta["countryCode"] = phonenumbers.region_code_for_country_code(code_num)
        phone_meta["country"] = p_geocoder.country_name_for_number(parsed, "en") or None
        location_desc = p_geocoder.description_for_number(parsed, "en") or None
        phone_meta["area"] = location_desc
        phone_meta["carrier"] = p_carrier.name_for_number(parsed, "en") or None
        phone_meta["timezones"] = list(p_timezone.time_zones_for_number(parsed))

        intl_str = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.INTERNATIONAL)
        e164_str = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        local_num = e164_str.replace(number_code, "").replace("+", "")

        # Format calculations as done in Mr.Holmes Numbers.py
        fmt2 = str(intl_str).replace(number_code, "").replace(" ", "-")
        fmt3 = fmt2.replace("-", "", 1) if fmt2.startswith("-") else fmt2
        fmt4 = str(intl_str).replace(number_code, "0").replace(" ", "")
        fmt1 = "({}){}".format(number_code, fmt3)
        fmt5 = fmt4.replace("0", "", 1) if fmt4.startswith("0") else fmt4

        phone_meta["formats"] = {
            "e164": e164_str,
            "localNumber": local_num,
            "international": intl_str,
            "rfc3966": fmt1,
            "local": fmt3,
            "local2": fmt4,
            "local3": fmt5,
            "national": phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.NATIONAL),
        }

        def fetch_geo(query_str, loc_type):
            if not query_str or query_str in ("Unknown", "None", ""):
                return None
            try:
                clean_q = query_str.strip()
                if "/" in clean_q:
                    clean_q = clean_q.split("/")[-1]
                encoded_q = urllib.parse.quote(clean_q)
                url = f"https://nominatim.openstreetmap.org/search?q={encoded_q}&format=json&limit=1"
                req = urllib.request.Request(
                    url,
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
                )
                with urllib.request.urlopen(req, timeout=6) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if data and len(data) > 0:
                        lat = float(data[0].get("lat"))
                        lon = float(data[0].get("lon"))
                        display_name = data[0].get("display_name", clean_q)
                        return {
                            "type": loc_type,
                            "query": query_str,
                            "lat": lat,
                            "lon": lon,
                            "displayName": display_name,
                        }
            except Exception:
                pass
            return None

        # 1. Geocode Area/Zone (e.g. Indonesia or City)
        if location_desc:
            area_query = location_desc.split(" ", 1)[1] if " " in location_desc else location_desc
            area_geo = fetch_geo(area_query, "area")
            if area_geo:
                phone_meta["locations"].append(area_geo)

        # 2. Geocode Timezones (e.g. Asia/Jakarta -> Jakarta)
        for tz in phone_meta["timezones"][:2]:
            tz_city = tz.split("/")[-1]
            tz_geo = fetch_geo(tz_city, "timezone")
            if tz_geo:
                if not any(abs(l["lat"] - tz_geo["lat"]) < 0.001 and abs(l["lon"] - tz_geo["lon"]) < 0.001 for l in phone_meta["locations"]):
                    phone_meta["locations"].append(tz_geo)

        # 3. Geocode Country fallback if no locations yet
        if not phone_meta["locations"] and phone_meta["country"]:
            country_geo = fetch_geo(phone_meta["country"], "country")
            if country_geo:
                phone_meta["locations"].append(country_geo)

        # 4. Search Phone Lookup Sites (Mr.Holmes Site_lists/Phone/Lookup)
        country_code = phone_meta["countryCode"] or "UNDEFINED"
        lookup_map = {
            "US": "USA_phone.json",
            "IT": "ITA_phone.json",
            "DE": "DEU_phone.json",
            "FR": "FRA_phone.json",
            "RO": "ROU_phone.json",
            "CH": "SWIS_phone.json",
        }
        lookup_filename = lookup_map.get(country_code, "Undefined.json")
        lookup_path = os.path.join(VENDOR_ROOT, "Site_lists", "Phone", "Lookup", lookup_filename)
        if os.path.isfile(lookup_path):
            with open(lookup_path, encoding="utf-8") as lf:
                lookup_data = json.load(lf)
            clean_digits = raw_val.replace("+", "").replace(" ", "").replace("-", "")
            for entry in lookup_data:
                for site_key, site_info in entry.items():
                    s_name = site_info.get("name", site_key)
                    s_url_tmpl = site_info.get("url", "")
                    if s_url_tmpl:
                        s_url = s_url_tmpl.replace("{}", clean_digits)
                        phone_meta["lookups"].append({
                            "name": s_name,
                            "url": s_url,
                            "tags": site_info.get("Tag", ["Phone-Lookup"]),
                        })

    except Exception as e:
        phone_meta["error"] = str(e)

    dork_report = temp_report("Phone", "dorks.txt")
    dorks = generate_dorks(
        value,
        [
            ("Site_lists/Phone/Google_dorks.txt", "GOOGLE"),
            ("Site_lists/Phone/Yandex_dorks.txt", "YANDEX"),
            ("Site_lists/Phone/Fingerprints.txt", "GOOGLE"),
            ("Site_lists/Phone/Yandex_Fingerprints.txt", "YANDEX"),
        ],
        dork_report,
    )
    return {
        "mode": "phone",
        "value": value,
        "phoneMetadata": phone_meta,
        "dorks": dorks,
    }


# ─────────────────────────────────────────────────────────────────────
# Mode (3): DOMAIN/IP-OSINT — robots.txt + website dorks
# ─────────────────────────────────────────────────────────────────────
def run_domain(value):
    import requests as requests_lib

    domain = value.strip().replace("^(https?://)", "")
    domain = re.sub(r"^https?://", "", domain).split("/")[0]

    robots_present = None
    disallow_rules = []
    try:
        resp = requests_lib.get(
            "https://{}/robots.txt".format(domain),
            timeout=10,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        robots_present = resp.status_code == 200
        if robots_present:
            for line in resp.text.splitlines():
                m = re.match(r"\s*disallow:\s*(\S*)", line, re.IGNORECASE)
                if m:
                    disallow_rules.append(m.group(1))
            disallow_rules = sorted(set(disallow_rules))[:100]
    except Exception as e:  # noqa: BLE001
        robots_present = None
        robots_error = str(e)
    else:
        robots_error = None

    dork_report = temp_report("Domain", "dorks.txt")
    dorks = generate_dorks(
        domain,
        [
            ("Site_lists/Websites/Google_dorks.txt", "GOOGLE"),
            ("Site_lists/Websites/Yandex_dorks.txt", "YANDEX"),
        ],
        dork_report,
    )

    return {
        "mode": "domain",
        "value": domain,
        "robots": {
            "present": robots_present,
            "disallow": disallow_rules,
            "error": robots_error,
        },
        "dorks": dorks,
    }


MODES = {
    "username": lambda v: run_username(v),
    "people": run_people,
    "email": run_email,
    "phone": run_phone,
    "domain": run_domain,
}

MODE_VALIDATORS = {
    "username": lambda v: bool(USERNAME_REGEX.match(v)),
    "people": lambda v: 2 <= len(v) <= 80 and all(c.isalnum() or c in " ._-'" for c in v),
    "email": lambda v: bool(EMAIL_REGEX.match(v)),
    "phone": lambda v: bool(PHONE_REGEX.match(v)),
    "domain": lambda v: bool(DOMAIN_REGEX.match(v)),
}


def main():
    raw = sys.stdin.read()
    try:
        task = json.loads(raw)
        mode = task.get("mode", "")
        value = str(task.get("value", "")).strip()
        if mode not in MODES:
            raise ValueError("Unsupported mode: {}".format(mode))
        if not value or len(value) > 120:
            raise ValueError("Invalid target value")
        if not MODE_VALIDATORS[mode](value):
            raise ValueError("Value failed validation for mode: {}".format(mode))

        ensure_configuration()
        ensure_runtime_files()
        neutralize_input()

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            result = MODES[mode](value)

        sys.stdout.write(json.dumps(result))
        sys.stdout.flush()
    except Exception as e:  # noqa: BLE001
        sys.stdout.write(json.dumps({"error": str(e)}))
        sys.stdout.flush()
        sys.exit(1)


if __name__ == "__main__":
    main()
