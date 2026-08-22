import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-text-secondary select-none">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3 text-text-muted pointer-events-none flex items-center justify-center">
              {leftIcon}
            </span>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`w-full bg-surface-2 border text-text placeholder:text-text-muted text-sm rounded-input py-2 transition-colors duration-micro focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 disabled:opacity-50 disabled:bg-surface-3 ${
              leftIcon ? 'pl-9' : 'pl-3'
            } ${rightIcon ? 'pr-9' : 'pr-3'} ${
              error ? 'border-status-danger focus:border-status-danger focus:ring-status-danger/30' : 'border-border-subtle'
            } ${className}`}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 text-text-muted flex items-center justify-center">
              {rightIcon}
            </span>
          )}
        </div>
        {error ? (
          <p className="text-xs text-status-danger mt-0.5">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-text-muted mt-0.5">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
