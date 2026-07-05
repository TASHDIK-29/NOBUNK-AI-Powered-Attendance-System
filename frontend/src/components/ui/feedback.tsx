import { cn } from '@/lib/cn';

/** Simple rectangular shimmer placeholder for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg bg-surface-muted',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.6s_infinite] after:bg-linear-to-r after:from-transparent after:via-foreground/5 after:to-transparent',
        className
      )}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary',
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

/** Centered placeholder for empty lists — icon, message, optional action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface-muted/50 px-6 py-10 text-center',
        className
      )}
    >
      {icon ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
