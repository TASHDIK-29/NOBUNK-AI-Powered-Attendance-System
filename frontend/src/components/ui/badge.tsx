import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
  {
    variants: {
      variant: {
        neutral: 'bg-surface-muted text-muted-foreground',
        primary: 'bg-primary/10 text-primary',
        success: 'bg-success-soft text-success',
        danger: 'bg-danger-soft text-danger',
        warning: 'bg-warning-soft text-warning',
        outline: 'border border-border text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Maps a processing/attendance status string to a sensible badge color. */
export function StatusBadge({ status }: { status?: string | null }) {
  const value = (status || 'unknown').toLowerCase();
  const variant =
    value === 'completed' || value === 'done' || value === 'present'
      ? 'success'
      : value === 'processing' || value === 'pending'
        ? 'warning'
        : value === 'failed' || value === 'error' || value === 'absent'
          ? 'danger'
          : 'neutral';
  return (
    <Badge variant={variant} className="capitalize">
      {status || 'unknown'}
    </Badge>
  );
}
