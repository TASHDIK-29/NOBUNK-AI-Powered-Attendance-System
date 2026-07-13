"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  CheckCircle2,
  CloudOff,
  Images,
  Loader2,
  ScanFace,
  XCircle,
} from "lucide-react";
import axios from "@/lib/axios";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAiGuard } from "@/lib/use-ai-guard";
import { Button, EmptyState, Modal, Skeleton, useToast } from "@/components/ui";
import { ReviewMarker, type MarkerValue } from "@/components/review-marker";
import type { SessionImage } from "@/components/session-photos";

type ReviewStatus = "pending" | "recognized" | "not_recognized" | "failed";

type ReviewRow = {
  id: number;
  session_id: number;
  status: ReviewStatus;
  distance: number | null;
};

type Phase = "loading" | "marking" | "processing" | "recognized" | "not_recognized" | "failed";

/**
 * Guides an absent student through a one-time self-review: pick a session photo,
 * mark their face, submit, and watch the automated result. On a recognized
 * result the parent is told to refresh so the record flips to present.
 *
 * Mount per session (`key={session.id}`) so its state starts clean.
 */
export function StudentReviewModal({
  sessionId,
  sessionNumber,
  onClose,
  onResolved,
}: {
  sessionId: number;
  sessionNumber?: number;
  onClose: () => void;
  onResolved: () => void;
}) {
  const toast = useToast();
  const { requireAi } = useAiGuard();
  const [phase, setPhase] = useState<Phase>("loading");
  const [images, setImages] = useState<SessionImage[]>([]);
  const [hostingEnabled, setHostingEnabled] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [value, setValue] = useState<MarkerValue | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Load the session photos the student may mark.
  useEffect(() => {
    void (async () => {
      try {
        const res = await axios.get(`/api/v1/attendance/session/${sessionId}/review/images`);
        const list = (res.data.images ?? []) as SessionImage[];
        setImages(list);
        setHostingEnabled(Boolean(res.data.hosting_enabled));
        setSelectedId(list[0]?.id ?? null);
        setPhase("marking");
      } catch (error) {
        toast.error(getErrorMessage(error));
        onClose();
      }
    })();
  }, [sessionId, toast, onClose]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const applyStatus = useCallback((status: ReviewStatus) => {
    if (status === "recognized") setPhase("recognized");
    else if (status === "not_recognized") setPhase("not_recognized");
    else if (status === "failed") setPhase("failed");
  }, []);

  const submit = async () => {
    if (!selectedId || !value) return;
    if (!requireAi()) return;
    setSubmitting(true);
    try {
      const res = await axios.post(`/api/v1/attendance/session/${sessionId}/review`, {
        image_id: selectedId,
        region: value.region,
        shape: value.shape,
      });
      const review = res.data as ReviewRow;
      setPhase("processing");

      // Poll until the worker resolves the review.
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const poll = await axios.get(`/api/v1/attendance/review/${review.id}`);
          const status = (poll.data as ReviewRow).status;
          if (status !== "pending") {
            stopPolling();
            applyStatus(status);
          }
        } catch {
          // transient — keep polling
        }
      }, 3000);
    } catch (error) {
      toast.error(getErrorMessage(error));
      setPhase("marking");
    } finally {
      setSubmitting(false);
    }
  };

  // Closing after a decision (via X, backdrop, or Done) must refresh the parent
  // so the session row reflects the outcome without a manual page reload.
  const handleClose = useCallback(() => {
    if (phase === "recognized" || phase === "not_recognized") onResolved();
    onClose();
  }, [phase, onResolved, onClose]);

  const selectedImage = images.find((img) => img.id === selectedId) ?? null;
  const title = sessionNumber ? `Review session ${sessionNumber}` : "Request a review";

  const renderBody = () => {
    if (phase === "loading") {
      return <Skeleton className="aspect-4/3 w-full rounded-xl" />;
    }

    if (phase === "processing") {
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-medium">Checking your face…</p>
          <p className="text-sm text-muted-foreground">
            We&apos;re comparing your marked face with your reference photos. This takes a few
            seconds.
          </p>
        </div>
      );
    }

    if (phase === "recognized") {
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <p className="text-lg font-semibold">You&apos;ve been marked present</p>
          <p className="text-sm text-muted-foreground">
            We confirmed your face in the photo and updated your attendance for this session.
          </p>
        </div>
      );
    }

    if (phase === "not_recognized") {
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <XCircle className="h-10 w-10 text-red-500" />
          <p className="text-lg font-semibold">We couldn&apos;t confirm your face</p>
          <p className="text-sm text-muted-foreground">
            The marked face didn&apos;t match your reference photos closely enough, so your
            attendance wasn&apos;t changed. Reviews are limited to one per session.
          </p>
        </div>
      );
    }

    if (phase === "failed") {
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <CloudOff className="h-10 w-10 text-amber-500" />
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t process the photo this time. Your review wasn&apos;t used up — please
            try again.
          </p>
        </div>
      );
    }

    // phase === "marking"
    if (images.length === 0) {
      return hostingEnabled ? (
        <EmptyState
          icon={<Images className="h-5 w-5" />}
          title="No photos to review"
          description="This session has no archived photos, so there's nothing to mark your face in."
        />
      ) : (
        <EmptyState
          icon={<CloudOff className="h-5 w-5" />}
          title="Photo hosting is off"
          description="Image hosting isn't configured, so this session's photos weren't archived."
        />
      );
    }

    return (
      <div className="space-y-4">
        {images.length > 1 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Choose the photo you appear in
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((img, index) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSelectedId(img.id)}
                  className={`relative aspect-4/3 h-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                    img.id === selectedId ? "border-primary" : "border-border hover:border-primary/50"
                  }`}
                  aria-label={`Select photo ${index + 1}`}
                >
                  <Image
                    src={img.thumbnail_url}
                    alt={`Photo ${index + 1}`}
                    fill
                    sizes="120px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {selectedImage ? (
          <ReviewMarker
            key={selectedImage.id}
            imageUrl={selectedImage.preview_url}
            onChange={setValue}
          />
        ) : null}
      </div>
    );
  };

  const footer = (() => {
    if (phase === "marking" && images.length > 0) {
      return (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} loading={submitting} disabled={!value}>
            {!submitting && <ScanFace className="h-4 w-4" />}
            Submit for review
          </Button>
        </div>
      );
    }
    if (phase === "recognized" || phase === "not_recognized") {
      // handleClose refreshes the parent on either terminal outcome: a pass flips
      // the record to present, a rejection consumes the one attempt — both change
      // what the session row shows (Reviewed badge + hidden button).
      return (
        <div className="flex justify-end">
          <Button type="button" onClick={handleClose}>
            Done
          </Button>
        </div>
      );
    }
    if (phase === "failed") {
      return (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={() => setPhase("marking")}>
            Try again
          </Button>
        </div>
      );
    }
    return null;
  })();

  return (
    <Modal
      open
      onClose={handleClose}
      title={title}
      description="Mark your face in a class photo and we'll re-check your attendance automatically."
      icon={<ScanFace className="h-5 w-5" />}
      className="max-w-2xl"
      footer={footer}
    >
      {renderBody()}
    </Modal>
  );
}
