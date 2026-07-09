"use client";

import { useEffect, useState } from "react";
import { Check, Inbox, X } from "lucide-react";
import axios from "@/lib/axios";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Avatar,
  Button,
  ButtonLink,
  EmptyState,
  Panel,
  PageShell,
  useToast,
} from "@/components/ui";

type JoinRequestItem = {
  id: number;
  student_id: number;
  course_id: number;
  created_at: string;
  student_name?: string | null;
  session_year?: string | null;
  course_title?: string | null;
  course_session?: string | null;
};

export default function TeacherJoinRequestsPage() {
  const toast = useToast();
  const [requests, setRequests] = useState<JoinRequestItem[]>([]);
  const [decidingId, setDecidingId] = useState<number | null>(null);

  const load = async () => {
    try {
      const res = await axios.get("/api/v1/teacher/join-requests");
      setRequests(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const decide = async (id: number, accept: boolean) => {
    setDecidingId(id);
    try {
      await axios.post(`/api/v1/teacher/join-requests/${id}/decide?accept=${accept}`);
      toast.success(`Request ${accept ? "accepted" : "rejected"}.`);
      await load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <PageShell
      eyebrow="Teacher"
      title="Join requests"
      description="Review and decide on pending student requests to join your courses."
      actions={
        <ButtonLink href="/teacher/courses" variant="secondary">
          Courses
        </ButtonLink>
      }
    >
      <Panel
        title="Pending requests"
        description={requests.length ? `${requests.length} awaiting your decision` : undefined}
        icon={<Inbox className="h-5 w-5" />}
      >
        <div className="space-y-3">
          {requests.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title="No pending requests"
              description="New join requests from students will appear here."
            />
          ) : (
            requests.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-4 rounded-xl border border-border bg-surface-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={r.student_name || `Student ${r.student_id}`} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {r.student_name || `Student ${r.student_id}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ID {r.student_id} · Session {r.session_year || r.course_session || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Course: {r.course_title || r.course_id} · Requested {r.created_at}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    loading={decidingId === r.id}
                    onClick={() => decide(r.id, true)}
                  >
                    {decidingId !== r.id && <Check className="h-4 w-4" />}
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={decidingId === r.id}
                    onClick={() => decide(r.id, false)}
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </PageShell>
  );
}
