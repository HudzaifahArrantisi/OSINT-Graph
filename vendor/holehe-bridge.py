#!/usr/bin/env python3
# Holehe <-> NexusGraph Bridge
#
# Runs the Holehe Python OSINT engine (megadose/holehe, GPL-3.0) non-interactively
# to check email registration across 120+ web platforms and digital services.
#
# Protocol:
#   stdin : {"email": "...", "timeout": 10, "only_used": false}
#   stdout: one JSON object with structured findings and summary
#
# All third-party console prints are suppressed so stdout stays pure JSON.

import sys
import os
import json
import io
import re
import time
import contextlib
import trio
import httpx

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# Domain mapping for standard modules if domain field is omitted in raw output
KNOWN_DOMAINS = {
    'aboutme': 'about.me',
    'adobe': 'adobe.com',
    'amazon': 'amazon.com',
    'anydo': 'any.do',
    'archive': 'archive.org',
    'armurerieauxerre': 'armurerie-auxerre.com',
    'atlassian': 'atlassian.com',
    'babeshows': 'babeshows.co.uk',
    'badeggsonline': 'badeggsonline.com',
    'biosmods': 'bios-mods.com',
    'biotechnologyforums': 'biotechnologyforums.com',
    'bitmoji': 'bitmoji.com',
    'blablacar': 'blablacar.com',
    'blackworldforum': 'blackworldforum.com',
    'blip': 'blip.fm',
    'blitzortung': 'forum.blitzortung.org',
    'bluegrassrivals': 'bluegrassrivals.com',
    'bodybuilding': 'bodybuilding.com',
    'buymeacoffee': 'buymeacoffee.com',
    'cambridgemt': 'discussion.cambridge-mt.com',
    'caringbridge': 'caringbridge.org',
    'chinaphonearena': 'chinaphonearena.com',
    'clashfarmer': 'clashfarmer.com',
    'codecademy': 'codecademy.com',
    'codeigniter': 'forum.codeigniter.com',
    'codepen': 'codepen.io',
    'coroflot': 'coroflot.com',
    'cpaelites': 'cpaelites.com',
    'cpahero': 'cpahero.com',
    'cracked_to': 'cracked.to',
    'crevado': 'crevado.com',
    'deliveroo': 'deliveroo.com',
    'demonforums': 'demonforums.net',
    'devrant': 'devrant.com',
    'diigo': 'diigo.com',
    'discord': 'discord.com',
    'docker': 'docker.com',
    'dominosfr': 'dominos.fr',
    'ebay': 'ebay.com',
    'ello': 'ello.co',
    'envato': 'envato.com',
    'eventbrite': 'eventbrite.com',
    'evernote': 'evernote.com',
    'fanpop': 'fanpop.com',
    'firefox': 'firefox.com',
    'flickr': 'flickr.com',
    'freelancer': 'freelancer.com',
    'freiberg': 'drachenhort.user.stunet.tu-freiberg.de',
    'garmin': 'garmin.com',
    'github': 'github.com',
    'google': 'google.com',
    'gravatar': 'gravatar.com',
    'imgur': 'imgur.com',
    'instagram': 'instagram.com',
    'issuu': 'issuu.com',
    'koditv': 'forum.kodi.tv',
    'komoot': 'komoot.com',
    'laposte': 'laposte.fr',
    'lastfm': 'last.fm',
    'lastpass': 'lastpass.com',
    'mail_ru': 'mail.ru',
    'mybb': 'community.mybb.com',
    'myspace': 'myspace.com',
    'nattyornot': 'nattyornotforum.nattyornot.com',
    'naturabuy': 'naturabuy.fr',
    'ndemiccreations': 'forum.ndemiccreations.com',
    'nextpvr': 'forums.nextpvr.com',
    'nike': 'nike.com',
    'odnoklassniki': 'ok.ru',
    'office365': 'office365.com',
    'onlinesequencer': 'onlinesequencer.net',
    'parler': 'parler.com',
    'patreon': 'patreon.com',
    'pinterest': 'pinterest.com',
    'plurk': 'plurk.com',
    'pornhub': 'pornhub.com',
    'protonmail': 'protonmail.ch',
    'quora': 'quora.com',
    'rambler': 'rambler.ru',
    'redtube': 'redtube.com',
    'replit': 'replit.com',
    'rocketreach': 'rocketreach.co',
    'samsung': 'samsung.com',
    'seoclerks': 'seoclerks.com',
    'sevencups': '7cups.com',
    'smule': 'smule.com',
    'snapchat': 'snapchat.com',
    'soundcloud': 'soundcloud.com',
    'sporcle': 'sporcle.com',
    'spotify': 'spotify.com',
    'strava': 'strava.com',
    'taringa': 'taringa.net',
    'teamtreehouse': 'teamtreehouse.com',
    'tellonym': 'tellonym.me',
    'thecardboard': 'thecardboard.org',
    'therianguide': 'forums.therian-guide.com',
    'thevapingforum': 'thevapingforum.com',
    'tumblr': 'tumblr.com',
    'tunefind': 'tunefind.com',
    'twitter': 'twitter.com',
    'venmo': 'venmo.com',
    'vivino': 'vivino.com',
    'voxmedia': 'voxmedia.com',
    'vrbo': 'vrbo.com',
    'vsco': 'vsco.co',
    'wattpad': 'wattpad.com',
    'wordpress': 'wordpress.com',
    'xing': 'xing.com',
    'xnxx': 'xnxx.com',
    'xvideos': 'xvideos.com',
    'yahoo': 'yahoo.com',
    'hubspot': 'hubspot.com',
    'pipedrive': 'pipedrive.com',
    'insightly': 'insightly.com',
    'nutshell': 'nutshell.com',
    'zoho': 'zoho.com',
    'axonaut': 'axonaut.com',
    'amocrm': 'amocrm.com',
    'nimble': 'nimble.com',
    'nocrm': 'nocrm.io',
    'teamleader': 'teamleader.eu'
}

