import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Network,
  Key,
  Globe2,
  Cpu,
  Mail,
  Share2,
  Search,
  Phone,
  Terminal,
  MessageSquare,
  Layers,
  Maximize2,
  Minimize2,
  Archive,
  Code2,
  ShieldAlert,
  Radar,
  AlertTriangle,
  ShieldCheck,
  Radio,
  Server,
  Building,
  Target,
} from 'lucide-react';
import {
  ENGINE_MODULE_DEFINITIONS,
} from '@nexusgraph/shared';

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
  Search,
  Mail,
  Target,
  Layers,
  Network,
};

const LEGACY_HUB_META: Record<
  string,
  {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  subcat_subdomain: { title: 'Subdomains', icon: Globe2 },
  subcat_url: { title: 'Endpoints & URLs', icon: Search },
  subcat_domain: { title: 'Domains & Apex', icon: Globe2 },
  subcat_ip: { title: 'IP & Infrastructure', icon: Network },
  subcat_dns: { title: 'DNS Resolution', icon: Network },
  subcat_tls: { title: 'TLS Certificate', icon: Key },
  subcat_webpage: { title: 'Webpage Metadata', icon: Globe2 },
  subcat_tech: { title: 'Technologies', icon: Cpu },
  subcat_recon: { title: 'Website Recon', icon: Terminal },
  subcat_contact: { title: 'Contacts & Staff', icon: Mail },
  subcat_phone_geo: { title: 'Phone & Location', icon: Phone },
  subcat_social: { title: 'Social Profiles', icon: Share2 },
  subcat_dev: { title: 'Developer Profiles', icon: Cpu },
  subcat_dorks: { title: 'Target Dorks', icon: Search },
  subcat_mentions: { title: 'Public Mentions', icon: MessageSquare },
};

export const ClusterHubNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = (data || {}) as Record<string, any>;
  const catKey = String(nodeData.categoryKey || nodeData.entityType || 'engine_general');
  const count = Number(nodeData.count || nodeData.nodeCount || 0);
  const label = String(nodeData.label || nodeData.title || 'Discovery Module');
  const isCollapsed = Boolean(nodeData.isCollapsed);

  // Check engine module definition first
  const engineMeta = (ENGINE_MODULE_DEFINITIONS as Record<string, any>)[catKey];
  const legacyMeta = LEGACY_HUB_META[catKey];

  const title = engineMeta?.shortName || engineMeta?.name || legacyMeta?.title || label;
  const iconName = engineMeta?.iconName;
  const Icon = (iconName && ENGINE_ICONS[iconName]) || legacyMeta?.icon || Layers;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof nodeData.onToggleCollapse === 'function') {
      nodeData.onToggleCollapse(catKey);
    }
  };

  return (
    <div className="relative flex flex-col items-center select-none group">
      <Handle
        type="target"
        position={Position.Top}
        className="!w-1 !h-1 !bg-neutral-600 !border-0 !opacity-0 group-hover:!opacity-50"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-1 !h-1 !bg-neutral-600 !border-0 !opacity-0 group-hover:!opacity-50"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-1 !h-1 !bg-neutral-600 !border-0 !opacity-0 group-hover:!opacity-50"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-1 !h-1 !bg-neutral-600 !border-0 !opacity-0 group-hover:!opacity-50"
      />

      {/* Hub Pill Badge at the Center of the Satellite (Clean Monochrome Anti-Slop) */}
      <div
        onClick={handleToggle}
        className={`px-2.5 py-1 rounded-md border flex items-center gap-2 bg-[#0a0a0a]/95 backdrop-blur-sm transition-all duration-100 cursor-pointer shadow-md ${
          selected
            ? 'bg-white text-black border-white shadow-xl ring-1 ring-white/30'
            : 'text-neutral-200 border-[#222222] hover:border-neutral-500 hover:bg-[#121212]'
        }`}
        title={`Click to ${isCollapsed ? 'expand' : 'collapse'} ${title} (${count} entities)`}
      >
        <div
          className={`p-1 rounded shrink-0 flex items-center justify-center transition-colors ${
            selected ? 'bg-black text-white' : 'bg-[#141414] text-neutral-400'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>

        <div className="flex flex-col text-left">
          <span
            className={`text-[10.5px] font-sans font-medium leading-tight ${
              selected ? 'text-black font-semibold' : 'text-neutral-200'
            }`}
          >
            {title}
          </span>
        </div>

        {count > 0 && (
          <span
            className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
              selected
                ? 'bg-black/10 text-black border-black/20 font-semibold'
                : 'bg-[#141414] text-neutral-400 border-[#262626]'
            }`}
          >
            {count}
          </span>
        )}

        {/* Expand / Collapse Indicator Icon */}
        <div className={selected ? 'text-black/70 hover:text-black' : 'text-neutral-500 hover:text-white'}>
          {isCollapsed ? (
            <Maximize2 className="w-3 h-3" />
          ) : (
            <Minimize2 className="w-3 h-3 opacity-60 group-hover:opacity-100" />
          )}
        </div>
      </div>
    </div>
  );
});

ClusterHubNode.displayName = 'ClusterHubNode';
