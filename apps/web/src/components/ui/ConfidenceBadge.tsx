import React from 'react';

interface ConfidenceBadgeProps {
  score: number;
  showScore?: boolean;
  size?: 'sm' | 'md';
}

export function ConfidenceBadge({ score, showScore = true, size = 'sm' }: ConfidenceBadgeProps) {
  let label = 'Low';
  let dotColor = 'bg-rose-400';
  let textColor = 'text-rose-300';
  let borderColor = 'border-rose-500/20';

  if (score >= 90) {
    label = 'Verified';
    dotColor = 'bg-emerald-400';
    textColor = 'text-emerald-400';
    borderColor = 'border-emerald-500/20';
  } else if (score >= 75) {
    label = 'High';
    dotColor = 'bg-sky-400';
    textColor = 'text-sky-300';
    borderColor = 'border-sky-500/20';
  } else if (score >= 50) {
    label = 'Medium';
    dotColor = 'bg-amber-400';
    textColor = 'text-amber-300';
    borderColor = 'border-amber-500/20';
  } else if (score >= 25) {
    label = 'Low';
    dotColor = 'bg-slate-400';
    textColor = 'text-slate-400';
    borderColor = 'border-slate-700/30';
  }

  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded bg-black/40 border ${borderColor} ${textColor} font-mono font-medium select-none ${sizeClasses}`}
      title={`Confidence: ${score}% (${label})`}
    >
      <span className={`w-1 h-1 rounded-full ${dotColor}`} />
      <span>{label}</span>
      {showScore && <span className="text-slate-500 font-normal">{Math.round(score)}%</span>}
    </span>
  );
}
