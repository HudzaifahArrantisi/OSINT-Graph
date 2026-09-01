import React, { useState, useMemo } from 'react';
import {
  Globe2,
  ExternalLink,
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
  // Tabs: 'active' | 'inactive' | 'all'
  const [tab, setTab] = useState<'active' | 'inactive' | 'all'>('active');
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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSubdomain(text);
    setTimeout(() => setCopiedSubdomain(null), 1800);
  };

  const handleCopyAllVisible = () => {
    const listText = filteredItems.map((item) => item.subdomain).join('\n');
    if (!listText) return;
    navigator.clipboard.writeText(listText);
    setCopiedList(true);
    setTimeout(() => setCopiedList(false), 2000);
  };

  return (
    <div className="bg-[#0c0c0c] border border-[#222222] rounded-card p-3.5 space-y-3.5 shadow-lg text-neutral-200">
      {/* Header & Title */}
      <div className="flex items-center justify-between gap-3 border-b border-[#222222] pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-lg bg-[#181818] border border-[#2c2c2c] text-white shrink-0">
            <Globe2 className="w-4 h-4 text-neutral-100" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-white tracking-wide">Subdomains Inventory</span>
              {apex && (
                <span className="text-[11px] text-neutral-400 font-mono">({apex})</span>
              )}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Total {totalAll} subdomains discovered via CT logs & DNS probe
            </p>
          </div>
        </div>

        {/* High-Contrast Crisp Copy List Button */}
        {filteredItems.length > 0 && (
          <button
            type="button"
            onClick={handleCopyAllVisible}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1e1e1e] hover:bg-[#2a2a2a] text-white border border-[#383838] hover:border-[#4f4f4f] text-xs font-mono font-medium transition-all shadow-sm active:scale-95"
            title="Copy all currently visible subdomains to clipboard"
          >
            {copiedList ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span className="text-white font-bold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-neutral-300" />
                <span className="text-white">Copy List</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* 2 Primary Tabs: Active vs Inactive (Plus All) - Pure Monochrome Styling */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex p-1 rounded-lg bg-[#141414] border border-[#242424] text-xs font-mono">
          {/* Active Tab */}
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs transition-all ${
              tab === 'active'
                ? 'bg-white text-black font-bold shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-[#1f1f1f]'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                tab === 'active' ? 'bg-black' : 'bg-neutral-400'
              }`}
            />
            <span>Active</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                tab === 'active'
                  ? 'bg-black/10 text-black'
                  : 'bg-[#222222] text-neutral-300 border border-[#333333]'
              }`}
            >
              {totalActive}
            </span>
          </button>

          {/* Inactive Tab */}
          <button
            type="button"
            onClick={() => setTab('inactive')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs transition-all ${
              tab === 'inactive'
                ? 'bg-white text-black font-bold shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-[#1f1f1f]'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                tab === 'inactive' ? 'bg-black' : 'bg-neutral-600'
              }`}
            />
            <span>Inactive</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                tab === 'inactive'
                  ? 'bg-black/10 text-black'
                  : 'bg-[#222222] text-neutral-300 border border-[#333333]'
              }`}
            >
              {totalInactive}
            </span>
          </button>

          {/* All Tab */}
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all ${
              tab === 'all'
                ? 'bg-white text-black font-bold shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-[#1f1f1f]'
            }`}
          >
            <span>All</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                tab === 'all'
                  ? 'bg-black/10 text-black'
                  : 'bg-[#222222] text-neutral-300 border border-[#333333]'
              }`}
            >
              {totalAll}
            </span>
          </button>
        </div>
      </div>

      {/* Search Filter Input (Monochrome Dark) */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${tab === 'active' ? 'active' : tab === 'inactive' ? 'inactive' : ''} subdomains or IP...`}
          className="w-full pl-9 pr-8 py-2 text-xs bg-[#111111] border border-[#262626] rounded-md text-white placeholder-neutral-500 focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/20 transition-all font-mono"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-0.5"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Subdomains Table Container (Monochrome Dark) */}
      <div className="border border-[#222222] rounded-lg overflow-hidden bg-[#0a0a0a]">
        <div className="max-h-80 overflow-y-auto overflow-x-auto divide-y divide-[#1c1c1c]">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#141414] text-neutral-400 text-[10px] uppercase font-bold tracking-wider border-b border-[#222222] sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3 w-28 whitespace-nowrap">Status</th>
                <th className="py-2.5 px-3 min-w-[200px]">Hostname</th>
                <th className="py-2.5 px-3 min-w-[130px]">Resolved IP</th>
                <th className="py-2.5 px-3 text-right w-20 whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#181818]">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 px-3 text-center text-neutral-500 space-y-1.5">
                    <p className="text-xs">No subdomains match your search query.</p>
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="text-[11px] text-white hover:underline inline-block mt-1 font-mono"
                      >
                        Reset search
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const isCopied = copiedSubdomain === item.subdomain;
                  const targetUrl = `https://${item.subdomain}`;

                  return (
                    <tr
                      key={idx}
                      className="hover:bg-[#141414] transition-colors group"
                    >
                      {/* Status Column (Monochrome Badges) */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {item.active ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-white text-black border border-white">
                            <span className="w-1.5 h-1.5 rounded-full bg-black" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-[#1a1a1a] text-neutral-400 border border-[#2e2e2e]">
                            <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Hostname Column (Full visible + Direct clickable link) */}
                      <td className="py-2.5 px-3">
                        <a
                          href={targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-neutral-100 hover:text-white hover:underline break-all transition-colors inline-flex items-center gap-1.5 font-medium group/link"
                          title={`Open ${targetUrl} in new tab`}
                        >
                          <span>{item.subdomain}</span>
                          <ArrowUpRight className="w-3 h-3 text-neutral-400 group-hover/link:text-white group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-all flex-shrink-0" />
                        </a>
                      </td>

                      {/* Resolved IP Column */}
                      <td className="py-2.5 px-3">
                        {item.ips && item.ips.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.ips.map((ip, ipIdx) => (
                              <span
                                key={ipIdx}
                                className="inline-block px-1.5 py-0.5 rounded bg-[#181818] text-neutral-200 font-mono text-[10.5px] border border-[#2e2e2e]"
                                title={`Resolved IP: ${ip}`}
                              >
                                {ip}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-neutral-600 text-[11px] font-mono italic">
                            -
                          </span>
                        )}
                      </td>

                      {/* Actions Column */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopy(item.subdomain)}
                            className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-[#222222] transition-colors"
                            title="Copy subdomain hostname"
                          >
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-white" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <a
                            href={targetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-[#222222] transition-colors inline-flex items-center"
                            title={`Open ${targetUrl}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer / Counter */}
        <div className="bg-[#121212] px-3.5 py-2 border-t border-[#222222] flex items-center justify-between text-[11px] font-mono text-neutral-400">
          <span>
            Showing <strong className="text-white">{filteredItems.length}</strong> of{' '}
            <strong className="text-white">{currentTabItems.length}</strong> subdomains{' '}
            ({tab === 'active' ? 'active' : tab === 'inactive' ? 'inactive' : 'total'})
          </span>
          {searchQuery && (
            <span className="text-neutral-300 font-semibold">Filtered</span>
          )}
        </div>
      </div>
    </div>
  );
}
