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
      primary: 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm font-medium transition-colors',
      secondary: 'bg-[#131926] hover:bg-[#1c2436] text-slate-300 hover:text-slate-100 border border-[#232f46] font-medium transition-colors',
      ghost: 'bg-transparent hover:bg-slate-800/70 text-slate-300 hover:text-slate-100 font-medium transition-colors',
      danger: 'bg-rose-950/30 hover:bg-rose-950/50 text-rose-300 hover:text-rose-200 border border-rose-800/40 font-medium transition-colors',
      outline: 'bg-transparent hover:bg-slate-800 text-slate-300 hover:text-slate-100 border border-slate-700 font-medium transition-colors',
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
