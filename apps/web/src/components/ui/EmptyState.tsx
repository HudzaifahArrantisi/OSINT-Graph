import React from 'react';
import { Compass } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
      <div className="w-12 h-12 rounded-full bg-surface-2 border border-border-subtle flex items-center justify-center text-text-muted mb-3">
        {icon || <Compass className="w-6 h-6" />}
      </div>
      <h4 className="text-base font-semibold text-text mb-1">{title}</h4>
      <p className="text-xs text-text-muted mb-5 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" size="md" icon={actionIcon} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
