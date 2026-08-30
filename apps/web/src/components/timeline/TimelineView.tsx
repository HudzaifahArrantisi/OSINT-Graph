import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAppStore } from '../../stores/appStore';
import { LoadingState } from '../ui/LoadingState';
import { EmptyState } from '../ui/EmptyState';
import {
  Clock,
  Filter,
  ChevronDown,
  ChevronUp,
  Globe2,
  Mail,
  User,
  Network,
  Link as LinkIcon,
  Building,
  FolderGit2,
  Share2,
  Cpu,
  Key,
  FileText,
  Phone,
  MapPin,
  Github,
  Gitlab,
  Youtube,
  Server,
  Radio,
  Target,
  Calendar,
  X,
} from 'lucide-react';
import type { TimelineEvent, Entity } from '@nexusgraph/shared';
import type { EntityType } from '@nexusgraph/shared';

// ─── Entity type icon mapping (matches EntityNode.tsx) ──────────────

const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  SEED: Radio,
  DOMAIN: Globe2,
  IP_ADDRESS: Network,
  EMAIL: Mail,
  USERNAME: User,
  URL: LinkIcon,
  SOCIAL_PROFILE: Share2,
  REPOSITORY: FolderGit2,
  ORGANIZATION: Building,
  CERTIFICATE: Key,
  TECHNOLOGY: Cpu,
  PERSON: User,
  DOCUMENT: FileText,
  PHONE: Phone,
  ADDRESS: MapPin,
  LOCATION: MapPin,
  GITHUB_PROFILE: Github,
  GITLAB_PROFILE: Gitlab,
  YOUTUBE_CHANNEL: Youtube,
  SUBDOMAIN: Globe2,
  MX_RECORD: Server,
  NS_RECORD: Server,
  PUBLIC_MENTION: LinkIcon,
  WEBSITE: Globe2,
};

// ─── Entity type color accents (matches EntityNode.tsx themes) ──────

const ENTITY_ACCENT_COLORS: Record<string, string> = {
  SEED: 'border-l-amber-400 bg-amber-500/5',
  DOMAIN: 'border-l-sky-400 bg-sky-500/5',
  SUBDOMAIN: 'border-l-sky-400 bg-sky-500/5',
  IP_ADDRESS: 'border-l-cyan-400 bg-cyan-500/5',
  EMAIL: 'border-l-emerald-400 bg-emerald-500/5',
  USERNAME: 'border-l-amber-400 bg-amber-500/5',
  URL: 'border-l-blue-400 bg-blue-500/5',
  SOCIAL_PROFILE: 'border-l-purple-400 bg-purple-500/5',
  CERTIFICATE: 'border-l-teal-400 bg-teal-500/5',
  TECHNOLOGY: 'border-l-amber-400 bg-amber-500/5',
  PERSON: 'border-l-indigo-400 bg-indigo-500/5',
  DOCUMENT: 'border-l-slate-400 bg-slate-500/5',
  PHONE: 'border-l-emerald-400 bg-emerald-500/5',
  LOCATION: 'border-l-orange-400 bg-orange-500/5',
  ADDRESS: 'border-l-orange-400 bg-orange-500/5',
  GITHUB_PROFILE: 'border-l-slate-300 bg-slate-500/5',
  GITLAB_PROFILE: 'border-l-orange-400 bg-orange-500/5',
  YOUTUBE_CHANNEL: 'border-l-red-400 bg-red-500/5',
  REPOSITORY: 'border-l-slate-300 bg-slate-500/5',
  ORGANIZATION: 'border-l-indigo-400 bg-indigo-500/5',
  MX_RECORD: 'border-l-cyan-400 bg-cyan-500/5',
  NS_RECORD: 'border-l-cyan-400 bg-cyan-500/5',
  PUBLIC_MENTION: 'border-l-blue-400 bg-blue-500/5',
  WEBSITE: 'border-l-sky-400 bg-sky-500/5',
};

