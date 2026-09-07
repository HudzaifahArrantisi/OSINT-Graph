/**
 * dirsearch Collector — Web Path Brute-Force Discovery
 *
 * Integrates the vendored dirsearch engine (maurosoria/dirsearch, GPLv2)
 * into NexusGraph via a Python bridge for programmatic path brute-forcing.
 *
 * Key Capabilities:
 *  - Brute-force discovers hidden directories, files, and endpoints
 *  - Classifies findings: admin panels, backup files, config files,
 *    API endpoints, login portals, database interfaces, log files
 *  - Assigns risk levels (high/medium/low) based on path category
 *  - Curated OSINT wordlist (top 500 paths from common.txt)
 *
 * Security:
 *  - SSRF guard validates target URL/domain before scanning
 *  - Non-interactive execution via vendor/dirsearch-bridge.py with JSON over stdin
 *  - Timeout: 90s max (path scanning is inherently slower)
 *  - Max stdout: 8MB
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
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
import { normalizeDomain, normalizeUrl } from '@nexusgraph/shared';
import { validateUrl } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveBridgePath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'vendor/dirsearch-bridge.py'),
    path.resolve(__dirname, '../../../../vendor/dirsearch-bridge.py'),
    path.resolve(__dirname, '../../../vendor/dirsearch-bridge.py'),
    path.resolve(__dirname, '../../vendor/dirsearch-bridge.py'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Continue to next candidate
    }
  }
  return path.resolve(__dirname, '../../../../vendor/dirsearch-bridge.py');
}

const BRIDGE_PATH = resolveBridgePath();
const ENGINE_TIMEOUT_MS = 45_000;
const MAX_STDOUT_BYTES = 8 * 1024 * 1024;

export interface DirsearchFinding {
  url: string;
  path: string;
  status: number;
  length: number;
  content_type: string;
  redirect: string;
  elapsed: number;
  category: string;
  risk_level: string;
}

export interface DirsearchBridgeOutput {
  target?: string;
  total_tested?: number;
  results?: DirsearchFinding[];
  stats?: {
    tested: number;
    found: number;
    duration_seconds: number;
    extensions: string[];
  };
  errors?: string[];
  error?: string;
}

function runBridge(
  payload: {
    target: string;
    extensions?: string[];
    timeout?: number;
    max_entries?: number;
  },
  signal?: AbortSignal,
): Promise<DirsearchBridgeOutput> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('dirsearch cancelled by caller before start'));
      return;
    }

    const pythonBin = process.env.PYTHON_BIN || 'python';
    const child = spawn(pythonBin, [BRIDGE_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        NO_COLOR: '1',
      },
    });

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let killed = false;

    const cleanup = () => {
      clearTimeout(timer);
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const timer = setTimeout(() => {
      killed = true;
      cleanup();
      child.kill('SIGTERM');
      reject(new Error(`dirsearch engine timed out after ${ENGINE_TIMEOUT_MS}ms`));
    }, ENGINE_TIMEOUT_MS);

    const onAbort = () => {
      killed = true;
      cleanup();
      child.kill('SIGTERM');
      reject(new Error('dirsearch execution aborted by caller'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        killed = true;
        cleanup();
        child.kill('SIGTERM');
        reject(new Error('dirsearch stdout exceeded maximum buffer size'));
        return;
      }
      stdout += chunk.toString('utf-8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      cleanup();
      reject(new Error(`Failed to start dirsearch bridge: ${err.message}`));
    });

    child.on('close', (code) => {
      cleanup();
      if (killed) return;

      if (code !== 0 && !stdout.trim()) {
        reject(
          new Error(
            `dirsearch bridge exited with code ${code}: ${stderr.slice(0, 500)}`,
          ),
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed as DirsearchBridgeOutput);
      } catch {
        reject(
          new Error(
            `dirsearch bridge returned invalid JSON (code ${code}): ${stdout.slice(0, 300)}`,
          ),
        );
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

/** Map dirsearch category to a human-readable Indonesian label */
function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    hidden_file: 'File Tersembunyi (Dotfile / Backup)',
    hidden_directory: 'Direktori Tersembunyi (Internal / Secret)',
    admin_panel: 'Panel Admin',
    login_portal: 'Portal Login',
    backup_file: 'File Backup & Archive',
    config_file: 'File Konfigurasi & Secret',
    sensitive_document: 'Dokumen Sensitif (PDF/Office)',
    source_code_js: 'Frontend Script & Config (JS)',
    server_script_php: 'Script Server (PHP)',
    api_endpoint: 'Endpoint API',
    version_control: 'Version Control (Git/SVN)',
    info_disclosure: 'Info Disclosure / Profiling',
    database_interface: 'Database Interface',
    log_file: 'File Log Sistem',
    upload_directory: 'Direktori Upload / Storage',
    sensitive_directory: 'Direktori Internal Sensitif',
    redirect: 'Redirect',
    forbidden: 'Forbidden (403)',
    discovered_path: 'Path Ditemukan',
  };
  return labels[category] || 'Path Ditemukan';
}

