/**
 * DNS Security Audit Collector
 *
 * Performs comprehensive security audit of DNS configurations:
 * 1. SPF Record & Email Spoofing Assessment (-all vs ~all vs ?all/+all)
 * 2. DMARC Policy Enforcement (_dmarc.<domain> p=reject, quarantine, none)
 * 3. DKIM Common Selector Probing
 * 4. SaaS & Cloud Verification Identifier (Google, MS365, Atlassian, Stripe, etc.)
 * 5. CAA (Certification Authority Authorization) Record Audit
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { normalizeDomain, normalizeEmail } from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

const DOH_URL = 'https://cloudflare-dns.com/dns-query';

interface DnsAnswer {
  name: string;
  type: number;
  data: string;
}

interface DnsResponse {
  Status: number;
  Answer?: DnsAnswer[];
}

async function queryDoh(name: string, type: string, signal: AbortSignal): Promise<DnsAnswer[]> {
  try {
    const res = await fetch(`${DOH_URL}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`, {
      headers: { Accept: 'application/dns-json' },
      signal,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as DnsResponse;
    return json.Answer || [];
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    return [];
  }
}

// SaaS vendor verification patterns in TXT records
const SAAS_VERIFICATION_PATTERNS = [
  { pattern: /google-site-verification=([a-zA-Z0-9_-]+)/i, name: 'Google Cloud / Workspace', vendor: 'Google' },
  { pattern: /(?:MS=ms|v=verifydomain)([a-zA-Z0-9_-]+)/i, name: 'Microsoft 365 / Azure', vendor: 'Microsoft' },
  { pattern: /atlassian-domain-verification=([a-zA-Z0-9_-]+)/i, name: 'Atlassian Jira/Confluence', vendor: 'Atlassian' },
  { pattern: /stripe-verification=([a-zA-Z0-9_-]+)/i, name: 'Stripe Payments', vendor: 'Stripe' },
  { pattern: /apple-developer-domain-association=([a-zA-Z0-9_-]+)/i, name: 'Apple Developer', vendor: 'Apple' },
  { pattern: /facebook-domain-verification=([a-zA-Z0-9_-]+)/i, name: 'Meta / Facebook Business', vendor: 'Meta' },
  { pattern: /adobe-idp-site-verification=([a-zA-Z0-9_-]+)/i, name: 'Adobe Creative Cloud', vendor: 'Adobe' },
  { pattern: /docusign=([a-zA-Z0-9_-]+)/i, name: 'DocuSign', vendor: 'DocuSign' },
  { pattern: /zoom-domain-verification=([a-zA-Z0-9_-]+)/i, name: 'Zoom Video Communications', vendor: 'Zoom' },
  { pattern: /cisco-ci-domain-verification=([a-zA-Z0-9_-]+)/i, name: 'Cisco Webex', vendor: 'Cisco' },
  { pattern: /1password-site-verification=([a-zA-Z0-9_-]+)/i, name: '1Password Enterprise', vendor: '1Password' },
  { pattern: /postman-domain-verification=([a-zA-Z0-9_-]+)/i, name: 'Postman API Platform', vendor: 'Postman' },
  { pattern: /statuspage-domain-verification=([a-zA-Z0-9_-]+)/i, name: 'Atlassian Statuspage', vendor: 'Statuspage' },
  { pattern: /hubspot-developer-verification=([a-zA-Z0-9_-]+)/i, name: 'HubSpot CRM', vendor: 'HubSpot' },
  { pattern: /miro-verification=([a-zA-Z0-9_-]+)/i, name: 'Miro Visual Platform', vendor: 'Miro' },
];

// Common third-party email providers in SPF
const KNOWN_SPF_SERVICES = [
  { match: '_spf.google.com', name: 'Google Workspace' },
  { match: 'spf.protection.outlook.com', name: 'Microsoft 365 Exchange' },
  { match: 'sendgrid.net', name: 'SendGrid' },
  { match: 'mailgun.org', name: 'Mailgun' },
  { match: 'amazonses.com', name: 'Amazon Simple Email Service (SES)' },
  { match: 'servers.mcsv.net', name: 'Mailchimp' },
  { match: 'mail.zendesk.com', name: 'Zendesk Support' },
  { match: 'spf.mtasv.net', name: 'Postmark' },
  { match: 'zoho.com', name: 'Zoho Mail' },
  { match: 'mailjet.com', name: 'Mailjet' },
];

export const dnsSecurityAuditCollector: Collector = {
  name: 'dns-security-audit',

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
    } else if (raw.includes('://')) {
      try {
        raw = new URL(raw).hostname;
      } catch {
        // Keep raw
      }
    }
    const domain = normalizeDomain(raw);

    if (!domain || !domain.includes('.')) {
      warnings.push(`Invalid domain input for DNS security audit: "${input}"`);
      return { source: 'dns-security-audit', collectedAt, entities, relationships, evidence, warnings };
    }

    logger.info('DNS security audit started', {
      requestId: ctx.requestId,
      domain,
    });

    try {
      // 1. Fetch Apex TXT records
      const txtAnswers = await queryDoh(domain, 'TXT', ctx.signal);
      const rawTxts = txtAnswers.map((a) => a.data.replace(/^"|"$/g, '').trim());

      // ─── 1.1 SPF Record Analysis ─────────────────────────────────────
      const spfRecord = rawTxts.find((t) => t.startsWith('v=spf1'));
      let spfStatus: 'HARD_FAIL' | 'SOFT_FAIL' | 'NEUTRAL_OR_PASS' | 'MISSING' = 'MISSING';
      let spfMechanism = 'None';
      const authorizedSenders: string[] = [];
      const discoveredSpfServices: string[] = [];

      if (spfRecord) {
        if (spfRecord.includes('-all')) {
          spfStatus = 'HARD_FAIL';
          spfMechanism = '-all (Hard Fail: Unapproved senders rejected — Secure)';
        } else if (spfRecord.includes('~all')) {
          spfStatus = 'SOFT_FAIL';
          spfMechanism = '~all (Soft Fail: Unapproved senders accepted but marked spam — Moderate risk)';
        } else if (spfRecord.includes('?all') || spfRecord.includes('+all')) {
          spfStatus = 'NEUTRAL_OR_PASS';
          spfMechanism = '?all / +all (Permissive / Neutral — High risk of email spoofing)';
        } else {
          spfMechanism = 'No "all" mechanism defined — Incomplete SPF';
        }

        // Extract authorized includes/ip4
        const parts = spfRecord.split(/\s+/);
        for (const part of parts) {
          if (part.startsWith('include:') || part.startsWith('ip4:') || part.startsWith('ip6:')) {
            authorizedSenders.push(part);
            for (const svc of KNOWN_SPF_SERVICES) {
              if (part.toLowerCase().includes(svc.match.toLowerCase()) && !discoveredSpfServices.includes(svc.name)) {
                discoveredSpfServices.push(svc.name);
              }
            }
          }
        }
      }

      // ─── 1.2 DMARC Record Analysis ───────────────────────────────────
      const dmarcAnswers = await queryDoh(`_dmarc.${domain}`, 'TXT', ctx.signal);
      const dmarcTxt = dmarcAnswers.map((a) => a.data.replace(/^"|"$/g, '').trim()).find((t) => t.startsWith('v=DMARC1'));

      let dmarcPolicy: 'REJECT' | 'QUARANTINE' | 'NONE' | 'MISSING' = 'MISSING';
      let dmarcPercentage = 100;
      let dmarcReportingEmails: string[] = [];

      if (dmarcTxt) {
        const policyMatch = /p=([a-zA-Z]+)/i.exec(dmarcTxt);
        const policyStr = policyMatch ? policyMatch[1].toLowerCase() : 'none';
        if (policyStr === 'reject') dmarcPolicy = 'REJECT';
        else if (policyStr === 'quarantine') dmarcPolicy = 'QUARANTINE';
        else dmarcPolicy = 'NONE';

        const pctMatch = /pct=(\d+)/i.exec(dmarcTxt);
        if (pctMatch) dmarcPercentage = parseInt(pctMatch[1], 10);

        const ruaMatch = /rua=mailto:([^;\s]+)/i.exec(dmarcTxt);
        if (ruaMatch) {
          dmarcReportingEmails = ruaMatch[1]
            .split(',')
            .map((e) => e.trim().replace(/^mailto:/i, ''))
            .filter(Boolean);
        }

        // If reporting emails belong to external monitoring SaaS (e.g. dmarcian, valimail, agari)
        for (const repEmail of dmarcReportingEmails) {
          try {
            const normRep = normalizeEmail(repEmail);
            const repDomain = normRep.split('@')[1];
            if (repDomain && repDomain !== domain) {
              entities.push({
                type: 'EMAIL',
                value: normRep,
                title: `DMARC Reporting Contact: ${normRep}`,
                confidence: 90,
                metadata: {
                  role: 'DMARC_RUA_REPORTING',
                  originDomain: domain,
                  monitoringDomain: repDomain,
                  source: {
                    collector: 'dns-security-audit',
                    transform: 'domain.dns-security-audit',
                    derivedFrom: domain,
                    collectedAt,
                  },
                },
              });

              relationships.push({
                source_value: domain,
                source_type: 'DOMAIN',
                target_value: normRep,
                target_type: 'EMAIL',
                relationship_type: 'RELATED_TO',
                confidence: 90,
                reason: `Domain mengirimkan laporan agregat kepatuhan email DMARC (RUA) ke ${normRep}`,
              });
            }
          } catch {
            // ignore invalid email parsing
          }
        }
      }

      // ─── 1.3 DKIM Common Selectors Probing ───────────────────────────
      const commonDkimSelectors = ['google', 'default', 'k1', 'selector1', 's1', 'mail', 'mx'];
      const activeDkimSelectors: string[] = [];

      await Promise.all(
        commonDkimSelectors.map(async (sel) => {
          const dkimAnswers = await queryDoh(`${sel}._domainkey.${domain}`, 'TXT', ctx.signal);
          const hasKey = dkimAnswers.some((a) => a.data.includes('p=') || a.data.includes('v=DKIM1'));
          if (hasKey) activeDkimSelectors.push(sel);
        }),
      );

      // ─── 1.4 SaaS & Cloud Verification Tokens from TXT ───────────────
      const verifiedSaasProviders: Array<{ name: string; vendor: string; token: string }> = [];

      for (const txt of rawTxts) {
        for (const saas of SAAS_VERIFICATION_PATTERNS) {
          const match = saas.pattern.exec(txt);
          if (match) {
            const token = match[1];
            verifiedSaasProviders.push({ name: saas.name, vendor: saas.vendor, token });

            // Create Organization entity for the verified SaaS provider
            entities.push({
              type: 'ORGANIZATION',
              value: saas.vendor,
              title: `Layanan SaaS Terverifikasi: ${saas.name}`,
              confidence: 95,
              metadata: {
                saasCategory: 'VERIFIED_CLOUD_SERVICE',
                providerName: saas.name,
                verificationToken: token,
                verificationRecord: txt,
                source: {
                  collector: 'dns-security-audit',
                  transform: 'domain.dns-security-audit',
                  derivedFrom: domain,
                  collectedAt,
                },
              },
            });

            relationships.push({
              source_value: domain,
              source_type: 'DOMAIN',
              target_value: saas.vendor,
              target_type: 'ORGANIZATION',
              relationship_type: 'RELATED_TO',
              confidence: 95,
              reason: `Domain memverifikasi integrasi resmi dengan ${saas.name} melalui DNS TXT record (${txt.slice(0, 45)}...)`,
            });
          }
        }
      }

      // ─── 1.5 CAA Record Audit (RFC 6844) ─────────────────────────────
      // CAA record query (Type 257)
      const caaAnswers = await queryDoh(domain, 'CAA', ctx.signal);
      const authorizedCAs: string[] = [];
      for (const a of caaAnswers) {
        const caMatch = /issue\s+"?([a-zA-Z0-9.-]+)"?/i.exec(a.data);
        if (caMatch && !authorizedCAs.includes(caMatch[1])) {
          authorizedCAs.push(caMatch[1]);
        }
      }

      // ─── Compile Findings & Overall Email Security Score ─────────────
      let emailSecurityGrade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL' = 'POOR';
      if (dmarcPolicy === 'REJECT' && spfStatus === 'HARD_FAIL') {
        emailSecurityGrade = 'EXCELLENT';
      } else if (dmarcPolicy === 'REJECT' || (dmarcPolicy === 'QUARANTINE' && spfStatus !== 'MISSING')) {
        emailSecurityGrade = 'GOOD';
      } else if (dmarcPolicy === 'NONE' || spfStatus === 'SOFT_FAIL') {
        emailSecurityGrade = 'FAIR';
      } else if (dmarcPolicy === 'MISSING' && spfStatus === 'MISSING') {
        emailSecurityGrade = 'CRITICAL';
      }

      // Evidence 1: DNS Security & Email Spoofing Audit
      evidence.push({
        source_url: `dns://${domain}/SECURITY_AUDIT`,
        source_type: 'DNS_SECURITY_AUDIT',
        title: `Audit Keamanan DNS & Proteksi Email Spoofing (${domain})`,
        extracted_value: `Grade: ${emailSecurityGrade} | DMARC: ${dmarcPolicy} (${dmarcPercentage}%) | SPF: ${spfStatus} (${spfMechanism}) | DKIM: ${activeDkimSelectors.length > 0 ? activeDkimSelectors.join(', ') : 'No common selectors'}`,
        confidence: 95,
        metadata: {
          domain,
          emailSecurityGrade,
          spf: {
            status: spfStatus,
            record: spfRecord || null,
            mechanism: spfMechanism,
            authorizedSenders,
            detectedServices: discoveredSpfServices,
          },
          dmarc: {
            policy: dmarcPolicy,
            record: dmarcTxt || null,
            percentage: dmarcPercentage,
            ruaEmails: dmarcReportingEmails,
          },
          dkim: {
            activeSelectors: activeDkimSelectors,
          },
          caa: {
            hasCaa: authorizedCAs.length > 0,
            authorizedCAs,
          },
          verifiedSaasCount: verifiedSaasProviders.length,
          verifiedSaas: verifiedSaasProviders,
        },
      });

      // Evidence 2: SaaS Provider Verification Summary
      if (verifiedSaasProviders.length > 0) {
        evidence.push({
          source_url: `dns://${domain}/TXT-SAAS`,
          source_type: 'DNS_SECURITY_AUDIT',
          title: `Vendor Cloud & Layanan SaaS Terverifikasi (${verifiedSaasProviders.length} Vendor)`,
          extracted_value: verifiedSaasProviders.map((s) => s.name).join(', '),
          confidence: 95,
          metadata: {
            domain,
            count: verifiedSaasProviders.length,
            providers: verifiedSaasProviders,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      warnings.push(`DNS security audit failed: ${message}`);
      logger.warn('DNS security audit collector error', {
        requestId: ctx.requestId,
        domain,
        error: message,
      });
    }

    logger.info('DNS security audit completed', {
      requestId: ctx.requestId,
      domain,
      entitiesFound: entities.length,
      evidenceFound: evidence.length,
    });

    return {
      source: `dns-audit://${domain}`,
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
