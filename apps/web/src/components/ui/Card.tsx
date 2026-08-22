import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export function Card({ children, hoverable = false, className = '', ...props }: CardProps) {
  return (
    <div
      className={`bg-surface border border-border-subtle rounded-card p-4 transition-all duration-micro ${
        hoverable ? 'hover:border-border hover:bg-surface-2/60 cursor-pointer' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`flex items-center justify-between pb-3 mb-3 border-b border-border-subtle ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`text-base font-semibold text-text ${className}`} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`text-xs text-text-muted mt-0.5 ${className}`} {...props}>
      {children}
    </p>
  );
}
