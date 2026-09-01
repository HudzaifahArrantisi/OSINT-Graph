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
} from 'lucide-react';

const HUB_META: Record<
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
  const catKey = String(nodeData.categoryKey || nodeData.entityType || 'subcat_webpage');
  const count = Number(nodeData.count || nodeData.nodeCount || 0);
  const label = String(nodeData.label || nodeData.title || 'Discovery Module');
  const isCollapsed = Boolean(nodeData.isCollapsed);

  const meta = HUB_META[catKey] || {
    title: label,
    icon: Layers,
  };

  const Icon = meta.icon;
  const title = meta.title || label;

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

      {/* Hub Pill Badge at the Center of the Satellite */}
      <div
        onClick={handleToggle}
        className={`px-2.5 py-1 rounded-md border flex items-center gap-2 bg-[#0d0d0d] border-[#262626] hover:border-neutral-400 transition-all duration-100 cursor-pointer shadow-sm ${
          selected ? 'ring-1 ring-white border-white' : ''
        }`}
        title={`Click to ${isCollapsed ? 'expand' : 'collapse'} ${title} (${count} entities)`}
      >
        <div className="p-0.5 rounded text-neutral-300">
          <Icon className="w-3.5 h-3.5" />
        </div>

        <div className="flex flex-col text-left">
          <span className="text-[10.5px] font-sans font-medium text-neutral-200 leading-tight">
            {title}
          </span>
        </div>

        {count > 0 && (
          <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded border bg-[#171717] border-[#2e2e2e] text-neutral-300 font-medium">
            {count}
          </span>
        )}

        {/* Expand / Collapse Indicator Icon */}
        <div className="text-neutral-400 hover:text-white transition-colors">
          {isCollapsed ? (
            <Maximize2 className="w-3 h-3 text-white" />
          ) : (
            <Minimize2 className="w-3 h-3 text-neutral-500 opacity-60 group-hover:opacity-100" />
          )}
        </div>
      </div>
    </div>
  );
});

ClusterHubNode.displayName = 'ClusterHubNode';
