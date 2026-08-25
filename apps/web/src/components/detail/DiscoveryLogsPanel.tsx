import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import {
  Terminal,
  X,
  Trash2,
  Copy,
  Check,
  Search,
  Download,
  ChevronRight,
  ChevronDown,
  Filter,
  Sparkles,
} from 'lucide-react';
import type { DiscoveryLogEntry } from '@nexusgraph/shared';
import { api } from '../../lib/api';

interface DiscoveryLogsPanelProps {
  onClose: () => void;
  width?: number;
  onResizeStart?: (e: React.MouseEvent) => void;
}

/** Utility to clean log messages */
export function cleanLogMessage(msg: string): string {
  if (!msg) return '';
  return msg
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2300}-\u{23FF}\u{2B50}\u{FE0F}]/gu,
      ''
    )
    .replace(/──\[(.*?)\]──>/g, '-> [$1]')
    .replace(/──>/g, '->')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Formatter for PowerShell-style terminal line export */
export function formatPowerShellLogLine(l: DiscoveryLogEntry): string {
  const cleanMsg = cleanLogMessage(l.message);
  let prefix = '[i] INFO';
  if (l.level === 'found' || l.level === 'success') prefix = '[+] FOUND';
  else if (l.level === 'error') prefix = '[-] ERROR';
  else if (l.level === 'warn') prefix = '[!] WARN';
  else if (l.level === 'http' || l.tag === 'HTTP') prefix = '[>] HTTP';
  else if (l.level === 'transform' || l.tag === 'SCAN') prefix = '[*] EXEC';
  else if (l.level === 'collector') prefix = '[#] COLLECT';
  else if (l.tag) prefix = `[${l.tag.toUpperCase()}]`;

  return `${prefix.padEnd(11)} ${cleanMsg}`;
}

