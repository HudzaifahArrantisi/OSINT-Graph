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
  Activity,
  Code2,
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

/** Formatter for standard console log line export */
export function formatLogLine(l: DiscoveryLogEntry): string {
  const cleanMsg = cleanLogMessage(l.message);
  const ts = l.timestamp ? new Date(l.timestamp).toISOString() : new Date().toISOString();
  const level = (l.level || 'info').toUpperCase().padEnd(7);
  return `[${ts}] ${level} ${cleanMsg}`;
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
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVITY' | 'HTTP' | 'ERRORS'>('ALL');
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
    const lines = liveDiscoveryLogs.map((l) => {
      const line = formatLogLine(l);
      const meta = l.data && Object.keys(l.data).length > 0 ? `\n  DATA: ${JSON.stringify(l.data)}` : '';
      return `${line}${meta}`;
    });
    const text = lines.join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    addToast('Copied logs to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    const header = `# NexusGraph Investigation Discovery Logs\n# Exported: ${new Date().toISOString()}\n# Total Events: ${liveDiscoveryLogs.length}\n# --------------------------------------------------\n`;
    const lines = liveDiscoveryLogs.map((l) => {
      const line = formatLogLine(l);
      const meta = l.data && Object.keys(l.data).length > 0 ? `\n  DATA: ${JSON.stringify(l.data, null, 2)}` : '';
      return `${line}${meta}`;
    });
    const text = header + lines.join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexusgraph-logs-${new Date().toISOString().slice(0, 10)}.log`;
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
    addToast('Console buffer cleared', 'info');
  };

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filteredLogs = liveDiscoveryLogs.filter((l) => {
    if (activeTab === 'ACTIVITY') {
      if (l.level === 'http' || l.tag === 'HTTP') return false;
    } else if (activeTab === 'HTTP') {
      if (l.level !== 'http' && l.tag !== 'HTTP') return false;
    } else if (activeTab === 'ERRORS') {
      if (l.level !== 'warn' && l.level !== 'error') return false;
    }

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
      className="w-80 sm:w-[480px] bg-[#0c1017] border-l border-[#1e293b] flex flex-col h-full shrink-0 z-20 select-text font-mono relative shadow-xl"
    >
      {/* Resizing Handle on Left Edge */}
      {onResizeStart && (
        <div
          onMouseDown={onResizeStart}
          className="absolute left-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-primary/50 transition-colors z-30 group"
          title="Drag to resize console"
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r bg-slate-700 group-hover:bg-primary transition-colors" />
        </div>
      )}

      {/* Clean Console Header */}
      <div className="px-3.5 py-2.5 border-b border-[#1e293b] flex items-center justify-between bg-[#101622]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Terminal className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-semibold font-sans text-slate-200">Execution Console</span>
          </div>

          {isDiscovering ? (
            <span className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Active
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/60 font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              Idle
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleCopyLogs}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            title="Copy logs to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDownloadLogs}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            title="Export log file (.log)"
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
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors ml-1"
            title="Close console"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {isDiscovering && totalTransforms > 0 && (
        <div className="px-3.5 py-2 bg-[#090d14] border-b border-[#1b263b] font-sans text-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-slate-300 font-medium">Running Transforms</span>
            <span className="font-mono text-slate-400 text-[11px]">
              {completedTransforms} / {totalTransforms} ({progressPercent}%)
            </span>
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Tabs & Search Controls */}
      <div className="p-2.5 border-b border-[#1e293b] bg-[#0e131d] space-y-2 font-sans">
        <div className="flex items-center justify-between gap-1">
          {/* Segmented Filter Pills */}
          <div className="flex items-center gap-1 bg-[#080c14] p-0.5 rounded-lg border border-[#1e293b]">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                activeTab === 'ALL'
                  ? 'bg-slate-800 text-slate-100 font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All <span className="font-mono text-[10px] text-slate-500 ml-0.5">({liveDiscoveryLogs.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('ACTIVITY')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                activeTab === 'ACTIVITY'
                  ? 'bg-slate-800 text-slate-100 font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Activity <span className="font-mono text-[10px] text-slate-500 ml-0.5">({activityCount})</span>
            </button>
            <button
              onClick={() => setActiveTab('HTTP')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                activeTab === 'HTTP'
                  ? 'bg-slate-800 text-slate-100 font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              HTTP <span className="font-mono text-[10px] text-slate-500 ml-0.5">({httpCount})</span>
            </button>
            <button
              onClick={() => setActiveTab('ERRORS')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                activeTab === 'ERRORS'
                  ? 'bg-rose-950/40 text-rose-300 border border-rose-800/40 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Issues <span className="font-mono text-[10px] text-slate-500 ml-0.5">({warnErrCount})</span>
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none font-sans">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-primary focus:ring-0 w-3.5 h-3.5"
            />
            <span>Follow</span>
          </label>
        </div>

        {/* Clean Search Input */}
        <div className="relative flex items-center bg-[#080c14] border border-[#1e293b] rounded-md px-2.5 py-1.5 text-xs">
          <Search className="w-3.5 h-3.5 text-slate-500 mr-2 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search output, collectors, or tags..."
            className="flex-1 bg-transparent text-slate-200 placeholder:text-slate-600 focus:outline-none text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-slate-500 hover:text-slate-300 text-xs px-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Log Feed */}
      <div className="flex-1 overflow-y-auto p-2.5 font-mono text-[11.5px] bg-[#080c14] text-slate-300 select-text space-y-0.5">
        {filteredLogs.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500 space-y-2 font-sans">
            <Filter className="w-5 h-5 text-slate-600" />
            <p className="text-xs text-slate-400 font-medium">No matching log entries</p>
            <p className="text-[11px] text-slate-600 max-w-[220px]">
              Logs from collectors and transform jobs will appear here in real-time.
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

            let badgeLabel = 'INFO';
            let badgeStyle = 'text-slate-400 bg-slate-800/80 border-slate-700/60';
            let msgStyle = 'text-slate-300';

            if (isFound) {
              badgeLabel = 'SUCCESS';
              badgeStyle = 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40';
              msgStyle = 'text-emerald-200';
            } else if (isErr) {
              badgeLabel = 'ERROR';
              badgeStyle = 'text-rose-400 bg-rose-950/50 border-rose-800/40';
              msgStyle = 'text-rose-200';
            } else if (isWarn) {
              badgeLabel = 'WARN';
              badgeStyle = 'text-amber-300 bg-amber-950/40 border-amber-800/40';
              msgStyle = 'text-amber-200';
            } else if (isHttp) {
              badgeLabel = 'HTTP';
              badgeStyle = 'text-sky-400 bg-sky-950/40 border-sky-800/40';
              msgStyle = 'text-slate-300';
            } else if (isExec) {
              badgeLabel = 'EXEC';
              badgeStyle = 'text-indigo-300 bg-indigo-950/40 border-indigo-800/40';
              msgStyle = 'text-slate-200';
            } else if (log.tag) {
              badgeLabel = log.tag.toUpperCase();
              badgeStyle = 'text-slate-400 bg-slate-800/60 border-slate-700/60';
            }

            const timeStr = log.timestamp
              ? new Date(log.timestamp).toTimeString().split(' ')[0]
              : '';

            return (
              <div
                key={log.id}
                className="group py-1 px-1.5 rounded hover:bg-[#111724] transition-colors leading-relaxed font-mono"
              >
                <div className="flex items-start gap-2">
                  {/* Timestamp */}
                  {timeStr && (
                    <span className="text-[10px] text-slate-500 select-none shrink-0 pt-0.5">
                      {timeStr}
                    </span>
                  )}

                  {/* Level Badge */}
                  <span
                    className={`text-[9px] px-1 py-0.2 rounded border font-sans font-semibold shrink-0 select-none ${badgeStyle}`}
                  >
                    {badgeLabel}
                  </span>

                  {/* Message */}
                  <div className="flex-1 min-w-0 break-words text-[11.5px]">
                    <span className={msgStyle}>{cleanMsg}</span>
                  </div>

                  {/* Payload Toggle */}
                  {hasData && (
                    <button
                      onClick={() => toggleExpand(log.id)}
                      className="opacity-60 group-hover:opacity-100 text-slate-400 hover:text-slate-200 flex items-center gap-1 text-[10px] shrink-0 transition-opacity bg-slate-800/70 hover:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/50 font-sans"
                    >
                      <Code2 className="w-3 h-3" />
                      <span>{isExpanded ? 'Hide' : 'Payload'}</span>
                      {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                    </button>
                  )}
                </div>

                {/* Expanded Payload */}
                {hasData && isExpanded && (
                  <pre className="mt-1.5 ml-4 p-2 rounded bg-[#0d131f] border border-[#1e293b] text-[10.5px] text-slate-300 overflow-x-auto select-all font-mono leading-tight">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            );
          })
        )}

        <div ref={logEndRef} />
      </div>

      {/* Stream Footer */}
      <div className="px-3 py-1.5 border-t border-[#1e293b] bg-[#0e131d] text-[11px] text-slate-500 font-sans flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Stream connected</span>
        </div>
        <span className="font-mono text-[10.5px] text-slate-500">
          {filteredLogs.length} / {liveDiscoveryLogs.length} events
        </span>
      </div>
    </aside>
  );
}
