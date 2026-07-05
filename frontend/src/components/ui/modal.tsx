'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Accessible-ish modal dialog matching the Panel header style. Closes on Escape
 * or backdrop click, and locks body scroll while open. Render it unconditionally
 * and toggle via the `open` prop.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  footer,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Modals only open via client interaction, so `document` is always present
  // here; on the server (and initial render) `open` is false, so we render null
  // on both sides and avoid any hydration mismatch.
  if (!open || typeof document === 'undefined') return null;

  // Render to <body> so a transformed ancestor (e.g. PageShell's animation)
  // never becomes the containing block for our position: fixed overlay.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          'relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-soft animate-fade-in-up',
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="flex items-start gap-3">
            {icon ? (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {icon}
              </span>
            ) : null}
            <div className="space-y-1">
              {title ? <h2 className="text-lg font-semibold leading-tight">{title}</h2> : null}
              {description ? (
                <p className="text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? <div className="border-t border-border p-5">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