export function DiscoveryLogsPanel({ onClose, width, onResizeStart }: DiscoveryLogsPanelProps) {
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
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'ACTIVITY' | 'HTTP' | 'ALL' | 'ERRORS'>('ACTIVITY');
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

    api.system
      .getLogs()
      .then((history) => {
        if (isMounted && Array.isArray(history) && history.length > 0) {
          setLiveLogs(history);
        }
      })
      .catch(() => {});

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
    const banner = [
      '# Windows PowerShell [NexusGraph OSINT Engine]',
      '# Output Stream Log',
      '# ---------------------------------------------',
    ];
    const lines = liveDiscoveryLogs.map((l) => {
      const line = formatPowerShellLogLine(l);
      const meta = l.data && Object.keys(l.data).length > 0 ? `\n    DATA: ${JSON.stringify(l.data)}` : '';
      return `${line}${meta}`;
    });
    const text = [...banner, ...lines].join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    addToast('Copied PowerShell logs to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    const banner = [
      '# Windows PowerShell [NexusGraph OSINT Engine]',
      '# Investigation Discovery Transcript',
      '# ---------------------------------------------',
    ];
    const lines = liveDiscoveryLogs.map((l) => {
      const line = formatPowerShellLogLine(l);
      const meta = l.data && Object.keys(l.data).length > 0 ? `\n    DATA: ${JSON.stringify(l.data, null, 2)}` : '';
      return `${line}${meta}`;
    });
    const text = [...banner, ...lines].join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexusgraph-transcript-${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast('Downloaded log transcript', 'success');
  };

  const handleClear = async () => {
    clearLiveLogs();
    try {
      await api.system.clearLogs();
    } catch {}
    addToast('Cleared console buffer', 'info');
  };

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filteredLogs = liveDiscoveryLogs.filter((l) => {
    // Tab filter
    if (activeTab === 'ACTIVITY') {
      if (l.level === 'http' || l.tag === 'HTTP') return false;
    } else if (activeTab === 'HTTP') {
      if (l.level !== 'http' && l.tag !== 'HTTP') return false;
    } else if (activeTab === 'ERRORS') {
      if (l.level !== 'warn' && l.level !== 'error') return false;
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchMsg = cleanLogMessage(l.message).toLowerCase().includes(q);
      const matchTag = l.tag?.toLowerCase().includes(q);
      const matchData = l.data ? JSON.stringify(l.data).toLowerCase().includes(q) : false;
      return matchMsg || matchTag || matchData;
    }

    return true;
  });

  const totalTransforms = discoveryProgress?.totalTransforms || 0;
  const completedTransforms = discoveryProgress?.completedTransforms || 0;
  const progressPercent =
    totalTransforms > 0
      ? Math.min(100, Math.round((completedTransforms / totalTransforms) * 100))
      : 0;

  const warnErrCount = liveDiscoveryLogs.filter((l) => l.level === 'warn' || l.level === 'error').length;
  const activityCount = liveDiscoveryLogs.filter((l) => l.level !== 'http' && l.tag !== 'HTTP').length;
  const httpCount = liveDiscoveryLogs.filter((l) => l.level === 'http' || l.tag === 'HTTP').length;

  return (
    <aside
      style={{ width: width ? `${width}px` : undefined }}
      className="w-80 sm:w-[480px] bg-[#0b0f17] border-l border-border-subtle flex flex-col h-full shrink-0 z-20 select-text font-mono relative shadow-2xl"
    >
      {/* Resizing Handle on Left Edge */}
      {onResizeStart && (
        <div
          onMouseDown={onResizeStart}
          className="absolute left-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-primary/60 transition-colors z-30 group"
          title="Drag to resize terminal window"
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r bg-border group-hover:bg-primary transition-colors" />
        </div>
      )}

      {/* PowerShell Window Header */}
      <div className="px-3.5 py-2.5 border-b border-[#1e293b] flex items-center justify-between bg-[#0e1420]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <div className="flex items-center gap-1.5 ml-2 min-w-0">
            <Terminal className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold font-mono text-slate-200 truncate">
              PowerShell <span className="text-text-muted text-[10px]">&gt;_ NexusGraph</span>
            </span>
          </div>
          {isDiscovering ? (
            <span className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              RUNNING
            </span>
          ) : (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#162032] text-slate-400 border border-[#233149]">
              IDLE
            </span>
          )}
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyLogs}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#182338] rounded transition-colors"
            title="Copy logs transcript (PowerShell format)"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDownloadLogs}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#182338] rounded transition-colors"
            title="Export log transcript (.log)"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleClear}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
            title="Clear console buffer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#182338] rounded transition-colors ml-1"
            title="Close terminal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Execution Progress Bar (PowerShell style) */}
      {isDiscovering && totalTransforms > 0 && (
        <div className="px-3.5 py-2 bg-[#090d14] border-b border-[#1b263b] font-mono text-[10.5px]">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-cyan-400 font-semibold">&gt; Processing Transforms:</span>
            <span className="text-slate-300">
              {completedTransforms}/{totalTransforms} [{progressPercent}%]
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#162032] rounded overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-primary transition-all duration-300 rounded"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Terminal Stream Tabs & Search Filter */}
      <div className="p-2.5 border-b border-[#1b263b] bg-[#0c111a] space-y-2">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 font-mono">
            <button
              onClick={() => setActiveTab('ACTIVITY')}
              className={`px-2 py-0.5 rounded text-[10.5px] transition-colors ${
                activeTab === 'ACTIVITY'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#162032]'
              }`}
            >
              Activity ({activityCount})
            </button>
            <button
              onClick={() => setActiveTab('HTTP')}
              className={`px-2 py-0.5 rounded text-[10.5px] transition-colors ${
                activeTab === 'HTTP'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#162032]'
              }`}
            >
              HTTP ({httpCount})
            </button>
            <button
              onClick={() => setActiveTab('ERRORS')}
              className={`px-2 py-0.5 rounded text-[10.5px] transition-colors ${
                activeTab === 'ERRORS'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#162032]'
              }`}
            >
              Issues ({warnErrCount})
            </button>
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-2 py-0.5 rounded text-[10.5px] transition-colors ${
                activeTab === 'ALL'
                  ? 'bg-primary/20 text-primary border border-primary/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#162032]'
              }`}
            >
              All ({liveDiscoveryLogs.length})
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer select-none font-mono">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-[#162032] border-[#2a3b55] text-cyan-500 focus:ring-0 w-3 h-3"
            />
            <span>Follow</span>
          </label>
        </div>

        {/* PowerShell-style Prompt Search Input */}
        <div className="relative flex items-center bg-[#070a10] border border-[#1b263b] rounded px-2 py-1 font-mono text-[11px]">
          <span className="text-cyan-400 shrink-0 select-none mr-1.5 font-semibold">PS Search:\&gt;</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="filter output text or tags..."
            className="flex-1 bg-transparent text-slate-200 placeholder:text-slate-600 focus:outline-none text-[11px]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-slate-500 hover:text-slate-200 text-xs px-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Pure Terminal Log Feed */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] bg-[#070a10] text-slate-300 select-text space-y-1">
        {/* Terminal Header Banner */}
        <div className="text-[10px] text-slate-500 pb-2 mb-2 border-b border-[#162032] select-none leading-relaxed">
          <div>Windows PowerShell [NexusGraph OSINT Engine v2.4]</div>
          <div>Dossier stream active. Zero fake data mode enabled.</div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-center text-slate-500 space-y-2 font-mono">
            <Filter className="w-5 h-5 text-slate-600" />
            <p className="text-xs text-slate-400">No matching terminal output records.</p>
            <p className="text-[10px] text-slate-600 max-w-[240px]">
              Active discovery collectors and graph transform operations will output directly to this console.
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const cleanMsg = cleanLogMessage(log.message);
            const hasData = log.data && Object.keys(log.data).length > 0;
            const isExpanded = !!expandedLogIds[log.id];

            const isFound = log.level === 'found' || log.level === 'success';
            const isWarn = log.level === 'warn';
            const isErr = log.level === 'error';
            const isHttp = log.level === 'http' || log.tag === 'HTTP';
            const isExec = log.level === 'transform' || log.tag === 'SCAN';
            const isCollect = log.level === 'collector';

            // Prefix formatting purely like PowerShell
            let prefixTag = '[i] INFO';
            let prefixColor = 'text-slate-400';
            let msgColor = 'text-slate-200';

            if (isFound) {
              prefixTag = '[+] FOUND';
              prefixColor = 'text-emerald-400 font-bold';
              msgColor = 'text-emerald-300 font-semibold';
            } else if (isErr) {
              prefixTag = '[-] ERROR';
              prefixColor = 'text-rose-400 font-bold';
              msgColor = 'text-rose-300';
            } else if (isWarn) {
              prefixTag = '[!] WARN';
              prefixColor = 'text-amber-400 font-bold';
              msgColor = 'text-amber-200';
            } else if (isHttp) {
              prefixTag = '[>] HTTP';
              prefixColor = 'text-sky-400 font-semibold';
              msgColor = 'text-sky-200/90';
            } else if (isExec) {
              prefixTag = '[*] EXEC';
              prefixColor = 'text-amber-300 font-semibold';
              msgColor = 'text-slate-200';
            } else if (isCollect) {
              prefixTag = '[#] COLLECT';
              prefixColor = 'text-cyan-400 font-semibold';
              msgColor = 'text-slate-200';
            } else if (log.tag) {
              prefixTag = `[${log.tag.toUpperCase()}]`;
              prefixColor = 'text-cyan-300 font-semibold';
            }

            return (
              <div
                key={log.id}
                className="group py-0.5 px-1 rounded hover:bg-[#111827]/80 transition-colors leading-relaxed font-mono"
              >
                <div className="flex items-start gap-2">
                  {/* PowerShell Stream Tag */}
                  <span className={`shrink-0 select-none text-[10.5px] ${prefixColor}`}>
                    {prefixTag}
                  </span>

                  {/* Clean message text */}
                  <div className="flex-1 min-w-0 break-words text-[11px]">
                    <span className={msgColor}>{cleanMsg}</span>
                  </div>

                  {/* Inline JSON payload toggle */}
                  {hasData && (
                    <button
                      onClick={() => toggleExpand(log.id)}
                      className="opacity-50 group-hover:opacity-100 text-cyan-400 hover:text-cyan-200 flex items-center gap-0.5 text-[9.5px] shrink-0 transition-opacity ml-1 bg-[#162032] px-1.5 py-0.2 rounded border border-[#233149]"
                    >
                      <span>{isExpanded ? '[-] DATA' : '[+] DATA'}</span>
                      {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                    </button>
                  )}
                </div>

                {/* Expanded JSON payload block */}
                {hasData && isExpanded && (
                  <pre className="mt-1 ml-4 p-2 rounded bg-[#0b1019] border border-[#1b263b] text-[10px] text-cyan-300/90 overflow-x-auto select-all font-mono leading-tight">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            );
          })
        )}

        {/* PowerShell Cursor Prompt at end */}
        <div className="pt-2 flex items-center gap-1 text-[11px] text-slate-500 font-mono select-none">
          <span className="text-cyan-400 font-semibold">PS C:\NexusGraph\&gt;</span>
          {isDiscovering ? (
            <span className="text-emerald-400 flex items-center gap-1">
              running transforms... <span className="inline-block w-2 h-3.5 bg-emerald-400 animate-pulse" />
            </span>
          ) : (
            <span className="text-slate-600 animate-pulse">_</span>
          )}
        </div>

        <div ref={logEndRef} />
      </div>
    </aside>
  );
}
