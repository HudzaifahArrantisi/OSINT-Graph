import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

export interface ConfidenceBadgeProps {
  score: number;
  showScore?: boolean;
  size?: 'sm' | 'md';
}

export function ConfidenceBadge({ score, showScore = true, size = 'sm' }: ConfidenceBadgeProps) {
  const getLevel = (s: number) => {
    if (s >= 75) return { label: 'High', icon: ShieldCheck };
    if (s >= 40) return { label: 'Medium', icon: Shield };
    return { label: 'Low', icon: ShieldAlert };
  };

  const level = getLevel(score);
  const Icon = level.icon;

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-0.5 text-xs',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono rounded-badge border bg-[#141414] border-[#2b2b2b] text-[#a1a1a1] select-none ${sizeClasses[size]}`}
    >
      <Icon className="w-3 h-3 text-[#ededed]" />
      {showScore ? `${score}%` : level.label}
    </span>
  );
}
