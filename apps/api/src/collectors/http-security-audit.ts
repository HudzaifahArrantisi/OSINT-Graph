/**
 * HTTP Security Headers & WAF Health Audit Collector
 *
 * Inspects live target response headers to evaluate:
 *  1. Active Web Application Firewall (WAF) / CDN protection:
 *     (Cloudflare, AWS CloudFront, Akamai, Fastly, Imperva, Azure Front Door)
 *  2. Server software identification (OpenResty, Nginx, Apache, Caddy, IIS)
 *  3. Defense-in-depth security header compliance:
 *     - Strict-Transport-Security (HSTS)
 *     - Content-Security-Policy (CSP)
 *     - X-Frame-Options (Clickjacking defense)
 *     - X-Content-Type-Options (MIME-sniffing defense)
 *     - Referrer-Policy & Permissions-Policy
 *     - CORS access control policies
 *  4. Quantitative security scoring & grade (A+ through F).
 *
 * All outbound requests strictly adhere to the NexusGraph SSRF guard.
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
import { safeFetch, validateUrl } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 64 * 1024; // Headers are in the first few KB

interface SecurityAuditReport {
  [key: string]: unknown;
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  detectedWaf: string | null;
  serverBanner: string | null;
  hsts: { present: boolean; raw?: string; maxAge?: number; includeSubDomains?: boolean; preload?: boolean };
  csp: { present: boolean; raw?: string; hasScriptSrc?: boolean };
  xFrameOptions: { present: boolean; value?: string; safe?: boolean };
  xContentTypeOptions: { present: boolean; isNosniff?: boolean };
  referrerPolicy: { present: boolean; value?: string };
  permissionsPolicy: { present: boolean };
  cors: { wildcard: boolean; raw?: string };
  findings: string[];
}

function evaluateHeaders(headers: Headers): SecurityAuditReport {
  let score = 100;
  const findings: string[] = [];

  // WAF Detection
  let detectedWaf: string | null = null;
  const server = headers.get('server') || '';
  const via = headers.get('via') || '';
  const cfRay = headers.get('cf-ray');
  const amzCfId = headers.get('x-amz-cf-id');
  const akamai = headers.get('x-akamai-transformed');
  const azure = headers.get('x-azure-ref');
  const fastly = headers.get('x-served-by');

  if (cfRay || server.toLowerCase().includes('cloudflare')) {
    detectedWaf = 'Cloudflare WAF / CDN';
  } else if (amzCfId || via.toLowerCase().includes('cloudfront')) {
    detectedWaf = 'AWS CloudFront WAF';
  } else if (akamai || server.toLowerCase().includes('akamai')) {
    detectedWaf = 'Akamai Edge / WAF';
  } else if (azure) {
    detectedWaf = 'Microsoft Azure Front Door';
  } else if (fastly) {
    detectedWaf = 'Fastly CDN';
  }

  // 1. HSTS
  const hstsRaw = headers.get('strict-transport-security');
  const hstsPresent = Boolean(hstsRaw);
  let hstsMaxAge = 0;
  let hstsIncludeSub = false;
  let hstsPreload = false;

  if (hstsRaw) {
    const maxAgeMatch = /max-age=(\d+)/i.exec(hstsRaw);
    if (maxAgeMatch) hstsMaxAge = parseInt(maxAgeMatch[1], 10);
    hstsIncludeSub = /includesubdomains/i.test(hstsRaw);
    hstsPreload = /preload/i.test(hstsRaw);
    if (hstsMaxAge < 10368000) {
      score -= 10;
      findings.push('HSTS max-age is short (< 120 days)');
    }
  } else {
    score -= 25;
    findings.push('Missing Strict-Transport-Security (HSTS) header');
  }

  // 2. CSP
  const cspRaw = headers.get('content-security-policy');
  const cspPresent = Boolean(cspRaw);
  if (!cspPresent) {
    score -= 25;
    findings.push('Missing Content-Security-Policy (CSP)');
  } else if (cspRaw && cspRaw.includes("'unsafe-eval'")) {
    score -= 5;
    findings.push("CSP contains 'unsafe-eval'");
  }

  // 3. X-Frame-Options
  const xfoRaw = headers.get('x-frame-options');
  const xfoPresent = Boolean(xfoRaw);
  const xfoSafe = xfoRaw ? ['DENY', 'SAMEORIGIN'].includes(xfoRaw.toUpperCase().trim()) : false;
  if (!xfoPresent && !cspPresent) {
    score -= 15;
    findings.push('Missing X-Frame-Options (Clickjacking vulnerability)');
  }

  // 4. X-Content-Type-Options
  const xctoRaw = headers.get('x-content-type-options');
  const xctoNosniff = xctoRaw?.toLowerCase().trim() === 'nosniff';
  if (!xctoNosniff) {
    score -= 10;
    findings.push('Missing X-Content-Type-Options: nosniff');
  }

  // 5. Referrer-Policy
  const refPol = headers.get('referrer-policy');
  const refPolPresent = Boolean(refPol);
  if (!refPolPresent) {
    score -= 5;
    findings.push('Missing Referrer-Policy');
  }

  // 6. Permissions-Policy
  const permPol = headers.get('permissions-policy') || headers.get('feature-policy');

  // 7. CORS
  const corsOrigin = headers.get('access-control-allow-origin');
  const isWildcardCors = corsOrigin === '*';
  if (isWildcardCors) {
    score -= 10;
    findings.push('Access-Control-Allow-Origin is set to wildcard (*) wildcard');
  }

  score = Math.max(0, Math.min(100, score));

  let grade: SecurityAuditReport['grade'] = 'F';
  if (score >= 95) grade = 'A+';
  else if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 55) grade = 'C';
  else if (score >= 40) grade = 'D';

  return {
    score,
    grade,
    detectedWaf,
    serverBanner: server || null,
    hsts: { present: hstsPresent, raw: hstsRaw || undefined, maxAge: hstsMaxAge, includeSubDomains: hstsIncludeSub, preload: hstsPreload },
    csp: { present: cspPresent, raw: cspRaw || undefined, hasScriptSrc: cspRaw?.includes('script-src') },
    xFrameOptions: { present: xfoPresent, value: xfoRaw || undefined, safe: xfoSafe },
    xContentTypeOptions: { present: Boolean(xctoRaw), isNosniff: xctoNosniff },
    referrerPolicy: { present: refPolPresent, value: refPol || undefined },
    permissionsPolicy: { present: Boolean(permPol) },
    cors: { wildcard: isWildcardCors, raw: corsOrigin || undefined },
    findings,
  };
}

export const httpSecurityAuditCollector: Collector = {
  name: 'http-security-audit',

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
    let domain: string;

    if (input.includes('://')) {
      const validation = validateUrl(input);
      if (!validation.safe) {
        warnings.push(`URL rejected by SSRF guard: ${validation.reason}`);
        return { source: 'http-security-audit', collectedAt, entities, relationships, evidence, warnings };
      }
      targetUrl = input;
      domain = normalizeDomain(new URL(input).hostname);
    } else {
      domain = normalizeDomain(input);
      targetUrl = `https://${domain}`;
    }

    if (!domain || !domain.includes('.')) {
      warnings.push(`Invalid domain for HTTP security audit: "${input}"`);
      return { source: 'http-security-audit', collectedAt, entities, relationships, evidence, warnings };
    }

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = AbortSignal.any([ctx.signal, timeoutSignal]);

    logger.info('HTTP security headers audit started', { requestId: ctx.requestId, targetUrl, domain });

    try {
      const response = await safeFetch(targetUrl, {
        method: 'GET',
        signal,
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: {
          'User-Agent': 'NexusGraph-OSINT/1.0 (HTTP Security Inspector; +https://nexusgraph.io)',
          Accept: '*/*',
        },
      });

      const audit = evaluateHeaders(response.headers);

      // 1. Overall Security Posture Entity
      const postureValue = `Security Posture: Grade ${audit.grade} (${audit.score}/100)`;
      entities.push({
        type: 'TECHNOLOGY',
        value: postureValue,
        title: `HTTP Security Posture: Grade ${audit.grade}`,
        confidence: 90,
        metadata: {
          kind: 'SECURITY_HEADERS_AUDIT',
          score: audit.score,
          grade: audit.grade,
          findings: audit.findings,
          hsts: audit.hsts,
          csp: audit.csp,
          xFrameOptions: audit.xFrameOptions,
          xContentTypeOptions: audit.xContentTypeOptions,
          referrerPolicy: audit.referrerPolicy,
          cors: audit.cors,
          detectedWaf: audit.detectedWaf,
          serverBanner: audit.serverBanner,
          source: {
            url: targetUrl,
            collector: 'http-security-audit',
            transform: 'domain.http-security-audit',
            derivedFrom: domain,
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: domain,
        source_type: 'DOMAIN',
        target_value: postureValue,
        target_type: 'TECHNOLOGY',
        relationship_type: 'OBSERVED_ON',
        confidence: 90,
        reason: `Automated RFC HTTP security headers audit awarded Grade ${audit.grade} (${audit.score}/100).`,
      });

      evidence.push({
        source_url: targetUrl,
        source_type: 'HTTP_RESPONSE',
        title: `HTTP Security Headers: Grade ${audit.grade}`,
        extracted_value: `Score: ${audit.score}/100. Issues: ${audit.findings.join('; ') || 'None (Excellent compliance)'}`,
        confidence: 90,
        metadata: audit,
      });

      // 2. Active WAF / CDN Detection Entity (if detected)
      if (audit.detectedWaf) {
        const wafEntityValue = `${audit.detectedWaf}`;
        entities.push({
          type: 'TECHNOLOGY',
          value: wafEntityValue,
          title: `WAF / CDN: ${audit.detectedWaf}`,
          confidence: 95,
          metadata: {
            kind: 'WAF_DETECTION',
            provider: audit.detectedWaf,
            source: {
              url: targetUrl,
              collector: 'http-security-audit',
              transform: 'domain.http-security-audit',
              derivedFrom: domain,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: domain,
          source_type: 'DOMAIN',
          target_value: wafEntityValue,
          target_type: 'TECHNOLOGY',
          relationship_type: 'OBSERVED_ON',
          confidence: 95,
          reason: `Detected active perimeter proxy/WAF protection (${audit.detectedWaf}) via HTTP response headers.`,
        });
      }
    } catch (error) {
      warnings.push(`HTTP security audit failed: ${error instanceof Error ? error.message : 'network error'}`);
    }

    return { source: 'http-security-audit', collectedAt, entities, relationships, evidence, warnings };
  },
};
