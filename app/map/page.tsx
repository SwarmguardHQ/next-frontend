"use client";

import { useEffect, useMemo, useState } from "react";

import { useWorldStream } from "@/lib/useWorldStream";
import dynamic from "next/dynamic";
import {
  Activity,
  BatteryCharging,
  HeartPulse,
  Map as MapIcon,
  Package,
  Radar,
  Triangle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Drone, Survivor, WorldStreamTickPayload } from "@/types/api_types";

const SimulationMap3D = dynamic(
  () => import("@/components/map/SimulationMap3D"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[520px] items-center justify-center rounded-md bg-[#0d1117]">
        <span className="animate-pulse font-mono text-xs tracking-widest text-slate-500 uppercase">
          Loading 3D Engine…
        </span>
      </div>
    ),
  },
);

const GRID_SIZE = 20;

/** Align with default ``mcp-backend`` scenario depots / chargers. */
const CHARGING_STATIONS = [
  { id: "CS1", x: 0, y: 0 },
  { id: "CS2", x: 9, y: 0 },
];

const SUPPLY_DEPOTS = [
  { id: "D1", x: 0, y: 0 },
  { id: "D2", x: 9, y: 9 },
];

type ViewMode = "2d" | "3d";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeDrones(input: Drone[]): Drone[] {
  return input.map((d) => ({
    ...d,
    battery: clamp(Number(d.battery), 0, 100),
    position: {
      x: Math.round(clamp(Number(d.position?.x), 0, GRID_SIZE - 1)),
      y: Math.round(clamp(Number(d.position?.y), 0, GRID_SIZE - 1)),
    },
  }));
}

function safeSurvivors(input: Survivor[]): Survivor[] {
  return input.map((s) => ({
    ...s,
    position: {
      x: Math.round(clamp(Number(s.position?.x), 0, GRID_SIZE - 1)),
      y: Math.round(clamp(Number(s.position?.y), 0, GRID_SIZE - 1)),
    },
  }));
}

function createDemoState() {
  const drones: Drone[] = [
    {
      drone_id: "DRONE_ALPHA",
      position: { x: 10, y: 4 },
      battery: 87,
      status: "scanning",
      payload: null,
      assigned_sector: "C",
      last_seen: new Date().toISOString(),
    },
    {
      drone_id: "DRONE_BRAVO",
      position: { x: 2, y: 18 },
      battery: 38,
      status: "flying",
      payload: null,
      assigned_sector: "SW",
      last_seen: new Date().toISOString(),
    },
    {
      drone_id: "DRONE_CHARLIE",
      position: { x: 0, y: 0 },
      battery: 18,
      status: "charging",
      payload: null,
      assigned_sector: null,
      last_seen: new Date().toISOString(),
    },
    {
      drone_id: "DRONE_DELTA",
      position: { x: 18, y: 3 },
      battery: 92,
      status: "flying",
      payload: null,
      assigned_sector: "NE",
      last_seen: new Date().toISOString(),
    },
    {
      drone_id: "DRONE_ECHO",
      position: { x: 11, y: 9 },
      battery: 61,
      status: "scanning",
      payload: null,
      assigned_sector: "SE",
      last_seen: new Date().toISOString(),
    },
  ];

  const survivors: Survivor[] = [
    {
      survivor_id: "s_1",
      position: { x: 3, y: 3 },
      condition: "critical",
      detected: true,
      rescued: false,
      supplies_received: [],
    },
    {
      survivor_id: "s_2",
      position: { x: 14, y: 12 },
      condition: "moderate",
      detected: false,
      rescued: false,
      supplies_received: [],
    },
  ];

  return { drones, survivors };
}

function droneColor(status: string): string {
  if (status === "charging") return "text-emerald-400";
  if (status === "offline") return "text-red-500";
  if (status === "returning") return "text-amber-400";
  if (status === "scanning" || status === "flying") return "text-sky-400";
  return "text-slate-400";
}

function survivorColor(s: Survivor): string {
  if (s.rescued) return "text-sky-300";
  if (s.condition === "critical") return "text-red-400";
  if (s.condition === "moderate") return "text-amber-400";
  if (s.condition === "stable") return "text-emerald-400";
  return "text-slate-400";
}

