/**
 * Subdomain Takeover & Dangling DNS Validator
 *
 * Checks CNAME records of domains/subdomains against signatures of popular cloud/SaaS
 * hosting providers (AWS S3, GitHub Pages, Heroku, Azure, Zendesk, Shopify, etc.).
 * If a dangling CNAME is identified, performs a safe SSRF-guarded HTTP probe to detect
 * unclaimed service signatures and flags potential takeover vulnerabilities.
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { normalizeDomain } from '@nexusgraph/shared';
import { safeFetch, readResponseWithLimit, validateUrl } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

const DOH_URL = 'https://cloudflare-dns.com/dns-query';
const PROBE_TIMEOUT_MS = 6_000;
const MAX_PROBE_BYTES = 64 * 1024;

interface ServiceFingerprint {
  name: string;
  cnamePatterns: string[];
  responseFingerprints: string[];
  category: 'cloud' | 'hosting' | 'saas' | 'cdn';
}

const TAKEOVER_FINGERPRINTS: ServiceFingerprint[] = [
  {
    name: 'GitHub Pages',
    cnamePatterns: ['github.io', 'github.map.fastly.net'],
    responseFingerprints: ["There isn't a GitHub Pages site here", "For root URLs (like http://example.com/) you must provide an index.html file"],
    category: 'hosting',
  },
  {
    name: 'AWS S3 / CloudFront',
    cnamePatterns: ['s3.amazonaws.com', 's3-website', 'cloudfront.net'],
    responseFingerprints: ['NoSuchBucket', 'The specified bucket does not exist', 'Bad Request: The specified bucket does not exist'],
    category: 'cloud',
  },
  {
    name: 'Heroku',
    cnamePatterns: ['herokuapp.com', 'herokussl.com', 'herokudns.com'],
    responseFingerprints: ['No such app', 'Heroku | No such app', '<title>No such app</title>'],
    category: 'cloud',
  },
  {
    name: 'Microsoft Azure',
    cnamePatterns: ['azurewebsites.net', 'cloudapp.net', 'azureedge.net', 'trafficmanager.net'],
    responseFingerprints: ['404 Web Site not found', 'The resource you are looking for has been removed', 'Microsoft-Azure-App-Service'],
    category: 'cloud',
  },
  {
    name: 'Zendesk',
    cnamePatterns: ['zendesk.com'],
    responseFingerprints: ['Help Center Closed', 'this help center no longer exists'],
    category: 'saas',
  },
  {
    name: 'Shopify',
    cnamePatterns: ['myshopify.com'],
    responseFingerprints: ['Sorry, this shop is currently unavailable', 'Only one step left to start selling'],
    category: 'saas',
  },
  {
    name: 'Fastly',
    cnamePatterns: ['fastly.net', 'fastlylb.net'],
    responseFingerprints: ['Fastly error: unknown domain', 'Details: cache-'],
    category: 'cdn',
  },
  {
    name: 'Ghost',
    cnamePatterns: ['ghost.io'],
    responseFingerprints: ['The thing you were looking for is no longer here', 'Site not found - Ghost'],
    category: 'hosting',
  },
  {
    name: 'Readme.io',
    cnamePatterns: ['readme.io'],
    responseFingerprints: ['Project doesnt exist... yet!', 'Project not found'],
    category: 'saas',
  },
  {
    name: 'Surge.sh',
    cnamePatterns: ['surge.sh'],
    responseFingerprints: ['project not found', 'repository not found'],
    category: 'hosting',
  },
  {
    name: 'Bitbucket',
    cnamePatterns: ['bitbucket.io'],
    responseFingerprints: ['Repository not found', 'The requested repository does not exist'],
    category: 'hosting',
  },
  {
    name: 'Netlify',
    cnamePatterns: ['netlify.app', 'netlify.com'],
    responseFingerprints: ['Not Found - Request ID', 'Netlify - Page Not Found'],
    category: 'hosting',
  },
  {
    name: 'Tumblr',
    cnamePatterns: ['domains.tumblr.com'],
    responseFingerprints: ["Whatever you were looking for doesn't seem to exist at this address"],
    category: 'hosting',
  },
  {
    name: 'WordPress.com',
    cnamePatterns: ['wordpress.com'],
    responseFingerprints: ['Do you want to register', "doesn't exist"],
    category: 'hosting',
  },
  {
    name: 'Pantheon',
    cnamePatterns: ['pantheonsite.io'],
    responseFingerprints: ['404 error unknown site!', 'The gods are not with you on this one'],
    category: 'hosting',
  },
  {
    name: 'Fly.io',
    cnamePatterns: ['edgeapp.net', 'fly.dev'],
    responseFingerprints: ['404 Not Found', 'Could not find app'],
    category: 'cloud',
  },
  {
    name: 'Unbounce',
    cnamePatterns: ['unbouncepages.com'],
    responseFingerprints: ['The requested URL was not found on this server', 'The page you are looking for is not found'],
    category: 'saas',
  },
];

interface DnsAnswer {
  name: string;
  type: number;
  data: string;
}

interface DnsResponse {
  Status: number;
  Answer?: DnsAnswer[];
}

async function queryCname(domain: string, signal: AbortSignal): Promise<string[]> {
  try {
    const res = await fetch(`${DOH_URL}?name=${encodeURIComponent(domain)}&type=CNAME`, {
      headers: { Accept: 'application/dns-json' },
      signal,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as DnsResponse;
    if (!json.Answer) return [];
    return json.Answer.map((a) => a.data.replace(/\.$/, '').trim());
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    return [];
  }
}

export const subdomainTakeoverCollector: Collector = {
  name: 'subdomain-takeover',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    let targetDomain = input.trim();
    if (targetDomain.includes('://')) {
      const v = validateUrl(targetDomain);
      if (v.safe) {
        try {
          targetDomain = new URL(targetDomain).hostname;
        } catch {
          // Keep raw
        }
      }
    }
    targetDomain = normalizeDomain(targetDomain);

    if (!targetDomain || !targetDomain.includes('.')) {
      warnings.push(`Invalid domain input for subdomain takeover audit: "${input}"`);
      return { source: 'subdomain-takeover', collectedAt, entities, relationships, evidence, warnings };
    }

    logger.info('Subdomain takeover audit started', {
      requestId: ctx.requestId,
      domain: targetDomain,
    });

    try {
      // 1. Resolve CNAME for this target domain
      const cnames = await queryCname(targetDomain, ctx.signal);

      if (cnames.length === 0) {
        evidence.push({
          source_url: `dns://${targetDomain}/CNAME`,
          source_type: 'SUBDOMAIN_TAKEOVER',
          title: `CNAME Audit: ${targetDomain}`,
          extracted_value: `No CNAME record present for ${targetDomain} (Direct A/AAAA resolution or apex). Takeover risk low.`,
          confidence: 85,
          metadata: {
            domain: targetDomain,
            hasCname: false,
            status: 'SECURE_NO_CNAME',
          },
        });

        return { source: `takeover://${targetDomain}`, collectedAt, entities, relationships, evidence, warnings };
      }

      for (const cname of cnames) {
        const matchingService = TAKEOVER_FINGERPRINTS.find((fp) =>
          fp.cnamePatterns.some((pattern) => cname.toLowerCase().includes(pattern.toLowerCase())),
        );

        if (!matchingService) {
          // CNAME exists but doesn't match known third-party takeover fingerprints
          evidence.push({
            source_url: `dns://${targetDomain}/CNAME`,
            source_type: 'SUBDOMAIN_TAKEOVER',
            title: `CNAME Audit: ${targetDomain} -> ${cname}`,
            extracted_value: `CNAME points to ${cname}. Not matching high-risk vulnerable service signatures.`,
            confidence: 90,
            metadata: {
              domain: targetDomain,
              cname,
              status: 'VERIFIED_EXTERNAL_CNAME',
            },
          });
          continue;
        }

        // 2. High-risk signature matched! Probe HTTP response to see if service is unclaimed
        logger.info('Potential takeover CNAME pattern matched, probing live response', {
          requestId: ctx.requestId,
          domain: targetDomain,
          cname,
          service: matchingService.name,
        });

        let probeResult: {
          isDangling: boolean;
          matchedFingerprint: string | null;
          statusCode: number | null;
          errorReason: string | null;
        } = {
          isDangling: false,
          matchedFingerprint: null,
          statusCode: null,
          errorReason: null,
        };

        try {
          const probeUrl = `http://${targetDomain}`;
          const response = await safeFetch(probeUrl, {
            method: 'GET',
            requestId: ctx.requestId,
            signal: ctx.signal,
            timeoutMs: PROBE_TIMEOUT_MS,
            maxResponseBytes: MAX_PROBE_BYTES,
            headers: { 'User-Agent': 'NexusGraph-OSINT/1.0 (Takeover Auditor)' },
          });

          probeResult.statusCode = response.status;
          const body = await readResponseWithLimit(response, MAX_PROBE_BYTES);

          for (const fg of matchingService.responseFingerprints) {
            if (body.toLowerCase().includes(fg.toLowerCase())) {
              probeResult.isDangling = true;
              probeResult.matchedFingerprint = fg;
              break;
            }
          }
        } catch (probeErr) {
          probeResult.errorReason = probeErr instanceof Error ? probeErr.message : 'Connection failed';
        }

        if (probeResult.isDangling) {
          // Confirmed dangling CNAME!
          const vulnerabilityTitle = `⚠️ RISIKO TINGGI: Kerentanan Subdomain Takeover terdeteksi pada ${targetDomain}`;
          const reasonText = `CNAME mengarah ke ${cname} (${matchingService.name}), tetapi layanan belum/tidak diklaim (signature "${probeResult.matchedFingerprint}")`;

          entities.push({
            type: 'SUBDOMAIN',
            value: targetDomain,
            title: `⚠️ Takeover Risk: ${targetDomain}`,
            confidence: 95,
            metadata: {
              isVulnerableTakeover: true,
              cnameTarget: cname,
              providerName: matchingService.name,
              providerCategory: matchingService.category,
              matchedSignature: probeResult.matchedFingerprint,
              httpStatus: probeResult.statusCode,
              remediation: `Hapus record DNS CNAME "${targetDomain} -> ${cname}" atau segera klaim kembali resource pada platform ${matchingService.name}.`,
              source: {
                collector: 'subdomain-takeover',
                transform: 'domain.subdomain-takeover',
                derivedFrom: targetDomain,
                collectedAt,
              },
            },
          });

          relationships.push({
            source_value: targetDomain,
            source_type: 'DOMAIN',
            target_value: cname,
            target_type: 'DOMAIN',
            relationship_type: 'RELATED_TO',
            confidence: 95,
            reason: reasonText,
          });

          evidence.push({
            source_url: `http://${targetDomain}`,
            source_type: 'SUBDOMAIN_TAKEOVER',
            title: vulnerabilityTitle,
            extracted_value: reasonText,
            confidence: 95,
            metadata: {
              severity: 'CRITICAL',
              targetDomain,
              cname,
              service: matchingService.name,
              signature: probeResult.matchedFingerprint,
              httpStatus: probeResult.statusCode,
            },
          });
        } else {
          // CNAME matched signature but probe returned normal content (claimed and active)
          evidence.push({
            source_url: `http://${targetDomain}`,
            source_type: 'SUBDOMAIN_TAKEOVER',
            title: `Takeover Audit: ${targetDomain} -> ${cname} (${matchingService.name})`,
            extracted_value: `CNAME terkonfigurasi ke ${matchingService.name} (${cname}), berstatus aktif/terklaim (HTTP ${probeResult.statusCode || 'Active'}). Tidak ada signature takeover.`,
            confidence: 85,
            metadata: {
              severity: 'INFO',
              targetDomain,
              cname,
              service: matchingService.name,
              isDangling: false,
              httpStatus: probeResult.statusCode,
            },
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      warnings.push(`Subdomain takeover audit error: ${message}`);
      logger.warn('Subdomain takeover collector error', {
        requestId: ctx.requestId,
        domain: targetDomain,
        error: message,
      });
    }

    logger.info('Subdomain takeover audit completed', {
      requestId: ctx.requestId,
      domain: targetDomain,
      entitiesFound: entities.length,
      evidenceFound: evidence.length,
    });

    return {
      source: `takeover://${targetDomain}`,
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
