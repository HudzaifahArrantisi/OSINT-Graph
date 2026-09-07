/**
 * Corporate HQ Geolocation & Google Maps Discovery Collector
 *
 * Discovers physical corporate headquarters, office addresses, store locations,
 * embedded Google Maps links, and OpenStreetMap coordinates for DOMAIN or URL targets.
 *
 * Steps:
 * 1. Crawl homepage & contact pages (/contact, /about, /tentang-kami, /hubungi-kami) via safeFetch (SSRF protected)
 * 2. Extract Schema.org structured data (Organization, LocalBusiness, PostalAddress, geoCoordinates)
 * 3. Extract embedded Google Maps URLs / iframe src (maps.google.com, goo.gl/maps, maps.app.goo.gl)
 * 4. Extract physical postal address text patterns
 * 5. If addresses found without exact coordinates, geocode via OpenStreetMap Nominatim API via safeFetch
 * 6. Produce LOCATION & ADDRESS entities linked to the target with direct Google Maps URLs
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { safeFetch, readResponseWithLimit, validateUrl } from '../security/ssrf.js';
import { normalizeDomain } from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 512 * 1024; // 512 KB per page

interface PhysicalLocationFinding {
  addressText?: string;
  cityName?: string;
  regionName?: string;
  countryName?: string;
  countryCode?: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
  googleMapsUrl?: string;
  sourceUrl: string;
  method: 'schema_jsonld' | 'google_maps_link' | 'html_contact' | 'nominatim_geocoded';
}

/**
 * Extract Google Maps links and embed queries from HTML body
 */
export function extractGoogleMapsLinks(html: string): Array<{ url: string; lat?: number; lng?: number; query?: string }> {
  const results: Array<{ url: string; lat?: number; lng?: number; query?: string }> = [];

  // Match Google Maps links in href or src (e.g. iframe)
  const mapRegex = /(?:https?:)?\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)[^\s"'<>]+/gi;
  const matches = html.match(mapRegex) || [];

  for (const rawUrl of matches.slice(0, 10)) {
    let cleanUrl = rawUrl.replace(/&amp;/g, '&');
    if (cleanUrl.startsWith('//')) cleanUrl = `https:${cleanUrl}`;

    let lat: number | undefined;
    let lng: number | undefined;
    let query: string | undefined;

    // Pattern 1: @lat,lng e.g. /@ -6.2255,106.8095,17z
    const coordMatch = cleanUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      lat = parseFloat(coordMatch[1]);
      lng = parseFloat(coordMatch[2]);
    }

    // Pattern 2: ?q=lat,lng or ?q=Address or query=lat,lng
    const qMatch = cleanUrl.match(/[?&](?:q|query|ll|sll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) {
      lat = parseFloat(qMatch[1]);
      lng = parseFloat(qMatch[2]);
    } else {
      const textQMatch = cleanUrl.match(/[?&](?:q|query)=([^&]+)/);
      if (textQMatch) {
        try {
          query = decodeURIComponent(textQMatch[1]).replace(/\+/g, ' ');
        } catch {}
      }
    }

    results.push({ url: cleanUrl, lat, lng, query });
  }

  return results;
}

/**
 * Parse Schema.org JSON-LD scripts for Organization/LocalBusiness address and coordinates
 */
