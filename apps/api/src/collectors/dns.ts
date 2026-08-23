/**
 * DNS Collector — resolves public DNS records for a domain.
 * Uses Cloudflare DNS-over-HTTPS API for Workers compatibility.
 * Creates entities for resolved IPs, mail servers, name servers.
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

const DOH_URL = 'https://cloudflare-dns.com/dns-query';

interface DnsAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DnsResponse {
  Status: number;
  Answer?: DnsAnswer[];
}

const DNS_RECORD_TYPES = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME'] as const;

async function queryDns(
  domain: string,
  recordType: string,
  signal: AbortSignal,
): Promise<DnsAnswer[]> {
  try {
    const response = await fetch(
      `${DOH_URL}?name=${encodeURIComponent(domain)}&type=${recordType}`,
      {
        headers: { Accept: 'application/dns-json' },
        signal,
      },
    );

    if (!response.ok) return [];

    const data = (await response.json()) as DnsResponse;
    return data.Answer || [];
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    logger.warn(`DNS query failed for ${domain} ${recordType}`, {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return [];
  }
}

import { normalizeDomain } from '@nexusgraph/shared';

export const dnsCollector: Collector = {
  name: 'dns',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL' || inputType === 'EMAIL';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    let rawDomain = input.trim();
    if (rawDomain.includes('@')) {
      rawDomain = rawDomain.split('@')[1] || rawDomain;
    }
    const domain = normalizeDomain(rawDomain);
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    logger.info('DNS collector started', {
      requestId: ctx.requestId,
      domain,
    });

    // Query all record types in parallel
    const results = await Promise.all(
      DNS_RECORD_TYPES.map(async (type) => ({
        type,
        answers: await queryDns(domain, type, ctx.signal),
      })),
    );

    for (const { type, answers } of results) {
      for (const answer of answers) {
        switch (type) {
          case 'A':
          case 'AAAA': {
            const ip = answer.data;
            entities.push({
              type: 'IP_ADDRESS',
              value: ip,
              confidence: 95,
              metadata: {
                recordType: type,
                ttl: answer.TTL,
                source: {
                  url: `dns://${domain}/${type}`,
                  collector: 'dns',
                  transform: 'domain.resolve-dns',
                  derivedFrom: domain,
                  collectedAt,
                },
              },
            });
            relationships.push({
              source_value: domain,
              source_type: 'DOMAIN',
              target_value: ip,
              target_type: 'IP_ADDRESS',
              relationship_type: 'RESOLVES_TO',
              confidence: 95,
              reason: `DNS ${type} record: ${domain} resolves to ${ip}`,
            });
            evidence.push({
              source_url: `dns://${domain}/${type}`,
              source_type: 'DNS_RECORD',
              title: `${type} Record: ${ip}`,
              extracted_value: ip,
              confidence: 95,
              metadata: { recordType: type, ttl: answer.TTL, domain },
            });
            break;
          }

          case 'MX': {
            // MX data format: "priority hostname"
            const parts = answer.data.split(' ');
            const mailServer = (parts[1] || parts[0]).replace(/\.$/, '');
            entities.push({
              type: 'DOMAIN',
              value: mailServer,
              title: `MX (${parts[0] || '10'}): ${mailServer}`,
              confidence: 90,
              metadata: {
                recordType: 'MX',
                priority: parts[0],
                source: {
                  url: `dns://${domain}/MX`,
                  collector: 'dns',
                  transform: 'domain.resolve-dns',
                  derivedFrom: domain,
                  collectedAt,
                },
              },
            });
            relationships.push({
              source_value: domain,
              source_type: 'DOMAIN',
              target_value: mailServer,
              target_type: 'DOMAIN',
              relationship_type: 'OBSERVED_ON',
              confidence: 90,
              reason: `MX record: ${domain} uses mail server ${mailServer}`,
            });
            evidence.push({
              source_url: `dns://${domain}/MX`,
              source_type: 'DNS_RECORD',
              title: `MX Record: ${mailServer}`,
              extracted_value: answer.data,
              confidence: 90,
              metadata: { recordType: 'MX', priority: parts[0], mailServer },
            });
            break;
          }

          case 'NS': {
            const nameserver = answer.data.replace(/\.$/, '');
            entities.push({
              type: 'DOMAIN',
              value: nameserver,
              title: `NS: ${nameserver}`,
              confidence: 90,
              metadata: {
                recordType: 'NS',
                source: {
                  url: `dns://${domain}/NS`,
                  collector: 'dns',
                  transform: 'domain.resolve-dns',
                  derivedFrom: domain,
                  collectedAt,
                },
              },
            });
            relationships.push({
              source_value: domain,
              source_type: 'DOMAIN',
              target_value: nameserver,
              target_type: 'DOMAIN',
              relationship_type: 'HOSTED_ON',
              confidence: 90,
              reason: `NS record: ${domain} uses nameserver ${nameserver}`,
            });
            evidence.push({
              source_url: `dns://${domain}/NS`,
              source_type: 'DNS_RECORD',
              title: `NS Record: ${nameserver}`,
              extracted_value: nameserver,
              confidence: 90,
              metadata: { recordType: 'NS', nameserver },
            });
            break;
          }

          case 'CNAME': {
            const target = answer.data.replace(/\.$/, '');
            entities.push({
              type: 'DOMAIN',
              value: target,
              confidence: 85,
              metadata: {
                recordType: 'CNAME',
                source: {
                  url: `dns://${domain}/CNAME`,
                  collector: 'dns',
                  transform: 'domain.resolve-dns',
                  derivedFrom: domain,
                  collectedAt,
                },
              },
            });
            relationships.push({
              source_value: domain,
              source_type: 'DOMAIN',
              target_value: target,
              target_type: 'DOMAIN',
              relationship_type: 'RESOLVES_TO',
              confidence: 85,
              reason: `CNAME record: ${domain} is an alias for ${target}`,
            });
            evidence.push({
              source_url: `dns://${domain}/CNAME`,
              source_type: 'DNS_RECORD',
              title: `CNAME Record: ${target}`,
              extracted_value: target,
              confidence: 85,
              metadata: { recordType: 'CNAME', target },
            });
            break;
          }

          case 'TXT': {
            // Store TXT records as evidence — can reveal SPF, DKIM, verification records
            evidence.push({
              source_url: `dns://${domain}/TXT`,
              source_type: 'DNS_RECORD',
              title: `TXT Record`,
              extracted_value: answer.data,
              confidence: 80,
              metadata: { recordType: 'TXT', value: answer.data },
            });
            break;
          }
        }
      }
    }

    if (entities.length === 0 && evidence.length === 0) {
      warnings.push(`No DNS records found for ${domain}`);
    }

    logger.info('DNS collector completed', {
      requestId: ctx.requestId,
      domain,
      entityCount: entities.length,
      relationshipCount: relationships.length,
      evidenceCount: evidence.length,
    });

    return {
      source: `dns://${domain}`,
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
