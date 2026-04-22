"use client";

import type { ReactElement, KeyboardEvent, MutableRefObject } from "react";
import { useCallback, useRef, useState } from "react";
import { Compass, Focus } from "lucide-react";
import { cn } from "@/lib/utils";

const SCALE_MIN = 0.28;
const SCALE_MAX = 3.8;
/** Fixed tilt for city-builder style “plate” (concept: isometric field you orbit). */
const ISO_TILT_DEG = 50;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function clampScale(s: number) {
  return Number(clamp(s, SCALE_MIN, SCALE_MAX).toFixed(3));
}

/** Optional bridge when children are a self-contained WebGL scene (e.g. tactical isometric). */
export type SceneViewportControls = {
  setNorth: () => void;
  resetView: () => void;
};

export type Grid2DViewportProps = {
  children: React.ReactNode;
  className?: string;
  toolbarClassName?: string;
  gameMode?: boolean;
  /** Skip CSS plate transform; pointer/wheel go to children; North/Reset call `sceneControlRef`. */
  isoScene?: boolean;
  sceneControlRef?: MutableRefObject<SceneViewportControls | null>;
};

type DragState =
  | { type: "rotate"; pointerId: number; originX: number; originY: number; originDeg: number }
  | { type: "pan"; pointerId: number; originX: number; originY: number; originPanX: number; originPanY: number };

/**
 * Command field: **mouse** — pan (LMB / MMB), orbit yaw (RMB / Shift+LMB / Ctrl+LMB), **wheel zoom**.
 * **North** + **Reset** only in chrome. Optional `gameMode` adds a fixed isometric tilt + orbit around Z.
 */
