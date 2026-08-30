/**
 * WHOIS / RDAP Collector — Registration & Infrastructure Data via RFC 7483 RDAP
 *
 * Queries open RDAP endpoints (rdap.org / authoritative RDAP servers) to extract:
 * - Registrar name and IANA ID
 * - Registration date, expiration date, and last modified date
 * - Authoritative Name Servers
 * - Domain status codes (e.g. clientTransferProhibited)
 * - Registrant organization/contact (when publicly available)
 *
 * Applies to DOMAIN, URL, and WEBSITE entities.
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
import { normalizeDomain } from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

/** Extract string value from vCard JSON structure [ "vcard", [ [ "prop", {}, "type", "val" ] ] ] */
function extractVCardProperty(vcardArray: any[], propName: string): string | null {
  if (!Array.isArray(vcardArray) || vcardArray.length < 2 || !Array.isArray(vcardArray[1])) {
    return null;
  }
  for (const item of vcardArray[1]) {
    if (Array.isArray(item) && item[0] === propName && item.length >= 4) {
      const val = item[3];
      if (typeof val === 'string' && val.trim()) return val.trim();
      if (Array.isArray(val)) return val.filter(Boolean).join(', ');
    }
  }
  return null;
}

/** Derive apex domain from string */
export function deriveApexForRdap(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  try {
    if (value.includes('://')) {
      value = new URL(value).hostname;
    }
  } catch {
    return null;
  }
  value = value.split('/')[0].split(':')[0].replace(/^www\./, '');
  const normalized = normalizeDomain(value);
  if (!normalized || !normalized.includes('.') || normalized.length > 253) return null;
  return normalized;
}

