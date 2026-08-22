import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'cyan' | 'muted';
  size?: 'sm' | 'md';
}

export function Badge({ children, variant = 'default', size = 'sm', className = '', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-surface-3 text-text-secondary border-border-subtle',
    primary: 'bg-primary/15 text-primary border-primary/30',
    success: 'bg-status-success/15 text-status-success border-status-success/30',
    warning: 'bg-status-warning/15 text-status-warning border-status-warning/30',
    danger: 'bg-status-danger/15 text-status-danger border-status-danger/30',
    cyan: 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30',
    muted: 'bg-surface-2 text-text-muted border-transparent',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs font-medium',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-badge border font-medium select-none ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
