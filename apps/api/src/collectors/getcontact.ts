/**
 * GetContact Caller & Tag Intelligence Collector
 *
 * Runs local gtc.py engine using configured accounts (~/.config/gtc/credentials.json).
 * Extracts:
 * 1. Subscriber Display Name (Caller ID)
 * 2. Contact Tags (how other people saved this number in their address books)
 * 3. Total Tag Count recorded in GetContact directory
 */

import child_process from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { normalizePhone } from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

function runExecFile(
  file: string,
  args: string[],
  options: any,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    child_process.execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    });
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface GetContactResult {
  displayName: string | null;
  tagCount: number;
  tags: Array<{ tag: string; count: number }>;
  raw?: any;
}

export function parseGtcJson(rawOutput: string): any {
  if (!rawOutput) return null;
  const startIdx = rawOutput.indexOf('{');
  const endIdx = rawOutput.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const jsonSubstring = rawOutput.substring(startIdx, endIdx + 1);
    return JSON.parse(jsonSubstring);
  }
  return JSON.parse(rawOutput.trim());
}

/**
 * Queries GetContact intelligence via local gtc.py if credentials exist.
 */
export async function queryGetContact(e164: string, requestId?: string): Promise<GetContactResult | null> {
  const isTest = process.env.NODE_ENV === 'test';
  const customConfigDir = process.env.GTC_CONFIG_DIR;
  const credPaths = [
    customConfigDir ? path.join(customConfigDir, 'credentials.json') : null,
    path.join(os.homedir(), '.config', 'gtc', 'credentials.json'),
    path.resolve(process.cwd(), '.config', 'gtc', 'credentials.json'),
    path.resolve(process.cwd(), '..', '.config', 'gtc', 'credentials.json'),
    path.resolve('c:/laragon/www/OSINT Investigation Graph/.config/gtc/credentials.json'),
  ].filter(Boolean) as string[];

  const credPath = credPaths.find((p) => fs.existsSync(p));
  if (!credPath && !isTest) {
    logger.info('GetContact lookup skipped: no credentials.json found', { requestId });
    return null;
  }

  // Find gtc.py in project root or current directory
  const possiblePaths = [
    path.resolve(process.cwd(), 'gtc.py'),
    path.resolve(process.cwd(), '..', 'gtc.py'),
    path.resolve(process.cwd(), '..', '..', 'gtc.py'),
    path.resolve('c:/laragon/www/OSINT Investigation Graph/gtc.py'),
    path.join(__dirname, '../../../../gtc.py'),
    path.join(__dirname, '../../../gtc.py'),
  ];
  const gtcScript = possiblePaths.find((p) => fs.existsSync(p)) || 'gtc.py';
  if (!gtcScript && !isTest) {
    logger.warn('GetContact lookup skipped: gtc.py not found', { requestId, possiblePaths });
    return null;
  }

  const activeConfigDir = credPath ? path.dirname(credPath) : os.homedir();

  try {
    let tagsList: Array<{ tag: string; count: number }> = [];
    let displayName: string | null = null;
    let tagCount = 0;

    // 1. First attempt: Query tags (-t tags)
    try {
      const { stdout: tagsOut } = await runExecFile(
        'python',
        [gtcScript, 'search', e164, '-t', 'tags', '--json'],
        {
          timeout: 15000,
          env: { ...process.env, GTC_CONFIG_DIR: activeConfigDir, PYTHONIOENCODING: 'utf-8' },
        },
      );

      const tagsData = parseGtcJson(tagsOut);
      const rawTags = tagsData?.result?.tags || tagsData?.tags;
      if (Array.isArray(rawTags) && rawTags.length > 0) {
        tagsList = rawTags
          .map((t: any) => ({
            tag: String(t.tag || '').trim(),
            count: Number(t.count || 1),
          }))
          .filter((t: any) => t.tag.length > 0);

        if (tagsList.length > 0) {
          displayName = tagsList[0]?.tag || null;
        }
      }

      if (typeof tagsData?.result?.tagCount === 'number') {
        tagCount = tagsData.result.tagCount;
      } else if (typeof tagsData?.tagCount === 'number') {
        tagCount = tagsData.tagCount;
      } else if (tagsList.length > 0) {
        tagCount = tagsList.length;
      }
    } catch (err: any) {
      logger.warn('GetContact -t tags failed, attempting profile fallback', {
        requestId,
        error: err.message,
      });
    }

    // 2. Fallback or Enrichment: Query profile (-t profile)
    try {
      const { stdout: profOut } = await runExecFile(
        'python',
        [gtcScript, 'search', e164, '-t', 'profile', '--json'],
        {
          timeout: 15000,
          env: { ...process.env, GTC_CONFIG_DIR: activeConfigDir, PYTHONIOENCODING: 'utf-8' },
        },
      );

      const profData = parseGtcJson(profOut);
      const profile = profData?.result?.profile || profData?.profile;
      if (profile?.displayName || profile?.name) {
        displayName = profile.displayName || profile.name;
      }
      if (typeof profile?.tagCount === 'number' && profile.tagCount > tagCount) {
        tagCount = profile.tagCount;
      }
      if (typeof profData?.result?.tagCount === 'number' && profData.result.tagCount > tagCount) {
        tagCount = profData.result.tagCount;
      }

      // Check if profile also returned tags and merge them
      const pTags = profData?.result?.tags;
      if (Array.isArray(pTags) && pTags.length > 0) {
        const existingTags = new Set(tagsList.map((t) => t.tag.toLowerCase()));
        for (const pt of pTags) {
          const tagStr = String(pt.tag || '').trim();
          if (tagStr && !existingTags.has(tagStr.toLowerCase())) {
            tagsList.push({
              tag: tagStr,
              count: Number(pt.count || 1),
            });
            existingTags.add(tagStr.toLowerCase());
          }
        }
      }
    } catch (err: any) {
      logger.warn('GetContact -t profile failed', {
        requestId,
        error: err.message,
      });
    }

    if (!displayName && tagsList.length === 0 && tagCount === 0) {
      return null;
    }

    return {
      displayName,
      tagCount: Math.max(tagCount, tagsList.length),
      tags: tagsList,
    };
  } catch (err: any) {
    logger.error('GetContact execution error', {
      requestId,
      error: err.message,
    });
    return null;
  }
}

