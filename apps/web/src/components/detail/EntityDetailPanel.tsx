import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAppStore } from '../../stores/appStore';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { EvidenceCard } from './EvidenceCard';
import { TransformPanel } from './TransformPanel';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { SubdomainsInventory } from './SubdomainsInventory';
import { SocialProfileDetailList } from './SocialProfileDetailList';
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
  Radio,
  Server,
  AlertTriangle,
  AlertOctagon,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Lock,
  CheckCircle2,
  MapPin,
  FolderSearch,
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
  if (['URL', 'DOCUMENT'].includes(t)) {
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
  const {
    selectedNodeId,
    selectedEdgeId,
    setSelectedNodeId,
    addToast,
    setActiveWorkspaceView,
    setFocusedGeoNodeId,
  } = useAppStore();
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

  // Cross-reference evidence matching domain, host or entity value
  const entityEvidence = evidenceList.filter(
    (ev) =>
      ev.entity_id === selectedNodeId ||
      (selectedEntity &&
        ev.source_url &&
        (ev.source_url.includes(selectedEntity.value) ||
          ((selectedEntity.metadata as any)?.parentDomain &&
            ev.source_url.includes((selectedEntity.metadata as any).parentDomain))))
  );

  const takeoverEvidence = entityEvidence.find((ev) => ev.source_type === 'SUBDOMAIN_TAKEOVER');
  const dnsSecurityEvidence = entityEvidence.find((ev) => ev.source_type === 'DNS_SECURITY_AUDIT');
  const techEvidence = entityEvidence.find((ev) => ev.source_type === 'TECH_FINGERPRINT');
  const sensitiveParamEvidence = entityEvidence.find((ev) => ev.source_type === 'SENSITIVE_PARAM_ANALYSIS');
  const tlsEvidence = entityEvidence.find((ev) => ev.source_type === 'TLS_CERTIFICATE');

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
      className="min-w-[360px] max-w-[95vw] h-full bg-surface border-l border-border-subtle flex flex-col z-20 shadow-2xl animate-slide-in-right relative shrink-0 select-text"
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
        <div className="p-3 bg-[#000000] border-b border-border-subtle flex items-center gap-2">
          <button
            onClick={() => handleOpenUrl(navUrl)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-button bg-primary hover:bg-primary-hover text-black text-xs font-semibold shadow-md shadow-primary/20 transition-all cursor-pointer"
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

                {/* SOCIAL INTELLIGENCE & STATS ATTRIBUTES LIST */}
                {(selectedEntity.type === 'SOCIAL_PROFILE' ||
                  Boolean((selectedEntity.metadata as any)?.platform) ||
                  Boolean((selectedEntity.metadata as any)?.followers_count !== undefined) ||
                  Boolean((selectedEntity.metadata as any)?.followers !== undefined) ||
                  Boolean((selectedEntity.metadata as any)?.biography) ||
                  Boolean((selectedEntity.metadata as any)?.full_biography) ||
                  Boolean((selectedEntity.metadata as any)?.headline) ||
                  Boolean((selectedEntity.metadata as any)?.post_url) ||
                  Boolean((selectedEntity.metadata as any)?.highlight_id) ||
                  selectedEntity.value.toLowerCase().includes('instagram') ||
                  selectedEntity.value.toLowerCase().includes('tiktok') ||
                  selectedEntity.value.toLowerCase().includes('linkedin') ||
                  selectedEntity.value.toLowerCase().includes('followers') ||
                  selectedEntity.value.toLowerCase().includes('stats')) && (
                  <SocialProfileDetailList
                    entity={selectedEntity}
                    onCopy={handleCopyValue}
                  />
                )}

                {/* SHODAN OPEN PORTS & NETWORK SERVICES CARD */}
                {Boolean(
                  (Array.isArray((selectedEntity.metadata as any)?.ports) &&
                    (selectedEntity.metadata as any)?.ports.length > 0) ||
                    (selectedEntity.metadata as any)?.openPortCount !== undefined ||
                    (selectedEntity.metadata as any)?.port !== undefined ||
                    (selectedEntity.metadata as any)?.shodanUrl
                ) && (
                  <div className="bg-[#0a0a0a] border border-[#262626] rounded-card p-3 space-y-2.5 text-xs font-mono shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#1f1f1f] pb-2">
                      <div className="flex items-center gap-1.5 text-neutral-200 font-semibold">
                        <Server className="w-4 h-4 text-emerald-400" />
                        <span>Shodan Host & Port Intel</span>
                      </div>
                      {(selectedEntity.metadata as any)?.shodanUrl && (
                        <a
                          href={(selectedEntity.metadata as any).shodanUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white transition-colors"
                          title="Buka host di Shodan"
                        >
                          <span>Shodan Host</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {/* Open Ports Badges */}
                    {Array.isArray((selectedEntity.metadata as any)?.ports) && (
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1.5">
                          <span>Port Terbuka Ditemukan:</span>
                          <span className="font-semibold text-emerald-400">
                            {(selectedEntity.metadata as any).ports.length} port
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {((selectedEntity.metadata as any).ports as number[]).map((port) => {
                            const portLabel =
                              port === 80
                                ? 'HTTP'
                                : port === 443
                                ? 'HTTPS'
                                : port === 22
                                ? 'SSH'
                                : port === 21
                                ? 'FTP'
                                : port === 25
                                ? 'SMTP'
                                : port === 53
                                ? 'DNS'
                                : port === 3306
                                ? 'MySQL'
                                : port === 5432
                                ? 'Postgres'
                                : port === 8080
                                ? 'HTTP-Proxy'
                                : port === 8443
                                ? 'HTTPS-Alt'
                                : null;

                            return (
                              <span
                                key={port}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[#141414] hover:bg-[#1e1e1e] border border-[#2a2a2a] text-neutral-200 transition-colors"
                                title={`Port ${port}${portLabel ? ` (${portLabel})` : ''}`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                <span className="font-bold">{port}</span>
                                {portLabel && <span className="text-[10px] text-neutral-500">/{portLabel}</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Single Port detail for Technology entity */}
                    {(selectedEntity.metadata as any)?.port !== undefined &&
                      !Array.isArray((selectedEntity.metadata as any)?.ports) && (
                        <div className="flex items-center justify-between py-1 bg-[#121212] px-2.5 rounded border border-[#222222]">
                          <span className="text-neutral-400">Service Port:</span>
                          <span className="font-bold text-emerald-400">
                            {(selectedEntity.metadata as any).port}
                            {(selectedEntity.metadata as any).transport
                              ? `/${(selectedEntity.metadata as any).transport.toUpperCase()}`
                              : ''}
                          </span>
                        </div>
                      )}

                    {/* Infrastructure info */}
                    {((selectedEntity.metadata as any)?.asn || (selectedEntity.metadata as any)?.org) && (
                      <div className="pt-1 border-t border-[#1a1a1a] text-[11px] text-neutral-400 space-y-1">
                        {(selectedEntity.metadata as any)?.org && (
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Org/ISP:</span>
                            <span className="text-neutral-300 truncate max-w-[200px]">
                              {(selectedEntity.metadata as any).org}
                            </span>
                          </div>
                        )}
                        {(selectedEntity.metadata as any)?.asn && (
                          <div className="flex justify-between">
                            <span className="text-neutral-500">ASN:</span>
                            <span className="text-neutral-300">{(selectedEntity.metadata as any).asn}</span>
                          </div>
                        )}
                        {(selectedEntity.metadata as any)?.os && (
                          <div className="flex justify-between">
                            <span className="text-neutral-500">OS:</span>
                            <span className="text-neutral-300">{(selectedEntity.metadata as any).os}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 1. SUBDOMAIN TAKEOVER ALERT CARD */}
                {Boolean(
                  (selectedEntity.metadata as any)?.isVulnerableTakeover ||
                    (takeoverEvidence && (takeoverEvidence.metadata as any)?.severity === 'CRITICAL') ||
                    (takeoverEvidence && (takeoverEvidence.metadata as any)?.isDangling)
                ) && (
                  <div className="bg-rose-950/30 border border-rose-500/60 rounded-card p-3 space-y-2 text-xs font-mono shadow-sm">
                    <div className="flex items-center justify-between border-b border-rose-500/30 pb-2">
                      <div className="flex items-center gap-1.5 text-rose-300 font-bold">
                        <AlertOctagon className="w-4 h-4 text-rose-400 animate-pulse" />
                        <span>Subdomain Takeover Alert</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-rose-900/60 text-rose-200 border border-rose-500/50 font-bold uppercase">
                        Critical Risk
                      </span>
                    </div>

                    <div className="space-y-1.5 text-neutral-300 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Penyedia Layanan:</span>
                        <span className="font-semibold text-rose-300">
                          {(selectedEntity.metadata as any)?.providerName || (takeoverEvidence?.metadata as any)?.service || 'Cloud Host'}
                        </span>
                      </div>
                      {Boolean((selectedEntity.metadata as any)?.cnameTarget || (takeoverEvidence?.metadata as any)?.cname) && (
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Dangling CNAME:</span>
                          <span className="text-neutral-200 truncate max-w-[180px]">
                            {(selectedEntity.metadata as any)?.cnameTarget || (takeoverEvidence?.metadata as any)?.cname}
                          </span>
                        </div>
                      )}
                      {Boolean((selectedEntity.metadata as any)?.matchedSignature || (takeoverEvidence?.metadata as any)?.signature) && (
                        <div className="p-1.5 rounded bg-black/40 border border-rose-900/40 text-[10px] text-rose-200">
                          Signature: "{(selectedEntity.metadata as any)?.matchedSignature || (takeoverEvidence?.metadata as any)?.signature}"
                        </div>
                      )}
                      <p className="text-[10px] text-neutral-400 pt-1 border-t border-rose-950">
                        Rekomendasi: Hapus record CNAME DNS atau klaim ulang resource sebelum dieksploitasi pihak penyerang.
                      </p>
                    </div>
                  </div>
                )}

                {/* 2. DEEP DNS & EMAIL SPOOFING AUDIT CARD */}
                {Boolean(
                  dnsSecurityEvidence ||
                    (selectedEntity.metadata as any)?.emailSecurityGrade ||
                    (selectedEntity.metadata as any)?.spf
                ) && (
                  <div className="bg-[#0a0a0a] border border-[#262626] rounded-card p-3 space-y-2.5 text-xs font-mono shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#1f1f1f] pb-2">
                      <div className="flex items-center gap-1.5 text-neutral-200 font-semibold">
                        <ShieldCheck className="w-4 h-4 text-cyan-400" />
                        <span>DNS & Email Security Audit</span>
                      </div>
                      {Boolean((dnsSecurityEvidence?.metadata as any)?.emailSecurityGrade || (selectedEntity.metadata as any)?.emailSecurityGrade) && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            ['EXCELLENT', 'GOOD'].includes(
                              String((dnsSecurityEvidence?.metadata as any)?.emailSecurityGrade || (selectedEntity.metadata as any)?.emailSecurityGrade)
                            )
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          Grade {(dnsSecurityEvidence?.metadata as any)?.emailSecurityGrade || (selectedEntity.metadata as any)?.emailSecurityGrade}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 text-[11px]">
                      {/* SPF Row */}
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">SPF Mechanism:</span>
                        <span
                          className={`font-semibold ${
                            (dnsSecurityEvidence?.metadata as any)?.spf?.status === 'HARD_FAIL'
                              ? 'text-emerald-400'
                              : (dnsSecurityEvidence?.metadata as any)?.spf?.status === 'SOFT_FAIL'
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {(dnsSecurityEvidence?.metadata as any)?.spf?.status || 'NOT DETECTED'}
                        </span>
                      </div>

                      {/* DMARC Row */}
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">DMARC Policy:</span>
                        <span
                          className={`font-semibold ${
                            (dnsSecurityEvidence?.metadata as any)?.dmarc?.policy === 'REJECT'
                              ? 'text-emerald-400'
                              : (dnsSecurityEvidence?.metadata as any)?.dmarc?.policy === 'QUARANTINE'
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {(dnsSecurityEvidence?.metadata as any)?.dmarc?.policy
                            ? `p=${(dnsSecurityEvidence?.metadata as any)?.dmarc?.policy}`
                            : 'MISSING'}
                        </span>
                      </div>

                      {/* DKIM Selectors */}
                      {Array.isArray((dnsSecurityEvidence?.metadata as any)?.dkim?.activeSelectors) &&
                        (dnsSecurityEvidence?.metadata as any).dkim.activeSelectors.length > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">DKIM Selectors:</span>
                            <span className="text-cyan-400">
                              {(dnsSecurityEvidence?.metadata as any).dkim.activeSelectors.join(', ')}
                            </span>
                          </div>
                        )}

                      {/* CAA Authorized CAs */}
                      {Array.isArray((dnsSecurityEvidence?.metadata as any)?.caa?.authorizedCAs) &&
                        (dnsSecurityEvidence?.metadata as any).caa.authorizedCAs.length > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">CAA Permitted:</span>
                            <span className="text-neutral-300">
                              {(dnsSecurityEvidence?.metadata as any).caa.authorizedCAs.join(', ')}
                            </span>
                          </div>
                        )}

                      {/* Verified SaaS Cloud Services */}
                      {Array.isArray((dnsSecurityEvidence?.metadata as any)?.verifiedSaas) &&
                        (dnsSecurityEvidence?.metadata as any).verifiedSaas.length > 0 && (
                          <div className="pt-2 border-t border-[#1a1a1a]">
                            <div className="text-[10px] text-neutral-500 mb-1.5 uppercase">Layanan Cloud Terverifikasi (TXT):</div>
                            <div className="flex flex-wrap gap-1">
                              {((dnsSecurityEvidence?.metadata as any).verifiedSaas as Array<{ name: string }>).map((s, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#161616] border border-[#2a2a2a] text-neutral-200"
                                >
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                  <span>{s.name}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                )}

                {/* 3. SENSITIVE PARAMETER & ROUTE CLASSIFIER CARD */}
                {Boolean(
                  sensitiveParamEvidence ||
                    (selectedEntity.metadata as any)?.riskCategory ||
                    (selectedEntity.metadata as any)?.paramName
                ) && (
                  <div className="bg-[#0e0a05] border border-amber-500/30 rounded-card p-3 space-y-2 text-xs font-mono shadow-sm">
                    <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                      <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                        <span>Sensitive Param & Route Intel</span>
                      </div>
                      {Boolean((selectedEntity.metadata as any)?.severity) && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-amber-950/60 text-amber-300 border border-amber-500/40 font-bold uppercase">
                          {(selectedEntity.metadata as any).severity}
                        </span>
                      )}
                    </div>

                    {(selectedEntity.metadata as any)?.paramName && (
                      <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Parameter:</span>
                          <span className="text-amber-300 font-bold">?{(selectedEntity.metadata as any).paramName}=</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Kategori:</span>
                          <span className="text-neutral-300">{(selectedEntity.metadata as any).riskCategory}</span>
                        </div>
                        {(selectedEntity.metadata as any)?.label && (
                          <div className="text-[10px] text-neutral-400">{(selectedEntity.metadata as any).label}</div>
                        )}
                      </div>
                    )}

                    {/* Aggregate Findings List */}
                    {Array.isArray((sensitiveParamEvidence?.metadata as any)?.findings) &&
                      (sensitiveParamEvidence?.metadata as any).findings.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <div className="text-[10px] text-neutral-500 uppercase">
                            Parameter & Rute Berisiko Tinggi ({(sensitiveParamEvidence?.metadata as any).findings.length}):
                          </div>
                          <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                            {((sensitiveParamEvidence?.metadata as any).findings as Array<any>).slice(0, 8).map((f, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between p-1 rounded bg-black/40 border border-[#222222] text-[10px]"
                              >
                                <span className="text-neutral-200 truncate max-w-[170px]">{f.label}</span>
                                <span
                                  className={`px-1 rounded text-[9px] font-bold ${
                                    f.severity === 'CRITICAL'
                                      ? 'text-rose-400'
                                      : f.severity === 'HIGH'
                                      ? 'text-amber-400'
                                      : 'text-neutral-400'
                                  }`}
                                >
                                  {f.severity}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                )}

                {/* 4. WEB TECHNOLOGY STACK FINGERPRINT CARD */}
                {Boolean(
                  selectedEntity.type === 'TECHNOLOGY' ||
                    techEvidence ||
                    (selectedEntity.metadata as any)?.techName ||
                    (selectedEntity.metadata as any)?.category
                ) && (
                  <div className="bg-[#0a0a0a] border border-[#262626] rounded-card p-3 space-y-2 text-xs font-mono shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#1f1f1f] pb-2">
                      <div className="flex items-center gap-1.5 text-neutral-200 font-semibold">
                        <Cpu className="w-4 h-4 text-cyan-400" />
                        <span>Technology Stack Intel</span>
                      </div>
                      {(selectedEntity.metadata as any)?.category && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 font-bold uppercase">
                          {(selectedEntity.metadata as any).category}
                        </span>
                      )}
                    </div>

                    {/* Single Tech Detail */}
                    {(selectedEntity.metadata as any)?.techName && (
                      <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Komponen:</span>
                          <span className="text-neutral-200 font-bold">{(selectedEntity.metadata as any).techName}</span>
                        </div>
                        {(selectedEntity.metadata as any)?.version && (
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Versi:</span>
                            <span className="text-cyan-400 font-bold">{(selectedEntity.metadata as any).version}</span>
                          </div>
                        )}
                        {(selectedEntity.metadata as any)?.evidence && (
                          <div className="text-[10px] text-neutral-400 pt-1 border-t border-[#1a1a1a]">
                            {(selectedEntity.metadata as any).evidence}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Aggregate Tech List */}
                    {Array.isArray((techEvidence?.metadata as any)?.technologies) &&
                      (techEvidence?.metadata as any).technologies.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <div className="text-[10px] text-neutral-500 uppercase">
                            Stack Terdeteksi ({(techEvidence?.metadata as any).technologies.length}):
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pr-1">
                            {((techEvidence?.metadata as any).technologies as Array<any>).map((t, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#141414] border border-[#2a2a2a] text-neutral-200"
                              >
                                <span className="font-semibold">{t.name}</span>
                                {t.version && <span className="text-cyan-400 text-[9px]">{t.version}</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                )}

                {/* 5. SSL/TLS HEALTH & SAN CLUSTER CARD */}
                {Boolean(
                  tlsEvidence ||
                    selectedEntity.type === 'CERTIFICATE' ||
                    (selectedEntity.metadata as any)?.expiryStatus ||
                    (selectedEntity.metadata as any)?.sanClusterType
                ) && (
                  <div className="bg-[#0a0a0a] border border-[#262626] rounded-card p-3 space-y-2 text-xs font-mono shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#1f1f1f] pb-2">
                      <div className="flex items-center gap-1.5 text-neutral-200 font-semibold">
                        <Lock className="w-4 h-4 text-emerald-400" />
                        <span>SSL/TLS & SAN Cluster Intel</span>
                      </div>
                      {Boolean((selectedEntity.metadata as any)?.expiryStatus || (tlsEvidence?.metadata as any)?.primaryHealth?.expiryStatus) && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            String((selectedEntity.metadata as any)?.expiryStatus || (tlsEvidence?.metadata as any)?.primaryHealth?.expiryStatus) === 'VALID'
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                              : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          {(selectedEntity.metadata as any)?.expiryStatus || (tlsEvidence?.metadata as any)?.primaryHealth?.expiryStatus}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 text-[11px]">
                      {((selectedEntity.metadata as any)?.daysRemaining !== undefined ||
                        (tlsEvidence?.metadata as any)?.primaryHealth?.daysRemaining !== undefined) && (
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Masa Aktif Sertifikat:</span>
                          <span className="text-neutral-200 font-bold">
                            {(selectedEntity.metadata as any)?.daysRemaining ?? (tlsEvidence?.metadata as any)?.primaryHealth?.daysRemaining} hari tersisa
                          </span>
                        </div>
                      )}

                      {Boolean((selectedEntity.metadata as any)?.issuer || (tlsEvidence?.metadata as any)?.primaryHealth?.issuer) && (
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Issuer CA:</span>
                          <span className="text-neutral-300 truncate max-w-[180px]">
                            {(selectedEntity.metadata as any)?.issuer || (tlsEvidence?.metadata as any)?.primaryHealth?.issuer}
                          </span>
                        </div>
                      )}

                      {(selectedEntity.metadata as any)?.sanClusterType && (
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Klaster SAN:</span>
                          <span
                            className={`font-semibold ${
                              (selectedEntity.metadata as any).sanClusterType === 'SIBLING_DOMAIN'
                                ? 'text-cyan-400'
                                : 'text-neutral-300'
                            }`}
                          >
                            {(selectedEntity.metadata as any).sanClusterType === 'SIBLING_DOMAIN'
                              ? 'Corporate Sibling Domain'
                              : 'Subdomain'}
                          </span>
                        </div>
                      )}

                      {/* Sibling SAN domains list */}
                      {Array.isArray((tlsEvidence?.metadata as any)?.siblingDomains) &&
                        (tlsEvidence?.metadata as any).siblingDomains.length > 0 && (
                          <div className="pt-1.5 border-t border-[#1a1a1a]">
                            <div className="text-[10px] text-neutral-500 mb-1 uppercase">
                              Domain Saudara (Shared TLS SAN):
                            </div>
                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                              {((tlsEvidence?.metadata as any).siblingDomains as string[]).slice(0, 10).map((sd, i) => (
                                <span
                                  key={i}
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-[#161616] border border-[#2a2a2a] text-cyan-300"
                                >
                                  {sd}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                )}

                {/* CORPORATE HQ & PHYSICAL LOCATION CARD */}
                {Boolean(
                  (selectedEntity.metadata as any)?.isCompanyGeo ||
                  (selectedEntity.metadata as any)?.googleMapsUrl ||
                  (selectedEntity.metadata as any)?.collector === 'company-geo' ||
                  (selectedEntity.metadata as any)?.latitude !== undefined ||
                  (selectedEntity.metadata as any)?.lat !== undefined
                ) && (
                  <div className="bg-[#0a0a0a] border border-[#262626] rounded-card p-3 space-y-2.5 text-xs font-mono shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#1f1f1f] pb-2">
                      <div className="flex items-center gap-1.5 text-white font-semibold">
                        <MapPin className="w-4 h-4 text-white" />
                        <span>Corporate HQ & Physical Office</span>
                      </div>
                      {(selectedEntity.metadata as any)?.googleMapsUrl && (
                        <a
                          href={(selectedEntity.metadata as any).googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white transition-colors"
                          title="Buka lokasi di Google Maps"
                        >
                          <span>Google Maps</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    <div className="space-y-1.5 text-[11px]">
                      {Boolean((selectedEntity.metadata as any)?.address || (selectedEntity.metadata as any)?.fullAddress) && (
                        <div>
                          <span className="text-neutral-500 block mb-0.5">Alamat Fisik / Kantor:</span>
                          <span className="text-neutral-200 font-medium leading-relaxed block bg-[#121212] p-1.5 rounded border border-[#222222]">
                            {(selectedEntity.metadata as any)?.fullAddress || (selectedEntity.metadata as any)?.address}
                          </span>
                        </div>
                      )}

                      {((selectedEntity.metadata as any)?.lat !== undefined || (selectedEntity.metadata as any)?.latitude !== undefined) && (
                        <div className="flex justify-between items-center py-1">
                          <span className="text-neutral-500">Koordinat Presisi:</span>
                          <span className="text-white font-bold">
                            {Number((selectedEntity.metadata as any)?.lat ?? (selectedEntity.metadata as any)?.latitude).toFixed(5)},{' '}
                            {Number((selectedEntity.metadata as any)?.lng ?? (selectedEntity.metadata as any)?.longitude).toFixed(5)}
                          </span>
                        </div>
                      )}

                      {(selectedEntity.metadata as any)?.detectionMethod && (
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-neutral-500">Metode Deteksi:</span>
                          <span className="text-neutral-300 uppercase text-[10px] bg-[#141414] px-1.5 py-0.5 rounded border border-[#262626]">
                            {(selectedEntity.metadata as any).detectionMethod}
                          </span>
                        </div>
                      )}

                      {/* Direct Geo Map View Navigation Button */}
                      <div className="pt-2 space-y-1.5">
                        <button
                          onClick={() => {
                            if (selectedEntity?.id) {
                              setFocusedGeoNodeId(selectedEntity.id);
                            }
                            setActiveWorkspaceView('map');
                          }}
                          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-[#161616] hover:bg-[#222222] border border-[#2a2a2a] hover:border-neutral-400 text-white transition-colors text-xs font-sans font-semibold cursor-pointer shadow-sm"
                          title="Buka titik koordinat kantor ini di tab Geo Map"
                        >
                          <MapPin className="w-3.5 h-3.5 text-white shrink-0" />
                          <span>Lihat di Tab Geo Map</span>
                        </button>

                        {(selectedEntity.metadata as any)?.googleMapsUrl && (
                          <a
                            href={(selectedEntity.metadata as any).googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center justify-center gap-1.5 py-1 px-2.5 rounded bg-[#121212] hover:bg-[#181818] border border-[#222222] text-neutral-400 hover:text-white transition-colors text-[11px] font-sans"
                            title="Buka lokasi di Google Maps eksternal"
                          >
                            <span>Google Maps Eksternal ↗</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 6. WEB PATH & FILE DISCOVERY (DIRSEARCH) CARD */}
                {Boolean(
                  (selectedEntity.metadata as any)?.pathCategory ||
                  (selectedEntity.metadata as any)?.docKind === 'DIRSEARCH_FINDING' ||
                  (selectedEntity.metadata as any)?.docKind === 'DIRSEARCH_DOCUMENT' ||
                  (selectedEntity.metadata as any)?.collector === 'dirsearch' ||
                  (selectedEntity.metadata as any)?.source?.collector === 'dirsearch'
                ) && (
                  <div className="bg-[#0a0a0a] border border-[#262626] rounded-card p-3 space-y-2.5 text-xs font-mono shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#1f1f1f] pb-2">
                      <div className="flex items-center gap-1.5 text-neutral-200 font-semibold">
                        <FolderSearch className="w-4 h-4 text-violet-400" />
                        <span>Web Path & File Discovery Intel</span>
                      </div>
                      {Boolean((selectedEntity.metadata as any)?.riskLevel) && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            String((selectedEntity.metadata as any).riskLevel) === 'high'
                              ? 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                              : String((selectedEntity.metadata as any).riskLevel) === 'medium'
                              ? 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
                              : 'bg-neutral-900 text-neutral-300 border border-neutral-700'
                          }`}
                        >
                          Risk: {(selectedEntity.metadata as any).riskLevel}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 text-[11px]">
                      {/* Category Label */}
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Kategori File / Endpoint:</span>
                        <span className="text-neutral-200 font-semibold bg-[#141414] px-1.5 py-0.5 rounded border border-[#222222]">
                          {(selectedEntity.metadata as any)?.categoryLabel || (selectedEntity.metadata as any)?.pathCategory || 'Path Aktif'}
                        </span>
                      </div>

                      {/* HTTP Status */}
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Status Respon:</span>
                        <span className="text-emerald-400 font-bold">
                          HTTP {(selectedEntity.metadata as any)?.httpStatus || 200} OK
                        </span>
                      </div>

                      {/* Content Type */}
                      {Boolean((selectedEntity.metadata as any)?.contentType) && (
                        <div className="flex justify-between items-center">
                          <span className="text-neutral-500">Content-Type:</span>
                          <span className="text-neutral-300 font-mono text-[10px]">
                            {(selectedEntity.metadata as any).contentType}
                          </span>
                        </div>
                      )}

                      {/* File Size */}
                      {Boolean((selectedEntity.metadata as any)?.contentLength !== undefined) && (
                        <div className="flex justify-between items-center">
                          <span className="text-neutral-500">Ukuran File:</span>
                          <span className="text-neutral-300">
                            {Number((selectedEntity.metadata as any).contentLength) > 1024 * 1024
                              ? `${(Number((selectedEntity.metadata as any).contentLength) / (1024 * 1024)).toFixed(2)} MB`
                              : Number((selectedEntity.metadata as any).contentLength) > 1024
                              ? `${(Number((selectedEntity.metadata as any).contentLength) / 1024).toFixed(1)} KB`
                              : `${(selectedEntity.metadata as any).contentLength} bytes`}
                          </span>
                        </div>
                      )}

                      {/* Response Time */}
                      {Boolean((selectedEntity.metadata as any)?.responseTimeMs) && (
                        <div className="flex justify-between items-center">
                          <span className="text-neutral-500">Waktu Respon:</span>
                          <span className="text-neutral-400">
                            {(selectedEntity.metadata as any).responseTimeMs} ms
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
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
