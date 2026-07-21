'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useAppSelector } from '@/store/hooks';
import { REPO_URL } from '@/lib/app-config';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** lucide-react dropped brand marks — GitHub's mark is inlined instead. */
function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56A10.97 10.97 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

type FooterLink = { href: string; label: string; external?: boolean };

const teacherLinks: FooterLink[] = [
  { href: '/teacher/courses', label: 'Courses' },
  { href: '/teacher/attendance', label: 'Take attendance' },
  { href: '/teacher/join-requests', label: 'Join requests' },
];

const studentLinks: FooterLink[] = [
  { href: '/student/courses', label: 'My courses' },
  { href: '/student/reference', label: 'Reference photos' },
];

const guestLinks: FooterLink[] = [
  { href: '/auth/login', label: 'Log in' },
  { href: '/auth/register', label: 'Create account' },
];

const resourceLinks: FooterLink[] = [
  { href: REPO_URL, label: 'Source on GitHub', external: true },
  { href: `${REPO_URL}/issues`, label: 'Report an issue', external: true },
  { href: `${API_URL}/docs`, label: 'API reference', external: true },
];

export default function Footer() {
  const auth = useAppSelector((s) => s.auth);
  const role = auth.user?.role;
  const productLinks = auth.isAuthenticated
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        ...(role === 'teacher' || role === 'admin' ? teacherLinks : []),
        ...(role === 'student' ? studentLinks : []),
      ]
    : guestLinks;
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-surface/50">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          {/* Brand */}
          <div className="max-w-sm space-y-4">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-primary">
                <Image
                  src="/logo.png"
                  alt="NoBunk logo"
                  width={100}
                  height={100}
                  className="h-full w-full object-cover"
                />
              </span>
              <span className="text-xl font-semibold text-foreground">NoBunk</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              AI-powered classroom attendance — a single class photo replaces the
              roll call, with a fair review flow for anyone missed.
            </p>
            <Link
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="NoBunk on GitHub"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-ring/50 hover:text-foreground"
            >
              <GithubIcon className="h-4 w-4" />
            </Link>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-foreground">Product</h3>
            <ul className="mt-4 space-y-3">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-sm font-semibold text-foreground">Resources</h3>
            <ul className="mt-4 space-y-3">
              {resourceLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
                  >
                    {link.label}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>&copy; {year} NoBunk. All rights reserved.</p>
          <p>Private &amp; secure · Accurate every class · Attendance in seconds</p>
        </div>
      </div>
    </footer>
  );
}