export const getcontactCollector: Collector = {
  name: 'getcontact',

  supports(inputType: string): boolean {
    return inputType === 'PHONE';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    const e164 = normalizePhone(input);
    if (!e164 || e164.length < 7) {
      warnings.push(`Invalid phone number format for GetContact: "${input}"`);
      return { source: 'getcontact', collectedAt, entities, relationships, evidence, warnings };
    }

    logger.info('GetContact intelligence collector started', {
      requestId: ctx.requestId,
      phone: e164,
    });

    const gtcData = await queryGetContact(e164, ctx.requestId);

    if (!gtcData) {
      warnings.push(
        'GetContact data tidak ditemukan atau sesi memerlukan verifikasi Captcha. Jalankan `python gtc.py captcha` di terminal jika sesi dibatasi.'
      );
      return { source: 'getcontact', collectedAt, entities, relationships, evidence, warnings };
    }

    // 1. Phone entity
    entities.push({
      type: 'PHONE',
      value: e164,
      title: gtcData.displayName ? `${e164} (${gtcData.displayName})` : e164,
      confidence: 90,
      metadata: {
        getcontactDisplayName: gtcData.displayName,
        getcontactTagCount: gtcData.tagCount,
        getcontactTags: gtcData.tags?.map((t) => t.tag),
        source: {
          collector: 'getcontact',
          collectedAt,
        },
      },
    });

    // 2. Subscriber Person entity
    if (gtcData.displayName) {
      entities.push({
        type: 'PERSON',
        value: gtcData.displayName,
        title: `${gtcData.displayName} (GetContact Name)`,
        confidence: 88,
        metadata: {
          sourcePhone: e164,
          source: 'GetContact Caller Directory',
          tagCount: gtcData.tagCount,
        },
      });

      relationships.push({
        source_value: e164,
        source_type: 'PHONE',
        target_value: gtcData.displayName,
        target_type: 'PERSON',
        relationship_type: 'RELATED_TO',
        confidence: 88,
        reason: `Identified subscriber name "${gtcData.displayName}" via GetContact caller directory`,
      });
    }

    // 3. Tag entities (PUBLIC_MENTION)
    const allTags = (gtcData.tags || []).filter((t) => t.tag && t.tag.length > 1);
    const seenTagValues = new Set<string>();

    for (const t of allTags) {
      const tagValue = `tag:${t.tag.toLowerCase().replace(/\s+/g, '-')}`;
      if (seenTagValues.has(tagValue)) continue;
      seenTagValues.add(tagValue);

      entities.push({
        type: 'PUBLIC_MENTION',
        value: tagValue,
        title: t.count > 1 ? `${t.tag} (${t.count}x)` : t.tag,
        confidence: 85,
        metadata: {
          rawTag: t.tag,
          count: t.count,
          sourcePhone: e164,
          provider: 'GetContact',
          totalAccountTags: gtcData.tagCount,
        },
      });

      relationships.push({
        source_value: e164,
        source_type: 'PHONE',
        target_value: tagValue,
        target_type: 'PUBLIC_MENTION',
        relationship_type: 'MENTIONS',
        confidence: 85,
        reason: `GetContact user tag: "${t.tag}" (saved by ${t.count} contact(s))`,
      });

      if (gtcData.displayName) {
        relationships.push({
          source_value: gtcData.displayName,
          source_type: 'PERSON',
          target_value: tagValue,
          target_type: 'PUBLIC_MENTION',
          relationship_type: 'MENTIONS',
          confidence: 80,
          reason: `Associated with GetContact contact tag: "${t.tag}"`,
        });
      }
    }

    // 4. Summary badge for remaining encrypted/premium tags
    if (gtcData.tagCount && gtcData.tagCount > allTags.length) {
      const remainingCount = gtcData.tagCount - allTags.length;
      const summaryTagValue = `gtc:total-tags:${e164}`;
      if (!seenTagValues.has(summaryTagValue)) {
        seenTagValues.add(summaryTagValue);
        entities.push({
          type: 'PUBLIC_MENTION',
          value: summaryTagValue,
          title: `+${remainingCount} Tag Lainnya (${gtcData.tagCount} Total di GetContact)`,
          confidence: 85,
          metadata: {
            totalTags: gtcData.tagCount,
            previewTags: allTags.length,
            remainingTags: remainingCount,
            note: `Nomor ini memiliki total ${gtcData.tagCount} tag tersimpan di GetContact database`,
          },
        });

        relationships.push({
          source_value: e164,
          source_type: 'PHONE',
          target_value: summaryTagValue,
          target_type: 'PUBLIC_MENTION',
          relationship_type: 'MENTIONS',
          confidence: 85,
          reason: `Total ${gtcData.tagCount} tags recorded in GetContact caller directory (${remainingCount} additional encrypted contacts)`,
        });
      }
    }

    // 5. Evidence
    evidence.push({
      source_url: `getcontact://${e164}`,
      source_type: 'GETCONTACT_DIRECTORY',
      title: `GetContact Directory: ${gtcData.displayName || e164} (${gtcData.tags?.length || 0} tags)`,
      extracted_value: `Ditemukan nama "${gtcData.displayName || 'N/A'}" dan ${gtcData.tags?.length || 0} tag kontak tersimpan (Total ${gtcData.tagCount} tags di GetContact).`,
      confidence: 88,
      metadata: {
        displayName: gtcData.displayName,
        tagCount: gtcData.tagCount,
        tags: gtcData.tags,
      },
    });

    logger.info('GetContact collector completed', {
      requestId: ctx.requestId,
      phone: e164,
      entityCount: entities.length,
      relationshipCount: relationships.length,
    });

    return {
      source: 'getcontact',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
