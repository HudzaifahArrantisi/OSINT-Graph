import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAppStore } from '../../stores/appStore';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { EvidenceCard } from './EvidenceCard';
import { TransformPanel } from './TransformPanel';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { SubdomainsInventory } from './SubdomainsInventory';
import {
  X,
  Globe2,
  Calendar,
  Layers,
  FileCode2,
  FileText,
  Clock,
  ExternalLink,
  Shield,
  ArrowRight,
  Trash2,
  Sparkles,
  Copy,
  Check,
  Compass,
} from 'lucide-react';
import type { Entity, Relationship, Evidence, TimelineEvent } from '@nexusgraph/shared';

interface EntityDetailPanelProps {
  caseId: string;
  onClose: () => void;
  width?: number;
  onResizeStart?: (e: React.MouseEvent) => void;
}

export function getNavigableUrl(entity?: { type?: string; value: string; metadata?: any }): string | null {
  if (!entity || !entity.value) return null;
  const val = String(entity.value).trim();
  const meta = entity.metadata || {};
  const metaUrl = meta.url || meta.href || meta.link;

  if (val.startsWith('http://') || val.startsWith('https://')) return val;
  if (metaUrl && (String(metaUrl).startsWith('http://') || String(metaUrl).startsWith('https://'))) return String(metaUrl);

  // If this is an aggregate subdomain node like "Subdomains of nurulfikri.ac.id"
  if (meta.isSubdomainAggregate || val.toLowerCase().startsWith('subdomains of ')) {
    if (meta.apex) return `https://${meta.apex}`;
    return null;
  }

  const t = String(entity.type || '').toUpperCase();
  if (['DOMAIN', 'WEBSITE', 'SUBDOMAIN'].includes(t)) {
    return `https://${val}`;
  }
  if (['URL'].includes(t)) {
    return val.startsWith('http') ? val : `https://${val}`;
  }
  if (['SOCIAL_PROFILE', 'GITHUB_PROFILE', 'GITLAB_PROFILE', 'YOUTUBE_CHANNEL'].includes(t)) {
    if (val.startsWith('http')) return val;
    if (t === 'GITHUB_PROFILE') return `https://github.com/${val.replace('@', '')}`;
    if (t === 'GITLAB_PROFILE') return `https://gitlab.com/${val.replace('@', '')}`;
    if (t === 'YOUTUBE_CHANNEL') return `https://youtube.com/${val}`;
    return `https://${val}`;
  }
  if (['EMAIL'].includes(t)) {
    return `mailto:${val}`;
  }
  if (['PHONE'].includes(t)) {
    return `tel:${val}`;
  }
  return null;
}

