import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = 'primary', size = 'md', loading, icon, disabled, className = '', ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center font-medium transition-all duration-micro select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.99] cursor-pointer';

    const variants = {
      primary: 'bg-white hover:bg-neutral-200 text-black border border-white font-medium',
      secondary: 'bg-[#121212] hover:bg-[#1c1c1c] text-[#ededed] border border-[#262626] hover:border-[#404040]',
      ghost: 'bg-transparent hover:bg-[#181818] text-[#a1a1a1] hover:text-[#ededed] border border-transparent',
      danger: 'bg-transparent hover:bg-[#1c1c1c] text-[#ededed] hover:text-white border border-[#2e2e2e] hover:border-[#555555]',
      outline: 'bg-transparent hover:bg-[#141414] text-[#ededed] border border-[#262626] hover:border-[#404040]',
    };

    const sizes = {
      sm: 'h-7 px-2.5 text-xs rounded-button gap-1.5',
      md: 'h-8 px-3.5 text-xs rounded-button gap-2',
      lg: 'h-10 px-4 text-sm rounded-button gap-2.5',
      icon: 'h-7 w-7 p-1 rounded-button',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
