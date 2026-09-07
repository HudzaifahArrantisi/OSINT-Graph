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
  Sparkles,
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500/20 to-purple-500/20 border border-sky-500/40 flex items-center justify-center shrink-0 shadow-inner">
              <Target className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  {seedType} TARGET SEED
                </span>
                {aggregatedIntel.waf && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    🛡️ {aggregatedIntel.waf}
                  </span>
                )}
                {aggregatedIntel.securityReport?.grade && (
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                      aggregatedIntel.securityReport.grade.startsWith('A')
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : aggregatedIntel.securityReport.grade === 'B'
                          ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    Grade {aggregatedIntel.securityReport.grade}
                  </span>
                )}
              </div>
              <h2 className="text-base font-mono font-bold text-white mt-1 select-text">
                {seedValue}
              </h2>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleCopy(seedValue)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              {copiedText === seedValue ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedText === seedValue ? 'Copied' : 'Copy'}</span>
            </button>
            <a
              href={seedValue.startsWith('http') ? seedValue : `https://${seedValue}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono bg-sky-600 hover:bg-sky-500 text-white font-medium transition-all shadow-md cursor-pointer"
            >
              <span>Visit Site</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-slate-800 pb-1 overflow-x-auto no-scrollbar font-mono text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-slate-800 text-white font-semibold border-b-2 border-sky-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Overview & Infra</span>
          </button>

          <button
            onClick={() => setActiveTab('trackers')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activeTab === 'trackers'
                ? 'bg-purple-900/40 text-purple-200 font-semibold border-b-2 border-purple-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Trackers & Ads</span>
            {aggregatedIntel.trackers.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/30 text-purple-300 font-bold">
                {aggregatedIntel.trackers.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'bg-teal-900/40 text-teal-200 font-semibold border-b-2 border-teal-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span>Security & Headers</span>
          </button>

          <button
            onClick={() => setActiveTab('crawler')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activeTab === 'crawler'
                ? 'bg-cyan-900/40 text-cyan-200 font-semibold border-b-2 border-cyan-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>Site Crawler</span>
          </button>

          <button
            onClick={() => setActiveTab('subdomains')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activeTab === 'subdomains'
                ? 'bg-slate-800 text-white font-semibold border-b-2 border-sky-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>Subdomains</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
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
              <div className="p-3.5 rounded-xl bg-[#0e131d] border border-slate-800/80 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sky-400 font-semibold pb-1 border-b border-slate-800">
                  <Server className="w-4 h-4" />
                  <span>Infrastruktur Hosting</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/40">
                  <span className="text-slate-400">Target Value:</span>
                  <span className="text-slate-200 font-medium truncate max-w-[200px]">{seedValue}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/40">
                  <span className="text-slate-400">Web Server Banner:</span>
                  <span className="text-slate-200 font-medium">{aggregatedIntel.serverBanner || 'Hidden / Protected'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/40">
                  <span className="text-slate-400">WAF / Edge CDN:</span>
                  <span className="text-emerald-400 font-medium">{aggregatedIntel.waf || 'Direct / Origin'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Resolved IP Address:</span>
                  <span className="text-cyan-400 font-medium">
                    {aggregatedIntel.ips.map((i) => i.ip).join(', ') || 'Resolving...'}
                  </span>
                </div>
              </div>

              {/* Card 2: Security & Port Health */}
              <div className="p-3.5 rounded-xl bg-[#0e131d] border border-slate-800/80 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-teal-400 font-semibold pb-1 border-b border-slate-800">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Postur Keamanan Singkat</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/40">
                  <span className="text-slate-400">Security Header Grade:</span>
                  <span className="text-emerald-400 font-bold">
                    {aggregatedIntel.securityReport?.grade ? `Grade ${aggregatedIntel.securityReport.grade} (${aggregatedIntel.securityReport.score}/100)` : 'Audit in progress'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/40">
                  <span className="text-slate-400">Open Ports (Shodan):</span>
                  <span className="text-slate-200 font-medium">
                    {aggregatedIntel.openPorts.length > 0 ? aggregatedIntel.openPorts.map((p) => p.port).join(', ') : 'Filtered / Standard (80, 443)'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/40">
                  <span className="text-slate-400">Verified Security Contact:</span>
                  <span className="text-pink-400 font-medium truncate max-w-[180px]">
                    {aggregatedIntel.securityContacts[0] || 'None declared in security.txt'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Tracking Tags Count:</span>
                  <span className="text-purple-400 font-bold">{aggregatedIntel.trackers.length} Tags Found</span>
                </div>
              </div>
            </div>
          )}

          {/* 2. TRACKERS & ADS PIVOTING */}
          {activeTab === 'trackers' && (
            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 text-purple-200 leading-relaxed text-[11px]">
                💡 <strong>OSINT Pivoting Tip</strong>: Kode pelacak analitik dan iklan yang diekstraksi dari HTML target sering kali digunakan bersama di situs lain yang dimiliki oleh pemilik atau jaringan yang sama. Salin ID atau gunakan pivot query untuk melacak website klon / sister sites.
              </div>

              {aggregatedIntel.trackers.length === 0 ? (
                <div className="p-8 text-center text-slate-500 bg-[#0e131d] rounded-xl border border-slate-800">
                  Tidak ditemukan tag analitik atau tracker pihak ketiga (Google Analytics, GTM, AdSense, Meta Pixel) pada halaman depan target.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {aggregatedIntel.trackers.map((t, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-[#0d111b] border border-purple-500/25 hover:border-purple-500/60 transition-all flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-purple-500/20 flex items-center justify-center shrink-0">
                            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                          </div>
                          <div>
                            <div className="text-[11px] font-bold text-white">{t.label}</div>
                            <div className="text-[9.5px] text-purple-400 font-semibold">{t.provider}</div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleCopy(t.id)}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          title="Salin Tracking ID"
                        >
                          {copiedText === t.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>

                      <div className="p-1.5 rounded bg-black/40 border border-slate-800/80 font-mono text-[11px] text-purple-200 font-semibold truncate select-all">
                        {t.id}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/50">
                        <span>Pivot Query:</span>
                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(`site:* "${t.id}"`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
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
                  <div className="p-4 rounded-xl bg-[#0d1320] border border-teal-500/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center font-bold text-lg text-teal-300">
                        {aggregatedIntel.securityReport.grade}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">HTTP Security Headers Score: {aggregatedIntel.securityReport.score} / 100</div>
                        <div className="text-[10.5px] text-slate-400">
                          {aggregatedIntel.securityReport.findings?.length === 0
                            ? 'Luar biasa: Semua header keamanan esensial telah terkonfigurasi dengan baik.'
                            : `${aggregatedIntel.securityReport.findings?.length} rekomendasi perbaikan terdeteksi.`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Checklist Table */}
                  <div className="p-3 rounded-xl bg-[#0e131d] border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                      <span className="font-semibold text-slate-300">Strict-Transport-Security (HSTS):</span>
                      <span className={aggregatedIntel.securityReport.hsts?.present ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {aggregatedIntel.securityReport.hsts?.present ? '✓ Terpasang' : '✗ Tidak Ditemukan'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                      <span className="font-semibold text-slate-300">Content-Security-Policy (CSP):</span>
                      <span className={aggregatedIntel.securityReport.csp?.present ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {aggregatedIntel.securityReport.csp?.present ? '✓ Terpasang' : '✗ Tidak Ditemukan'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                      <span className="font-semibold text-slate-300">X-Frame-Options (Anti-Clickjacking):</span>
                      <span className={aggregatedIntel.securityReport.xFrameOptions?.present ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {aggregatedIntel.securityReport.xFrameOptions?.present ? `✓ ${aggregatedIntel.securityReport.xFrameOptions.value}` : '✗ Tidak Ditemukan'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                      <span className="font-semibold text-slate-300">X-Content-Type-Options:</span>
                      <span className={aggregatedIntel.securityReport.xContentTypeOptions?.isNosniff ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {aggregatedIntel.securityReport.xContentTypeOptions?.isNosniff ? '✓ nosniff' : '✗ Tidak Ditemukan'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="font-semibold text-slate-300">CORS Wildcard (*):</span>
                      <span className={aggregatedIntel.securityReport.cors?.wildcard ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                        {aggregatedIntel.securityReport.cors?.wildcard ? '⚠️ Wildcard Diizinkan' : '✓ Terproteksi'}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-slate-500 bg-[#0e131d] rounded-xl border border-slate-800">
                  Data HTTP Security Audit sedang diproses atau belum dieksekusi untuk target ini.
                </div>
              )}
            </div>
          )}

          {/* 4. SITE CRAWLER & ARCHITECTURE */}
          {activeTab === 'crawler' && (
            <div className="flex flex-col gap-3.5">
              {/* robots.txt Disallow Rules */}
              <div className="p-3.5 rounded-xl bg-[#0e131d] border border-slate-800 flex flex-col gap-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                  <div className="flex items-center gap-2 text-cyan-400 font-semibold">
                    <FileText className="w-4 h-4" />
                    <span>robots.txt (Direktori Terlarang Sensitif)</span>
                  </div>
                  {aggregatedIntel.robotsDoc?.disallowCount && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">
                      {aggregatedIntel.robotsDoc.disallowCount} rules
                    </span>
                  )}
                </div>

                {aggregatedIntel.robotsDoc?.sensitivePaths?.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {aggregatedIntel.robotsDoc.sensitivePaths.map((p: string, i: number) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10.5px]"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-500 py-1">Tidak ada path sensitif terdaftar di robots.txt.</span>
                )}
              </div>

              {/* security.txt Official RFC 9116 */}
              <div className="p-3.5 rounded-xl bg-[#0e131d] border border-slate-800 flex flex-col gap-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                  <div className="flex items-center gap-2 text-pink-400 font-semibold">
                    <Shield className="w-4 h-4" />
                    <span>RFC 9116 security.txt (Kontak Keamanan)</span>
                  </div>
                </div>

                {aggregatedIntel.securityContacts.length > 0 ? (
                  <div className="space-y-1">
                    {aggregatedIntel.securityContacts.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-pink-400" />
                          <span className="text-slate-200">{c}</span>
                        </div>
                        <button
                          onClick={() => handleCopy(c)}
                          className="text-[10px] text-sky-400 hover:underline cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-500 py-1">Tidak ditemukan file security.txt resmi.</span>
                )}
              </div>
            </div>
          )}

          {/* 5. SUBDOMAINS */}
          {activeTab === 'subdomains' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400 font-semibold">Total Subdomain Terpetakan:</span>
                <span className="text-sky-300 font-bold">{aggregatedIntel.subdomains.length} Domain</span>
              </div>

              {aggregatedIntel.subdomains.length === 0 ? (
                <div className="p-8 text-center text-slate-500 bg-[#0e131d] rounded-xl border border-slate-800">
                  Belum ada subdomain yang terdaftar untuk target ini.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {aggregatedIntel.subdomains.map((sub, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-[#0e131d] border border-slate-800/80 hover:border-sky-500/50 transition-colors flex items-center justify-between gap-1.5"
                    >
                      <span className="text-slate-200 text-[11px] truncate" title={sub}>
                        {sub}
                      </span>
                      <button
                        onClick={() => handleCopy(sub)}
                        className="text-slate-500 hover:text-white p-1 transition-colors cursor-pointer"
                        title="Salin Subdomain"
                      >
                        {copiedText === sub ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
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