export function Grid2DViewport({
  children,
  className,
  toolbarClassName,
  gameMode,
  isoScene,
  sceneControlRef,
}: Grid2DViewportProps): ReactElement {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [deg, setDeg] = useState(0);
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [snapTransition, setSnapTransition] = useState(true);

  const setNorth = useCallback(() => {
    if (isoScene && sceneControlRef?.current) {
      sceneControlRef.current.setNorth();
      return;
    }
    setSnapTransition(true);
    setDeg(0);
  }, [isoScene, sceneControlRef]);

  const resetView = useCallback(() => {
    if (isoScene && sceneControlRef?.current) {
      sceneControlRef.current.resetView();
      return;
    }
    setSnapTransition(true);
    setDeg(0);
    setScale(1);
    setPanX(0);
    setPanY(0);
  }, [isoScene, sceneControlRef]);

  /** 2D-only: zoom toward cursor. Isometric plate uses centre zoom (wheel only). */
  const zoomToward = useCallback(
    (prevScale: number, nextScale: number, mx: number, my: number, rect: DOMRectReadOnly) => {
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
    },
    [deg, panX, panY],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (Math.abs(e.deltaY) < 0.5) return;
      e.preventDefault();
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const prev = scale;
      const factor = e.deltaY > 0 ? 0.92 : 1.09;
      const next = clampScale(prev * factor);
      if (next === prev) return;
      setSnapTransition(false);
      if (gameMode && !isoScene) {
        setScale(next);
        return;
      }
      if (isoScene) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      zoomToward(prev, next, mx, my, rect);
    },
    [scale, zoomToward, gameMode, isoScene],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isoScene) return;
      const rotateMode = e.button === 2 || (e.button === 0 && (e.shiftKey || e.ctrlKey));
      const panMode = e.button === 1 || (e.button === 0 && !e.shiftKey && !e.ctrlKey);

      if (!rotateMode && !panMode) return;
      e.preventDefault();
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setSnapTransition(false);
      if (rotateMode) {
        setDrag({
          type: "rotate",
          pointerId: e.pointerId,
          originX: e.clientX,
          originY: e.clientY,
          originDeg: deg,
        });
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
    [deg, panX, panY, isoScene],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isoScene) return;
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (drag.type === "rotate") {
        const dx = e.clientX - drag.originX;
        const dy = e.clientY - drag.originY;
        const sensitivity = 0.62;
        const turn = (dx + dy * 0.32) * sensitivity;
        setDeg((((drag.originDeg + turn) % 360) + 360) % 360);
        return;
      }
      setPanX(drag.originPanX + (e.clientX - drag.originX));
      setPanY(drag.originPanY + (e.clientY - drag.originY));
    },
    [drag, isoScene],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isoScene) return;
    if (drag?.pointerId !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setDrag(null);
    setSnapTransition(true);
  }, [drag, isoScene]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (isoScene) {
        if (e.key === "Home" || ((e.ctrlKey || e.metaKey) && e.key === "0")) {
          e.preventDefault();
          resetView();
        }
        return;
      }
      if (e.key === "Home" || ((e.ctrlKey || e.metaKey) && e.key === "0")) {
        e.preventDefault();
        resetView();
        return;
      }

      const step = e.shiftKey ? 42 : 20;
      const isMod = e.ctrlKey || e.metaKey || e.altKey;

      if (!isMod && /^[wasdWASD]$/.test(e.key)) {
        e.preventDefault();
        const k = e.key.toLowerCase();
        if (k === "w") setPanY((y) => y + step);
        if (k === "s") setPanY((y) => y - step);
        if (k === "a") setPanX((x) => x + step);
        if (k === "d") setPanX((x) => x - step);
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPanX((x) => x + step);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPanX((x) => x - step);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPanY((y) => y + step);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPanY((y) => y - step);
        return;
      }

      const rotStep = e.shiftKey ? 12 : 3;
      if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        setSnapTransition(true);
        setDeg((d) => (((d - rotStep) % 360) + 360) % 360);
        return;
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setSnapTransition(true);
        setDeg((d) => (((d + rotStep) % 360) + 360) % 360);
      }
    },
    [resetView, isoScene],
  );

  const toolBtn =
    "inline-flex h-9 min-w-[5.5rem] items-center justify-center gap-1.5 rounded border-2 border-cyan-900/70 bg-black/80 px-3 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-200 shadow-[3px_3px_0_0_rgba(8,51,68,0.85)] transition-none hover:border-cyan-500/60 hover:bg-cyan-950/50 hover:text-cyan-50 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_rgba(8,51,68,0.85)]";

  const isPanning = drag?.type === "pan";
  const isRotating = drag?.type === "rotate";

  const hudCorner = "pointer-events-none absolute z-10 border-cyan-500/35";
  const hudSz = "h-7 w-7";

  const tfEase = snapTransition && !drag ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}>
      <div
        className={cn(
          "flex flex-wrap items-center justify-end gap-2 rounded-md border-2 border-cyan-900/55 bg-black/80 px-2 py-2 shadow-[4px_4px_0_0_rgba(6,40,52,0.9)]",
          toolbarClassName,
        )}
      >
        <button type="button" className={toolBtn} onClick={setNorth} title="Align to north (0° yaw)">
          <Compass className="h-4 w-4 shrink-0" /> North
        </button>
        <button type="button" className={toolBtn} onClick={resetView} title="Reset pan, zoom, and yaw">
          <Focus className="h-4 w-4 shrink-0" /> Reset
        </button>
      </div>

      <div
        ref={viewportRef}
        tabIndex={0}
        role="application"
        aria-label={
          isoScene
            ? "Tactical isometric field. Mouse: orbit, pan, and zoom on the map. North and Reset buttons above. Home resets view."
            : "Tactical field. Mouse: left or middle drag to pan, right drag or shift or control plus left drag to orbit yaw, wheel to zoom. North and Reset buttons above. Optional WASD and arrow pan, Q and E fine yaw, Home resets."
        }
        style={gameMode && !isoScene ? { perspective: "1400px" } : undefined}
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden rounded-md border-2 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          gameMode
            ? "border-cyan-900/55 bg-slate-950 bg-[linear-gradient(to_right,rgba(34,211,238,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(34,211,238,0.06)_1px,transparent_1px)] bg-size-[24px_24px] shadow-[inset_0_0_80px_rgba(0,0,0,0.45)]"
            : "border-cyan-900/45 bg-slate-950 bg-[linear-gradient(to_right,rgba(34,211,238,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(34,211,238,0.055)_1px,transparent_1px)] bg-size-[32px_32px]",
        )}
        onWheel={isoScene ? undefined : onWheel}
        onKeyDown={onKeyDown}
      >
        <div className={cn("pointer-events-none absolute inset-0 z-[5]", gameMode && "opacity-100")} aria-hidden>
          <div className={cn(hudCorner, hudSz, "left-2 top-2 border-l-2 border-t-2")} />
          <div className={cn(hudCorner, hudSz, "right-2 top-2 border-r-2 border-t-2")} />
          <div className={cn(hudCorner, hudSz, "bottom-2 left-2 border-b-2 border-l-2")} />
          <div className={cn(hudCorner, hudSz, "bottom-2 right-2 border-b-2 border-r-2")} />
          {gameMode && (
            <div className="absolute left-1/2 top-3 z-10 h-px w-[min(40%,200px)] -translate-x-1/2 bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
          )}
        </div>

        <div
          className={cn(
            "absolute inset-0 touch-none select-none",
            isoScene && "pointer-events-none",
            !isoScene && isRotating && "cursor-move",
            !isoScene && isPanning && "cursor-grabbing",
            !isoScene && !isPanning && !isRotating && "cursor-grab",
          )}
          onPointerDownCapture={isoScene ? undefined : onPointerDown}
          onPointerMove={isoScene ? undefined : onPointerMove}
          onPointerUp={isoScene ? undefined : endDrag}
          onPointerCancel={isoScene ? undefined : endDrag}
          onContextMenu={isoScene ? undefined : (e) => e.preventDefault()}
          onAuxClick={isoScene ? undefined : (e) => e.button === 1 && e.preventDefault()}
        >
          {!isoScene && (
            <div
              className="pointer-events-none absolute right-4 top-4 z-20 flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-cyan-500/45 bg-black/70 shadow-[0_0_0_1px_rgba(34,211,238,0.15),3px_3px_0_0_rgba(6,40,52,0.85)] backdrop-blur-sm"
              style={{ transform: `rotate(${-deg}deg)` }}
            >
              <span className="text-[11px] font-black leading-none text-cyan-300">N</span>
              <div className="mt-1 h-8 w-px bg-gradient-to-b from-cyan-400 to-transparent" />
            </div>
          )}

          {isoScene ? (
            <div className="pointer-events-auto absolute inset-0 min-h-0">{children}</div>
          ) : gameMode ? (
            <div
              className={cn("absolute left-1/2 top-1/2 [transform-style:preserve-3d]", gameMode && "[image-rendering:pixelated]")}
              style={{
                transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px))`,
                transition: drag?.type !== "pan" ? tfEase : "none",
              }}
            >
              <div
                style={{
                  transform: `rotateX(${ISO_TILT_DEG}deg) rotateZ(${deg}deg) scale(${scale})`,
                  transformOrigin: "50% 42%",
                  transformStyle: "preserve-3d",
                  transition: drag?.type !== "rotate" ? tfEase : "none",
                }}
              >
                {children}
              </div>
            </div>
          ) : (
            <div
              className="absolute left-1/2 top-1/2 will-change-transform"
              style={{
                transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) rotate(${deg}deg) scale(${scale})`,
                transformOrigin: "center center",
                transition: tfEase,
              }}
            >
              {children}
            </div>
          )}
        </div>

        <p className="pointer-events-none absolute bottom-2 left-3 right-3 z-10 text-center text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">
          {isoScene
            ? "Orbit · pan · wheel on map · North / Reset above"
            : "Wheel zoom · LMB / MMB pan · RMB or Shift+Ctrl+LMB orbit · North / Reset above"}
        </p>
      </div>
    </div>
  );
}
