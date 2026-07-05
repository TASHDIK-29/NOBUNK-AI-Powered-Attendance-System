import Link from 'next/link';
import { CalendarCheck, ShieldCheck, Target, Zap } from 'lucide-react';
import { Card } from '@/components/ui';

const highlights = [
  { icon: ShieldCheck, text: 'Your photos stay private and secure' },
  { icon: Target, text: 'Accurate matching for every class' },
  { icon: Zap, text: 'Attendance marked in seconds' },
];

/**
 * Split-panel shell shared by login and register: a branded aside on the left
 * and the form (children) on the right. Keeps both auth screens consistent.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center px-4 py-12 sm:px-6 lg:px-8">
      <Card className="grid w-full overflow-hidden lg:grid-cols-2">
        {/* Brand aside */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-linear-to-br from-primary to-indigo-500 p-10 text-white lg:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"
          />
          <Link href="/" className="relative flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <CalendarCheck className="h-5 w-5" />
            </span>
            <span className="text-sm font-bold">Smart Attendance</span>
          </Link>
          <div className="relative space-y-6">
            <h2 className="text-3xl font-bold leading-tight">{subtitle}</h2>
            <ul className="space-y-3">
              {highlights.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-white/90">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                    <Icon className="h-4 w-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-white/60">
            Privacy-first classroom attendance.
          </p>
        </div>

        {/* Form side */}
        <div className="p-8 sm:p-10">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          </div>
          {children}
        </div>
      </Card>
    </div>
  );
}
