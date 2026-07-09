"use client";

import { useEffect, useState } from "react";
import { FolderPlus, GraduationCap, Plus, Trash2 } from "lucide-react";
import axios from "@/lib/axios";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Button,
  ButtonLink,
  EmptyState,
  Field,
  Input,
  Panel,
  PageShell,
  useConfirm,
  useToast,
} from "@/components/ui";

type TeacherCourse = {
  id: number;
  title: string;
  code: string;
  session_target?: string | null;
};

export default function TeacherCoursesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [courses, setCourses] = useState<TeacherCourse[]>([]);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [session, setSession] = useState("");
  const [dept, setDept] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadCourses = async () => {
    try {
      const res = await axios.get("/api/v1/teacher/courses");
      setCourses(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void loadCourses();
  }, []);

  const createCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await axios.post("/api/v1/teacher/courses", {
        title,
        code,
        session_target: session,
        department: dept,
      });
      toast.success("Your course is ready.");
      setTitle("");
      setCode("");
      setSession("");
      setDept("");
      await loadCourses();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const deleteCourse = async (course: TeacherCourse) => {
    const ok = await confirm({
      title: "Delete course",
      message: `Delete “${course.title}”? This permanently removes the course along with all its sessions, attendance records, and enrollments. This cannot be undone.`,
      confirmLabel: "Delete course",
      tone: "danger",
    });
    if (!ok) {
      return;
    }
    setDeletingId(course.id);
    try {
      await axios.delete(`/api/v1/teacher/courses/${course.id}`);
      toast.success(`“${course.title}” was deleted.`);
      await loadCourses();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <PageShell
      eyebrow="Teacher"
      title="Courses"
      description="Create courses, start sessions, and manage enrollment."
      actions={
        <ButtonLink href="/teacher/join-requests" variant="secondary">
          Join requests
        </ButtonLink>
      }
    >
      <div className="grid gap-6 lg:grid-cols-5">
        <Panel
          title="Create course"
          description="Add a new course to your list"
          icon={<FolderPlus className="h-5 w-5" />}
          className="lg:col-span-2"
        >
          <form className="space-y-4" onSubmit={createCourse}>
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Data Structures" required />
            </Field>
            <Field label="Code">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS201" required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Session">
                <Input value={session} onChange={(e) => setSession(e.target.value)} placeholder="2025-2029" />
              </Field>
              <Field label="Department">
                <Input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="Computer Science" />
              </Field>
            </div>
            <Button type="submit" block loading={creating}>
              {!creating && <Plus className="h-4 w-4" />}
              Create course
            </Button>
          </form>
        </Panel>

        <Panel
          title="Your courses"
          description="Courses you created"
          icon={<GraduationCap className="h-5 w-5" />}
          className="lg:col-span-3"
        >
          <div className="space-y-3">
            {courses.length === 0 ? (
              <EmptyState
                icon={<GraduationCap className="h-5 w-5" />}
                title="No courses yet"
                description="Create your first course using the form on the left."
              />
            ) : (
              courses.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {c.title} <span className="text-muted-foreground">· {c.code}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Session: {c.session_target || "—"}</div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <ButtonLink href={`/teacher/courses/${c.id}`} size="sm">
                      Open
                    </ButtonLink>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={deletingId === c.id}
                      onClick={() => deleteCourse(c)}
                      title="Delete this course"
                    >
                      {deletingId !== c.id && <Trash2 className="h-4 w-4" />}
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
