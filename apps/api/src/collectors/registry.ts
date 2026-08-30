/**
 * Collector Registry — central registry for all collectors.
 * Pipeline: Collector → Validate → Normalize → Deduplicate → Correlate → Persist → Graph refresh
 */

import type { Collector, CollectorName, SeedType, CollectorContext, CollectorResult } from '@nexusgraph/shared';
import { dnsCollector } from './dns.js';
import { urlMetadataCollector } from './url-metadata.js';
import { tlsCertificateCollector } from './tls-certificate.js';
import { githubCollector } from './github.js';
import { usernamePresenceCollector } from './username-presence.js';
import { gitlabCollector } from './gitlab.js';
import { youtubeCollector } from './youtube.js';
import { webSearchCollector } from './web-search.js';
import { phoneGeoCollector } from './phone-geo.js';
import { usernameSweepCollector } from './username-sweep.js';
import { dorkGeneratorCollector } from './dork-generator.js';
import { emailLookupCollector } from './email-lookup.js';
import { websiteReconCollector } from './website-recon.js';
import { mrholmesEngineCollector } from './mrholmes-engine.js';
import { subdomainCrtCollector } from './subdomain-crt.js';
import { whoisRdapCollector } from './whois-rdap.js';
import { ipGeolocationCollector } from './ip-geolocation.js';
import { logger } from '../lib/logger.js';

// Collector registry
const collectors = new Map<CollectorName, Collector>();

collectors.set('dns', dnsCollector);
collectors.set('url-metadata', urlMetadataCollector);
collectors.set('tls-certificate', tlsCertificateCollector);
collectors.set('github-public', githubCollector);
collectors.set('username-presence', usernamePresenceCollector);
collectors.set('gitlab-public', gitlabCollector);
collectors.set('youtube-public', youtubeCollector);
collectors.set('web-search', webSearchCollector);
collectors.set('phone-geo', phoneGeoCollector);
collectors.set('username-sweep', usernameSweepCollector);
collectors.set('dork-generator', dorkGeneratorCollector);
collectors.set('email-lookup', emailLookupCollector);
collectors.set('website-recon', websiteReconCollector);
collectors.set('mrholmes-engine', mrholmesEngineCollector);
collectors.set('subdomain-crt', subdomainCrtCollector);
collectors.set('whois-rdap', whoisRdapCollector);
collectors.set('ip-geolocation', ipGeolocationCollector);

export function getCollector(name: CollectorName): Collector | undefined {
  return collectors.get(name);
}

export function getAvailableCollectors(inputType: SeedType): CollectorName[] {
  const available: CollectorName[] = [];
  for (const [name, collector] of collectors) {
    if (collector.supports(inputType)) {
      available.push(name);
    }
  }
  return available;
}

export function getAllCollectors(): Map<CollectorName, Collector> {
  return collectors;
}

export async function runCollector(
  name: CollectorName,
  input: string,
  ctx: CollectorContext,
): Promise<CollectorResult> {
  const collector = collectors.get(name);
  if (!collector) {
    throw new Error(`Unknown collector: ${name}`);
  }

  logger.info('Running collector', {
    requestId: ctx.requestId,
    collector: name,
    caseId: ctx.caseId,
  });

  const start = Date.now();

  try {
    const result = await collector.run(input, ctx);

    logger.info('Collector completed', {
      requestId: ctx.requestId,
      collector: name,
      duration: Date.now() - start,
      entities: result.entities.length,
      relationships: result.relationships.length,
      evidence: result.evidence.length,
      warnings: result.warnings.length,
    });

    return result;
  } catch (error) {
    logger.error('Collector failed', {
      requestId: ctx.requestId,
      collector: name,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
