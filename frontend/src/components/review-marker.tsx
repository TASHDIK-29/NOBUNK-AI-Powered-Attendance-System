"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Circle, Minus, Plus, Square } from "lucide-react";

export type MarkerRegion = { x: number; y: number; w: number; h: number };
export type MarkerShape = "circle" | "square";
export type MarkerValue = { region: MarkerRegion; shape: MarkerShape };

// Marker geometry, in on-screen pixels relative to the image box.
type Marker = { cx: number; cy: number; d: number };

const MIN_DIAMETER = 28; // px — small enough for a distant face, large enough to grab
const SIZE_STEP = 16; // px per +/- click

/**
 * An image with a draggable, resizable circle/square the student places over
 * their own face. The image is rendered at its natural aspect ratio with no
 * letterboxing, so a position relative to the rendered box maps 1:1 to the
 * image's natural coordinates — reported to the parent as fractions (0..1).
 */
export function ReviewMarker({
  imageUrl,
  onChange,
}: {
  imageUrl: string;
  onChange: (value: MarkerValue) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [marker, setMarker] = useState<Marker | null>(null);
  const [shape, setShape] = useState<MarkerShape>("circle");
  const drag = useRef<
    | null
    | {
        mode: "move" | "resize";
        // pointer→center offset for a move; unused for resize
        offsetX: number;
        offsetY: number;
      }
  >(null);

  const clamp = useCallback((m: Marker, w: number, h: number): Marker => {
    const maxD = Math.max(MIN_DIAMETER, Math.min(w, h));
    const d = Math.min(Math.max(m.d, MIN_DIAMETER), maxD);
    const cx = Math.min(Math.max(m.cx, d / 2), w - d / 2);
    const cy = Math.min(Math.max(m.cy, d / 2), h - d / 2);
    return { cx, cy, d };
  }, []);

  // Track the rendered image box and, in the same subscription callback, seed the
  // marker in the centre once a size is known (and re-clamp it on later resizes).
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize({ w, h });
      if (w === 0 || h === 0) return;
      setMarker((prev) =>
        prev ? clamp(prev, w, h) : clamp({ cx: w / 2, cy: h / 2, d: Math.min(w, h) * 0.32 }, w, h)
      );
    };
    // ResizeObserver fires once on observe, so we don't call measure() eagerly
    // here (which would be a synchronous setState inside the effect body).
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clamp]);

  // Report the normalized region (+ shape) whenever it changes.
  useEffect(() => {
    if (!marker || size.w === 0 || size.h === 0) return;
    const region: MarkerRegion = {
      x: (marker.cx - marker.d / 2) / size.w,
      y: (marker.cy - marker.d / 2) / size.h,
      w: marker.d / size.w,
      h: marker.d / size.h,
    };
    onChange({ region, shape });
  }, [marker, size, shape, onChange]);

  const pointerToBox = useCallback((e: PointerEvent | React.PointerEvent) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return { px: 0, py: 0 };
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  }, []);

  // Global move/up listeners while a drag is active, so the pointer can leave
  // the marker without dropping the gesture.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      e.preventDefault();
      const { px, py } = pointerToBox(e);
      setMarker((prev) => {
        if (!prev) return prev;
        if (drag.current!.mode === "move") {
          return clamp(
            { ...prev, cx: px - drag.current!.offsetX, cy: py - drag.current!.offsetY },
            size.w,
            size.h
          );
        }
        // resize: diameter follows the pointer distance from the centre
        const radius = Math.max(Math.abs(px - prev.cx), Math.abs(py - prev.cy));
        return clamp({ ...prev, d: radius * 2 }, size.w, size.h);
      });
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [clamp, pointerToBox, size]);

  const startMove = (e: React.PointerEvent) => {
    if (!marker) return;
    e.preventDefault();
    const { px, py } = pointerToBox(e);
    drag.current = { mode: "move", offsetX: px - marker.cx, offsetY: py - marker.cy };
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { mode: "resize", offsetX: 0, offsetY: 0 };
  };

  const resize = (delta: number) => {
    setMarker((prev) => (prev ? clamp({ ...prev, d: prev.d + delta }, size.w, size.h) : prev));
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setShape("circle")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm transition ${
              shape === "circle"
                ? "bg-primary text-primary-foreground"
                : "bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            <Circle className="h-4 w-4" /> Circle
          </button>
          <button
            type="button"
            onClick={() => setShape("square")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm transition ${
              shape === "square"
                ? "bg-primary text-primary-foreground"
                : "bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            <Square className="h-4 w-4" /> Square
          </button>
        </div>

        <div className="inline-flex items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Size</span>
          <button
            type="button"
            onClick={() => resize(-SIZE_STEP)}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:text-foreground"
            aria-label="Decrease marker size"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => resize(SIZE_STEP)}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:text-foreground"
            aria-label="Increase marker size"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Image + marker overlay */}
      <div
        ref={boxRef}
        className="relative w-full touch-none select-none overflow-hidden rounded-xl border border-border bg-surface-muted"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- natural sizing drives
            the coordinate mapping; Cloudinary already serves a capped derivative. */}
        <img
          src={imageUrl}
          alt="Session photo — mark your face"
          className="block h-auto w-full"
          draggable={false}
        />

        {marker ? (
          <div
            onPointerDown={startMove}
            className="absolute cursor-move"
            style={{
              left: marker.cx - marker.d / 2,
              top: marker.cy - marker.d / 2,
              width: marker.d,
              height: marker.d,
            }}
          >
            <div
              className={`h-full w-full border-2 border-primary bg-primary/15 shadow-[0_0_0_2px_rgba(0,0,0,0.35)] ${
                shape === "circle" ? "rounded-full" : "rounded-md"
              }`}
            />
            {/* Resize handle at the bottom-right corner */}
            <span
              onPointerDown={startResize}
              className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-primary bg-surface"
              aria-label="Resize marker"
            />
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Drag the {shape} over your face and resize it (corner handle or the size buttons) so it
        frames your face snugly.
      </p>
    </div>
  );
}
