import { CalendarCheck } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface/50">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">Smart Attendance</span>
        </div>
        <p className="text-xs">
          Private &amp; secure · Accurate every class · Attendance in seconds
        </p>
      </div>
    </footer>
  );
}
