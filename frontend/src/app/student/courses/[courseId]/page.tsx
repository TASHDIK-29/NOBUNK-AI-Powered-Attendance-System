"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Percent,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import axios from "@/lib/axios";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Alert,
  Badge,
  ButtonLink,
  EmptyState,
  Panel,
  PageShell,
  Skeleton,
  Stat,
  StatusBadge,
  type StatusState,
} from "@/components/ui";

type SessionRecord = {
  session_id: number;
  session_number: number;
  date: string;
  session_status: string;
  is_present: boolean;
  confidence: number | null;
  reviewed_manually: boolean;
  has_record: boolean;
};

type CourseAttendance = {
  course: {
    id: number;
    title: string;
    code: string;
    department?: string | null;
    session_target?: string | null;
  };
  total_sessions: number;
  present_count: number;
  absent_count: number;
  attendance_score: number;
  sessions: SessionRecord[];
};

/** Color the attendance-score badge by how healthy the percentage is. */
function scoreVariant(score: number) {
  if (score >= 75) return "success" as const;
  if (score >= 50) return "warning" as const;
  return "danger" as const;
}

export default function StudentCourseAttendancePage() {
  const params = useParams<{ courseId: string }>();
  const courseId = Number(params.courseId);

  const [data, setData] = useState<CourseAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusState>(null);

  const load = useCallback(async () => {
    const res = await axios.get(`/api/v1/courses/${courseId}/my-attendance`);
    setData(res.data);
  }, [courseId]);

  useEffect(() => {
    if (!Number.isFinite(courseId)) {
      return;
    }
    void (async () => {
      try {
        await load();
      } catch (error) {
        setStatus({ kind: "error", message: getErrorMessage(error) });
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId, load]);

  if (loading && !data) {
    return (
      <PageShell
        eyebrow="Student"
        title="Loading attendance…"
        description="Fetching your session-by-session record."
      >
        <div className="space-y-6">
          <Panel title="">
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          </Panel>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Student"
      title={data ? `${data.course.title} · ${data.course.code}` : "My attendance"}
      description="Your attendance for this course, session by session."
      actions={
        <ButtonLink href="/student/courses" variant="secondary">
          Back to courses
        </ButtonLink>
      }
    >
      <div className="space-y-6">
        <Alert status={status} />

        {data ? (
          <>
            {/* Summary */}
            <Panel
              title="Your attendance"
              description="The share of this course's classes where you were marked present."
              icon={<Percent className="h-5 w-5" />}
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Score"
                  value={`${data.attendance_score.toFixed(1)}%`}
                  icon={<Percent className="h-4 w-4" />}
                />
                <Stat
                  label="Present"
                  value={data.present_count}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                />
                <Stat
                  label="Absent"
                  value={data.absent_count}
                  icon={<XCircle className="h-4 w-4" />}
                />
                <Stat
                  label="Sessions"
                  value={data.total_sessions}
                  icon={<CalendarDays className="h-4 w-4" />}
                />
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <span>Overall standing:</span>
                <Badge variant={scoreVariant(data.attendance_score)}>
                  {data.attendance_score.toFixed(1)}%
                </Badge>
              </div>
            </Panel>

            {/* Session list */}
            <Panel
              title="Sessions"
              description="Every attendance session held for this course, newest first."
              icon={<ClipboardList className="h-5 w-5" />}
            >
              {data.sessions.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays className="h-5 w-5" />}
                  title="No sessions yet"
                  description="Once your teacher runs an attendance session, it appears here."
                />
              ) : (
                <div className="space-y-3">
                  {data.sessions.map((s) => (
                    <div
                      key={s.session_id}
                      className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Session {s.session_number}</span>
                          <StatusBadge status={s.session_status} />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {new Date(s.date).toLocaleString()}
                          </span>
                          {s.is_present && s.confidence != null && !s.reviewed_manually ? (
                            <span>Recognized with {(s.confidence * 100).toFixed(0)}% confidence</span>
                          ) : null}
                          {s.reviewed_manually ? (
                            <span className="inline-flex items-center gap-1">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Marked by your teacher
                            </span>
                          ) : null}
                          {!s.has_record ? <span>Not recognized in the class photo</span> : null}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {s.is_present ? (
                          <Badge variant="success">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Present
                          </Badge>
                        ) : (
                          <Badge variant="danger">
                            <XCircle className="h-3.5 w-3.5" />
                            Absent
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
