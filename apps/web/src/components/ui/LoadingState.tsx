import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
  subMessage?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingState({
  message = 'Loading investigation data...',
  subMessage,
  size = 'md',
}: LoadingStateProps) {
  const iconSizes = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[200px]">
      <Loader2 className={`${iconSizes[size]} text-primary animate-spin mb-3`} />
      <p className="text-sm font-medium text-text">{message}</p>
      {subMessage && <p className="text-xs text-text-muted mt-1">{subMessage}</p>}
    </div>
  );
}