export function extractSchemaOrgLocations(html: string, pageUrl: string): PhysicalLocationFinding[] {
  const findings: PhysicalLocationFinding[] = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;

        // Check for direct address or inside location/department/store
        const candidateObjects = [item, item.address, item.location, item.parentOrganization].filter(Boolean);

        for (const candidate of candidateObjects) {
          const addr = candidate.address || (candidate['@type'] === 'PostalAddress' ? candidate : null);
          const geo = candidate.geo || (candidate['@type'] === 'GeoCoordinates' ? candidate : null);

          let addressText: string | undefined;
          let cityName: string | undefined;
          let regionName: string | undefined;
          let countryName: string | undefined;
          let postalCode: string | undefined;
          let lat: number | undefined;
          let lng: number | undefined;

          if (addr && typeof addr === 'object') {
            const street = addr.streetAddress || '';
            const locality = addr.addressLocality || '';
            const region = addr.addressRegion || '';
            const country = addr.addressCountry || '';
            postalCode = addr.postalCode ? String(addr.postalCode) : undefined;

            cityName = locality || undefined;
            regionName = region || undefined;
            countryName = typeof country === 'string' ? country : country?.name;

            const parts = [street, locality, region, postalCode, countryName].filter(Boolean);
            if (parts.length > 0) {
              addressText = parts.join(', ');
            }
          } else if (typeof addr === 'string') {
            addressText = addr;
          }

          if (geo && typeof geo === 'object') {
            const parsedLat = parseFloat(geo.latitude);
            const parsedLng = parseFloat(geo.longitude);
            if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
              lat = parsedLat;
              lng = parsedLng;
            }
          }

          if (addressText || (lat !== undefined && lng !== undefined)) {
            findings.push({
              addressText,
              cityName,
              regionName,
              countryName,
              postalCode,
              lat,
              lng,
              sourceUrl: pageUrl,
              method: 'schema_jsonld',
            });
          }
        }
      }
    } catch {
      // Ignore invalid JSON-LD block
    }
  }

  return findings;
}

/**
 * Heuristic regex to extract physical address from contact page HTML
 */
export function extractContactAddressText(html: string): string[] {
  const addresses: string[] = [];

  // Remove scripts and style tags to avoid false matches
  const cleanHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  // Pattern A: Indonesian address pattern (Jl., Jalan, Gedung, Menara, Lantai, Kelurahan, Kecamatan, Kota)
  const indoPattern = /(?:Jl\.|Jalan|Gedung|Menara|Wisma|Komplek|Ruko)[^.,\n]{5,80}(?:,\s*[^.,\n]{3,40}){1,4}(?:,\s*(?:Jakarta|Surabaya|Bandung|Medan|Semarang|Tangerang|Bekasi|Depok|Bogor|Yogyakarta|Bali)[^.,\n]{0,30})?(?:,\s*\d{5})?/gi;
  const indoMatches = cleanHtml.match(indoPattern) || [];
  for (const m of indoMatches.slice(0, 3)) {
    const trimmed = m.trim();
    if (trimmed.length >= 15 && trimmed.length <= 160) {
      addresses.push(trimmed);
    }
  }

  // Pattern B: International postal address pattern (e.g. 123 Main St, Suite 400, City, ST 12345)
  const intlPattern = /\b\d{1,5}\s+[A-Za-z0-9\s.,]{4,50}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Way|Lane|Building|Suite|Floor)\b[A-Za-z0-9\s.,]{0,60}(?:,\s*[A-Z]{2}\s+\d{5}|\b[A-Z]{1,2}\d{1,2}\s*\d[A-Z]{2}\b)/gi;
  const intlMatches = cleanHtml.match(intlPattern) || [];
  for (const m of intlMatches.slice(0, 3)) {
    const trimmed = m.trim();
    if (trimmed.length >= 15 && trimmed.length <= 160) {
      addresses.push(trimmed);
    }
  }

  return [...new Set(addresses)];
}

/**
 * Geocode address text to coordinates using OpenStreetMap Nominatim via SSRF safeFetch
 */
