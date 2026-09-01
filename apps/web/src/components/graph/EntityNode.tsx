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

  const isLargeGraph = Boolean(nodeData.isLargeGraph);
  const hideLabel = Boolean(nodeData.hideLabelByDefault) && !isHovered && !selected && !isSeed;

  const nodeSize = isSeed ? 'w-12 h-12' : isLargeGraph ? 'w-8 h-8' : 'w-9 h-9';
  const iconSize = isSeed ? 'w-5 h-5' : isLargeGraph ? 'w-3.5 h-3.5' : 'w-3.5 h-3.5';

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

          {/* Additional Title / Label if different */}
          {title && title !== value && (
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

      {/* Main Monochrome Node Badge */}
      <div
        className={`rounded-full flex items-center justify-center border transition-all duration-100 cursor-pointer relative ${nodeSize} ${
          isSeed
            ? 'bg-[#181818] border-white text-white shadow-md'
            : 'bg-[#0f0f0f] border-[#2c2c2c] text-neutral-300'
        } ${
          selected
            ? 'ring-1 ring-white border-white scale-105 shadow-lg bg-[#1a1a1a] text-white'
            : isHovered
              ? 'scale-105 border-neutral-400 bg-[#161616] text-white'
              : ''
        }`}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!w-1 !h-1 !bg-neutral-600 !border-0 !opacity-0 group-hover:!opacity-40"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-1 !h-1 !bg-neutral-600 !border-0 !opacity-0 group-hover:!opacity-40"
        />
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          className="!w-1 !h-1 !bg-neutral-600 !border-0 !opacity-0 group-hover:!opacity-40"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          className="!w-1 !h-1 !bg-neutral-600 !border-0 !opacity-0 group-hover:!opacity-40"
        />

        <Icon className={`${iconSize} transition-transform duration-150`} />

        {/* Seed Target Indicator Badge */}
        {isSeed && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white text-black border border-black items-center justify-center">
              <Target className="w-2 h-2 text-black" strokeWidth={3} />
            </span>
          </span>
        )}
      </div>

      {/* Underneath Text Label & Category */}
      {!hideLabel && (
        <div className="mt-1 flex flex-col items-center max-w-[120px] pointer-events-none text-center animate-in fade-in duration-75">
          <span
            className="font-mono text-[9px] leading-tight truncate w-full px-1.5 py-0.5 rounded text-neutral-300 bg-[#0c0c0c]/90 border border-[#222222]"
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
