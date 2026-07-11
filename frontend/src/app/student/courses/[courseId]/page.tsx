"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Percent,
  ScanFace,
  XCircle,
} from "lucide-react";
import axios from "@/lib/axios";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Panel,
  PageShell,
  Skeleton,
  Stat,
  useToast,
} from "@/components/ui";
import { StudentReviewModal } from "@/components/student-review-modal";

type SessionRecord = {
  session_id: number;
  session_number: number;
  date: string;
  session_status: string;
  is_present: boolean;
  confidence: number | null;
  reviewed_manually: boolean;
  via_review: boolean;
  has_record: boolean;
  review_eligible: boolean;
  review_status: "pending" | "recognized" | "not_recognized" | "failed" | null;
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

  const toast = useToast();
  const [data, setData] = useState<CourseAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewSession, setReviewSession] = useState<SessionRecord | null>(null);

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
        toast.error(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId, load, toast]);

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
                          {s.review_status === "recognized" || s.review_status === "not_recognized" ? (
                            <Badge variant="primary">
                              <ScanFace className="h-3.5 w-3.5" />
                              Reviewed
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {new Date(s.date).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!s.is_present && s.review_eligible ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setReviewSession(s)}
                          >
                            <ScanFace className="h-3.5 w-3.5" />
                            Request review
                          </Button>
                        ) : null}
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

      {reviewSession ? (
        <StudentReviewModal
          key={reviewSession.session_id}
          sessionId={reviewSession.session_id}
          sessionNumber={reviewSession.session_number}
          onClose={() => setReviewSession(null)}
          onResolved={() => {
            void load().catch((error) => toast.error(getErrorMessage(error)));
          }}
        />
      ) : null}
    </PageShell>
  );
}
