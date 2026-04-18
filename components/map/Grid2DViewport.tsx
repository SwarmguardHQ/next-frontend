"use client";

import type { ReactElement, KeyboardEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { Compass, Focus, Hand, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

const SCALE_MIN = 0.28;
const SCALE_MAX = 3.8;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function clampScale(s: number) {
  return Number(clamp(s, SCALE_MIN, SCALE_MAX).toFixed(3));
}

export type Grid2DViewportProps = {
  /** Grid content (typically a CSS grid of cells) */
  children: React.ReactNode;
  className?: string;
  /** Toolbar placement */
  toolbarClassName?: string;
};

type DragState =
  | { type: "rotate"; pointerId: number; originX: number; originDeg: number }
  | { type: "pan"; pointerId: number; originX: number; originY: number; originPanX: number; originPanY: number };

/**
 * Map-style 2D tactical stage: drag to pan, scroll to zoom (focal point follows cursor, works with rotation),
 * Shift+drag to rotate. Overflow hidden — navigation is intentional like the 3D map.
 */
export function Grid2DViewport({ children, className, toolbarClassName }: Grid2DViewportProps): ReactElement {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [deg, setDeg] = useState(0);
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [snapTransition, setSnapTransition] = useState(true);

  const bumpDeg = useCallback((delta: number) => {
    setSnapTransition(true);
    setDeg((d) => ((d + delta) % 360 + 360) % 360);
  }, []);

  const setNorth = useCallback(() => {
    setSnapTransition(true);
    setDeg(0);
  }, []);

  const resetView = useCallback(() => {
    setSnapTransition(true);
    setDeg(0);
    setScale(1);
    setPanX(0);
    setPanY(0);
  }, []);

  /** Zoom toward a point in viewport-local pixels (0..width, 0..height). */
  const zoomToward = useCallback((prevScale: number, nextScale: number, mx: number, my: number, rect: DOMRectReadOnly) => {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const px = rect.width / 2 + panX;
    const py = rect.height / 2 + panY;
    const dx = mx - px;
    const dy = my - py;
    const lx = (dx * cos + dy * sin) / prevScale;
    const ly = (-dx * sin + dy * cos) / prevScale;
    const dx2 = nextScale * (lx * cos - ly * sin);
    const dy2 = nextScale * (lx * sin + ly * cos);
    setPanX(mx - dx2 - rect.width / 2);
    setPanY(my - dy2 - rect.height / 2);
    setScale(nextScale);
  }, [deg, panX, panY]);

  const bumpScale = useCallback(
    (delta: number) => {
      const el = viewportRef.current;
      if (!el) {
        setScale((s) => clampScale(s + delta));
        return;
      }
      const rect = el.getBoundingClientRect();
      const prev = scale;
      const next = clampScale(prev + delta);
      if (next === prev) return;
      setSnapTransition(true);
      zoomToward(prev, next, rect.width / 2, rect.height / 2, rect);
    },
    [scale, zoomToward],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (Math.abs(e.deltaY) < 0.5) return;
      e.preventDefault();
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const prev = scale;
      const factor = e.deltaY > 0 ? 0.92 : 1.09;
      const next = clampScale(prev * factor);
      if (next === prev) return;
      setSnapTransition(false);
      zoomToward(prev, next, mx, my, rect);
    },
    [scale, zoomToward],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.button !== 1) return;
      e.preventDefault();
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setSnapTransition(false);
      if (e.shiftKey && e.button === 0) {
        setDrag({ type: "rotate", pointerId: e.pointerId, originX: e.clientX, originDeg: deg });
        return;
      }
      setDrag({
        type: "pan",
        pointerId: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        originPanX: panX,
        originPanY: panY,
      });
    },
    [deg, panX, panY],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (drag.type === "rotate") {
        const dx = e.clientX - drag.originX;
        setDeg((((drag.originDeg + dx * 0.45) % 360) + 360) % 360);
        return;
      }
      setPanX(drag.originPanX + (e.clientX - drag.originX));
      setPanY(drag.originPanY + (e.clientY - drag.originY));
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

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Home" || ((e.ctrlKey || e.metaKey) && e.key === "0")) {
      e.preventDefault();
      resetView();
      return;
    }
    const step = e.shiftKey ? 48 : 18;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPanX((x) => x + step);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPanX((x) => x - step);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPanY((y) => y + step);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setPanY((y) => y - step);
    }
  }, [resetView]);

  const toolBtn =
    "inline-flex h-8 items-center justify-center gap-1 rounded border-2 border-cyan-900/70 bg-black/75 px-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-300 shadow-[3px_3px_0_0_rgba(8,51,68,0.85)] transition-none hover:border-cyan-500/60 hover:bg-cyan-950/45 hover:text-cyan-100 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_rgba(8,51,68,0.85)] disabled:opacity-40";

  const isPanning = drag?.type === "pan";
  const isRotating = drag?.type === "rotate";

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border-2 border-cyan-900/55 bg-black/80 px-2 py-2 font-mono text-[10px] text-slate-400 shadow-[4px_4px_0_0_rgba(6,40,52,0.9)]",
          toolbarClassName,
        )}
      >
        <span className="mr-1 flex items-center gap-1.5 font-bold uppercase tracking-widest text-cyan-400">
          <Hand className="h-3.5 w-3.5 shrink-0" aria-hidden />
          2D ops
        </span>
        <button type="button" className={toolBtn} onClick={() => bumpDeg(-90)} title="Rotate −90°">
          <RotateCcw className="h-3.5 w-3.5" /> −90°
        </button>
        <button type="button" className={toolBtn} onClick={() => bumpDeg(-15)} title="Rotate −15°">
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
            className="h-1 w-24 cursor-pointer accent-cyan-500 sm:w-36"
          />
          <span className="w-9 tabular-nums text-cyan-200">{Math.round(((deg % 360) + 360) % 360)}°</span>
        </label>
        <button type="button" className={toolBtn} onClick={() => bumpDeg(15)} title="Rotate +15°">
          +15°
        </button>
        <button type="button" className={toolBtn} onClick={() => bumpDeg(90)} title="Rotate +90°">
          +90°
        </button>
        <button type="button" className={toolBtn} onClick={setNorth} title="North-up (0°)">
          <Compass className="h-3.5 w-3.5" /> North
        </button>
        <button type="button" className={toolBtn} onClick={resetView} title="Reset pan, zoom, and rotation">
          <Focus className="h-3.5 w-3.5" /> Reset
        </button>
        <span className="mx-1 hidden h-4 w-px bg-cyan-900/60 sm:inline" aria-hidden />
        <button type="button" className={toolBtn} onClick={() => bumpScale(-0.18)} title="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="tabular-nums text-cyan-200/90">{Math.round(scale * 100)}%</span>
        <button type="button" className={toolBtn} onClick={() => bumpScale(0.18)} title="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        ref={viewportRef}
        tabIndex={0}
        role="application"
        aria-label="Tactical grid. Drag to pan. Shift and drag to rotate. Scroll wheel to zoom. Arrow keys nudge the view when focused."
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden rounded-md border-2 border-cyan-900/45 bg-slate-950 bg-[linear-gradient(to_right,rgba(34,211,238,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(34,211,238,0.055)_1px,transparent_1px)] [background-size:32px_32px] outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
        )}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        <div
          className={cn(
            "absolute inset-0 touch-none select-none",
            isRotating && "cursor-ew-resize",
            isPanning && "cursor-grabbing",
            !isPanning && !isRotating && "cursor-grab",
          )}
          onPointerDownCapture={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onAuxClick={(e) => e.button === 1 && e.preventDefault()}
        >
          <div
            className="pointer-events-none absolute right-3 top-3 z-20 flex h-14 w-14 flex-col items-center rounded-full border-2 border-cyan-500/40 bg-black/65 p-1 shadow-[3px_3px_0_0_rgba(6,40,52,0.75)] backdrop-blur-sm"
            style={{ transform: `rotate(${-deg}deg)` }}
          >
            <span className="text-[10px] font-black leading-none text-cyan-300">N</span>
            <div className="mt-0.5 h-7 w-px bg-gradient-to-b from-cyan-400 to-transparent" />
          </div>

          <div
            className="absolute left-1/2 top-1/2 will-change-transform"
            style={{
              transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) rotate(${deg}deg) scale(${scale})`,
              transformOrigin: "center center",
              transition: snapTransition && !drag ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
            }}
          >
            {children}
          </div>
        </div>

        <p className="pointer-events-none absolute bottom-2 left-3 right-3 z-10 text-center text-[9px] font-medium uppercase tracking-[0.2em] text-slate-500">
          Drag pan · Shift+drag rotate · Scroll zoom · Arrows nudge · Home reset
        </p>
      </div>
    </div>
  );
}
