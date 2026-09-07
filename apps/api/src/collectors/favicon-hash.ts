/**
 * Favicon MurmurHash3 & Origin Server Discovery Collector
 *
 * Implements the industry-standard Shodan/Censys Favicon MurmurHash3 fingerprinting.
 * Fetches target /favicon.ico, computes RFC 2045 Base64 + 32-bit MurmurHash3,
 * and generates Shodan/Censys search pivots to uncover the origin server IP
 * hiding behind Cloudflare, Akamai, or reverse proxies.
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
import crypto from 'node:crypto';

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_FAVICON_BYTES = 512 * 1024; // 512KB

/**
 * MurmurHash3 (x86 32-bit signed integer) matching mmh3.hash() in Python
 */
export function murmurHash3_32(key: Buffer | Uint8Array, seed = 0): number {
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;

  let h1 = seed >>> 0;
  const len = key.length;
  const nblocks = Math.floor(len / 4);

  // Body: 4-byte chunks
  for (let i = 0; i < nblocks; i++) {
    const idx = i * 4;
    let k1 =
      (key[idx] & 0xff) |
      ((key[idx + 1] & 0xff) << 8) |
      ((key[idx + 2] & 0xff) << 16) |
      ((key[idx + 3] & 0xff) << 24);

    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) >>> 0;
  }

  // Tail: remaining bytes
  const tailIdx = nblocks * 4;
  let k1 = 0;
  const remainder = len % 4;

  if (remainder === 3) {
    k1 ^= (key[tailIdx + 2] & 0xff) << 16;
  }
  if (remainder >= 2) {
    k1 ^= (key[tailIdx + 1] & 0xff) << 8;
  }
  if (remainder >= 1) {
    k1 ^= key[tailIdx] & 0xff;
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
  }

  // Finalization
  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;

  // Cast to 32-bit signed integer (as returned by Python's mmh3.hash)
  return h1 | 0;
}

/**
 * Formats a Buffer to RFC 2045 Base64 with newline every 76 chars and trailing newline,
 * matching Python's base64.encodebytes() used by Shodan.
 */
export function formatShodanFaviconBase64(buffer: Buffer): Buffer {
  const b64 = buffer.toString('base64');
  let result = '';
  for (let i = 0; i < b64.length; i += 76) {
    result += b64.slice(i, i + 76) + '\n';
  }
  return Buffer.from(result, 'utf-8');
}

export const faviconHashCollector: Collector = {
  name: 'favicon-hash',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    let targetDomain: string;
    let targetFaviconUrl: string;

    if (input.includes('://')) {
      const validation = validateUrl(input);
      if (!validation.safe) {
        warnings.push(`URL rejected by SSRF guard: ${validation.reason}`);
        return { source: 'favicon-hash', collectedAt, entities, relationships, evidence, warnings };
      }
      const u = new URL(input);
      targetDomain = normalizeDomain(u.hostname);
      targetFaviconUrl = `${u.protocol}//${u.hostname}/favicon.ico`;
    } else {
      targetDomain = normalizeDomain(input);
      targetFaviconUrl = `https://${targetDomain}/favicon.ico`;
    }

    if (!targetDomain || !targetDomain.includes('.')) {
      warnings.push(`Invalid domain: "${input}"`);
      return { source: 'favicon-hash', collectedAt, entities, relationships, evidence, warnings };
    }

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = AbortSignal.any([ctx.signal, timeoutSignal]);

    try {
      const response = await safeFetch(targetFaviconUrl, {
        method: 'GET',
        signal,
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxResponseBytes: MAX_FAVICON_BYTES,
        headers: { 'User-Agent': 'NexusGraph-OSINT-FaviconRecon/1.0' },
      });

      if (response.status !== 200) {
        warnings.push(`Favicon not found at ${targetFaviconUrl} (HTTP ${response.status})`);
        return { source: 'favicon-hash', collectedAt, entities, relationships, evidence, warnings };
      }

      const arrayBuf = await response.arrayBuffer();
      const rawBuffer = Buffer.from(arrayBuf);

      if (rawBuffer.length === 0) {
        warnings.push('Favicon response was empty');
        return { source: 'favicon-hash', collectedAt, entities, relationships, evidence, warnings };
      }

      // 1. Shodan MurmurHash3 calculation
      const shodanB64Bytes = formatShodanFaviconBase64(rawBuffer);
      const mmh3Hash = murmurHash3_32(shodanB64Bytes);

      // 2. MD5 & SHA256 hashes for general OSINT & VirusTotal
      const md5Hash = crypto.createHash('md5').update(rawBuffer).digest('hex');
      const sha256Hash = crypto.createHash('sha256').update(rawBuffer).digest('hex');

      const shodanQuery = `http.favicon.hash:${mmh3Hash}`;
      const censysQuery = `services.http.response.favicons.hashes:${md5Hash}`;

      // 3. Emit Technology / Fingerprint Entity
      const entityValue = `favicon:${mmh3Hash}`;
      entities.push({
        type: 'TECHNOLOGY',
        value: entityValue,
        title: `Favicon Hash: ${mmh3Hash}`,
        confidence: 95,
        metadata: {
          murmurHash3: mmh3Hash,
          md5: md5Hash,
          sha256: sha256Hash,
          shodanDork: shodanQuery,
          censysDork: censysQuery,
          faviconUrl: targetFaviconUrl,
          byteSize: rawBuffer.length,
          source: {
            collector: 'favicon-hash',
            derivedFrom: targetDomain,
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: targetDomain,
        source_type: 'DOMAIN',
        target_value: entityValue,
        target_type: 'TECHNOLOGY',
        relationship_type: 'RELATED_TO',
        confidence: 95,
        reason: `Favicon website memiliki signature unik MurmurHash3 ${mmh3Hash} untuk menemukan origin IP`,
      });

      // 4. Evidence with direct search pivots
      evidence.push({
        source_url: targetFaviconUrl,
        source_type: 'FAVICON_HASH',
        title: `Favicon Fingerprint for ${targetDomain}`,
        extracted_value: `MurmurHash3: ${mmh3Hash} | Shodan Dork: ${shodanQuery} | MD5: ${md5Hash}`,
        confidence: 95,
        metadata: {
          murmurHash3: mmh3Hash,
          shodanQuery,
          censysQuery,
          md5: md5Hash,
          sha256: sha256Hash,
        },
      });
    } catch (err: any) {
      warnings.push(`Favicon recon error: ${err.message || String(err)}`);
      logger.warn('Favicon recon failed', { requestId: ctx.requestId, error: err.message });
    }

    return {
      source: 'favicon-hash',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
