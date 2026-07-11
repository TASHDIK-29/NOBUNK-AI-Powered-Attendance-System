"use client";

import { useEffect, useState } from "react";
import { ScanFace, UploadCloud } from "lucide-react";
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
  Select,
  useToast,
} from "@/components/ui";
import { ImagePicker } from "@/components/image-picker";

type TeacherCourse = {
  id: number;
  title: string;
  code: string;
  session_target?: string | null;
};

/** Today's date as YYYY-MM-DD in the teacher's local timezone. */
function todayLocalISO() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export default function TeacherAttendancePage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [sessionDate, setSessionDate] = useState(todayLocalISO());
  const [files, setFiles] = useState<File[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [courses, setCourses] = useState<TeacherCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await axios.get("/api/v1/teacher/courses");
        setCourses(res.data || []);
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setCoursesLoading(false);
      }
    })();
  }, [toast]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!courseId) {
      toast.error("Please choose which course this is for.");
      return;
    }
    if (!sessionDate) {
      toast.error("Please choose the attendance date.");
      return;
    }
    if (files.length === 0) {
      toast.error("Please choose at least one class photo.");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("course_id", courseId);
      formData.append("session_date", sessionDate);
      files.forEach((file) => formData.append("files", file));

      await axios.post("/api/v1/attendance/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success(
        "Your class photos were uploaded. We're marking attendance now — it'll be ready on the course page in a moment."
      );
      setCourseId("");
      setSessionDate(todayLocalISO());
      setFiles([]);
      setPickerKey((k) => k + 1);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      eyebrow="Teacher"
      title="Take attendance"
      description="Upload photos of your class and everyone present is marked for you automatically."
      actions={
        <ButtonLink href="/teacher/courses" variant="secondary">
          Courses
        </ButtonLink>
      }
    >
      <div className="mx-auto max-w-2xl">
        <Panel
          title="Upload class photos"
          description="Pick the course, then add photos from a few different angles for the best results."
          icon={<UploadCloud className="h-5 w-5" />}
        >
          {!coursesLoading && courses.length === 0 ? (
            <EmptyState
              icon={<UploadCloud className="h-5 w-5" />}
              title="No courses yet"
              description="Create a course first, then come back to take attendance."
              action={<ButtonLink href="/teacher/courses">Create a course</ButtonLink>}
            />
          ) : (
            <form className="space-y-5" onSubmit={submit}>
              <Field label="Course" hint="Only courses you teach are listed here.">
                <Select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  disabled={coursesLoading}
                  required
                >
                  <option value="">
                    {coursesLoading ? "Loading your courses…" : "Select a course"}
                  </option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.id} · {c.title} ({c.code})
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Attendance date"
                hint="Choose the day this class was held."
              >
                <Input
                  type="date"
                  value={sessionDate}
                  max={todayLocalISO()}
                  onChange={(e) => setSessionDate(e.target.value)}
                  required
                />
              </Field>

              <Field
                label="Class photos"
                hint="Browse your gallery or take photos with your camera — capture a few angles so every row is covered."
              >
                <ImagePicker
                  key={pickerKey}
                  onChange={setFiles}
                  defaultFacingMode="environment"
                />
              </Field>

              <Button type="submit" block loading={loading}>
                {!loading && <ScanFace className="h-4 w-4" />}
                {loading ? "Uploading photos..." : "Upload & take attendance"}
              </Button>
            </form>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
