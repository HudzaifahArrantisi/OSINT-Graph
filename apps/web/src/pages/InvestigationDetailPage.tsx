import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Navbar } from '../components/layout/Navbar';
import { GraphView } from '../components/graph/GraphView';
import { EntityDetailPanel } from '../components/detail/EntityDetailPanel';
import { DiscoveryLogsPanel } from '../components/detail/DiscoveryLogsPanel';
import { StartDiscoveryModal } from '../components/modals/StartDiscoveryModal';
import { ExportModal } from '../components/modals/ExportModal';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { useAppStore } from '../stores/appStore';
import {
  Play,
  Download,
  Network,
  Clock,
  FileText,
  Shield,
  Layers,
  Archive,
  RefreshCw,
  Plus,
  Compass,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Send,
  Trash2,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { Investigation, GraphPayload, CollectorRun, Note, DiscoveryJob } from '@nexusgraph/shared';

export function InvestigationDetailPage() {
  const { id: caseId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    selectedNodeId,
    selectedEdgeId,
    setSelectedNodeId,
    setSelectedEdgeId,
    sidebarOpen,
    setSidebarOpen,
    addToast,
    liveLogsOpen,
    setLiveLogsOpen,
    isDiscovering,
    liveDiscoveryLogs,
  } = useAppStore();

  const [activeWorkspaceView, setActiveWorkspaceView] = useState<'graph' | 'timeline' | 'evidence' | 'notes'>('graph');
  const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Fetch Investigation metadata
  const {
    data: investigation,
    isLoading: isInvLoading,
    error: invError,
  } = useQuery<Investigation>({
    queryKey: ['investigation', caseId],
    queryFn: () => api.investigations.get(caseId!),
    enabled: !!caseId,
  });

  // Fetch Graph payload
  const {
    data: graphData,
    isLoading: isGraphLoading,
    refetch: refetchGraph,
  } = useQuery<GraphPayload>({
    queryKey: ['graph', caseId],
    queryFn: () => api.graph.get(caseId!),
    enabled: !!caseId,
  });

  // Fetch Discovery Jobs
  const { data: discoveryJobs = [] } = useQuery<DiscoveryJob[]>({
    queryKey: ['discoveries', caseId],
    queryFn: () => api.discoveries.list(caseId!),
    enabled: !!caseId,
  });

  // Fetch Collector Runs (legacy)
  const { data: collectorRuns = [] } = useQuery<CollectorRun[]>({
    queryKey: ['collector-runs', caseId],
    queryFn: () => api.collectors.runs(caseId!),
    enabled: !!caseId,
  });

  // Fetch Notes
  const { data: notes = [], refetch: refetchNotes } = useQuery<Note[]>({
    queryKey: ['notes', caseId],
    queryFn: () => api.notes.list(caseId!),
    enabled: !!caseId,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['graph', caseId] });
    queryClient.invalidateQueries({ queryKey: ['entities', caseId] });
    queryClient.invalidateQueries({ queryKey: ['relationships', caseId] });
    queryClient.invalidateQueries({ queryKey: ['evidence', caseId] });
    queryClient.invalidateQueries({ queryKey: ['timeline', caseId] });
    queryClient.invalidateQueries({ queryKey: ['discoveries', caseId] });
    queryClient.invalidateQueries({ queryKey: ['collector-runs', caseId] });
    addToast('Refreshed case data', 'info');
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim() || !caseId) return;

    setSubmittingNote(true);
    try {
      await api.notes.create(caseId, { content: newNoteContent.trim() });
      setNewNoteContent('');
      refetchNotes();
      addToast('Analyst note saved', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to save note', 'error');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!caseId) return;
    try {
      await api.notes.delete(caseId, noteId);
      refetchNotes();
      addToast('Note deleted', 'info');
    } catch (err: any) {
      addToast(err.message || 'Failed to delete note', 'error');
    }
  };

  if (isInvLoading) {
    return (
      <div className="min-h-screen bg-app flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <LoadingState message="Loading investigation workspace..." />
        </div>
      </div>
    );
  }

  if (invError || !investigation) {
    return (
      <div className="min-h-screen bg-app flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            icon={<Shield className="w-8 h-8 text-status-danger" />}
            title="Investigation Not Found"
            description="The requested case does not exist or access was denied."
            actionLabel="Return to Dashboard"
            onAction={() => navigate('/dashboard')}
          />
        </div>
      </div>
    );
  }

  const hasNodes = (graphData?.nodes || []).length > 0;
  const isDetailOpen = !!selectedNodeId || !!selectedEdgeId;

  return (
    <div className="h-screen bg-app flex flex-col overflow-hidden">
      <Navbar />

      {/* Case Sub-header Toolbar */}
      <div className="h-12 bg-surface border-b border-border-subtle flex items-center justify-between px-4 shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/investigations')}
            className="p-1.5 rounded-button text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            title="Back to Cases"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 truncate">
            <h2 className="text-sm font-semibold font-mono text-text truncate max-w-xs sm:max-w-md">
              {investigation.title}
            </h2>
            <Badge variant={investigation.status === 'ACTIVE' ? 'success' : 'muted'}>
              {investigation.status}
            </Badge>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Workspace view switcher */}
          <div className="hidden sm:flex items-center bg-surface-2 p-0.5 rounded-button border border-border-subtle">
            {(
              [
                { id: 'graph', label: 'Graph', icon: Network },
                { id: 'notes', label: 'Notes', icon: FileText },
              ] as const
            ).map((v) => {
              const Icon = v.icon;
              const active = activeWorkspaceView === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setActiveWorkspaceView(v.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-button transition-colors ${
                    active
                      ? 'bg-primary text-white font-semibold shadow-sm'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{v.label}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleRefresh}
            className="p-2 rounded-button text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            title="Refresh graph"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setLiveLogsOpen(!liveLogsOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-button border transition-all ${
              liveLogsOpen
                ? 'bg-primary/20 border-primary text-primary font-semibold shadow-sm'
                : isDiscovering
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 animate-pulse'
                  : 'bg-surface-2 border-border-subtle text-text-muted hover:text-text hover:border-border'
            }`}
            title="Toggle Real-Time Discovery Logs Console"
          >
            <Terminal className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">Live Logs</span>
            {isDiscovering ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            ) : liveDiscoveryLogs.length > 0 ? (
              <span className="text-[10px] px-1 py-0.2 rounded bg-surface-3 text-text-muted font-mono">
                {liveDiscoveryLogs.length}
              </span>
            ) : null}
          </button>

          <Button
            variant="secondary"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={() => setExportModalOpen(true)}
          >
            <span className="hidden md:inline">Export Dossier</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={<Sparkles className="w-3.5 h-3.5 text-amber-300" />}
            onClick={() => setDiscoveryModalOpen(true)}
            className="shadow-md shadow-primary/20"
          >
            <span>Start Discovery</span>
          </Button>
        </div>
      </div>

      {/* Main 3-Column Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Case metadata & Collector runs */}
        {sidebarOpen ? (
          <aside className="w-64 bg-surface border-r border-border-subtle flex flex-col shrink-0 z-10 transition-all">
            <div className="p-3 border-b border-border-subtle flex items-center justify-between">
              <span className="text-xs font-semibold text-text uppercase tracking-wider">
                Case Activity
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded-button text-text-muted hover:text-text"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
              {/* Summary stat counters */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-surface-2 p-2.5 rounded-card border border-border-subtle text-center">
                  <div className="text-base font-bold font-mono text-text">
                    {graphData?.nodes?.length || 0}
                  </div>
                  <div className="text-[10px] text-text-muted">Entities</div>
                </div>
                <div className="bg-surface-2 p-2.5 rounded-card border border-border-subtle text-center">
                  <div className="text-base font-bold font-mono text-text">
                    {graphData?.edges?.length || 0}
                  </div>
                  <div className="text-[10px] text-text-muted">Relationships</div>
                </div>
              </div>

              {/* Breakdown: Entities by Category */}
              <div>
                <span className="text-[11px] font-semibold text-text-secondary block mb-2">
                  Entities by Category
                </span>
                {(() => {
                  const counts: Record<string, number> = {};
                  (graphData?.nodes || []).forEach((node) => {
                    const t = node.data?.entityType || 'OTHER';
                    counts[t] = (counts[t] || 0) + 1;
                  });
                  const categories = Object.entries(counts).sort((a, b) => b[1] - a[1]);

                  if (categories.length === 0) {
                    return <p className="text-[11px] text-text-muted py-1">No entities found.</p>;
                  }

                  return (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {categories.map(([type, count]) => (
                        <div
                          key={type}
                          className="bg-surface-2 px-2 py-1.5 rounded-input border border-border-subtle flex items-center justify-between text-[11px]"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-mono text-primary font-semibold text-[10px]">
                              {type}
                            </span>
                            <span className="text-[10px] text-text-muted">({count})</span>
                          </div>
                          <button
                            onClick={async () => {
                              if (
                                window.confirm(
                                  `Delete all ${count} "${type}" entities from this case?`,
                                )
                              ) {
                                try {
                                  await api.entities.deleteByType(caseId!, type);
                                  handleRefresh();
                                  addToast(`Deleted all ${count} ${type} entities`, 'info');
                                } catch (err: any) {
                                  addToast(err.message || 'Failed to delete entities', 'error');
                                }
                              }
                            }}
                            title={`Delete all ${type} entities`}
                            className="p-1 text-status-danger/70 hover:text-status-danger hover:bg-status-danger/10 rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Collector Runs */}
              <div>
                <span className="text-[11px] font-semibold text-text-secondary block mb-2">
                  Collector History ({collectorRuns.length})
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {collectorRuns.length === 0 ? (
                    <p className="text-[11px] text-text-muted py-1">No runs yet.</p>
                  ) : (
                    collectorRuns.map((run) => (
                      <div
                        key={run.id}
                        className="bg-surface-2 p-2 rounded-input border border-border-subtle text-[11px]"
                      >
                        <div className="flex items-center justify-between font-mono">
                          <span className="font-semibold text-text uppercase">
                            {run.collector}
                          </span>
                          <span
                            className={`text-[10px] ${
                              run.status === 'COMPLETED'
                                ? 'text-status-success'
                                : run.status === 'FAILED'
                                  ? 'text-status-danger'
                                  : 'text-accent-cyan'
                            }`}
                          >
                            {run.status}
                          </span>
                        </div>
                        <div className="text-[10px] text-text-muted truncate mt-0.5">
                          {run.input_summary}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Quick Start Discovery Button */}
              <Button
                variant="secondary"
                size="sm"
                className="w-full text-xs"
                icon={<Sparkles className="w-3.5 h-3.5 text-primary" />}
                onClick={() => setDiscoveryModalOpen(true)}
              >
                Start Discovery
              </Button>

              {/* Case Reset & Delete Management */}
              <div className="pt-2 border-t border-border-subtle space-y-1.5">
                <button
                  onClick={async () => {
                    if (
                      window.confirm(
                        'Are you sure you want to clear all graph data (entities, relationships, evidence) in this investigation dossier?',
                      )
                    ) {
                      try {
                        await api.investigations.reset(caseId!);
                        handleRefresh();
                        addToast('Cleared all graph data in dossier', 'info');
                      } catch (err: any) {
                        addToast(err.message || 'Failed to reset graph', 'error');
                      }
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-text-muted hover:text-status-danger hover:bg-status-danger/10 rounded-button border border-border-subtle transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Clear All Graph Data</span>
                </button>

                <button
                  onClick={async () => {
                    if (
                      window.confirm(
                        `Permanently delete the entire investigation dossier "${investigation.title}"?`,
                      )
                    ) {
                      try {
                        await api.investigations.delete(caseId!);
                        addToast('Investigation dossier deleted', 'info');
                        navigate('/investigations');
                      } catch (err: any) {
                        addToast(err.message || 'Failed to delete investigation', 'error');
                      }
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-status-danger hover:bg-status-danger/15 rounded-button border border-status-danger/30 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete Dossier</span>
                </button>
              </div>
            </div>
          </aside>
        ) : (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 left-4 z-20 p-2 bg-surface border border-border-subtle rounded-card shadow-lg text-text-muted hover:text-text"
            title="Open Activity Sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Center: Interactive Graph View OR Notes View */}
        <div className="flex-1 h-full relative overflow-hidden bg-app">
          {activeWorkspaceView === 'graph' ? (
            isGraphLoading ? (
              <div className="flex items-center justify-center h-full">
                <LoadingState message="Rendering investigation graph..." />
              </div>
            ) : !hasNodes ? (
              <div className="flex items-center justify-center h-full">
                <EmptyState
                  icon={<Compass className="w-10 h-10 text-primary" />}
                  title="Investigation graph is empty"
                  description="Enter an organization name, domain, email, username, or IP to start automated multi-category discovery."
                  actionLabel="Start Discovery"
                  actionIcon={<Sparkles className="w-4 h-4 text-amber-300" />}
                  onAction={() => setDiscoveryModalOpen(true)}
                />
              </div>
            ) : (
              <GraphView graphData={graphData!} onRefresh={handleRefresh} />
            )
          ) : (
            /* Analyst Notes View */
            <div className="h-full overflow-y-auto p-6 max-w-4xl mx-auto space-y-6">
              <div>
                <h3 className="text-lg font-bold text-text">Analyst Case Notes</h3>
                <p className="text-xs text-text-muted">
                  Document hypotheses, observations, provenance trails, and investigation conclusions
                </p>
              </div>

              {/* Note input form */}
              <form onSubmit={handleAddNote} className="bg-surface p-4 rounded-card border border-border-subtle space-y-3">
                <textarea
                  rows={3}
                  placeholder="Record an analyst observation or investigation note..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  className="input-field resize-none text-xs font-sans"
                  disabled={submittingNote}
                />
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    type="submit"
                    loading={submittingNote}
                    icon={<Send className="w-3.5 h-3.5" />}
                  >
                    Save Note
                  </Button>
                </div>
              </form>

              {/* Notes List */}
              <div className="space-y-3">
                {notes.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-8">
                    No notes recorded yet.
                  </p>
                ) : (
                  notes.map((note) => (
                    <div
                      key={note.id}
                      className="bg-surface p-4 rounded-card border border-border-subtle space-y-2"
                    >
                      <div className="flex items-center justify-between text-[11px] text-text-muted font-mono">
                        <span>{new Date(note.created_at).toLocaleString()}</span>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1 text-text-muted hover:text-status-danger transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-text leading-relaxed whitespace-pre-wrap">
                        {note.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Live Discovery Logs OR Entity Details */}
        {liveLogsOpen ? (
          <DiscoveryLogsPanel onClose={() => setLiveLogsOpen(false)} />
        ) : isDetailOpen && caseId ? (
          <EntityDetailPanel
            caseId={caseId}
            onClose={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
          />
        ) : null}
      </div>

      {/* Modals */}
      {caseId && (
        <>
          <StartDiscoveryModal
            isOpen={discoveryModalOpen}
            onClose={() => setDiscoveryModalOpen(false)}
            caseId={caseId}
            onSuccess={handleRefresh}
          />
          <ExportModal
            isOpen={exportModalOpen}
            onClose={() => setExportModalOpen(false)}
            caseId={caseId}
            caseTitle={investigation.title}
          />
        </>
      )}
    </div>
  );
}
