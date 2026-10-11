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
    const preventFileDropNavigation = (e: DragEvent) => {
      // If the drag event carries files, prevent browser default navigation
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
    };

    window.addEventListener("dragenter", preventFileDropNavigation, false);
    window.addEventListener("dragover", preventFileDropNavigation, false);
    window.addEventListener("drop", preventFileDropNavigation, false);

    return () => {
      window.removeEventListener("dragenter", preventFileDropNavigation, false);
      window.removeEventListener("dragover", preventFileDropNavigation, false);
      window.removeEventListener("drop", preventFileDropNavigation, false);
    };
  }, []);

  return null;
}
