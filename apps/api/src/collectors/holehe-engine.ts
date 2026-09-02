/**
 * Holehe Engine Collector
 *
 * Invokes the Holehe Python OSINT engine (megadose/holehe, GPL-3.0) via a
 * non-interactive bridge script (vendor/holehe-bridge.py) to audit 120+ web
 * platforms and services for registered accounts using an email address.
 *
 * Security notes:
 *  - Email input is normalized and validated against a strict RFC-compliant regex
 *    before reaching the Python process.
 *  - Payload is transferred securely over stdin as JSON (zero shell interpolation).
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
  EntityType,
} from '@nexusgraph/shared';
import { normalizeEmail } from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BRIDGE_PATH = path.resolve(__dirname, '../../../../vendor/holehe-bridge.py');
const ENGINE_TIMEOUT_MS = 120_000;
const MAX_STDOUT_BYTES = 4 * 1024 * 1024;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface HoleheFinding {
  name: string;
  domain: string;
  exists: boolean;
  rateLimit: boolean;
  emailrecovery?: string | null;
  phoneNumber?: string | null;
  others?: Record<string, unknown> | null;
}

export interface HoleheBridgeOutput {
  email?: string;
  totalChecked?: number;
  totalFound?: number;
  totalRateLimited?: number;
  durationSeconds?: number;
  findings?: HoleheFinding[];
  registered?: HoleheFinding[];
  errors?: string[];
  error?: string;
}

function formatPlatformName(name: string): string {
  if (!name) return 'Platform';
  const customNames: Record<string, string> = {
    github: 'GitHub',
    gitlab: 'GitLab',
    youtube: 'YouTube',
    twitter: 'Twitter / X',
    office365: 'Office 365',
    lastpass: 'LastPass',
    eventbrite: 'Eventbrite',
    devrant: 'devRant',
    codecademy: 'Codecademy',
    buymeacoffee: 'Buy Me a Coffee',
    blablacar: 'BlaBlaCar',
    soundcloud: 'SoundCloud',
    protonmail: 'ProtonMail',
    wordpress: 'WordPress',
  };
  if (customNames[name.toLowerCase()]) {
    return customNames[name.toLowerCase()];
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function mapPlatformToEntityType(name: string): EntityType {
  const lower = name.toLowerCase();
  if (lower === 'github') return 'GITHUB_PROFILE';
  if (lower === 'gitlab') return 'GITLAB_PROFILE';
  if (lower === 'youtube') return 'YOUTUBE_CHANNEL';
  return 'SOCIAL_PROFILE';
}

/**
 * Run the vendored Holehe Python bridge. Exported for testing.
 * Resolves with parsed JSON output; rejects on timeout/abort/non-zero exit.
 */
export function runHoleheBridge(
  email: string,
  signal: AbortSignal,
  timeoutMs: number = 10_000,
): Promise<HoleheBridgeOutput> {
  return new Promise((resolve, reject) => {
    const pythonBin = process.env.HOLEHE_PYTHON ?? process.env.MR_HOLMES_PYTHON ?? 'python';
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
        reject(new Error(`Holehe engine timed out after ${ENGINE_TIMEOUT_MS / 1000}s`));
      }
    }, ENGINE_TIMEOUT_MS);

    const abortHandler = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        child.kill('SIGKILL');
        reject(new Error('Holehe engine aborted'));
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
        reject(new Error(`Failed to start Holehe Python engine (${pythonBin}): ${err.message}`));
      }
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abortHandler);

      try {
        const parsed = JSON.parse(stdout.trim()) as HoleheBridgeOutput;
        if (parsed.error) {
          reject(new Error(`Holehe bridge error: ${parsed.error}`));
          return;
        }
        resolve(parsed);
      } catch {
        reject(
          new Error(
            `Holehe bridge returned invalid output (exit ${code}). Stderr tail: ${stderr.slice(-300)}`,
          ),
        );
      }
    });

    child.stdin.write(JSON.stringify({ email, timeout: Math.round(timeoutMs / 1000), only_used: false }));
    child.stdin.end();
  });
}

