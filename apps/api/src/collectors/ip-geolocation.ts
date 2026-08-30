/**
 * IP Geolocation & ASN Collector
 *
 * Queries public geolocation services via SSRF guard to resolve:
 * - Geographical location (City, Region, Country, Latitude, Longitude)
 * - Autonomous System Number (ASN) and AS Name (e.g. AS13335 CLOUDFLARENET)
 * - Hosting Provider / ISP / Organization
 * - Timezone and Postal code
 *
 * Applies to IP_ADDRESS entities (IPv4 and IPv6).
 * All outgoing HTTP requests MUST pass through the SSRF guard.
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
  SeedType,
} from '@nexusgraph/shared';
import { safeFetch, readResponseWithLimit } from '../security/ssrf.js';
import { normalizeIpAddress } from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 256 * 1024; // 256 KB

interface IpApiResponse {
  status: 'success' | 'fail';
  message?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  asname?: string;
  query?: string;
}

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX = /^(?:[a-fA-F0-9]{1,4}:){1,7}[a-fA-F0-9:]{1,7}$/;

export function isValidIp(ip: string): boolean {
  return IPV4_REGEX.test(ip) || IPV6_REGEX.test(ip);
}

export const ipGeolocationCollector: Collector = {
  name: 'ip-geolocation',

  supports(inputType: SeedType): boolean {
    return inputType === 'IP_ADDRESS';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    const cleanIp = normalizeIpAddress(input);
    if (!cleanIp || !isValidIp(cleanIp)) {
      warnings.push(`Invalid IP address format: "${input}".`);
      return { source: 'ip-geolocation', collectedAt, entities, relationships, evidence, warnings };
    }

    const apiUrl = `http://ip-api.com/json/${encodeURIComponent(cleanIp)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,query`;

    logger.info('IP geolocation query starting', { requestId: ctx.requestId, ip: cleanIp });

    let geoData: IpApiResponse | null = null;

    try {
      const response = await safeFetch(apiUrl, {
        method: 'GET',
        signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS + 2_000)]),
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxRedirects: 2,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'NexusGraph-OSINT/1.0 (IP Geolocation)',
        },
      });

      if (!response.ok) {
        warnings.push(`IP geolocation service returned HTTP ${response.status} for "${cleanIp}".`);
        return { source: 'ip-geolocation', collectedAt, entities, relationships, evidence, warnings };
      }

      const bodyText = await readResponseWithLimit(response, MAX_BODY_BYTES);
      geoData = JSON.parse(bodyText) as IpApiResponse;
    } catch (err: any) {
      warnings.push(`IP geolocation request failed for "${cleanIp}": ${err.message}`);
      return { source: 'ip-geolocation', collectedAt, entities, relationships, evidence, warnings };
    }

    if (!geoData || geoData.status !== 'success') {
      warnings.push(
        `Geolocation lookup returned no result for "${cleanIp}" (${geoData?.message || 'unknown failure'}).`,
      );
      return { source: 'ip-geolocation', collectedAt, entities, relationships, evidence, warnings };
    }

    // ─── Build Location Entity ──────────────────────────────────────

    const city = geoData.city?.trim() || '';
    const region = geoData.regionName?.trim() || '';
    const country = geoData.country?.trim() || '';
    const locationParts = [city, region, country].filter(Boolean);
    const locationLabel = locationParts.join(', ') || country || 'Unknown Location';

    if (locationParts.length > 0) {
      entities.push({
        type: 'LOCATION',
        value: locationLabel,
        title: `Location: ${locationLabel}`,
        confidence: 85,
        metadata: {
          ip: cleanIp,
          city,
          region,
          regionCode: geoData.region || null,
          country,
          countryCode: geoData.countryCode || null,
          lat: geoData.lat || null,
          lon: geoData.lon || null,
          zip: geoData.zip || null,
          timezone: geoData.timezone || null,
          discoveredVia: 'ip-geolocation',
          source: {
            url: apiUrl,
            collector: 'ip-geolocation',
            transform: 'infrastructure.ip-geolocation',
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: cleanIp,
        source_type: 'IP_ADDRESS',
        target_value: locationLabel,
        target_type: 'LOCATION',
        relationship_type: 'GEOLOCATED_IN',
        confidence: 85,
        reason: `IP ${cleanIp} is registered / routed in ${locationLabel} according to IP geolocation data.`,
      });
    }

    // ─── Build Hosting Organization Entity ──────────────────────────

    const orgName = (geoData.org || geoData.isp || '').trim();
    if (orgName && !/^unknown|private|reserved/i.test(orgName)) {
      entities.push({
        type: 'ORGANIZATION',
        value: orgName,
        title: `Hosting / ISP: ${orgName}`,
        confidence: 90,
        metadata: {
          ip: cleanIp,
          role: 'hosting_provider',
          asn: geoData.as || null,
          asname: geoData.asname || null,
          discoveredVia: 'ip-geolocation',
          source: {
            url: apiUrl,
            collector: 'ip-geolocation',
            transform: 'infrastructure.ip-geolocation',
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: cleanIp,
        source_type: 'IP_ADDRESS',
        target_value: orgName,
        target_type: 'ORGANIZATION',
        relationship_type: 'HOSTED_ON',
        confidence: 90,
        reason: `IP ${cleanIp} is operated by autonomous system / ISP ${orgName} (${geoData.as || 'ASN'}).`,
      });
    }

    // ─── Build Evidence Record ──────────────────────────────────────

    const summaryParts: string[] = [];
    if (locationLabel) summaryParts.push(`Geo: ${locationLabel}`);
    if (geoData.lat && geoData.lon) summaryParts.push(`Coords: ${geoData.lat}, ${geoData.lon}`);
    if (orgName) summaryParts.push(`Org/ISP: ${orgName}`);
    if (geoData.as) summaryParts.push(`ASN: ${geoData.as}`);
    if (geoData.timezone) summaryParts.push(`Timezone: ${geoData.timezone}`);

    evidence.push({
      source_url: apiUrl,
      source_type: 'IP_GEOLOCATION',
      title: `IP Geolocation & Network Info for ${cleanIp}`,
      extracted_value: summaryParts.join(' | ') || `Geolocation for ${cleanIp}`,
      confidence: 90,
      metadata: {
        ip: cleanIp,
        city: geoData.city || null,
        region: geoData.regionName || null,
        country: geoData.country || null,
        countryCode: geoData.countryCode || null,
        lat: geoData.lat || null,
        lon: geoData.lon || null,
        timezone: geoData.timezone || null,
        zip: geoData.zip || null,
        isp: geoData.isp || null,
        org: geoData.org || null,
        as: geoData.as || null,
        asname: geoData.asname || null,
      },
    });

    logger.info('IP geolocation query completed', {
      requestId: ctx.requestId,
      ip: cleanIp,
      location: locationLabel,
      org: orgName,
      hasCoords: Boolean(geoData.lat && geoData.lon),
    });

    return { source: 'ip-geolocation', collectedAt, entities, relationships, evidence, warnings };
  },
};
