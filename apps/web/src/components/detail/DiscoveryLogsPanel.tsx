import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import {
  Terminal,
  X,
  Trash2,
  Copy,
  Check,
  ArrowDown,
  Radio,
  Search,
  Download,
  ChevronRight,
  ChevronDown,
  WrapText,
} from 'lucide-react';
import type { LogLevel, DiscoveryLogEntry } from '@nexusgraph/shared';
import { api } from '../../lib/api';

interface DiscoveryLogsPanelProps {
  onClose: () => void;
}

/** Utility to remove emojis and clean weird box characters from log output */
export function cleanLogMessage(msg: string): string {
  if (!msg) return '';
  return msg
    // Strip emojis and non-standard symbols
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2300}-\u{23FF}\u{2B50}\u{FE0F}]/gu,
      ''
    )
    // Clean box-drawing arrow into standard CLI arrow
    .replace(/──\[(.*?)\]──>/g, '-> [$1]')
    .replace(/──>/g, '->')
    .replace(/\s+/g, ' ')
    .trim();
}

const LEVEL_COLORS: Record<string, { label: string; text: string; bg: string }> = {
  info: { label: 'INFO', text: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  http: { label: 'HTTP', text: 'text-sky-300', bg: 'bg-sky-500/10' },
  collector: { label: 'COLLECTOR', text: 'text-blue-400', bg: 'bg-blue-500/10' },
  transform: { label: 'TRANSFORM', text: 'text-indigo-300', bg: 'bg-indigo-500/10' },
  scan: { label: 'SCAN', text: 'text-purple-400', bg: 'bg-purple-500/10' },
  found: { label: 'FOUND', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  success: { label: 'SUCCESS', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  system: { label: 'SYSTEM', text: 'text-slate-400', bg: 'bg-slate-500/10' },
  debug: { label: 'DEBUG', text: 'text-zinc-500', bg: 'bg-zinc-500/10' },
  warn: { label: 'WARN', text: 'text-amber-400', bg: 'bg-amber-500/10' },
  error: { label: 'ERROR', text: 'text-rose-400', bg: 'bg-rose-500/10' },
};

export function DiscoveryLogsPanel({ onClose }: DiscoveryLogsPanelProps) {
  const {
    liveDiscoveryLogs,
    addLiveLog,
    setLiveLogs,
    clearLiveLogs,
    isDiscovering,
    discoveryProgress,
    setIsLiveStreaming,
    addToast,
  } = useAppStore();

  const logEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [wrapLines, setWrapLines] = useState(true);
  const [copied, setCopied] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

  // Background SSE listener for live server logs
  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const connectStream = async () => {
      try {
        setIsLiveStreaming(true);
        await api.system.streamLogs((incoming: DiscoveryLogEntry | DiscoveryLogEntry[]) => {
          if (!isMounted) return;
          if (Array.isArray(incoming)) {
            setLiveLogs(incoming);
          } else if (incoming && incoming.id) {
            addLiveLog(incoming);
          }
        }, abortController.signal);
      } catch {
        if (isMounted) {
          setIsLiveStreaming(false);
        }
      }
    };

    // Initial historical fetch
    api.system
      .getLogs()
      .then((history) => {
        if (isMounted && Array.isArray(history) && history.length > 0) {
          setLiveLogs(history);
        }
      })
      .catch(() => {
        // Fallback silently
      });

    connectStream();

    return () => {
      isMounted = false;
      abortController.abort();
      setIsLiveStreaming(false);
    };
  }, []);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveDiscoveryLogs.length, autoScroll]);

  const handleCopyLogs = () => {
    const text = liveDiscoveryLogs
      .map((l) => {
        const time = new Date(l.timestamp).toTimeString().split(' ')[0];
        const tag = l.tag ? `[${l.tag}]` : '';
        const level = `[${(l.level || 'INFO').toUpperCase()}]`;
        const cleanMsg = cleanLogMessage(l.message);
        const meta = l.data ? ` ${JSON.stringify(l.data)}` : '';
        return `[${time}] ${level} ${tag} ${cleanMsg}${meta}`;
      })
      .join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    addToast('Copied terminal logs to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    const text = liveDiscoveryLogs
      .map((l) => {
        const time = new Date(l.timestamp).toISOString();
        const tag = l.tag ? `[${l.tag}]` : '';
        const level = `[${(l.level || 'INFO').toUpperCase()}]`;
        const cleanMsg = cleanLogMessage(l.message);
        const meta = l.data ? `\n  DATA: ${JSON.stringify(l.data, null, 2)}` : '';
        return `[${time}] ${level} ${tag} ${cleanMsg}${meta}`;
      })
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `osint-terminal-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast('Downloaded terminal log file', 'success');
  };

  const handleClear = async () => {
    clearLiveLogs();
    try {
      await api.system.clearLogs();
    } catch {
      // Ignore
    }
    addToast('Cleared terminal logs buffer', 'info');
  };

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filteredLogs = liveDiscoveryLogs.filter((l) => {
    // Level filters
    if (filterLevel === 'HTTP') {
      if (l.level !== 'http' && l.tag !== 'HTTP') return false;
    } else if (filterLevel === 'COLLECTOR') {
      if (l.level !== 'collector' && l.tag !== 'COLLECTOR') return false;
    } else if (filterLevel === 'TRANSFORM') {
      if (l.level !== 'transform' && l.tag !== 'TRANSFORM') return false;
    } else if (filterLevel === 'FOUND') {
      if (l.level !== 'found' && l.level !== 'success') return false;
    } else if (filterLevel === 'WARN_ERR') {
      if (l.level !== 'warn' && l.level !== 'error') return false;
    } else if (filterLevel !== 'ALL') {
      if (l.level !== filterLevel.toLowerCase()) return false;
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchMsg = cleanLogMessage(l.message).toLowerCase().includes(q);
      const matchTag = l.tag?.toLowerCase().includes(q);
      const matchTransform = l.transformName?.toLowerCase().includes(q);
      const matchData = l.data ? JSON.stringify(l.data).toLowerCase().includes(q) : false;
      return matchMsg || matchTag || matchTransform || matchData;
    }

    return true;
  });

  const totalTransforms = discoveryProgress?.totalTransforms || 0;
  const completedTransforms = discoveryProgress?.completedTransforms || 0;
  const progressPercent =
    totalTransforms > 0
      ? Math.min(100, Math.round((completedTransforms / totalTransforms) * 100))
      : 0;

  // Aggregate stats
  const httpCount = liveDiscoveryLogs.filter((l) => l.level === 'http' || l.tag === 'HTTP').length;
  const warnErrCount = liveDiscoveryLogs.filter((l) => l.level === 'warn' || l.level === 'error').length;
  const foundCount = discoveryProgress?.foundEntities || liveDiscoveryLogs.filter((l) => l.level === 'found').length;

  return (
    <aside className="w-80 sm:w-[480px] bg-[#0b0f17] border-l border-[#1e293b] flex flex-col h-full shrink-0 z-20 shadow-2xl transition-all select-text font-mono">
      {/* Terminal Top Bar */}
      <div className="p-2.5 border-b border-[#1e293b] flex items-center justify-between bg-[#0f141f]">
        <div className="flex items-center gap-2">
          {/* Terminal Window Controls */}
          <div className="flex items-center gap-1.5 mr-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-200 tracking-wide font-mono">
              TERMINAL LOGS
            </span>
            <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              LIVE
            </span>
            {isDiscovering && (
              <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 animate-pulse">
                <Radio className="w-2.5 h-2.5 animate-spin" />
                ACTIVE
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setWrapLines((prev) => !prev)}
            className={`p-1.5 rounded text-xs transition-colors ${
              wrapLines
                ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a2333]'
            }`}
            title={wrapLines ? 'Word Wrap: ON' : 'Word Wrap: OFF'}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCopyLogs}
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1a2333] transition-colors"
            title="Copy logs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDownloadLogs}
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1a2333] transition-colors"
            title="Download .log file"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleClear}
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1a2333] transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1a2333] transition-colors ml-1"
            title="Close terminal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats Counter & Discovery Progress */}
      <div className="p-2 border-b border-[#1e293b] bg-[#0c1018] space-y-2">
        {/* Discovery Progress Bar if running */}
        {(isDiscovering || totalTransforms > 0) && (
          <div className="space-y-1 p-1.5 rounded bg-[#111724] border border-[#1e293b]">
            <div className="flex items-center justify-between text-[10px] text-slate-300">
              <span>Transforms: {completedTransforms} / {totalTransforms} executed</span>
              <span className="font-bold text-cyan-400">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#070a0f] overflow-hidden border border-[#1e293b]">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Real-time counters */}
        <div className="grid grid-cols-4 gap-1 text-center text-xs">
          <div className="py-1 px-1.5 rounded bg-[#101522] border border-[#1a2333]">
            <div className="font-bold text-slate-200">{liveDiscoveryLogs.length}</div>
            <div className="text-[9px] text-slate-400 uppercase tracking-tight">Logs</div>
          </div>
          <div className="py-1 px-1.5 rounded bg-[#101522] border border-[#1a2333]">
            <div className="font-bold text-sky-400">{httpCount}</div>
            <div className="text-[9px] text-slate-400 uppercase tracking-tight">HTTP</div>
          </div>
          <div className="py-1 px-1.5 rounded bg-[#101522] border border-[#1a2333]">
            <div className="font-bold text-emerald-400">{foundCount}</div>
            <div className="text-[9px] text-slate-400 uppercase tracking-tight">Entities</div>
          </div>
          <div className="py-1 px-1.5 rounded bg-[#101522] border border-[#1a2333]">
            <div className="font-bold text-rose-400">{warnErrCount}</div>
            <div className="text-[9px] text-slate-400 uppercase tracking-tight">Warn/Err</div>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter logs / grep pattern..."
            className="w-full pl-7 pr-6 py-1 text-[11px] bg-[#070a0f] border border-[#1e293b] rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1.5 text-slate-500 hover:text-slate-300 text-xs"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter Level Chips */}
        <div className="flex items-center gap-1 overflow-x-auto text-[10px] pt-0.5 no-scrollbar">
          {['ALL', 'HTTP', 'COLLECTOR', 'TRANSFORM', 'FOUND', 'WARN_ERR'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-2 py-0.5 rounded font-mono transition-colors whitespace-nowrap ${
                filterLevel === lvl
                  ? 'bg-cyan-500/20 text-cyan-200 font-semibold border border-cyan-500/40 shadow-sm'
                  : 'bg-[#0f141f] text-slate-400 hover:text-slate-200 border border-[#1a2333]'
              }`}
            >
              {lvl}
            </button>
          ))}
          <button
            onClick={() => setAutoScroll((prev) => !prev)}
            className={`ml-auto px-1.5 py-0.5 rounded flex items-center gap-1 font-mono transition-colors shrink-0 ${
              autoScroll
                ? 'text-emerald-400 bg-emerald-950/30 border border-emerald-500/30'
                : 'text-slate-400 bg-[#0f141f] border border-[#1a2333]'
            }`}
            title="Toggle auto-scroll lock"
          >
            <ArrowDown className={`w-3 h-3 ${autoScroll ? 'animate-bounce' : ''}`} />
            <span>Scroll</span>
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      <div
        className={`flex-1 overflow-y-auto p-2.5 font-mono text-[11px] bg-[#06080d] select-text ${
          wrapLines ? '' : 'overflow-x-auto whitespace-pre'
        }`}
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-4 space-y-2">
            <Terminal className="w-8 h-8 text-slate-700 opacity-50" />
            <p className="text-xs text-slate-400 font-semibold">No logs match the filter</p>
            <p className="text-[10px] text-slate-500 max-w-[240px]">
              Terminal output from background discovery, collectors, and API requests will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredLogs.map((log) => {
              const levelKey = (log.level || 'info').toLowerCase();
              const levelCfg = LEVEL_COLORS[levelKey] || LEVEL_COLORS.info;
              const time = new Date(log.timestamp).toLocaleTimeString([], {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });
              const cleanMsg = cleanLogMessage(log.message);
              const hasData = log.data && Object.keys(log.data).length > 0;
              const isExpanded = !!expandedLogIds[log.id];
              const tag = log.tag || levelCfg.label;

              return (
                <div
                  key={log.id}
                  className="group py-0.5 px-1 rounded hover:bg-white/[0.04] transition-colors leading-relaxed font-mono"
                >
                  <div className={`flex items-start gap-1.5 ${wrapLines ? 'flex-wrap sm:flex-nowrap' : ''}`}>
                    {/* Timestamp */}
                    <span className="text-slate-500 select-none shrink-0 text-[10px]">
                      {time}
                    </span>

                    {/* Level Tag */}
                    <span className={`font-bold shrink-0 text-[10px] ${levelCfg.text}`}>
                      [{tag}]
                    </span>

                    {/* Transform name if any */}
                    {log.transformName && (
                      <span className="text-slate-400 shrink-0 text-[10px]" title={log.transformName}>
                        [{cleanLogMessage(log.transformName)}]
                      </span>
                    )}

                    {/* Clean Log Message */}
                    <div className={`flex-1 min-w-0 ${wrapLines ? 'break-words' : 'truncate'}`}>
                      <span
                        className={
                          log.level === 'found' || log.level === 'success'
                            ? 'text-emerald-300 font-normal'
                            : log.level === 'http'
                              ? 'text-sky-300'
                              : log.level === 'collector'
                                ? 'text-blue-300'
                                : log.level === 'transform'
                                  ? 'text-indigo-300'
                                  : log.level === 'warn'
                                    ? 'text-amber-300'
                                    : log.level === 'error'
                                      ? 'text-rose-400 font-medium'
                                      : log.level === 'scan'
                                        ? 'text-purple-300'
                                        : 'text-slate-300'
                        }
                      >
                        {cleanMsg}
                      </span>
                    </div>

                    {/* JSON toggle */}
                    {hasData && (
                      <button
                        onClick={() => toggleExpand(log.id)}
                        className="opacity-50 group-hover:opacity-100 text-slate-500 hover:text-cyan-400 flex items-center gap-0.5 text-[9px] shrink-0 transition-opacity ml-1"
                        title="Toggle JSON details"
                      >
                        <span>JSON</span>
                        {isExpanded ? (
                          <ChevronDown className="w-2.5 h-2.5" />
                        ) : (
                          <ChevronRight className="w-2.5 h-2.5" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Expanded JSON meta payload */}
                  {hasData && isExpanded && (
                    <pre className="mt-1 ml-12 p-2 rounded bg-[#020408] border-l-2 border-cyan-500/50 text-[10px] text-cyan-300/90 overflow-x-auto select-all font-mono">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div ref={logEndRef} />
      </div>
    </aside>
  );
}
