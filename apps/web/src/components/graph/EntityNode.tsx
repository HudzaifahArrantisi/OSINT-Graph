import { memo, useState } from 'react';
import { Handle, Position, NodeProps, NodeToolbar } from '@xyflow/react';
import {
  EntityType,
  getNodeEngineModule,
  EngineModuleMeta,
} from '@nexusgraph/shared';
import { useAppStore } from '../../stores/appStore';
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
  Archive,
  Code2,
  ShieldAlert,
  Radar,
  AlertTriangle,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';

const ENGINE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Archive,
  Code2,
  ShieldAlert,
  Radar,
  Cpu,
  AlertTriangle,
  ShieldCheck,
  Globe2,
  Key,
  Radio,
  Server,
  Building,
  Search: LinkIcon,
  Mail,
  Target,
  Layers,
  Network,
  MapPin,
};

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
  CLOUD_BUCKET: Archive,
  IDENTITY_PROVIDER: Key,
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
    return { mainText: value, subText: 'IPv4/IPv6' };
  }
  if (type === 'CERTIFICATE') {
    return { mainText: title || value, subText: 'SSL/TLS Cert' };
  }
  if (type === 'TECHNOLOGY') {
    return { mainText: title || value, subText: 'Tech Stack' };
  }
  if (type === 'ORGANIZATION') {
    return { mainText: title || value, subText: 'Organization' };
  }
  if (type === 'LOCATION' || type === 'ADDRESS') {
    return {
      mainText: title || value.split(':').pop() || value,
      subText: 'Lokasi Kantor / Maps',
    };
  }
  return {
    mainText: title || value,
    subText: type.replace('_', ' ').toLowerCase(),
  };
}

