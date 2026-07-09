"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, GraduationCap, Search, UserPlus } from "lucide-react";
import axios from "@/lib/axios";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Panel,
  PageShell,
  useToast,
} from "@/components/ui";

type CourseSummary = {
  id: number;
  title: string;
  code: string;
  session_target?: string | null;
};

export default function StudentCoursesPage() {
  const [search, setSearch] = useState("");
  const [session, setSession] = useState("");
  const [results, setResults] = useState<CourseSummary[]>([]);
  const [mine, setMine] = useState<CourseSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const toast = useToast();

  const loadMine = async () => {
    try {
      const res = await axios.get("/api/v1/courses/mine");
      setMine(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const doSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSearching(true);
    try {
      const res = await axios.get(
        `/api/v1/courses?title=${encodeURIComponent(search)}&session=${encodeURIComponent(session)}`
      );
      setResults(res.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    void loadMine();
  }, []);

  const requestJoin = async (courseId: number) => {
    setJoiningId(courseId);
    try {
      await axios.post(`/api/v1/courses/${courseId}/join-request`);
      toast.success("Join request placed.");
      loadMine();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setJoiningId(null);
    }
  };

  const enrolledIds = new Set(mine.map((m) => m.id));

  return (
    <PageShell
      eyebrow="Student"
      title="Courses"
      description="Search for courses and request to join. Your teacher approves each request."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Find courses"
          description="Search by title and session"
          icon={<Search className="h-5 w-5" />}
        >
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={doSearch}>
            <Field label="Title">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Data Structures" />
            </Field>
            <Field label="Session">
              <Input value={session} onChange={(e) => setSession(e.target.value)} placeholder="2025-2029" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={searching} className="w-full sm:w-auto">
                {!searching && <Search className="h-4 w-4" />}
                Search
              </Button>
            </div>
          </form>

          <div className="mt-5 space-y-3">
            {results.length === 0 ? (
              <EmptyState
                icon={<Search className="h-5 w-5" />}
                title="No results yet"
                description="Search above to find courses you can join."
              />
            ) : (
              results.map((r) => {
                const enrolled = enrolledIds.has(r.id);
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted/50 p-4"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold">
                        {r.title} <span className="text-muted-foreground">· {r.code}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Session: {r.session_target || "—"}
                      </div>
                    </div>
                    {enrolled ? (
                      <Badge variant="success">Joined</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={joiningId === r.id}
                        onClick={() => requestJoin(r.id)}
                      >
                        {joiningId !== r.id && <UserPlus className="h-4 w-4" />}
                        Request
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        <Panel
          title="Your courses"
          description="Courses you have joined"
          icon={<GraduationCap className="h-5 w-5" />}
        >
          <div className="space-y-3">
            {mine.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-5 w-5" />}
                title="No courses yet"
                description="Once a teacher accepts your request, courses appear here."
              />
            ) : (
              mine.map((m) => (
                <Link
                  key={m.id}
                  href={`/student/courses/${m.id}`}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted/50 p-4 transition hover:border-ring/50 hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {m.title} <span className="text-muted-foreground">· {m.code}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Session: {m.session_target || "—"} · View attendance
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              ))
            )}
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
