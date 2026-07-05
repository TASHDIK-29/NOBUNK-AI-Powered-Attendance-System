"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CalendarDays,
  ClipboardCheck,
  FileDown,
  RotateCcw,
  Search,
  UploadCloud,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import axios from "@/lib/axios";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Field,
  FileInput,
  Input,
  Modal,
  Panel,
  PageShell,
  Select,
  Skeleton,
  Stat,
  type StatusState,
} from "@/components/ui";
import { cn } from "@/lib/cn";

type CourseStudent = {
  student_id: number;
  user_id: number;
  full_name: string;
  email: string;
  attendance_score: number;
  present_count: number;
  absent_count: number;
  total_sessions: number;
};

type CourseSession = {
  id: number;
  session_number: number;
  date: string;
  status: string;
};

type CourseOverview = {
  course: {
    id: number;
    title: string;
    code: string;
    department?: string | null;
    session_target?: string | null;
  };
  total_students: number;
  total_sessions: number;
  students: CourseStudent[];
  sessions: CourseSession[];
};

type StudentSearchResult = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  student_id?: string | null;
  department?: string | null;
  session_year?: string | null;
};

/** Color the attendance-score badge by how healthy the percentage is. */
function scoreVariant(score: number) {
  if (score >= 75) return "success" as const;
  if (score >= 50) return "warning" as const;
  return "danger" as const;
}

