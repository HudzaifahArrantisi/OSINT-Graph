import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Navbar } from '../components/layout/Navbar';
import { GraphView } from '../components/graph/GraphView';
import { PhoneMapPanel } from '../components/map/PhoneMapPanel';
import { TimelineView } from '../components/timeline/TimelineView';
import { EntityDetailPanel } from '../components/detail/EntityDetailPanel';
import { DiscoveryLogsPanel } from '../components/detail/DiscoveryLogsPanel';
import { StartDiscoveryModal } from '../components/modals/StartDiscoveryModal';
import { ExportModal } from '../components/modals/ExportModal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { useAppStore } from '../stores/appStore';
import {
  Download,
  Network,
  Clock,
  FileText,
  Shield,
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
  Target,
  MapPin,
  MoreVertical,
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

  const [activeWorkspaceView, setActiveWorkspaceView] = useState<'graph' | 'map' | 'timeline' | 'evidence' | 'notes'>('graph');
  const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const moreActionsRef = useRef<HTMLDivElement>(null);
  const [deleteSeedConfirm, setDeleteSeedConfirm] = useState<{
    isOpen: boolean;
    seedId: string;
    seedLabel: string;
    count: number;
    loading: boolean;
  }>({
    isOpen: false,
    seedId: '',
    seedLabel: '',
    count: 0,
    loading: false,
  });

  // Resizable sidebar dimensions with persistent storage
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('nexusgraph_left_sidebar_width');
      return saved ? Math.max(180, Math.min(600, parseInt(saved, 10))) : 260;
    } catch {
      return 260;
    }
  });

  // Right console width (when console is placed in right sidebar)
  const [consoleWidth, setConsoleWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('nexusgraph_console_width');
      return saved ? Math.max(280, Math.min(650, parseInt(saved, 10))) : 360;
    } catch {
      return 360;
    }
  });

  // Right sidebar width for entity detail inspector only
  const [rightSidebarWidth, setRightSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('nexusgraph_right_sidebar_width');
      return saved ? Math.max(320, Math.min(850, parseInt(saved, 10))) : 480;
    } catch {
      return 480;
    }
  });

  const handleLeftResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftSidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(600, startWidth + (moveEvent.clientX - startX)));
      setLeftSidebarWidth(newWidth);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const finalWidth = Math.max(180, Math.min(600, startWidth + (upEvent.clientX - startX)));
      try {
        localStorage.setItem('nexusgraph_left_sidebar_width', finalWidth.toString());
      } catch { }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleConsoleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = consoleWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(260, Math.min(700, startWidth - (moveEvent.clientX - startX)));
      setConsoleWidth(newWidth);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const finalWidth = Math.max(260, Math.min(700, startWidth - (upEvent.clientX - startX)));
      try {
        localStorage.setItem('nexusgraph_console_width', finalWidth.toString());
      } catch { }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Close more-actions dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreActionsRef.current && !moreActionsRef.current.contains(e.target as HTMLElement)) {
        setMoreActionsOpen(false);
      }
    };
    if (moreActionsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [moreActionsOpen]);


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

  // Compute active Seed Targets and their connected subgraph sizes
  const seedTargets = React.useMemo(() => {
    if (!graphData?.nodes) return [];
    const seeds = graphData.nodes.filter(
      (n) => n.data?.isSeed || n.data?.entityType === 'SEED' || n.type === 'seed',
    );
    const seedIds = new Set(seeds.map((s) => s.id));

    const forwardAdj = new Map<string, Set<string>>();
    for (const n of graphData.nodes) forwardAdj.set(n.id, new Set());
    for (const e of graphData.edges || []) {
      forwardAdj.get(e.source)?.add(e.target);
    }

    return seeds.map((seed) => {
      const visited = new Set<string>([seed.id]);
      const queue = [seed.id];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const neighbors = forwardAdj.get(curr) || new Set();
        for (const n of neighbors) {
          if (seedIds.has(n) && n !== seed.id) continue;
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }
      return {
        id: seed.id,
        label: seed.data?.label || seed.data?.value || 'Seed Target',
        type: seed.data?.entityType || 'SEED',
        connectedCount: visited.size,
        data: seed.data,
      };
    });
  }, [graphData]);

  const handleDeleteSeed = (seedId: string, seedLabel: string, count: number) => {
    setDeleteSeedConfirm({
      isOpen: true,
      seedId,
      seedLabel,
      count,
      loading: false,
    });
  };

  const handleConfirmDeleteSeed = async () => {
    if (!caseId || !deleteSeedConfirm.seedId) return;
    setDeleteSeedConfirm((prev) => ({ ...prev, loading: true }));
    try {
      const res = await api.seeds.delete(caseId, deleteSeedConfirm.seedId);
      handleRefresh();
      if (selectedNodeId === deleteSeedConfirm.seedId) {
        setSelectedNodeId(null);
      }
      addToast(
        `Seed target "${res.seedValue}" dan ${res.deletedEntitiesCount} node terhubung berhasil dihapus`,
        'info',
      );
      setDeleteSeedConfirm({
        isOpen: false,
        seedId: '',
        seedLabel: '',
        count: 0,
        loading: false,
      });
    } catch (err: any) {
      addToast(err.message || 'Gagal menghapus seed target', 'error');
      setDeleteSeedConfirm((prev) => ({ ...prev, loading: false }));
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
          <div className="hidden sm:flex items-center bg-[#0a0a0a] p-0.5 rounded-lg border border-[#222222]">
            {(
              [
                { id: 'graph', label: 'Graph', icon: Network },
                { id: 'map', label: 'Geo Map', icon: MapPin },
                { id: 'timeline', label: 'Timeline', icon: Clock },
                { id: 'notes', label: 'Notes', icon: FileText },
              ] as const
            ).map((v) => {
              const Icon = v.icon;
              const active = activeWorkspaceView === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setActiveWorkspaceView(v.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#222222] text-white font-medium shadow-sm border border-[#333333]'
                      : 'text-neutral-400 hover:text-white'
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
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-[#181818] border border-transparent hover:border-[#262626] transition-colors cursor-pointer"
            title="Refresh graph"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setLiveLogsOpen(!liveLogsOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${
              liveLogsOpen
                ? 'bg-[#222222] text-white border-[#333333] font-medium'
                : 'text-neutral-400 hover:text-white hover:bg-[#181818] border-transparent hover:border-[#262626]'
            }`}
            title="Toggle Console Sidebar"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Console</span>
            {liveDiscoveryLogs.length > 0 && (
              <span className="text-[9.5px] px-1 py-0.2 rounded bg-[#1c1c1c] text-neutral-400 font-mono border border-[#2b2b2b]">
                {liveDiscoveryLogs.length}
              </span>
            )}
          </button>

          <Button
            variant="secondary"
            size="sm"
            icon={<Download className="w-3.5 h-3.5 text-neutral-400" />}
            onClick={() => setExportModalOpen(true)}
          >
            <span className="hidden md:inline">Export Dossier</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={<Compass className="w-3.5 h-3.5" />}
            onClick={() => setDiscoveryModalOpen(true)}
            className="font-medium"
          >
            <span>Start Discovery</span>
          </Button>
        </div>
      </div>

      {/* Main 3-Column Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Case metadata & Collector runs */}
        {sidebarOpen ? (
          <aside
            style={{ width: `${leftSidebarWidth}px` }}
            className="bg-surface border-r border-border-subtle flex flex-col shrink-0 z-10 relative select-text"
          >
            {/* Drag Handle on right border of left sidebar */}
            <div
              onMouseDown={handleLeftResizeStart}
              className="absolute right-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-primary/60 transition-colors z-30 group"
              title="Drag to resize sidebar"
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-l bg-border group-hover:bg-primary transition-colors" />
            </div>

            <div className="p-3 border-b border-border-subtle flex items-center justify-between">
              <span className="text-xs font-semibold text-text uppercase tracking-wider">
                Case Activity
              </span>
              <div className="flex items-center gap-1">
                {/* More Actions Dropdown */}
                <div className="relative" ref={moreActionsRef}>
                  <button
                    onClick={() => setMoreActionsOpen((prev) => !prev)}
                    className="p-1 rounded-button text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                    title="More actions"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                  {moreActionsOpen && (
                    <div className="absolute right-0 top-full mt-1 w-52 bg-[#0d1220]/98 backdrop-blur-xl border border-[#1e293b] rounded-lg shadow-2xl py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                      <button
                        onClick={async () => {
                          setMoreActionsOpen(false);
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
                        className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                        <span>Clear All Graph Data</span>
                      </button>
                      <div className="h-[1px] bg-[#1e293b] mx-2 my-1" />
                      <button
                        onClick={async () => {
                          setMoreActionsOpen(false);
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
                        className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Dossier</span>
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 rounded-button text-text-muted hover:text-text"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
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

              {/* Seed Targets Panel */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-text-secondary flex items-center gap-1.5">
                    <span>Seed Targets ({seedTargets.length})</span>
                  </span>
                  <button
                    onClick={() => setDiscoveryModalOpen(true)}
                    className="text-[10px] text-primary hover:underline flex items-center gap-0.5 font-medium"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span>Add</span>
                  </button>
                </div>

                {seedTargets.length === 0 ? (
                  <div className="bg-surface-2 p-2.5 rounded-card border border-border-subtle text-center text-[11px] text-text-muted">
                    <p>No seed targets active</p>
                    <button
                      onClick={() => setDiscoveryModalOpen(true)}
                      className="mt-1.5 text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
                    >
                      <span>Start Discovery</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {seedTargets.map((seed) => (
                      <div
                        key={seed.id}
                        className={`bg-[#0d0d0d] p-2 rounded-input border transition-all ${
                          selectedNodeId === seed.id
                            ? 'border-white bg-[#1a1a1a]'
                            : 'border-[#222222] hover:border-neutral-500'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedNodeId(seed.id);
                              setSelectedEdgeId(null);
                            }}
                            className="min-w-0 flex-1 text-left cursor-pointer"
                            title={`Focus "${seed.label}" in graph`}
                          >
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[9px] font-mono uppercase text-black bg-white px-1 py-0.2 rounded font-semibold">
                                {seed.type === 'SEED' ? 'SEED' : seed.type}
                              </span>
                              <span className="text-[10px] text-neutral-400 font-mono">
                                {seed.connectedCount} {seed.connectedCount === 1 ? 'node' : 'nodes'}
                              </span>
                            </div>
                            <div className="font-mono text-[11px] font-semibold text-white truncate">
                              {seed.label}
                            </div>
                          </button>

                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => {
                                setSelectedNodeId(seed.id);
                                setSelectedEdgeId(null);
                              }}
                              className="p-1 text-neutral-400 hover:text-white rounded hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                              title="Focus node on graph"
                            >
                              <Target className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteSeed(seed.id, seed.label, seed.connectedCount)}
                              className="p-1 text-neutral-400 hover:text-white rounded hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                              title={`Hapus Seed Target "${seed.label}" dan ${seed.connectedCount} node graf terhubung`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                          className="bg-surface-2 px-2.5 py-1.5 rounded-input border border-border-subtle flex items-center justify-between text-[11px]"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-mono text-primary font-semibold text-[10px]">
                              {type}
                            </span>
                          </div>
                          <span className="text-[10px] text-text-muted font-mono">{count}</span>
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
                            className={`text-[10px] ${run.status === 'COMPLETED'
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

        {/* Center Workspace (Canvas + Slide-over Panel + Bottom Console Drawer) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {/* Upper Workspace: Graph/Map/Timeline/Notes + Right Slide-over */}
          <div className="flex-1 flex overflow-hidden relative min-h-0">
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
              ) : activeWorkspaceView === 'map' ? (
                graphData ? (
                  <PhoneMapPanel graphData={graphData} />
                ) : (
                  <LoadingState message="Loading geolocation data..." />
                )
              ) : activeWorkspaceView === 'timeline' ? (
                <TimelineView caseId={caseId!} />
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

            {/* Right Panel: Entity/Edge Detail Inspector (slide-over only when selected) */}
            {isDetailOpen && caseId && (
              <EntityDetailPanel
                caseId={caseId}
                onClose={() => {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                }}
                width={rightSidebarWidth}
              />
            )}

            {/* Right Panel: Execution Console Sidebar */}
            {liveLogsOpen && (
              <DiscoveryLogsPanel
                onClose={() => setLiveLogsOpen(false)}
                width={consoleWidth}
                onResizeStart={handleConsoleResizeStart}
              />
            )}
          </div>

          {/* Bottom: Minimal Status Bar */}
          <div className="h-7 bg-[#090d14] border-t border-[#1e293b] flex items-center justify-between px-3 shrink-0 z-10">
            <div className="flex items-center gap-2.5 text-[10.5px] font-mono text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isDiscovering ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="text-slate-400">{isDiscovering ? 'Discovering' : 'Ready'}</span>
              </div>
              <span className="text-slate-700">·</span>
              <span>{graphData?.nodes?.length || 0} Entities</span>
              <span className="text-slate-700">·</span>
              <span>{graphData?.edges?.length || 0} Links</span>
              <span className="text-slate-700">·</span>
              <span>{seedTargets.length} Seeds</span>
            </div>

            <button
              onClick={() => setLiveLogsOpen(!liveLogsOpen)}
              className={`flex items-center gap-1.5 px-1.5 py-0.5 text-[10.5px] rounded transition-colors ${liveLogsOpen
                  ? 'text-slate-200 bg-slate-800/80 font-medium'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                }`}
              title="Toggle Console Sidebar"
            >
              <Terminal className="w-3 h-3" />
              <span>Console</span>
              {liveDiscoveryLogs.length > 0 && (
                <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                  {liveDiscoveryLogs.length}
                </span>
              )}
            </button>
          </div>
        </div>
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
          <ConfirmDialog
            isOpen={deleteSeedConfirm.isOpen}
            onClose={() => {
              if (!deleteSeedConfirm.loading) {
                setDeleteSeedConfirm((prev) => ({ ...prev, isOpen: false }));
              }
            }}
            onConfirm={handleConfirmDeleteSeed}
            title="Hapus Seed Target"
            message={
              deleteSeedConfirm.count > 1
                ? `Hapus Seed Target "${deleteSeedConfirm.seedLabel}" beserta seluruh ${deleteSeedConfirm.count} node graf yang terhubung dengannya?`
                : `Hapus Seed Target "${deleteSeedConfirm.seedLabel}" dari investigasi ini?`
            }
            confirmText="Hapus Seed"
            cancelText="Batal"
            variant="danger"
            loading={deleteSeedConfirm.loading}
          />
        </>
      )}
    </div>
  );
}