export default function SimulationMapPage() {
  const [{ drones, survivors }, setState] = useState(() => createDemoState());
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [pulse, setPulse] = useState(0);
  const [simHeat, setSimHeat] = useState<number[][] | null>(null);
  const [simMeta, setSimMeta] = useState<{
    mesa_step: number;
    mesa_coverage_pct: number;
    confirmed_survivors: number;
    pending_detections: number;
  } | null>(null);

  const { droneData, survivorData, worldStreamLive, apiError } = useWorldStream({
    intervalMs: 500,
    pollingMs: 5000,
    onStreamTick: (p: WorldStreamTickPayload) => {
      const v = p.sim_visual;
      if (v?.heatmap?.length) setSimHeat(v.heatmap);
      if (v) {
        setSimMeta({
          mesa_step: v.mesa_step,
          mesa_coverage_pct: v.mesa_coverage_pct,
          confirmed_survivors: v.confirmed_survivors,
          pending_detections: v.pending_detections,
        });
      }
    },
  });

  useEffect(() => {
    const tick = window.setInterval(() => {
      setPulse((n) => (n + 1) % 2);
    }, 900);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!droneData?.drones?.length) return;
    setState((prev) => ({
      drones: safeDrones(droneData.drones),
      survivors:
        survivorData != null
          ? safeSurvivors(survivorData.survivors)
          : prev.survivors,
    }));
  }, [droneData, survivorData]);

  const cells = useMemo(() => {
    const list: { x: number; y: number }[] = [];
    for (let y = GRID_SIZE - 1; y >= 0; y -= 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) list.push({ x, y });
    }
    return list;
  }, []);

  const dronesByCell = useMemo(() => {
    const map = new Map<string, Drone[]>();
    for (const drone of drones) {
      const key = `${drone.position.x}-${drone.position.y}`;
      map.set(key, [...(map.get(key) ?? []), drone]);
    }
    return map;
  }, [drones]);

  const survivorsByCell = useMemo(() => {
    const map = new Map<string, Survivor[]>();
    for (const survivor of survivors) {
      const key = `${survivor.position.x}-${survivor.position.y}`;
      map.set(key, [...(map.get(key) ?? []), survivor]);
    }
    return map;
  }, [survivors]);

  const activeDrones = drones.filter((d) => !["offline", "idle"].includes(d.status)).length;
  const lowBatteryDrones = drones.filter((d) => d.battery <= 20).length;
  const detectedSurvivors = survivors.filter((s) => s.detected).length;
  const rescuedSurvivors = survivors.filter((s) => s.rescued).length;

  return (
    <div className="flex-1 space-y-4 rounded-lg bg-[#0d1117] p-4 text-white sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-wide text-white sm:text-3xl">
          <MapIcon className="h-7 w-7 text-sky-400" />
          Live Simulation Map
        </h2>
        <div className="flex items-center gap-2">
          <div className="mr-1 inline-flex rounded-md border border-slate-600/70 bg-slate-900/70 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("2d")}
              className={`rounded px-2 py-1 text-xs font-semibold tracking-wide ${
                viewMode === "2d"
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              2D
            </button>
            <button
              type="button"
              onClick={() => setViewMode("3d")}
              className={`rounded px-2 py-1 text-xs font-semibold tracking-wide ${
                viewMode === "3d"
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              3D
            </button>
          </div>
          <Badge className="border border-emerald-400/40 bg-emerald-500/10 text-emerald-300">
            <Radar className="h-3 w-3" />
            {viewMode === "2d" ? "SECTOR GRID 20×20" : "MAPBOX SAT · DECK.GL"}
          </Badge>
          {worldStreamLive ? (
            <Badge className="border border-sky-400/40 bg-sky-500/10 text-sky-300">
              <Wifi className="h-3 w-3" />
              WORLD SSE
            </Badge>
          ) : (
            <Badge className="border border-amber-400/40 bg-amber-500/10 text-amber-300">
              <WifiOff className="h-3 w-3" />
              {apiError ? "DEMO / OFFLINE" : "REST FALLBACK"}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-6">
        <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.18)] md:col-span-3 xl:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base tracking-wide text-white">Sector Occupancy Grid</CardTitle>
            <CardDescription className="text-slate-300">Autonomous drone and survivor telemetry overlay</CardDescription>
          </CardHeader>
          <CardContent className={viewMode === "2d" ? "overflow-x-auto p-2 sm:p-4" : "p-0"}>
            {viewMode === "2d" ? (
              <div
                className="grid gap-px rounded-md bg-slate-800/80 p-px"
                style={{
                  gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
                  width: "100%",
                  minWidth: "620px",
                  maxWidth: "980px",
                  aspectRatio: "1 / 1",
                }}
              >
                {cells.map((cell) => {
                  const key = `${cell.x}-${cell.y}`;
                  const cellDrones = dronesByCell.get(key) ?? [];
                  const cellSurvivors = survivorsByCell.get(key) ?? [];
                  const isCS = CHARGING_STATIONS.some((cs) => cs.x === cell.x && cs.y === cell.y);
                  const isDepot = SUPPLY_DEPOTS.some((d) => d.x === cell.x && d.y === cell.y);

                  const heatVal =
                    simHeat != null &&
                    Array.isArray(simHeat[cell.y]) &&
                    simHeat[cell.y][cell.x] != null &&
                    Number.isFinite(simHeat[cell.y][cell.x])
                      ? Number(simHeat[cell.y][cell.x])
                      : null;

                  return (
                    <div
                      key={key}
                      className="group relative flex aspect-square items-center justify-center bg-slate-900 transition-colors hover:bg-slate-800"
                    >
                      {heatVal != null && (
                        <div
                          className="pointer-events-none absolute inset-0 rounded-[2px]"
                          style={{
                            backgroundColor: `rgba(56, 189, 248, ${0.1 + heatVal * 0.45})`,
                          }}
                          aria-hidden
                        />
                      )}
                      {isCS && (
                        <BatteryCharging className="absolute left-1 top-1 h-3 w-3 text-emerald-800/80" />
                      )}
                      {isDepot && (
                        <Package className="absolute bottom-1 right-1 h-3 w-3 text-sky-800/80" />
                      )}

                      {(cellSurvivors.length > 0 || cellDrones.length > 0) && (
                        <span className="absolute inset-0 rounded-[2px] ring-1 ring-sky-400/15" />
                      )}

                      <div className="absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-100 shadow-xl group-hover:block">
                        ({cell.x}, {cell.y})
                        {isCS ? " • Charge" : ""}
                        {isDepot ? " • Depot" : ""}
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-1 p-1">
                        {cellSurvivors.map((s) => (
                          <HeartPulse
                            key={s.survivor_id}
                            className={`h-4 w-4 ${survivorColor(s)} ${
                              !s.detected && !s.rescued ? "opacity-45" : pulse ? "opacity-100" : "opacity-70"
                            }`}
                          />
                        ))}

                        {cellDrones.map((d) => (
                          <div key={d.drone_id} className="relative">
                            <Triangle
                              fill="currentColor"
                              className={`h-4 w-4 ${droneColor(d.status)} ${
                                d.status === "offline" ? "rotate-180" : ""
                              }`}
                            />
                            <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[9px] whitespace-nowrap font-semibold text-slate-300">
                              {d.drone_id.replace(/^(drone_|DRONE_)/, "")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <SimulationMap3D drones={drones} survivors={survivors} pulse={pulse} />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 md:col-span-1 xl:col-span-2">
          <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.18)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base tracking-wide text-white">Mission Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Fleet Active</span>
                <span className="tabular-nums text-emerald-300">{activeDrones}/{drones.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Low Battery</span>
                <span className="tabular-nums text-amber-300">{lowBatteryDrones}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Survivors Detected</span>
                <span className="tabular-nums text-slate-100">{detectedSurvivors}/{survivors.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Survivors Rescued</span>
                <span className="tabular-nums text-sky-300">{rescuedSurvivors}</span>
              </div>
              {simMeta && worldStreamLive && (
                <div className="mt-2 space-y-1 rounded-md border border-sky-500/25 bg-sky-950/30 p-2 font-mono text-[10px] text-sky-200/90">
                  <div>Mesa step {simMeta.mesa_step}</div>
                  <div>
                    Coverage {simMeta.mesa_coverage_pct.toFixed(1)}% · Confirmed{" "}
                    {simMeta.confirmed_survivors} · Pending {simMeta.pending_detections}
                  </div>
                </div>
              )}
              <div className="mt-2 rounded-md border border-slate-700/80 bg-slate-900/40 p-2 text-xs text-slate-300">
                {worldStreamLive
                  ? "Live positions + optional thermal overlay from sim_visual when USE_MESA_SIM=1."
                  : apiError
                    ? "Backend unavailable — showing demo grid until connection returns."
                    : "Using periodic REST until SSE connects."}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.18)]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base tracking-wide text-white">
                <Activity className="h-4 w-4 text-sky-300" />
                Legend
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-xs text-slate-300">
              <p className="font-semibold tracking-widest text-slate-400 uppercase">Infrastructure</p>
              <div className="flex items-center gap-2">
                <BatteryCharging className="h-4 w-4 text-emerald-500" /> Charging Station
              </div>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-sky-500" /> Supply Depot
              </div>

              <p className="mt-2 font-semibold tracking-widest text-slate-400 uppercase">Drone States</p>
              <div className="flex items-center gap-2">
                <Triangle fill="currentColor" className="h-4 w-4 text-sky-400" /> Flying / Scanning
              </div>
              <div className="flex items-center gap-2">
                <Triangle fill="currentColor" className="h-4 w-4 text-amber-400" /> Returning
              </div>
              <div className="flex items-center gap-2">
                <Triangle fill="currentColor" className="h-4 w-4 text-emerald-400" /> Charging
              </div>
              <div className="flex items-center gap-2">
                <Triangle fill="currentColor" className="h-4 w-4 rotate-180 text-red-500" /> Offline
              </div>

              <p className="mt-2 font-semibold tracking-widest text-slate-400 uppercase">Survivors</p>
              <div className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-red-400" /> Critical
              </div>
              <div className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-amber-400" /> Moderate
              </div>
              <div className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-emerald-400" /> Stable
              </div>
              <div className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-slate-400 opacity-45" /> Undetected
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