async function geocodeViaNominatim(
  query: string,
  requestId?: string,
  signal?: AbortSignal
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  try {
    const encoded = encodeURIComponent(query.slice(0, 100));
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;

    const response = await safeFetch(nominatimUrl, {
      method: 'GET',
      signal,
      requestId,
      timeoutMs: 7_000,
      maxResponseBytes: 128 * 1024,
      headers: {
        'User-Agent': 'NexusGraph-OSINT/1.0 (Corporate Location Research; https://github.com/nexusgraph)',
        Accept: 'application/json',
      },
    });

    if (response.status === 200) {
      const text = await readResponseWithLimit(response, 128 * 1024);
      const data = JSON.parse(text);
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        if (!isNaN(lat) && !isNaN(lng)) {
          return { lat, lng, displayName: item.display_name };
        }
      }
    }
  } catch (err) {
    logger.debug('Nominatim geocoding skipped or failed', { error: err instanceof Error ? err.message : String(err) });
  }
  return null;
}

export const companyGeoCollector: Collector = {
  name: 'company-geo',

  supports(inputType: string): boolean {
    return (
      inputType === 'DOMAIN' ||
      inputType === 'URL' ||
      inputType === 'WEBSITE' ||
      inputType === 'ORGANIZATION'
    );
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    let domain = '';
    let startUrl = '';

    if (input.includes('://')) {
      const validation = validateUrl(input);
      if (!validation.safe) {
        warnings.push(`URL rejected by SSRF guard: ${validation.reason}`);
        return { source: 'company-geo', collectedAt, entities, relationships, evidence, warnings };
      }
      try {
        const u = new URL(input);
        domain = normalizeDomain(u.hostname);
        startUrl = `https://${domain}`;
      } catch {
        warnings.push(`Invalid target URL: "${input}"`);
        return { source: 'company-geo', collectedAt, entities, relationships, evidence, warnings };
      }
    } else {
      domain = normalizeDomain(input.replace(/^(?:https?:\/\/)?/i, '').split('/')[0]);
      startUrl = `https://${domain}`;
    }

    if (!domain || !domain.includes('.')) {
      warnings.push(`Invalid domain for company geo resolution: "${input}"`);
      return { source: 'company-geo', collectedAt, entities, relationships, evidence, warnings };
    }

    const timeoutSignal = AbortSignal.timeout(20_000);
    const signal = AbortSignal.any([ctx.signal, timeoutSignal]);

    logger.info('Company Geo HQ collector started', { requestId: ctx.requestId, domain, startUrl });

    // Candidate pages to probe for physical addresses and Google Maps
    const probePaths = [
      '/',
      '/contact',
      '/contact-us',
      '/hubungi-kami',
      '/tentang-kami',
      '/about',
      '/about-us',
      '/id/contact',
      '/id/tentang-kami',
    ];

    const findings: PhysicalLocationFinding[] = [];

    // Probe up to 4 responsive pages
    let probedCount = 0;
    for (const path of probePaths) {
      if (probedCount >= 4 || signal.aborted) break;

      const pageUrl = `${startUrl}${path}`;
      try {
        const response = await safeFetch(pageUrl, {
          method: 'GET',
          signal,
          requestId: ctx.requestId,
          timeoutMs: REQUEST_TIMEOUT_MS,
          maxResponseBytes: MAX_BODY_BYTES,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
        });

        if (response.status !== 200) continue;
        probedCount++;

        const body = await readResponseWithLimit(response, MAX_BODY_BYTES);

        // 1. Schema.org JSON-LD Extraction
        const schemaFindings = extractSchemaOrgLocations(body, pageUrl);
        for (const sf of schemaFindings) {
          findings.push(sf);
        }

        // 2. Google Maps Links Extraction
        const mapLinks = extractGoogleMapsLinks(body);
        for (const ml of mapLinks) {
          findings.push({
            googleMapsUrl: ml.url,
            lat: ml.lat,
            lng: ml.lng,
            addressText: ml.query,
            sourceUrl: pageUrl,
            method: 'google_maps_link',
          });
        }

        // 3. Contact Text Extraction (if no schema found yet on this page)
        if (schemaFindings.length === 0) {
          const textAddrs = extractContactAddressText(body);
          for (const addr of textAddrs) {
            findings.push({
              addressText: addr,
              sourceUrl: pageUrl,
              method: 'html_contact',
            });
          }
        }

        // If we found solid findings with coordinates or Google Maps, break early
        if (findings.some((f) => f.lat !== undefined || f.googleMapsUrl)) {
          break;
        }
      } catch (err) {
        // Continue to next path
      }
    }

    // Deduplicate findings by address or maps URL
    const uniqueFindings: PhysicalLocationFinding[] = [];
    const seenKeys = new Set<string>();

    for (const f of findings) {
      const key = `${f.addressText || ''}:${f.lat || ''}:${f.lng || ''}:${f.googleMapsUrl || ''}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueFindings.push(f);
      }
    }

    // Process top findings (limit to 3 main locations: HQ, Main Office, etc.)
    for (const finding of uniqueFindings.slice(0, 3)) {
      let lat = finding.lat;
      let lng = finding.lng;
      let address = finding.addressText || '';

      // If coordinates missing but we have an address text, try Nominatim geocoding
      if ((lat === undefined || lng === undefined) && address) {
        const geocoded = await geocodeViaNominatim(address, ctx.requestId, signal);
        if (geocoded) {
          lat = geocoded.lat;
          lng = geocoded.lng;
          finding.method = 'nominatim_geocoded';
        }
      }

      // Generate canonical Google Maps search URL
      let gmapsUrl = finding.googleMapsUrl;
      if (!gmapsUrl && lat !== undefined && lng !== undefined) {
        gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      } else if (!gmapsUrl && address) {
        gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${domain} ${address}`)}`;
      }

      if (!address && lat === undefined && !gmapsUrl) continue;

      const displayAddress = address || (lat !== undefined && lng !== undefined ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : domain);
      const entityVal = `${domain}:${displayAddress.slice(0, 80)}`;
      const nodeTitle = `Kantor / Lokasi: ${displayAddress.slice(0, 65)}`;

      entities.push({
        type: 'LOCATION',
        value: entityVal,
        title: nodeTitle,
        confidence: finding.lat !== undefined ? 88 : 72,
        metadata: {
          isCompanyGeo: true,
          companyDomain: domain,
          address: displayAddress,
          fullAddress: address || undefined,
          lat,
          lng,
          latitude: lat,
          longitude: lng,
          googleMapsUrl: gmapsUrl,
          sourcePage: finding.sourceUrl,
          detectionMethod: finding.method,
          precision: lat !== undefined ? 'EXACT_COORDINATES' : 'STREET_ADDRESS',
          collector: 'company-geo',
          discoveredBy: 'company-geo',
          source: {
            url: finding.sourceUrl,
            collector: 'company-geo',
            transform: 'domain.company-geo-location',
            collectedAt,
          },
        },
      });

      // Connect to Domain seed with GEOLOCATED_IN relationship
      relationships.push({
        source_value: domain,
        source_type: 'DOMAIN',
        target_value: entityVal,
        target_type: 'LOCATION',
        relationship_type: 'GEOLOCATED_IN',
        confidence: finding.lat !== undefined ? 88 : 72,
        metadata: {
          reason: `Physical company office / headquarters location discovered on ${finding.sourceUrl}`,
          googleMapsUrl: gmapsUrl,
        },
      });

      evidence.push({
        source_url: finding.sourceUrl,
        source_type: 'COMPANY_GEO_RECON',
        title: `Physical Office / Google Maps for ${domain}`,
        extracted_value: `${displayAddress} ${gmapsUrl ? `(Maps: ${gmapsUrl})` : ''}`,
        confidence: finding.lat !== undefined ? 88 : 72,
        metadata: {
          lat,
          lng,
          gmapsUrl,
          method: finding.method,
        },
      });
    }

    if (entities.length === 0) {
      warnings.push(`No physical office address or Google Maps embedded links discovered on ${domain}`);
    }

    return {
      source: 'company-geo',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
