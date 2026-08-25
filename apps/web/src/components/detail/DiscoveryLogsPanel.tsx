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
} from 'lucide-react';
import type { DiscoveryLogEntry } from '@nexusgraph/shared';
import { api } from '../../lib/api';

interface DiscoveryLogsPanelProps {
  onClose: () => void;
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
    addToast('Copied logs to clipboard', 'info');
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
    link.download = `investigation-logs-${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast('Downloaded log file', 'success');
  };

  const handleClear = async () => {
    clearLiveLogs();
    try {
      await api.system.clearLogs();
    } catch {}
    addToast('Cleared logs', 'info');
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
      // Show meaningful investigation steps: collector, transform, found, scan, warnings
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
    <aside className="w-80 sm:w-[460px] bg-surface border-l border-border-subtle flex flex-col h-full shrink-0 z-20 select-text font-sans">
      {/* Clean Top Bar */}
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between bg-surface">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-4 h-4 text-text-muted" />
          <h3 className="text-xs font-semibold text-text uppercase tracking-wider">
            Activity Log
          </h3>
          {isDiscovering && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              Running
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyLogs}
            className="p-1.5 text-text-muted hover:text-text hover:bg-surface-2 rounded transition-colors"
            title="Copy logs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDownloadLogs}
            className="p-1.5 text-text-muted hover:text-text hover:bg-surface-2 rounded transition-colors"
            title="Download log file"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleClear}
            className="p-1.5 text-text-muted hover:text-status-danger hover:bg-status-danger/10 rounded transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text hover:bg-surface-2 rounded transition-colors ml-1"
            title="Close log drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar when running */}
      {isDiscovering && totalTransforms > 0 && (
        <div className="px-4 py-2 bg-surface-2 border-b border-border-subtle">
          <div className="flex items-center justify-between text-[11px] text-text-muted mb-1 font-mono">
            <span>Execution progress</span>
            <span>{completedTransforms}/{totalTransforms} ({progressPercent}%)</span>
          </div>
          <div className="w-full h-1 bg-border-subtle rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="p-3 border-b border-border-subtle bg-surface space-y-2">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('ACTIVITY')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                activeTab === 'ACTIVITY'
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-text-muted hover:text-text hover:bg-surface-2'
              }`}
            >
              Activity ({activityCount})
            </button>
            <button
              onClick={() => setActiveTab('HTTP')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                activeTab === 'HTTP'
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-text-muted hover:text-text hover:bg-surface-2'
              }`}
            >
              HTTP ({httpCount})
            </button>
            <button
              onClick={() => setActiveTab('ERRORS')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                activeTab === 'ERRORS'
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : 'text-text-muted hover:text-text hover:bg-surface-2'
              }`}
            >
              Issues ({warnErrCount})
            </button>
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                activeTab === 'ALL'
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-text-muted hover:text-text hover:bg-surface-2'
              }`}
            >
              All ({liveDiscoveryLogs.length})
            </button>
          </div>

          <label className="flex items-center gap-1 text-[10px] text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-surface border-border-subtle text-primary focus:ring-0 w-3 h-3"
            />
            <span>Auto-scroll</span>
          </label>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter log output..."
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-surface-2 border border-border-subtle rounded text-text placeholder:text-text-muted focus:outline-none focus:border-border font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-text-muted hover:text-text text-xs"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Log Feed */}
      <div className="flex-1 overflow-y-auto p-2.5 font-mono text-[10px] bg-app select-text space-y-0.5">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-text-muted p-6 space-y-2 font-sans">
            <Filter className="w-5 h-5 text-text-muted/40" />
            <p className="text-xs font-medium text-text">No activity records match</p>
            <p className="text-[10px] text-text-muted max-w-[200px]">
              Logs from data collectors and discovery transforms will be shown here.
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const time = new Date(log.timestamp).toLocaleTimeString([], {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            const cleanMsg = cleanLogMessage(log.message);
            const hasData = log.data && Object.keys(log.data).length > 0;
            const isExpanded = !!expandedLogIds[log.id];
            const isFound = log.level === 'found' || log.level === 'success';
            const isWarn = log.level === 'warn';
            const isErr = log.level === 'error';
            const isHttp = log.level === 'http';

            return (
              <div
                key={log.id}
                className="group py-0.5 px-1.5 rounded hover:bg-surface/60 transition-colors leading-normal"
              >
                <div className="flex items-start gap-1.5">
                  <span className="text-text-muted/50 text-[9.5px] shrink-0 select-none">{time}</span>

                  <span
                    className={`text-[8.5px] px-1 py-0.2 rounded font-semibold uppercase shrink-0 ${
                      isFound
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : isErr
                          ? 'bg-rose-500/10 text-rose-400'
                          : isWarn
                            ? 'bg-amber-500/10 text-amber-400'
                            : isHttp
                              ? 'bg-sky-500/10 text-sky-400'
                              : 'bg-surface-2 text-text-muted'
                    }`}
                  >
                    {log.tag || log.level || 'LOG'}
                  </span>

                  <div className="flex-1 min-w-0 break-words text-[10px]">
                    <span
                      className={
                        isFound
                          ? 'text-emerald-300'
                          : isErr
                            ? 'text-rose-400'
                            : isWarn
                              ? 'text-amber-300'
                              : isHttp
                                ? 'text-sky-300/90'
                                : 'text-text-secondary'
                      }
                    >
                      {cleanMsg}
                    </span>
                  </div>

                  {hasData && (
                    <button
                      onClick={() => toggleExpand(log.id)}
                      className="opacity-40 group-hover:opacity-100 text-text-muted hover:text-text flex items-center gap-0.5 text-[8.5px] shrink-0 transition-opacity ml-1"
                    >
                      <span>JSON</span>
                      {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                    </button>
                  )}
                </div>

                {hasData && isExpanded && (
                  <pre className="mt-1 ml-8 p-2 rounded bg-surface border border-border-subtle text-[9.5px] text-text-muted overflow-x-auto select-all">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            );
          })
        )}
        <div ref={logEndRef} />
      </div>
    </aside>
  );
}

