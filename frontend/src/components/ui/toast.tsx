'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { StatusKind } from './alert';

/** Optional call-to-action link rendered inside a toast (e.g. the source repo). */
type ToastLink = { href: string; label: string };

type ToastItem = { id: number; kind: StatusKind; message: string; link?: ToastLink };

type ToastApi = {
  push: (kind: StatusKind, message: string, link?: ToastLink) => void;
  success: (message: string, link?: ToastLink) => void;
  error: (message: string, link?: ToastLink) => void;
  info: (message: string, link?: ToastLink) => void;
};

const config: Record<StatusKind, { className: string; Icon: typeof Info }> = {
  success: {
    className: 'border-success/25 bg-success-soft text-success',
    Icon: CheckCircle2,
  },
  error: {
    className: 'border-danger/25 bg-danger-soft text-danger',
    Icon: XCircle,
  },
  info: {
    className: 'border-border bg-surface text-foreground',
    Icon: Info,
  },
};

const ToastContext = createContext<ToastApi | null>(null);

/** How long each toast stays on screen before it auto-dismisses. */
const TOAST_TTL = 5000;

/**
 * App-wide toast notifications. Wrap the tree once (in providers) and call
 * `useToast()` anywhere to raise transient success/error/info messages.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: StatusKind, message: string, link?: ToastLink) => {
      const id = (idRef.current += 1);
      setToasts((prev) => [...prev, { id, kind, message, link }]);
      // Give toasts with a clickable link longer so there's time to read + click.
      setTimeout(() => dismiss(id), link ? TOAST_TTL * 2 : TOAST_TTL);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (message: string, link?: ToastLink) => push('success', message, link),
      error: (message: string, link?: ToastLink) => push('error', message, link),
      info: (message: string, link?: ToastLink) => push('info', message, link),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-100 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      >
        {toasts.map((toast) => {
          const { className, Icon } = config[toast.kind];
          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                'pointer-events-auto flex w-full max-w-sm animate-fade-in-up items-start gap-3 rounded-xl border p-3.5 text-sm shadow-soft',
                className
              )}
            >
              <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden />
              <div className="flex-1 leading-6">
                <span>{toast.message}</span>
                {toast.link && (
                  <a
                    href={toast.link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block font-medium underline underline-offset-2 hover:opacity-80"
                  >
                    {toast.link.label}
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 opacity-70 transition hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