const ENTITY_BADGE_COLORS: Record<string, string> = {
  SEED: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  DOMAIN: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  SUBDOMAIN: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  IP_ADDRESS: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  EMAIL: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  USERNAME: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  URL: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  SOCIAL_PROFILE: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
  CERTIFICATE: 'bg-teal-500/15 text-teal-300 border-teal-500/25',
  TECHNOLOGY: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  PERSON: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  DOCUMENT: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
  PHONE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  LOCATION: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  ADDRESS: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  GITHUB_PROFILE: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
  GITLAB_PROFILE: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  YOUTUBE_CHANNEL: 'bg-red-500/15 text-red-300 border-red-500/25',
  REPOSITORY: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
  ORGANIZATION: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  MX_RECORD: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  NS_RECORD: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  PUBLIC_MENTION: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  WEBSITE: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
};

const DEFAULT_ACCENT = 'border-l-slate-500 bg-slate-500/5';
const DEFAULT_BADGE = 'bg-slate-500/15 text-slate-300 border-slate-500/25';

// ─── Helpers ────────────────────────────────────────────────────────

function formatDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - eventDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function groupEventsByDay(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const day = new Date(event.event_at).toISOString().slice(0, 10);
    const group = groups.get(day) || [];
    group.push(event);
    groups.set(day, group);
  }
  return groups;
}

// ─── Component ──────────────────────────────────────────────────────

interface TimelineViewProps {
  caseId: string;
}

