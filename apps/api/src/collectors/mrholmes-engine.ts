/**
 * Mr.Holmes Engine Collector
 *
 * Invokes the ORIGINAL Mr.Holmes Python OSINT engine (Lucksi/Mr.Holmes,
 * GPL-3.0) via a non-interactive bridge script (vendor/mrholmes-bridge.py)
 * and merges its findings into the NexusGraph graph model with provenance.
 *
 * Security notes:
 *  - The seed is validated against a strict allowlist regex before it ever
 *    reaches the Python process; the task payload is passed over stdin as
 *    JSON (never interpolated into a shell command).
 *  - The Python engine performs its own outbound HTTP requests and does NOT
 *    pass through the Node SSRF guard — this is an accepted trade-off of
 *    using the vendored engine, documented in AGENTS-relevant docs.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BRIDGE_PATH = path.resolve(__dirname, '../../../../vendor/mrholmes-bridge.py');
const ENGINE_TIMEOUT_MS = 180_000;
const MAX_STDOUT_BYTES = 4 * 1024 * 1024;

const USERNAME_REGEX = /^[A-Za-z0-9._-]{2,50}$/;

export interface MrHolmesFinding {
  name: string;
  url: string;
  tags: string[];
}

export interface MrHolmesProviderResult {
  name: string;
  linked: boolean | null;
  error?: string;
}

export interface MrHolmesDomainRobots {
  present?: boolean | null;
  disallow?: string[];
  error?: string;
}

export type MrHolmesMode = 'username' | 'people' | 'email' | 'phone' | 'domain';

export interface MrHolmesBridgeOutput {
  mode?: string;
  value?: string;
  found?: MrHolmesFinding[];
  errors?: string[];
  totalChecked?: number;
  valid?: boolean;
  providers?: MrHolmesProviderResult[];
  githubUsers?: { username: string; url: string }[];
  dorks?: string[];
  robots?: MrHolmesDomainRobots;
  error?: string;
}

const SEED_MODE_MAP: Record<string, MrHolmesMode> = {
  USERNAME: 'username',
  PERSON: 'people',
  NAME: 'people',
  EMAIL: 'email',
  PHONE: 'phone',
  DOMAIN: 'domain',
  URL: 'domain',
};

function validateForMode(mode: MrHolmesMode, value: string): boolean {
  switch (mode) {
    case 'username':
      return USERNAME_REGEX.test(value);
    case 'people':
      return value.length >= 2 && value.length <= 80 && /^[A-Za-z0-9 ._'-]+$/.test(value);
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'phone':
      return /^\+?[0-9][0-9\s()-]{5,20}$/.test(value);
    case 'domain':
      return /^[A-Za-z0-9._-]{3,100}$/.test(value) && !value.startsWith('http');
  }
}

/**
 * Run the vendored Python bridge. Exported for testing.
 * Resolves with parsed JSON output; rejects on timeout/abort/non-zero exit.
 */
export function runMrHolmesBridge(
  mode: MrHolmesMode,
  value: string,
  signal: AbortSignal,
): Promise<MrHolmesBridgeOutput> {
  return new Promise((resolve, reject) => {
    const pythonBin = process.env.MR_HOLMES_PYTHON ?? 'python';
    const child = spawn(pythonBin, [BRIDGE_PATH], {
      cwd: path.dirname(BRIDGE_PATH),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error(`Mr.Holmes engine timed out after ${ENGINE_TIMEOUT_MS / 1000}s`));
      }
    }, ENGINE_TIMEOUT_MS);

    const abortHandler = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        child.kill('SIGKILL');
        reject(new Error('Mr.Holmes engine aborted'));
      }
    };
    signal.addEventListener('abort', abortHandler, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > MAX_STDOUT_BYTES) {
        child.kill('SIGKILL');
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > MAX_STDOUT_BYTES) stderr = stderr.slice(-MAX_STDOUT_BYTES);
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener('abort', abortHandler);
        reject(new Error(`Failed to start Python engine (${pythonBin}): ${err.message}`));
      }
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abortHandler);

      try {
        const parsed = JSON.parse(stdout.trim()) as MrHolmesBridgeOutput;
        if (parsed.error) {
          reject(new Error(`Mr.Holmes bridge error: ${parsed.error}`));
          return;
        }
        resolve(parsed);
      } catch {
        reject(
          new Error(
            `Mr.Holmes bridge returned invalid output (exit ${code}). Stderr tail: ${stderr.slice(-300)}`,
          ),
        );
      }
    });

    child.stdin.write(JSON.stringify({ mode, value }));
    child.stdin.end();
  });
}

