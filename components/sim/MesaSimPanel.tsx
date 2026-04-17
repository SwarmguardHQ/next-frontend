"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorldStreamSimVisual } from "@/types/api_types";
import { Activity, Radar } from "lucide-react";

export type MesaSimPanelProps = {
  /** inline = single row; card = dashboard block; full = dedicated page section */
  variant?: "inline" | "card" | "full";
  simVisual: WorldStreamSimVisual | null;
  streamLive: boolean;
  mesaBusy?: boolean;
  onMesaStep?: () => void | Promise<void>;
  /** Hide manual step (read-only awareness) */
  showStepButton?: boolean;
  className?: string;
};

/**
 * Mesa / ABM layer from `GET /world/stream` (`sim_visual`).
 * When `sim_visual` is null, the API is not exposing the Mesa bridge (e.g. `USE_MESA_SIM` off).
 */
export function MesaSimPanel({
  variant = "card",
  simVisual,
  streamLive,
  mesaBusy = false,
  onMesaStep,
  showStepButton = true,
  className,
}: MesaSimPanelProps) {
  const step = onMesaStep && showStepButton;

  const offBody = (
    <div className="space-y-1 text-[11px] leading-relaxed text-slate-500">
      {!streamLive && (
        <p>
          World stream is not connected (SSE). Open any page that uses{" "}
          <code className="rounded bg-slate-800/90 px-1 text-sky-300/90">useWorldStream</code> and ensure
          the API is reachable.
        </p>
      )}
      {streamLive && !simVisual && (
        <p>
          The API is sending ticks without a Mesa layer (<code className="rounded bg-slate-800/90 px-1">sim_visual: null</code>
          ). To drive the UI simulation: set{" "}
          <code className="rounded bg-slate-800/90 px-1 text-amber-200/90">USE_MESA_SIM=1</code> on the backend,
          install Mesa extras and <code className="rounded bg-slate-800/90 px-1">drone-sim</code>, then restart
          the API.
        </p>
      )}
    </div>
  );

  if (variant === "inline") {
    if (!simVisual || !streamLive) return null;
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border border-sky-500/25 bg-sky-950/40 px-3 py-2 font-mono text-[10px] text-sky-100/90",
          className,
        )}
      >
        <span className="flex items-center gap-1 tracking-wide text-sky-300/90">
          <Activity className="h-3 w-3" /> MESA ABM
        </span>
        <span className="text-slate-500">|</span>
        <span>step {simVisual.mesa_step}</span>
        <span>cov {simVisual.mesa_coverage_pct.toFixed(1)}%</span>
        <span>conf {simVisual.confirmed_survivors}</span>
        <span>pend {simVisual.pending_detections}</span>
        {step && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-7 border-sky-500/40 bg-slate-900/80 px-2 text-[10px] text-sky-200 hover:bg-sky-950/80"
            disabled={mesaBusy}
            onClick={() => void onMesaStep?.()}
          >
            {mesaBusy ? "…" : "+1 step"}
          </Button>
        )}
      </div>
    );
  }

  if (variant === "full") {
    return (
      <div className={cn("rounded-lg border border-violet-500/25 bg-[#111827] p-5 shadow-[0_0_0_1px_rgba(139,92,246,0.15)]", className)}>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-violet-200">
          <Radar className="h-4 w-4" />
          Mesa simulation (UI layer)
        </div>
        {simVisual ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-slate-300">
              <span>step {simVisual.mesa_step}</span>
              <span>coverage {simVisual.mesa_coverage_pct.toFixed(1)}%</span>
              <span>confirmed {simVisual.confirmed_survivors}</span>
              <span>pending {simVisual.pending_detections}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800">
              <div
                className="h-2 rounded-full bg-violet-400/90 transition-all"
                style={{ width: `${Math.min(100, simVisual.mesa_coverage_pct)}%` }}
              />
            </div>
            {step && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-violet-500/35 text-violet-100 hover:bg-violet-950/40"
                disabled={mesaBusy}
                onClick={() => void onMesaStep?.()}
              >
                {mesaBusy ? "…" : "+1 Mesa step"}
              </Button>
            )}
            {!streamLive && (
              <p className="text-[10px] text-amber-400/80">World SSE disconnected — values may be stale.</p>
            )}
          </div>
        ) : (
          offBody
        )}
      </div>
    );
  }

  /* card */
  return (
    <div className={cn("space-y-2 border-t border-slate-700/50 pt-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span className="flex items-center gap-1.5 tracking-widest uppercase text-violet-300/90">
          <Radar className="h-3.5 w-3.5" /> Mesa ABM sweep
        </span>
        {simVisual && (
          <span className="tabular-nums font-bold text-white">{simVisual.mesa_coverage_pct.toFixed(1)}%</span>
        )}
      </div>
      {simVisual ? (
        <>
          <div className="h-2 rounded-full bg-slate-800">
            <div
              className="h-2 rounded-full bg-violet-400/90 transition-all"
              style={{ width: `${Math.min(100, simVisual.mesa_coverage_pct)}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Confirmed {simVisual.confirmed_survivors} · Pending {simVisual.pending_detections} · Step{" "}
              {simVisual.mesa_step}
              {!streamLive && " · (stream offline — data may be stale)"}
            </span>
            {step && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-violet-500/35 bg-slate-900/80 text-[10px] text-violet-100 hover:bg-violet-950/50"
                disabled={mesaBusy}
                onClick={() => void onMesaStep?.()}
              >
                {mesaBusy ? "…" : "+1 Mesa step"}
              </Button>
            )}
          </div>
        </>
      ) : (
        offBody
      )}
    </div>
  );
}
