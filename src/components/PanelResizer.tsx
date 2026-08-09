'use client';

import React, { useEffect, useRef, useState } from 'react';

type PanelResizerProps = {
  side: 'left' | 'right';
  width: number;
  defaultWidth: number;
  min?: number;
  max?: number;
  onResize: (width: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
};

export function PanelResizer({
  side,
  width,
  defaultWidth,
  min = 200,
  max = 1000,
  onResize,
  onStart,
  onEnd,
}: PanelResizerProps) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // While dragging, lock the page cursor/selection to the resize handle
  useEffect(() => {
    if (!dragging) return;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    onStart?.();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = e.clientX - drag.startX;
    const next = side === 'right' ? drag.startWidth + delta : drag.startWidth - delta;
    onResize(Math.round(Math.min(max, Math.max(min, next))));
  };

  const finishDrag = () => {
    dragRef.current = null;
    setDragging(false);
    onEnd?.();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onDoubleClick={() => onResize(defaultWidth)}
      title="Drag to resize · double-click to reset"
      className={`group relative z-20 w-[7px] shrink-0 cursor-col-resize touch-none select-none outline-none ${dragging ? 'bg-blue-500/10' : ''}`}
    >
      {/* Vertical divider line */}
      <div className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] transition-colors ${dragging ? 'bg-blue-400' : 'bg-white/[0.08] group-hover:bg-blue-400/70'}`} />

      {/* Grab handle (dots) */}
      <div className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-[3px] rounded-full border px-[5px] py-[7px] transition-all ${dragging
        ? 'border-blue-400/40 bg-blue-500/20 opacity-100'
        : 'border-white/[0.06] bg-[#141417] opacity-0 group-hover:opacity-100'
        }`}>
        <span className="h-[2px] w-[2px] rounded-full bg-slate-400" />
        <span className="h-[2px] w-[2px] rounded-full bg-slate-400" />
        <span className="h-[2px] w-[2px] rounded-full bg-slate-400" />
      </div>
    </div>
  );
}