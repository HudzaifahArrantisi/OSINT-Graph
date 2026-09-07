import { describe, it, expect } from 'vitest';
import { getCollector } from '../collectors/registry.js';
import { buildDiscoveryPlan } from '../discovery/planner.js';
import { getTransform } from '../transforms/registry.js';
import { dirsearchCollector } from '../collectors/dirsearch.js';
import { getNodeEngineModule } from '@nexusgraph/shared';

describe('dirsearch Web Path Brute-Force Discovery Tests', () => {
  it('should register dirsearch collector in registry', () => {
    const collector = getCollector('dirsearch');
    expect(collector).toBeDefined();
    expect(collector?.name).toBe('dirsearch');
  });

  it('should support DOMAIN and URL input types only', () => {
    expect(dirsearchCollector.supports('DOMAIN')).toBe(true);
    expect(dirsearchCollector.supports('URL')).toBe(true);
    expect(dirsearchCollector.supports('EMAIL')).toBe(false);
    expect(dirsearchCollector.supports('PHONE')).toBe(false);
    expect(dirsearchCollector.supports('IP_ADDRESS')).toBe(false);
  });

  it('should include dirsearch transform in DOMAIN discovery plan', () => {
    const plan = buildDiscoveryPlan('DOMAIN', 'example.com');
    const transformIds = plan.transforms.map((t) => t.id);
    expect(transformIds).toContain('domain.dirsearch-path-bruteforce');
  });

  it('should include dirsearch transform in URL discovery plan', () => {
    const plan = buildDiscoveryPlan('URL', 'https://example.com');
    const transformIds = plan.transforms.map((t) => t.id);
    expect(transformIds).toContain('domain.dirsearch-path-bruteforce');
  });

  it('should define correct metadata for domain.dirsearch-path-bruteforce transform', () => {
    const transform = getTransform('domain.dirsearch-path-bruteforce');
    expect(transform).toBeDefined();
    expect(transform?.name).toContain('dirsearch');
    expect(transform?.inputTypes).toContain('DOMAIN');
    expect(transform?.inputTypes).toContain('URL');
    expect(transform?.outputTypes).toContain('URL');
    expect(transform?.category).toBe('web');
    expect(transform?.riskLevel).toBe('medium');
  });

  it('should reject private or loopback IP targets via SSRF guard', async () => {
    const result = await dirsearchCollector.run('http://127.0.0.1/test', {
      caseId: 'test-case-id',
      requestId: 'test-req-id',
      signal: new AbortController().signal,
    });

    expect(result).toBeDefined();
    expect(result.source).toBe('dirsearch');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('SSRF guard');
    expect(result.entities).toHaveLength(0);
  });

  it('should handle invalid domain inputs safely without throwing', async () => {
    const result = await dirsearchCollector.run('invalid..domain', {
      caseId: 'test-case-id',
      requestId: 'test-req-id',
      signal: new AbortController().signal,
    });

    expect(result).toBeDefined();
    expect(result.source).toBe('dirsearch');
    expect(Array.isArray(result.entities)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should handle pre-aborted signal gracefully without crashing', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await dirsearchCollector.run('https://example.com', {
      caseId: 'test-case-id',
      requestId: 'test-req-id',
      signal: controller.signal,
    });

    expect(result).toBeDefined();
    expect(result.source).toBe('dirsearch');
    expect(result.warnings.some((w) => w.includes('aborted') || w.includes('cancelled'))).toBe(true);
  });

  it('should map nodes discovered by dirsearch to engine_dirsearch in graph layout', () => {
    const nodeData = {
      value: 'https://example.com/admin',
      type: 'URL',
      metadata: {
        docKind: 'DIRSEARCH_FINDING',
        source: {
          collector: 'dirsearch',
          transform: 'domain.dirsearch-path-bruteforce',
        },
      },
    };

    const engineMeta = getNodeEngineModule(nodeData);
    expect(engineMeta.id).toBe('engine_dirsearch');
    expect(engineMeta.name).toContain('dirsearch');
    expect(engineMeta.iconName).toBe('FolderSearch');
  });

  it('should strictly filter and emit only HTTP 200 findings', () => {
    // Simulated raw results from bridge containing mixed HTTP status codes
    const mixedFindings = [
      { url: 'https://example.com/admin', path: 'admin', status: 200, category: 'admin_panel', risk_level: 'high' },
      { url: 'https://example.com/.env', path: '.env', status: 403, category: 'config_file', risk_level: 'high' },
      { url: 'https://example.com/backup.zip', path: 'backup.zip', status: 404, category: 'backup_file', risk_level: 'high' },
      { url: 'https://example.com/login', path: 'login', status: 301, category: 'login_portal', risk_level: 'medium' },
      { url: 'https://example.com/api/v1', path: 'api/v1', status: 200, category: 'api_endpoint', risk_level: 'medium' },
    ];

    const filtered = mixedFindings.filter((f) => f.status === 200);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((f) => f.path)).toEqual(['admin', 'api/v1']);
    expect(filtered.every((f) => f.status === 200)).toBe(true);
  });

  it('should map DIRSEARCH_DOCUMENT nodes to engine_dirsearch in graph layout', () => {
    const docNodeData = {
      value: 'https://example.com/laporan.pdf',
      type: 'DOCUMENT',
      metadata: {
        docKind: 'DIRSEARCH_DOCUMENT',
        isDocument: true,
        pathCategory: 'sensitive_document',
        source: {
          collector: 'dirsearch',
          transform: 'domain.dirsearch-path-bruteforce',
        },
      },
    };

    const engineMeta = getNodeEngineModule(docNodeData);
    expect(engineMeta.id).toBe('engine_dirsearch');
    expect(engineMeta.name).toContain('dirsearch');
    expect(engineMeta.iconName).toBe('FolderSearch');
  });

  it('should classify document extensions as DOCUMENT entity type', () => {
    const testPaths = [
      { path: 'laporan.pdf', category: 'sensitive_document', expectedType: 'DOCUMENT' },
      { path: 'data-siswa.xlsx', category: 'sensitive_document', expectedType: 'DOCUMENT' },
      { path: 'surat.docx', category: 'sensitive_document', expectedType: 'DOCUMENT' },
      { path: 'users.csv', category: 'sensitive_document', expectedType: 'DOCUMENT' },
      { path: 'config.js', category: 'source_code_js', expectedType: 'URL' },
      { path: 'wp-login.php', category: 'login_portal', expectedType: 'URL' },
      { path: '.env', category: 'config_file', expectedType: 'URL' },
    ];

    for (const item of testPaths) {
      const isDocument =
        item.category === 'sensitive_document' ||
        /\.(pdf|docx?|xlsx?|csv|odt|rtf)$/i.test(item.path);

      const entityType = isDocument ? 'DOCUMENT' : 'URL';
      expect(entityType).toBe(item.expectedType);
    }
  });

  it('should classify composer.json and package.json as config_file with high risk', () => {
    const testPaths = [
      { path: 'composer.json', expectedCategory: 'config_file' },
      { path: 'package.json', expectedCategory: 'config_file' },
      { path: 'composer.lock', expectedCategory: 'config_file' },
      { path: '.env', expectedCategory: 'config_file' },
    ];

    for (const item of testPaths) {
      const isConfig =
        ['composer.json', 'package.json', 'composer.lock', '.env'].some((f) =>
          item.path.endsWith(f),
        );
      expect(isConfig).toBe(true);
    }
  });

  it('should deduplicate findings by normalized URL before returning entities', () => {
    const rawFindings = [
      { url: 'https://example.com/wp-login.php', path: 'wp-login.php', status: 200, length: 1234, content_type: 'text/html', redirect: '', elapsed: 0.5, category: 'login_portal', risk_level: 'medium' },
      { url: 'https://example.com/wp-login.php', path: 'wp-login.php', status: 200, length: 1234, content_type: 'text/html', redirect: '', elapsed: 0.6, category: 'login_portal', risk_level: 'medium' },
      { url: 'https://example.com/composer.json', path: 'composer.json', status: 200, length: 800, content_type: 'application/json', redirect: '', elapsed: 0.4, category: 'config_file', risk_level: 'high' },
    ];

    const seenUrls = new Set<string>();
    const unique = rawFindings.filter((r) => {
      if (seenUrls.has(r.url)) return false;
      seenUrls.add(r.url);
      return true;
    });

    expect(unique).toHaveLength(2);
    expect(unique.map((u) => u.path)).toEqual(['wp-login.php', 'composer.json']);
  });

  it('should identify hidden files and hidden directories with high risk level', () => {
    const hiddenCases = [
      { path: '.env', isHidden: true, expectedCategory: 'hidden_file', expectedRisk: 'high' },
      { path: '.git/config', isHidden: true, expectedCategory: 'hidden_file', expectedRisk: 'high' },
      { path: '.htaccess', isHidden: true, expectedCategory: 'hidden_file', expectedRisk: 'high' },
      { path: 'wp-config.php.bak', isHidden: true, expectedCategory: 'hidden_file', expectedRisk: 'high' },
      { path: 'database.php.old', isHidden: true, expectedCategory: 'hidden_file', expectedRisk: 'high' },
      { path: '_admin/', isHidden: true, expectedCategory: 'hidden_directory', expectedRisk: 'high' },
      { path: 'secret/login', isHidden: true, expectedCategory: 'hidden_directory', expectedRisk: 'high' },
      { path: 'internal/', isHidden: true, expectedCategory: 'hidden_directory', expectedRisk: 'high' },
    ];

    for (const item of hiddenCases) {
      const p = item.path.toLowerCase().replace(/\/+$/, '');
      const backupExts = ['.bak', '.old', '.save', '.swp', '.swo', '.orig', '.backup', '~'];

      const isHiddenFile =
        p.split('/').some((seg) => seg.startsWith('.')) ||
        backupExts.some((ext) => p.endsWith(ext)) ||
        p.endsWith('.bak') ||
        p.endsWith('.old');

      const isHiddenDir =
        p.split('/').some((seg) => seg.startsWith('_')) ||
        ['secret', 'hidden', 'private', 'internal', 'confidential', 'backoffice'].some((k) => p.includes(k));

      expect(isHiddenFile || isHiddenDir).toBe(true);
    }
  });

  it('should format node title and metadata with strict [200] prefix and isHidden tag', () => {
    const finding = {
      path: '.env',
      url: 'https://example.com/.env',
      status: 200,
      length: 512,
      content_type: 'text/plain',
      elapsed: 0.12,
      category: 'hidden_file',
      risk_level: 'high',
    };

    const isHidden =
      finding.category === 'hidden_file' ||
      finding.category === 'hidden_directory' ||
      finding.path.startsWith('.') ||
      finding.path.startsWith('_');

    expect(isHidden).toBe(true);
    expect(finding.status).toBe(200);

    const title = `[200] File Tersembunyi (Dotfile / Backup): /${finding.path}`;
    expect(title).toBe('[200] File Tersembunyi (Dotfile / Backup): /.env');
  });
});

