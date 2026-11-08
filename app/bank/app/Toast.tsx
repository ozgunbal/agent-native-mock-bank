import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastTone = "success" | "error";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

type ShowToast = (message: string, tone?: ToastTone) => void;

const TOAST_DURATION_MS = 3500;

const ToastContext = createContext<ShowToast | null>(null);

/**
 * App-level toasts for the mock bank (e.g. "Paid USD 50.00 to Jane Smith").
 * Rendered bottom-left so they never cover the agent panel on the right.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback<ShowToast>((message, tone = "success") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <span className="toast-icon" aria-hidden="true">
              {t.tone === "success" ? "✓" : "!"}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** No-op outside a ToastProvider, so screens still render in isolation (tests, tour). */
export function useToast(): ShowToast {
  return useContext(ToastContext) ?? (() => undefined);
}
