/**
 * Shodan Host & Port Recon Collector
 *
 * Integrates Shodan REST API (https://api.shodan.io) to gather:
 * - Open Ports and Listening Services (HTTP, SSH, FTP, RDP, DNS, Telnet, MySQL, etc.)
 * - Service Banners, Protocols, and Product/Technology Fingerprints (Nginx, Apache, OpenSSH, etc.)
 * - Common Platform Enumeration (CPE) and CVE Vulnerability references
 * - Autonomous System Number (ASN), ISP, Organization, and Geolocation metadata
 * - Hostnames and Domain associations
 *
 * Supports input types: IP_ADDRESS, DOMAIN, URL.
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
import { normalizeDomain, normalizeIpAddress } from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

const SHODAN_BASE_URL = 'https://api.shodan.io';
const REQUEST_TIMEOUT_MS = 15_000;

interface ShodanLocation {
  city?: string | null;
  region_code?: string | null;
  country_name?: string | null;
  country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  postal_code?: string | null;
}

interface ShodanService {
  port: number;
  transport?: string;
  _shodan?: {
    module?: string;
    crawler?: string;
    id?: string;
  };
  product?: string;
  version?: string;
  cpe?: string[];
  cpe23?: string[];
  os?: string | null;
  data?: string;
  devicetype?: string;
  info?: string;
  hostnames?: string[];
  domains?: string[];
  vulns?: Record<string, { cvss?: number; summary?: string; references?: string[] }>;
  timestamp?: string;
  http?: {
    status?: number;
    title?: string;
    server?: string;
    components?: Record<string, unknown>;
  };
  ssl?: {
    cert?: {
      subject?: Record<string, string>;
      issuer?: Record<string, string>;
      fingerprint?: { sha1?: string; sha256?: string };
    };
  };
}

interface ShodanHostResponse {
  ip_str: string;
  ip?: number;
  ports?: number[];
  hostnames?: string[];
  domains?: string[];
  org?: string;
  isp?: string;
  asn?: string;
  os?: string | null;
  last_update?: string;
  location?: ShodanLocation;
  data?: ShodanService[];
  vulns?: string[];
  tags?: string[];
  error?: string;
}

interface ShodanDnsResolveResponse {
  [hostname: string]: string | null;
}

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX = /^(?:[a-fA-F0-9]{1,4}:){1,7}[a-fA-F0-9:]{1,7}$/;

function isIpAddress(val: string): boolean {
  return IPV4_REGEX.test(val) || IPV6_REGEX.test(val);
}

function extractTarget(input: string): { target: string; isIp: boolean } {
  let trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      trimmed = new URL(trimmed).hostname.replace(/^www\./, '');
    } catch {
      // fallback
    }
  }
  return {
    target: trimmed,
    isIp: isIpAddress(trimmed),
  };
}

/**
 * Resolve domain to IP using Shodan DNS API or Cloudflare DoH fallback
 */
