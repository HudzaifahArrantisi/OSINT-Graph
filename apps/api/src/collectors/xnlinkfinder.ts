/**
 * xnLinkFinder Collector
 *
 * Integrates xnLinkFinder / LinkFinder endpoint & parameter discovery engine
 * (xnl-h4ck3r/xnLinkFinder) into NexusGraph.
 *
 * Key Capabilities:
 *  - Cralws target web frontend to discover embedded JavaScript files
 *  - Unpacks client-side JS code to discover hidden API parameters (URL params,
 *    Axios/fetch queries, searchParams, JS variables, JSON keys)
 *  - Extracts internal REST API endpoints, relative routes, and links
 *  - Identifies embedded client secrets & API tokens with provenance
 *
 * Security:
 *  - SSRF guard validates target URL/domain before calling the engine
 *  - Non-interactive execution via vendor/xnlinkfinder-bridge.py with JSON over stdin
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
import { normalizeDomain } from '@nexusgraph/shared';
import { validateUrl } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE_PATH = path.resolve(__dirname, '../../../../vendor/xnlinkfinder-bridge.py');
const ENGINE_TIMEOUT_MS = 60_000;
const MAX_STDOUT_BYTES = 8 * 1024 * 1024;

export interface XnEndpointFinding {
  raw: string;
  url: string;
  in_scope: boolean;
  source_script?: string;
}

export interface XnParameterFinding {
  name: string;
  source: string;
  origin_script: string;
}

export interface XnSecretFinding {
  type: string;
  value: string;
  origin_script: string;
}

export interface XnBridgeOutput {
  target?: string;
  scope?: string;
  scripts?: string[];
  domains?: string[];
  endpoints?: XnEndpointFinding[];
  parameters?: XnParameterFinding[];
  secrets?: XnSecretFinding[];
  stats?: {
    scriptsAnalyzed: number;
    domainsFound?: number;
    endpointsFound: number;
    parametersFound: number;
    secretsFound: number;
  };
  error?: string;
}

function runBridge(payload: {
  target: string;
  scope?: string;
  depth?: number;
  timeout?: number;
}): Promise<XnBridgeOutput> {
  return new Promise((resolve, reject) => {
    const pythonBin = process.env.PYTHON_BIN || 'python';
    const child = spawn(pythonBin, [BRIDGE_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
      },
    });

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      reject(new Error(`xnLinkFinder engine timed out after ${ENGINE_TIMEOUT_MS}ms`));
    }, ENGINE_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        killed = true;
        child.kill('SIGTERM');
        clearTimeout(timer);
        reject(new Error('xnLinkFinder stdout exceeded maximum buffer size'));
        return;
      }
      stdout += chunk.toString('utf-8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;

      if (code !== 0 && !stdout.trim()) {
        reject(
          new Error(
            `xnLinkFinder bridge exited with code ${code}: ${stderr.trim() || 'No error details'}`,
          ),
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim()) as XnBridgeOutput;
        resolve(parsed);
      } catch (parseErr) {
        reject(
          new Error(
            `Failed to parse xnLinkFinder output as JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)} | Raw: ${stdout.slice(0, 300)}`,
          ),
        );
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export const xnlinkfinderCollector: Collector = {
  name: 'xnlinkfinder',

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
    let scopeDomain: string;

    const trimmed = input.trim();
    if (trimmed.includes('://')) {
      const validation = validateUrl(trimmed);
      if (!validation.safe) {
        warnings.push(`URL rejected by SSRF guard: ${validation.reason}`);
        return {
          source: 'xnlinkfinder',
          collectedAt,
          entities,
          relationships,
          evidence,
          warnings,
        };
      }
      targetUrl = trimmed;
      scopeDomain = normalizeDomain(new URL(trimmed).hostname);
    } else {
      scopeDomain = normalizeDomain(trimmed);
      targetUrl = `https://${scopeDomain}`;
      const validation = validateUrl(targetUrl);
      if (!validation.safe) {
        warnings.push(`Constructed URL rejected by SSRF guard: ${validation.reason}`);
        return {
          source: 'xnlinkfinder',
          collectedAt,
          entities,
          relationships,
          evidence,
          warnings,
        };
      }
    }

    logger.info('xnLinkFinder JS parameter & endpoint discovery started', {
      requestId: ctx.requestId,
      targetUrl,
      scopeDomain,
    });

    try {
      const bridgeOutput = await runBridge({
        target: targetUrl,
        scope: scopeDomain,
        depth: 1,
        timeout: 12,
      });

      if (bridgeOutput.error) {
        warnings.push(`xnLinkFinder error: ${bridgeOutput.error}`);
      }

      const endpoints = bridgeOutput.endpoints || [];
      const parameters = bridgeOutput.parameters || [];
      const secrets = bridgeOutput.secrets || [];
      const scripts = bridgeOutput.scripts || [];

      // 1. Evidence Summary of JavaScript Endpoints & Parameters
      evidence.push({
        source_url: targetUrl,
        source_type: 'JS_ENDPOINT_ANALYSIS',
        title: `xnLinkFinder Frontend JS Analysis (${scopeDomain})`,
        extracted_value: `Ditemukan ${endpoints.length} endpoints, ${parameters.length} JS parameters, dan ${scripts.length} skrip JS`,
        confidence: 85,
        metadata: {
          scriptsCount: scripts.length,
          endpointsCount: endpoints.length,
          parametersCount: parameters.length,
          secretsCount: secrets.length,
          topParameters: parameters.slice(0, 30).map((p) => p.name),
        },
      });

      // 2. Entities for Discovered Endpoints (in-scope API routes / endpoints with full target URLs)
      const inScopeEndpoints = endpoints.filter((e) => e.in_scope);
      const topEndpoints = (inScopeEndpoints.length > 0 ? inScopeEndpoints : endpoints).slice(0, 30);

      const primarySourceVal = scopeDomain || normalizeDomain(input);
      const primarySourceType: EntityType = 'DOMAIN';

      for (const ep of topEndpoints) {
        // Defensive check: Skip any MIME types or assets that might have leaked
        const rawLower = ep.raw.toLowerCase();
        if (
          ep.url.includes('text/x-') ||
          ep.url.includes('/application/') ||
          rawLower.startsWith('text/') ||
          rawLower.startsWith('image/') ||
          rawLower.startsWith('application/') ||
          rawLower.startsWith('audio/') ||
          rawLower.startsWith('video/') ||
          rawLower.startsWith('font/') ||
          rawLower.startsWith('mode/') ||
          rawLower.startsWith('ace/') ||
          rawLower.startsWith('webpack/') ||
          rawLower.startsWith('babel/')
        ) {
          continue;
        }

        let parsedUrl: URL;
        try {
          parsedUrl = new URL(ep.url);
        } catch {
          continue;
        }

        const hostLower = parsedUrl.hostname.toLowerCase();
        if (
          !parsedUrl.hostname ||
          !parsedUrl.hostname.includes('.') ||
          ['text', 'application', 'image', 'video', 'audio', 'font', 'mode', 'ace'].includes(hostLower)
        ) {
          continue;
        }

        const pathAndQuery = (parsedUrl.pathname === '/' && !parsedUrl.search ? '' : parsedUrl.pathname) + parsedUrl.search;
        const displayLabel = `${parsedUrl.hostname}${pathAndQuery}`;

        entities.push({
          type: 'URL',
          value: ep.url,
          title: displayLabel,
          confidence: 85,
          metadata: {
            endpointType: 'JS_DISCOVERED_ENDPOINT',
            fullUrl: ep.url,
            hostname: parsedUrl.hostname,
            pathname: parsedUrl.pathname,
            search: parsedUrl.search,
            rawPath: ep.raw,
            inScope: ep.in_scope,
            sourceScript: ep.source_script || targetUrl,
            source: {
              collector: 'xnlinkfinder',
              transform: 'domain.xnlinkfinder-js-params',
              derivedFrom: input,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: primarySourceVal,
          source_type: primarySourceType,
          target_value: ep.url,
          target_type: 'URL',
          relationship_type: 'LINKS_TO',
          confidence: 85,
          reason: `Endpoint API/URL tertanam di kode JavaScript frontend (${ep.source_script ? 'skrip eksternal' : 'inline'})`,
        });

        if (input !== primarySourceVal) {
          relationships.push({
            source_value: input,
            source_type: input.includes('://') ? 'URL' : 'DOMAIN',
            target_value: ep.url,
            target_type: 'URL',
            relationship_type: 'LINKS_TO',
            confidence: 85,
            reason: `Endpoint API/URL tertanam di kode JavaScript frontend (${ep.source_script ? 'skrip eksternal' : 'inline'})`,
          });
        }
      }

      // 3. Discovered Third-Party / External Domains found in JS
      const discoveredDomains = (bridgeOutput.domains || []).slice(0, 10);
      for (const extDomain of discoveredDomains) {
        entities.push({
          type: 'DOMAIN',
          value: extDomain,
          title: `Layanan Eksternal: ${extDomain}`,
          confidence: 85,
          metadata: {
            serviceType: 'JS_THIRD_PARTY_SERVICE',
            source: {
              collector: 'xnlinkfinder',
              transform: 'domain.xnlinkfinder-js-params',
              derivedFrom: input,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: primarySourceVal,
          source_type: primarySourceType,
          target_value: extDomain,
          target_type: 'DOMAIN',
          relationship_type: 'RELATED_TO',
          confidence: 85,
          reason: `Domain layanan pihak ketiga dipanggil oleh bundel JavaScript frontend`,
        });
      }

      // 4. Discovered Parameters: Surface individual high-value parameters as entities
      if (parameters.length > 0) {
        const uniqueParams = Array.from(new Set(parameters.map((p) => p.name)));
        const topIndividualParams = parameters.filter((p, i, arr) => arr.findIndex((x) => x.name === p.name) === i).slice(0, 10);

        for (const p of topIndividualParams) {
          const paramValue = `${targetUrl}?${p.name}=*`;
          entities.push({
            type: 'DOCUMENT',
            value: paramValue,
            title: `Param: ?${p.name}= (${p.source.replace('_', ' ')})`,
            confidence: 85,
            metadata: {
              paramName: p.name,
              paramSource: p.source,
              originScript: p.origin_script,
              docKind: 'JS_PARAMETER',
              source: {
                collector: 'xnlinkfinder',
                transform: 'domain.xnlinkfinder-js-params',
                derivedFrom: input,
                collectedAt,
              },
            },
          });

          relationships.push({
            source_value: primarySourceVal,
            source_type: primarySourceType,
            target_value: paramValue,
            target_type: 'DOCUMENT',
            relationship_type: 'OBSERVED_ON',
            confidence: 85,
            reason: `Parameter JavaScript "${p.name}" ditemukan dari ${p.source}`,
          });
        }

        // Summary entity for all extracted parameters
        const paramsSummary = uniqueParams.slice(0, 50).join(', ');
        entities.push({
          type: 'DOCUMENT',
          value: `${targetUrl}#js-parameters`,
          title: `Peta Parameter Frontend (${uniqueParams.length} ditemukan)`,
          confidence: 90,
          metadata: {
            docKind: 'JS_PARAMETERS_MAP',
            totalCount: uniqueParams.length,
            parameters: uniqueParams.slice(0, 100),
            details: parameters.slice(0, 50),
            source: {
              collector: 'xnlinkfinder',
              transform: 'domain.xnlinkfinder-js-params',
              derivedFrom: input,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: primarySourceVal,
          source_type: primarySourceType,
          target_value: `${targetUrl}#js-parameters`,
          target_type: 'DOCUMENT',
          relationship_type: 'OBSERVED_ON',
          confidence: 90,
          reason: `Peta lengkap parameter JavaScript frontend dibongkar dari bundel JS`,
        });

        evidence.push({
          source_url: targetUrl,
          source_type: 'JS_ENDPOINT_ANALYSIS',
          title: `Parameter JavaScript Frontend (${uniqueParams.length})`,
          extracted_value: paramsSummary,
          confidence: 90,
          metadata: {
            totalParameters: uniqueParams.length,
            parameters: uniqueParams.slice(0, 100),
          },
        });
      }

      // 4. Client Secrets if detected
      if (secrets.length > 0) {
        for (const secret of secrets.slice(0, 10)) {
          evidence.push({
            source_url: secret.origin_script || targetUrl,
            source_type: 'JS_ENDPOINT_ANALYSIS',
            title: `Potential Secret: ${secret.type}`,
            extracted_value: secret.value,
            confidence: 75,
            metadata: {
              secretType: secret.type,
              originScript: secret.origin_script,
            },
          });
        }
      }
    } catch (err: any) {
      warnings.push(`xnLinkFinder error: ${err.message || 'unknown error'}`);
      logger.warn('xnLinkFinder run error', {
        requestId: ctx.requestId,
        error: err.message,
      });
    }

    return {
      source: 'xnlinkfinder',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
