"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Images, X } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { SessionPhotosModal } from "@/components/session-photos";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { cn } from "@/lib/cn";

export type DrawerSession = {
  id: number;
  session_number: number;
  date: string;
  status: string;
  image_count: number;
};

/** Human label + badge tone for a session's processing status. */
function sessionStatus(status: string) {
  if (status === "completed") return { label: "Completed", variant: "success" as const };
  if (status === "review_needed") return { label: "Ready to review", variant: "success" as const };
  if (status === "processing") return { label: "Processing", variant: "warning" as const };
  if (status === "failed") return { label: "Failed", variant: "danger" as const };
  return { label: status, variant: "neutral" as const };
}

/**
 * Right-hand slide-over listing a course's attendance sessions, newest first.
 * Each row opens that session's photo gallery. The gallery modal portals to
 * <body> at the same z-index but later in the DOM, so it layers above this.
 *
 * The panel stays mounted and animates purely via CSS transitions on the `open`
 * prop, so it slides in AND out. Body scroll is locked via a shared,
 * reference-counted hook that composes safely with the gallery modal's own lock.
 */
export function SessionsDrawer({
  open,
  sessions,
  onClose,
}: {
  open: boolean;
  sessions: DrawerSession[];
  onClose: () => void;
}) {
  const [photosSession, setPhotosSession] = useState<DrawerSession | null>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      // Let the photo gallery consume Escape first when it's open.
      if (event.key === "Escape" && !photosSession) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, photosSession]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 transition-opacity duration-300",
        open ? "opacity-100" : "pointer-events-none opacity-0"
      )}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-label="Attendance sessions"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <div
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-soft",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          open ? "translate-x-0" : "translate-x-full"
        )}
        // Once the close animation finishes, drop any open gallery selection so
        // reopening the drawer always shows the list first.
        onTransitionEnd={() => {
          if (!open) setPhotosSession(null);
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold leading-tight">Attendance sessions</h2>
              <p className="text-sm text-muted-foreground">
                {sessions.length} session{sessions.length === 1 ? "" : "s"}, newest first. Open any to
                see the photos it was computed from.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {sessions.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" />}
              title="No sessions yet"
              description="Upload class photos above to take your first attendance session."
            />
          ) : (
            sessions.map((session) => {
              const status = sessionStatus(session.status);
              return (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted/40 p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Session {session.session_number}</span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(session.date).toLocaleDateString()} ·{" "}
                      {session.image_count > 0
                        ? `${session.image_count} photo${session.image_count === 1 ? "" : "s"}`
                        : "photos uploading"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setPhotosSession(session)}
                    title="View the photos used for this session"
                  >
                    <Images className="h-4 w-4" />
                    Photos
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Photo gallery — keyed so each session opens with fresh state. */}
      {open && photosSession ? (
        <SessionPhotosModal
          key={photosSession.id}
          sessionId={photosSession.id}
          sessionNumber={photosSession.session_number}
          sessionDate={photosSession.date}
          onClose={() => setPhotosSession(null)}
        />
      ) : null}
    </div>,
    document.body
  );
}
