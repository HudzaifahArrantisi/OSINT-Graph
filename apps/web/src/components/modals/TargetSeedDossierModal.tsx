import React, { useState, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import {
  Target,
  Globe2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Cpu,
  Server,
  FileText,
  ExternalLink,
  Copy,
  Check,
  Search,
  Fingerprint,
  Layers,
  Lock,
  Mail,
  AlertTriangle,
  Code2,
} from 'lucide-react';

export interface TargetSeedDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  seedNode: { id: string; data?: Record<string, any> } | null;
  allNodes?: Array<{ id: string; data?: Record<string, any>; type?: string }>;
  allEdges?: Array<{ id: string; source: string; target: string; data?: Record<string, any> }>;
}

type TabKey = 'overview' | 'trackers' | 'security' | 'crawler' | 'subdomains';

export function TargetSeedDossierModal({
  isOpen,
  onClose,
  seedNode,
  allNodes = [],
  allEdges = [],
}: TargetSeedDossierModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const seedData = seedNode?.data || {};
  const seedValue = String(seedData.value || seedData.label || 'Target');
  const seedType = String(seedData.entityType || 'DOMAIN').toUpperCase();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Find all nodes directly or indirectly related to this target seed
  const aggregatedIntel = useMemo(() => {
    const trackers: Array<{ label: string; id: string; type: string; provider: string; pivotQuery: string }> = [];
    const subdomains: string[] = [];
    const ips: Array<{ ip: string; location?: string; isp?: string }> = [];
    let waf: string | null = null;
    let serverBanner: string | null = null;
    let securityReport: any = null;
    let robotsDoc: any = null;
    let sitemapDoc: any = null;
    let securityTxtDoc: any = null;
    const securityContacts: string[] = [];
    const openPorts: Array<{ port: number; service?: string; banner?: string }> = [];
    let spfDmarcReport: any = null;
    let whoisInfo: any = null;

    allNodes.forEach((node) => {
      if (node.id === seedNode?.id) return;
      const data = node.data || {};
      const meta = data.metadata || {};
      const entityType = String(data.entityType || '').toUpperCase();
      const val = String(data.value || '');
      const title = String(data.title || '');

      // 1. Trackers
      if (meta.category === 'TRACKER' || meta.trackerType) {
        trackers.push({
          label: data.title || val,
          id: meta.trackingId || val.split(': ')[1] || val,
          type: meta.trackerType || 'TRACKER',
          provider: meta.provider || 'Analytics',
          pivotQuery: meta.pivotQuery || `site:* "${val.split(': ')[1] || val}"`,
        });
      }

      // 2. Subdomains
      if (entityType === 'SUBDOMAIN' || (entityType === 'DOMAIN' && val.endsWith(`.${seedValue}`) && val !== seedValue)) {
        if (!subdomains.includes(val)) subdomains.push(val);
      }

      // 3. IPs
      if (entityType === 'IP_ADDRESS') {
        if (!ips.some((i) => i.ip === val)) {
          ips.push({ ip: val, location: meta.countryCode || meta.cityName, isp: meta.isp });
        }
      }

      // 4. Security Headers & WAF
      if (meta.kind === 'SECURITY_HEADERS_AUDIT') {
        securityReport = meta;
        if (meta.detectedWaf) waf = meta.detectedWaf;
        if (meta.serverBanner) serverBanner = meta.serverBanner;
      }
      if (meta.kind === 'WAF_DETECTION' || title.includes('WAF / CDN')) {
        waf = meta.provider || val;
      }

      // 5. Tech Stack & Server
      if (entityType === 'TECHNOLOGY') {
        if (val.toLowerCase().includes('openresty') || val.toLowerCase().includes('nginx') || val.toLowerCase().includes('apache')) {
          serverBanner = val;
        }
        if (val.toLowerCase().includes('cloudflare') && !waf) {
          waf = 'Cloudflare WAF / CDN';
        }
      }

      // 6. Crawler Documents
      if (meta.docKind === 'ROBOTS_TXT' || val.includes('/robots.txt')) {
        robotsDoc = meta;
      }
      if (meta.docKind === 'SITEMAP_XML' || val.includes('/sitemap.xml')) {
        sitemapDoc = meta;
      }
      if (meta.docKind === 'SECURITY_TXT' || val.includes('security.txt')) {
        securityTxtDoc = meta;
      }

      // 7. Security Contacts
      if (entityType === 'EMAIL' && (meta.isOfficialSecurityContact || meta.isSecurityContact)) {
        if (!securityContacts.includes(val)) securityContacts.push(val);
      }

      // 8. Shodan Open Ports
      if (meta.sourceKind === 'SHODAN' || (meta.ports && Array.isArray(meta.ports))) {
        if (meta.ports) {
          meta.ports.forEach((p: number) => {
            if (!openPorts.some((op) => op.port === p)) {
              openPorts.push({ port: p, service: p === 443 ? 'HTTPS' : p === 80 ? 'HTTP' : p === 22 ? 'SSH' : 'Service' });
            }
          });
        }
      }

      // 9. DNS Security (SPF/DMARC)
      if (meta.kind === 'DNS_SECURITY_AUDIT' || title.includes('SPF') || title.includes('DMARC')) {
        spfDmarcReport = meta;
      }

      // 10. WHOIS / RDAP
      if (meta.kind === 'WHOIS_RDAP' || entityType === 'ORGANIZATION') {
        whoisInfo = meta;
      }
    });

    return {
      trackers,
      subdomains,
      ips,
      waf,
      serverBanner,
      securityReport,
      robotsDoc,
      sitemapDoc,
      securityTxtDoc,
      securityContacts,
      openPorts,
      spfDmarcReport,
      whoisInfo,
    };
  }, [allNodes, seedNode, seedValue]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      maxWidth="4xl"
    >
      <div className="flex flex-col gap-4 -mt-2">
        {/* Header Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#222222]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#141414] border border-[#262626] flex items-center justify-center shrink-0 text-white">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-white text-black border border-white">
                  {seedType} TARGET SEED
                </span>
                {aggregatedIntel.waf && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#161616] text-neutral-300 border border-[#2a2a2a] flex items-center gap-1">
                    <Shield className="w-3 h-3 text-neutral-400" />
                    {aggregatedIntel.waf}
                  </span>
                )}
                {aggregatedIntel.securityReport?.grade && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#161616] text-neutral-200 border border-[#333333]">
                    Grade {aggregatedIntel.securityReport.grade}
                  </span>
                )}
              </div>
              <h2 className="text-base font-mono font-bold text-white mt-1 select-text tracking-tight">
                {seedValue}
              </h2>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleCopy(seedValue)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono bg-[#141414] hover:bg-[#1e1e1e] border border-[#282828] hover:border-neutral-500 text-neutral-300 hover:text-white transition-colors cursor-pointer"
            >
              {copiedText === seedValue ? (
                <Check className="w-3.5 h-3.5 text-white" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-neutral-400" />
              )}
              <span>{copiedText === seedValue ? 'Copied' : 'Copy'}</span>
            </button>
            <a
              href={seedValue.startsWith('http') ? seedValue : `https://${seedValue}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono bg-white hover:bg-neutral-200 text-black font-semibold transition-colors shadow-sm cursor-pointer"
            >
              <span>Visit Site</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-[#222222] pb-1.5 overflow-x-auto no-scrollbar font-sans text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-white text-black font-semibold border border-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-[#141414] border border-transparent'
            }`}
          >
            <Server className={`w-3.5 h-3.5 ${activeTab === 'overview' ? 'text-black' : 'text-neutral-400'}`} />
            <span>Overview & Infra</span>
          </button>

          <button
            onClick={() => setActiveTab('trackers')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'trackers'
                ? 'bg-white text-black font-semibold border border-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-[#141414] border border-transparent'
            }`}
          >
            <Fingerprint className={`w-3.5 h-3.5 ${activeTab === 'trackers' ? 'text-black' : 'text-neutral-400'}`} />
            <span>Trackers & Ads</span>
            {aggregatedIntel.trackers.length > 0 && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-medium ${
                  activeTab === 'trackers'
                    ? 'bg-black/15 text-black'
                    : 'bg-[#181818] text-neutral-400 border border-[#2a2a2a]'
                }`}
              >
                {aggregatedIntel.trackers.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'security'
                ? 'bg-white text-black font-semibold border border-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-[#141414] border border-transparent'
            }`}
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${activeTab === 'security' ? 'text-black' : 'text-neutral-400'}`} />
            <span>Security & Headers</span>
          </button>

          <button
            onClick={() => setActiveTab('crawler')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'crawler'
                ? 'bg-white text-black font-semibold border border-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-[#141414] border border-transparent'
            }`}
          >
            <FileText className={`w-3.5 h-3.5 ${activeTab === 'crawler' ? 'text-black' : 'text-neutral-400'}`} />
            <span>Site Crawler</span>
          </button>

          <button
            onClick={() => setActiveTab('subdomains')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'subdomains'
                ? 'bg-white text-black font-semibold border border-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-[#141414] border border-transparent'
            }`}
          >
            <Globe2 className={`w-3.5 h-3.5 ${activeTab === 'subdomains' ? 'text-black' : 'text-neutral-400'}`} />
            <span>Subdomains</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-medium ${
                activeTab === 'subdomains'
                  ? 'bg-black/15 text-black'
                  : 'bg-[#181818] text-neutral-400 border border-[#2a2a2a]'
              }`}
            >
              {aggregatedIntel.subdomains.length}
            </span>
          </button>
        </div>

        {/* Tab Content Panes */}
        <div className="min-h-[320px] max-h-[58vh] overflow-y-auto pr-1 text-xs font-mono">
          {/* 1. OVERVIEW & INFRA */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Card 1: Hosting & Origin */}
              <div className="p-3.5 rounded-lg bg-[#0e0e0e] border border-[#222222] flex flex-col gap-2.5">
                <div className="flex items-center gap-2 text-white font-semibold pb-1.5 border-b border-[#1f1f1f]">
                  <Server className="w-4 h-4 text-neutral-400" />
                  <span>Infrastruktur Hosting</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#1c1c1c]">
                  <span className="text-neutral-400 font-sans">Target Value:</span>
                  <span className="text-neutral-200 font-mono font-medium truncate max-w-[200px]">{seedValue}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#1c1c1c]">
                  <span className="text-neutral-400 font-sans">Web Server Banner:</span>
                  <span className="text-neutral-200 font-mono font-medium">{aggregatedIntel.serverBanner || 'Hidden / Protected'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#1c1c1c]">
                  <span className="text-neutral-400 font-sans">WAF / Edge CDN:</span>
                  <span className="text-white font-mono font-medium">{aggregatedIntel.waf || 'Direct / Origin'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-neutral-400 font-sans">Resolved IP Address:</span>
                  <span className="text-neutral-200 font-mono font-medium">
                    {aggregatedIntel.ips.map((i) => i.ip).join(', ') || 'Resolving...'}
                  </span>
                </div>
              </div>

              {/* Card 2: Security & Port Health */}
              <div className="p-3.5 rounded-lg bg-[#0e0e0e] border border-[#222222] flex flex-col gap-2.5">
                <div className="flex items-center gap-2 text-white font-semibold pb-1.5 border-b border-[#1f1f1f]">
                  <ShieldCheck className="w-4 h-4 text-neutral-400" />
                  <span>Postur Keamanan Singkat</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#1c1c1c]">
                  <span className="text-neutral-400 font-sans">Security Header Grade:</span>
                  <span className="text-white font-mono font-bold">
                    {aggregatedIntel.securityReport?.grade ? `Grade ${aggregatedIntel.securityReport.grade} (${aggregatedIntel.securityReport.score}/100)` : 'Audit in progress'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#1c1c1c]">
                  <span className="text-neutral-400 font-sans">Open Ports (Shodan):</span>
                  <span className="text-neutral-200 font-mono font-medium">
                    {aggregatedIntel.openPorts.length > 0 ? aggregatedIntel.openPorts.map((p) => p.port).join(', ') : 'Filtered / Standard (80, 443)'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#1c1c1c]">
                  <span className="text-neutral-400 font-sans">Verified Security Contact:</span>
                  <span className="text-neutral-300 font-mono font-medium truncate max-w-[180px]">
                    {aggregatedIntel.securityContacts[0] || 'None declared in security.txt'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-neutral-400 font-sans">Tracking Tags Count:</span>
                  <span className="text-white font-mono font-semibold">{aggregatedIntel.trackers.length} Tags Found</span>
                </div>
              </div>
            </div>
          )}

          {/* 2. TRACKERS & ADS PIVOTING */}
          {activeTab === 'trackers' && (
            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-lg bg-[#121212] border border-[#242424] text-neutral-300 leading-relaxed text-[11px] font-sans flex items-start gap-2.5">
                <Search className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">OSINT Pivoting Tip</strong>: Kode pelacak analitik dan iklan yang diekstraksi dari HTML target sering kali digunakan bersama di situs lain yang dimiliki oleh entitas yang sama. Salin ID atau gunakan pivot query untuk melacak website klon / sister infrastructure.
                </div>
              </div>

              {aggregatedIntel.trackers.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 bg-[#0e0e0e] rounded-lg border border-[#222222] font-sans text-xs">
                  Tidak ditemukan tag analitik atau tracker pihak ketiga (Google Analytics, GTM, AdSense, Meta Pixel) pada halaman depan target.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {aggregatedIntel.trackers.map((t, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-[#0e0e0e] border border-[#222222] hover:border-[#333333] transition-colors flex flex-col justify-between gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-[#161616] border border-[#282828] flex items-center justify-center shrink-0 text-neutral-300">
                            <Fingerprint className="w-3.5 h-3.5 text-neutral-400" />
                          </div>
                          <div>
                            <div className="text-[11px] font-bold text-white font-sans">{t.label}</div>
                            <div className="text-[9.5px] text-neutral-400 font-mono">{t.provider}</div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleCopy(t.id)}
                          className="p-1 rounded bg-[#161616] hover:bg-[#222222] text-neutral-400 hover:text-white transition-colors cursor-pointer border border-[#262626]"
                          title="Salin Tracking ID"
                        >
                          {copiedText === t.id ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>

                      <div className="p-1.5 rounded bg-[#070707] border border-[#1e1e1e] font-mono text-[11px] text-neutral-200 font-semibold truncate select-all">
                        {t.id}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-1 border-t border-[#1c1c1c] font-sans">
                        <span>Pivot Query:</span>
                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(`site:* "${t.id}"`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-neutral-300 hover:text-white font-mono text-[10.5px] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>Google Search ↗</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. SECURITY & HEADERS */}
          {activeTab === 'security' && (
            <div className="flex flex-col gap-3.5">
              {aggregatedIntel.securityReport ? (
                <>
                  {/* Score Banner */}
                  <div className="p-4 rounded-lg bg-[#0e0e0e] border border-[#222222] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-[#161616] border border-[#2e2e2e] flex items-center justify-center font-bold text-lg text-white font-mono">
                        {aggregatedIntel.securityReport.grade}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white font-sans">HTTP Security Headers Score: {aggregatedIntel.securityReport.score} / 100</div>
                        <div className="text-[11px] text-neutral-400 font-sans">
                          {aggregatedIntel.securityReport.findings?.length === 0
                            ? 'Semua header keamanan esensial telah terkonfigurasi dengan baik.'
                            : `${aggregatedIntel.securityReport.findings?.length} rekomendasi perbaikan terdeteksi.`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Checklist Table */}
                  <div className="p-3 rounded-lg bg-[#0e0e0e] border border-[#222222] space-y-2 font-sans text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-[#1c1c1c]">
                      <span className="font-medium text-neutral-300">Strict-Transport-Security (HSTS):</span>
                      <span className={aggregatedIntel.securityReport.hsts?.present ? 'text-white font-semibold font-mono' : 'text-neutral-500 font-mono'}>
                        {aggregatedIntel.securityReport.hsts?.present ? '✓ Terpasang' : '✗ Tidak Ditemukan'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-[#1c1c1c]">
                      <span className="font-medium text-neutral-300">Content-Security-Policy (CSP):</span>
                      <span className={aggregatedIntel.securityReport.csp?.present ? 'text-white font-semibold font-mono' : 'text-neutral-500 font-mono'}>
                        {aggregatedIntel.securityReport.csp?.present ? '✓ Terpasang' : '✗ Tidak Ditemukan'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-[#1c1c1c]">
                      <span className="font-medium text-neutral-300">X-Frame-Options (Anti-Clickjacking):</span>
                      <span className={aggregatedIntel.securityReport.xFrameOptions?.present ? 'text-white font-semibold font-mono' : 'text-neutral-500 font-mono'}>
                        {aggregatedIntel.securityReport.xFrameOptions?.present ? `✓ ${aggregatedIntel.securityReport.xFrameOptions.value}` : '✗ Tidak Ditemukan'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-[#1c1c1c]">
                      <span className="font-medium text-neutral-300">X-Content-Type-Options:</span>
                      <span className={aggregatedIntel.securityReport.xContentTypeOptions?.isNosniff ? 'text-white font-semibold font-mono' : 'text-neutral-500 font-mono'}>
                        {aggregatedIntel.securityReport.xContentTypeOptions?.isNosniff ? '✓ nosniff' : '✗ Tidak Ditemukan'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="font-medium text-neutral-300">CORS Wildcard (*):</span>
                      <span className={aggregatedIntel.securityReport.cors?.wildcard ? 'text-amber-300 font-medium font-mono' : 'text-neutral-400 font-mono'}>
                        {aggregatedIntel.securityReport.cors?.wildcard ? '⚠️ Wildcard Diizinkan' : '✓ Terproteksi'}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-neutral-500 bg-[#0e0e0e] rounded-lg border border-[#222222] font-sans text-xs">
                  Data HTTP Security Audit sedang diproses atau belum dieksekusi untuk target ini.
                </div>
              )}
            </div>
          )}

          {/* 4. SITE CRAWLER & ARCHITECTURE */}
          {activeTab === 'crawler' && (
            <div className="flex flex-col gap-3.5">
              {/* robots.txt Disallow Rules */}
              <div className="p-3.5 rounded-lg bg-[#0e0e0e] border border-[#222222] flex flex-col gap-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-[#1f1f1f]">
                  <div className="flex items-center gap-2 text-white font-semibold font-sans">
                    <FileText className="w-4 h-4 text-neutral-400" />
                    <span>robots.txt (Direktori Terlarang Sensitif)</span>
                  </div>
                  {aggregatedIntel.robotsDoc?.disallowCount && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#161616] text-neutral-300 border border-[#2a2a2a]">
                      {aggregatedIntel.robotsDoc.disallowCount} rules
                    </span>
                  )}
                </div>

                {aggregatedIntel.robotsDoc?.sensitivePaths?.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {aggregatedIntel.robotsDoc.sensitivePaths.map((p: string, i: number) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-[#161616] border border-[#2a2a2a] text-neutral-300 text-[10.5px] font-mono"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-neutral-500 py-1 font-sans">Tidak ada path sensitif terdaftar di robots.txt.</span>
                )}
              </div>

              {/* security.txt Official RFC 9116 */}
              <div className="p-3.5 rounded-lg bg-[#0e0e0e] border border-[#222222] flex flex-col gap-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-[#1f1f1f]">
                  <div className="flex items-center gap-2 text-white font-semibold font-sans">
                    <Shield className="w-4 h-4 text-neutral-400" />
                    <span>RFC 9116 security.txt (Kontak Keamanan)</span>
                  </div>
                </div>

                {aggregatedIntel.securityContacts.length > 0 ? (
                  <div className="space-y-1">
                    {aggregatedIntel.securityContacts.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-[#121212] border border-[#222222]">
                        <div className="flex items-center gap-2 font-mono">
                          <Mail className="w-3.5 h-3.5 text-neutral-400" />
                          <span className="text-neutral-200">{c}</span>
                        </div>
                        <button
                          onClick={() => handleCopy(c)}
                          className="text-[10.5px] text-neutral-400 hover:text-white font-mono hover:underline cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-neutral-500 py-1 font-sans">Tidak ditemukan file security.txt resmi.</span>
                )}
              </div>
            </div>
          )}

          {/* 5. SUBDOMAINS */}
          {activeTab === 'subdomains' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#222222] font-sans">
                <span className="text-neutral-400 font-medium">Total Subdomain Terpetakan:</span>
                <span className="text-white font-mono font-bold">{aggregatedIntel.subdomains.length} Domain</span>
              </div>

              {aggregatedIntel.subdomains.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 bg-[#0e0e0e] rounded-lg border border-[#222222] font-sans text-xs">
                  Belum ada subdomain yang terdaftar untuk target ini.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {aggregatedIntel.subdomains.map((sub, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-md bg-[#0e0e0e] border border-[#222222] hover:border-[#333333] transition-colors flex items-center justify-between gap-1.5"
                    >
                      <span className="text-neutral-200 text-[11px] font-mono truncate" title={sub}>
                        {sub}
                      </span>
                      <button
                        onClick={() => handleCopy(sub)}
                        className="text-neutral-500 hover:text-white p-1 transition-colors cursor-pointer"
                        title="Salin Subdomain"
                      >
                        {copiedText === sub ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
