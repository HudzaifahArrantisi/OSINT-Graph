import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { EntityType } from '@nexusgraph/shared';
import {
  Globe2,
  Mail,
  User,
  Network,
  Link,
  Building,
  FolderGit2,
  Share2,
  Cpu,
  Key,
  FileText,
  Phone,
  MapPin,
  HelpCircle,
  Shield,
  Github,
  Gitlab,
  Youtube,
  Radio,
  Server,
} from 'lucide-react';

const ENTITY_ICONS: Record<EntityType, React.ComponentType<{ className?: string }>> = {
  SEED: Radio,
  DOMAIN: Globe2,
  IP_ADDRESS: Network,
  EMAIL: Mail,
  USERNAME: User,
  URL: Link,
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
  PUBLIC_MENTION: Link,
  WEBSITE: Globe2,
};

const ENTITY_ACCENTS: Record<string, { badge: string; iconBg: string; iconColor: string }> = {
  SEED: { badge: 'text-amber-300 bg-amber-500/10 border-amber-500/20', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-400' },
  DOMAIN: { badge: 'text-sky-300 bg-sky-500/10 border-sky-500/20', iconBg: 'bg-sky-500/10', iconColor: 'text-sky-400' },
  IP_ADDRESS: { badge: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20', iconBg: 'bg-cyan-500/10', iconColor: 'text-cyan-400' },
  EMAIL: { badge: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-400' },
  USERNAME: { badge: 'text-amber-300 bg-amber-500/10 border-amber-500/20', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-400' },
  URL: { badge: 'text-blue-300 bg-blue-500/10 border-blue-500/20', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-400' },
  SOCIAL_PROFILE: { badge: 'text-purple-300 bg-purple-500/10 border-purple-500/20', iconBg: 'bg-purple-500/10', iconColor: 'text-purple-400' },
  REPOSITORY: { badge: 'text-rose-300 bg-rose-500/10 border-rose-500/20', iconBg: 'bg-rose-500/10', iconColor: 'text-rose-400' },
  ORGANIZATION: { badge: 'text-teal-300 bg-teal-500/10 border-teal-500/20', iconBg: 'bg-teal-500/10', iconColor: 'text-teal-400' },
  CERTIFICATE: { badge: 'text-sky-300 bg-sky-500/10 border-sky-500/20', iconBg: 'bg-sky-500/10', iconColor: 'text-sky-400' },
  TECHNOLOGY: { badge: 'text-amber-300 bg-amber-500/10 border-amber-500/20', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-400' },
  PERSON: { badge: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20', iconBg: 'bg-indigo-500/10', iconColor: 'text-indigo-400' },
  DOCUMENT: { badge: 'text-slate-300 bg-slate-500/10 border-slate-500/20', iconBg: 'bg-slate-500/10', iconColor: 'text-slate-400' },
  PHONE: { badge: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-400' },
  ADDRESS: { badge: 'text-amber-300 bg-amber-500/10 border-amber-500/20', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-400' },
  LOCATION: { badge: 'text-amber-300 bg-amber-500/10 border-amber-500/20', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-400' },
  GITHUB_PROFILE: { badge: 'text-violet-300 bg-violet-500/10 border-violet-500/20', iconBg: 'bg-violet-500/10', iconColor: 'text-violet-400' },
  GITLAB_PROFILE: { badge: 'text-orange-300 bg-orange-500/10 border-orange-500/20', iconBg: 'bg-orange-500/10', iconColor: 'text-orange-400' },
  YOUTUBE_CHANNEL: { badge: 'text-red-300 bg-red-500/10 border-red-500/20', iconBg: 'bg-red-500/10', iconColor: 'text-red-400' },
  SUBDOMAIN: { badge: 'text-sky-300 bg-sky-500/10 border-sky-500/20', iconBg: 'bg-sky-500/10', iconColor: 'text-sky-400' },
  MX_RECORD: { badge: 'text-teal-300 bg-teal-500/10 border-teal-500/20', iconBg: 'bg-teal-500/10', iconColor: 'text-teal-400' },
  NS_RECORD: { badge: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20', iconBg: 'bg-cyan-500/10', iconColor: 'text-cyan-400' },
  PUBLIC_MENTION: { badge: 'text-blue-300 bg-blue-500/10 border-blue-500/20', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-400' },
  WEBSITE: { badge: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-400' },
};

export const EntityNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = (data || {}) as Record<string, any>;
  const entityType = (nodeData.entityType || 'DOMAIN') as EntityType;
  const value = nodeData.value || nodeData.label || 'Entity';
  const title = nodeData.title;
  const confidence = nodeData.confidence || 50;
  const isSeed = nodeData.isSeed || entityType === 'SEED';

  const Icon = ENTITY_ICONS[entityType] || HelpCircle;
  const accent = ENTITY_ACCENTS[entityType] || {
    badge: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
    iconBg: 'bg-slate-800/40',
    iconColor: 'text-slate-400',
  };

  const hasSubtitle = title && title !== value && !title.startsWith('Investigation Seed:');

  return (
    <div
      className={`min-w-[210px] max-w-[280px] bg-[#0d121c] rounded-md border transition-all duration-150 shadow-md select-none ${
        isSeed
          ? 'border-amber-500/50 bg-[#13151c] shadow-black/40'
          : selected
            ? 'border-sky-500 ring-1 ring-sky-500/40 bg-[#111928] shadow-sky-950/30'
            : 'border-[#1e293b] hover:border-slate-600 hover:bg-[#101724]'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-slate-600 !border-2 !border-[#0d121c] !opacity-40 hover:!opacity-100 transition-opacity"
      />

      <div className="p-2.5">
        {/* Header: Icon + Type Badge + Confidence */}
        <div className="flex items-center justify-between gap-1.5 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={`p-1 rounded ${accent.iconBg} ${accent.iconColor} shrink-0`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 truncate font-medium">
              {isSeed ? 'SEED TARGET' : entityType.replace('_', ' ')}
            </span>
          </div>
          {isSeed ? (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              SEED
            </span>
          ) : (
            <ConfidenceBadge score={confidence} size="sm" showScore={false} />
          )}
        </div>

        {/* Primary Data Value (Actual handle, IP, domain, URL) */}
        <div
          className={`font-mono text-xs font-semibold leading-snug break-all ${
            isSeed ? 'text-amber-200' : 'text-slate-100'
          }`}
          title={value}
        >
          {value}
        </div>

        {/* Subtitle / Context description if present */}
        {hasSubtitle && (
          <div
            className="text-[10px] text-slate-400 font-sans truncate mt-0.5"
            title={title}
          >
            {title}
          </div>
        )}

        {/* Footer: Confidence & Evidence / Relationship Counts */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1.5 pt-1.5 border-t border-[#1a2334]">
          <span className="truncate">
            {isSeed ? (
              <span className="text-amber-400/70 font-sans">
                {String(nodeData.metadata?.declaredType || 'Target')}
              </span>
            ) : (
              <span className="text-slate-400">{Math.round(confidence)}% conf</span>
            )}
          </span>
          <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
            {typeof nodeData.evidenceCount === 'number' && nodeData.evidenceCount > 0 && (
              <span title={`${nodeData.evidenceCount} evidence items`} className="text-emerald-400">
                {nodeData.evidenceCount} ev
              </span>
            )}
            {typeof nodeData.relationshipCount === 'number' && nodeData.relationshipCount > 0 && (
              <span title={`${nodeData.relationshipCount} relationships`} className="text-sky-400">
                {nodeData.relationshipCount} rel
              </span>
            )}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-slate-600 !border-2 !border-[#0d121c] !opacity-40 hover:!opacity-100 transition-opacity"
      />
    </div>
  );
});

EntityNode.displayName = 'EntityNode';
