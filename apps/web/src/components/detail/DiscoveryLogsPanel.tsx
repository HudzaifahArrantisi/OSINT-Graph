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
      style={{ width: width ? `${width}px` : '420px' }}
      className="h-full bg-[#080808] border-l border-[#1f1f1f] flex flex-col shrink-0 z-20 select-text font-mono relative shadow-2xl"
    >
      {/* Resizing Handle on Left Edge */}
      {onResizeStart && (
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-white/40 transition-colors z-30 group"
          title="Drag to resize console"
        >
          <div className="absolute top-1/2 left-0 -translate-y-1/2 w-1 h-8 rounded-r bg-[#333333] group-hover:bg-white transition-colors" />
        </div>
      )}

      {/* Clean Console Header */}
      <div className="px-3 py-2 border-b border-[#1c1c1c] flex items-center justify-between bg-[#0e0e0e]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 text-neutral-300">
            <Terminal className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-xs font-semibold font-sans text-white">Execution Console</span>
          </div>

          {isDiscovering ? (
            <span className="flex items-center gap-1 text-[9.5px] px-1.5 py-0.2 rounded-full bg-white text-black font-sans font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
              Active
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[9.5px] px-1.5 py-0.2 rounded-full bg-[#1c1c1c] text-neutral-400 border border-[#2b2b2b] font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
              Idle
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleCopyLogs}
            className="p-1 text-neutral-400 hover:text-white hover:bg-[#1a1a1a] rounded transition-colors cursor-pointer"
            title="Copy logs to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDownloadLogs}
            className="p-1 text-neutral-400 hover:text-white hover:bg-[#1a1a1a] rounded transition-colors cursor-pointer"
            title="Export log file (.log)"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleClear}
            className="p-1 text-neutral-400 hover:text-white hover:bg-[#1a1a1a] rounded transition-colors cursor-pointer"
            title="Clear console buffer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white hover:bg-[#1a1a1a] rounded transition-colors ml-0.5 cursor-pointer"
            title="Close console"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {isDiscovering && totalTransforms > 0 && (
        <div className="px-3 py-1.5 bg-[#0a0a0a] border-b border-[#1c1c1c] font-sans text-xs">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-white text-[11px] font-medium">Running Transforms</span>
            <span className="font-mono text-neutral-400 text-[10px]">
              {completedTransforms} / {totalTransforms} ({progressPercent}%)
            </span>
          </div>
          <div className="w-full h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Tabs & Search Controls */}
      <div className="p-2 border-b border-[#1c1c1c] bg-[#0c0c0c] space-y-1.5 font-sans">
        <div className="flex items-center justify-between gap-1">
          {/* Segmented Filter Pills */}
          <div className="flex items-center gap-0.5 bg-[#050505] p-0.5 rounded-md border border-[#1f1f1f]">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-1.5 py-0.5 rounded text-[10.5px] transition-colors cursor-pointer ${
                activeTab === 'ALL'
                  ? 'bg-[#222222] text-white font-medium'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              All <span className="font-mono text-[9.5px] text-neutral-500 ml-0.5">({liveDiscoveryLogs.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('ACTIVITY')}
              className={`px-1.5 py-0.5 rounded text-[10.5px] transition-colors cursor-pointer ${
                activeTab === 'ACTIVITY'
                  ? 'bg-[#222222] text-white font-medium'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Activity <span className="font-mono text-[9.5px] text-neutral-500 ml-0.5">({activityCount})</span>
            </button>
            <button
              onClick={() => setActiveTab('HTTP')}
              className={`px-1.5 py-0.5 rounded text-[10.5px] transition-colors cursor-pointer ${
                activeTab === 'HTTP'
                  ? 'bg-[#222222] text-white font-medium'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              HTTP <span className="font-mono text-[9.5px] text-neutral-500 ml-0.5">({httpCount})</span>
            </button>
            <button
              onClick={() => setActiveTab('ERRORS')}
              className={`px-1.5 py-0.5 rounded text-[10.5px] transition-colors cursor-pointer ${
                activeTab === 'ERRORS'
                  ? 'bg-[#222222] text-white font-medium'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Issues <span className="font-mono text-[9.5px] text-neutral-500 ml-0.5">({warnErrCount})</span>
            </button>
          </div>

          <label className="flex items-center gap-1 text-[10.5px] text-neutral-400 cursor-pointer select-none font-sans">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-[#1a1a1a] border-[#333333] text-white focus:ring-0 w-3 h-3 cursor-pointer"
            />
            <span>Follow</span>
          </label>
        </div>

        {/* Clean Search Input */}
        <div className="relative flex items-center bg-[#050505] border border-[#1f1f1f] rounded px-2 py-1 text-xs">
          <Search className="w-3 h-3 text-neutral-500 mr-1.5 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs, collectors..."
            className="flex-1 bg-transparent text-white placeholder:text-neutral-600 focus:outline-none text-[10.5px]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-neutral-500 hover:text-neutral-300 text-[10px] px-1 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Log Feed - Compact & Pure Monochrome */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px] bg-[#050505] text-neutral-400 select-text space-y-0.5 leading-relaxed">
        {filteredLogs.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center text-neutral-600 space-y-1.5 font-sans">
            <Filter className="w-4 h-4 text-neutral-600" />
            <p className="text-[11px] text-neutral-400 font-medium">No matching log entries</p>
            <p className="text-[10px] text-neutral-600 max-w-[200px]">
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

            let msgStyle = 'text-neutral-400';

            if (isFound) {
              msgStyle = 'text-white font-semibold';
            } else if (isErr) {
              msgStyle = 'text-neutral-200 underline decoration-neutral-500';
            } else if (isWarn) {
              msgStyle = 'text-neutral-300';
            } else if (isHttp) {
              msgStyle = 'text-neutral-500';
            }

            return (
              <div
                key={log.id}
                className="group py-0.5 px-1 rounded hover:bg-[#121212] transition-colors leading-normal font-mono"
              >
                <div className="flex items-start gap-1.5">
                  {/* Message */}
                  <div className="flex-1 min-w-0 break-words text-[10px]">
                    <span className={msgStyle}>{cleanMsg}</span>
                  </div>

                  {/* Payload Toggle */}
                  {hasData && (
                    <button
                      onClick={() => toggleExpand(log.id)}
                      className="opacity-50 group-hover:opacity-100 text-neutral-400 hover:text-white flex items-center gap-0.5 text-[9px] shrink-0 transition-opacity bg-[#181818] hover:bg-[#222222] px-1 py-0.2 rounded border border-[#2b2b2b] font-sans cursor-pointer"
                    >
                      <Code2 className="w-2.5 h-2.5" />
                      <span>{isExpanded ? 'Hide' : 'Data'}</span>
                      {isExpanded ? <ChevronDown className="w-2 h-2" /> : <ChevronRight className="w-2 h-2" />}
                    </button>
                  )}
                </div>

                {/* Expanded Payload */}
                {hasData && isExpanded && (
                  <pre className="mt-1 ml-2 p-1.5 rounded bg-[#0a0a0a] border border-[#222222] text-[9.5px] text-neutral-300 overflow-x-auto select-all font-mono leading-tight">
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
      <div className="px-2.5 py-1 border-t border-[#1c1c1c] bg-[#0c0c0c] text-[10px] text-neutral-500 font-sans flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
          <span className="text-neutral-400">Stream active</span>
        </div>
        <span className="font-mono text-[9.5px] text-neutral-500">
          {filteredLogs.length} / {liveDiscoveryLogs.length}
        </span>
      </div>
    </aside>
  );
}
