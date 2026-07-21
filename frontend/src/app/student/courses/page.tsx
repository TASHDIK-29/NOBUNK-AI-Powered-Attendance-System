"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Clock, GraduationCap, Search, UserPlus } from "lucide-react";
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
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
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

  const loadPending = async () => {
    try {
      const res = await axios.get("/api/v1/courses/my-join-requests");
      setPendingIds(new Set<number>(res.data || []));
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
    void loadPending();
  }, []);

  const requestJoin = async (courseId: number) => {
    setJoiningId(courseId);
    try {
      await axios.post(`/api/v1/courses/${courseId}/join-request`);
      toast.success("Join request placed.");
      setPendingIds((prev) => new Set(prev).add(courseId));
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
      <div className="space-y-6">
        <Panel
          title="Find courses"
          description="Search by title and session"
          icon={<Search className="h-5 w-5" />}
        >
          <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={doSearch}>
            <Field label="Title">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Data Structures" />
            </Field>
            <Field label="Session">
              <Input value={session} onChange={(e) => setSession(e.target.value)} placeholder="2025-2029" />
            </Field>
            <div className="sm:col-span-2 lg:col-span-2 lg:flex lg:items-end">
              <Button type="submit" loading={searching} className="w-full sm:w-auto">
                {!searching && <Search className="h-4 w-4" />}
                Search
              </Button>
            </div>
          </form>

          <div className="mt-5">
            {results.length === 0 ? (
              <EmptyState
                icon={<Search className="h-5 w-5" />}
                title="No results yet"
                description="Search above to find courses you can join."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((r) => {
                  const enrolled = enrolledIds.has(r.id);
                  const pending = pendingIds.has(r.id);
                  return (
                    <div
                      key={r.id}
                      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-soft"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <GraduationCap className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold leading-tight">{r.title}</div>
                          <div className="truncate text-xs text-muted-foreground">{r.code}</div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Session: {r.session_target || "—"}
                      </div>
                      <div className="mt-auto border-t border-border pt-4">
                        {enrolled ? (
                          <Badge variant="success">Joined</Badge>
                        ) : pending ? (
                          <Button size="sm" variant="secondary" disabled className="w-full">
                            <Clock className="h-4 w-4" />
                            Pending Request
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={joiningId === r.id}
                            onClick={() => requestJoin(r.id)}
                            className="w-full"
                          >
                            {joiningId !== r.id && <UserPlus className="h-4 w-4" />}
                            Request
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>

        <Panel
          title="Your courses"
          description="Courses you have joined"
          icon={<GraduationCap className="h-5 w-5" />}
        >
          {mine.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-5 w-5" />}
              title="No courses yet"
              description="Once a teacher accepts your request, courses appear here."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mine.map((m) => (
                <Link
                  key={m.id}
                  href={`/student/courses/${m.id}`}
                  className="group flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-soft transition hover:border-ring/50 hover:shadow-elevated"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                      <GraduationCap className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold leading-tight">{m.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{m.code}</div>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                    <span>Session: {m.session_target || "—"}</span>
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      View attendance
                      <ChevronRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