/** Today's date as YYYY-MM-DD in the teacher's local timezone. */
function todayLocalISO() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export default function TeacherCourseDetailPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = Number(params.courseId);

  const [overview, setOverview] = useState<CourseOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [sessionDate, setSessionDate] = useState(todayLocalISO());
  const [status, setStatus] = useState<StatusState>(null);
  const [pollingSessionId, setPollingSessionId] = useState<number | null>(null);

  // Roster search + reset
  const [rosterSearch, setRosterSearch] = useState("");
  const [removingStudentId, setRemovingStudentId] = useState<number | null>(null);
  const [resettingCourse, setResettingCourse] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Add-student modal
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentSession, setStudentSession] = useState("");
  const [studentResults, setStudentResults] = useState<StudentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingStudentId, setAddingStudentId] = useState<number | null>(null);

  // Manual-attendance modal (per student)
  const [manualStudent, setManualStudent] = useState<CourseStudent | null>(null);
  const [manualSessionId, setManualSessionId] = useState("");
  const [manualPresent, setManualPresent] = useState(true);
  const [savingManual, setSavingManual] = useState(false);

  const refreshOverview = useCallback(async () => {
    const res = await axios.get(`/api/v1/teacher/courses/${courseId}/overview`);
    setOverview(res.data);
    return res.data as CourseOverview;
  }, [courseId]);

  useEffect(() => {
    if (!Number.isFinite(courseId)) {
      return;
    }
    void (async () => {
      try {
        await refreshOverview();
      } catch (error) {
        setStatus({ kind: "error", message: getErrorMessage(error) });
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId, refreshOverview]);

  useEffect(() => {
    if (!pollingSessionId) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`/api/v1/attendance/session/${pollingSessionId}/status`);
        const sessionStatus = res.data?.status;
        if (sessionStatus && sessionStatus !== "processing") {
          clearInterval(interval);
          setPollingSessionId(null);
          setStatus({
            kind: "success",
            message:
              sessionStatus === "review_needed"
                ? "Attendance is ready — a few students may need a quick check below."
                : "Attendance is ready. Scores have been updated.",
          });

          await refreshOverview();
        }
      } catch (error) {
        clearInterval(interval);
        setPollingSessionId(null);
        setStatus({ kind: "error", message: getErrorMessage(error) });
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [pollingSessionId, refreshOverview]);

  const submitImages = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sessionDate) {
      setStatus({ kind: "error", message: "Choose the attendance date." });
      return;
    }
    if (!files || files.length === 0) {
      setStatus({ kind: "error", message: "Choose at least one classroom image." });
      return;
    }

    setUploading(true);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append("course_id", String(courseId));
      formData.append("session_date", sessionDate);
      Array.from(files).forEach((file) => formData.append("files", file));

      const res = await axios.post("/api/v1/attendance/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setStatus({
        kind: "info",
        message: "Marking attendance now — scores will update automatically when it's done.",
      });
      setPollingSessionId(res.data.id);
      setSessionDate(todayLocalISO());
      setFiles(null);
    } catch (error) {
      setStatus({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setUploading(false);
    }
  };

  const searchStudents = async (event: React.FormEvent) => {
    event.preventDefault();
    setSearching(true);
    try {
      const query = new URLSearchParams();
      if (studentName.trim()) query.set("name", studentName.trim());
      if (studentSession.trim()) query.set("session_year", studentSession.trim());
      const res = await axios.get(`/api/v1/teacher/students/search?${query.toString()}`);
      setStudentResults(res.data || []);
    } catch (error) {
      setStatus({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setSearching(false);
    }
  };

  const addStudentToCourse = async (studentId: number) => {
    setAddingStudentId(studentId);
    try {
      await axios.post(`/api/v1/teacher/courses/${courseId}/students/${studentId}`);
      setStatus({ kind: "success", message: "Student added to course." });
      await refreshOverview();
    } catch (error) {
      setStatus({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setAddingStudentId(null);
    }
  };

  const removeStudentFromCourse = async (studentId: number, studentName: string) => {
    if (
      !window.confirm(
        `Remove ${studentName} from this course? They will be unenrolled and all of their attendance records here will be deleted. This cannot be undone.`
      )
    ) {
      return;
    }
    setRemovingStudentId(studentId);
    setStatus(null);
    try {
      const res = await axios.delete(
        `/api/v1/teacher/courses/${courseId}/students/${studentId}`
      );
      setStatus({
        kind: "success",
        message: res.data?.message ?? `${studentName} was removed from the course.`,
      });
      await refreshOverview();
    } catch (error) {
      setStatus({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setRemovingStudentId(null);
    }
  };

  const resetCourseAttendance = async () => {
    if (
      !window.confirm(
        "Reset the ENTIRE attendance record for this course? All sessions and their records will be permanently deleted."
      )
    ) {
      return;
    }
    setResettingCourse(true);
    setStatus(null);
    try {
      const res = await axios.delete(`/api/v1/teacher/courses/${courseId}/attendance`);
      setStatus({ kind: "success", message: res.data?.message ?? "Course attendance reset." });
      setPollingSessionId(null);
      await refreshOverview();
    } catch (error) {
      setStatus({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setResettingCourse(false);
    }
  };

  const downloadAttendancePdf = async () => {
    setDownloadingPdf(true);
    setStatus(null);
    try {
      // Use fetch (not axios) for the binary download: axios' XHR adapter reads
      // responseText internally, which throws when responseType is "blob".
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(
        `${base}/api/v1/teacher/courses/${courseId}/attendance/pdf`,
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = res.headers.get("content-disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/);
      link.download = match?.[1] ?? `attendance_${overview?.course.code ?? courseId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setStatus({
        kind: "error",
        message: "Couldn't generate the attendance PDF. Please try again.",
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const openManualModal = (student: CourseStudent) => {
    setManualStudent(student);
    setManualSessionId(overview?.sessions?.[0] ? String(overview.sessions[0].id) : "");
    setManualPresent(true);
    setStatus(null);
  };

  const submitManualAttendance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualStudent || !manualSessionId) {
      setStatus({ kind: "error", message: "Choose a session to update." });
      return;
    }
    setSavingManual(true);
    try {
      await axios.put(`/api/v1/attendance/session/${manualSessionId}/manual-review`, null, {
        params: { student_id: manualStudent.user_id, is_present: manualPresent },
      });
      const sessionNo =
        overview?.sessions.find((s) => String(s.id) === manualSessionId)?.session_number ?? "?";
      setStatus({
        kind: "success",
        message: `Marked ${manualStudent.full_name} ${manualPresent ? "present" : "absent"} for session ${sessionNo}.`,
      });
      setManualStudent(null);
      await refreshOverview();
    } catch (error) {
      setStatus({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setSavingManual(false);
    }
  };

  const enrolledStudentIds = useMemo(
    () => new Set((overview?.students ?? []).map((student) => student.user_id)),
    [overview]
  );

  const filteredStudents = useMemo(() => {
    const students = overview?.students ?? [];
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        String(s.user_id).includes(q)
    );
  }, [overview, rosterSearch]);

  if (loading && !overview) {
    return (
      <PageShell eyebrow="Teacher" title="Loading course…" description="Fetching course overview.">
        <div className="space-y-6">
          {[0, 1].map((i) => (
            <Panel key={i} title="" className="gap-4">
              <div className="space-y-3">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-10 w-2/3" />
              </div>
            </Panel>
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Teacher"
      title={overview ? `${overview.course.title} · ${overview.course.code}` : "Course detail"}
      description="Upload class photos to mark attendance automatically, and manage your students below."
      actions={
        <>
          <Button type="button" onClick={() => setAddStudentOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Add student
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={downloadAttendancePdf}
            loading={downloadingPdf}
            disabled={downloadingPdf || (overview?.total_students ?? 0) === 0}
            title="Download the latest attendance as a PDF"
          >
            {!downloadingPdf && <FileDown className="h-4 w-4" />}
            Download PDF
          </Button>
          <ButtonLink href="/teacher/courses" variant="secondary">
            Back to courses
          </ButtonLink>
          <ButtonLink href="/teacher/join-requests" variant="secondary">
            Join requests
          </ButtonLink>
        </>
      }
    >
      <div className="space-y-6">
        <Alert status={status} />

        {/* Upload */}
        <Panel
          title="Take attendance"
          description="Upload photos of your class and everyone present is marked automatically. A few different angles help catch everyone."
          icon={<UploadCloud className="h-5 w-5" />}
        >
          <form className="space-y-4" onSubmit={submitImages}>
            <Field label="Attendance date" hint="Choose the day this class was held.">
              <Input
                type="date"
                value={sessionDate}
                max={todayLocalISO()}
                onChange={(e) => setSessionDate(e.target.value)}
                required
              />
            </Field>
            <Field label="Class photos" hint="Use clear photos with visible faces for the best results.">
              <FileInput multiple accept="image/*" onChange={(e) => setFiles(e.target.files)} />
            </Field>
            <Button type="submit" loading={uploading}>
              {!uploading && <UploadCloud className="h-4 w-4" />}
              {uploading ? "Uploading..." : "Upload photos"}
            </Button>
          </form>
        </Panel>

        {/* Summary */}
        <Panel
          title="Students & attendance"
          description="Each student's score is the share of classes they were present. Use Update to change any record by hand."
          icon={<Users className="h-5 w-5" />}
          action={
            (overview?.total_sessions ?? 0) > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="danger"
                loading={resettingCourse}
                onClick={resetCourseAttendance}
              >
                {!resettingCourse && <RotateCcw className="h-4 w-4" />}
                Reset all
              </Button>
            ) : null
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <Stat
              label="Students"
              value={overview?.total_students ?? 0}
              icon={<Users className="h-4 w-4" />}
            />
            <Stat
              label="Sessions"
              value={overview?.total_sessions ?? 0}
              icon={<CalendarDays className="h-4 w-4" />}
            />
          </div>

          {/* Roster search */}
          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder="Search enrolled students by name, email, or ID"
            />
          </div>

          <div className="mt-4 space-y-3">
            {(overview?.students ?? []).length === 0 ? (
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="No students enrolled"
                description="Use “Add student” in the header to start tracking attendance."
              />
            ) : filteredStudents.length === 0 ? (
              <EmptyState
                icon={<Search className="h-5 w-5" />}
                title="No matching students"
                description={`No enrolled student matches "${rosterSearch}".`}
              />
            ) : (
              filteredStudents.map((student) => (
                <div
                  key={student.user_id}
                  className="rounded-xl border border-border bg-surface-muted/40 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={student.full_name} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{student.full_name}</div>
                        <div className="truncate text-xs text-muted-foreground">{student.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={scoreVariant(student.attendance_score)}>
                        {student.attendance_score.toFixed(1)}%
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => openManualModal(student)}
                        title="Manually correct a session for this student"
                        disabled={(overview?.total_sessions ?? 0) === 0}
                      >
                        <ClipboardCheck className="h-4 w-4" />
                        Update
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        title="Remove this student from the course"
                        loading={removingStudentId === student.user_id}
                        onClick={() => removeStudentFromCourse(student.user_id, student.full_name)}
                      >
                        {removingStudentId !== student.user_id && <UserMinus className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-surface p-2">
                      <div className="font-semibold text-success">{student.present_count}</div>
                      <div className="text-muted-foreground">Present</div>
                    </div>
                    <div className="rounded-lg bg-surface p-2">
                      <div className="font-semibold text-danger">{student.absent_count}</div>
                      <div className="text-muted-foreground">Absent</div>
                    </div>
                    <div className="rounded-lg bg-surface p-2">
                      <div className="font-semibold text-foreground">{student.total_sessions}</div>
                      <div className="text-muted-foreground">Sessions</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      {/* Add-student modal */}
      <Modal
        open={addStudentOpen}
        onClose={() => setAddStudentOpen(false)}
        title="Add student to course"
        description="Search students by name and session, then enroll them directly."
        icon={<UserPlus className="h-5 w-5" />}
      >
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={searchStudents}>
          <Field label="Student name">
            <Input
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Search by name"
            />
          </Field>
          <Field label="Session year">
            <Input
              value={studentSession}
              onChange={(e) => setStudentSession(e.target.value)}
              placeholder="2026"
            />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" block loading={searching}>
              {!searching && <Search className="h-4 w-4" />}
              Search students
            </Button>
          </div>
        </form>

        <div className="mt-5 space-y-3">
          {studentResults.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No search results yet"
              description="Search above to find students to add."
            />
          ) : (
            studentResults.map((student) => {
              const enrolled = enrolledStudentIds.has(student.id);
              return (
                <div
                  key={student.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted/40 p-4",
                    enrolled && "opacity-70"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={student.full_name} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{student.full_name}</div>
                      <div className="truncate text-xs text-muted-foreground">{student.email}</div>
                      <div className="text-xs text-muted-foreground">
                        Session: {student.session_year || "—"}
                      </div>
                    </div>
                  </div>
                  {enrolled ? (
                    <Badge variant="success">Enrolled</Badge>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={addingStudentId === student.id}
                      onClick={() => addStudentToCourse(student.id)}
                    >
                      {addingStudentId !== student.id && <UserPlus className="h-4 w-4" />}
                      Add
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Modal>

      {/* Manual-attendance modal */}
      <Modal
        open={manualStudent !== null}
        onClose={() => setManualStudent(null)}
        title="Manual attendance"
        description={
          manualStudent
            ? `Correct a specific session for ${manualStudent.full_name}.`
            : undefined
        }
        icon={<ClipboardCheck className="h-5 w-5" />}
      >
        <form className="space-y-4" onSubmit={submitManualAttendance}>
          <Field label="Session">
            <Select value={manualSessionId} onChange={(e) => setManualSessionId(e.target.value)}>
              <option value="">Select session</option>
              {overview?.sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  Session {session.session_number} · {new Date(session.date).toLocaleDateString()} ·{" "}
                  {session.status}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={manualPresent ? "present" : "absent"}
              onChange={(e) => setManualPresent(e.target.value === "present")}
            >
              <option value="present">Present</option>
              <option value="absent">Absent</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setManualStudent(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingManual}>
              {!savingManual && <ClipboardCheck className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
