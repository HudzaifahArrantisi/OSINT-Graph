/**
 * TLS Certificate Collector — extracts public certificate metadata.
 * Uses a TLS connection to get cert info (subject, issuer, SAN, validity).
 * For Cloudflare Workers, falls back to HTTP-based cert checking services.
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

import { normalizeDomain } from '@nexusgraph/shared';

export const tlsCertificateCollector: Collector = {
  name: 'tls-certificate',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL' || inputType === 'EMAIL';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    let raw = input.trim();
    if (raw.includes('@')) {
      raw = raw.split('@')[1] || raw;
    }
    const domain = normalizeDomain(raw);

    logger.info('TLS certificate collector started', {
      requestId: ctx.requestId,
      domain,
    });

    try {
      // Try to get certificate via crt.sh (Certificate Transparency log aggregator)
      const crtShResponse = await fetch(
        `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`,
        {
          signal: ctx.signal,
          headers: { Accept: 'application/json' },
        },
      );

      if (crtShResponse.ok) {
        const certs = (await crtShResponse.json()) as Array<{
          id: number;
          issuer_ca_id: number;
          issuer_name: string;
          common_name: string;
          name_value: string;
          not_before: string;
          not_after: string;
          serial_number: string;
        }>;

        // Take the most recent certificates (limit to 10)
        const recentCerts = certs.slice(0, 10);

        // Collect unique SANs (Subject Alternative Names)
        const allSans = new Set<string>();

        for (const cert of recentCerts) {
          // Create certificate entity
          const certValue = `${cert.common_name} (${cert.serial_number?.slice(0, 16) || cert.id})`;
          entities.push({
            type: 'CERTIFICATE',
            value: certValue,
            title: `Certificate for ${cert.common_name}`,
            confidence: 90,
            metadata: {
              issuer: cert.issuer_name,
              commonName: cert.common_name,
              notBefore: cert.not_before,
              notAfter: cert.not_after,
              serialNumber: cert.serial_number,
              crtShId: cert.id,
              source: {
                url: `https://crt.sh/?id=${cert.id}`,
                collector: 'tls-certificate',
                transform: 'domain.find-tls',
                derivedFrom: domain,
                collectedAt,
              },
            },
          });

          // Relationship: domain uses this certificate
          relationships.push({
            source_value: domain,
            source_type: 'DOMAIN',
            target_value: certValue,
            target_type: 'CERTIFICATE',
            relationship_type: 'OBSERVED_ON',
            confidence: 90,
            reason: `Certificate Transparency log shows certificate issued for ${cert.common_name}`,
          });

          // Parse SAN values
          if (cert.name_value) {
            const sans = cert.name_value.split('\n').map((s) => s.trim()).filter(Boolean);
            for (const san of sans) {
              if (san !== domain && !san.startsWith('*')) {
                allSans.add(san);
              }
            }
          }

          // Evidence
          evidence.push({
            source_url: `https://crt.sh/?id=${cert.id}`,
            source_type: 'TLS_CERTIFICATE',
            title: `Certificate: ${cert.common_name}`,
            extracted_value: JSON.stringify({
              issuer: cert.issuer_name,
              commonName: cert.common_name,
              notBefore: cert.not_before,
              notAfter: cert.not_after,
              sans: cert.name_value,
            }),
            confidence: 90,
            metadata: {
              issuer: cert.issuer_name,
              commonName: cert.common_name,
              validity: { from: cert.not_before, to: cert.not_after },
            },
          });
        }

        // Create entities for discovered SANs
        for (const san of allSans) {
          entities.push({
            type: 'DOMAIN',
            value: san,
            title: `SAN from certificate for ${domain}`,
            confidence: 85,
            metadata: {
              discoveredFrom: 'tls-certificate',
              parentDomain: domain,
              source: {
                url: `https://crt.sh/?q=${encodeURIComponent(domain)}`,
                collector: 'tls-certificate',
                transform: 'domain.find-tls',
                derivedFrom: domain,
                collectedAt,
              },
            },
          });

          relationships.push({
            source_value: domain,
            source_type: 'DOMAIN',
            target_value: san,
            target_type: 'DOMAIN',
            relationship_type: 'RELATED_TO',
            confidence: 80,
            reason: `Shared TLS certificate — ${san} appears as SAN on certificate for ${domain}`,
          });
        }
      } else {
        warnings.push('Certificate Transparency lookup returned no results');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      warnings.push(`TLS certificate collection failed: ${message}`);
      logger.warn('TLS certificate collector error', {
        requestId: ctx.requestId,
        domain,
        error: message,
      });
    }

    logger.info('TLS certificate collector completed', {
      requestId: ctx.requestId,
      domain,
      entityCount: entities.length,
      evidenceCount: evidence.length,
    });

    return {
      source: `tls://${domain}`,
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
