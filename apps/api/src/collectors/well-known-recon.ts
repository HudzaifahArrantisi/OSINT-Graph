/**
 * Well-Known & Standard Web Disclosures Collector
 *
 * Inspects standard RFC/IETF web specifications and well-known disclosure files:
 * 1. /.well-known/security.txt & /security.txt (RFC 9116)
 *    - Contact emails, phone numbers, PGP encryption keys, policy URLs, bug bounty acknowledgments.
 * 2. /robots.txt
 *    - Disallow rules (revealing hidden/staging/internal paths) and Sitemap directives.
 * 3. /.well-known/openid-configuration (RFC 8414 / OpenID Connect Discovery)
 *    - SSO / OAuth authorization servers, token endpoints, and identity providers.
 * 4. /.well-known/assetlinks.json (Google Digital Asset Links)
 *    - Official mobile application package names (Android).
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { normalizeDomain, normalizeEmail, normalizeUrl } from '@nexusgraph/shared';
import { safeFetch, readResponseWithLimit, validateUrl } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

const PROBE_TIMEOUT_MS = 5_000;
const MAX_BODY_BYTES = 256 * 1024; // 256 KB

interface SecurityTxtData {
  contacts: string[];
  encryption: string[];
  policies: string[];
  acknowledgments: string[];
  canonical: string[];
}

function parseSecurityTxt(content: string): SecurityTxtData {
  const result: SecurityTxtData = {
    contacts: [],
    encryption: [],
    policies: [],
    acknowledgments: [],
    canonical: [],
  };

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const field = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();
    if (!value) continue;

    switch (field) {
      case 'contact':
        result.contacts.push(value);
        break;
      case 'encryption':
        result.encryption.push(value);
        break;
      case 'policy':
        result.policies.push(value);
        break;
      case 'acknowledgments':
      case 'acknowledgements':
        result.acknowledgments.push(value);
        break;
      case 'canonical':
        result.canonical.push(value);
        break;
    }
  }

  return result;
}

interface RobotsTxtData {
  disallows: string[];
  sitemaps: string[];
}

function parseRobotsTxt(content: string): RobotsTxtData {
  const disallows = new Set<string>();
  const sitemaps = new Set<string>();

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const cleaned = rawLine.replace(/#.*$/, '').trim();
    if (!cleaned) continue;

    const disallowMatch = /^disallow:\s*(\S+)/i.exec(cleaned);
    if (disallowMatch && disallowMatch[1] && disallowMatch[1] !== '/') {
      disallows.add(disallowMatch[1]);
    }

    const sitemapMatch = /^sitemap:\s*(\S+)/i.exec(cleaned);
    if (sitemapMatch && sitemapMatch[1]) {
      sitemaps.add(sitemapMatch[1]);
    }
  }

  return {
    disallows: Array.from(disallows).slice(0, 50),
    sitemaps: Array.from(sitemaps).slice(0, 10),
  };
}

export const wellKnownReconCollector: Collector = {
  name: 'well-known-recon',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL' || inputType === 'WEBSITE';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    let targetDomain: string;
    let baseOrigin: string;

    if (input.includes('://')) {
      const validation = validateUrl(input);
      if (!validation.safe) {
        warnings.push(`Target URL rejected by SSRF guard: ${validation.reason}`);
        return { source: 'well-known-recon', collectedAt, entities, relationships, evidence, warnings };
      }
      try {
        const u = new URL(input);
        targetDomain = normalizeDomain(u.hostname);
        baseOrigin = `${u.protocol}//${u.host}`;
      } catch {
        warnings.push(`Invalid URL format: "${input}"`);
        return { source: 'well-known-recon', collectedAt, entities, relationships, evidence, warnings };
      }
    } else {
      targetDomain = normalizeDomain(input);
      baseOrigin = `https://${targetDomain}`;
    }

    if (!targetDomain || !targetDomain.includes('.')) {
      warnings.push(`Invalid domain value: "${input}"`);
      return { source: 'well-known-recon', collectedAt, entities, relationships, evidence, warnings };
    }

    logger.info('Well-known standard disclosures inspection started', {
      requestId: ctx.requestId,
      domain: targetDomain,
      baseOrigin,
    });

    const fetchOpts = {
      requestId: ctx.requestId,
      timeoutMs: PROBE_TIMEOUT_MS,
      maxResponseBytes: MAX_BODY_BYTES,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NexusGraph/1.0 (OSINT Reconnaissance)',
        Accept: 'text/plain, application/json, */*',
      },
    };

    // ─── 1. Probe security.txt (RFC 9116) ─────────────────────────────
    const securityTxtUrls = [
      `${baseOrigin}/.well-known/security.txt`,
      `${baseOrigin}/security.txt`,
    ];

    let securityFound = false;
    for (const secUrl of securityTxtUrls) {
      if (securityFound) break;
      try {
        const res = await safeFetch(secUrl, fetchOpts);
        if (res.ok && res.status === 200) {
          const body = await readResponseWithLimit(res, MAX_BODY_BYTES);
          if (body && (body.toLowerCase().includes('contact:') || body.toLowerCase().includes('policy:'))) {
            securityFound = true;
            const parsedSec = parseSecurityTxt(body);

            evidence.push({
              source_url: secUrl,
              source_type: 'SECURITY_TXT',
              title: `security.txt Disclosure (${targetDomain})`,
              extracted_value: `Ditemukan security.txt dengan ${parsedSec.contacts.length} kontak & ${parsedSec.policies.length} kebijakan.`,
              confidence: 95,
              metadata: {
                url: secUrl,
                contacts: parsedSec.contacts,
                encryption: parsedSec.encryption,
                policies: parsedSec.policies,
                acknowledgments: parsedSec.acknowledgments,
              },
            });

            // Extract contact emails and links
            for (const contact of parsedSec.contacts) {
              const emailMatch = /mailto:([^\s?]+)/i.exec(contact) || /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i.exec(contact);
              if (emailMatch) {
                const normEmail = normalizeEmail(emailMatch[1]);
                entities.push({
                  type: 'EMAIL',
                  value: normEmail,
                  title: `Security Contact: ${normEmail}`,
                  confidence: 90,
                  metadata: {
                    source: {
                      collector: 'well-known-recon',
                      file: 'security.txt',
                      url: secUrl,
                      collectedAt,
                    },
                  },
                });

                relationships.push({
                  source_value: targetDomain,
                  source_type: 'DOMAIN',
                  target_value: normEmail,
                  target_type: 'EMAIL',
                  relationship_type: 'CONTACT_POINT',
                  confidence: 90,
                  reason: `Disclosed as official security contact in ${secUrl}`,
                });
              } else if (contact.startsWith('http://') || contact.startsWith('https://')) {
                const cleanUrl = normalizeUrl(contact);
                entities.push({
                  type: 'URL',
                  value: cleanUrl,
                  title: `Security Portal: ${cleanUrl}`,
                  confidence: 85,
                  metadata: {
                    source: {
                      collector: 'well-known-recon',
                      file: 'security.txt',
                      collectedAt,
                    },
                  },
                });

                relationships.push({
                  source_value: targetDomain,
                  source_type: 'DOMAIN',
                  target_value: cleanUrl,
                  target_type: 'URL',
                  relationship_type: 'CONTACT_POINT',
                  confidence: 85,
                  reason: `Security contact portal link disclosed in ${secUrl}`,
                });
              }
            }

            // Extract bug bounty / acknowledgments links
            for (const ack of parsedSec.acknowledgments) {
              if (ack.startsWith('http://') || ack.startsWith('https://')) {
                const ackUrl = normalizeUrl(ack);
                entities.push({
                  type: 'URL',
                  value: ackUrl,
                  title: `Bug Bounty / Hall of Fame: ${ackUrl}`,
                  confidence: 85,
                  metadata: { role: 'bug_bounty_hall_of_fame' },
                });

                relationships.push({
                  source_value: targetDomain,
                  source_type: 'DOMAIN',
                  target_value: ackUrl,
                  target_type: 'URL',
                  relationship_type: 'LINKS_TO',
                  confidence: 85,
                  reason: 'Official security acknowledgments portal',
                });
              }
            }
          }
        }
      } catch (err: any) {
        logger.debug(`Failed probing ${secUrl}: ${err?.message}`);
      }
    }

    // ─── 2. Probe robots.txt (Disallowed Sensitive Paths & Sitemaps) ───
    try {
      const robotsUrl = `${baseOrigin}/robots.txt`;
      const res = await safeFetch(robotsUrl, fetchOpts);
      if (res.ok && res.status === 200) {
        const body = await readResponseWithLimit(res, MAX_BODY_BYTES);
        if (body && (body.toLowerCase().includes('user-agent:') || body.toLowerCase().includes('disallow:'))) {
          const parsedRobots = parseRobotsTxt(body);

          evidence.push({
            source_url: robotsUrl,
            source_type: 'ROBOTS_TXT',
            title: `robots.txt Disclosures (${targetDomain})`,
            extracted_value: `Ditemukan ${parsedRobots.disallows.length} path tersembunyi (Disallow) & ${parsedRobots.sitemaps.length} sitemap link.`,
            confidence: 90,
            metadata: {
              url: robotsUrl,
              disallowsCount: parsedRobots.disallows.length,
              sampleDisallows: parsedRobots.disallows.slice(0, 15),
              sitemaps: parsedRobots.sitemaps,
            },
          });

          // Convert sensitive disallowed paths into URL candidates
          for (const path of parsedRobots.disallows) {
            // Filter obvious catch-alls or empty paths
            if (!path.startsWith('/') || path === '/*') continue;

            const fullEndpoint = `${baseOrigin}${path}`;
            entities.push({
              type: 'URL',
              value: fullEndpoint,
              title: `Disallowed Path: ${path}`,
              confidence: 75,
              metadata: {
                is_disallowed: true,
                source: {
                  collector: 'well-known-recon',
                  file: 'robots.txt',
                  collectedAt,
                },
              },
            });

            relationships.push({
              source_value: targetDomain,
              source_type: 'DOMAIN',
              target_value: fullEndpoint,
              target_type: 'URL',
              relationship_type: 'CONTAINS_ENDPOINT',
              confidence: 75,
              reason: `Disallow directive in robots.txt exposes path ${path}`,
            });
          }

          // Register sitemaps
          for (const sm of parsedRobots.sitemaps) {
            entities.push({
              type: 'URL',
              value: sm,
              title: `Sitemap XML: ${sm}`,
              confidence: 85,
              metadata: { role: 'sitemap' },
            });

            relationships.push({
              source_value: targetDomain,
              source_type: 'DOMAIN',
              target_value: sm,
              target_type: 'URL',
              relationship_type: 'LINKS_TO',
              confidence: 85,
              reason: 'Sitemap declared in robots.txt',
            });
          }
        }
      }
    } catch (err: any) {
      logger.debug(`Failed probing robots.txt: ${err?.message}`);
    }

    // ─── 3. Probe /.well-known/openid-configuration (Auth / SSO Discovery) ──
    try {
      const openIdUrl = `${baseOrigin}/.well-known/openid-configuration`;
      const res = await safeFetch(openIdUrl, fetchOpts);
      if (res.ok && res.status === 200) {
        const body = await readResponseWithLimit(res, MAX_BODY_BYTES);
        try {
          const json = JSON.parse(body);
          if (json && (json.issuer || json.authorization_endpoint)) {
            const issuer = json.issuer || baseOrigin;
            evidence.push({
              source_url: openIdUrl,
              source_type: 'WELL_KNOWN_RECON',
              title: `OpenID Configuration Discovery (${targetDomain})`,
              extracted_value: `Terdeteksi provider autentikasi SSO / OpenID Connect: ${issuer}`,
              confidence: 95,
              metadata: {
                issuer: json.issuer,
                authorization_endpoint: json.authorization_endpoint,
                token_endpoint: json.token_endpoint,
                userinfo_endpoint: json.userinfo_endpoint,
              },
            });

            entities.push({
              type: 'IDENTITY_PROVIDER',
              value: issuer,
              title: `Identity Provider: ${issuer}`,
              confidence: 90,
              metadata: {
                authorization_endpoint: json.authorization_endpoint,
                token_endpoint: json.token_endpoint,
              },
            });

            relationships.push({
              source_value: targetDomain,
              source_type: 'DOMAIN',
              target_value: issuer,
              target_type: 'IDENTITY_PROVIDER',
              relationship_type: 'USES_AUTH_PROVIDER',
              confidence: 90,
              reason: 'OpenID Connect configuration endpoint exposed',
            });
          }
        } catch {
          // Not JSON, ignore
        }
      }
    } catch (err: any) {
      logger.debug(`Failed probing openid-configuration: ${err?.message}`);
    }

    // ─── 4. Probe /.well-known/assetlinks.json (Digital Asset Links) ────
    try {
      const assetLinksUrl = `${baseOrigin}/.well-known/assetlinks.json`;
      const res = await safeFetch(assetLinksUrl, fetchOpts);
      if (res.ok && res.status === 200) {
        const body = await readResponseWithLimit(res, MAX_BODY_BYTES);
        try {
          const json = JSON.parse(body);
          if (Array.isArray(json)) {
            const packages = new Set<string>();
            for (const item of json) {
              if (item?.target?.namespace === 'android_app' && item?.target?.package_name) {
                packages.add(item.target.package_name);
              }
            }

            if (packages.size > 0) {
              const packageList = Array.from(packages);
              evidence.push({
                source_url: assetLinksUrl,
                source_type: 'WELL_KNOWN_RECON',
                title: `Digital Asset Links Android App (${targetDomain})`,
                extracted_value: `Terdeteksi aplikasi Android resmi: ${packageList.join(', ')}`,
                confidence: 95,
                metadata: { packages: packageList },
              });

              for (const pkg of packageList) {
                entities.push({
                  type: 'ORGANIZATION',
                  value: pkg,
                  title: `Android App Package: ${pkg}`,
                  confidence: 85,
                  metadata: { role: 'android_package', domain: targetDomain },
                });

                relationships.push({
                  source_value: targetDomain,
                  source_type: 'DOMAIN',
                  target_value: pkg,
                  target_type: 'ORGANIZATION',
                  relationship_type: 'RELATED_TO',
                  confidence: 85,
                  reason: 'Official Android app associated via Digital Asset Links',
                });
              }
            }
          }
        } catch {
          // Not JSON, ignore
        }
      }
    } catch (err: any) {
      logger.debug(`Failed probing assetlinks.json: ${err?.message}`);
    }

    if (entities.length === 0 && evidence.length === 0) {
      warnings.push(`No standard well-known disclosure files found on ${targetDomain}`);
    }

    logger.info('Well-known disclosures inspection completed', {
      requestId: ctx.requestId,
      domain: targetDomain,
      entityCount: entities.length,
      relationshipCount: relationships.length,
      evidenceCount: evidence.length,
    });

    return {
      source: 'well-known-recon',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
