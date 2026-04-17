"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, Layers } from "lucide-react";
import { MesaSimPanel } from "@/components/sim/MesaSimPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorldStream } from "@/lib/useWorldStream";
import { api } from "@/lib/api";
import type { WorldStreamSimVisual, WorldStreamTickPayload } from "@/types/api_types";

/**
 * Dedicated view for the Mesa / ABM “simulation layer” exposed on the world stream (`sim_visual`).
 * See the “What this means” section below for how this differs from normal mission UI.
 */
export default function SimulationPage() {
  const [simVisual, setSimVisual] = useState<WorldStreamSimVisual | null>(null);
  const [mesaBusy, setMesaBusy] = useState(false);

  const { worldStreamLive, refetch } = useWorldStream({
    intervalMs: 1000,
    pollingMs: 8000,
    onStreamTick: (p: WorldStreamTickPayload) => {
      setSimVisual(p.sim_visual ?? null);
    },
  });

  const handleMesaStep = useCallback(async () => {
    setMesaBusy(true);
    try {
      await api.world.mesaStep(1);
      await refetch();
    } catch {
      /* optional */
    } finally {
      setMesaBusy(false);
    }
  }, [refetch]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild className="border-slate-600 text-slate-300">
          <Link href="/">
            <ArrowLeft className="mr-1 inline h-4 w-4" />
            Dashboard
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="border-slate-600 text-slate-300">
          <Link href="/map">Live map</Link>
        </Button>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-wide text-white">
          <Layers className="h-7 w-7 text-violet-400" />
          Simulation layer
        </h1>
        <p className="mt-1 text-xs tracking-widest text-slate-500 uppercase">
          Mesa ABM bridge · same data as <code className="text-sky-400/80">/world/stream</code>
        </p>
      </div>

      <MesaSimPanel
        variant="full"
        simVisual={simVisual}
        streamLive={worldStreamLive}
        mesaBusy={mesaBusy}
        onMesaStep={handleMesaStep}
      />

      <Card className="border border-slate-700/80 bg-[#111827]">
        <CardHeader>
          <CardTitle className="text-base text-slate-100">What “simulation” means in this UI</CardTitle>
          <CardDescription className="text-slate-400">
            Two layers run in parallel in the hackathon stack — here is how they show up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-slate-300">
          <p>
            <strong className="text-slate-200">Mission / world UI</strong> (drones, survivors, coverage % in metrics)
            reflects the FastAPI <strong className="text-slate-200">WorldState</strong>: positions, batteries, who is
            detected, grid exploration. That is what operators rely on for “where are we on the mission?”.
          </p>
          <p>
            <strong className="text-slate-200">Simulation UI</strong> is an <em>extra</em> payload on the same SSE tick:{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-sky-300">sim_visual</code>. When the
            backend enables Mesa (<code className="rounded bg-slate-800 px-1 text-amber-200/90">USE_MESA_SIM=1</code>
            ), the server runs the <strong className="text-slate-200">DisasterZone</strong> agent model, syncs into
            world where configured, and sends a <strong className="text-slate-200">normalized thermal heatmap</strong>{" "}
            plus counters (Mesa step, model coverage, confirmed/pending). The map tints cells and 3D columns from that
            heatmap — that is “simulation” in the sense of <strong className="text-slate-200">ABM + thermal field</strong>
            , not a separate game client.
          </p>
          <p className="text-slate-500">
            If <code className="text-slate-400">sim_visual</code> is <code className="text-slate-400">null</code>, the
            bridge is off; the rest of the app still works with live world data only.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
