'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CalendarCheck,
  Inbox,
  Loader2,
  ScanFace,
  TriangleAlert,
  UserRoundCheck,
  UserRoundPlus,
  type LucideIcon,
} from 'lucide-react';
import axios from '@/lib/axios';
import { useAppSelector } from '@/store/hooks';
import { cn } from '@/lib/cn';

type NotificationItem = {
  id: number;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  course_id?: number | null;
  is_read: boolean;
  created_at: string;
};

/** How often to re-check the unread count while logged in. */
const POLL_INTERVAL = 30_000;

const typeIcon: Record<string, LucideIcon> = {
  join_request: UserRoundPlus,
  join_accepted: UserRoundCheck,
  join_rejected: UserRoundCheck,
  attendance_marked: CalendarCheck,
  low_attendance: TriangleAlert,
  review_recognized: ScanFace,
  review_not_recognized: ScanFace,
};

const typeAccent: Record<string, string> = {
  join_request: 'bg-primary/10 text-primary',
  join_accepted: 'bg-success-soft text-success',
  join_rejected: 'bg-danger-soft text-danger',
  attendance_marked: 'bg-primary/10 text-primary',
  low_attendance: 'bg-danger-soft text-danger',
  review_recognized: 'bg-success-soft text-success',
  review_not_recognized: 'bg-surface-muted text-muted-foreground',
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationBell() {
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/notifications/unread-count');
      setUnread(res.data?.count ?? 0);
    } catch {
      // Silent — the bell just won't badge if the request fails.
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/notifications', { params: { limit: 30 } });
      setItems(res.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll the unread count while authenticated; reset everything on logout.
  useEffect(() => {
    if (!isAuthenticated) return;
    void (async () => {
      await refreshCount();
    })();
    const id = setInterval(() => void refreshCount(), POLL_INTERVAL);
    return () => {
      clearInterval(id);
      setUnread(0);
      setItems([]);
      setOpen(false);
    };
  }, [isAuthenticated, refreshCount]);

  // Close the panel on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Opening the panel counts as reading: clear the unread badge and mark
  // everything read on the server. The list keeps this session's items visible
  // (still highlighted) so the user can see what was new before it settles.
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    void loadList();
    if (unread > 0) {
      setUnread(0);
      void axios.post('/api/v1/notifications/read-all').catch(() => {
        // Silent — the badge will re-sync on the next poll if this failed.
      });
    }
  };

  const openItem = (n: NotificationItem) => {
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  if (!isAuthenticated) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-x-4 top-16 z-50 overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96 sm:max-w-[calc(100vw-2rem)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
                  <Inbox className="h-5 w-5" />
                </span>
                <p className="text-sm font-medium">You&apos;re all caught up</p>
                <p className="text-xs text-muted-foreground">
                  New notifications will show up here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => {
                  const Icon = typeIcon[n.type] ?? Bell;
                  const accent = typeAccent[n.type] ?? 'bg-surface-muted text-muted-foreground';
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void openItem(n)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-muted',
                          !n.is_read && 'bg-primary/[0.04]'
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                            accent
                          )}
                        >
                          <Icon className="h-4.5 w-4.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">{n.title}</span>
                            {!n.is_read ? (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {n.message}
                          </span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {timeAgo(n.created_at)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
