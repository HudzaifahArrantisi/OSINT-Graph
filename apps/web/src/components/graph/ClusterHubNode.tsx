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
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
} from 'lucide-react';

const HUB_META: Record<
  string,
  {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    border: string;
    bg: string;
    text: string;
    badge: string;
  }
> = {
  subcat_subdomain: {
    title: 'Subdomains',
    icon: Globe2,
    border: 'border-sky-700/60 hover:border-sky-500/80',
    bg: 'bg-[#0f172a]/95',
    text: 'text-sky-300',
    badge: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  },
  subcat_url: {
    title: 'Endpoints & URLs',
    icon: Search,
    border: 'border-blue-700/60 hover:border-blue-500/80',
    bg: 'bg-[#0f172a]/95',
    text: 'text-blue-300',
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  },
  subcat_domain: {
    title: 'Domains & Apex',
    icon: Globe2,
    border: 'border-sky-700/60 hover:border-sky-500/80',
    bg: 'bg-[#0f172a]/95',
    text: 'text-sky-300',
    badge: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  },
  subcat_ip: {
    title: 'IP & Infrastructure',
    icon: Network,
    border: 'border-cyan-700/60 hover:border-cyan-500/80',
    bg: 'bg-[#0b1b24]/95',
    text: 'text-cyan-300',
    badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  },
  subcat_dns: {
    title: 'DNS Resolution',
    icon: Network,
    border: 'border-cyan-700/60 hover:border-cyan-500/80',
    bg: 'bg-[#0b1b24]/95',
    text: 'text-cyan-300',
    badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  },
  subcat_tls: {
    title: 'TLS Certificate',
    icon: Key,
    border: 'border-teal-700/60 hover:border-teal-500/80',
    bg: 'bg-[#091f1f]/95',
    text: 'text-teal-300',
    badge: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
  },
  subcat_webpage: {
    title: 'Webpage Metadata',
    icon: Globe2,
    border: 'border-sky-700/60 hover:border-sky-500/80',
    bg: 'bg-[#0f172a]/95',
    text: 'text-sky-300',
    badge: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  },
  subcat_tech: {
    title: 'Technologies',
    icon: Cpu,
    border: 'border-amber-700/60 hover:border-amber-500/80',
    bg: 'bg-[#1a160e]/95',
    text: 'text-amber-300',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  },
  subcat_recon: {
    title: 'Website Recon',
    icon: Terminal,
    border: 'border-amber-700/60 hover:border-amber-500/80',
    bg: 'bg-[#1a160e]/95',
    text: 'text-amber-300',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  },
  subcat_contact: {
    title: 'Contacts & Staff',
    icon: Mail,
    border: 'border-emerald-700/60 hover:border-emerald-500/80',
    bg: 'bg-[#0c1d16]/95',
    text: 'text-emerald-300',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  },
  subcat_phone_geo: {
    title: 'Phone & Location',
    icon: Phone,
    border: 'border-orange-700/60 hover:border-orange-500/80',
    bg: 'bg-[#1f150e]/95',
    text: 'text-orange-300',
    badge: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  },
  subcat_social: {
    title: 'Social Profiles',
    icon: Share2,
    border: 'border-purple-700/60 hover:border-purple-500/80',
    bg: 'bg-[#191124]/95',
    text: 'text-purple-300',
    badge: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  },
  subcat_dev: {
    title: 'Developer Profiles',
    icon: Cpu,
    border: 'border-violet-700/60 hover:border-violet-500/80',
    bg: 'bg-[#171124]/95',
    text: 'text-violet-300',
    badge: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  },
  subcat_dorks: {
    title: 'Target Dorks',
    icon: Search,
    border: 'border-blue-700/60 hover:border-blue-500/80',
    bg: 'bg-[#0f172a]/95',
    text: 'text-blue-300',
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  },
  subcat_mentions: {
    title: 'Public Mentions',
    icon: MessageSquare,
    border: 'border-indigo-700/60 hover:border-indigo-500/80',
    bg: 'bg-[#131728]/95',
    text: 'text-indigo-300',
    badge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
  },
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
    border: 'border-slate-700/70 hover:border-slate-500/80',
    bg: 'bg-[#0f172a]/95',
    text: 'text-slate-200',
    badge: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
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
        className="!w-2 !h-2 !bg-slate-500 !border !border-[#0d121c] !opacity-0 group-hover:!opacity-80 transition-opacity"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-slate-500 !border !border-[#0d121c] !opacity-0 group-hover:!opacity-80 transition-opacity"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2 !h-2 !bg-slate-500 !border !border-[#0d121c] !opacity-0 group-hover:!opacity-80 transition-opacity"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2 !h-2 !bg-slate-500 !border !border-[#0d121c] !opacity-0 group-hover:!opacity-80 transition-opacity"
      />

      {/* Hub Pill Badge at the Center of the Satellite */}
      <div
        onClick={handleToggle}
        className={`px-2.5 py-1 rounded-md border flex items-center gap-2 backdrop-blur-md transition-all duration-150 cursor-pointer shadow-sm ${
          meta.bg
        } ${meta.border} ${
          selected ? 'ring-2 ring-slate-400 border-slate-300' : ''
        }`}
        title={`Click to ${isCollapsed ? 'expand' : 'collapse'} ${title} (${count} entities)`}
      >
        <div className={`p-0.5 rounded ${meta.text}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>

        <div className="flex flex-col text-left">
          <span className="text-[10.5px] font-sans font-medium text-slate-200 leading-tight">
            {title}
          </span>
        </div>

        {count > 0 && (
          <span
            className={`text-[9.5px] font-mono px-1.5 py-0.2 rounded border font-medium ${meta.badge}`}
          >
            {count}
          </span>
        )}

        {/* Expand / Collapse Indicator Icon */}
        <div className="text-slate-400 hover:text-slate-200 transition-colors">
          {isCollapsed ? (
            <Maximize2 className="w-3 h-3 text-sky-400" />
          ) : (
            <Minimize2 className="w-3 h-3 text-slate-500 opacity-60 group-hover:opacity-100" />
          )}
        </div>
      </div>
    </div>
  );
});

ClusterHubNode.displayName = 'ClusterHubNode';
