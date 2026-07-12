'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  GraduationCap,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanFace,
  Upload,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { clearUser } from '@/store/slices/authSlice';
import axios from '@/lib/axios';
import { Avatar, Button, ButtonLink } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import NotificationBell from '@/components/notification-bell';
import { cn } from '@/lib/cn';

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

const teacherLinks: NavItem[] = [
  { href: '/teacher/courses', label: 'Courses', icon: GraduationCap },
  { href: '/teacher/attendance', label: 'Upload', icon: Upload },
  { href: '/teacher/join-requests', label: 'Requests', icon: Inbox },
];

const studentLinks: NavItem[] = [
  { href: '/student/courses', label: 'Courses', icon: GraduationCap },
  { href: '/student/reference', label: 'Reference', icon: ScanFace },
];

function useNavLinks(role?: string): NavItem[] {
  const base: NavItem[] = [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }];
  if (role === 'teacher' || role === 'admin') return [...base, ...teacherLinks];
  if (role === 'student') return [...base, ...studentLinks];
  return base;
}

export default function Navbar() {
  const dispatch = useAppDispatch();
  const auth = useAppSelector((s) => s.auth);
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = useNavLinks(auth.user?.role);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Logging out destroys the server session (so the cookie can't be reused),
  // then clears client state and returns to the public home page. We clear
  // locally even if the request fails, so the UI never gets stuck logged in.
  const handleLogout = async () => {
    try {
      await axios.post('/api/v1/auth/logout');
    } catch {
      // ignore — clear the client either way
    }
    dispatch(clearUser());
    setMobileOpen(false);
    router.replace('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-primary shadow-soft">
            <Image
              src="/logo.png"
              alt="NoBunk logo"
              width={100}
              height={100}
              className="h-full w-full object-cover"
              priority
            />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-xl font-bold tracking-tight">NoBunk</span>
            <span className="hidden text-[11px] text-muted-foreground sm:block">
              AI attendance system
            </span>
          </span>
        </Link>

        {/* Desktop nav */}
        {auth.isAuthenticated ? (
          <nav className="hidden items-center gap-1 md:flex">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive(href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        ) : (
          <span className="hidden md:block" />
        )}

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          {auth.isAuthenticated ? <NotificationBell /> : null}
          <ThemeToggle />

          {auth.isAuthenticated ? (
            <div className="hidden items-center gap-3 md:flex">
              <div className="flex items-center gap-2.5">
                <Avatar name={auth.user?.full_name} size="sm" />
                <div className="flex flex-col text-right leading-tight">
                  <span className="text-sm font-semibold">{auth.user?.full_name}</span>
                  <span className="text-xs capitalize text-muted-foreground">
                    {auth.user?.role}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                aria-label="Log out"
                title="Log out"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <ButtonLink href="/auth/login" variant="ghost" size="sm">
                Log in
              </ButtonLink>
              <ButtonLink href="/auth/register" size="sm">
                Sign up
              </ButtonLink>
            </div>
          )}

          {/* Mobile toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen ? (
        <div className="border-t border-border bg-surface md:hidden">
          <div className="mx-auto max-w-6xl space-y-1 px-4 py-4 sm:px-6">
            {auth.isAuthenticated ? (
              <>
                <div className="mb-2 flex items-center gap-3 rounded-xl bg-surface-muted p-3">
                  <Avatar name={auth.user?.full_name} size="md" />
                  <div className="leading-tight">
                    <div className="text-sm font-semibold">{auth.user?.full_name}</div>
                    <div className="text-xs capitalize text-muted-foreground">
                      {auth.user?.role}
                    </div>
                  </div>
                </div>
                {links.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                      isActive(href)
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-surface-muted'
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                    {label}
                  </Link>
                ))}
                <Button
                  variant="secondary"
                  block
                  className="mt-2"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </Button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <ButtonLink href="/auth/login" variant="secondary" onClick={() => setMobileOpen(false)}>
                  Log in
                </ButtonLink>
                <ButtonLink href="/auth/register" onClick={() => setMobileOpen(false)}>
                  <UserRoundPlus className="h-4 w-4" />
                  Sign up
                </ButtonLink>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