/** Map risk level to confidence score */
function riskToConfidence(risk: string): number {
  if (risk === 'high') return 95;
  if (risk === 'medium') return 85;
  return 75;
}

export const dirsearchCollector: Collector = {
  name: 'dirsearch',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    // Derive target URL
    let targetUrl: string;
    let domain: string;

    if (input.includes('://')) {
      const validation = validateUrl(input);
      if (!validation.safe) {
        warnings.push(`URL rejected by SSRF guard: ${validation.reason}`);
        return { source: 'dirsearch', collectedAt, entities, relationships, evidence, warnings };
      }
      targetUrl = input;
      domain = normalizeDomain(new URL(input).hostname);
    } else {
      domain = normalizeDomain(input);
      targetUrl = `https://${domain}`;
      const validation = validateUrl(targetUrl);
      if (!validation.safe) {
        warnings.push(`URL rejected by SSRF guard: ${validation.reason}`);
        return { source: 'dirsearch', collectedAt, entities, relationships, evidence, warnings };
      }
    }

    if (!domain || !domain.includes('.')) {
      warnings.push(`Invalid domain for dirsearch: "${input}"`);
      return { source: 'dirsearch', collectedAt, entities, relationships, evidence, warnings };
    }

    logger.info('dirsearch web path discovery started', {
      requestId: ctx.requestId,
      target: targetUrl,
      domain,
    });

    try {
      const bridgeOutput = await runBridge(
        {
          target: targetUrl,
          extensions: [
            'php',
            'js',
            'pdf',
            'docx',
            'doc',
            'xlsx',
            'xls',
            'csv',
            'sql',
            'zip',
            'json',
            'env',
            'log',
            'txt',
            'bak',
            'old',
            'save',
            'swp',
            'tar.gz',
            'sqlite',
            'sqlite3',
            'yml',
            'yaml',
            'ini',
            'conf',
          ],
          timeout: 2.5,
          max_entries: 350,
        },
        ctx.signal,
      );

      if (bridgeOutput.error) {
        warnings.push(`dirsearch bridge error: ${bridgeOutput.error}`);
        return { source: 'dirsearch', collectedAt, entities, relationships, evidence, warnings };
      }

      if (bridgeOutput.errors && bridgeOutput.errors.length > 0) {
        for (const err of bridgeOutput.errors) {
          warnings.push(`dirsearch: ${err}`);
        }
      }

      // STRICT FILTER & DEDUPLICATION: Only accept HTTP 200 OK findings and eliminate duplicates
      const seenUrls = new Set<string>();
      const results = (bridgeOutput.results || []).filter((r) => {
        if (r.status !== 200) return false;
        const norm = normalizeUrl(r.url) || r.url;
        if (seenUrls.has(norm)) return false;
        seenUrls.add(norm);
        return true;
      });
      const stats = bridgeOutput.stats;

      logger.info('dirsearch web path discovery completed', {
        requestId: ctx.requestId,
        domain,
        pathsTested: stats?.tested ?? 0,
        pathsFound: results.length,
        durationSeconds: stats?.duration_seconds ?? 0,
      });

      // Primary source entity reference
      const primarySourceVal = domain;
      const primarySourceType = 'DOMAIN' as const;

      // Emit entities for each discovered path
      for (const finding of results.slice(0, 100)) {
        const label = categoryLabel(finding.category);
        const confidence = riskToConfidence(finding.risk_level);
        const normalizedUrl = normalizeUrl(finding.url);

        const isHidden =
          finding.category === 'hidden_file' ||
          finding.category === 'hidden_directory' ||
          finding.path.startsWith('.') ||
          finding.path.startsWith('_') ||
          /\.(bak|old|save|swp|backup)$/i.test(finding.path);

        const isDocument =
          finding.category === 'sensitive_document' ||
          /\.(pdf|docx?|xlsx?|csv|odt|rtf)$/i.test(finding.path);

        const entityType: EntityType = isDocument ? 'DOCUMENT' : 'URL';

        entities.push({
          type: entityType,
          value: normalizedUrl || finding.url,
          title: `[200] ${label}: /${finding.path}`,
          confidence,
          metadata: {
            httpStatus: 200,
            contentLength: finding.length,
            contentType: finding.content_type,
            responseTimeMs: Math.round(finding.elapsed * 1000),
            redirect: finding.redirect || undefined,
            pathCategory: finding.category,
            riskLevel: finding.risk_level,
            categoryLabel: label,
            isDocument,
            isHidden,
            hiddenType: isHidden
              ? finding.category === 'hidden_file' || finding.path.startsWith('.') || /\.(bak|old|save|swp)$/i.test(finding.path)
                ? 'DOTFILE_OR_BACKUP'
                : 'INTERNAL_DIRECTORY'
              : undefined,
            docKind: isDocument ? 'DIRSEARCH_DOCUMENT' : 'DIRSEARCH_FINDING',
            source: {
              collector: 'dirsearch',
              transform: 'domain.dirsearch-path-bruteforce',
              derivedFrom: input,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: primarySourceVal,
          source_type: primarySourceType,
          target_value: normalizedUrl || finding.url,
          target_type: entityType,
          relationship_type: 'LINKS_TO',
          confidence,
          reason: isHidden
            ? `File/path tersembunyi terdeteksi aktif oleh dirsearch: /${finding.path} (HTTP 200 OK, ${label})`
            : isDocument
              ? `Dokumen sensitif terdeteksi oleh dirsearch: /${finding.path} (HTTP 200 OK, ${label})`
              : `Path aktif terdeteksi oleh dirsearch: /${finding.path} (HTTP 200 OK, ${label})`,
        });
      }

      // Group findings by category for summary evidence
      const categoryGroups: Record<string, DirsearchFinding[]> = {};
      for (const r of results) {
        if (!categoryGroups[r.category]) categoryGroups[r.category] = [];
        categoryGroups[r.category].push(r);
      }

      // Emit evidence per category
      for (const [cat, findings] of Object.entries(categoryGroups)) {
        const label = categoryLabel(cat);
        const risk = findings[0]?.risk_level || 'low';
        const pathList = findings.map((f) => `/${f.path} [${f.status}]`).join('\n');

        evidence.push({
          source_url: targetUrl,
          source_type: 'DIRSEARCH_SCAN',
          title: `${label} (${findings.length} path ditemukan)`,
          extracted_value: pathList,
          confidence: riskToConfidence(risk),
          metadata: {
            category: cat,
            riskLevel: risk,
            count: findings.length,
            paths: findings.map((f) => ({
              path: f.path,
              status: f.status,
              length: f.length,
              contentType: f.content_type,
            })),
          },
        });
      }

      // Overall scan summary evidence
      if (results.length > 0) {
        const highRisk = results.filter((r) => r.risk_level === 'high');
        const mediumRisk = results.filter((r) => r.risk_level === 'medium');

        evidence.push({
          source_url: targetUrl,
          source_type: 'DIRSEARCH_SCAN',
          title: `Ringkasan Scan dirsearch (${results.length} path ditemukan dari ${stats?.tested ?? 0} diuji)`,
          extracted_value: [
            `Target: ${targetUrl}`,
            `Path diuji: ${stats?.tested ?? 0}`,
            `Path ditemukan: ${results.length}`,
            `Risiko tinggi: ${highRisk.length}`,
            `Risiko sedang: ${mediumRisk.length}`,
            `Durasi: ${stats?.duration_seconds ?? 0}s`,
          ].join('\n'),
          confidence: 90,
          metadata: {
            scanSummary: true,
            totalTested: stats?.tested ?? 0,
            totalFound: results.length,
            highRiskCount: highRisk.length,
            mediumRiskCount: mediumRisk.length,
            durationSeconds: stats?.duration_seconds ?? 0,
          },
        });
      }
    } catch (err: any) {
      warnings.push(`dirsearch error: ${err.message || 'unknown error'}`);
      logger.warn('dirsearch run error', {
        requestId: ctx.requestId,
        error: err.message,
      });
    }

    return {
      source: 'dirsearch',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
