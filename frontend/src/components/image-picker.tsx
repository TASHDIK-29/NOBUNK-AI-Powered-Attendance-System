"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui";
import { CameraCaptureModal } from "@/components/camera-capture-modal";

type Item = { id: string; file: File; url: string };

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Unified image chooser used wherever the app uploads photos. Offers two
 * sources — Browse Gallery and Take Photos (device camera) — and collects them
 * into one list. Every chosen image is selected by default; each thumbnail has
 * a cancel (×) to drop it before uploading.
 *
 * Uncontrolled: it owns the list and reports it via onChange. To clear it after
 * a successful upload, remount it (change its `key`) so previews are revoked.
 */
export function ImagePicker({
  onChange,
  defaultFacingMode = "environment",
  galleryLabel = "Browse Gallery",
  maxImages,
}: {
  onChange: (files: File[]) => void;
  defaultFacingMode?: "user" | "environment";
  galleryLabel?: string;
  /** Cap on how many photos may be selected; extras are ignored. */
  maxImages?: number;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [capturing, setCapturing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const atCapacity = maxImages != null && items.length >= maxImages;
  const remaining = maxImages != null ? Math.max(0, maxImages - items.length) : undefined;

  // Report the current file list to the parent whenever it changes.
  useEffect(() => {
    onChange(items.map((i) => i.file));
  }, [items, onChange]);

  // Revoke every preview URL when the picker unmounts (ref mirrors items so the
  // cleanup, which runs once, still sees the final list).
  const itemsRef = useRef<Item[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    return () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url));
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      // Cap against the count already committed (itemsRef mirrors current items).
      const room =
        maxImages == null ? images.length : Math.max(0, maxImages - itemsRef.current.length);
      const accepted = images.slice(0, room);
      if (accepted.length === 0) return;
      const added = accepted.map((file) => ({ id: uid(), file, url: URL.createObjectURL(file) }));
      setItems((prev) => [...prev, ...added]);
    },
    [maxImages]
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const found = prev.find((i) => i.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const onGalleryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(Array.from(event.target.files));
    // Reset so choosing the same file again still fires onChange.
    event.target.value = "";
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onGalleryChange}
      />

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={atCapacity}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
          {galleryLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={atCapacity}
          onClick={() => setCapturing(true)}
        >
          <Camera className="h-4 w-4" />
          Take Photos
        </Button>
      </div>

      {maxImages != null ? (
        <p className="text-xs text-muted-foreground">
          {atCapacity
            ? `Limit reached — up to ${maxImages} photo${maxImages === 1 ? "" : "s"}. Remove one to change it.`
            : `Up to ${maxImages} photo${maxImages === 1 ? "" : "s"}.`}
        </p>
      ) : null}

      {items.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{items.length}</span> photo
            {items.length === 1 ? "" : "s"} selected · tap × to remove any
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="relative aspect-4/3 overflow-hidden rounded-lg border border-border bg-surface-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img
                  src={item.url}
                  alt={`Selected photo ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition hover:bg-black/80"
                  aria-label={`Remove photo ${index + 1}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {capturing ? (
        <CameraCaptureModal
          defaultFacingMode={defaultFacingMode}
          maxCaptures={remaining}
          onAdd={addFiles}
          onClose={() => setCapturing(false)}
        />
      ) : null}
    </div>
  );
}
