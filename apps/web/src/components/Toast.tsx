import { useAppStore } from '../stores/appStore';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export function ToastContainer() {
  const { toasts, removeToast } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 p-3 rounded-card border animate-slide-in-up ${
            toast.type === 'success'
              ? 'bg-status-success/10 border-status-success/30 text-status-success'
              : toast.type === 'error'
                ? 'bg-status-danger/10 border-status-danger/30 text-status-danger'
                : 'bg-surface-2 border-border-subtle text-text-secondary'
          }`}
        >
          {toast.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
          <span className="text-sm flex-1">{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="btn-icon p-1">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
