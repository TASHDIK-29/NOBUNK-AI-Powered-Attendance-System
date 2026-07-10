"use client";

import { useEffect } from "react";

// Reference-counted body scroll lock shared across every overlay (modals,
// drawers, lightbox). Nested overlays each add a lock; the body's original
// overflow is captured once when the first lock is taken and restored only when
// the last is released. This avoids the classic nested save/restore bug where an
// inner overlay's "hidden" gets captured as an outer overlay's previous value,
// leaving the page permanently unscrollable after everything closes.
let lockCount = 0;
let originalOverflow = "";

/** Lock body scroll while `active` is true. Safe to nest across components. */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = originalOverflow;
      }
    };
  }, [active]);
}