export function TimelineView({ caseId }: TimelineViewProps) {
  const { setSelectedNodeId, setSelectedEdgeId } = useAppStore();

  const [filterEntityType, setFilterEntityType] = useState<string>('');
  const [filterOpen, setFilterOpen] = useState(false);

  // Fetch timeline events
  const {
    data: timelineEvents = [],
    isLoading,
    error,
  } = useQuery<TimelineEvent[]>({
    queryKey: ['timeline', caseId],
    queryFn: () => api.timeline.list(caseId),
    enabled: !!caseId,
  });

  // Fetch entities for enrichment (entity type, value context)
  const { data: entities = [] } = useQuery<Entity[]>({
    queryKey: ['entities', caseId],
    queryFn: () => api.entities.list(caseId),
    enabled: !!caseId,
  });

  // Build entity lookup
  const entityMap = useMemo(() => {
    const map = new Map<string, Entity>();
    for (const e of entities) map.set(e.id, e);
    return map;
  }, [entities]);

  // Collect unique entity types from timeline events for the filter
  const availableEntityTypes = useMemo(() => {
    const types = new Set<string>();
    for (const event of timelineEvents) {
      if (event.entity_id) {
        const entity = entityMap.get(event.entity_id);
        if (entity) types.add(entity.type);
      }
    }
    return Array.from(types).sort();
  }, [timelineEvents, entityMap]);

  // Filter and sort events
  const filteredEvents = useMemo(() => {
    let events = [...timelineEvents];

    if (filterEntityType) {
      events = events.filter((e) => {
        if (!e.entity_id) return false;
        const entity = entityMap.get(e.entity_id);
        return entity?.type === filterEntityType;
      });
    }

    // Sort descending (newest first)
    events.sort((a, b) => new Date(b.event_at).getTime() - new Date(a.event_at).getTime());
    return events;
  }, [timelineEvents, filterEntityType, entityMap]);

  // Group by day
  const groupedEvents = useMemo(() => groupEventsByDay(filteredEvents), [filteredEvents]);

  const handleEntityClick = (entityId: string | null) => {
    if (entityId) {
      setSelectedNodeId(entityId);
      setSelectedEdgeId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingState message="Loading investigation timeline..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          icon={<Clock className="w-8 h-8 text-status-danger" />}
          title="Failed to load timeline"
          description={String(error)}
        />
      </div>
    );
  }

  if (timelineEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          icon={<Clock className="w-10 h-10 text-slate-500" />}
          title="No timeline events yet"
          description="Run a discovery or collector to generate timeline events. Events are created automatically when entities are discovered."
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Timeline Header & Filters */}
      <div className="shrink-0 px-6 py-3 border-b border-border-subtle bg-surface/50 backdrop-blur-sm">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-text">Investigation Timeline</h3>
            <span className="text-[10px] font-mono text-text-muted bg-surface-2 px-1.5 py-0.5 rounded border border-border-subtle">
              {filteredEvents.length} / {timelineEvents.length} events
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Entity Type Filter */}
            <div className="relative">
              <button
                onClick={() => setFilterOpen(!filterOpen)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  filterEntityType
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-surface-2 border-border-subtle text-text-muted hover:text-text hover:border-border'
                }`}
              >
                <Filter className="w-3 h-3" />
                <span>{filterEntityType || 'All Types'}</span>
                {filterEntityType ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterEntityType('');
                    }}
                    className="p-0.5 hover:bg-surface-3 rounded"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>

              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-surface border border-border-subtle rounded-lg shadow-xl overflow-hidden">
                    <div className="p-1 max-h-64 overflow-y-auto">
                      <button
                        onClick={() => {
                          setFilterEntityType('');
                          setFilterOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors ${
                          !filterEntityType
                            ? 'bg-primary/10 text-primary'
                            : 'text-text-secondary hover:bg-surface-2'
                        }`}
                      >
                        All Types
                      </button>
                      {availableEntityTypes.map((type) => {
                        const Icon = ENTITY_ICONS[type] || Clock;
                        return (
                          <button
                            key={type}
                            onClick={() => {
                              setFilterEntityType(type);
                              setFilterOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs rounded-md flex items-center gap-2 transition-colors ${
                              filterEntityType === type
                                ? 'bg-primary/10 text-primary'
                                : 'text-text-secondary hover:bg-surface-2'
                            }`}
                          >
                            <Icon className="w-3 h-3" />
                            <span className="font-mono text-[10px] uppercase">{type}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto relative">
          {/* Vertical spine */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border-subtle" />

          {filteredEvents.length === 0 && filterEntityType && (
            <div className="text-center py-12">
              <p className="text-xs text-text-muted">
                No timeline events found for entity type <span className="font-mono text-text">{filterEntityType}</span>
              </p>
            </div>
          )}

          {Array.from(groupedEvents.entries()).map(([dayKey, events]) => (
            <div key={dayKey} className="mb-6">
              {/* Day Header */}
              <div className="flex items-center gap-3 mb-3 relative">
                <div className="w-10 h-10 rounded-lg bg-surface-2 border border-border-subtle flex items-center justify-center shrink-0 z-10">
                  <Calendar className="w-4 h-4 text-slate-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-text">{formatDateGroup(dayKey)}</div>
                  <div className="text-[10px] font-mono text-text-muted">{dayKey}</div>
                </div>
                <div className="text-[10px] font-mono text-text-muted bg-surface-2 px-1.5 py-0.5 rounded border border-border-subtle">
                  {events.length} {events.length === 1 ? 'event' : 'events'}
                </div>
              </div>

              {/* Events in this day */}
              <div className="space-y-2 ml-[19px] pl-6 border-l border-transparent">
                {events.map((event) => {
                  const linkedEntity = event.entity_id ? entityMap.get(event.entity_id) : null;
                  const entityType = linkedEntity?.type || '';
                  const Icon = ENTITY_ICONS[entityType] || Clock;
                  const accentClass = ENTITY_ACCENT_COLORS[entityType] || DEFAULT_ACCENT;
                  const badgeClass = ENTITY_BADGE_COLORS[entityType] || DEFAULT_BADGE;

                  return (
                    <div
                      key={event.id}
                      className={`relative bg-surface border border-border-subtle rounded-card p-3 transition-all hover:border-border cursor-default border-l-2 ${accentClass}`}
                    >
                      {/* Timeline dot */}
                      <div className="absolute -left-[31px] top-4 w-2.5 h-2.5 rounded-full bg-surface-2 border-2 border-border z-10" />

                      {/* Header row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <div className="p-1 rounded bg-surface-2 border border-border-subtle shrink-0 mt-0.5">
                            <Icon className="w-3 h-3 text-slate-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-text leading-tight">
                              {event.title}
                            </div>
                            {event.description && (
                              <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
                                {event.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <span className="text-[10px] font-mono text-text-muted whitespace-nowrap shrink-0">
                          {formatTime(event.event_at)}
                        </span>
                      </div>

                      {/* Entity badge (clickable — focuses node in graph) */}
                      {linkedEntity && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => handleEntityClick(event.entity_id)}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono uppercase rounded border transition-colors hover:opacity-80 ${badgeClass}`}
                            title={`Focus "${linkedEntity.value}" in graph`}
                          >
                            <Target className="w-2.5 h-2.5" />
                            <span>{linkedEntity.type}</span>
                          </button>
                          <span className="text-[10px] font-mono text-text-muted truncate max-w-xs" title={linkedEntity.value}>
                            {linkedEntity.value}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
