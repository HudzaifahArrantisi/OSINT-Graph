/**
 * Sensitive Query Parameter & Authentication Route Classifier
 *
 * Classifies URLs, endpoints, and HTTP parameters into security risk categories:
 * - AUTH_TOKEN (Tokens, JWTs, API Keys, Sessions)
 * - SSRF_REDIRECT (Open Redirect & SSRF Vectors)
 * - FILE_INCLUSION (Path Traversal & Local File Inclusion)
 * - DEBUG_ADMIN (Internal Debug Modes, Admin & Staging Routes)
 * - IDOR_PARAM (Object References, Account & Order IDs)
 * - SQLI_QUERY (Database Queries, Filtering & Sort Parameters)
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

const SENSITIVE_PARAM_PATTERNS = [
  {
    category: 'AUTH_TOKEN',
    severity: 'CRITICAL',
    label: 'Authentication & Secret Tokens',
    patterns: [
      /^(?:access_?token|auth(?:_?token)?|jwt|api_?key|bearer|secret|session(?:_?id)?|sid|ticket|signature|private_?key|app_?secret)$/i,
    ],
  },
  {
    category: 'SSRF_REDIRECT',
    severity: 'HIGH',
    label: 'Redirect & SSRF Vectors',
    patterns: [
      /^(?:redirect(?:_?url|_?to)?|url|dest(?:ination)?|callback(?:_?url)?|next|return(?:_?url)?|continue|target|forward|goto|out|host|domain)$/i,
    ],
  },
  {
    category: 'FILE_INCLUSION',
    severity: 'HIGH',
    label: 'File & Path Traversal Vectors',
    patterns: [
      /^(?:file(?:name)?|path|page|doc(?:ument)?|folder|root|template|include|view|load|dir)$/i,
    ],
  },
  {
    category: 'DEBUG_ADMIN',
    severity: 'MEDIUM',
    label: 'Debug & Administrative Controls',
    patterns: [
      /^(?:debug|test|admin|adm|dev|internal|staging|demo|actuator|trace|backdoor|console|env)$/i,
    ],
  },
  {
    category: 'IDOR_PARAM',
    severity: 'MEDIUM',
    label: 'Direct Object References (IDOR)',
    patterns: [
      /^(?:id|user_?id|uid|account_?id|order_?id|invoice_?id|item_?id|client_?id|profile_?id|member_?id|cust_?id)$/i,
    ],
  },
  {
    category: 'SQLI_QUERY',
    severity: 'LOW',
    label: 'Search, Filter & Database Queries',
    patterns: [
      /^(?:query|search|q|filter|order(?:_?by)?|sort(?:_?by)?|select|where|col(?:umn)?|table)$/i,
    ],
  },
];

const SENSITIVE_ROUTE_PATTERNS = [
  { category: 'DEBUG_ADMIN', pattern: /\/(?:admin|dashboard|management|portal|controlpanel|phpmyadmin)\b/i, label: 'Admin Portal' },
  { category: 'DEBUG_ADMIN', pattern: /\/(?:swagger|api-docs|graphiql|graphql|actuator|metrics|env|health)\b/i, label: 'API Introspection / Actuator' },
  { category: 'AUTH_TOKEN', pattern: /\/(?:oauth|auth|login|signin|token|sso|saml|jwt)\b/i, label: 'Authentication Route' },
  { category: 'DEBUG_ADMIN', pattern: /\/(?:staging|internal|dev|testing|demo|backup|dump)\b/i, label: 'Internal / Staging Route' },
];

export interface ClassifiedFinding {
  url: string;
  paramName?: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  label: string;
  source: 'QUERY_PARAM' | 'ROUTE_PATH';
}

export const sensitiveUrlClassifierCollector: Collector = {
  name: 'sensitive-url-classifier',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    let targetUrl: string;
    let targetDomain: string;

    if (input.includes('://')) {
      const v = validateUrl(input);
      if (!v.safe) {
        warnings.push(`URL rejected by SSRF guard: ${v.reason}`);
        return { source: 'sensitive-url-classifier', collectedAt, entities, relationships, evidence, warnings };
      }
      targetUrl = input;
      try {
        targetDomain = normalizeDomain(new URL(input).hostname);
      } catch {
        targetDomain = normalizeDomain(input);
      }
    } else {
      targetDomain = normalizeDomain(input);
      targetUrl = `https://${targetDomain}`;
    }

    if (!targetDomain || !targetDomain.includes('.')) {
      warnings.push(`Invalid domain input for sensitive URL classification: "${input}"`);
      return { source: 'sensitive-url-classifier', collectedAt, entities, relationships, evidence, warnings };
    }

    logger.info('Sensitive parameter & route classification started', {
      requestId: ctx.requestId,
      domain: targetDomain,
    });

    const discoveredUrls = new Set<string>([targetUrl]);

    // 1. Scrape root page to extract embedded links and forms with parameters
    try {
      const response = await safeFetch(targetUrl, {
        method: 'GET',
        requestId: ctx.requestId,
        signal: ctx.signal,
        timeoutMs: 8_000,
        maxResponseBytes: 256 * 1024,
        headers: { 'User-Agent': 'NexusGraph-OSINT/1.0 (Sensitive URL Classifier)' },
      });

      if (response.status === 200) {
        const body = await readResponseWithLimit(response, 256 * 1024);

        // Extract href and src attributes containing queries or interesting paths
        const linkRegex = /(?:href|src|action)=["']([^"']+)["']/gi;
        let match;
        while ((match = linkRegex.exec(body)) !== null) {
          const rawLink = match[1].trim();
          if (rawLink.startsWith('#') || rawLink.startsWith('javascript:') || rawLink.startsWith('mailto:')) {
            continue;
          }
          try {
            const resolved = new URL(rawLink, targetUrl);
            if (resolved.hostname.endsWith(targetDomain)) {
              discoveredUrls.add(resolved.toString());
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (fetchErr) {
      // Non-fatal, analyze targetUrl itself
    }

    // 2. Classify discovered URLs and their query parameters
    const findings: ClassifiedFinding[] = [];
    const seenFindingKeys = new Set<string>();

    for (const urlStr of discoveredUrls) {
      let parsed: URL;
      try {
        parsed = new URL(urlStr);
      } catch {
        continue;
      }

      // 2.1 Check Query Parameters
      for (const [key] of parsed.searchParams.entries()) {
        for (const rule of SENSITIVE_PARAM_PATTERNS) {
          if (rule.patterns.some((p) => p.test(key))) {
            const findingKey = `${parsed.pathname}?${key}`;
            if (!seenFindingKeys.has(findingKey)) {
              seenFindingKeys.add(findingKey);
              findings.push({
                url: urlStr,
                paramName: key,
                category: rule.category,
                severity: rule.severity as any,
                label: `${rule.label} (?${key}=)`,
                source: 'QUERY_PARAM',
              });
            }
          }
        }
      }

      // 2.2 Check Sensitive Route Paths
      for (const routeRule of SENSITIVE_ROUTE_PATTERNS) {
        if (routeRule.pattern.test(parsed.pathname)) {
          const findingKey = parsed.pathname;
          if (!seenFindingKeys.has(findingKey)) {
            seenFindingKeys.add(findingKey);
            findings.push({
              url: urlStr,
              category: routeRule.category,
              severity: 'HIGH',
              label: `${routeRule.label} (${parsed.pathname})`,
              source: 'ROUTE_PATH',
            });
          }
        }
      }
    }

    // Sort findings by severity (CRITICAL -> HIGH -> MEDIUM -> LOW)
    const severityWeight: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    findings.sort((a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0));

    // Top high-priority findings surfaced as entities
    const topFindings = findings.slice(0, 15);
    for (const f of topFindings) {
      const entityValue = f.paramName ? `${targetUrl}?${f.paramName}=*` : f.url;
      const entityTitle = f.paramName ? `Param Berisiko: ?${f.paramName}= (${f.severity})` : `Route Sensitif: ${new URL(f.url).pathname}`;

      entities.push({
        type: 'URL',
        value: entityValue,
        title: entityTitle,
        confidence: 85,
        metadata: {
          riskCategory: f.category,
          severity: f.severity,
          label: f.label,
          paramName: f.paramName,
          sourceType: f.source,
          originUrl: f.url,
          source: {
            collector: 'sensitive-url-classifier',
            transform: 'domain.sensitive-url-classifier',
            derivedFrom: targetDomain,
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: targetDomain,
        source_type: 'DOMAIN',
        target_value: entityValue,
        target_type: 'URL',
        relationship_type: 'OBSERVED_ON',
        confidence: 85,
        reason: `Endpoint mengekspos vektor parameter/rute sensitif: ${f.label} [Tingkat Risiko: ${f.severity}]`,
      });
    }

    // Evidence: Summary of classification
    const summaryCountByCategory: Record<string, number> = {};
    for (const f of findings) {
      summaryCountByCategory[f.category] = (summaryCountByCategory[f.category] || 0) + 1;
    }

    evidence.push({
      source_url: targetUrl,
      source_type: 'SENSITIVE_PARAM_ANALYSIS',
      title: `Klasifikasi Parameter Sensitif & Rute Berisiko (${findings.length} Temuan)`,
      extracted_value:
        findings.length > 0
          ? Object.entries(summaryCountByCategory)
              .map(([cat, count]) => `${cat}: ${count}`)
              .join(' | ')
          : 'Tidak ada parameter sensitif berisiko tinggi yang terdeteksi pada root endpoint.',
      confidence: 90,
      metadata: {
        totalFindings: findings.length,
        categories: summaryCountByCategory,
        findings: findings.slice(0, 30),
      },
    });

    logger.info('Sensitive parameter & route classification completed', {
      requestId: ctx.requestId,
      domain: targetDomain,
      findingsCount: findings.length,
    });

    return {
      source: `param-classifier://${targetDomain}`,
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
