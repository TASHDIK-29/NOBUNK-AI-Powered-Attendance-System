import Image from 'next/image';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface/50">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-primary">
            <Image
              src="/logo.png"
              alt="NoBunk logo"
              width={100}
              height={100}
              className="h-full w-full object-cover"
            />
          </span>
          <span className="font-semibold text-foreground text-xl">NoBunk</span>
        </div>
        <p className="text-xs">
          Private &amp; secure · Accurate every class · Attendance in seconds
        </p>
      </div>
    </footer>
  );
}
