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
          className={`pointer-events-auto flex items-start gap-3 p-3 rounded-lg border shadow-xl backdrop-blur-md transition-all animate-in slide-in-from-top-3 fade-in duration-200 ${
            toast.type === 'success'
              ? 'bg-status-success/15 border-status-success/40 text-status-success shadow-status-success/10'
              : toast.type === 'error'
                ? 'bg-status-danger/15 border-status-danger/40 text-status-danger shadow-status-danger/10'
                : 'bg-surface/95 border-border text-text shadow-black/40'
          }`}
        >
          <div className="shrink-0 mt-0.5">
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-status-success" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-status-danger" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-sky-400" />}
          </div>
          <span className="text-xs font-medium leading-relaxed flex-1 break-words">
            {toast.message}
          </span>
          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 p-1 -mr-1 -mt-1 rounded hover:bg-white/10 text-text-muted hover:text-text transition-colors"
            title="Tutup notifikasi"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