export function EntityDetailPanel({ caseId, onClose, width, onResizeStart }: EntityDetailPanelProps) {
  const queryClient = useQueryClient();
  const { selectedNodeId, selectedEdgeId, setSelectedNodeId, addToast } = useAppStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'transforms' | 'relationships' | 'evidence' | 'timeline' | 'raw'>('overview');
  const [copied, setCopied] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    isSeedMode: boolean;
    loading: boolean;
  }>({
    isOpen: false,
    isSeedMode: false,
    loading: false,
  });

  // Fetch entities, relationships, evidence, and timeline for this case
  const { data: entities = [] } = useQuery<Entity[]>({
    queryKey: ['entities', caseId],
    queryFn: () => api.entities.list(caseId),
  });

  const { data: relationships = [] } = useQuery<Relationship[]>({
    queryKey: ['relationships', caseId],
    queryFn: () => api.relationships.list(caseId),
  });

  const { data: evidenceList = [] } = useQuery<Evidence[]>({
    queryKey: ['evidence', caseId],
    queryFn: () => api.evidence.list(caseId),
  });

  const { data: timelineEvents = [] } = useQuery<TimelineEvent[]>({
    queryKey: ['timeline', caseId],
    queryFn: () => api.timeline.list(caseId),
  });

  // Selected Entity
  const selectedEntity = entities.find((e) => e.id === selectedNodeId);

  // Relationships connected to this entity
  const connectedRelationships = relationships.filter(
    (r) => r.source_entity_id === selectedNodeId || r.target_entity_id === selectedNodeId,
  );

  // Evidence linked to this entity
  const linkedEvidence = evidenceList.filter((ev) => ev.entity_id === selectedNodeId);

  // If edge selected instead of node
  const selectedRelationship = relationships.find((r) => r.id === selectedEdgeId);

  const isSeed = selectedEntity?.type === 'SEED' || !!(selectedEntity?.metadata as any)?.isSeed;
  const navUrl = getNavigableUrl(selectedEntity);

  const handleCopyValue = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    addToast('URL/Nilai berhasil disalin ke clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Compute connected graph nodes count for this entity
  const connectedCount = React.useMemo(() => {
    if (!selectedEntity) return 0;
    const adj = new Map<string, Set<string>>();
    for (const e of entities) adj.set(e.id, new Set());
    for (const r of relationships) {
      adj.get(r.source_entity_id)?.add(r.target_entity_id);
      adj.get(r.target_entity_id)?.add(r.source_entity_id);
    }
    const visited = new Set<string>([selectedEntity.id]);
    const queue = [selectedEntity.id];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = adj.get(curr) || new Set();
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
    return visited.size;
  }, [selectedEntity, entities, relationships]);

  const handleDeleteSeed = () => {
    if (!selectedEntity) return;
    setDeleteConfirm({
      isOpen: true,
      isSeedMode: true,
      loading: false,
    });
  };

  const handleDeleteIndividualEntity = () => {
    if (!selectedEntity) return;
    setDeleteConfirm({
      isOpen: true,
      isSeedMode: false,
      loading: false,
    });
  };

  const handleConfirmDelete = async () => {
    if (!selectedEntity) return;
    setDeleteConfirm((prev) => ({ ...prev, loading: true }));

    if (deleteConfirm.isSeedMode) {
      try {
        const res = await api.seeds.delete(caseId, selectedEntity.id);
        queryClient.invalidateQueries({ queryKey: ['graph', caseId] });
        queryClient.invalidateQueries({ queryKey: ['entities', caseId] });
        queryClient.invalidateQueries({ queryKey: ['relationships', caseId] });
        queryClient.invalidateQueries({ queryKey: ['evidence', caseId] });
        queryClient.invalidateQueries({ queryKey: ['timeline', caseId] });
        queryClient.invalidateQueries({ queryKey: ['discoveries', caseId] });
        queryClient.invalidateQueries({ queryKey: ['collector-runs', caseId] });
        addToast(
          `Seed target "${res.seedValue}" dan ${res.deletedEntitiesCount} node terhubung berhasil dihapus`,
          'info',
        );
        setSelectedNodeId(null);
        setDeleteConfirm({ isOpen: false, isSeedMode: false, loading: false });
        onClose();
      } catch (err: any) {
        addToast(err.message || 'Failed to delete seed and connected graph', 'error');
        setDeleteConfirm((prev) => ({ ...prev, loading: false }));
      }
    } else {
      try {
        await api.entities.delete(caseId, selectedEntity.id);
        queryClient.invalidateQueries({ queryKey: ['graph', caseId] });
        queryClient.invalidateQueries({ queryKey: ['entities', caseId] });
        queryClient.invalidateQueries({ queryKey: ['relationships', caseId] });
        addToast(`Deleted entity "${selectedEntity.value}"`, 'info');
        setSelectedNodeId(null);
        setDeleteConfirm({ isOpen: false, isSeedMode: false, loading: false });
        onClose();
      } catch (err: any) {
        addToast(err.message || 'Failed to delete entity', 'error');
        setDeleteConfirm((prev) => ({ ...prev, loading: false }));
      }
    }
  };

  if (!selectedEntity && !selectedRelationship) return null;

  return (
    <aside
      style={{ width: width ? `${width}px` : undefined }}
      className="w-80 sm:w-96 h-full bg-surface border-l border-border-subtle flex flex-col z-20 shadow-2xl animate-slide-in-right relative shrink-0 select-text"
    >
      {/* Resizing Handle on Left Edge */}
      {onResizeStart && (
        <div
          onMouseDown={onResizeStart}
          className="absolute left-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-primary/50 transition-colors z-30 group"
          title="Drag to resize panel"
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r bg-border group-hover:bg-primary transition-colors" />
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-border-subtle flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {selectedEntity ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                {isSeed ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono">
                    SEED TARGET
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {selectedEntity.type}
                  </span>
                )}
                <ConfidenceBadge score={selectedEntity.confidence || 50} size="sm" />
              </div>
              <h3
                className={`text-base font-semibold font-mono break-all ${
                  isSeed ? 'text-amber-200' : 'text-text'
                }`}
                title={selectedEntity.value}
              >
                {selectedEntity.value}
              </h3>
              {selectedEntity.title && (
                <p className="text-xs text-text-muted break-all mt-0.5">{selectedEntity.title}</p>
              )}
            </>
          ) : (
            selectedRelationship && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    RELATIONSHIP
                  </span>
                  <ConfidenceBadge score={selectedRelationship.confidence || 50} size="sm" />
                </div>
                <h3 className="text-sm font-semibold font-mono text-primary">
                  {selectedRelationship.relationship_type}
                </h3>
              </>
            )
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selectedEntity && (
            <button
              onClick={isSeed ? handleDeleteSeed : handleDeleteIndividualEntity}
              title={isSeed ? 'Hapus Seed Target & Graf Terhubung' : 'Delete this node from graph'}
              className="p-1 rounded-button text-status-danger/70 hover:text-status-danger hover:bg-status-danger/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-button text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Direct Navigation & Action Bar for URLs / Domains / Social Profiles */}
      {selectedEntity && navUrl && (
        <div className="p-3 bg-[#0d1627] border-b border-border-subtle flex items-center gap-2">
          <button
            onClick={() => handleOpenUrl(navUrl)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-button bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-md shadow-primary/20 transition-all cursor-pointer"
            title={`Buka langsung di tab baru: ${navUrl}`}
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Kunjungi Target / Buka URL</span>
          </button>

          <button
            onClick={() => handleCopyValue(navUrl)}
            className="p-1.5 rounded-button bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-text border border-border-subtle transition-colors"
            title="Salin URL ke clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center border-b border-border-subtle bg-surface-2/40 px-2 overflow-x-auto">
        {(['overview', 'transforms', 'relationships', 'evidence', 'timeline', 'raw'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-xs font-medium capitalize whitespace-nowrap transition-colors border-b-2 flex items-center gap-1 ${
              activeTab === tab
                ? 'border-primary text-text font-semibold'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab === 'transforms' && <Sparkles className="w-3 h-3 text-primary" />}
            {tab}
            {tab === 'relationships' && ` (${connectedRelationships.length})`}
            {tab === 'evidence' && ` (${linkedEvidence.length})`}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {selectedEntity && (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                {isSeed && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-card p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Investigation Seed Target</span>
                      </div>
                      <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                        {connectedCount} Nodes
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                      Titik awal investigasi ini terhubung dengan {connectedCount} entitas pada graf. Anda dapat menghapus seluruh cabang subgraf dari seed ini secara instan.
                    </p>
                    <button
                      onClick={handleDeleteSeed}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-status-danger bg-status-danger/10 hover:bg-status-danger/20 border border-status-danger/30 rounded-button transition-colors shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Seed Target & Subgraf ({connectedCount} Node)</span>
                    </button>
                  </div>
                )}

                {/* Direct Link Banner */}
                {navUrl && (
                  <div className="p-2.5 rounded-card bg-[#0f0f0f] border border-[#262626] space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-neutral-300 font-semibold font-mono">
                      <div className="flex items-center gap-1.5 text-white">
                        <Compass className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Direct Target Link</span>
                      </div>
                      <span className="text-[10px] text-neutral-400">External Target</span>
                    </div>
                    <a
                      href={navUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs font-mono text-neutral-200 hover:text-white hover:underline break-all transition-colors"
                    >
                      {navUrl}
                    </a>
                  </div>
                )}

                {/* SUBDOMAIN AGGREGATE TABLE VIEW */}
                {Boolean((selectedEntity.metadata as any)?.isSubdomainAggregate || (selectedEntity.metadata as any)?.allSubdomains) && (
                  <SubdomainsInventory
                    allSubdomains={(selectedEntity.metadata as any)?.allSubdomains}
                    activeSubdomains={(selectedEntity.metadata as any)?.activeSubdomains}
                    inactiveSubdomains={(selectedEntity.metadata as any)?.inactiveSubdomains}
                    activeCount={(selectedEntity.metadata as any)?.activeCount}
                    inactiveCount={(selectedEntity.metadata as any)?.inactiveCount}
                    apex={(selectedEntity.metadata as any)?.apex}
                  />
                )}

                <div className="bg-surface-2 rounded-card p-3 border border-border-subtle space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Type:</span>
                    <span className="font-mono text-text font-medium">{selectedEntity.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Confidence:</span>
                    <span className="font-mono text-text">{selectedEntity.confidence}%</span>
                  </div>
                  {selectedEntity.first_seen && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">First Seen:</span>
                      <span className="font-mono text-text-secondary">
                        {new Date(selectedEntity.first_seen).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {selectedEntity.last_seen && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Last Seen:</span>
                      <span className="font-mono text-text-secondary">
                        {new Date(selectedEntity.last_seen).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-surface-2 rounded-card p-2.5 border border-border-subtle">
                    <div className="text-lg font-bold text-text font-mono">
                      {connectedRelationships.length}
                    </div>
                    <div className="text-[10px] text-text-muted uppercase">Relationships</div>
                  </div>
                  <div className="bg-surface-2 rounded-card p-2.5 border border-border-subtle">
                    <div className="text-lg font-bold text-text font-mono">
                      {linkedEvidence.length}
                    </div>
                    <div className="text-[10px] text-text-muted uppercase">Evidence Records</div>
                  </div>
                </div>

                {/* Available Transforms Quick Access */}
                <div className="pt-2 border-t border-border-subtle">
                  <TransformPanel
                    caseId={caseId}
                    entityId={selectedEntity.id}
                    entityType={selectedEntity.type}
                    entityValue={selectedEntity.value}
                  />
                </div>
              </div>
            )}

            {/* TRANSFORMS TAB */}
            {activeTab === 'transforms' && (
              <div className="space-y-4">
                <TransformPanel
                  caseId={caseId}
                  entityId={selectedEntity.id}
                  entityType={selectedEntity.type}
                  entityValue={selectedEntity.value}
                />
              </div>
            )}

            {/* RELATIONSHIPS TAB */}
            {activeTab === 'relationships' && (
              <div className="space-y-2">
                {connectedRelationships.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-6">
                    No relationships discovered yet.
                  </p>
                ) : (
                  connectedRelationships.map((rel) => {
                    const isSource = rel.source_entity_id === selectedEntity.id;
                    const otherEntityId = isSource ? rel.target_entity_id : rel.source_entity_id;
                    const otherEntity = entities.find((e) => e.id === otherEntityId);

                    return (
                      <div
                        key={rel.id}
                        onClick={() => setSelectedNodeId(otherEntityId)}
                        className="bg-surface-2 border border-border-subtle rounded-card p-3 hover:border-border cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-mono text-primary font-medium">
                            {rel.relationship_type}
                          </span>
                          <ConfidenceBadge score={rel.confidence} size="sm" />
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-text-muted">{isSource ? '→' : '←'}</span>
                          <span className="font-mono text-text font-medium truncate">
                            {otherEntity?.value || otherEntityId}
                          </span>
                        </div>
                        {rel.reason && (
                          <p className="text-[11px] text-text-muted mt-1 truncate">{rel.reason}</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* EVIDENCE TAB */}
            {activeTab === 'evidence' && (
              <div className="space-y-2">
                {linkedEvidence.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-6">
                    No evidence records attached to this entity.
                  </p>
                ) : (
                  linkedEvidence.map((ev) => <EvidenceCard key={ev.id} evidence={ev} />)
                )}
              </div>
            )}

            {/* TIMELINE TAB */}
            {activeTab === 'timeline' && (
              <div className="space-y-3">
                {timelineEvents.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-6">
                    No timeline events recorded.
                  </p>
                ) : (
                  timelineEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className="bg-surface-2 border border-border-subtle rounded-card p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between text-text-muted mb-1">
                        <span className="font-mono uppercase text-[10px]">{evt.title}</span>
                        <span>{new Date(evt.event_at).toLocaleDateString()}</span>
                      </div>
                      {evt.description && <p className="text-text font-medium">{evt.description}</p>}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* RAW JSON TAB */}
            {activeTab === 'raw' && (
              <pre className="bg-surface-2 p-3 rounded-card text-[11px] font-mono text-text-secondary overflow-x-auto border border-border-subtle">
                {JSON.stringify(selectedEntity, null, 2)}
              </pre>
            )}
          </>
        )}

        {/* RELATIONSHIP SELECTED */}
        {selectedRelationship && !selectedEntity && (
          <div className="space-y-4">
            <div className="bg-surface-2 rounded-card p-3 border border-border-subtle space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Type:</span>
                <span className="font-mono text-text font-medium">
                  {selectedRelationship.relationship_type}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Confidence:</span>
                <span className="font-mono text-text">{selectedRelationship.confidence}%</span>
              </div>
              {selectedRelationship.reason && (
                <div className="pt-2 border-t border-border-subtle">
                  <span className="text-text-muted block mb-1">Reason:</span>
                  <p className="text-text font-sans leading-relaxed">
                    {selectedRelationship.reason}
                  </p>
                </div>
              )}
            </div>

            {/* Evidence for this relationship */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-text uppercase tracking-wider">
                Attached Evidence
              </h4>
              {linkedEvidence.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-4">
                  No evidence attached to this relationship.
                </p>
              ) : (
                linkedEvidence.map((ev) => <EvidenceCard key={ev.id} evidence={ev} />)
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => {
          if (!deleteConfirm.loading) {
            setDeleteConfirm((prev) => ({ ...prev, isOpen: false }));
          }
        }}
        onConfirm={handleConfirmDelete}
        title={deleteConfirm.isSeedMode ? 'Hapus Seed Target' : 'Hapus Entitas'}
        message={
          deleteConfirm.isSeedMode
            ? connectedCount > 1
              ? `Hapus Seed Target "${selectedEntity?.value}" beserta seluruh ${connectedCount} entitas dan graph yang terhubung dengannya?`
              : `Hapus Seed Target "${selectedEntity?.value}" dari investigasi ini?`
            : `Hapus entitas "${selectedEntity?.value}" dari investigasi ini?`
        }
        confirmText={deleteConfirm.isSeedMode ? 'Hapus Seed' : 'Hapus'}
        cancelText="Batal"
        variant="danger"
        loading={deleteConfirm.loading}
      />
    </aside>
  );
}
