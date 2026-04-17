"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Battery,
  Clock3,
  Radar,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useWorldStream } from "@/lib/useWorldStream";
import { api } from "@/lib/api";
import type { WorldStreamSimVisual, WorldStreamTickPayload } from "@/types/api_types";
import { MesaSimPanel } from "@/components/sim/MesaSimPanel";

// ─── Stream types ──────────────────────────────────────────────────────────────
type StreamPoint = {
  time: string;
  latencyMs: number;
  coverage: number;
  activeDrones: number;
  risk: number;
};

type EventLog = {
  id: string;
  ts: string;
  level: "OBS" | "WARN" | "ACTION";
  text: string;
};

// ─── Constants ─────────────────────────────────────────────────────────────────
const MAX_POINTS = 48;
const START_TIME = Date.now() - MAX_POINTS * 2000;

const T = {
  card: "#111827",
  border: "rgba(61,158,228,0.35)",
  textDim: "#64748b",
  blue: "#3d9ee4",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toNumber(v: unknown, fb = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fb;
}

function createSeedPoints(): StreamPoint[] {
  const pts: StreamPoint[] = [];
  for (let i = 0; i < MAX_POINTS; i++) {
    const t = START_TIME + i * 2000;
    const anomaly = i === 33 ? 46 : 0;
    const lat = 52 + Math.sin(i / 5) * 9 + anomaly;
    const cov = 38 + i * 1.04 + Math.cos(i / 7) * 1.3;
    const active = i > 34 ? 4 : 5;
    const risk = lat > 90 ? 72 : 24 + Math.sin(i / 4) * 6;
    pts.push({
      time: formatClock(t),
      latencyMs: Math.round(clamp(lat, 30, 170)),
      coverage: Number(clamp(cov, 0, 99).toFixed(1)),
      activeDrones: active,
      risk: Number(clamp(risk, 10, 95).toFixed(1)),
    });
  }
  return pts;
}

function toSafe(input: StreamPoint[]): StreamPoint[] {
  return input.map((p) => ({
    time: typeof p.time === "string" ? p.time : "--:--:--",
    latencyMs: clamp(Number(p.latencyMs), 0, 300),
    coverage: clamp(Number(p.coverage), 0, 100),
    activeDrones: Math.round(clamp(Number(p.activeDrones), 0, 8)),
    risk: clamp(Number(p.risk), 0, 100),
  }));
}

function getStatusColor(status: string) {
  switch (status) {
    case "flying":
    case "scanning":
    case "delivering": return "text-sky-400";
    case "charging": return "text-emerald-400";
    case "offline": return "text-red-500";
    case "returning": return "text-amber-400";
    default: return "text-slate-400";
  }
}

import Header from "@/components/header";

// ─── Static chart data ─────────────────────────────────────────────────────────
const SECTOR_DATA = [
  { sector: "NW", completed: 16, pending: 2 },
  { sector: "NE", completed: 13, pending: 3 },
  { sector: "C",  completed: 19, pending: 1 },
  { sector: "SW", completed: 11, pending: 4 },
  { sector: "SE", completed: 14, pending: 3 },
];



// ─── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  // Telemetry stream state (charts)
  const [stream, setStream] = useState<StreamPoint[]>(() => createSeedPoints());
  const [events, setEvents] = useState<EventLog[]>([]);
  const [mounted, setMounted] = useState(false);

  const applyMeshTailToEvents = useCallback((meshTail: string[]) => {
    if (!meshTail.length) return;
    const mEvents: EventLog[] = meshTail.slice(-12).reverse().map((msg, i) => ({
      id: `m-${Date.now()}-${i}`,
      ts: formatClock(Date.now() - i * 500),
      level:
        msg.includes("CRITICAL") || msg.includes("LOW")
          ? "ACTION"
          : msg.toLowerCase().includes("detect")
            ? "OBS"
            : "WARN",
      text: msg,
    }));
    setEvents((prev) => {
      if (mEvents.length < 3) return [...mEvents, ...prev.slice(0, 3)].slice(0, 12);
      return mEvents;
    });
  }, []);

  // ── Telemetry mount + seed events ──
  const [simVisual, setSimVisual] = useState<WorldStreamSimVisual | null>(null);
  const [mesaBusy, setMesaBusy] = useState(false);

  const { droneData, survivorData, worldMetrics, worldStreamLive, apiError, apiLoading, refetch } =
    useWorldStream({
      onPollMeshLog: applyMeshTailToEvents,
      onStreamTick: (data: WorldStreamTickPayload) => {
        if (data.mesh_log?.length) applyMeshTailToEvents(data.mesh_log);
        setSimVisual(data.sim_visual ?? null);
      },
    });

  const handleMesaStep = useCallback(async () => {
    setMesaBusy(true);
    try {
      await api.world.mesaStep(1);
      await refetch();
    } catch {
      /* Mesa optional */
    } finally {
      setMesaBusy(false);
    }
  }, [refetch]);

  // ── Telemetry mount ──
  useEffect(() => {
    setMounted(true);
    const now = Date.now();
    setEvents([
      { id: "e1", ts: formatClock(now - 12000), level: "OBS",    text: "Mesh health nominal. Sector SW link budget stable at 82%." },
      { id: "e2", ts: formatClock(now - 8000),  level: "WARN",   text: "Relay R-3 interference burst detected. RTT exceeded 95 ms threshold." },
      { id: "e3", ts: formatClock(now - 4000),  level: "ACTION", text: "Fallback route enabled. Drone D3 reassigned to maintain sweep continuity." },
    ]);
  }, []);

  // ── Stream tick ──
  useEffect(() => {
    const tick = window.setInterval(() => {
      setStream((prev) => {
        const last = prev[prev.length - 1];
        
        // Use real data to drive simulated stream indicators
        const drones = droneData?.drones ?? [];
        const survivors = survivorData?.survivors ?? [];
        
        const offlineCount = drones.filter(d => d.status === "offline").length;
        const lowBatCount = drones.filter(d => d.battery < 20).length;
        const criticalSurvivors = survivors.filter(s => s.condition === "critical" && !s.rescued).length;
        
        // Latency: Simulated but influenced by active traffic
        const latBase = 45 + (drones.length * 4);
        const lat = clamp(latBase + (Math.random() * 12 - 6) + (offlineCount * 15), 34, 170);
        
        // Coverage: live grid exploration from backend when available
        const cov =
          worldMetrics != null
            ? clamp(Number(worldMetrics.coverage_pct), 0, 100)
            : clamp(38 + (prev.length * 0.46) % 30 + Math.cos(prev.length / 7) * 1.3, 0, 99);
        
        // Risk: Weighted sum of real world threats
        const threats = (offlineCount * 22) + (lowBatCount * 12) + (criticalSurvivors * 18);
        const risk = clamp(threats + (Math.random() * 10 - 5) + 12, 8, 99);
        
        const actDronesCount = drones.length - offlineCount;

        return [
          ...prev.slice(-(MAX_POINTS - 1)),
          {
            time: formatClock(Date.now()),
            latencyMs: Math.round(lat),
            coverage: Number(cov.toFixed(1)),
            activeDrones: actDronesCount || 0,
            risk: Number(risk.toFixed(1)),
          },
        ];
      });
    }, 1800);
    return () => window.clearInterval(tick);
  }, [droneData, survivorData, worldMetrics]);

  // ── Latency anomaly events ──
  useEffect(() => {
    const last = stream[stream.length - 1];
    if (!last || last.latencyMs <= 120) return;
    setEvents((prev) => [
      {
        id: crypto.randomUUID(),
        ts: last.time,
        level: "WARN",
        text: `Latency anomaly ${last.latencyMs} ms. Prioritising command channel.`,
      },
      ...prev.slice(0, 5),
    ]);
  }, [stream]);

  // ── Derived values ──
  const points       = useMemo(() => toSafe(stream), [stream]);
  const current      = points[points.length - 1];
  const previous     = points[points.length - 2] ?? current;
  const latencyDelta = current.latencyMs - previous.latencyMs;
  const riskBand     = current.risk >= 75 ? "CRITICAL" : current.risk >= 55 ? "ELEVATED" : "STABLE";
  const missionStatus =
    current.risk >= 75 ? "Contingency routing active"
    : current.risk >= 55 ? "Route optimization engaged"
    : "Mission envelope nominal";

  const fleetPieData = useMemo(() => {
    const live = droneData?.drones ?? [];
    const active   = live.filter(d => ["flying", "delivering", "returning"].includes(d.status)).length;
    const scanning = live.filter(d => d.status === "scanning").length;
    const charging = live.filter(d => d.status === "charging").length;
    const standby  = live.filter(d => d.status === "idle").length;
    const offline  = live.filter(d => d.status === "offline").length;

    // If no live data fall back to stream-derived values
    if (!live.length) {
      return [
        { name: "Active",   value: Math.max(current.activeDrones - 2, 0), color: T.blue },
        { name: "Scanning", value: 2,                                       color: T.green },
        { name: "Charging", value: 1,                                       color: T.amber },
        { name: "Offline",  value: 5 - current.activeDrones,               color: T.red },
      ];
    }
    return [
      { name: "Active",   value: active,   color: T.blue },
      { name: "Scanning", value: scanning, color: T.green },
      { name: "Charging", value: charging, color: T.amber },
      { name: "Standby",  value: standby,  color: T.textDim },
      { name: "Offline",  value: offline,  color: T.red },
    ].filter(item => item.value > 0);
  }, [droneData, current.activeDrones]);

  const fleetReadiness = droneData
    ? `${droneData.summary.drones.active}/${droneData.summary.drones.total} Active`
    : `${current.activeDrones}/5 Active`;

  const survivorNeedsData = useMemo(() => {
    if (!survivorData) return [];
    let medical = 0, water = 0, food = 0, shelter = 0, extraction = 0;
    for (const s of survivorData.survivors) {
      if (s.condition === "critical") { medical += 2; water += 1; extraction += 2; }
      else if (s.condition === "moderate") { medical += 1; water += 1; food += 1; shelter += 1; }
      else if (s.condition === "stable") { food += 1; water += 1; }
    }
    return [
      { need: "Medical",    count: medical },
      { need: "Water",      count: water },
      { need: "Food",       count: food },
      { need: "Shelter",    count: shelter },
      { need: "Extraction", count: extraction },
    ];
  }, [survivorData]);

  if (!mounted) {
    return <div className="fixed inset-0 z-[100] flex flex-col bg-black animate-pulse" />;
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-slate-300 font-mono overflow-auto">
      <Header />
      <div className="flex-1 p-4 sm:p-6 space-y-4 max-w-[1600px] w-full mx-auto pb-24">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-wide sm:text-3xl">SIREN Command Dashboard</h2>
          <p className="text-xs tracking-widest text-slate-400 uppercase">Real-time fleet intelligence & mission analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={
              worldStreamLive
                ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                : "border border-slate-500/40 bg-slate-500/10 text-slate-400"
            }
          >
            <Wifi className="h-3 w-3" />{" "}
            {worldStreamLive ? "WORLD SSE" : "WORLD · REST fallback"}
          </Badge>
          <Badge className="border border-sky-400/40 bg-sky-500/10 text-sky-300">
            <Radar className="h-3 w-3" /> OFFLINE CAPABLE
          </Badge>
          {apiError && (
            <Badge className="border border-amber-400/40 bg-amber-500/10 text-amber-300">
              <WifiOff className="h-3 w-3" /> DEMO DATA
            </Badge>
          )}
          {simVisual && worldStreamLive && (
            <Badge className="border border-violet-400/40 bg-violet-500/10 text-violet-200">
              <Radar className="h-3 w-3" /> MESA step {simVisual.mesa_step}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Mission State ── */}
      <Card className="border border-sky-400/30 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.25)]">
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] tracking-[0.16em] text-slate-400 uppercase">Live Mission Command State</p>
              <p className="mt-1 text-2xl font-bold tracking-wide text-white">{missionStatus}</p>
            </div>
            <Badge
              className={`border ${
                riskBand === "CRITICAL"
                  ? "border-red-400/50 bg-red-500/15 text-red-300"
                  : riskBand === "ELEVATED"
                    ? "border-amber-400/50 bg-amber-500/15 text-amber-300"
                    : "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
              }`}
            >
              RISK {riskBand}
            </Badge>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="tracking-widest uppercase">Area Closure Progress</span>
              <span className="tabular-nums font-bold text-white">{current.coverage.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800">
              <div
                className={`h-2 rounded-full transition-all ${
                  current.coverage >= 85 ? "bg-emerald-400"
                  : current.coverage >= 70 ? "bg-sky-400"
                  : "bg-amber-400"
                }`}
                style={{ width: `${current.coverage}%` }}
              />
            </div>
          </div>
          <MesaSimPanel
            variant="card"
            simVisual={simVisual}
            streamLive={worldStreamLive}
            mesaBusy={mesaBusy}
            onMesaStep={handleMesaStep}
          />
        </CardContent>
      </Card>

      {/* ── 4 KPI Cards ── */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Mesh Latency",
            value: `${current.latencyMs} ms`,
            hint: latencyDelta > 0 ? `+${latencyDelta} ms vs last sample` : `${latencyDelta} ms vs last sample`,
            icon: <Activity className="h-4 w-4 text-sky-300" />,
          },
          {
            label: "Grid Coverage",
            value: `${current.coverage.toFixed(1)}%`,
            hint: "Target 91% mission completion",
            icon: <Radar className="h-4 w-4 text-cyan-300" />,
          },
          {
            label: "Fleet Readiness",
            value: fleetReadiness,
            hint: droneData?.summary.drones.low_battery?.length
              ? `${droneData.summary.drones.low_battery.length} drone(s) need charging`
              : current.activeDrones < 5 ? "One drone in degraded state" : "All mission drones available",
            icon: <ShieldCheck className="h-4 w-4 text-emerald-300" />,
          },
          {
            label: "Risk Index",
            value: `${Math.round(current.risk)}`,
            hint: current.risk > 70 ? "Warning zone" : "Within safe envelope",
            icon: <AlertTriangle className="h-4 w-4 text-amber-300" />,
          },
        ].map((item) => (
          <Card key={item.label} className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.2)]">
            <CardHeader className="pb-1">
              <CardDescription className="text-[11px] tracking-[0.14em] text-slate-400 uppercase">{item.label}</CardDescription>
              <CardTitle className="flex items-center justify-between text-2xl font-semibold tracking-wide">
                <span className="tabular-nums font-bold text-white">{item.value}</span>
                {item.icon}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-slate-400">{item.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Charts row: Timeline + Fleet Pie ── */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* Latency + Risk Timeline */}
        <Card className="col-span-4 border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.22)]">
          <CardHeader>
            <CardTitle className="text-base tracking-wide text-white">Mesh Latency + Risk Timeline</CardTitle>
            <CardDescription className="text-slate-400">2 s ingest cadence — 48-sample rolling window</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={280} minWidth={0} minHeight={0}>
                <LineChart data={points}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: T.textDim, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={26} />
                  <YAxis yAxisId="latency" domain={[20, 180]} tick={{ fill: T.textDim, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="risk" orientation="right" domain={[0, 100]} tick={{ fill: T.textDim, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <ReferenceLine yAxisId="latency" y={95}  stroke={T.amber} strokeDasharray="4 4" />
                  <ReferenceLine yAxisId="latency" y={120} stroke={T.red}   strokeDasharray="4 4" />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: T.card, border: `1px solid ${T.border}`, borderRadius: 8 }}
                    labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                    formatter={(v: unknown, k: unknown) => {
                      const n = toNumber(v);
                      return k === "latencyMs" ? [`${n} ms`, "Latency"] : [`${n}`, "Risk"];
                    }}
                  />
                  <Line yAxisId="latency" type="monotone" dataKey="latencyMs" stroke={T.blue}  strokeWidth={2.2} dot={false} />
                  <Line yAxisId="risk"    type="monotone" dataKey="risk"      stroke={T.amber} strokeWidth={1.7} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Fleet State Pie */}
        <Card className="col-span-3 border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.22)]">
          <CardHeader>
            <CardTitle className="text-base tracking-wide text-white">Fleet State Distribution</CardTitle>
            <CardDescription className="text-slate-400">Mission-ready posture by drone mode</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie data={fleetPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={88} paddingAngle={4} dataKey="value">
                    {fleetPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: T.card, border: `1px solid ${T.border}`, borderRadius: 8 }}
                    formatter={(v: unknown) => [`${toNumber(v)} drones`, "Count"]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                {fleetPieData.map((st) => (
                  <div key={st.name} className="flex items-center justify-between rounded-md border border-slate-700/70 bg-slate-900/40 px-2 py-1">
                    <span className="flex items-center gap-1 text-slate-300">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                      {st.name.toUpperCase()}
                    </span>
                    <span className="tabular-nums font-bold text-white">{st.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Active Fleet Table ── */}
      <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.22)]">
        <CardHeader>
          <CardTitle className="text-base tracking-wide text-white">Active Fleet</CardTitle>
          <CardDescription className="text-slate-400">Per-drone telemetry — polled every 3 s</CardDescription>
        </CardHeader>
        <CardContent>
          {apiLoading && !droneData ? (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
              <Activity className="h-5 w-5 animate-pulse text-sky-400" />
              Connecting to mesh network…
            </div>
          ) : apiError && !droneData ? (
            <div className="py-8 text-center">
              <WifiOff className="mx-auto mb-2 h-8 w-8 text-red-500" />
              <p className="text-sm font-medium text-red-400">Connection Error</p>
              <p className="mt-1 text-xs text-slate-500">{apiError}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/60 hover:bg-transparent">
                  <TableHead className="text-slate-400">Drone ID</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-400">Battery</TableHead>
                  <TableHead className="text-slate-400">Position</TableHead>
                  <TableHead className="text-slate-400">Payload</TableHead>
                  <TableHead className="text-right text-slate-400">Sector</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {droneData?.drones.map((drone) => (
                  <TableRow key={drone.drone_id} className="border-slate-700/40 hover:bg-slate-800/40">
                    <TableCell className="font-mono font-medium text-sky-300">{drone.drone_id}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-semibold capitalize ${getStatusColor(drone.status)}`}>
                        {drone.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Battery className={`h-3.5 w-3.5 ${drone.battery > 50 ? "text-emerald-400" : drone.battery > 25 ? "text-amber-400" : "text-red-500"}`} />
                        <span className="w-8 tabular-nums text-xs text-slate-300">{drone.battery}%</span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-700">
                          <div
                            className={`h-full transition-all duration-500 ${
                              drone.battery > 50 ? "bg-emerald-400" : drone.battery > 25 ? "bg-amber-400" : "bg-red-500"
                            }`}
                            style={{ width: `${Math.max(0, drone.battery)}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-400">({drone.position.x}, {drone.position.y})</TableCell>
                    <TableCell className="text-xs text-slate-300">{drone.payload || "—"}</TableCell>
                    <TableCell className="text-right text-xs text-slate-300">{drone.assigned_sector || "Unassigned"}</TableCell>
                  </TableRow>
                ))}
                {(droneData?.drones.length === 0 || !droneData) && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                      No drones detected on the mesh network.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Bottom charts row: Sector / Survivor / Event Feed ── */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Sector Completion */}
        <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.22)]">
          <CardHeader>
            <CardTitle className="text-base tracking-wide text-white">Sector Completion Matrix</CardTitle>
            <CardDescription className="text-slate-400">Completed vs remaining scans per sector</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[230px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={230} minWidth={0} minHeight={0}>
                <BarChart data={SECTOR_DATA}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis dataKey="sector" tick={{ fill: T.textDim, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: T.textDim, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={{ backgroundColor: T.card, border: `1px solid ${T.border}`, borderRadius: 8 }} />
                  <Bar dataKey="completed" fill={T.green} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending"   fill={T.amber} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Survivor Needs */}
        <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.22)]">
          <CardHeader>
            <CardTitle className="text-base tracking-wide text-white">Survivor Need Pressure</CardTitle>
            <CardDescription className="text-slate-400">Aggregated demand by supply class</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[230px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={230} minWidth={0} minHeight={0}>
                <BarChart data={survivorNeedsData} layout="vertical">
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" horizontal vertical={false} />
                  <XAxis type="number"   tick={{ fill: T.textDim, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="need" tick={{ fill: T.textDim, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: T.card, border: `1px solid ${T.border}`, borderRadius: 8 }}
                    formatter={(v: unknown) => [`${toNumber(v)} requests`, "Demand"]}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={16}>
                    {survivorNeedsData.map((item) => (
                      <Cell key={item.need} fill={item.count >= 70 ? T.red : item.count >= 50 ? T.amber : T.blue} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Command Event Feed */}
        <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.22)]">
          <CardHeader>
            <CardTitle className="text-base tracking-wide text-white">Command Event Feed</CardTitle>
            <CardDescription className="text-slate-400">Recent autonomous decisions and warnings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[230px] space-y-2 overflow-auto pr-1">
              {events.map((ev) => (
                <div key={ev.id} className="rounded-md border border-slate-700/70 bg-slate-900/40 p-2">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className={`font-semibold tracking-wide ${
                      ev.level === "WARN" ? "text-amber-300" : ev.level === "ACTION" ? "text-emerald-300" : "text-sky-300"
                    }`}>
                      [{ev.level}]
                    </span>
                    <span className="tabular-nums text-slate-400">{ev.ts}</span>
                  </div>
                  <p className="text-xs text-slate-300">{ev.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Coverage Momentum (full width) ── */}
      <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.22)]">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base tracking-wide text-white">Coverage Momentum</CardTitle>
            <CardDescription className="text-slate-400">Operational area closure and comms health</CardDescription>
          </div>
          <Badge className="border border-slate-500/50 bg-slate-700/30 text-slate-200">
            <Clock3 className="h-3 w-3" /> Last sample {current.time}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="h-[170px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={170} minWidth={0} minHeight={0}>
              <AreaChart data={points}>
                <defs>
                  <linearGradient id="covFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="4%"  stopColor={T.blue} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={T.blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: T.textDim, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis domain={[30, 100]} tick={{ fill: T.textDim, fontSize: 11 }} tickLine={false} axisLine={false} />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: T.card, border: `1px solid ${T.border}`, borderRadius: 8 }}
                  formatter={(v: unknown) => [`${toNumber(v)}%`, "Coverage"]}
                />
                <Area type="monotone" dataKey="coverage" stroke={T.blue} strokeWidth={2} fill="url(#covFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

    </div>
    </div>
  );
}
