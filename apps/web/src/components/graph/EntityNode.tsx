import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  UserRound,
  AtSign,
  Mail,
  Globe2,
  Link2,
  Network,
  Building2,
  GitBranch,
  ContactRound,
  Cpu,
  BadgeCheck,
  FileText,
  HelpCircle,
  Sparkles,
  Phone,
  MapPin,
  Youtube,
  Gitlab,
  Radio,
  FileSearch,
} from 'lucide-react';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import type { EntityType } from '@nexusgraph/shared';

const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  SEED: Sparkles,
  PERSON: UserRound,
  USERNAME: AtSign,
  EMAIL: Mail,
  DOMAIN: Globe2,
  WEBSITE: Globe2,
  URL: Link2,
  IP_ADDRESS: Network,
  ORGANIZATION: Building2,
  REPOSITORY: GitBranch,
  SOCIAL_PROFILE: ContactRound,
  TECHNOLOGY: Cpu,
  CERTIFICATE: BadgeCheck,
  DOCUMENT: FileText,
  PHONE: Phone,
  ADDRESS: MapPin,
  LOCATION: MapPin,
  GITHUB_PROFILE: GitBranch,
  GITLAB_PROFILE: Gitlab,
  YOUTUBE_CHANNEL: Youtube,
  SUBDOMAIN: Network,
  MX_RECORD: Mail,
  NS_RECORD: Radio,
  PUBLIC_MENTION: FileSearch,
};

const ENTITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SEED: { bg: 'bg-amber-950/60', text: 'text-amber-300', border: 'border-amber-500/70 border-dashed' },
  DOMAIN: { bg: 'bg-indigo-950/40', text: 'text-indigo-400', border: 'border-indigo-500/40' },
  WEBSITE: { bg: 'bg-emerald-950/40', text: 'text-emerald-400', border: 'border-emerald-500/40' },
  IP_ADDRESS: { bg: 'bg-cyan-950/40', text: 'text-cyan-400', border: 'border-cyan-500/40' },
  EMAIL: { bg: 'bg-emerald-950/40', text: 'text-emerald-400', border: 'border-emerald-500/40' },
  USERNAME: { bg: 'bg-amber-950/40', text: 'text-amber-400', border: 'border-amber-500/40' },
  URL: { bg: 'bg-blue-950/40', text: 'text-blue-400', border: 'border-blue-500/40' },
  SOCIAL_PROFILE: { bg: 'bg-purple-950/40', text: 'text-purple-400', border: 'border-purple-500/40' },
  REPOSITORY: { bg: 'bg-rose-950/40', text: 'text-rose-400', border: 'border-rose-500/40' },
  ORGANIZATION: { bg: 'bg-teal-950/40', text: 'text-teal-400', border: 'border-teal-500/40' },
  CERTIFICATE: { bg: 'bg-sky-950/40', text: 'text-sky-400', border: 'border-sky-500/40' },
  TECHNOLOGY: { bg: 'bg-orange-950/40', text: 'text-orange-400', border: 'border-orange-500/40' },
  PERSON: { bg: 'bg-fuchsia-950/40', text: 'text-fuchsia-400', border: 'border-fuchsia-500/40' },
  DOCUMENT: { bg: 'bg-slate-900/40', text: 'text-slate-400', border: 'border-slate-500/40' },
  PHONE: { bg: 'bg-lime-950/40', text: 'text-lime-400', border: 'border-lime-500/40' },
  ADDRESS: { bg: 'bg-amber-950/40', text: 'text-amber-400', border: 'border-amber-500/40' },
  LOCATION: { bg: 'bg-amber-950/40', text: 'text-amber-400', border: 'border-amber-500/40' },
  GITHUB_PROFILE: { bg: 'bg-violet-950/40', text: 'text-violet-400', border: 'border-violet-500/40' },
  GITLAB_PROFILE: { bg: 'bg-orange-950/40', text: 'text-orange-400', border: 'border-orange-500/40' },
  YOUTUBE_CHANNEL: { bg: 'bg-red-950/40', text: 'text-red-400', border: 'border-red-500/40' },
  SUBDOMAIN: { bg: 'bg-indigo-950/40', text: 'text-indigo-400', border: 'border-indigo-500/40' },
  MX_RECORD: { bg: 'bg-teal-950/40', text: 'text-teal-400', border: 'border-teal-500/40' },
  NS_RECORD: { bg: 'bg-cyan-950/40', text: 'text-cyan-400', border: 'border-cyan-500/40' },
  PUBLIC_MENTION: { bg: 'bg-blue-950/40', text: 'text-blue-400', border: 'border-blue-500/40' },
};

export const EntityNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = (data || {}) as Record<string, any>;
  const entityType = (nodeData.entityType || 'DOMAIN') as EntityType;
  const label = nodeData.label || 'Entity';
  const confidence = nodeData.confidence || 50;
  const isSeed = nodeData.isSeed || entityType === 'SEED';
  const discoveryStatus = nodeData.discoveryStatus || (isSeed ? 'seed' : 'discovered');

  const Icon = ENTITY_ICONS[entityType] || HelpCircle;
  const style = ENTITY_COLORS[entityType] || {
    bg: 'bg-surface-2',
    text: 'text-text-secondary',
    border: 'border-border-subtle',
  };

  return (
    <div
      className={`min-w-[200px] max-w-[290px] bg-surface rounded-graph-node border transition-all duration-micro shadow-lg select-none ${
        isSeed
          ? 'border-amber-500/80 border-2 ring-2 ring-amber-500/20 shadow-amber-500/10'
          : selected
            ? 'border-primary ring-2 ring-primary/40 bg-surface-2/90 shadow-primary/20'
            : discoveryStatus === 'unverified'
              ? 'border-border-subtle opacity-75 hover:opacity-100 hover:border-border'
              : `${style.border} hover:border-border hover:bg-surface-2/60`
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-2.5 h-2.5 bg-border-subtle border-2 border-surface"
      />

      <div className="p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={`p-1 rounded-md ${style.bg} ${style.text} shrink-0`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted truncate">
              {isSeed ? 'INVESTIGATION SEED' : entityType.replace('_', ' ')}
            </span>
          </div>
          {isSeed ? (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
              SEED
            </span>
          ) : (
            <ConfidenceBadge score={confidence} size="sm" showScore={false} />
          )}
        </div>

        <div
          className={`font-mono text-xs font-medium truncate py-0.5 ${
            isSeed ? 'text-amber-200 font-bold' : 'text-text'
          }`}
          title={label}
        >
          {label}
        </div>

        <div className="flex items-center justify-between text-[10px] text-text-muted mt-2 pt-2 border-t border-border-subtle/60">
          <span>
            {isSeed ? (
              <span className="text-amber-400/80 font-mono">Declared: {(nodeData.metadata?.declaredType as string || 'General')}</span>
            ) : (
              `${Math.round(confidence)}% confidence`
            )}
          </span>
          <div className="flex items-center gap-2">
            {typeof nodeData.evidenceCount === 'number' && nodeData.evidenceCount > 0 && (
              <span title={`${nodeData.evidenceCount} evidence items`} className="text-emerald-400 font-mono">
                {nodeData.evidenceCount} ev
              </span>
            )}
            {typeof nodeData.relationshipCount === 'number' && nodeData.relationshipCount > 0 && (
              <span title={`${nodeData.relationshipCount} relationships`} className="text-cyan-400 font-mono">
                {nodeData.relationshipCount} rel
              </span>
            )}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2.5 h-2.5 bg-border-subtle border-2 border-surface"
      />
    </div>
  );
});

EntityNode.displayName = 'EntityNode';
