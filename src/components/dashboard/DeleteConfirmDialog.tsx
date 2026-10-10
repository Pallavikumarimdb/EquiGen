"use client";

import React, { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  companyName: string;
  isRunning?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({
  isOpen,
  companyName,
  isRunning = false,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      confirmBtnRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-white border border-[#E3DFD5] rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#1A1917]">Delete Research Report?</h3>
              <p className="text-[11px] text-[#7A7569]">This action cannot be undone</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 bg-[#FAF8F5] border border-[#E5E1D7] rounded-xl">
          <p className="text-xs text-[#3D3A32]">
            Are you sure you want to delete{" "}
            <span className="font-bold text-[#1A1917]">{companyName}</span>?
          </p>
          {isRunning && (
            <p className="text-[11px] text-amber-700 font-medium mt-1.5">
              This report is currently being processed. Deleting it will stop the running agent.
            </p>
          )}
          <p className="text-[11px] text-[#7A7569] mt-1.5">
            All associated data including financials, valuation models, and chat history will be permanently removed.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-white border border-[#D5D0C3] hover:border-[#1A1917] text-[#1A1917] text-xs font-bold rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
          >
            Delete Report
          </button>
        </div>
      </div>
    </div>
  );
}
