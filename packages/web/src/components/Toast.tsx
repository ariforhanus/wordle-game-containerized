import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import "./Toast.css";

// ── Types ──

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, durationMs?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

// ── Context ──

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

// ── Icons per type ──

const ICONS: Record<ToastType, string> = {
  success: "fa-check-circle",
  error: "fa-times-circle",
  info: "fa-info-circle",
  warning: "fa-exclamation-triangle",
};

// ── Provider ──

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idCounter = useRef(0);

  const removeToast = useCallback((id: number) => {
    // Start exit animation
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    // Remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "info", durationMs = 3000) => {
      const id = ++idCounter.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => removeToast(id), durationMs);
    },
    [removeToast]
  );

  const success = useCallback((msg: string) => toast(msg, "success"), [toast]);
  const error = useCallback((msg: string) => toast(msg, "error", 4000), [toast]);
  const info = useCallback((msg: string) => toast(msg, "info"), [toast]);
  const warning = useCallback((msg: string) => toast(msg, "warning", 4000), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warning }}>
      {children}

      {/* Toast container */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-item toast-${t.type} ${t.exiting ? "toast-exit" : ""}`}
            onClick={() => removeToast(t.id)}
          >
            <i className={`fas ${ICONS[t.type]}`} />
            <span className="toast-message">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
