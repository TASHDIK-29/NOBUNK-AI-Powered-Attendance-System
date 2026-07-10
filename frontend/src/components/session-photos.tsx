"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Images,
  Maximize2,
  RefreshCw,
  X,
} from "lucide-react";
import axios from "@/lib/axios";
import { getErrorMessage } from "@/lib/get-error-message";
import { Button, EmptyState, Modal, Skeleton, useToast } from "@/components/ui";

export type SessionImage = {
  id: number;
  url: string;
  thumbnail_url: string;
  preview_url: string;
  width: number | null;
  height: number | null;
  format: string | null;
  bytes: number | null;
  created_at: string | null;
};

type SessionImagesResponse = {
  session_id: number;
  count: number;
  hosting_enabled: boolean;
  images: SessionImage[];
};

function formatBytes(bytes: number | null) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Full-screen viewer for one photo, rendered above the gallery modal. Navigation
 * is by arrow keys or the side buttons; Escape is handled by the gallery so it
 * closes the lightbox first, then the modal.
 */
function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: SessionImage[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const image = images[index];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") onIndexChange((index + 1) % images.length);
      if (event.key === "ArrowLeft") onIndexChange((index - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, images.length, onIndexChange]);

  if (!image || typeof document === "undefined") return null;

  const dimensions = image.width && image.height ? `${image.width} × ${image.height}` : null;
  const size = formatBytes(image.bytes);

  return createPortal(
    <div className="fixed inset-0 z-60 flex flex-col bg-black/95 backdrop-blur-sm animate-fade-in-up">
      <div className="flex items-center justify-between gap-4 p-4 text-white/80">
        <div className="text-sm font-medium tabular-nums">
          Photo {index + 1} of {images.length}
          {dimensions ? <span className="ml-3 text-white/50">{dimensions}</span> : null}
          {size ? <span className="ml-3 text-white/50">{size}</span> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 transition hover:bg-white/10 hover:text-white"
          aria-label="Close photo"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-6">
        {images.length > 1 ? (
          <button
            type="button"
            onClick={() => onIndexChange((index - 1 + images.length) % images.length)}
            className="absolute left-4 z-10 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary already
            serves an auto-format, size-capped derivative; the intrinsic size is
            unknown here and object-contain must drive the layout. */}
        <img
          src={image.preview_url}
          alt={`Classroom photo ${index + 1}`}
          className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
        />

        {images.length > 1 ? (
          <button
            type="button"
            onClick={() => onIndexChange((index + 1) % images.length)}
            className="absolute right-4 z-10 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
            aria-label="Next photo"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/**
 * Gallery of the classroom photos a session's attendance was computed from.
 * Images are hosted on Cloudinary and uploaded only after attendance finishes,
 * so a just-created session may still be empty — we poll briefly while open.
 *
 * Mount this per session (`key={session.id}`) so its state starts clean.
 */
export function SessionPhotosModal({
  sessionId,
  sessionNumber,
  sessionDate,
  onClose,
}: {
  sessionId: number;
  sessionNumber?: number;
  sessionDate?: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<SessionImagesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const load = useCallback(async (id: number) => {
    const res = await axios.get(`/api/v1/attendance/session/${id}/images`);
    setData(res.data as SessionImagesResponse);
    return res.data as SessionImagesResponse;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await load(sessionId);
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, load, toast]);

  // The upload runs after attendance, so photos can appear a moment later.
  useEffect(() => {
    if (!data || data.count > 0 || !data.hosting_enabled) return;
    const interval = setInterval(() => {
      void load(sessionId).catch(() => clearInterval(interval));
    }, 4000);
    return () => clearInterval(interval);
  }, [sessionId, data, load]);

  const refresh = async () => {
    setLoading(true);
    try {
      const fresh = await load(sessionId);
      if (fresh.count === 0) {
        toast.info("The photos are still being uploaded. Try again shortly.");
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  // Escape and backdrop clicks dismiss the lightbox first, then the gallery.
  const closeTopLayer = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex(null);
      return;
    }
    onClose();
  };

  const images = data?.images ?? [];
  const dateLabel = sessionDate ? new Date(sessionDate).toLocaleDateString() : null;

  return (
    <>
      <Modal
        open
        onClose={closeTopLayer}
        title={sessionNumber ? `Session ${sessionNumber} photos` : "Session photos"}
        description={
          dateLabel
            ? `The classroom photos this session's attendance was taken from — ${dateLabel}.`
            : "The classroom photos this session's attendance was taken from."
        }
        icon={<Images className="h-5 w-5" />}
        className="max-w-4xl"
        footer={
          images.length > 0 ? (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {images.length} photo{images.length === 1 ? "" : "s"} · stored securely on Cloudinary
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={refresh} loading={loading}>
                {!loading && <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
          ) : null
        }
      >
        {loading && images.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="aspect-4/3 w-full rounded-xl" />
            ))}
          </div>
        ) : images.length === 0 ? (
          data && !data.hosting_enabled ? (
            <EmptyState
              icon={<CloudOff className="h-5 w-5" />}
              title="Photo hosting is off"
              description="Image hosting isn't configured on the server, so this session's photos weren't archived."
            />
          ) : (
            <EmptyState
              icon={<Images className="h-5 w-5" />}
              title="Photos are being uploaded"
              description="Attendance is already done — the photos are being archived in the background and will appear here in a moment."
            />
          )
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setLightboxIndex(index)}
                className="group relative aspect-4/3 overflow-hidden rounded-xl border border-border bg-surface-muted outline-none transition hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Open photo ${index + 1}`}
              >
                <Image
                  src={image.thumbnail_url}
                  alt={`Classroom photo ${index + 1}`}
                  fill
                  sizes="(max-width: 640px) 45vw, 260px"
                  className="object-cover transition duration-300 group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-linear-to-t from-black/60 via-black/0 to-black/0 opacity-0 transition group-hover:opacity-100" />
                <span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-1.5 py-0.5 text-xs font-medium text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                  {index + 1}
                </span>
                <span className="absolute right-2 top-2 rounded-md bg-black/50 p-1.5 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                  <Maximize2 className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {lightboxIndex !== null && images.length > 0 ? (
        <Lightbox
          images={images}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </>
  );
}
