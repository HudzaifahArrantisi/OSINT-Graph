import React, { useState, useMemo } from 'react';
import {
  Globe2,
  Copy,
  Check,
  Search,
  X,
  ArrowUpRight,
} from 'lucide-react';

export interface SubdomainItem {
  subdomain: string;
  active: boolean;
  ips?: string[];
}

export interface SubdomainsInventoryProps {
  allSubdomains?: SubdomainItem[];
  activeSubdomains?: SubdomainItem[];
  inactiveSubdomains?: SubdomainItem[];
  activeCount?: number;
  inactiveCount?: number;
  apex?: string;
}

export function SubdomainsInventory({
  allSubdomains = [],
  activeSubdomains,
  inactiveSubdomains,
  activeCount,
  inactiveCount,
  apex,
}: SubdomainsInventoryProps) {
  // Tabs: 'all' | 'active' | 'inactive'
  const [tab, setTab] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSubdomain, setCopiedSubdomain] = useState<string | null>(null);
  const [copiedList, setCopiedList] = useState(false);

  // Compute active & inactive lists
  const activeList = useMemo(() => {
    if (activeSubdomains && activeSubdomains.length > 0) return activeSubdomains;
    return allSubdomains.filter((s) => s.active);
  }, [activeSubdomains, allSubdomains]);

  const inactiveList = useMemo(() => {
    if (inactiveSubdomains && inactiveSubdomains.length > 0) return inactiveSubdomains;
    return allSubdomains.filter((s) => !s.active);
  }, [inactiveSubdomains, allSubdomains]);

  const totalActive = activeCount ?? activeList.length;
  const totalInactive = inactiveCount ?? inactiveList.length;
  const totalAll = allSubdomains.length > 0 ? allSubdomains.length : totalActive + totalInactive;

  // Selected tab list
  const currentTabItems = useMemo(() => {
    if (tab === 'active') return activeList;
    if (tab === 'inactive') return inactiveList;
    return allSubdomains;
  }, [tab, activeList, inactiveList, allSubdomains]);

  // Filtered by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return currentTabItems;
    const q = searchQuery.toLowerCase().trim();
    return currentTabItems.filter((item) => {
      const matchHost = item.subdomain.toLowerCase().includes(q);
      const matchIp = item.ips?.some((ip) => ip.toLowerCase().includes(q));
      return matchHost || matchIp;
    });
  }, [currentTabItems, searchQuery]);

  const handleCopy = (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedSubdomain(text);
    setTimeout(() => setCopiedSubdomain(null), 1500);
  };

  const handleCopyAllVisible = () => {
    const listText = filteredItems.map((item) => item.subdomain).join('\n');
    if (!listText) return;
    navigator.clipboard.writeText(listText);
    setCopiedList(true);
    setTimeout(() => setCopiedList(false), 2000);
  };

  return (
    <div className="bg-[#0a0a0a] border border-[#262626] rounded-card p-3 space-y-3 shadow-lg text-neutral-200">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-[#222222] pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Globe2 className="w-4 h-4 text-neutral-400 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-white">Daftar Subdomain</span>
              {apex && (
                <span className="text-[11px] text-neutral-400 font-mono">({apex})</span>
              )}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5 font-mono">
              <span className="text-emerald-400 font-medium">{totalActive} Aktif</span>
              {' · '}
              <span className="text-neutral-400">{totalInactive} Tidak Aktif</span>
              {' · '}
              <span className="text-neutral-300 font-medium">{totalAll} Total</span>
            </p>
          </div>
        </div>

        {/* Copy All Button */}
        {filteredItems.length > 0 && (
          <button
            type="button"
            onClick={handleCopyAllVisible}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-button bg-[#141414] hover:bg-[#1f1f1f] text-neutral-200 hover:text-white border border-[#2c2c2c] text-xs font-mono transition-colors"
            title="Salin semua subdomain yang tampil"
          >
            {copiedList ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 font-medium text-[11px]">Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-[11px]">Salin Semua</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Segmented Filter Control: Semua | Aktif | Tidak Aktif (Monochrome Theme) */}
      <div className="grid grid-cols-3 p-1 rounded-lg bg-[#121212] border border-[#222222] text-xs font-mono">
        <button
          type="button"
          onClick={() => setTab('all')}
          className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-[11px] transition-colors ${
            tab === 'all'
              ? 'bg-[#222222] text-white font-semibold shadow-sm border border-[#333333]'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <span>Semua</span>
          <span className="text-[10px] text-neutral-400 opacity-80">({totalAll})</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('active')}
          className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-[11px] transition-colors ${
            tab === 'active'
              ? 'bg-[#222222] text-emerald-300 font-semibold shadow-sm border border-[#333333]'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <span>Aktif</span>
          <span className="text-[10px] opacity-80">({totalActive})</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('inactive')}
          className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-[11px] transition-colors ${
            tab === 'inactive'
              ? 'bg-[#222222] text-neutral-200 font-semibold shadow-sm border border-[#333333]'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 shrink-0" />
          <span>Nonaktif</span>
          <span className="text-[10px] opacity-80">({totalInactive})</span>
        </button>
      </div>

      {/* Minimal Search Input (Monochrome Theme) */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari subdomain atau IP..."
          className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#121212] border border-[#262626] rounded-input text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-400 font-mono transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-0.5"
            title="Reset pencarian"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Clean & Legible Subdomains Table (Pure Monochrome Theme matching project) */}
      <div className="border border-[#262626] rounded-lg overflow-hidden bg-[#070707] shadow-inner">
        <div className="max-h-[440px] overflow-y-auto overflow-x-auto">
          <table className="w-full text-left font-mono border-collapse min-w-[340px]">
            <thead className="bg-[#121212] text-neutral-400 text-[10px] uppercase font-semibold tracking-wider border-b border-[#262626] sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3 w-20 whitespace-nowrap">Status</th>
                <th className="py-2.5 px-3">Subdomain</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-10 px-3 text-center text-neutral-500 text-xs">
                    <p>Tidak ada subdomain yang cocok.</p>
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="text-[11px] text-neutral-300 hover:underline inline-block mt-1 font-mono"
                      >
                        Reset pencarian
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const isCopied = copiedSubdomain === item.subdomain;
                  const targetUrl = `https://${item.subdomain}`;
                  const primaryIp = item.ips?.[0] || null;
                  const extraIpsCount = (item.ips?.length || 0) - 1;

                  return (
                    <tr
                      key={idx}
                      className="hover:bg-[#121212] transition-colors group cursor-pointer"
                      onClick={() => handleCopy(item.subdomain)}
                      title="Klik untuk menyalin subdomain"
                    >
                      {/* Status Column */}
                      <td className="py-2 px-3 align-middle whitespace-nowrap">
                        {item.active ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950/30 text-emerald-400 border border-emerald-800/40">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-[#161616] text-neutral-400 border border-[#262626]">
                            <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 shrink-0" />
                            Mati
                          </span>
                        )}
                      </td>

                      {/* Subdomain Hostname: Full name completely visible, no truncate ellipsis */}
                      <td className="py-2 px-3 align-middle">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <a
                            href={targetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-mono font-medium text-neutral-200 hover:text-white hover:underline break-all group-hover:text-white transition-colors"
                            title={`Buka ${targetUrl}`}
                          >
                            {item.subdomain}
                          </a>
                          <a
                            href={targetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-neutral-500 hover:text-neutral-300 opacity-60 group-hover:opacity-100 transition-opacity shrink-0"
                            title="Buka tab baru"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </a>
                          {isCopied && (
                            <span className="text-[9.5px] text-emerald-400 font-mono shrink-0 font-medium">
                              (Tersalin)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Resolved IP Address: Full IP visible, no truncate */}
                      <td className="py-2 px-3 align-middle text-right whitespace-nowrap">
                        {primaryIp ? (
                          <span
                            className="text-xs font-mono text-neutral-400"
                            title={item.ips?.join(', ')}
                          >
                            {primaryIp}
                            {extraIpsCount > 0 && (
                              <span className="text-neutral-500 text-[10px] ml-1">
                                (+{extraIpsCount})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-neutral-600 text-xs font-mono">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer Summary */}
        <div className="bg-[#121212] px-3.5 py-2 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono text-neutral-400">
          <span>
            Menampilkan <strong className="text-neutral-200">{filteredItems.length}</strong> dari{' '}
            <strong className="text-neutral-200">{currentTabItems.length}</strong> subdomain
          </span>
          <span className="text-neutral-500 text-[10.5px]">Klik baris untuk salin</span>
        </div>
      </div>
    </div>
  );
}
