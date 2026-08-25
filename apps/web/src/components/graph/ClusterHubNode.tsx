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
    glow: string;
    badge: string;
  }
> = {
  subcat_subdomain: {
    title: 'Subdomains',
    icon: Globe2,
    border: 'border-sky-400/80',
    bg: 'bg-[#09182a]/95',
    text: 'text-sky-300',
    glow: 'shadow-[0_0_18px_rgba(56,189,248,0.45)] ring-1 ring-sky-400/40',
    badge: 'bg-sky-500/20 text-sky-200 border-sky-500/40',
  },
  subcat_url: {
    title: 'Endpoints & URLs',
    icon: Search,
    border: 'border-blue-400/80',
    bg: 'bg-[#0a152d]/95',
    text: 'text-blue-300',
    glow: 'shadow-[0_0_18px_rgba(96,165,250,0.45)] ring-1 ring-blue-400/40',
    badge: 'bg-blue-500/20 text-blue-200 border-blue-500/40',
  },
  subcat_domain: {
    title: 'Domains & Apex',
    icon: Globe2,
    border: 'border-sky-400/80',
    bg: 'bg-[#0b172a]/95',
    text: 'text-sky-300',
    glow: 'shadow-[0_0_18px_rgba(56,189,248,0.45)] ring-1 ring-sky-400/40',
    badge: 'bg-sky-500/20 text-sky-200 border-sky-500/40',
  },
  subcat_ip: {
    title: 'IP & Infrastructure',
    icon: Network,
    border: 'border-cyan-400/80',
    bg: 'bg-[#081b24]/95',
    text: 'text-cyan-300',
    glow: 'shadow-[0_0_18px_rgba(6,182,212,0.45)] ring-1 ring-cyan-400/40',
    badge: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40',
  },
  subcat_dns: {
    title: 'DNS Resolution',
    icon: Network,
    border: 'border-cyan-400/80',
    bg: 'bg-[#081d28]/95',
    text: 'text-cyan-300',
    glow: 'shadow-[0_0_18px_rgba(6,182,212,0.45)] ring-1 ring-cyan-400/40',
    badge: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40',
  },
  subcat_tls: {
    title: 'TLS Certificate Lookup',
    icon: Key,
    border: 'border-teal-400/80',
    bg: 'bg-[#092222]/95',
    text: 'text-teal-300',
    glow: 'shadow-[0_0_18px_rgba(45,212,191,0.45)] ring-1 ring-teal-400/40',
    badge: 'bg-teal-500/20 text-teal-200 border-teal-500/40',
  },
  subcat_webpage: {
    title: 'Webpage Metadata Extraction',
    icon: Globe2,
    border: 'border-sky-400/80',
    bg: 'bg-[#0a1b32]/95',
    text: 'text-sky-300',
    glow: 'shadow-[0_0_18px_rgba(56,189,248,0.45)] ring-1 ring-sky-400/40',
    badge: 'bg-sky-500/20 text-sky-200 border-sky-500/40',
  },
  subcat_tech: {
    title: 'Technology Stack',
    icon: Cpu,
    border: 'border-amber-400/80',
    bg: 'bg-[#1c1409]/95',
    text: 'text-amber-300',
    glow: 'shadow-[0_0_18px_rgba(251,191,36,0.45)] ring-1 ring-amber-400/40',
    badge: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
  },
  subcat_recon: {
    title: 'Mr.Holmes Website Recon',
    icon: Terminal,
    border: 'border-amber-400/80',
    bg: 'bg-[#221708]/95',
    text: 'text-amber-300',
    glow: 'shadow-[0_0_18px_rgba(245,158,11,0.45)] ring-1 ring-amber-400/40',
    badge: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
  },
  subcat_contact: {
    title: 'Official Contact Information',
    icon: Mail,
    border: 'border-emerald-400/80',
    bg: 'bg-[#092218]/95',
    text: 'text-emerald-300',
    glow: 'shadow-[0_0_18px_rgba(16,185,129,0.45)] ring-1 ring-emerald-400/40',
    badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  },
  subcat_phone_geo: {
    title: 'Phone & Geolocation',
    icon: Phone,
    border: 'border-orange-400/80',
    bg: 'bg-[#261309]/95',
    text: 'text-orange-300',
    glow: 'shadow-[0_0_18px_rgba(249,115,22,0.45)] ring-1 ring-orange-400/40',
    badge: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
  },
  subcat_social: {
    title: 'Social & Public Profiles',
    icon: Share2,
    border: 'border-purple-400/80',
    bg: 'bg-[#210c36]/95',
    text: 'text-purple-300',
    glow: 'shadow-[0_0_18px_rgba(168,85,247,0.45)] ring-1 ring-purple-400/40',
    badge: 'bg-purple-500/20 text-purple-200 border-purple-500/40',
  },
  subcat_dev: {
    title: 'Developer Profiles',
    icon: Cpu,
    border: 'border-violet-400/80',
    bg: 'bg-[#1a0e33]/95',
    text: 'text-violet-300',
    glow: 'shadow-[0_0_18px_rgba(139,92,246,0.45)] ring-1 ring-violet-400/40',
    badge: 'bg-violet-500/20 text-violet-200 border-violet-500/40',
  },
  subcat_dorks: {
    title: 'Mr.Holmes Website Dorks',
    icon: Search,
    border: 'border-blue-400/80',
    bg: 'bg-[#0d1a38]/95',
    text: 'text-blue-300',
    glow: 'shadow-[0_0_18px_rgba(59,130,246,0.45)] ring-1 ring-blue-400/40',
    badge: 'bg-blue-500/20 text-blue-200 border-blue-500/40',
  },
  subcat_mentions: {
    title: 'Public Web Mentions',
    icon: MessageSquare,
    border: 'border-indigo-400/80',
    bg: 'bg-[#151739]/95',
    text: 'text-indigo-300',
    glow: 'shadow-[0_0_18px_rgba(99,102,241,0.45)] ring-1 ring-indigo-400/40',
    badge: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40',
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
    border: 'border-slate-400/80',
    bg: 'bg-[#0f172a]/95',
    text: 'text-slate-200',
    glow: 'shadow-[0_0_14px_rgba(148,163,184,0.35)] ring-1 ring-slate-400/30',
    badge: 'bg-slate-500/20 text-slate-200 border-slate-500/40',
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
        className="!w-2 !h-2 !bg-slate-400 !border-2 !border-[#0d121c] !opacity-0 group-hover:!opacity-100 transition-opacity"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-slate-400 !border-2 !border-[#0d121c] !opacity-0 group-hover:!opacity-100 transition-opacity"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2 !h-2 !bg-slate-400 !border-2 !border-[#0d121c] !opacity-0 group-hover:!opacity-100 transition-opacity"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2 !h-2 !bg-slate-400 !border-2 !border-[#0d121c] !opacity-0 group-hover:!opacity-100 transition-opacity"
      />

      {/* Hub Pill Badge at the Center of the Satellite */}
      <div
        onClick={handleToggle}
        className={`px-3 py-1.5 rounded-full border flex items-center gap-2 backdrop-blur-md transition-all duration-200 cursor-pointer ${
          meta.bg
        } ${meta.border} ${meta.glow} ${
          selected ? 'scale-110 ring-2 ring-white/70 shadow-2xl' : 'hover:scale-105'
        }`}
        title={`Click to ${isCollapsed ? 'expand' : 'collapse'} ${title} cluster (${count} entities)`}
      >
        <div className={`p-1 rounded-full bg-black/40 ${meta.text}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>

        <div className="flex flex-col text-left">
          <span className="text-[8px] font-mono uppercase tracking-widest text-slate-400 leading-none">
            CLUSTER HUB
          </span>
          <span className={`text-[11px] font-mono font-bold leading-tight ${meta.text}`}>
            {title}
          </span>
        </div>

        {count > 0 && (
          <span
            className={`ml-1 text-[10px] font-mono font-extrabold px-1.5 py-0.2 rounded-full border ${meta.badge}`}
          >
            {count}
          </span>
        )}

        {/* Expand / Collapse Indicator Icon */}
        <div className={`p-0.5 rounded text-slate-400 hover:text-white transition-colors ${meta.text}`}>
          {isCollapsed ? (
            <Maximize2 className="w-3 h-3 text-cyan-300 animate-pulse" />
          ) : (
            <Minimize2 className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100" />
          )}
        </div>
      </div>
    </div>
  );
});

ClusterHubNode.displayName = 'ClusterHubNode';
