import { useAppStore } from '../stores/appStore';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

export function ToastContainer() {
  const { toasts, removeToast } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-5 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 p-3 rounded-card border bg-[#0d0d0d]/95 backdrop-blur-md border-[#262626] text-neutral-200 shadow-2xl transition-all animate-fade-in"
        >
          <div className="shrink-0 mt-0.5">
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-white" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-neutral-400" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-neutral-400" />}
          </div>
          <span className="text-xs font-medium leading-relaxed flex-1 break-words text-neutral-200">
            {toast.message}
          </span>
          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 p-1 -mr-1 -mt-1 rounded hover:bg-[#1f1f1f] text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

