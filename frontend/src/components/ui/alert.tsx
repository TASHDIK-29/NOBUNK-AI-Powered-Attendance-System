import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type StatusKind = 'success' | 'error' | 'info';

export type StatusState = { kind: StatusKind; message: string } | null;

const config: Record<
  StatusKind,
  { className: string; Icon: typeof Info }
> = {
  success: {
    className: 'border-success/25 bg-success-soft text-success',
    Icon: CheckCircle2,
  },
  error: {
    className: 'border-danger/25 bg-danger-soft text-danger',
    Icon: XCircle,
  },
  info: {
    className: 'border-border bg-surface-muted text-foreground',
    Icon: Info,
  },
};

/**
 * Inline feedback banner. Accepts the same `{ kind, message }` shape used across
 * the app so pages can render `<Alert status={status} />` directly.
 */
export function Alert({
  status,
  className,
}: {
  status: StatusState;
  className?: string;
}) {
  if (!status) return null;
  const { className: kindClass, Icon } = config[status.kind];
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-xl border p-3.5 text-sm',
        kindClass,
        className
      )}
    >
      <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden />
      <span className="leading-6">{status.message}</span>
    </div>
  );
}
