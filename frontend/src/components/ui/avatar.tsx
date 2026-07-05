import { cn } from '@/lib/cn';

function initials(name?: string | null) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Initials avatar with a deterministic gradient derived from the name. */
export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary to-indigo-400 font-semibold text-white',
        sizes[size],
        className
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
