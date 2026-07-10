"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import axios from "@/lib/axios";
import { getErrorMessage } from "@/lib/get-error-message";
import { Badge, Button, EmptyState, Modal, Skeleton, Stat, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";

type StudentSessionAttendance = {
  session_id: number;
  session_number: number;
  date: string;
  session_status: string;
  is_present: boolean;
  confidence: number | null;
  reviewed_manually: boolean;
  has_record: boolean;
};

type StudentCourseAttendance = {
  total_sessions: number;
  present_count: number;
  absent_count: number;
  attendance_score: number;
  sessions: StudentSessionAttendance[];
};

export type StudentSummary = {
  user_id: number;
  full_name: string;
  email: string;
};

/** Color the attendance-score badge by how healthy the percentage is. */
function scoreVariant(score: number) {
  if (score >= 75) return "success" as const;
  if (score >= 50) return "warning" as const;
  return "danger" as const;
}

/**
 * Per-student attendance detail for one course: the full per-session record with
 * inline present/absent controls, so a teacher can review and correct any
 * session in one place. Mount per student (`key={student.user_id}`).
 */
export function StudentAttendanceModal({
  courseId,
  student,
  onClose,
  onChanged,
}: {
  courseId: number;
  student: StudentSummary;
  onClose: () => void;
  /** Called after a successful correction so the parent can refresh its totals. */
  onChanged: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<StudentCourseAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSessionId, setSavingSessionId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await axios.get(
      `/api/v1/teacher/courses/${courseId}/students/${student.user_id}/attendance`
    );
    setData(res.data as StudentCourseAttendance);
    return res.data as StudentCourseAttendance;
  }, [courseId, student.user_id]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [load, toast]);

  const setSessionPresence = async (session: StudentSessionAttendance, present: boolean) => {
    if (session.is_present === present || savingSessionId !== null) return;
    setSavingSessionId(session.session_id);
    try {
      await axios.put(`/api/v1/attendance/session/${session.session_id}/manual-review`, null, {
        params: { student_id: student.user_id, is_present: present },
      });
      await load();
      onChanged();
      toast.success(
        `Marked ${student.full_name} ${present ? "present" : "absent"} for session ${session.session_number}.`
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingSessionId(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={student.full_name}
      description="Review this student's record for every session, and correct any of them below."
      icon={<ClipboardCheck className="h-5 w-5" />}
      className="max-w-2xl"
    >
      {loading && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : !data || data.total_sessions === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-5 w-5" />}
          title="No sessions yet"
          description="Once you take attendance for this course, each session will appear here to review and adjust."
        />
      ) : (
        <div className="space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
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
            <div className="flex flex-col justify-center rounded-xl border border-border bg-surface-muted/40 p-4">
              <span className="text-xs text-muted-foreground">Score</span>
              <Badge variant={scoreVariant(data.attendance_score)} className="mt-1 w-fit">
                {data.attendance_score.toFixed(1)}%
              </Badge>
            </div>
          </div>

          {/* Per-session record + controls */}
          <div className="space-y-2">
            {data.sessions.map((session) => {
              const saving = savingSessionId === session.session_id;
              return (
                <div
                  key={session.session_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted/40 p-3.5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Session {session.session_number}</span>
                      {session.reviewed_manually ? (
                        <Badge variant="primary">Manually set</Badge>
                      ) : session.has_record ? null : (
                        <Badge variant="outline">No record</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(session.date).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Segmented present/absent control — active side shows the
                      current record; clicking the other side corrects it. */}
                  <div
                    className="flex shrink-0 overflow-hidden rounded-lg border border-border"
                    role="group"
                    aria-label={`Attendance for session ${session.session_number}`}
                  >
                    <button
                      type="button"
                      disabled={saving}
                      aria-pressed={session.is_present}
                      onClick={() => setSessionPresence(session, true)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60",
                        session.is_present
                          ? "bg-success text-white"
                          : "bg-surface text-muted-foreground hover:bg-success-soft hover:text-success"
                      )}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Present
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      aria-pressed={!session.is_present}
                      onClick={() => setSessionPresence(session, false)}
                      className={cn(
                        "flex items-center gap-1.5 border-l border-border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60",
                        !session.is_present
                          ? "bg-danger text-white"
                          : "bg-surface text-muted-foreground hover:bg-danger-soft hover:text-danger"
                      )}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Absent
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