export const mrholmesEngineCollector: Collector = {
  name: 'mrholmes-engine',

  supports(inputType: string): boolean {
    return inputType in SEED_MODE_MAP;
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    // The collector interface does not carry the declared seed type; infer the
    // Mr.Holmes category from the input shape (mirrors the bridge validators).
    const trimmed = input.trim();
    let mode: MrHolmesMode;
    let value: string;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      mode = 'email';
      value = trimmed;
    } else if (/^https?:\/\//i.test(trimmed)) {
      mode = 'domain';
      value = new URL(trimmed).hostname.replace(/^www\./, '');
    } else if (/^\+?[0-9][0-9\s()-]{5,20}$/.test(trimmed)) {
      mode = 'phone';
      value = trimmed;
    } else if (!trimmed.includes('.') && /[ ._'-]/.test(trimmed)) {
      mode = 'people';
      value = trimmed;
    } else if (trimmed.includes('.')) {
      mode = 'domain';
      value = trimmed.replace(/^@/, '').toLowerCase();
    } else {
      mode = 'username';
      value = trimmed.replace(/^@/, '');
    }

    if (!validateForMode(mode, value)) {
      warnings.push(`Invalid value for Mr.Holmes engine mode ${mode}: "${input}". Skipping.`);
      return { source: 'mrholmes-engine', collectedAt, entities, relationships, evidence, warnings };
    }

    logger.info('Mr.Holmes Python engine starting', { requestId: ctx.requestId, mode });

    let output: MrHolmesBridgeOutput;
    try {
      output = await runMrHolmesBridge(mode, value, ctx.signal);
    } catch (error) {
      warnings.push(`Mr.Holmes engine failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return { source: 'mrholmes-engine', collectedAt, entities, relationships, evidence, warnings };
    }

    for (const err of output.errors ?? []) {
      warnings.push(`Mr.Holmes engine site error: ${err}`);
    }

    const sourceMeta = (extra: Record<string, unknown>) => ({
      collector: 'mrholmes-engine',
      transform: 'social.mrholmes-engine',
      derivedFrom: value,
      collectedAt,
      ...extra,
    });

    // ── Mode username/people: social profile enumeration ───────────────
    if (output.found) {
      const found = output.found;
      for (const finding of found) {
        if (!finding.url || !finding.url.startsWith('http')) continue;
        entities.push({
          type: 'SOCIAL_PROFILE',
          value: finding.url,
          title: `${finding.name}: ${value} (Mr.Holmes)`,
          confidence: 60,
          metadata: {
            platform: String(finding.name).toLowerCase(),
            username: value,
            tags: finding.tags,
            engine: 'mrholmes-python',
            source: sourceMeta({ url: finding.url }),
          },
        });
        relationships.push({
          source_value: value,
          source_type: mode === 'people' ? 'PERSON' : 'USERNAME',
          target_value: finding.url,
          target_type: 'SOCIAL_PROFILE',
          relationship_type: 'POSSIBLY_SAME_AS',
          confidence: 50,
          reason: `Original Mr.Holmes Python engine detected a public profile on ${finding.name}. Same handle does not confirm identity.`,
        });
        evidence.push({
          source_url: finding.url,
          source_type: 'USERNAME_CHECK',
          title: `Mr.Holmes Engine: ${finding.name}`,
          extracted_value: `Profile exists at ${finding.url}`,
          confidence: 60,
          metadata: { platform: finding.name, tags: finding.tags, engine: 'mrholmes-python-vendored' },
        });
      }
      evidence.push({
        source_type: 'USERNAME_CHECK',
        title: `Mr.Holmes Engine Summary: ${value}`,
        extracted_value: `Engine checked ~${output.totalChecked ?? 150} platforms; ${found.length} profile(s) found, ${(output.errors ?? []).length} site error(s)`,
        confidence: 60,
        metadata: {
          totalChecked: output.totalChecked,
          totalFound: found.length,
          errorCount: (output.errors ?? []).length,
        },
      });
      if (!found.length) warnings.push(`Mr.Holmes engine found no profiles for "${value}"`);
    }

    // ── Mode email: validation + provider lookups + GitHub users ───────
    if (output.providers) {
      evidence.push({
        source_type: 'EMAIL_LOOKUP',
        title: `Mr.Holmes Engine Email Validation: ${value}`,
        extracted_value: output.valid ? 'Email format is valid' : 'Email format is invalid',
        confidence: output.valid ? 90 : 70,
        metadata: { valid: output.valid, engine: 'mrholmes-python-vendored' },
      });
      for (const p of output.providers) {
        if (p.error) {
          warnings.push(`Mr.Holmes engine provider error (${p.name}): ${p.error}`);
          continue;
        }
        evidence.push({
          source_type: 'EMAIL_LOOKUP',
          title: `Mr.Holmes Engine Account Check: ${p.name}`,
          extracted_value: p.linked
            ? `Email is linked to a ${p.name} account`
            : `No ${p.name} account linked to this email`,
          confidence: p.linked ? 75 : 45,
          metadata: { provider: p.name, linked: p.linked, negativeResult: !p.linked, engine: 'mrholmes-python-vendored' },
        });
      }
      for (const u of output.githubUsers ?? []) {
        if (!u.url?.startsWith('http')) continue;
        entities.push({
          type: 'GITHUB_PROFILE',
          value: u.url,
          title: `GitHub: ${u.username} (via Mr.Holmes email search)`,
          confidence: 80,
          metadata: {
            username: u.username,
            matchedVia: 'mrholmes-email-search',
            engine: 'mrholmes-python',
            source: sourceMeta({ url: u.url }),
          },
        });
        relationships.push({
          source_value: value,
          source_type: 'EMAIL',
          target_value: u.url,
          target_type: 'GITHUB_PROFILE',
          relationship_type: 'USES_EMAIL',
          confidence: 80,
          reason: 'GitHub user publicly lists this exact email address (original Mr.Holmes engine lookup).',
        });
      }
    }

    // ── Modes phone/email/domain: generated dork URLs ──────────────────
    const dorkSourceType =
      mode === 'domain' ? 'DOMAIN' : mode === 'phone' ? 'PHONE' : 'EMAIL';
    if (output.dorks) {
      for (const dork of output.dorks) {
        entities.push({
          type: 'URL',
          value: dork,
          title: 'Mr.Holmes Engine Dork',
          confidence: 100,
          metadata: {
            kind: 'SEARCH_DORK',
            engine: 'mrholmes-python',
            category: mode,
            source: sourceMeta({ url: dork }),
          },
        });
        relationships.push({
          source_value: value,
          source_type: dorkSourceType,
          target_value: dork,
          target_type: 'URL',
          relationship_type: 'LINKS_TO',
          confidence: 100,
          reason: `Deterministic dork URL generated by the original Mr.Holmes Python engine (${mode}).`,
        });
        evidence.push({
          source_url: dork,
          source_type: 'DORK_TEMPLATE',
          title: 'Mr.Holmes Engine Dork',
          extracted_value: dork,
          confidence: 100,
          metadata: { engine: 'mrholmes-python-vendored', category: mode, deterministic: true },
        });
      }
    }

    // ── Mode domain: robots.txt findings ────────────────────────────────
    if (output.robots) {
      await appendRobotsFindings();
    }

    async function appendRobotsFindings(): Promise<void> {
      if (!output.robots) return;
      const robotsUrl = `https://${value}/robots.txt`;
      if (output.robots.present) {
        const rules = output.robots.disallow ?? [];
        entities.push({
          type: 'DOCUMENT',
          value: robotsUrl,
          title: `robots.txt — ${value} (Mr.Holmes)`,
          confidence: 95,
          metadata: {
            docKind: 'ROBOTS_TXT',
            disallowRuleCount: rules.length,
            disallowRules: rules.slice(0, 50),
            engine: 'mrholmes-python',
            source: sourceMeta({ url: robotsUrl }),
          },
        });
        relationships.push({
          source_value: value,
          source_type: 'DOMAIN',
          target_value: robotsUrl,
          target_type: 'DOCUMENT',
          relationship_type: 'LINKS_TO',
          confidence: 95,
          reason:
            'robots.txt published at the domain root reveals crawler-restricted paths (fetched by the original Mr.Holmes engine).',
        });
        evidence.push({
          source_url: robotsUrl,
          source_type: 'ROBOTS_TXT',
          title: `robots.txt for ${value}`,
          extracted_value: rules.length
            ? `Disallow rules: ${rules.slice(0, 20).join(', ')}`
            : 'robots.txt present, no Disallow rules',
          confidence: 95,
          metadata: { disallowRuleCount: rules.length, engine: 'mrholmes-python-vendored' },
        });
      } else if (output.robots.error) {
        warnings.push(`Mr.Holmes engine robots.txt fetch failed: ${output.robots.error}`);
      } else {
        evidence.push({
          source_url: robotsUrl,
          source_type: 'ROBOTS_TXT',
          title: `robots.txt for ${value}`,
          extracted_value: 'No robots.txt served',
          confidence: 40,
          metadata: { negativeResult: true, engine: 'mrholmes-python-vendored' },
        });
      }
    }

    logger.info('Mr.Holmes Python engine completed', {
      requestId: ctx.requestId,
      mode,
      entities: entities.length,
      warnings: warnings.length,
    });

    return { source: 'mrholmes-engine', collectedAt, entities, relationships, evidence, warnings };
  },
};
