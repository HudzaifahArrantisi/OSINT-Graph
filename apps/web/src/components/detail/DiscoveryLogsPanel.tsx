import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import {
  Terminal,
  X,
  Trash2,
  Copy,
  Check,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowDown,
  Pause,
  Shield,
  Layers,
  Radio,
  Network,
  Search,
} from 'lucide-react';
import type { LogLevel } from '@nexusgraph/shared';

interface DiscoveryLogsPanelProps {
  onClose: () => void;
}

const LOG_BADGES: Record<LogLevel, { label: string; bg: string; text: string; border: string }> = {
  info: { label: 'INFO', bg: 'bg-cyan-950/40', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  scan: { label: 'SCAN', bg: 'bg-purple-950/40', text: 'text-purple-400', border: 'border-purple-500/30' },
  found: { label: 'FOUND', bg: 'bg-emerald-950/40', text: 'text-emerald-400', border: 'border-emerald-500/40' },
  success: { label: 'OK', bg: 'bg-emerald-950/50', text: 'text-emerald-300', border: 'border-emerald-500/50' },
  warn: { label: 'WARN', bg: 'bg-amber-950/40', text: 'text-amber-400', border: 'border-amber-500/30' },
  error: { label: 'ERR', bg: 'bg-rose-950/40', text: 'text-rose-400', border: 'border-rose-500/30' },
};

export function DiscoveryLogsPanel({ onClose }: DiscoveryLogsPanelProps) {
  const {
    liveDiscoveryLogs,
    clearLiveLogs,
    isDiscovering,
    discoveryProgress,
    addToast,
  } = useAppStore();

  const logEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveDiscoveryLogs, autoScroll]);

  const handleCopyLogs = () => {
    const text = liveDiscoveryLogs
      .map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    addToast('Copied execution logs to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = liveDiscoveryLogs.filter((l) => {
    if (filterLevel === 'ALL') return true;
    if (filterLevel === 'FOUND') return l.level === 'found';
    if (filterLevel === 'WARN_ERR') return l.level === 'warn' || l.level === 'error';
    return l.level === filterLevel.toLowerCase();
  });

  const totalTransforms = discoveryProgress?.totalTransforms || 0;
  const completedTransforms = discoveryProgress?.completedTransforms || 0;
  const progressPercent = totalTransforms > 0
    ? Math.min(100, Math.round((completedTransforms / totalTransforms) * 100))
    : 0;

  return (
    <aside className="w-80 sm:w-96 bg-surface border-l border-border-subtle flex flex-col h-full shrink-0 z-20 shadow-2xl transition-all">
      {/* Header */}
      <div className="p-3 border-b border-border-subtle flex items-center justify-between bg-surface-2/70">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-primary/10 text-primary border border-primary/20">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text uppercase tracking-wider">
                Discovery Console
              </span>
              {isDiscovering && (
                <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                  <Radio className="w-2.5 h-2.5 animate-spin" />
                  LIVE
                </span>
              )}
            </div>
            <span className="text-[10px] text-text-muted">
              {liveDiscoveryLogs.length} events logged
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyLogs}
            className="p-1.5 rounded-button text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            title="Copy logs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={clearLiveLogs}
            className="p-1.5 rounded-button text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            title="Clear console"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-button text-text-muted hover:text-text hover:bg-surface-2 transition-colors ml-1"
            title="Close console"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress & Stat Counters Bar */}
      <div className="p-2.5 border-b border-border-subtle bg-surface-2/30 space-y-2">
        {/* Progress Bar */}
        {isDiscovering || totalTransforms > 0 ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
              <span>Progress: {completedTransforms} / {totalTransforms} transforms</span>
              <span className="font-bold text-text">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-surface-3 overflow-hidden border border-border-subtle/40">
              <div
                className="h-full bg-gradient-to-r from-primary via-indigo-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Real-time counters */}
        <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
          <div className="p-1.5 rounded bg-surface border border-border-subtle">
            <div className="font-mono font-bold text-emerald-400">
              {discoveryProgress?.foundEntities || 0}
            </div>
            <div className="text-[9px] text-text-muted uppercase">Entities</div>
          </div>
          <div className="p-1.5 rounded bg-surface border border-border-subtle">
            <div className="font-mono font-bold text-cyan-400">
              {discoveryProgress?.foundRelationships || 0}
            </div>
            <div className="text-[9px] text-text-muted uppercase">Relations</div>
          </div>
          <div className="p-1.5 rounded bg-surface border border-border-subtle">
            <div className="font-mono font-bold text-purple-400">
              {discoveryProgress?.foundEvidence || 0}
            </div>
            <div className="text-[9px] text-text-muted uppercase">Evidence</div>
          </div>
        </div>

        {/* Filter level chips */}
        <div className="flex items-center gap-1 pt-1 overflow-x-auto text-[10px]">
          {['ALL', 'FOUND', 'SCAN', 'WARN_ERR'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-2 py-0.5 rounded font-mono transition-colors ${
                filterLevel === lvl
                  ? 'bg-primary text-white font-semibold'
                  : 'bg-surface text-text-muted hover:text-text border border-border-subtle'
              }`}
            >
              {lvl}
            </button>
          ))}
          <button
            onClick={() => setAutoScroll((prev) => !prev)}
            className={`ml-auto px-1.5 py-0.5 rounded flex items-center gap-1 font-mono transition-colors ${
              autoScroll
                ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-500/30'
                : 'text-text-muted bg-surface border border-border-subtle'
            }`}
            title="Toggle auto-scroll"
          >
            <ArrowDown className={`w-3 h-3 ${autoScroll ? 'animate-bounce' : ''}`} />
            <span>Auto</span>
          </button>
        </div>
      </div>

      {/* Terminal Stream Logs Area */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] bg-[#07090e] space-y-1.5 select-text">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-text-muted p-4 space-y-2">
            <Terminal className="w-8 h-8 text-border opacity-40" />
            <p className="text-xs">No execution logs yet.</p>
            <p className="text-[10px] text-text-muted max-w-[200px]">
              Logs will stream here in real time as transforms execute.
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const badge = LOG_BADGES[log.level] || LOG_BADGES.info;
            const time = new Date(log.timestamp).toLocaleTimeString();

            return (
              <div
                key={log.id}
                className={`p-1.5 rounded border transition-colors ${
                  log.level === 'found'
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                    : log.level === 'success'
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                      : log.level === 'warn'
                        ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                        : log.level === 'error'
                          ? 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                          : log.level === 'scan'
                            ? 'bg-purple-950/10 border-purple-500/20 text-purple-200'
                            : 'bg-surface/40 border-border-subtle/50 text-text-secondary'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] mb-0.5">
                  <span className="text-text-muted">{time}</span>
                  <span
                    className={`px-1 py-0.2 rounded text-[9px] font-bold border uppercase tracking-wider ${badge.bg} ${badge.text} ${badge.border}`}
                  >
                    {badge.label}
                  </span>
                  {log.transformName && (
                    <span className="text-text-muted truncate max-w-[140px]" title={log.transformName}>
                      [{log.transformName}]
                    </span>
                  )}
                </div>
                <div className="break-words leading-relaxed pl-1">
                  {log.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={logEndRef} />
      </div>
    </aside>
  );
}
