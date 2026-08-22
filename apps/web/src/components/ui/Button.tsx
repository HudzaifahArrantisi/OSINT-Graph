import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = 'primary', size = 'md', loading, icon, disabled, className = '', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium transition-all duration-micro select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-app disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98]';

    const variants = {
      primary: 'bg-primary hover:bg-primary-hover text-white shadow-sm shadow-primary/20',
      secondary: 'bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-text border border-border-subtle',
      ghost: 'bg-transparent hover:bg-surface-2 text-text-secondary hover:text-text',
      danger: 'bg-status-danger/15 hover:bg-status-danger/25 text-status-danger border border-status-danger/30',
      outline: 'bg-transparent hover:bg-surface-2 text-text-secondary hover:text-text border border-border-subtle',
    };

    const sizes = {
      sm: 'h-7 px-2.5 text-xs rounded-button gap-1.5',
      md: 'h-9 px-3.5 text-sm rounded-button gap-2',
      lg: 'h-11 px-5 text-base rounded-button gap-2.5',
      icon: 'h-8 w-8 p-1.5 rounded-button',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
