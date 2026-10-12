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
      // Check if event targets an input element or an explicit dropzone
      const target = e.target as HTMLElement | null;
      const isInsideDropzone = target?.closest(
        'input[type="file"], [data-dropzone="true"]'
      );

      // If dropped or dragged outside a valid drop area, suppress native navigation to file:///
      if (!isInsideDropzone) {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "none";
        }
      }
    };

    window.addEventListener("dragenter", preventFileDropNavigation, true);
    window.addEventListener("dragover", preventFileDropNavigation, true);
    window.addEventListener("drop", preventFileDropNavigation, true);
    document.addEventListener("dragenter", preventFileDropNavigation, true);
    document.addEventListener("dragover", preventFileDropNavigation, true);
    document.addEventListener("drop", preventFileDropNavigation, true);

    return () => {
      window.removeEventListener("dragenter", preventFileDropNavigation, true);
      window.removeEventListener("dragover", preventFileDropNavigation, true);
      window.removeEventListener("drop", preventFileDropNavigation, true);
      document.removeEventListener("dragenter", preventFileDropNavigation, true);
      document.removeEventListener("dragover", preventFileDropNavigation, true);
      document.removeEventListener("drop", preventFileDropNavigation, true);
    };
  }, []);

  return null;
}