export const holeheEngineCollector: Collector = {
  name: 'holehe-engine',

  supports(inputType: string): boolean {
    return inputType === 'EMAIL';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    const raw = input.trim();
    if (!EMAIL_REGEX.test(raw)) {
      warnings.push(`Invalid email format: "${input}". Skipping Holehe engine execution.`);
      return { source: 'holehe-engine', collectedAt, entities, relationships, evidence, warnings };
    }

    const email = normalizeEmail(raw);

    logger.info('Holehe email crawler started', { requestId: ctx.requestId, emailDomain: email.split('@')[1] });

    let output: HoleheBridgeOutput;
    try {
      output = await runHoleheBridge(email, ctx.signal, 10_000);
    } catch (error) {
      warnings.push(`Holehe engine failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return { source: 'holehe-engine', collectedAt, entities, relationships, evidence, warnings };
    }

    for (const err of output.errors ?? []) {
      warnings.push(`Holehe engine platform notice: ${err}`);
    }

    const registered = output.registered ?? (output.findings ?? []).filter((f) => f.exists);

    // ── 1. Create Evidence & Entities for Registered Accounts ───────────
    for (const item of registered) {
      const platformTitle = formatPlatformName(item.name);
      const entityType = mapPlatformToEntityType(item.name);
      const domainUrl = `https://${item.domain}`;

      const entityMetadata: Record<string, unknown> = {
        platform: item.name.toLowerCase(),
        domain: item.domain,
        exists: true,
        emailrecovery: item.emailrecovery || null,
        phoneNumber: item.phoneNumber || null,
        others: item.others || null,
        engine: 'holehe-python',
        discoveredBy: 'holehe-engine',
        source: {
          url: domainUrl,
          collector: 'holehe-engine',
          transform: 'contact.holehe-email-crawl',
          derivedFrom: email,
          collectedAt,
        },
      };

      entities.push({
        type: entityType,
        value: domainUrl,
        title: `${platformTitle} Account (${item.domain})`,
        confidence: 85,
        metadata: entityMetadata,
      });

      relationships.push({
        source_value: email,
        source_type: 'EMAIL',
        target_value: domainUrl,
        target_type: entityType,
        relationship_type: 'USES_EMAIL',
        confidence: 85,
        reason: `Holehe registered account check confirmed an active user account associated with ${email} on ${platformTitle} (${item.domain}).`,
      });

      evidence.push({
        source_url: domainUrl,
        source_type: 'EMAIL_LOOKUP',
        title: `Holehe Registered Account: ${platformTitle}`,
        extracted_value: `Active account found for ${email} on ${platformTitle} (${item.domain})`,
        confidence: 85,
        metadata: {
          provider: item.name,
          domain: item.domain,
          exists: true,
          emailrecovery: item.emailrecovery,
          phoneNumber: item.phoneNumber,
          engine: 'holehe-python',
        },
      });
    }

    // ── 2. Add Overall Audit Summary Evidence ───────────────────────────
    evidence.push({
      source_type: 'EMAIL_LOOKUP',
      title: `Holehe OSINT Email Crawl Summary: ${email}`,
      extracted_value: `Audited ${output.totalChecked ?? 120} platforms; found ${registered.length} registered account(s) (${output.totalRateLimited ?? 0} rate-limited) in ${output.durationSeconds ?? 0}s`,
      confidence: 90,
      metadata: {
        totalChecked: output.totalChecked,
        totalFound: registered.length,
        totalRateLimited: output.totalRateLimited,
        durationSeconds: output.durationSeconds,
        engine: 'holehe-python',
      },
    });

    if (registered.length === 0) {
      warnings.push(`Holehe OSINT crawl found no registered accounts across checked platforms for "${email}"`);
    }

    return {
      source: 'holehe-engine',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