export const whoisRdapCollector: Collector = {
  name: 'whois-rdap',

  supports(inputType: SeedType): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL' || inputType === 'ORGANIZATION';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    const apex = deriveApexForRdap(input);
    if (!apex) {
      warnings.push(`Could not derive a valid apex domain from "${input}".`);
      return { source: 'whois-rdap', collectedAt, entities, relationships, evidence, warnings };
    }

    const rdapUrl = `https://rdap.org/domain/${encodeURIComponent(apex)}`;
    logger.info('WHOIS RDAP lookup starting', { requestId: ctx.requestId, apex, url: rdapUrl });

    let rdapData: any = null;

    try {
      const response = await safeFetch(rdapUrl, {
        method: 'GET',
        signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS + 3_000)]),
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxRedirects: 5,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: {
          Accept: 'application/rdap+json, application/json',
          'User-Agent': 'NexusGraph-OSINT/1.0 (WHOIS RDAP Query)',
        },
      });

      if (response.status === 404) {
        warnings.push(`No RDAP record found for domain "${apex}" (HTTP 404).`);
        return { source: 'whois-rdap', collectedAt, entities, relationships, evidence, warnings };
      }

      if (!response.ok) {
        warnings.push(`RDAP server returned HTTP ${response.status} for "${apex}".`);
        return { source: 'whois-rdap', collectedAt, entities, relationships, evidence, warnings };
      }

      const bodyText = await readResponseWithLimit(response, MAX_BODY_BYTES);
      rdapData = JSON.parse(bodyText);
    } catch (err: any) {
      warnings.push(`RDAP lookup failed for "${apex}": ${err.message}`);
      return { source: 'whois-rdap', collectedAt, entities, relationships, evidence, warnings };
    }

    if (!rdapData || typeof rdapData !== 'object') {
      warnings.push(`Invalid RDAP JSON received for "${apex}".`);
      return { source: 'whois-rdap', collectedAt, entities, relationships, evidence, warnings };
    }

    // 1. Extract Events (Registration, Expiration, Last Changed)
    let registrationDate: string | null = null;
    let expirationDate: string | null = null;
    let lastChangedDate: string | null = null;

    if (Array.isArray(rdapData.events)) {
      for (const ev of rdapData.events) {
        if (ev.eventAction === 'registration') registrationDate = ev.eventDate;
        if (ev.eventAction === 'expiration') expirationDate = ev.eventDate;
        if (ev.eventAction === 'last changed' || ev.eventAction === 'last update of RDAP database') {
          lastChangedDate = ev.eventDate;
        }
      }
    }

    // 2. Extract Entities (Registrar, Registrant)
    let registrarName: string | null = null;
    let registrantName: string | null = null;
    let registrantOrg: string | null = null;

    if (Array.isArray(rdapData.entities)) {
      for (const ent of rdapData.entities) {
        const roles: string[] = Array.isArray(ent.roles) ? ent.roles : [];

        // Registrar
        if (roles.includes('registrar')) {
          const fn = extractVCardProperty(ent.vcardArray, 'fn');
          const org = extractVCardProperty(ent.vcardArray, 'org');
          registrarName = fn || org || ent.handle || null;
        }

        // Registrant
        if (roles.includes('registrant')) {
          registrantName = extractVCardProperty(ent.vcardArray, 'fn');
          registrantOrg = extractVCardProperty(ent.vcardArray, 'org');
        }
      }
    }

    // 3. Extract Nameservers
    const nameservers: string[] = [];
    if (Array.isArray(rdapData.nameservers)) {
      for (const ns of rdapData.nameservers) {
        const nsHost = (ns.ldhName || ns.handle || '').toLowerCase().trim();
        if (nsHost && nsHost.includes('.')) {
          nameservers.push(nsHost);
        }
      }
    }

    // 4. Status codes
    const statusCodes: string[] = Array.isArray(rdapData.status) ? rdapData.status : [];

    // ─── Build Entities & Relationships ─────────────────────────────

    // Registrar entity
    if (registrarName) {
      const cleanRegistrar = registrarName.trim();
      entities.push({
        type: 'ORGANIZATION',
        value: cleanRegistrar,
        title: `Domain Registrar: ${cleanRegistrar}`,
        confidence: 90,
        metadata: {
          role: 'registrar',
          domain: apex,
          discoveredVia: 'whois-rdap',
          source: {
            url: rdapUrl,
            collector: 'whois-rdap',
            transform: 'domain.whois-rdap',
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: apex,
        source_type: 'DOMAIN',
        target_value: cleanRegistrar,
        target_type: 'ORGANIZATION',
        relationship_type: 'BELONGS_TO',
        confidence: 90,
        reason: `Domain ${apex} is registered with ${cleanRegistrar} according to authoritative RDAP records.`,
      });
    }

    // Registrant entity (if non-redacted public identity)
    const registrantValue = registrantOrg || registrantName;
    const isRedacted =
      !registrantValue ||
      /privacy|redacted|whoisguard|withheld|proxy|protected|gdpr/i.test(registrantValue);

    if (registrantValue && !isRedacted) {
      const isPerson = Boolean(registrantName && !registrantOrg);
      const targetType = isPerson ? 'PERSON' : 'ORGANIZATION';
      const cleanRegistrant = registrantValue.trim();

      entities.push({
        type: targetType,
        value: cleanRegistrant,
        title: `Domain Registrant: ${cleanRegistrant}`,
        confidence: 85,
        metadata: {
          role: 'registrant',
          domain: apex,
          discoveredVia: 'whois-rdap',
          source: {
            url: rdapUrl,
            collector: 'whois-rdap',
            transform: 'domain.whois-rdap',
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: cleanRegistrant,
        source_type: targetType,
        target_value: apex,
        target_type: 'DOMAIN',
        relationship_type: 'OWNS_DOMAIN',
        confidence: 85,
        reason: `Public RDAP record identifies ${cleanRegistrant} as the registrant of ${apex}.`,
      });
    }

    // Nameserver entities
    for (const ns of nameservers) {
      const normalizedNs = normalizeDomain(ns);
      if (normalizedNs) {
        entities.push({
          type: 'NS_RECORD',
          value: normalizedNs,
          title: `Nameserver: ${normalizedNs}`,
          confidence: 90,
          metadata: {
            domain: apex,
            discoveredVia: 'whois-rdap',
            source: {
              url: rdapUrl,
              collector: 'whois-rdap',
              transform: 'domain.whois-rdap',
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: apex,
          source_type: 'DOMAIN',
          target_value: normalizedNs,
          target_type: 'NS_RECORD',
          relationship_type: 'HOSTED_ON',
          confidence: 90,
          reason: `Domain ${apex} delegates DNS resolution to authoritative nameserver ${normalizedNs}.`,
        });
      }
    }

    // ─── Build Evidence Record ──────────────────────────────────────

    const summaryParts: string[] = [];
    if (registrarName) summaryParts.push(`Registrar: ${registrarName}`);
    if (registrationDate) summaryParts.push(`Created: ${registrationDate.split('T')[0]}`);
    if (expirationDate) summaryParts.push(`Expires: ${expirationDate.split('T')[0]}`);
    if (nameservers.length > 0) summaryParts.push(`Nameservers: ${nameservers.slice(0, 4).join(', ')}`);
    if (statusCodes.length > 0) summaryParts.push(`Status: ${statusCodes.slice(0, 3).join(', ')}`);

    evidence.push({
      source_url: rdapUrl,
      source_type: 'WHOIS_RDAP',
      title: `WHOIS / RDAP Record for ${apex}`,
      extracted_value: summaryParts.join(' | ') || `RDAP record retrieved for ${apex}`,
      confidence: 95,
      metadata: {
        domain: apex,
        handle: rdapData.handle || null,
        registrar: registrarName,
        registrationDate,
        expirationDate,
        lastChangedDate,
        nameservers,
        status: statusCodes,
        isRegistrantRedacted: isRedacted,
        registrant: isRedacted ? 'REDACTED / PRIVACY' : registrantValue,
      },
    });

    logger.info('WHOIS RDAP lookup completed', {
      requestId: ctx.requestId,
      apex,
      registrar: registrarName,
      nameserverCount: nameservers.length,
      hasRegistrant: !isRedacted,
    });

    return { source: 'whois-rdap', collectedAt, entities, relationships, evidence, warnings };
  },
};
