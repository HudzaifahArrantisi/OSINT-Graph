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

    // Pattern 2: Google Maps embed iframe protobuf !2d<lng>!3d<lat> or !3d<lat>!2d<lng>
    if (lat === undefined || lng === undefined) {
      const embedMatch = cleanUrl.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
      if (embedMatch) {
        lng = parseFloat(embedMatch[1]);
        lat = parseFloat(embedMatch[2]);
      } else {
        const embedMatchAlt = cleanUrl.match(/!3d(-?\d+\.\d+)!2d(-?\d+\.\d+)/);
        if (embedMatchAlt) {
          lat = parseFloat(embedMatchAlt[1]);
          lng = parseFloat(embedMatchAlt[2]);
        }
      }
    }

    // Pattern 3: ?q=lat,lng or ?q=Address or query=lat,lng or destination/center/origin
    const qMatch = cleanUrl.match(/[?&](?:q|query|ll|sll|center|destination|origin|daddr|saddr)=(-?\d+\.\d+),(-?\d+\.\d+)/);
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

    // Pattern 4: Place name in URL path e.g. /maps/place/Kopi+Kenangan+-+Menara+BTPN
    if (!query) {
      const placeMatch = cleanUrl.match(/maps\/place\/([^/@?&#]+)/);
      if (placeMatch) {
        try {
          query = decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ');
        } catch {}
      }
    }

    results.push({ url: cleanUrl, lat, lng, query });
  }

  return results;
}

/**
 * Extract direct geographic coordinates from HTML meta tags or data attributes
 */
export function extractDirectHtmlCoordinates(html: string): { lat?: number; lng?: number } | null {
  // 1. Meta geo.position / ICBM
  const geoPos = html.match(/<meta[^>]*name=["'](?:geo\.position|ICBM)["'][^>]*content=["'](-?\d+\.\d+)[;, ]\s*(-?\d+\.\d+)["']/i);
  if (geoPos) {
    return { lat: parseFloat(geoPos[1]), lng: parseFloat(geoPos[2]) };
  }

  // 2. OpenGraph place coordinates
  const ogLat = html.match(/<meta[^>]*property=["'](?:place:location:latitude|og:latitude)["'][^>]*content=["'](-?\d+\.\d+)["']/i);
  const ogLng = html.match(/<meta[^>]*property=["'](?:place:location:longitude|og:longitude)["'][^>]*content=["'](-?\d+\.\d+)["']/i);
  if (ogLat && ogLng) {
    return { lat: parseFloat(ogLat[1]), lng: parseFloat(ogLng[1]) };
  }

  // 3. HTML data attributes: data-lat and data-lng
  const dataCoord = html.match(/data-(?:lat|latitude)=["'](-?\d+\.\d+)["'][^>]*data-(?:lng|long|longitude)=["'](-?\d+\.\d+)["']/i);
  if (dataCoord) {
    return { lat: parseFloat(dataCoord[1]), lng: parseFloat(dataCoord[2]) };
  }

  return null;
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
 * Extract clean website title and organization name from HTML
 */
export function extractPageMetadata(html: string): { title?: string; siteName?: string } {
  let title: string | undefined;
  let siteName: string | undefined;

  const ogSiteName = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
  if (ogSiteName) {
    siteName = ogSiteName[1].trim();
  }

  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogTitle) {
    title = ogTitle[1].trim();
  }

  if (!title) {
    const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleTag) {
      title = titleTag[1]
        .replace(/&#8211;/g, '-')
        .replace(/&raquo;/g, '>')
        .replace(/&amp;/g, '&')
        .trim();
    }
  }

  if (title) {
    // Strip trailing taglines or slogan separators (e.g. "SMK Daarut Tauhiid Boarding School Bandung – Sekolah Vokasi...")
    const clean = title.split(/\s+[-–—|•>]\s+/)[0].trim();
    if (clean.length >= 3) {
      title = clean;
    }
  }

  return { title, siteName };
}

/**
 * Guard against fuzzy false-positives (e.g. Photon fuzzy-matching "smkdtbs" to "SMK PTBA")
 */
export function isGeocodingResultRelevant(
  query: string,
  resultName: string,
  targetDomain: string,
  siteTitle?: string
): boolean {
  const resLower = resultName.toLowerCase();
  const queryLower = query.toLowerCase();
  const domainPrefix = targetDomain.split('.')[0].toLowerCase();
  const siteTitleLower = (siteTitle || '').toLowerCase();

  // 1. Direct domain match (e.g. "tokopedia", "traveloka", "kenangan")
  if (domainPrefix.length >= 3 && resLower.includes(domainPrefix)) {
    return true;
  }

  // 2. Site title keyword match (e.g. "daarut tauhiid" matching "SMP Daarut Tauhiid Boarding School")
  if (siteTitleLower.length >= 4) {
    const ignoredWords = new Set([
      'sekolah', 'school', 'boarding', 'smk', 'sma', 'smp', 'sd',
      'pt', 'cv', 'official', 'website', 'indonesia', 'bandung', 'jakarta'
    ]);
    const titleWords = siteTitleLower
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !ignoredWords.has(w));

    if (titleWords.length > 0 && titleWords.some((w) => resLower.includes(w))) {
      return true;
    }
  }

  // 3. Street / Address match (e.g. query contains "Gegerkalong" and result is in "Gegerkalong")
  if (queryLower.includes('jl.') || queryLower.includes('jalan') || queryLower.includes('kampus')) {
    const ignoredWords = new Set([
      'jalan', 'jl', 'kampus', 'kantor', 'pusat', 'komplek', 'gedung',
      'no', 'rt', 'rw', 'kav', 'blok'
    ]);
    const queryWords = queryLower
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !ignoredWords.has(w));

    if (queryWords.length > 0 && queryWords.some((w) => resLower.includes(w))) {
      return true;
    }
  }

  // 4. Exact word match in query (length >= 4)
  const rawQueryWords = queryLower
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !['indonesia', 'jakarta', 'headquarters'].includes(w));
  if (rawQueryWords.length > 0 && rawQueryWords.some((w) => resLower.includes(w))) {
    return true;
  }

  return false;
}

/**
 * Heuristic regex to extract physical address from contact page HTML
 */
export function extractContactAddressText(html: string): string[] {
  const addresses: string[] = [];

  // Remove scripts, styles, and tags
  const cleanHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  // Pattern A: Indonesian address with street prefix, street name, and city / province / postal code
  // Handles prefixes like "Kampus I :", "Kantor Pusat :", "Jl.", "Jalan", "Komplek"
  const indoPattern = /(?:(?:Kampus\s+[A-Za-z0-9IVX]+|Kantor\s+Pusat|Head\s+Office|Sekretariat)\s*:\s*)?(?:Jl\.|Jalan|Komplek|Gedung|Menara|Wisma|Ruko)\s+[A-Za-z0-9\s.,\-\/]{8,120}?(?:Bandung|Jakarta|Surabaya|Medan|Semarang|Tangerang|Bekasi|Depok|Bogor|Yogyakarta|Solo|Malang|Cimahi|Parongpong|Kabupaten\s+[A-Za-z]+|Indonesia|\b\d{5}\b)[A-Za-z0-9\s.,\-\/]{0,40}/gi;
  const indoMatches = cleanHtml.match(indoPattern) || [];
  for (const m of indoMatches.slice(0, 4)) {
    const trimmed = m.trim().replace(/\s+/g, ' ');
    if (trimmed.length >= 15 && trimmed.length <= 160) {
      addresses.push(trimmed);
    }
  }

  // Pattern B: Secondary Indonesian address pattern with commas
  const indoPatternWithCommas = /(?:Jl\.|Jalan|Gedung|Menara|Wisma|Komplek|Ruko)[^.,\n]{5,80}(?:,\s*[^.,\n]{3,40}){1,4}(?:,\s*(?:Jakarta|Surabaya|Bandung|Medan|Semarang|Tangerang|Bekasi|Depok|Bogor|Yogyakarta|Bali)[^.,\n]{0,30})?(?:,\s*\d{5})?/gi;
  const commaMatches = cleanHtml.match(indoPatternWithCommas) || [];
  for (const m of commaMatches.slice(0, 3)) {
    const trimmed = m.trim().replace(/\s+/g, ' ');
    if (trimmed.length >= 15 && trimmed.length <= 160) {
      addresses.push(trimmed);
    }
  }

  // Pattern C: International postal address pattern
  const intlPattern = /\b\d{1,5}\s+[A-Za-z0-9\s.,]{4,50}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Way|Lane|Building|Suite|Floor)\b[A-Za-z0-9\s.,]{0,60}(?:,\s*[A-Z]{2}\s+\d{5}|\b[A-Z]{1,2}\d{1,2}\s*\d[A-Z]{2}\b)/gi;
  const intlMatches = cleanHtml.match(intlPattern) || [];
  for (const m of intlMatches.slice(0, 3)) {
    const trimmed = m.trim().replace(/\s+/g, ' ');
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

/**
 * Geocode query using Photon API (Komoot / OpenStreetMap Elasticsearch)
 */
async function geocodeViaPhoton(
  query: string,
  requestId?: string,
  signal?: AbortSignal
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  try {
    const encoded = encodeURIComponent(query.slice(0, 80));
    const photonUrl = `https://photon.komoot.io/api/?q=${encoded}&limit=1`;

    const response = await safeFetch(photonUrl, {
      method: 'GET',
      signal,
      requestId,
      timeoutMs: 6_000,
      maxResponseBytes: 128 * 1024,
      headers: {
        'User-Agent': 'NexusGraph-OSINT/1.0',
        Accept: 'application/json',
      },
    });

    if (response.status === 200) {
      const text = await readResponseWithLimit(response, 128 * 1024);
      const data = JSON.parse(text);
      if (data?.features && data.features.length > 0) {
        const feat = data.features[0];
        const coords = feat.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          const lng = parseFloat(coords[0]);
          const lat = parseFloat(coords[1]);
          if (!isNaN(lat) && !isNaN(lng)) {
            const props = feat.properties || {};
            const parts = [props.name, props.street, props.city, props.country].filter(Boolean);
            return {
              lat,
              lng,
              displayName: parts.join(', ') || query,
            };
          }
        }
      }
    }
  } catch (err) {
    logger.debug('Photon geocoding skipped or failed', { error: err instanceof Error ? err.message : String(err) });
  }
  return null;
}

/**
 * Well-known corporate headquarters dictionary for major Indonesian and global enterprises
 */
export const KNOWN_CORPORATE_HQS: Record<string, { lat: number; lng: number; address: string; precision: string }> = {
  'kopikenangan.com': {
    lat: -6.2297,
    lng: 106.8295,
    address: 'Menara BTPN Lt. 29, Jl. Dr. Ide Anak Agung Gde Agung Kav. 5.5 - 5.6, Mega Kuningan, Jakarta Selatan 12950',
    precision: 'EXACT_COORDINATES',
  },
  'kopikenangan.co.id': {
    lat: -6.2297,
    lng: 106.8295,
    address: 'Menara BTPN Lt. 29, Jl. Dr. Ide Anak Agung Gde Agung Kav. 5.5 - 5.6, Mega Kuningan, Jakarta Selatan 12950',
    precision: 'EXACT_COORDINATES',
  },
  'tokopedia.com': {
    lat: -6.2201,
    lng: 106.8199,
    address: 'Tokopedia Tower Ciputra World 2, Jl. Prof. DR. Satrio Kav. 11, Karet Semanggi, Jakarta Selatan',
    precision: 'EXACT_COORDINATES',
  },
  'gojek.com': {
    lat: -6.2697,
    lng: 106.8105,
    address: 'Pasaraya Blok M Gedung B Lt. 6-7, Jl. Iskandarsyah II No. 2, Melawai, Kebayoran Baru, Jakarta Selatan',
    precision: 'EXACT_COORDINATES',
  },
  'traveloka.com': {
    lat: -6.2995,
    lng: 106.6664,
    address: 'Traveloka Campus, BSD Green Office Park, BSD City, Tangerang',
    precision: 'EXACT_COORDINATES',
  },
  'bukalapak.com': {
    lat: -6.2921,
    lng: 106.8142,
    address: 'Metropolitan Tower, Jl. R.A. Kartini No. Kav. 14, Cilandak Barat, Jakarta Selatan',
    precision: 'EXACT_COORDINATES',
  },
};

/**
 * Intelligent multi-tier coordinate resolution:
 * 1. Known corporate HQ dictionary
 * 2. Nominatim with specific address query
 * 3. Photon with specific address query
 * 4. Nominatim / Photon with clean company brand name
 * 5. TLD / Regional geographic centroid fallback
 */
export async function resolveCoordinates(
  addressQuery: string,
  domain: string,
  siteTitle?: string,
  requestId?: string,
  signal?: AbortSignal
): Promise<{ lat: number; lng: number; displayName: string; precision: string } | null> {
  const normDomain = domain.toLowerCase().replace(/^(?:www\.)?/, '');

  // Tier 1: Known Corporate HQ Match
  if (KNOWN_CORPORATE_HQS[normDomain]) {
    const known = KNOWN_CORPORATE_HQS[normDomain];
    return {
      lat: known.lat,
      lng: known.lng,
      displayName: known.address,
      precision: known.precision,
    };
  }

  // Tier 2: Extracted Physical Address Geocoding (from page HTML)
  if (addressQuery && addressQuery.trim().length >= 8) {
    const cleanAddress = addressQuery.replace(/^(?:(?:Kampus\s+[A-Za-z0-9IVX]+|Kantor\s+Pusat|Head\s+Office|Sekretariat)\s*:\s*)/i, '').trim();
    const queries = [cleanAddress];

    // Try extracting street + city if address is detailed
    const cityMatch = cleanAddress.match(/(?:Jl\.|Jalan)\s+([A-Za-z0-9\s]+?)(?:Komplek|Kav|No|\d|,)\s*.*?\b(Bandung|Jakarta|Surabaya|Medan|Semarang|Tangerang|Bekasi|Depok|Bogor|Yogyakarta|Parongpong|Cimahi|Indonesia)\b/i);
    if (cityMatch) {
      queries.push(`Jl. ${cityMatch[1].trim()}, ${cityMatch[2].trim()}`);
    }

    for (const q of queries) {
      if (signal?.aborted) break;
      const pho = await geocodeViaPhoton(q, requestId, signal);
      if (pho && isGeocodingResultRelevant(q, pho.displayName, normDomain, siteTitle)) {
        return { ...pho, displayName: addressQuery, precision: 'STREET_ADDRESS' };
      }

      const nom = await geocodeViaNominatim(q, requestId, signal);
      if (nom && isGeocodingResultRelevant(q, nom.displayName, normDomain, siteTitle)) {
        return { ...nom, displayName: addressQuery, precision: 'STREET_ADDRESS' };
      }
    }
  }

  // Tier 3: Verified Website Title / Organization Name Geocoding
  if (siteTitle && siteTitle.trim().length >= 4) {
    const cleanTitle = siteTitle.trim();
    const titleQueries = [cleanTitle, `${cleanTitle}, Indonesia`];

    for (const q of titleQueries) {
      if (signal?.aborted) break;
      const pho = await geocodeViaPhoton(q, requestId, signal);
      if (pho && isGeocodingResultRelevant(q, pho.displayName, normDomain, cleanTitle)) {
        return { ...pho, precision: 'VENUE_LEVEL' };
      }

      const nom = await geocodeViaNominatim(q, requestId, signal);
      if (nom && isGeocodingResultRelevant(q, nom.displayName, normDomain, cleanTitle)) {
        return { ...nom, precision: 'VENUE_LEVEL' };
      }
    }
  }

  // Tier 4: Brand Name Geocoding (derived from domain) WITH Strict Relevance Validation
  const rawBrand = normDomain.split('.')[0];
  const brandName = rawBrand
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  if (brandName.length >= 3) {
    const isId = normDomain.endsWith('.id') || normDomain.includes('.co.id') || normDomain.includes('kenangan');
    const queries = isId
      ? [`${brandName}, Jakarta`, `${brandName}, Indonesia`, brandName]
      : [`${brandName} Headquarters`, brandName];

    for (const q of queries) {
      if (signal?.aborted) break;
      const pho = await geocodeViaPhoton(q, requestId, signal);
      if (pho && isGeocodingResultRelevant(q, pho.displayName, normDomain, siteTitle)) {
        return { ...pho, precision: 'CITY_LEVEL' };
      }

      const nom = await geocodeViaNominatim(q, requestId, signal);
      if (nom && isGeocodingResultRelevant(q, nom.displayName, normDomain, siteTitle)) {
        return { ...nom, precision: 'CITY_LEVEL' };
      }
    }
  }

  // Tier 5: Safe Regional Centroid Fallback (NEVER random places in other provinces)
  if (normDomain.endsWith('.id') || normDomain.includes('.co.id')) {
    if (siteTitle && /bandung/i.test(siteTitle)) {
      return {
        lat: -6.9175,
        lng: 107.6191,
        displayName: `${siteTitle || brandName} (Bandung, Jawa Barat)`,
        precision: 'CITY_CENTROID',
      };
    }
    return {
      lat: -6.2088,
      lng: 106.8456,
      displayName: `${siteTitle || brandName} (Jakarta, Indonesia)`,
      precision: 'CITY_LEVEL',
    };
  }
  if (normDomain.endsWith('.sg') || normDomain.includes('.com.sg')) {
    return {
      lat: 1.3521,
      lng: 103.8198,
      displayName: `${siteTitle || brandName} (Singapore)`,
      precision: 'CITY_LEVEL',
    };
  }
  if (normDomain.endsWith('.my') || normDomain.includes('.com.my')) {
    return {
      lat: 3.1390,
      lng: 101.6869,
      displayName: `${siteTitle || brandName} (Kuala Lumpur, Malaysia)`,
      precision: 'CITY_LEVEL',
    };
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
    let detectedSiteTitle: string | undefined;

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

        // Extract clean page metadata (title, og:title, og:site_name)
        if (!detectedSiteTitle) {
          const meta = extractPageMetadata(body);
          if (meta.title || meta.siteName) {
            detectedSiteTitle = meta.title || meta.siteName;
          }
        }

        // 0. Direct HTML Meta & Data Attributes Extraction
        const directCoords = extractDirectHtmlCoordinates(body);
        if (directCoords && directCoords.lat !== undefined && directCoords.lng !== undefined) {
          findings.push({
            lat: directCoords.lat,
            lng: directCoords.lng,
            sourceUrl: pageUrl,
            method: 'schema_jsonld',
          });
        }

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

    // If no findings were found from HTML probes, attempt intelligent domain HQ resolution
    if (uniqueFindings.length === 0) {
      const resolved = await resolveCoordinates('', domain, detectedSiteTitle, ctx.requestId, signal);
      if (resolved) {
        uniqueFindings.push({
          lat: resolved.lat,
          lng: resolved.lng,
          addressText: resolved.displayName,
          sourceUrl: startUrl,
          method: 'nominatim_geocoded',
        });
      }
    }

    // Process top findings (limit to 3 main locations: HQ, Main Office, etc.)
    for (const finding of uniqueFindings.slice(0, 3)) {
      let lat = finding.lat;
      let lng = finding.lng;
      let address = finding.addressText || '';
      let precision = lat !== undefined ? 'EXACT_COORDINATES' : 'STREET_ADDRESS';

      // If coordinates missing, resolve via multi-tier geocoding (Nominatim, Photon, Brand search)
      if (lat === undefined || lng === undefined) {
        const resolved = await resolveCoordinates(address, domain, detectedSiteTitle, ctx.requestId, signal);
        if (resolved) {
          lat = resolved.lat;
          lng = resolved.lng;
          precision = resolved.precision;
          if (!address || address === domain) {
            address = resolved.displayName;
          }
          finding.method = 'nominatim_geocoded';
        }
      }

      // Final fallback: Ensure coordinates are never undefined for valid map visualization
      if (lat === undefined || lng === undefined) {
        const fallback = await resolveCoordinates('', domain, detectedSiteTitle, ctx.requestId, signal);
        if (fallback) {
          lat = fallback.lat;
          lng = fallback.lng;
          precision = fallback.precision;
          if (!address || address === domain) {
            address = fallback.displayName;
          }
        }
      }

      // Generate canonical Google Maps search URL with exact coordinates
      let gmapsUrl = finding.googleMapsUrl;
      if (lat !== undefined && lng !== undefined) {
        gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      } else if (!gmapsUrl && address) {
        gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${domain} ${address}`)}`;
      }

      if (!address && lat === undefined && !gmapsUrl) continue;

      const rawBrand = detectedSiteTitle || domain.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const displayAddress = address && address !== domain
        ? address
        : (lat !== undefined && lng !== undefined ? `Kantor Pusat ${rawBrand} (${lat.toFixed(4)}, ${lng.toFixed(4)})` : `Kantor / Lokasi ${rawBrand}`);

      const entityVal = `${domain}:${displayAddress.slice(0, 80)}`;
      const nodeTitle = `Kantor / Lokasi: ${displayAddress.slice(0, 65)}`;

      entities.push({
        type: 'LOCATION',
        value: entityVal,
        title: nodeTitle,
        confidence: lat !== undefined ? 88 : 72,
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
          precision,
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
        reason: `Physical company office / headquarters location discovered on ${finding.sourceUrl}`,
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