export const EntityNode = memo(({ id, data, selected }: NodeProps) => {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const setActiveWorkspaceView = useAppStore((s) => s.setActiveWorkspaceView);
  const setFocusedGeoNodeId = useAppStore((s) => s.setFocusedGeoNodeId);
  const setSelectedNodeId = useAppStore((s) => s.setSelectedNodeId);

  const nodeData = (data || {}) as Record<string, any>;
  const entityType = (nodeData.entityType as EntityType) || 'DOMAIN';
  const value = String(nodeData.value || nodeData.label || '');
  const title = nodeData.title ? String(nodeData.title) : undefined;
  const isSeed = Boolean(nodeData.isSeed || entityType === 'SEED');
  const confidence = typeof nodeData.confidence === 'number' ? nodeData.confidence : 50;

  // Resolve Engine Module Metadata
  const engineMeta: EngineModuleMeta = getNodeEngineModule(nodeData);
  const EngineIcon = (engineMeta.iconName && ENGINE_ICONS[engineMeta.iconName]) || Layers;

  const Icon = ENTITY_ICONS[entityType] || Globe2;
  const { mainText, subText, queryParams } = formatEntityDisplay(entityType, value, title);

  const isGeoLocation = Boolean(
    nodeData.metadata?.isCompanyGeo ||
    nodeData.metadata?.googleMapsUrl ||
    entityType === 'LOCATION' ||
    entityType === 'ADDRESS' ||
    nodeData.metadata?.lat !== undefined ||
    nodeData.metadata?.latitude !== undefined
  );

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
          className="w-68 sm:w-76 bg-[#0a0a0a]/98 backdrop-blur-md border border-[#262626] rounded-md shadow-[0_12px_32px_rgba(0,0,0,0.95)] p-3 text-left animate-in fade-in zoom-in-95 duration-100 relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Engine Module Banner */}
          {!isSeed && (
            <div
              className="flex items-center justify-between px-2 py-1 rounded bg-[#141414] border border-[#262626] mb-2"
              style={{ color: engineMeta.color }}
            >
              <div className="flex items-center gap-1.5 font-mono text-[10px] font-medium min-w-0 truncate">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: engineMeta.color }}
                />
                <EngineIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{engineMeta.name}</span>
              </div>
              <span className="text-[8px] font-mono uppercase px-1 py-0.2 rounded bg-[#0a0a0a] text-neutral-400 shrink-0 border border-[#222222]">
                {engineMeta.category}
              </span>
            </div>
          )}

          {/* Top Category Badge & Confidence Indicator */}
          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#1f1f1f]">
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded font-medium border bg-[#141414] text-neutral-300 border-[#262626] truncate">
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
            <div className="mt-1.5 text-[9.5px] font-mono text-neutral-300 bg-[#141414] border border-[#262626] px-2 py-0.5 rounded break-all">
              <span className="text-neutral-400 font-semibold">Param:</span> {queryParams}
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
              className="mt-2 flex items-center justify-between gap-1.5 text-[10.5px] font-mono text-neutral-300 hover:text-white bg-[#141414] hover:bg-[#1f1f1f] border border-[#262626] hover:border-[#383838] px-2 py-1 rounded transition-colors group/link cursor-pointer"
              title={`Kunjungi ${navUrl}`}
            >
              <span className="truncate">Open URL ↗</span>
              <ExternalLink className="w-3 h-3 shrink-0 text-neutral-400 group-hover/link:text-white" />
            </a>
          )}

          {/* Direct Geo Map Action for Corporate HQ / Location Nodes */}
          {isGeoLocation && (
            <div className="mt-2 space-y-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFocusedGeoNodeId(id);
                  setSelectedNodeId(id);
                  setActiveWorkspaceView('map');
                }}
                className="w-full flex items-center justify-between gap-1.5 text-[10.5px] font-mono text-neutral-200 hover:text-white bg-[#161616] hover:bg-[#222222] border border-[#2a2a2a] hover:border-neutral-400 px-2 py-1 rounded transition-colors group/geomap cursor-pointer shadow-sm"
                title="Tampilkan dan fokuskan pada Tab Geo Map"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-white shrink-0" />
                  <span className="truncate font-semibold font-sans">Lihat di Tab Geo Map</span>
                </div>
                <ChevronRight className="w-3 h-3 text-neutral-400 group-hover/geomap:text-white group-hover/geomap:translate-x-0.5 transition-transform shrink-0" />
              </button>

              {nodeData.metadata?.googleMapsUrl && (
                <a
                  href={nodeData.metadata.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-between gap-1 text-[9.5px] font-mono text-neutral-400 hover:text-white px-1 py-0.5 transition-colors cursor-pointer"
                  title="Buka di Google Maps eksternal"
                >
                  <span className="truncate">Google Maps Eksternal</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                </a>
              )}
            </div>
          )}

          {/* Target Seed Dossier Action */}
          {isSeed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (typeof (nodeData as any)?.onOpenDossier === 'function') {
                  (nodeData as any).onOpenDossier(id);
                }
              }}
              className="mt-2 w-full flex items-center justify-between gap-1.5 text-[10.5px] font-mono text-neutral-200 hover:text-white bg-[#161616] hover:bg-[#222222] border border-[#2a2a2a] hover:border-neutral-500 px-2.5 py-1 rounded transition-colors cursor-pointer"
              title="Buka Target Seed Deep Dossier Modal"
            >
              <span>Inspect Seed Dossier</span>
              <Target className="w-3.5 h-3.5 text-neutral-300" />
            </button>
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
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#0a0a0a] border-b border-r border-[#262626] rotate-45" />
        </div>
      </NodeToolbar>

      {/* Target and Source Handles on all four edges for crisp, non-tangling connections */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-[#525252] !border-0 !opacity-0 group-hover:!opacity-60"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-[#525252] !border-0 !opacity-0 group-hover:!opacity-60"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2 !h-2 !bg-[#525252] !border-0 !opacity-0 group-hover:!opacity-60"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2 !h-2 !bg-[#525252] !border-0 !opacity-0 group-hover:!opacity-60"
      />

      {/* Seed Target Node vs Discovered Entity Badge */}
      {isSeed ? (
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (typeof (nodeData as any)?.onOpenDossier === 'function') {
              (nodeData as any).onOpenDossier(id);
            }
          }}
          className={`px-3 py-2 rounded-md border transition-all duration-150 cursor-pointer flex items-center gap-2.5 min-w-[170px] max-w-[220px] select-none ${
            selected
              ? 'bg-[#181818] border-white ring-1 ring-white/30 text-white shadow-xl'
              : isHovered
                ? 'bg-[#141414] border-neutral-400 text-white shadow-md'
                : 'bg-[#0e0e0e] border-[#333333] text-neutral-200'
          }`}
          title="Klik ganda untuk membuka Target Seed Deep Dossier"
        >
          <Target className="w-4 h-4 text-white shrink-0" />
          <div className="flex flex-col min-w-0 leading-tight">
            <div className="flex items-center justify-between gap-1.5 mb-0.5">
              <span className="text-[8.5px] font-mono uppercase tracking-wider font-semibold text-neutral-300 bg-[#1c1c1c] px-1 py-0.2 rounded border border-[#333333]">
                TARGET SEED
              </span>
              <span className="text-[8px] font-mono text-neutral-500">2x Click</span>
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
          className={`w-[195px] min-h-[46px] py-1.5 px-2 rounded-md border transition-all duration-150 cursor-pointer flex flex-col justify-center select-none ${
            selected
              ? 'bg-[#161616] border-white ring-1 ring-white/40 text-white shadow-xl'
              : isHovered
                ? 'bg-[#121212] border-neutral-400 text-neutral-100 shadow-md'
                : 'bg-[#0a0a0a]/95 border-[#222222] text-neutral-300'
          }`}
        >
          {/* Top Engine Pill Badge & Type Tag */}
          <div className="flex items-center justify-between gap-1 mb-1">
            <div
              className={`flex items-center gap-1 px-1.5 py-0.2 rounded text-[8.5px] font-mono font-medium truncate max-w-[130px] border transition-colors ${
                selected
                  ? 'bg-white text-black border-white'
                  : 'bg-[#141414] border-[#262626]'
              }`}
              style={{
                color: selected ? '#000000' : engineMeta.color,
              }}
              title={`Output dari: ${engineMeta.name}`}
            >
              {/* Subtle Module Dot Indicator */}
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  backgroundColor: selected ? '#000000' : engineMeta.color,
                }}
              />
              <EngineIcon className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{engineMeta.shortName}</span>
            </div>

            <span className="text-[7.5px] font-mono text-neutral-500 uppercase tracking-tight shrink-0">
              {entityType === 'URL' ? 'URL' : entityType === 'TECHNOLOGY' ? 'TECH' : entityType.replace('_', ' ').slice(0, 5)}
            </span>
          </div>

          {/* Main Entity Value & Type Icon */}
          <div className="flex items-center gap-1.5 min-w-0">
            <Icon className="w-3 h-3 shrink-0 text-neutral-400" />
            <span
              className="font-mono text-[10.5px] font-medium text-neutral-200 truncate w-full"
              title={value}
            >
              {mainText}
            </span>
          </div>

          {/* Subtext / Path / Parameter if present */}
          {subText && subText.toLowerCase() !== entityType.toLowerCase() && (
            <span
              className="font-mono text-[8px] text-neutral-500 truncate w-full pl-4.5 mt-0.5"
              title={subText}
            >
              {subText}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

EntityNode.displayName = 'EntityNode';