async def run_holehe_audit(email: str, timeout: int = 10, only_used: bool = False):
    try:
        from holehe.core import import_submodules, get_functions, launch_module, is_email
    except ImportError as e:
        return {"error": f"Failed to import Holehe library: {e}", "email": email, "findings": []}

    email_clean = email.strip().lower()
    if not EMAIL_REGEX.match(email_clean) or not is_email(email_clean):
        return {"error": f"Invalid email format: {email}", "email": email, "findings": []}

    modules = import_submodules("holehe.modules")
    websites = get_functions(modules)

    start_time = time.time()
    client = httpx.AsyncClient(timeout=timeout)
    raw_out = []

    # Run modules asynchronously inside Trio nursery while capturing stdout/stderr
    async with trio.open_nursery() as nursery:
        for website in websites:
            nursery.start_soon(launch_module, website, email_clean, client, raw_out)

    await client.aclose()

    sanitized_findings = []
    registered_accounts = []
    site_errors = []

    for item in raw_out:
        name = str(item.get("name") or "unknown").strip().lower()
        domain = item.get("domain") or KNOWN_DOMAINS.get(name) or f"{name}.com"
        exists = bool(item.get("exists"))
        rate_limited = bool(item.get("rateLimit"))
        email_recovery = item.get("emailrecovery")
        phone_number = item.get("phoneNumber")
        others = item.get("others")

        finding_entry = {
            "name": name,
            "domain": domain,
            "exists": exists,
            "rateLimit": rate_limited,
            "emailrecovery": email_recovery if email_recovery else None,
            "phoneNumber": phone_number if phone_number else None,
            "others": others if others else None,
        }

        if rate_limited and not exists:
            site_errors.append(f"{name}: rate limited by upstream platform")

        if exists:
            registered_accounts.append(finding_entry)

        if not only_used or exists:
            sanitized_findings.append(finding_entry)

    sanitized_findings.sort(key=lambda x: x["name"])
    registered_accounts.sort(key=lambda x: x["name"])

    return {
        "email": email_clean,
        "totalChecked": len(websites),
        "totalFound": len(registered_accounts),
        "totalRateLimited": sum(1 for item in raw_out if item.get("rateLimit")),
        "durationSeconds": round(time.time() - start_time, 2),
        "findings": sanitized_findings,
        "registered": registered_accounts,
        "errors": site_errors,
    }

def main():
    try:
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            print(json.dumps({"error": "Empty input received over stdin"}))
            return

        payload = json.loads(raw_input)
        email = str(payload.get("email") or payload.get("value") or "").strip()
        timeout = int(payload.get("timeout") or 10)
        only_used = bool(payload.get("only_used", False))

        if not email:
            print(json.dumps({"error": "Target email is required"}))
            return

        # Suppress any third-party noisy print statements during module run
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            result = trio.run(run_holehe_audit, email, timeout, only_used)

        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()
    except Exception as exc:
        sys.stdout.write(json.dumps({"error": f"Bridge internal exception: {exc}"}) + "\n")
        sys.stdout.flush()

if __name__ == "__main__":
    main()
