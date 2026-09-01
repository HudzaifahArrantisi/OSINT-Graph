import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'cyan' | 'muted';
  size?: 'sm' | 'md';
}

export function Badge({ children, variant = 'default', size = 'sm', className = '', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-[#141414] text-[#a1a1a1] border-[#262626]',
    primary: 'bg-[#1c1c1c] text-[#ededed] border-[#383838]',
    success: 'bg-[#181818] text-[#ededed] border-[#333333]',
    warning: 'bg-[#181818] text-[#d4d4d4] border-[#333333]',
    danger: 'bg-[#181818] text-[#ededed] border-[#333333]',
    cyan: 'bg-[#1c1c1c] text-[#ededed] border-[#383838]',
    muted: 'bg-[#0e0e0e] text-[#666666] border-[#1f1f1f]',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[10.5px]',
    md: 'px-2.5 py-1 text-xs',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-badge border font-mono select-none ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