async function resolveDomainToIp(domain: string, apiKey: string, signal: AbortSignal): Promise<string | null> {
  try {
    const url = `${SHODAN_BASE_URL}/dns/resolve?hostnames=${encodeURIComponent(domain)}&key=${apiKey}`;
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = (await res.json()) as ShodanDnsResolveResponse;
      const ip = data[domain];
      if (ip && isIpAddress(ip)) return ip;
    }
  } catch (err) {
    logger.debug('Shodan DNS resolve failed, trying DoH fallback', { domain, error: err });
  }

  // Cloudflare DoH fallback
  try {
    const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`;
    const res = await fetch(dohUrl, {
      signal,
      headers: { Accept: 'application/dns-json' },
    });
    if (res.ok) {
      const data = (await res.json()) as { Answer?: { data: string; type: number }[] };
      const aRecord = (data.Answer || []).find((ans) => ans.type === 1);
      if (aRecord?.data && isIpAddress(aRecord.data)) {
        return aRecord.data;
      }
    }
  } catch (err) {
    logger.warn('Domain to IP resolution failed for Shodan recon', { domain, error: err });
  }

  return null;
}

export const shodanCollector: Collector = {
  name: 'shodan-recon',

  supports(inputType: SeedType): boolean {
    return inputType === 'IP_ADDRESS' || inputType === 'DOMAIN' || inputType === 'URL';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    const apiKey = process.env.SHODAN_API_KEY;
    if (!apiKey) {
      warnings.push('SHODAN_API_KEY environment variable is not configured. Skipping Shodan host and port recon.');
      return { source: 'shodan-recon', collectedAt, entities, relationships, evidence, warnings };
    }

    const { target, isIp } = extractTarget(input);
    let queryIp: string | null = null;

    if (isIp) {
      queryIp = target;
    } else {
      queryIp = await resolveDomainToIp(target, apiKey, ctx.signal);
      if (!queryIp) {
        warnings.push(`Could not resolve domain/URL "${target}" to an active IPv4 address for Shodan scan.`);
        return { source: 'shodan-recon', collectedAt, entities, relationships, evidence, warnings };
      }
    }

    logger.info('Querying Shodan Host API', { target, queryIp, requestId: ctx.requestId });

    let hostData: ShodanHostResponse;
    try {
      const hostUrl = `${SHODAN_BASE_URL}/shodan/host/${encodeURIComponent(queryIp)}?key=${apiKey}&minify=false`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const abortHandler = () => controller.abort();
      ctx.signal.addEventListener('abort', abortHandler, { once: true });

      const response = await fetch(hostUrl, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      ctx.signal.removeEventListener('abort', abortHandler);

      if (response.status === 404) {
        logger.info('Host not found in Shodan database', { queryIp });
        evidence.push({
          source_url: `https://www.shodan.io/host/${queryIp}`,
          source_type: 'SHODAN_HOST',
          title: `Shodan Host Query: ${queryIp}`,
          extracted_value: 'No open ports or public services indexed in Shodan for this IP',
          confidence: 60,
          metadata: { negativeResult: true, ip: queryIp, target },
        });
        return { source: 'shodan-recon', collectedAt, entities, relationships, evidence, warnings };
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        warnings.push(`Shodan API request failed (${response.status}): ${errorText.slice(0, 200)}`);
        return { source: 'shodan-recon', collectedAt, entities, relationships, evidence, warnings };
      }

      hostData = (await response.json()) as ShodanHostResponse;
      if (hostData.error) {
        warnings.push(`Shodan API returned error: ${hostData.error}`);
        return { source: 'shodan-recon', collectedAt, entities, relationships, evidence, warnings };
      }
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      warnings.push(`Shodan host lookup failed: ${err.message || 'unknown error'}`);
      return { source: 'shodan-recon', collectedAt, entities, relationships, evidence, warnings };
    }

    const ipAddress = normalizeIpAddress(hostData.ip_str || queryIp);
    const ports = hostData.ports || [];
    const services = hostData.data || [];
    const org = hostData.org || hostData.isp;
    const asn = hostData.asn;
    const os = hostData.os;
    const hostnames = hostData.hostnames || [];
    const domains = hostData.domains || [];
    const vulns = hostData.vulns || [];

    // 1. IP Address Entity (if not seed)
    if (input !== ipAddress) {
      entities.push({
        type: 'IP_ADDRESS',
        value: ipAddress,
        title: `${ipAddress} (Shodan Host)`,
        confidence: 95,
        metadata: {
          ip: ipAddress,
          asn,
          org,
          isp: hostData.isp,
          os,
          ports,
          openPortCount: ports.length,
          last_update: hostData.last_update,
          shodanUrl: `https://www.shodan.io/host/${ipAddress}`,
          source: {
            collector: 'shodan-recon',
            transform: 'infrastructure.shodan-host',
            derivedFrom: input,
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: input,
        source_type: isIp ? 'IP_ADDRESS' : 'DOMAIN',
        target_value: ipAddress,
        target_type: 'IP_ADDRESS',
        relationship_type: 'RESOLVES_TO',
        confidence: 95,
        reason: `Shodan reconnaissance resolved target to active host ${ipAddress} with ${ports.length} open port(s).`,
      });
    }

    // 2. Organization / ISP Entity
    if (org && org !== 'Unknown') {
      entities.push({
        type: 'ORGANIZATION',
        value: org,
        title: `${org} (${asn || 'Hosting Provider'})`,
        confidence: 90,
        metadata: {
          orgName: org,
          asn,
          isp: hostData.isp,
          ip: ipAddress,
          source: {
            collector: 'shodan-recon',
            transform: 'infrastructure.shodan-host',
            derivedFrom: ipAddress,
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: ipAddress,
        source_type: 'IP_ADDRESS',
        target_value: org,
        target_type: 'ORGANIZATION',
        relationship_type: 'HOSTED_ON',
        confidence: 90,
        reason: `Shodan identified hosting infrastructure belonging to ASN ${asn || 'N/A'} (${org}).`,
      });
    }

    // 3. Geolocation Entity
    const lat = hostData.location?.latitude;
    const lon = hostData.location?.longitude;
    if (hostData.location && typeof lat === 'number' && typeof lon === 'number') {
      const loc = hostData.location;
      const locVal = `geo:${lat.toFixed(6)},${lon.toFixed(6)}`;
      const locTitle = [loc.city, loc.region_code, loc.country_name].filter(Boolean).join(', ') || 'Host Geolocation';

      entities.push({
        type: 'LOCATION',
        value: locVal,
        title: `${locTitle} (Shodan)`,
        confidence: 85,
        metadata: {
          latitude: lat,
          longitude: lon,
          city: loc.city,
          country: loc.country_name,
          countryCode: loc.country_code,
          postalCode: loc.postal_code,
          ip: ipAddress,
          source: {
            collector: 'shodan-recon',
            transform: 'infrastructure.shodan-host',
            derivedFrom: ipAddress,
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: ipAddress,
        source_type: 'IP_ADDRESS',
        target_value: locVal,
        target_type: 'LOCATION',
        relationship_type: 'GEOLOCATED_IN',
        confidence: 85,
        reason: `Shodan IP intelligence localized host to ${locTitle}`,
      });
    }

    // 4. Hostnames and Associated Domains
    for (const host of hostnames) {
      if (!host || host.length < 3 || host === ipAddress) continue;
      const normHost = normalizeDomain(host);
      entities.push({
        type: 'DOMAIN',
        value: normHost,
        title: normHost,
        confidence: 85,
        metadata: {
          hostname: host,
          associatedIp: ipAddress,
          source: {
            collector: 'shodan-recon',
            transform: 'infrastructure.shodan-host',
            derivedFrom: ipAddress,
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: normHost,
        source_type: 'DOMAIN',
        target_value: ipAddress,
        target_type: 'IP_ADDRESS',
        relationship_type: 'RESOLVES_TO',
        confidence: 85,
        reason: `Shodan host reverse DNS identified hostname ${host} pointing to ${ipAddress}.`,
      });
    }

    for (const domain of domains) {
      if (!domain || domain.length < 3) continue;
      const normDomain = normalizeDomain(domain);
      entities.push({
        type: 'DOMAIN',
        value: normDomain,
        title: normDomain,
        confidence: 80,
        metadata: {
          domain: normDomain,
          associatedIp: ipAddress,
          source: {
            collector: 'shodan-recon',
            transform: 'infrastructure.shodan-host',
            derivedFrom: ipAddress,
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: normDomain,
        source_type: 'DOMAIN',
        target_value: ipAddress,
        target_type: 'IP_ADDRESS',
        relationship_type: 'RESOLVES_TO',
        confidence: 80,
        reason: `Shodan indexed domain ${normDomain} hosted on ${ipAddress}.`,
      });
    }

    // 5. Technologies, Services, and Open Ports
    const seenTech = new Set<string>();

    for (const svc of services) {
      const portNum = svc.port;
      const transport = svc.transport || 'tcp';
      const product = svc.product;
      const version = svc.version;
      const moduleName = svc._shodan?.module || `${transport}/${portNum}`;
      const serverBanner = svc.http?.server;
      const bannerSummary = (svc.data || '').slice(0, 300).trim();

      // Formulate technology identifier
      const techName = product ? (version ? `${product} ${version}` : product) : serverBanner || `Port ${portNum}/${transport.toUpperCase()} (${moduleName})`;

      if (!seenTech.has(techName)) {
        seenTech.add(techName);

        entities.push({
          type: 'TECHNOLOGY',
          value: `${ipAddress}:${portNum} - ${techName}`,
          title: `Port ${portNum} [${transport.toUpperCase()}]: ${techName}`,
          confidence: 90,
          metadata: {
            port: portNum,
            transport,
            product,
            version,
            module: moduleName,
            cpe: svc.cpe || svc.cpe23,
            serverBanner,
            info: svc.info,
            devicetype: svc.devicetype,
            httpTitle: svc.http?.title,
            httpStatus: svc.http?.status,
            timestamp: svc.timestamp,
            ip: ipAddress,
            source: {
              collector: 'shodan-recon',
              transform: 'infrastructure.shodan-service',
              derivedFrom: ipAddress,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: ipAddress,
          source_type: 'IP_ADDRESS',
          target_value: `${ipAddress}:${portNum} - ${techName}`,
          target_type: 'TECHNOLOGY',
          relationship_type: 'OBSERVED_ON',
          confidence: 90,
          reason: `Shodan port scan identified active listening service on port ${portNum}/${transport} running ${techName}.`,
        });
      }

      // Evidence record for every exposed port service
      evidence.push({
        source_url: `https://www.shodan.io/host/${ipAddress}#${portNum}`,
        source_type: 'SHODAN_HOST',
        title: `Shodan Port ${portNum}/${transport.toUpperCase()}: ${product || moduleName}`,
        extracted_value: bannerSummary || `Service active on port ${portNum}`,
        confidence: 90,
        metadata: {
          port: portNum,
          transport,
          product,
          version,
          module: moduleName,
          cpe: svc.cpe || svc.cpe23,
          http: svc.http,
          vulns: svc.vulns ? Object.keys(svc.vulns) : [],
          timestamp: svc.timestamp,
        },
      });
    }

    // 6. Overall Host Intelligence Evidence Record
    evidence.push({
      source_url: `https://www.shodan.io/host/${ipAddress}`,
      source_type: 'SHODAN_HOST',
      title: `Shodan Host Overview: ${ipAddress}`,
      extracted_value: `Open Ports: [${ports.join(', ')}], Organization: ${org || 'N/A'}, ASN: ${asn || 'N/A'}, OS: ${os || 'N/A'}, Known Vulns: ${vulns.length}`,
      confidence: 95,
      metadata: {
        ip: ipAddress,
        ports,
        org,
        isp: hostData.isp,
        asn,
        os,
        vulns,
        tags: hostData.tags,
        last_update: hostData.last_update,
        serviceCount: services.length,
      },
    });

    logger.info('Shodan reconnaissance completed', {
      ipAddress,
      openPorts: ports.length,
      entitiesFound: entities.length,
      evidenceRecorded: evidence.length,
    });

    return {
      source: 'shodan-recon',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
