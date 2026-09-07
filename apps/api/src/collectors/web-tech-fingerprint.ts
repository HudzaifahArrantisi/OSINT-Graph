/**
 * Web Technology Stack Fingerprinter
 *
 * Inspects HTTP response headers, cookies, and HTML DOM source to identify:
 * - Web Servers (Nginx, Apache, Caddy, IIS, LiteSpeed)
 * - Web Frameworks & Runtimes (Next.js, Nuxt, Laravel, Django, Rails, Spring, Express, ASP.NET)
 * - CMS & eCommerce (WordPress, Shopify, Drupal, Joomla, Ghost, Magento)
 * - CDN, WAF & Reverse Proxies (Cloudflare, CloudFront, Fastly, Akamai, Imperva)
 * - Analytics & Trackers (Google Tag Manager, Meta Pixel, Hotjar, Segment, Sentry)
 * - Frontend UI Frameworks (React, Vue, Angular, Svelte, Tailwind, Bootstrap)
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

interface TechSignature {
  name: string;
  category: 'SERVER' | 'FRAMEWORK' | 'CMS' | 'CDN_WAF' | 'ANALYTICS' | 'FRONTEND';
  confidence: number;
  headers?: Record<string, RegExp>;
  cookies?: RegExp[];
  htmlPatterns?: RegExp[];
  versionExtractor?: (headers: Headers, html: string) => string | undefined;
}

const TECH_SIGNATURES: TechSignature[] = [
  // ─── 1. Web Servers ────────────────────────────────────────────────
  {
    name: 'Nginx',
    category: 'SERVER',
    confidence: 95,
    headers: { server: /nginx(?:[\s/]([\d.]+))?/i },
    versionExtractor: (h) => /nginx\/([\d.]+)/i.exec(h.get('server') || '')?.[1],
  },
  {
    name: 'Apache HTTP Server',
    category: 'SERVER',
    confidence: 95,
    headers: { server: /apache(?:[\s/]([\d.]+))?/i },
    versionExtractor: (h) => /apache\/([\d.]+)/i.exec(h.get('server') || '')?.[1],
  },
  {
    name: 'Microsoft-IIS',
    category: 'SERVER',
    confidence: 95,
    headers: { server: /microsoft-iis(?:[\s/]([\d.]+))?/i },
    versionExtractor: (h) => /microsoft-iis\/([\d.]+)/i.exec(h.get('server') || '')?.[1],
  },
  {
    name: 'Caddy',
    category: 'SERVER',
    confidence: 90,
    headers: { server: /caddy/i },
  },
  {
    name: 'LiteSpeed',
    category: 'SERVER',
    confidence: 95,
    headers: { server: /litespeed/i },
  },
  {
    name: 'OpenResty',
    category: 'SERVER',
    confidence: 90,
    headers: { server: /openresty/i },
  },

  // ─── 2. Frameworks & Runtimes ──────────────────────────────────────
  {
    name: 'Next.js',
    category: 'FRAMEWORK',
    confidence: 95,
    headers: { 'x-powered-by': /Next\.js/i },
    htmlPatterns: [/\/_next\/static\//i, /<script id="__NEXT_DATA__"/i],
  },
  {
    name: 'Nuxt.js',
    category: 'FRAMEWORK',
    confidence: 95,
    htmlPatterns: [/\/__nuxt\//i, /<div id="__nuxt">/i, /window\.__NUXT__/i],
  },
  {
    name: 'Laravel',
    category: 'FRAMEWORK',
    confidence: 90,
    cookies: [/XSRF-TOKEN/i, /laravel_session/i],
  },
  {
    name: 'Django',
    category: 'FRAMEWORK',
    confidence: 90,
    cookies: [/csrftoken/i],
  },
  {
    name: 'Ruby on Rails',
    category: 'FRAMEWORK',
    confidence: 90,
    headers: { 'x-powered-by': /Phusion Passenger/i },
    cookies: [/_session_id/i],
  },
  {
    name: 'ASP.NET',
    category: 'FRAMEWORK',
    confidence: 95,
    headers: { 'x-powered-by': /ASP\.NET/i, 'x-aspnet-version': /[\d.]+/i },
    versionExtractor: (h) => h.get('x-aspnet-version') || undefined,
  },
  {
    name: 'PHP',
    category: 'FRAMEWORK',
    confidence: 95,
    headers: { 'x-powered-by': /PHP(?:[\s/]([\d.]+))?/i },
    cookies: [/PHPSESSID/i],
    versionExtractor: (h) => /PHP\/([\d.]+)/i.exec(h.get('x-powered-by') || '')?.[1],
  },
  {
    name: 'Express',
    category: 'FRAMEWORK',
    confidence: 90,
    headers: { 'x-powered-by': /Express/i },
  },
  {
    name: 'Spring Boot',
    category: 'FRAMEWORK',
    confidence: 85,
    htmlPatterns: [/Whitelabel Error Page/i],
  },

  // ─── 3. CMS & eCommerce ────────────────────────────────────────────
  {
    name: 'WordPress',
    category: 'CMS',
    confidence: 95,
    htmlPatterns: [/\/wp-content\//i, /\/wp-includes\//i, /<meta name="generator" content="WordPress ([\d.]+)"/i],
    versionExtractor: (_h, html) => /<meta name="generator" content="WordPress ([\d.]+)"/i.exec(html)?.[1],
  },
  {
    name: 'Shopify',
    category: 'CMS',
    confidence: 95,
    headers: { 'x-shopid': /.+/i },
    htmlPatterns: [/cdn\.shopify\.com/i, /Shopify\.theme/i],
  },
  {
    name: 'Drupal',
    category: 'CMS',
    confidence: 90,
    headers: { 'x-generator': /Drupal/i },
    htmlPatterns: [/Drupal\.settings/i],
  },
  {
    name: 'Joomla',
    category: 'CMS',
    confidence: 90,
    htmlPatterns: [/<meta name="generator" content="Joomla!/i, /\/media\/system\/js\//i],
  },
  {
    name: 'Ghost',
    category: 'CMS',
    confidence: 90,
    htmlPatterns: [/<meta name="generator" content="Ghost ([\d.]+)"/i],
  },
  {
    name: 'Wix',
    category: 'CMS',
    confidence: 95,
    headers: { 'x-wix-request-id': /.+/i },
    htmlPatterns: [/static\.parastorage\.com/i],
  },

  // ─── 4. CDN, WAF & Reverse Proxies ─────────────────────────────────
  {
    name: 'Cloudflare',
    category: 'CDN_WAF',
    confidence: 95,
    headers: { 'cf-ray': /.+/i, server: /cloudflare/i },
  },
  {
    name: 'AWS CloudFront',
    category: 'CDN_WAF',
    confidence: 95,
    headers: { 'x-amz-cf-id': /.+/i, via: /cloudfront\.net/i },
  },
  {
    name: 'Fastly',
    category: 'CDN_WAF',
    confidence: 95,
    headers: { 'x-fastly-request-id': /.+/i, 'fastly-restarts': /.+/i },
  },
  {
    name: 'Akamai',
    category: 'CDN_WAF',
    confidence: 95,
    headers: { 'x-akamai-transformed': /.+/i, server: /AkamaiGHost/i },
  },
  {
    name: 'Imperva Incapsula',
    category: 'CDN_WAF',
    confidence: 95,
    headers: { 'x-cdn': /Incapsula/i, 'x-iinfo': /.+/i },
    cookies: [/visid_incap/i, /incap_ses/i],
  },

  // ─── 5. Analytics & Trackers ───────────────────────────────────────
  {
    name: 'Google Tag Manager',
    category: 'ANALYTICS',
    confidence: 90,
    htmlPatterns: [/googletagmanager\.com\/gtm\.js/i, /gtm\.start/i],
  },
  {
    name: 'Google Analytics',
    category: 'ANALYTICS',
    confidence: 90,
    htmlPatterns: [/google-analytics\.com\/analytics\.js/i, /googletagmanager\.com\/gtag\/js/i],
  },
  {
    name: 'Meta Pixel',
    category: 'ANALYTICS',
    confidence: 90,
    htmlPatterns: [/connect\.facebook\.net\/[a-zA-Z_]+\/fbevents\.js/i, /fbq\('init'/i],
  },
  {
    name: 'Hotjar',
    category: 'ANALYTICS',
    confidence: 90,
    htmlPatterns: [/static\.hotjar\.com\/c\/hotjar-/i],
  },
  {
    name: 'Sentry',
    category: 'ANALYTICS',
    confidence: 90,
    htmlPatterns: [/browser\.sentry-cdn\.com/i, /@sentry\/browser/i],
  },
  {
    name: 'Segment',
    category: 'ANALYTICS',
    confidence: 90,
    htmlPatterns: [/cdn\.segment\.com\/analytics\.js/i],
  },

  // ─── 6. Frontend UI Frameworks ─────────────────────────────────────
  {
    name: 'React',
    category: 'FRONTEND',
    confidence: 90,
    htmlPatterns: [/data-reactroot/i, /_reactListening/i, /react(?:-dom)?\.(?:production\.min|development)\.js/i],
  },
  {
    name: 'Vue.js',
    category: 'FRONTEND',
    confidence: 90,
    htmlPatterns: [/data-v-[a-f0-9]{8}/i, /vue(?:\.runtime)?\.(?:global|esm-browser|min)\.js/i],
  },
  {
    name: 'Angular',
    category: 'FRONTEND',
    confidence: 90,
    htmlPatterns: [/ng-version=/i, /ng-app=/i],
  },
  {
    name: 'jQuery',
    category: 'FRONTEND',
    confidence: 90,
    htmlPatterns: [/jquery(?:-([\d.]+))?(?:\.min)?\.js/i],
    versionExtractor: (_h, html) => /jquery-([\d.]+)(?:\.min)?\.js/i.exec(html)?.[1],
  },
  {
    name: 'Tailwind CSS',
    category: 'FRONTEND',
    confidence: 85,
    htmlPatterns: [/(?:tailwind|tw-)[a-z0-9-]+\.css/i, /class="[^"]*(?:flex|grid|hidden|relative|absolute|bg-|text-|p-|m-)[^"]*"/i],
  },
  {
    name: 'Bootstrap',
    category: 'FRONTEND',
    confidence: 90,
    htmlPatterns: [/bootstrap(?:\.bundle)?(?:\.min)?\.(?:js|css)/i],
  },
];

export const webTechFingerprintCollector: Collector = {
  name: 'web-tech-fingerprint',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL' || inputType === 'WEBSITE';
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
      const v = validateUrl(input);
      if (!v.safe) {
        warnings.push(`URL rejected by SSRF guard: ${v.reason}`);
        return { source: 'web-tech-fingerprint', collectedAt, entities, relationships, evidence, warnings };
      }
      targetUrl = input;
      try {
        domain = normalizeDomain(new URL(input).hostname);
      } catch {
        domain = normalizeDomain(input);
      }
    } else {
      domain = normalizeDomain(input);
      targetUrl = `https://${domain}`;
    }

    if (!domain || !domain.includes('.')) {
      warnings.push(`Invalid domain input for web tech fingerprint: "${input}"`);
      return { source: 'web-tech-fingerprint', collectedAt, entities, relationships, evidence, warnings };
    }

    logger.info('Web technology fingerprinting started', {
      requestId: ctx.requestId,
      domain,
      targetUrl,
    });

    try {
      const probeUrls = targetUrl.startsWith('http://')
        ? [targetUrl, targetUrl.replace('http://', 'https://')]
        : [targetUrl, targetUrl.replace('https://', 'http://')];

      let response: Response | null = null;
      let finalUrl = targetUrl;

      for (const testUrl of probeUrls) {
        try {
          const res = await safeFetch(testUrl, {
            method: 'GET',
            requestId: ctx.requestId,
            signal: ctx.signal,
            timeoutMs: 10_000,
            maxResponseBytes: 256 * 1024,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
          });
          if (res.ok || res.status < 500) {
            response = res;
            finalUrl = testUrl;
            break;
          }
        } catch {
          // Probe fallback
        }
      }

      if (!response) {
        evidence.push({
          source_url: targetUrl,
          source_type: 'TECH_FINGERPRINT',
          title: `Audit Fingerprint Web (${domain})`,
          extracted_value: 'Host target tidak merespons pada port HTTP (80) maupun HTTPS (443).',
          confidence: 70,
          metadata: { domain, status: 'UNREACHABLE' },
        });
        return {
          source: `tech://${domain}`,
          collectedAt,
          entities,
          relationships,
          evidence,
          warnings,
        };
      }

      const body = await readResponseWithLimit(response, 256 * 1024);
      const cookiesHeader = response.headers.get('set-cookie') || '';

      const detectedTechs: Array<{
        name: string;
        category: string;
        version?: string;
        confidence: number;
        evidenceText: string;
      }> = [];

      for (const sig of TECH_SIGNATURES) {
        let matched = false;
        let evidenceText = '';

        // 1. Check response headers
        if (sig.headers) {
          for (const [headerKey, pattern] of Object.entries(sig.headers)) {
            const headerVal = response.headers.get(headerKey);
            if (headerVal && pattern.test(headerVal)) {
              matched = true;
              evidenceText = `Header "${headerKey}: ${headerVal}"`;
              break;
            }
          }
        }

        // 2. Check Set-Cookie headers
        if (!matched && sig.cookies) {
          for (const cookiePattern of sig.cookies) {
            if (cookiePattern.test(cookiesHeader)) {
              matched = true;
              evidenceText = `Cookie pattern "${cookiePattern.source}" terdeteksi`;
              break;
            }
          }
        }

        // 3. Check HTML content patterns
        if (!matched && sig.htmlPatterns) {
          for (const htmlPattern of sig.htmlPatterns) {
            if (htmlPattern.test(body)) {
              matched = true;
              evidenceText = `HTML pattern "${htmlPattern.source}" terdeteksi di dokumen DOM`;
              break;
            }
          }
        }

        if (matched) {
          const version = sig.versionExtractor ? sig.versionExtractor(response.headers, body) : undefined;
          detectedTechs.push({
            name: sig.name,
            category: sig.category,
            version,
            confidence: sig.confidence,
            evidenceText,
          });
        }
      }

      // Generic Server Header fallback if not already captured
      const serverHeader = response.headers.get('server');
      if (serverHeader && !detectedTechs.some((t) => t.category === 'SERVER')) {
        const cleanServer = serverHeader.split(';')[0].trim().slice(0, 50);
        if (cleanServer && cleanServer.length > 1) {
          detectedTechs.push({
            name: cleanServer,
            category: 'SERVER',
            confidence: 85,
            evidenceText: `Header "server: ${cleanServer}"`,
          });
        }
      }

      // Security header detection: HSTS
      if (response.headers.get('strict-transport-security') && !detectedTechs.some((t) => t.name.includes('HSTS'))) {
        detectedTechs.push({
          name: 'HSTS (HTTP Strict Transport Security)',
          category: 'CDN_WAF',
          confidence: 95,
          evidenceText: 'Header "strict-transport-security" aktif',
        });
      }

      // If active web service responded but no specific framework matched, record baseline web service
      if (detectedTechs.length === 0) {
        detectedTechs.push({
          name: finalUrl.startsWith('https') ? 'HTTPS Web Service' : 'HTTP Web Service',
          category: 'SERVER',
          confidence: 80,
          evidenceText: `Layanan web aktif merespons status HTTP ${response.status}`,
        });
      }

      // Create TECHNOLOGY entities for detected software
      for (const tech of detectedTechs) {
        const techEntityVal = `${domain}:${tech.name}`;
        const titleStr = tech.version ? `${tech.name} ${tech.version} (${tech.category})` : `${tech.name} (${tech.category})`;

        entities.push({
          type: 'TECHNOLOGY',
          value: techEntityVal,
          title: titleStr,
          confidence: tech.confidence,
          metadata: {
            techName: tech.name,
            category: tech.category,
            version: tech.version || null,
            evidence: tech.evidenceText,
            source: {
              collector: 'web-tech-fingerprint',
              transform: 'domain.web-tech-fingerprint',
              derivedFrom: domain,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: domain,
          source_type: 'DOMAIN',
          target_value: techEntityVal,
          target_type: 'TECHNOLOGY',
          relationship_type: 'OBSERVED_ON',
          confidence: tech.confidence,
          reason: `Teknologi terdeteksi pada ${domain} via ${tech.evidenceText}`,
        });
      }

      // Summary evidence record
      const summaryByCategory: Record<string, string[]> = {};
      for (const t of detectedTechs) {
        if (!summaryByCategory[t.category]) summaryByCategory[t.category] = [];
        summaryByCategory[t.category].push(t.version ? `${t.name} (${t.version})` : t.name);
      }

      const summaryStr = Object.entries(summaryByCategory)
        .map(([cat, items]) => `[${cat}]: ${items.join(', ')}`)
        .join(' | ');

      evidence.push({
        source_url: finalUrl,
        source_type: 'TECH_FINGERPRINT',
        title: `Fingerprint Teknologi Web (${detectedTechs.length} Komponen Terdeteksi)`,
        extracted_value: summaryStr || 'Web service aktif.',
        confidence: 90,
        metadata: {
          domain,
          totalDetected: detectedTechs.length,
          technologies: detectedTechs,
          categories: summaryByCategory,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.info('Web technology fingerprint collector network note', {
        requestId: ctx.requestId,
        domain,
        error: message,
      });
      evidence.push({
        source_url: targetUrl,
        source_type: 'TECH_FINGERPRINT',
        title: `Audit Fingerprint Web (${domain})`,
        extracted_value: `Pemeriksaan selesai: ${message}`,
        confidence: 60,
        metadata: { domain, note: message },
      });
    }

    logger.info('Web technology fingerprinting completed', {
      requestId: ctx.requestId,
      domain,
      detectedCount: entities.length,
    });

    return {
      source: `tech://${domain}`,
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
