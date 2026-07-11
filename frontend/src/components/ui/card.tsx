import { cn } from '@/lib/cn';

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-surface shadow-soft',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Card with a titled header — the workhorse container that replaces the old
 * `Panel`. Pass `icon` for a leading glyph and `action` for a top-right control.
 */
export function Panel({
  title,
  description,
  icon,
  action,
  footer,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn('flex flex-col p-5 sm:p-6', className)}>
      {title || action ? (
        <div className="flex items-start justify-between gap-4">
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
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn(title ? 'mt-5' : '', 'flex-1', bodyClassName)}>{children}</div>
      {footer ? <div className="mt-5 border-t border-border pt-4">{footer}</div> : null}
    </Card>
  );
}
