import React from 'react';

interface ConfidenceBadgeProps {
  score: number;
  showScore?: boolean;
  size?: 'sm' | 'md';
}

export function ConfidenceBadge({ score, showScore = true, size = 'sm' }: ConfidenceBadgeProps) {
  let label = 'Very Low';
  let colorClasses = 'bg-status-danger/15 text-status-danger border-status-danger/30';

  if (score >= 90) {
    label = 'Very High';
    colorClasses = 'bg-status-success/15 text-status-success border-status-success/30';
  } else if (score >= 75) {
    label = 'High';
    colorClasses = 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30';
  } else if (score >= 50) {
    label = 'Medium';
    colorClasses = 'bg-status-warning/15 text-status-warning border-status-warning/30';
  } else if (score >= 25) {
    label = 'Low';
    colorClasses = 'bg-surface-3 text-text-muted border-border-subtle';
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm font-medium';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-badge border font-mono ${sizeClasses} ${colorClasses}`}
      title={`Confidence Score: ${score}% (${label})`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      <span>{label}</span>
      {showScore && <span className="opacity-80">· {Math.round(score)}%</span>}
    </span>
  );
}
