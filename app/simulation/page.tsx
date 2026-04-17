"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, Layers } from "lucide-react";
import { MesaSimPanel } from "@/components/sim/MesaSimPanel";
import { Button } from "@/components/ui/button";
import { useWorldStream } from "@/lib/useWorldStream";
import { api } from "@/lib/api";
import type { WorldStreamSimVisual, WorldStreamTickPayload } from "@/types/api_types";

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
          <Link href="/tactical">Tactical</Link>
        </Button>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-wide text-white">
          <Layers className="h-7 w-7 text-violet-400" />
          Simulation
        </h1>
        <p className="mt-1 max-w-xl text-xs text-slate-500">
          Optional Mesa heatmap from the same tick as{" "}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-[11px] text-sky-300/90">/world/stream</code> (
          <code className="rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-400">sim_visual</code>). Setup is
          documented in <code className="rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-400">AGENTS.md</code> at
          the repo root.
        </p>
      </div>

      <MesaSimPanel
        variant="full"
        simVisual={simVisual}
        streamLive={worldStreamLive}
        mesaBusy={mesaBusy}
        onMesaStep={handleMesaStep}
      />
    </div>
  );
}
