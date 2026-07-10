'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAppSelector } from '@/store/hooks';

/**
 * Client-side route protection.
 *
 * - Public routes (`/`, `/auth/login`, `/auth/register`) are always reachable.
 * - Every other route requires authentication; an unauthenticated visit is sent
 *   to the login page.
 * - `/teacher/*` and `/student/*` additionally require the matching role; a
 *   wrong-role visit is sent to the dashboard.
 * - Already-authenticated users are kept out of the auth pages.
 *
 * Redirects wait until the persisted session has been read (`initialized`), so a
 * page refresh never briefly bounces a logged-in user to the login screen.
 * Logout itself navigates to `/` (see the navbar); this guard only handles
 * direct/failed access to protected routes.
 */

const AUTH_PAGES = new Set(['/auth/login', '/auth/register']);

/** Roles allowed on a path, or null if the path is public. */
function requiredRoles(pathname: string): string[] | null {
  if (pathname.startsWith('/teacher')) return ['teacher', 'admin'];
  if (pathname.startsWith('/student')) return ['student'];
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    return ['teacher', 'admin', 'student'];
  }
  return null;
}

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, initialized, user } = useAppSelector((s) => s.auth);

  const roles = requiredRoles(pathname);
  const isProtected = roles !== null;
  const isAuthPage = AUTH_PAGES.has(pathname);
  const roleMismatch =
    !!roles && isAuthenticated && !!user && !roles.includes(user.role);

  useEffect(() => {
    if (!initialized) return;
    if (isProtected && !isAuthenticated) {
      router.replace('/auth/login');
    } else if (roleMismatch) {
      router.replace('/dashboard');
    } else if (isAuthPage && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [initialized, isAuthenticated, isProtected, roleMismatch, isAuthPage, router, pathname]);

  // Hold protected routes until we know the real auth state, and render nothing
  // while a redirect is in flight so protected content never flashes.
  const redirecting =
    (isProtected && initialized && !isAuthenticated) ||
    roleMismatch ||
    (isAuthPage && initialized && isAuthenticated);

  if (isProtected && !initialized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (redirecting) return null;

  return <>{children}</>;
}
