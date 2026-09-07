import { memo, useState } from 'react';
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
  SEED: Target,
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

const ENTITY_ACCENT_COLORS: Partial<Record<EntityType, string>> = {
  URL: 'text-emerald-400',
  DOMAIN: 'text-sky-400',
  WEBSITE: 'text-sky-400',
  SUBDOMAIN: 'text-sky-400',
  IP_ADDRESS: 'text-cyan-400',
  DOCUMENT: 'text-amber-400',
  SEED: 'text-slate-300',
  PERSON: 'text-indigo-400',
  EMAIL: 'text-rose-400',
  PHONE: 'text-teal-400',
};

function formatEntityDisplay(type: EntityType, value: string, title?: string): { mainText: string; subText: string; queryParams?: string } {
  if (type === 'URL') {
    try {
      const u = new URL(value.startsWith('http') ? value : `https://${value}`);
      const fullPath = (u.pathname === '/' && !u.search ? '' : u.pathname) + u.search;
      const fullDisplay = `${u.hostname}${fullPath}`;

      const queryParams = u.search ? u.search : undefined;
      const sub = u.search
        ? `Param: ${u.search}`
        : u.pathname !== '/'
          ? `Path: ${u.pathname}`
          : u.hostname;

      return {
        mainText: fullDisplay,
        subText: sub,
        queryParams,
      };
    } catch {
      return { mainText: title || value, subText: 'URL' };
    }
  }
  if (type === 'DOCUMENT') {
    if (value.includes('#js-parameters')) {
      return { mainText: title || 'Peta Parameter', subText: 'Frontend JS' };
    }
    if (value.includes('?')) {
      try {
        const u = new URL(value);
        return {
          mainText: `${u.hostname}${u.pathname}${u.search}`,
          subText: `Param: ${u.search}`,
          queryParams: u.search,
        };
      } catch {
        return { mainText: title || value, subText: 'Parameter JS' };
      }
    }
    return { mainText: title || value, subText: 'Document' };
  }
  if (type === 'DOMAIN' || type === 'WEBSITE') {
    return { mainText: value, subText: 'Domain' };
  }
  if (type === 'IP_ADDRESS') {
    return { mainText: value, subText: 'IP Address' };
  }
  if (type === 'LOCATION' && title) {
    return {
      mainText: title.replace(/\s*\((country-level|Mr\.Holmes|area code.*?)\)/gi, '').trim(),
      subText: value,
    };
  }
  return {
    mainText: title || value,
    subText: type.replace(/_/g, ' ').toLowerCase(),
  };
}

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

  const { mainText, subText, queryParams } = formatEntityDisplay(entityType, value, title);

  const provenance =
    nodeData.metadata?.discoveredBy ||
    nodeData.metadata?.source?.transform ||
    nodeData.metadata?.source?.collector ||
    (isSeed ? 'Target Seed' : null);

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
      className={`relative select-none group ${
        isHovered || selected ? 'z-[99999]' : 'z-10'
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* NodeToolbar from @xyflow/react — Guaranteed Highest Stacking Layer Above All Nodes */}
      <NodeToolbar
        isVisible={isHovered}
        position={Position.Top}
        offset={10}
        className="!z-[99999] pointer-events-auto"
      >
        <div
          className="w-64 sm:w-72 bg-[#0c0c0c]/98 backdrop-blur-md border border-[#2a2a2a] rounded-lg shadow-[0_12px_32px_rgba(0,0,0,0.95)] p-3 text-left animate-in fade-in zoom-in-95 duration-100 relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Category Badge & Confidence Indicator */}
          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#1f1f1f]">
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded font-medium border bg-[#171717] text-neutral-200 border-[#2b2b2b] truncate">
                {isSeed ? 'SEED TARGET' : entityType.replace('_', ' ')}
              </span>
            </div>

            {!isSeed && (
              <ConfidenceBadge score={confidence} size="sm" showScore={true} />
            )}
          </div>

          {/* Entity Canonical Value */}
          <div className="flex items-start justify-between gap-1.5">
            <div className="font-mono text-xs font-medium text-white break-all leading-snug">
              {value}
            </div>
            <button
              onClick={handleCopy}
              className="p-1 text-neutral-400 hover:text-white rounded hover:bg-[#1a1a1a] transition-colors shrink-0 cursor-pointer"
              title="Salin nilai entitas"
            >
              {copied ? (
                <Check className="w-3 h-3 text-white" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>

          {/* Query Parameters Badge if present */}
          {queryParams && (
            <div className="mt-1.5 text-[9.5px] font-mono text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded break-all">
              <span className="text-emerald-400 font-semibold">Param:</span> {queryParams}
            </div>
          )}

          {/* Additional Title / Label if different */}
          {title && title !== value && !queryParams && (
            <div className="text-[10.5px] text-neutral-400 mt-1 line-clamp-2 leading-tight">
              {title}
            </div>
          )}

          {/* Direct URL Action Link */}
          {navUrl && (
            <a
              href={navUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center justify-between gap-1.5 text-[10.5px] font-mono text-neutral-200 bg-[#171717] hover:bg-[#222222] border border-[#2e2e2e] px-2 py-1 rounded transition-all group/link cursor-pointer"
              title={`Kunjungi ${navUrl}`}
            >
              <span className="truncate">Open URL ↗</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          )}

          {/* Provenance Trail */}
          {provenance && (
            <div className="flex items-center gap-1.5 mt-2 text-[9.5px] font-mono text-neutral-400 bg-[#121212] px-2 py-0.5 rounded border border-[#1f1f1f]">
              <Layers className="w-3 h-3 text-neutral-400 shrink-0" />
              <span className="truncate">Source: {provenance}</span>
            </div>
          )}

          {/* Metrics Footer */}
          <div className="flex items-center justify-between text-[9.5px] font-mono text-neutral-400 mt-2 pt-2 border-t border-[#1f1f1f]">
            <span>{Math.round(confidence)}% confidence</span>
            <div className="flex items-center gap-2">
              {typeof nodeData.evidenceCount === 'number' && nodeData.evidenceCount > 0 && (
                <span className="text-white font-medium">{nodeData.evidenceCount} evidence</span>
              )}
              {typeof nodeData.relationshipCount === 'number' && nodeData.relationshipCount > 0 && (
                <span className="text-neutral-300">{nodeData.relationshipCount} rel</span>
              )}
            </div>
          </div>

          {/* Pointer Triangle Arrow down to circle */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#0c0c0c] border-b border-r border-[#2a2a2a] rotate-45" />
        </div>
      </NodeToolbar>

      {/* Target and Source Handles on all four edges for crisp, non-tangling connections */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-[#475569] !border-0 !opacity-0 group-hover:!opacity-60"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-[#475569] !border-0 !opacity-0 group-hover:!opacity-60"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2 !h-2 !bg-[#475569] !border-0 !opacity-0 group-hover:!opacity-60"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2 !h-2 !bg-[#475569] !border-0 !opacity-0 group-hover:!opacity-60"
      />

      {/* Seed Target Node vs Discovered Entity Badge */}
      {isSeed ? (
        <div
          className={`px-3 py-2 rounded-md border transition-all duration-150 cursor-pointer flex items-center gap-2.5 min-w-[170px] max-w-[220px] select-none ${
            selected
              ? 'bg-[#161c28] border-white ring-1 ring-white/20 text-white shadow-lg'
              : isHovered
                ? 'bg-[#151922] border-slate-400 text-white shadow-md'
                : 'bg-[#11141c] border-slate-600/80 text-slate-100'
          }`}
        >
          <Target className="w-4 h-4 text-slate-300 shrink-0" />
          <div className="flex flex-col min-w-0 leading-tight">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[8.5px] font-mono uppercase tracking-wider font-semibold text-slate-400 bg-slate-800/80 px-1 py-0.2 rounded border border-slate-700/60">
                TARGET
              </span>
            </div>
            <span
              className="font-mono text-xs font-semibold text-white truncate max-w-[155px]"
              title={value}
            >
              {value}
            </span>
          </div>
        </div>
      ) : (
        <div
          className={`w-[190px] min-h-[42px] py-1.5 px-2.5 rounded-md border transition-all duration-150 cursor-pointer flex items-center gap-2 select-none ${
            selected
              ? 'bg-[#181d28] border-slate-300 ring-1 ring-white/20 text-white shadow-lg'
              : isHovered
                ? 'bg-[#141822] border-slate-500 text-slate-100 shadow-md'
                : 'bg-[#0f1218] border-[#222732] text-slate-300 hover:border-slate-500'
          }`}
        >
          <Icon className={`w-3.5 h-3.5 shrink-0 ${ENTITY_ACCENT_COLORS[entityType] || 'text-slate-400'}`} />

          <div className="flex flex-col min-w-0 flex-1 leading-tight">
            <span
              className="font-mono text-[10.5px] font-medium text-slate-200 truncate w-full"
              title={value}
            >
              {mainText}
            </span>
            <span
              className="font-mono text-[8.5px] text-slate-500 truncate w-full"
              title={subText}
            >
              {subText}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

EntityNode.displayName = 'EntityNode';
