import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps, NodeToolbar } from '@xyflow/react';
import { EntityType } from '@nexusgraph/shared';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { getNavigableUrl } from '../detail/EntityDetailPanel';
import {
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
  HelpCircle,
  Github,
  Gitlab,
  Youtube,
  Radio,
  Server,
  Layers,
  ExternalLink,
  Copy,
  Check,
  Target,
} from 'lucide-react';

const ENTITY_ICONS: Record<EntityType, React.ComponentType<{ className?: string }>> = {
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

const ENTITY_THEMES: Record<
  string,
  {
    border: string;
    bg: string;
    iconColor: string;
    glow: string;
    badge: string;
    labelColor: string;
    accentColor: string;
  }
> = {
  SEED: {
    border: 'border-amber-500/70',
    bg: 'bg-[#1e1709]',
    iconColor: 'text-amber-400',
    glow: 'shadow-sm',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    labelColor: 'text-amber-200 font-semibold',
    accentColor: 'border-t-amber-400',
  },
  DOMAIN: {
    border: 'border-sky-600/70',
    bg: 'bg-[#0b1424]',
    iconColor: 'text-sky-400',
    glow: 'shadow-sm',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-sky-400',
  },
  SUBDOMAIN: {
    border: 'border-sky-600/70',
    bg: 'bg-[#0b1424]',
    iconColor: 'text-sky-400',
    glow: 'shadow-sm',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-sky-400',
  },
  IP_ADDRESS: {
    border: 'border-cyan-600/70',
    bg: 'bg-[#081720]',
    iconColor: 'text-cyan-400',
    glow: 'shadow-sm',
    badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-cyan-400',
  },
  EMAIL: {
    border: 'border-violet-600/70',
    bg: 'bg-[#130d22]',
    iconColor: 'text-violet-400',
    glow: 'shadow-sm',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-violet-400',
  },
  USERNAME: {
    border: 'border-amber-600/70',
    bg: 'bg-[#181309]',
    iconColor: 'text-amber-400',
    glow: 'shadow-sm',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-amber-400',
  },
  URL: {
    border: 'border-blue-600/70',
    bg: 'bg-[#0b1326]',
    iconColor: 'text-blue-400',
    glow: 'shadow-sm',
    badge: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-blue-400',
  },
  SOCIAL_PROFILE: {
    border: 'border-purple-600/70',
    bg: 'bg-[#150d24]',
    iconColor: 'text-purple-400',
    glow: 'shadow-sm',
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-purple-400',
  },
  CERTIFICATE: {
    border: 'border-teal-600/70',
    bg: 'bg-[#081919]',
    iconColor: 'text-teal-400',
    glow: 'shadow-sm',
    badge: 'bg-teal-500/15 text-teal-300 border-teal-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-teal-400',
  },
  TECHNOLOGY: {
    border: 'border-amber-600/70',
    bg: 'bg-[#181309]',
    iconColor: 'text-amber-400',
    glow: 'shadow-sm',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-amber-400',
  },
  PERSON: {
    border: 'border-indigo-600/70',
    bg: 'bg-[#0f1126]',
    iconColor: 'text-indigo-400',
    glow: 'shadow-sm',
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-indigo-400',
  },
  DOCUMENT: {
    border: 'border-slate-600/70',
    bg: 'bg-[#0f141e]',
    iconColor: 'text-slate-300',
    glow: 'shadow-sm',
    badge: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-slate-400',
  },
  PHONE: {
    border: 'border-emerald-600/70',
    bg: 'bg-[#091a14]',
    iconColor: 'text-emerald-400',
    glow: 'shadow-sm',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-emerald-400',
  },
  LOCATION: {
    border: 'border-orange-600/70',
    bg: 'bg-[#1c0f08]',
    iconColor: 'text-orange-400',
    glow: 'shadow-sm',
    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-orange-400',
  },
  ADDRESS: {
    border: 'border-orange-600/70',
    bg: 'bg-[#1c0f08]',
    iconColor: 'text-orange-400',
    glow: 'shadow-sm',
    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-orange-400',
  },
  GITHUB_PROFILE: {
    border: 'border-violet-600/70',
    bg: 'bg-[#130d22]',
    iconColor: 'text-violet-400',
    glow: 'shadow-sm',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-violet-400',
  },
  GITLAB_PROFILE: {
    border: 'border-orange-600/70',
    bg: 'bg-[#1c0e08]',
    iconColor: 'text-orange-400',
    glow: 'shadow-sm',
    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-orange-400',
  },
  YOUTUBE_CHANNEL: {
    border: 'border-red-600/70',
    bg: 'bg-[#1c0909]',
    iconColor: 'text-red-400',
    glow: 'shadow-sm',
    badge: 'bg-red-500/15 text-red-300 border-red-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-red-400',
  },
  MX_RECORD: {
    border: 'border-teal-600/70',
    bg: 'bg-[#081817]',
    iconColor: 'text-teal-400',
    glow: 'shadow-sm',
    badge: 'bg-teal-500/15 text-teal-300 border-teal-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-teal-400',
  },
  NS_RECORD: {
    border: 'border-cyan-600/70',
    bg: 'bg-[#08171f]',
    iconColor: 'text-cyan-400',
    glow: 'shadow-sm',
    badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-cyan-400',
  },
  PUBLIC_MENTION: {
    border: 'border-blue-600/70',
    bg: 'bg-[#0b1326]',
    iconColor: 'text-blue-400',
    glow: 'shadow-sm',
    badge: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
    labelColor: 'text-slate-200',
    accentColor: 'border-t-blue-400',
  },
};

export const EntityNode = memo(({ data, selected }: NodeProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const nodeData = (data || {}) as Record<string, any>;
  const entityType = (nodeData.entityType || 'DOMAIN') as EntityType;
  const value = String(nodeData.value || nodeData.label || 'Entity');
  const title = nodeData.title;
  const confidence = nodeData.confidence || 50;
  const isSeed = nodeData.isSeed || entityType === 'SEED';

  const Icon = ENTITY_ICONS[entityType] || HelpCircle;
  const theme = ENTITY_THEMES[entityType] || {
    border: 'border-slate-500',
    bg: 'bg-[#0f172a]',
    iconColor: 'text-slate-300',
    glow: 'shadow-[0_0_10px_rgba(148,163,184,0.25)]',
    badge: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    labelColor: 'text-slate-300',
    accentColor: 'border-t-slate-400',
  };

  const isLargeGraph = Boolean(nodeData.isLargeGraph);
  const hideLabel = Boolean(nodeData.hideLabelByDefault) && !isHovered && !selected && !isSeed;

  const nodeSize = isSeed ? 'w-14 h-14' : isLargeGraph ? 'w-9 h-9' : 'w-10 h-10';
  const iconSize = isSeed ? 'w-6 h-6' : isLargeGraph ? 'w-4 h-4' : 'w-4 h-4';

  const provenance =
    nodeData.metadata?.discoveredBy ||
    nodeData.metadata?.source?.transform ||
    nodeData.metadata?.source?.collector ||
    (isSeed ? 'Investigation Target Seed' : null);

  const navUrl = getNavigableUrl({
    type: entityType,
    value,
    metadata: nodeData.metadata,
  });

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsHovered(true);
    const parentNodeEl = e.currentTarget.closest('.react-flow__node') as HTMLElement | null;
    if (parentNodeEl) {
      parentNodeEl.style.zIndex = '99999';
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsHovered(false);
    const parentNodeEl = e.currentTarget.closest('.react-flow__node') as HTMLElement | null;
    if (parentNodeEl) {
      parentNodeEl.style.zIndex = selected ? '100' : '';
    }
  };

  return (
    <div
      className={`relative flex flex-col items-center select-none group ${
        isHovered || selected ? 'z-[99999]' : 'z-10'
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* NodeToolbar from @xyflow/react — Guaranteed Highest Stacking Layer Above All Nodes */}
      <NodeToolbar
        isVisible={isHovered}
        position={Position.Top}
        offset={14}
        className="!z-[99999] pointer-events-auto"
      >
        <div
          className="w-72 sm:w-80 bg-[#0d1422]/98 backdrop-blur-xl border border-[#22334d] rounded-lg shadow-[0_16px_40px_rgba(0,0,0,0.95)] p-3 text-left animate-in fade-in zoom-in-95 duration-100 relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Category Badge & Confidence Indicator */}
          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#1b2a40]">
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon className={`w-3.5 h-3.5 ${theme.iconColor} shrink-0`} />
              <span
                className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded font-bold border truncate ${
                  isSeed
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : theme.badge
                }`}
              >
                {isSeed ? 'SEED TARGET' : entityType.replace('_', ' ')}
              </span>
            </div>

            {!isSeed && (
              <ConfidenceBadge score={confidence} size="sm" showScore={true} />
            )}
          </div>

          {/* Entity Canonical Value */}
          <div className="flex items-start justify-between gap-1.5">
            <div className="font-mono text-xs font-semibold text-slate-100 break-all leading-snug">
              {value}
            </div>
            <button
              onClick={handleCopy}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors shrink-0"
              title="Salin nilai entitas"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>

          {/* Additional Title / Label if different */}
          {title && title !== value && (
            <div className="text-[10.5px] text-slate-400 mt-1 line-clamp-2 leading-tight">
              {title}
            </div>
          )}

          {/* Direct URL Action Link */}
          {navUrl && (
            <a
              href={navUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 flex items-center justify-between gap-1.5 text-[11px] font-mono text-sky-300 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 px-2 py-1 rounded transition-all shadow-sm group/link cursor-pointer"
              title={`Kunjungi ${navUrl}`}
            >
              <span className="truncate font-semibold">Buka URL / Target ↗</span>
              <ExternalLink className="w-3 h-3 shrink-0 group-hover/link:translate-x-0.5 transition-transform" />
            </a>
          )}

          {/* Provenance Trail */}
          {provenance && (
            <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-slate-400 bg-[#121c2d] px-2 py-1 rounded border border-[#1b2a40]">
              <Layers className="w-3 h-3 text-sky-400 shrink-0" />
              <span className="truncate">Source: {provenance}</span>
            </div>
          )}

          {/* Metrics Footer */}
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-2 pt-2 border-t border-[#1b2a40]">
            <span className="text-slate-500">{Math.round(confidence)}% confidence</span>
            <div className="flex items-center gap-2">
              {typeof nodeData.evidenceCount === 'number' && nodeData.evidenceCount > 0 && (
                <span className="text-emerald-400 font-semibold">{nodeData.evidenceCount} evidence</span>
              )}
              {typeof nodeData.relationshipCount === 'number' && nodeData.relationshipCount > 0 && (
                <span className="text-sky-400 font-semibold">{nodeData.relationshipCount} rel</span>
              )}
            </div>
          </div>

          {/* Pointer Triangle Arrow down to circle */}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#0d1422] border-b border-r border-[#22334d] rotate-45" />
        </div>
      </NodeToolbar>

      {/* Main Circular Node Badge */}
      <div
        className={`rounded-full flex items-center justify-center border transition-all duration-150 cursor-pointer relative ${nodeSize} ${
          theme.bg
        } ${theme.border} ${
          selected
            ? 'ring-2 ring-sky-400 border-sky-300 scale-105 shadow-lg'
            : isHovered
              ? 'scale-105 border-slate-400 shadow-md'
              : ''
        }`}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!w-1.5 !h-1.5 !bg-slate-500 !border !border-[#0d121c] !opacity-0 group-hover:!opacity-60 transition-opacity"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-1.5 !h-1.5 !bg-slate-500 !border !border-[#0d121c] !opacity-0 group-hover:!opacity-60 transition-opacity"
        />
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          className="!w-1.5 !h-1.5 !bg-slate-500 !border !border-[#0d121c] !opacity-0 group-hover:!opacity-60 transition-opacity"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          className="!w-1.5 !h-1.5 !bg-slate-500 !border !border-[#0d121c] !opacity-0 group-hover:!opacity-60 transition-opacity"
        />

        <Icon className={`${iconSize} ${theme.iconColor} transition-transform duration-200 group-hover:scale-110`} />

        {/* Seed Target Indicator Badge */}
        {isSeed && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 text-black border border-[#0d1422] items-center justify-center shadow-sm">
              <Target className="w-2.5 h-2.5 text-black" strokeWidth={2.5} />
            </span>
          </span>
        )}
      </div>

      {/* Underneath Text Label & Category */}
      {!hideLabel && (
        <div className="mt-1.5 flex flex-col items-center max-w-[130px] pointer-events-none text-center animate-in fade-in duration-75">
          <span
            className={`font-mono text-[9.5px] leading-tight truncate w-full px-1.5 py-0.5 rounded text-slate-200 bg-[#0c1118]/85 border border-slate-700/40`}
            title={title || value}
          >
            {entityType === 'LOCATION' && title
              ? title.replace(/\s*\((country-level|Mr\.Holmes|area code.*?)\)/gi, '').trim()
              : value}
          </span>
        </div>
      )}
    </div>
  );
});

EntityNode.displayName = 'EntityNode';
