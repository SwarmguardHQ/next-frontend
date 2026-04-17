"use client";

import type { ReactElement } from "react";
import { useCallback, useState } from "react";
import { Compass, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export type Grid2DViewportProps = {
  /** Grid content (typically a CSS grid of cells) */
  children: React.ReactNode;
  className?: string;
  /** Toolbar placement */
  toolbarClassName?: string;
};

/**
 * Wraps a 2D grid with rotation + zoom for tactical / map views.
 * - Toolbar: coarse steps, fine slider, reset north, zoom.
 * - Shift + drag horizontally on the map to rotate.
 * - Ctrl + wheel to zoom (wheel alone scrolls the viewport).
 */
export function Grid2DViewport({ children, className, toolbarClassName }: Grid2DViewportProps): ReactElement {
  const [deg, setDeg] = useState(0);
  const [scale, setScale] = useState(1);
  const [drag, setDrag] = useState<{ pointerId: number; originX: number; originDeg: number } | null>(null);
  const [snapTransition, setSnapTransition] = useState(true);

  const bumpDeg = useCallback((delta: number) => {
    setSnapTransition(true);
    setDeg((d) => ((d + delta) % 360 + 360) % 360);
  }, []);

  const setNorth = useCallback(() => {
    setSnapTransition(true);
    setDeg(0);
  }, []);

  const bumpScale = useCallback((delta: number) => {
    setScale((s) => Number(clamp(s + delta, 0.45, 2.8).toFixed(2)));
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? -0.08 : 0.08;
    setScale((s) => Number(clamp(s + factor, 0.45, 2.8).toFixed(2)));
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setSnapTransition(false);
    setDrag({ pointerId: e.pointerId, originX: e.clientX, originDeg: deg });
  }, [deg]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.originX;
      setDeg((((drag.originDeg + dx * 0.45) % 360) + 360) % 360);
    },
    [drag],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (drag?.pointerId !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setDrag(null);
    setSnapTransition(true);
  }, [drag]);

  const toolBtn =
    "inline-flex h-8 items-center justify-center gap-1 rounded border border-cyan-900/60 bg-black/70 px-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-300 transition-colors hover:border-cyan-500/50 hover:bg-cyan-950/40 hover:text-cyan-200 disabled:opacity-40";

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border border-cyan-900/50 bg-black/70 px-2 py-2 font-mono text-[10px] text-slate-400",
          toolbarClassName,
        )}
      >
        <span className="mr-1 font-bold uppercase tracking-widest text-cyan-500">2D view</span>
        <button type="button" className={toolBtn} onClick={() => bumpDeg(-90)} title="Rotate -90°">
          <RotateCcw className="h-3.5 w-3.5" /> −90°
        </button>
        <button type="button" className={toolBtn} onClick={() => bumpDeg(-15)} title="Rotate -15°">
          −15°
        </button>
        <label className="flex items-center gap-2 px-1">
          <span className="sr-only">Rotation</span>
          <input
            type="range"
            min={0}
            max={359}
            value={Math.round(((deg % 360) + 360) % 360)}
            onChange={(ev) => {
              setSnapTransition(true);
              setDeg(Number(ev.target.value));
            }}
            className="h-1 w-24 cursor-pointer accent-cyan-500 sm:w-32"
          />
          <span className="w-9 tabular-nums text-cyan-200">{Math.round(((deg % 360) + 360) % 360)}°</span>
        </label>
        <button type="button" className={toolBtn} onClick={() => bumpDeg(15)} title="Rotate +15°">
          +15°
        </button>
        <button type="button" className={toolBtn} onClick={() => bumpDeg(90)} title="Rotate +90°">
          +90°
        </button>
        <button type="button" className={toolBtn} onClick={setNorth} title="Reset to north-up (0°)">
          <Compass className="h-3.5 w-3.5" /> North
        </button>
        <span className="mx-1 hidden h-4 w-px bg-cyan-900/60 sm:inline" aria-hidden />
        <button type="button" className={toolBtn} onClick={() => bumpScale(-0.15)} title="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="tabular-nums text-cyan-200/90">{Math.round(scale * 100)}%</span>
        <button type="button" className={toolBtn} onClick={() => setScale(1)} title="Reset zoom to 100%">
          1:1
        </button>
        <button type="button" className={toolBtn} onClick={() => bumpScale(0.15)} title="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-auto rounded-md border border-cyan-900/40 bg-slate-950/90"
        onWheel={onWheel}
      >
        {/* Screen-space north (counter-rotates with map) */}
        <div
          className="pointer-events-none absolute right-3 top-3 z-20 flex h-14 w-14 flex-col items-center rounded-full border border-cyan-500/35 bg-black/60 p-1 shadow-lg backdrop-blur-sm"
          style={{ transform: `rotate(${-deg}deg)` }}
        >
          <span className="text-[10px] font-black leading-none text-cyan-300">N</span>
          <div className="mt-0.5 h-7 w-px bg-gradient-to-b from-cyan-400 to-transparent" />
        </div>

        <div className="flex min-h-[min(100%,520px)] w-full min-w-0 items-center justify-center p-6 sm:min-h-[560px]">
          <div
            role="application"
            aria-label="Rotatable tactical grid. Hold Shift and drag horizontally to rotate. Ctrl+scroll to zoom."
            className={cn(
              "touch-pan-x touch-pan-y cursor-grab select-none active:cursor-grabbing",
              drag && "cursor-grabbing",
            )}
            style={{
              transform: `rotate(${deg}deg) scale(${scale})`,
              transformOrigin: "center center",
              transition: snapTransition && !drag ? "transform 200ms ease-out" : "none",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {children}
          </div>
        </div>

        <p className="pointer-events-none fixed bottom-4 left-0 right-0 z-50 text-center text-[9px] uppercase tracking-widest text-slate-500/80 drop-shadow-md">
          Shift + drag to rotate · Ctrl / ⌘ + wheel to zoom
        </p>
      </div>
    </div>
  );
}
