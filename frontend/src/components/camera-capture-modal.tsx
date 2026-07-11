"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, RefreshCw, SwitchCamera, X } from "lucide-react";
import { Button, EmptyState, Modal } from "@/components/ui";

type Capture = { id: string; url: string; file: File };

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Live camera capture. Streams the device camera, snaps frames to JPEG Files,
 * and lets the user drop any shot before adding them. Front/back camera can be
 * switched (mobile); on a single-webcam device the switch is a no-op.
 *
 * Mount only while capturing so the stream starts on open and stops on unmount.
 */
export function CameraCaptureModal({
  onAdd,
  onClose,
  defaultFacingMode = "environment",
  maxCaptures,
}: {
  onAdd: (files: File[]) => void;
  onClose: () => void;
  defaultFacingMode?: "user" | "environment";
  /** Stop allowing new shots once this many have been taken. */
  maxCaptures?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturesRef = useRef<Capture[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [facingMode, setFacingMode] = useState<"user" | "environment">(defaultFacingMode);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  // Mirror captures into a ref so the once-only unmount cleanup sees the final list.
  useEffect(() => {
    capturesRef.current = captures;
  }, [captures]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // (Re)start the stream whenever the requested camera changes.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setStarting(true);
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This device or browser doesn't support camera access.");
        setStarting(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stopStream();
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        if (!cancelled) {
          setError(
            "We couldn't access the camera. Allow camera permission in your browser and try again."
          );
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [facingMode, stopStream]);

  // Stop the camera and free previews when the modal goes away.
  useEffect(() => {
    return () => {
      stopStream();
      capturesRef.current.forEach((c) => URL.revokeObjectURL(c.url));
    };
  }, [stopStream]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
    );
    if (!blob) return;

    const file = new File([blob], `photo-${uid()}.jpg`, { type: "image/jpeg" });
    // The shutter always works: if we're at the cap, drop the oldest shot so the
    // newest is kept (so a 1-photo limit just means "retake"). Never dead-ends.
    setCaptures((prev) => {
      const next = [...prev, { id: uid(), url: URL.createObjectURL(file), file }];
      if (maxCaptures != null && next.length > maxCaptures) {
        const overflow = next.slice(0, next.length - maxCaptures);
        overflow.forEach((c) => URL.revokeObjectURL(c.url));
        return next.slice(next.length - maxCaptures);
      }
      return next;
    });
  }, [maxCaptures]);

  const removeCapture = (id: string) => {
    setCaptures((prev) => {
      const found = prev.find((c) => c.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((c) => c.id !== id);
    });
  };

  const finish = () => {
    if (captures.length > 0) onAdd(captures.map((c) => c.file));
    onClose();
  };

  // A 1-shot limit is a "retake" (see capture); a larger cap keeps the newest N.
  const singleShot = maxCaptures === 1;

  return (
    <Modal
      open
      onClose={onClose}
      title="Take photos"
      description="Snap as many photos as you need. Remove any you don't want before adding them."
      icon={<Camera className="h-5 w-5" />}
      className="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {singleShot
              ? captures.length > 0
                ? "Photo ready — retake or add it"
                : "Take your photo"
              : `${captures.length} photo${captures.length === 1 ? "" : "s"} taken`}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={finish} disabled={captures.length === 0}>
              <Check className="h-4 w-4" />
              Add {captures.length > 0 ? captures.length : ""} photo
              {captures.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <EmptyState
            icon={<Camera className="h-5 w-5" />}
            title="Camera unavailable"
            description={error}
          />
        ) : (
          <>
            <div className="relative overflow-hidden rounded-xl border border-border bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="mx-auto max-h-[50vh] w-full object-contain"
              />
              {starting ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Starting camera…
                </div>
              ) : null}

              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setFacingMode((m) => (m === "user" ? "environment" : "user"))
                  }
                  className="rounded-full bg-white/15 p-2.5 text-white backdrop-blur-sm transition hover:bg-white/25"
                  aria-label="Switch camera"
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={capture}
                  disabled={starting}
                  className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-white/30 text-white backdrop-blur-sm transition hover:bg-white/50 disabled:opacity-50"
                  aria-label="Take photo"
                >
                  <Camera className="h-6 w-6" />
                </button>
              </div>
            </div>

            {captures.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {captures.map((c, index) => (
                  <div
                    key={c.id}
                    className="relative aspect-4/3 h-20 shrink-0 overflow-hidden rounded-lg border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                    <img src={c.url} alt={`Capture ${index + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeCapture(c.id)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition hover:bg-black/80"
                      aria-label={`Remove capture ${index + 1}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}
