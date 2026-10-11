"use client";

import { useEffect } from "react";

/**
 * Global client listener to prevent default browser behavior for accidental file drops.
 *
 * When a user drags or drops a file outside a designated upload drop zone,
 * browsers attempt to navigate the tab to `file:///...`, triggering:
 * "Security Error: Content at http://... may not load or link to file:///."
 *
 * This component cancels unhandled file drop navigation globally across all routes.
 */
export function GlobalClientListeners() {
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      e.preventDefault();
    };

    window.addEventListener("dragenter", prevent, true);
    window.addEventListener("dragover", prevent, true);
    window.addEventListener("drop", prevent, true);

    return () => {
      window.removeEventListener("dragenter", prevent, true);
      window.removeEventListener("dragover", prevent, true);
      window.removeEventListener("drop", prevent, true);
    };
  }, []);

  return null;
}
