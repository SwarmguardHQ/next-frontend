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
  Target,
  Users,
  Zap,
  HeartPulse,
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
  decisionLatency: number;
  reallocationFreq: number;
  coverage: number;
  activeDrones: number;
  risk: number;
};

type EventLog = {
  id: string;
  ts: string;
  level: "BATTERY" | "HAZARD" | "SURVIVOR" | "SYS" | "SYSTEM" | "COMM" | "ROUTE";
  text: string;
};

// ─── Constants ─────────────────────────────────────────────────────────────────
const MAX_POINTS = 48;
const START_TIME = Date.now() - MAX_POINTS * 2000;

const T = {
  card: "#18181b",
  border: "rgba(63, 63, 70, 0.9)",
  textDim: "#a1a1aa",
  blue: "#06b6d4",
  green: "#22c55e",
  amber: "#eab308",
  red: "#ef4444",
  purple: "#71717a",
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
    const realloc = Math.max(0, Math.sin(i / 3) * 3 + 1);
    pts.push({
      time: formatClock(t),
      decisionLatency: Math.round(clamp(lat, 30, 170)),
      reallocationFreq: Number(clamp(realloc, 0, 10).toFixed(1)),
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
    decisionLatency: clamp(Number(p.decisionLatency), 0, 300),
    reallocationFreq: clamp(Number(p.reallocationFreq), 0, 20),
    coverage: clamp(Number(p.coverage), 0, 100),
    activeDrones: Math.round(clamp(Number(p.activeDrones), 0, 8)),
    risk: clamp(Number(p.risk), 0, 100),
  }));
}

function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case "flying":
    case "scanning":
    case "delivering": return "text-sky-400";
    case "charging": return "text-emerald-400";
    case "offline": return "text-red-500";
    case "returning": return "text-amber-400";
    default: return "text-slate-400";
  }
}

// ─── Static chart data ─────────────────────────────────────────────────────────
const HIGH_RISK_ZONES = [
  { sector: "Sector Alpha", riskScore: 88, full: "Sector Alpha (NW)" },
  { sector: "Sector Beta",  riskScore: 72, full: "Sector Beta (C)" },
  { sector: "Sector Delta", riskScore: 45, full: "Sector Delta (SE)" },
  { sector: "Sector Gamma", riskScore: 30, full: "Sector Gamma (NE)" },
];

const SCENARIO_CONFIDENCE = [
  { name: "Rescue Priority",  thermal: 88, motion: 76, shape: 90 },
  { name: "Survivor Detect",  thermal: 82, motion: 85, shape: 72 },
  { name: "Battery Crisis",   thermal: 45, motion: 50, shape: 60 },
  { name: "Offline Recovery", thermal: 55, motion: 40, shape: 65 },
  { name: "Supply Run",       thermal: 30, motion: 90, shape: 85 },
  { name: "Swarm Status",     thermal: 60, motion: 60, shape: 60 },
  { name: "Default",          thermal: 50, motion: 50, shape: 50 },
].map(s => ({
  ...s,
  score: Number((s.thermal * 0.5 + s.motion * 0.3 + s.shape * 0.2).toFixed(1))
}));

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
          ? "HAZARD"
          : msg.toLowerCase().includes("detect")
            ? "SURVIVOR"
            : "SYS",
      text: msg,
    }));
    setEvents((prev) => {
      if (mEvents.length < 3) return [...mEvents, ...prev.slice(0, 3)].slice(0, 12);
      return mEvents;
    });
  }, []);

  // ── Connection fallback state ──
  const [isLlamaFallback, setIsLlamaFallback] = useState(false);
  const [lostDuration, setLostDuration] = useState(0);

  useEffect(() => {
    let timer: number | undefined;
    if (isLlamaFallback) {
      timer = window.setInterval(() => {
        setLostDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setLostDuration(0);
    }
    return () => window.clearInterval(timer);
  }, [isLlamaFallback]);
  
  const formattedDuration = `${Math.floor(lostDuration / 60)}:${(lostDuration % 60).toString().padStart(2, '0')}`;

  const handleToggleBaseLink = async () => {
    const nextState = !isLlamaFallback;
    setIsLlamaFallback(nextState);
    
    try {
      // online_mode is true when we are NOT in Llama fallback
      await api.missions.create({
        scenarios: "default",
        custom_prompt: "",
        online_mode: !nextState
      });
      console.log(`Successfully configured mission connection status: online_mode = ${!nextState}`);
    } catch (e) {
      console.error("Failed to toggle model via API", e);
    }
  };

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
      { id: "e1", ts: formatClock(now - 85000), level: "HAZARD",    text: "High wind shear detected near (12.4, 45.1). Rerouting flight paths." },
      { id: "e2", ts: formatClock(now - 64000), level: "SURVIVOR",  text: "IR thermal match (92% confidence) - heat signature in Sector Foxtrot." },
      { id: "e3", ts: formatClock(now - 51000), level: "BATTERY",   text: "Drone Alpha cell degradation. Est. flight time reduced by 4m." },
      { id: "e4", ts: formatClock(now - 35000), level: "HAZARD",    text: "Heavy precipitation lowering optical visibility. Engaging radar." },
      { id: "e5", ts: formatClock(now - 22000), level: "SURVIVOR",  text: "Audio signature detected matching acoustic SOS pattern." },
      { id: "e6", ts: formatClock(now - 15000), level: "HAZARD",    text: "Thermal anomaly detected expanding in Sector Alpha." },
      { id: "e7", ts: formatClock(now - 8000),  level: "BATTERY",   text: "Drone D4 energy reserves critically low (18%). Initiating RTB." },
      { id: "e8", ts: formatClock(now - 4000),  level: "SURVIVOR",  text: "Confirmed visual sighting of 2 individuals near northern ridgeline." },
    ]);
  }, []);

  // ── Stream tick ──
  useEffect(() => {
    const tick = window.setInterval(() => {
      setStream((prev) => {
        // Use real data to drive simulated stream indicators
        const drones = droneData?.drones ?? [];
        const survivors = survivorData?.survivors ?? [];
        
        const offlineCount = drones.filter(d => d.status.toLowerCase() === "offline").length;
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
        const reallocFreq = clamp(Math.random() * 2 + (criticalSurvivors > 0 ? 3 : 0), 0, 15);

        return [
          ...prev.slice(-(MAX_POINTS - 1)),
          {
            time: formatClock(Date.now()),
            decisionLatency: Math.round(lat),
            reallocationFreq: Number(reallocFreq.toFixed(1)),
            coverage: Number(cov.toFixed(1)),
            activeDrones: actDronesCount || 0,
            risk: Number(risk.toFixed(1)),
          },
        ];
      });
    }, 1800);
    return () => window.clearInterval(tick);
  }, [droneData, survivorData, worldMetrics]);

  // ── Derived values ──
  const points       = useMemo(() => toSafe(stream), [stream]);
  const current      = points[points.length - 1];

  const prioritySurvivors = useMemo(() => {
    if (!survivorData || !survivorData.survivors) return [];
    return [...survivorData.survivors]
      .filter(s => !s.rescued)
      .sort((a, b) => {
        const weight = { critical: 3, moderate: 2, stable: 1 };
      return (weight[b.condition as keyof typeof weight] || 0) - (weight[a.condition as keyof typeof weight] || 0);
      })
      .slice(0, 6);
  }, [survivorData]);

  // Derived mock/calculated stats for new metrics
  const taskEfficiency = clamp(98 - (current.decisionLatency / 20), 60, 100).toFixed(1);
  const confidenceScore = clamp(current.coverage + 10 - (current.risk / 5), 40, 99).toFixed(1);
  const totalSurvivors = survivorData?.survivors.length ?? 0;
  const rescuedCount = survivorData?.survivors.filter(s => s.rescued).length ?? 0;
  const criticalUnrescued = prioritySurvivors.filter(s => s.condition === "critical").length;
  const riskBand =
    current.risk >= 70 ? "CRITICAL" : current.risk >= 45 ? "ELEVATED" : "STABLE";
  const missionStatus =
    riskBand === "CRITICAL"
      ? "Critical Response"
      : riskBand === "ELEVATED"
        ? "Heightened Monitoring"
        : "Stabilization In Progress";
  
  // Mission progress: 50% weighted by geographic coverage, 50% by survivor rescue completeness.
  const missionProgress = totalSurvivors > 0 
    ? (current.coverage * 0.5) + ((rescuedCount / totalSurvivors) * 50)
    : current.coverage;

  const drones = droneData?.drones ?? [];
  const droneCount = drones.length;
  const offlineCount = drones.filter(d => d.status?.toLowerCase() === "offline").length;

  const activeStatuses = ["flying", "scanning", "delivering", "returning"];
  const activeCount = drones.filter(d => activeStatuses.includes(d.status?.toLowerCase() || "")).length;
  const validDrones = droneCount - offlineCount;
  
  // If the backend is disconnected or offline, fallback to a simulated realistic 85%.
  // Even when idle, drones use mesh backbone (base 12-25%). When active, calculate exact %.
  let avgUtilization = "85";
  if (validDrones > 0) {
    if (activeCount === 0) {
        avgUtilization = (12 + (validDrones * 3.1)).toFixed(0);
    } else {
        avgUtilization = clamp((activeCount / validDrones) * 100, 0, 100).toFixed(0);
    }
  }
  
  // Tie overlap percentage to actual drone density rather than purely random flickering
  const hasOverlapping = droneCount > 3;
  const baseOverlap = hasOverlapping ? (droneCount * 1.4) : 1.2;
  const overlapPct = (baseOverlap + (Math.sin(Date.now() / 2000) * 0.5)).toFixed(1);

  const commSuccess = (99.8 - (offlineCount * 0.4)).toFixed(2);
  const failuresHandled = Math.floor(droneCount * 0.3) + 1;
  const avgRecoveryTime = (12 + (offlineCount * 2.5)).toFixed(1);

  if (!mounted) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] w-full animate-pulse bg-background" />
    );
  }

  return (
    <div className="siren-grid-bg flex min-h-[calc(100dvh-4rem)] w-full flex-col overflow-y-auto font-mono text-muted-foreground">
      <div className="mx-auto w-full max-w-[1600px] flex-1 space-y-4 p-4 pb-16 sm:p-6">

      {/* ── Page title + status ── */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Command dashboard
          </h2>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Fleet intelligence · live world stream
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleToggleBaseLink}
            className="rounded border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
          >
            Toggle Connection
          </button>
          
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
          
          {isLlamaFallback ? (
            <>
              <Badge className="border border-red-400/40 bg-red-500/10 text-red-500">
                <WifiOff className="h-3 w-3 mr-1" /> BASE LINK LOST ({formattedDuration})
              </Badge>
              <Badge className="border border-purple-400/40 bg-purple-500/10 text-purple-300">
                <Target className="h-3 w-3 mr-1" /> ONBOARD LLAMA
              </Badge>
            </>
          ) : (
            <>
              <Badge className="border border-emerald-400/40 bg-emerald-500/10 text-emerald-300">
                <Wifi className="h-3 w-3 mr-1" /> LIVE LINK
              </Badge>
              <Badge className="border border-sky-400/40 bg-sky-500/10 text-sky-300">
                <Target className="h-3 w-3 mr-1" /> AI ALLOCATION
              </Badge>
            </>
          )}
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
      <Card className="border-t-4 border-t-cyan-500 shadow-[4px_4px_0_0_var(--nb-shadow-accent)]">
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
            label: "Mission Progress",
            value: `${missionProgress.toFixed(1)}%`,
            hint: `Weighted objective completion`,
            icon: <Target className="h-3 w-3 text-emerald-300" />,
          },
          {
            label: "Area Coverage",
            value: `${current.coverage.toFixed(1)}%`,
            hint: `Geographic sector scanned`,
            icon: <Radar className="h-3 w-3 text-sky-300" />,
          },
          {
            label: "Survivors Rescued",
            value: `${rescuedCount} / ${totalSurvivors}`,
            hint: `${totalSurvivors - rescuedCount} awaiting rescue (${criticalUnrescued} critical)`,
            icon: <Users className="h-3 w-3 text-amber-300" />,
          },
          {
            label: "Swarm Efficiency",
            value: `${taskEfficiency}%`,
            hint: `Fleet Utilization: ${avgUtilization}%`,
            icon: <Zap className="h-3 w-3 text-purple-300" />,
          },
        ].map((item, i) => (
          <Card key={i} className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.2)] flex flex-col p-4 items-center justify-center text-center">
            <p className="text-[10px] tracking-[0.1em] text-slate-400 uppercase mb-0 flex items-center justify-center gap-1.5">
              {item.icon}
              {item.label}
            </p>
            <span className="tabular-nums font-bold text-2xl text-white">{item.value}</span>
          </Card>
        ))}
      </div>

      {/* ── Tier 2: Network, Safety & Recovery ── */}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {/* Average Drone Utilization */}
        <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.2)] flex flex-col p-4 items-center justify-center text-center">
            <p className="text-[10px] tracking-[0.1em] text-slate-400 uppercase mb-0 flex items-center justify-center gap-1.5">
              <Zap className="w-3 h-3 text-sky-400" />
              Average Drone Utilization
            </p>
            <span className="tabular-nums font-bold text-2xl text-white">{avgUtilization}%</span>
        </Card>

        {/* Overlapping Scans */}
        <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.2)] flex flex-col p-4 items-center justify-center text-center">
            <p className="text-[10px] tracking-[0.1em] text-slate-400 uppercase mb-0 flex items-center justify-center gap-1.5">
              {hasOverlapping ? <Activity className="w-3 h-3 text-amber-400" /> : <Target className="w-3 h-3 text-emerald-400" />}
              Overlapping Scans (Redundancy)
            </p>
            <span className="tabular-nums font-bold text-2xl text-white">{overlapPct}%</span>
        </Card>

        {/* Communication Success */}
        <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.2)] flex flex-col p-4 items-center justify-center text-center">
            <p className="text-[10px] tracking-[0.1em] text-slate-400 uppercase mb-0 flex items-center justify-center gap-1.5">
              <Wifi className={`w-3 h-3 ${parseFloat(commSuccess) < 99 ? 'text-amber-400' : 'text-emerald-400'}`} />
              Mesh Comm Success Rate
            </p>
            <span className="tabular-nums font-bold text-2xl text-white">{commSuccess}%</span>
        </Card>

        {/* Collision Avoidance */}
        <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.2)] flex flex-col p-4 items-center justify-center text-center">
            <p className="text-[10px] tracking-[0.1em] text-slate-400 uppercase mb-0 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-purple-400" />
              Collision Avoidance
            </p>
            <span className="tabular-nums font-bold text-2xl text-white">100%</span>
        </Card>

        {/* System Fault Recovery */}
        <Card className="flex flex-col items-center justify-center p-3 text-center">
            <p className="text-[10px] tracking-[0.1em] text-slate-400 uppercase mb-0.5 flex items-center justify-center gap-1.5">
              <Activity className="w-3 h-3 text-sky-400" />
              Drone Failures
            </p>
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col">
                <span className="tabular-nums font-bold text-xl text-emerald-400">{failuresHandled}</span>
                <span className="text-[8px] text-slate-500 uppercase tracking-widest">Handled</span>
              </div>
              <div className="w-[1px] h-6 bg-slate-700/60"></div>
              <div className="flex flex-col">
                <span className="tabular-nums font-bold text-xl text-emerald-400">{avgRecoveryTime}s</span>
                <span className="text-[8px] text-slate-500 uppercase tracking-widest">Average Recovery Time</span>
              </div>
            </div>
        </Card>
      </div>

      {/* ── Tier 3: Main Layout Grid (2 Columns + 1 Column Sidebar) ── */}
      <div className="grid gap-4 xl:grid-cols-3">
        
        {/* LEFT/MAIN COLUMN (Takes up 2 grid slots) */}
        <div className="xl:col-span-2 space-y-4">
          
          {/* Decision Latency Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base tracking-wide text-white">System Telemetry & Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full min-w-0">
                <ResponsiveContainer width="100%" height={280} minWidth={0} minHeight={0}>
                  <LineChart data={points}>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: T.textDim, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={30} />
                    <YAxis yAxisId="latency" domain={[20, 180]} tick={{ fill: T.textDim, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="realloc" orientation="right" domain={[0, 20]} tick={{ fill: T.textDim, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: T.card, border: `1px solid ${T.border}`, borderRadius: 8 }}
                      formatter={(v: unknown, k: unknown) => {
                        const n = toNumber(v);
                        return k === "decisionLatency" ? [`${n} ms`, "Decision Latency"] : [`${n}`, "Reallocations"];
                      }}
                    />
                    <Line yAxisId="latency" type="monotone" dataKey="decisionLatency" stroke={T.blue} strokeWidth={2.2} dot={false} />
                    <Line yAxisId="realloc" type="step" dataKey="reallocationFreq" stroke={T.purple} strokeWidth={1.7} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Fleet Distribution Donuts */}
          <Card className="flex flex-col">
            <CardHeader className="pb-0">
              <CardTitle className="text-base tracking-wide text-white">Fleet Distribution Overview</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 h-[200px]">
                {/* 1. Status Donut */}
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mb-1">Status</span>
                  <div className="h-[150px] w-full min-w-0 min-h-[150px] flex items-center justify-center">
                      <PieChart width={220} height={150}>
                      <Pie                          isAnimationActive={false}                        data={Object.entries((droneData?.drones ?? []).reduce((acc, d) => {
                          const s = d.status ? d.status.toLowerCase() : "unknown";
                          acc[s] = (acc[s] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)).map(([name, value]) => ({ name, value }))}
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {Object.entries((droneData?.drones ?? []).reduce((acc, d) => {
                          const s = d.status ? d.status.toLowerCase() : "unknown";
                          acc[s] = (acc[s] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)).map((entry, index) => {
                          const colors: Record<string, string> = { "flying": T.blue, "scanning": T.blue, "delivering": T.blue, "charging": T.green, "offline": T.red, "returning": T.amber };
                          return <Cell key={`cell-${index}`} fill={colors[entry[0]] || T.textDim} />;
                        })}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#111827', borderColor: 'rgba(61,158,228,0.2)' }}
                        itemStyle={{ color: '#f1f5f9', fontSize: '12px' }}
                      />
                      </PieChart>
                  </div>
                  <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 mt-1">
                    {Object.entries((droneData?.drones ?? []).reduce((acc, d) => {
                      const s = d.status ? d.status.toLowerCase() : "unknown";
                      acc[s] = (acc[s] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)).map(([name]) => {
                      const colors: Record<string, string> = { "flying": T.blue, "scanning": T.blue, "delivering": T.blue, "charging": T.green, "offline": T.red, "returning": T.amber };
                      return (
                        <div key={name} className="flex items-center gap-1.5 text-[9px] text-slate-400 capitalize">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors[name] || T.textDim }} />
                          {name}
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* 2. Battery Donut */}
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mb-1">Battery Level</span>
                  <div className="h-[150px] w-full min-w-0 min-h-[150px] flex items-center justify-center">
                      <PieChart width={220} height={150}>
                      <Pie                          isAnimationActive={false}                        data={[
                          { name: "High (>50%)", value: (droneData?.drones ?? []).filter(d => d.battery > 50).length },
                          { name: "Medium (25-50%)", value: (droneData?.drones ?? []).filter(d => d.battery > 25 && d.battery <= 50).length },
                          { name: "Low (<25%)", value: (droneData?.drones ?? []).filter(d => d.battery <= 25).length }
                        ].filter(d => d.value > 0)}
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {[
                          { name: "High (>50%)", value: (droneData?.drones ?? []).filter(d => d.battery > 50).length },
                          { name: "Medium (25-50%)", value: (droneData?.drones ?? []).filter(d => d.battery > 25 && d.battery <= 50).length },
                          { name: "Low (<25%)", value: (droneData?.drones ?? []).filter(d => d.battery <= 25).length }
                        ].filter(d => d.value > 0).map((entry, index) => {
                          const fill = entry.name.includes('High') ? T.green : entry.name.includes('Medium') ? T.amber : T.red;
                          return <Cell key={`cell-${index}`} fill={fill} />;
                        })}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#111827', borderColor: 'rgba(61,158,228,0.2)' }}
                        itemStyle={{ color: '#f1f5f9', fontSize: '12px' }}
                      />
                      </PieChart>
                  </div>
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
                    {[
                      { name: "High (>50%)", value: (droneData?.drones ?? []).filter(d => d.battery > 50).length },
                      { name: "Medium (25-50%)", value: (droneData?.drones ?? []).filter(d => d.battery > 25 && d.battery <= 50).length },
                      { name: "Low (<25%)", value: (droneData?.drones ?? []).filter(d => d.battery <= 25).length }
                    ].filter(d => d.value > 0).map((entry) => {
                      const fill = entry.name.includes('High') ? T.green : entry.name.includes('Medium') ? T.amber : T.red;
                      return (
                        <div key={entry.name} className="flex items-center gap-1.5 text-[9px] text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: fill }} />
                          {entry.name.split(' ')[0]}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Sector Donut */}
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mb-1">Sector Location</span>
                  <div className="h-[150px] w-full min-w-0 min-h-[150px] flex items-center justify-center">
                      <PieChart width={220} height={150}>
                      <Pie                          isAnimationActive={false}                        data={Object.entries((droneData?.drones ?? []).reduce((acc, d) => {
                          const s = d.assigned_sector || "Unassigned";
                          acc[s] = (acc[s] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)).map(([name, value]) => ({ name, value }))}
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {Object.entries((droneData?.drones ?? []).reduce((acc, d) => {
                          const s = d.assigned_sector || "Unassigned";
                          acc[s] = (acc[s] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)).map((entry, index) => {
                          const palette = [T.blue, T.purple, T.green, T.amber, T.red, T.textDim];
                          return <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />;
                        })}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#111827', borderColor: 'rgba(61,158,228,0.2)' }}
                        itemStyle={{ color: '#f1f5f9', fontSize: '12px' }}
                      />
                      </PieChart>
                  </div>
                  <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 mt-1">
                    {Object.entries((droneData?.drones ?? []).reduce((acc, d) => {
                      const s = d.assigned_sector || "Unassigned";
                      acc[s] = (acc[s] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)).map(([name], index) => {
                      const palette = [T.blue, T.purple, T.green, T.amber, T.red, T.textDim];
                      return (
                        <div key={name} className="flex items-center gap-1.5 text-[9px] text-slate-400 capitalize">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
                          {name.replace('Sector', '').trim()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Active Fleet Table ── */}
          <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base tracking-wide text-white">Active Fleet & Battery Management</CardTitle>
            </div>
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
                      <TableHead className="text-slate-400">Battery Level</TableHead>
                      <TableHead className="text-slate-400">Position</TableHead>
                      <TableHead className="text-slate-400">Payload</TableHead>
                      <TableHead className="text-right text-slate-400">Sector</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(droneData?.drones ?? []).map((drone) => (
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
                        <TableCell className="text-xs text-slate-300">{drone.payload || "-"}</TableCell>
                        <TableCell className="text-right text-xs text-slate-300">{drone.assigned_sector || "Unassigned"}</TableCell>
                      </TableRow>
                    ))}
                    {(!droneData || droneData.drones.length === 0) && (
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
        </div>


        {/* RIGHT/SIDEBAR COLUMN (Takes up 1 grid slot) */}
        <div className="space-y-4">
          {/* Priority Survivors Columned Card */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-base tracking-wide text-white flex justify-between items-center">
                Active Survivors Triage <Users className="w-4 h-4 text-cyan-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col">
              <div className="flex flex-col gap-3 min-h-[250px]">
                {/* Critical */}
                <div className="flex flex-col border border-red-500/20 bg-red-500/5 rounded-md overflow-hidden flex-1">
                  <div className="bg-red-500/20 text-red-400 text-[10px] font-bold px-2 py-1 text-center tracking-widest border-b border-red-500/20 uppercase">
                    Critical
                  </div>
                  <div className="overflow-y-auto p-2 space-y-2 max-h-[150px]">
                    {survivorData?.survivors?.filter(s => !s.rescued && s.condition === "critical").map(surv => (
                      <div key={surv.survivor_id} className="text-xs bg-black/40 rounded p-1.5 border border-red-500/10">
                          <div className="font-semibold text-slate-200">{surv.survivor_id}</div>
                          <div className="text-slate-400 text-[10px]">({surv.position.x}, {surv.position.y})</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Moderate */}
                <div className="flex flex-col border border-amber-500/20 bg-amber-500/5 rounded-md overflow-hidden flex-1">
                  <div className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-1 text-center tracking-widest border-b border-amber-500/20 uppercase">
                    Moderate
                  </div>
                  <div className="overflow-y-auto p-2 space-y-2 max-h-[150px]">
                    {survivorData?.survivors?.filter(s => !s.rescued && s.condition === "moderate").map(surv => (
                      <div key={surv.survivor_id} className="text-xs bg-black/40 rounded p-1.5 border border-amber-500/10">
                          <div className="font-semibold text-slate-200">{surv.survivor_id}</div>
                          <div className="text-slate-400 text-[10px]">({surv.position.x}, {surv.position.y})</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Stable */}
                <div className="flex flex-col border border-emerald-500/20 bg-emerald-500/5 rounded-md overflow-hidden flex-1">
                  <div className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-1 text-center tracking-widest border-b border-emerald-500/20 uppercase">
                    Stable
                  </div>
                  <div className="overflow-y-auto p-2 space-y-2 max-h-[150px]">
                    {survivorData?.survivors?.filter(s => !s.rescued && s.condition === "stable").map(surv => (
                      <div key={surv.survivor_id} className="text-xs bg-black/40 rounded p-1.5 border border-emerald-500/10">
                          <div className="font-semibold text-slate-200">{surv.survivor_id}</div>
                          <div className="text-slate-400 text-[10px]">({surv.position.x}, {surv.position.y})</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scenario Confidence (Grid Version) */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base tracking-wide text-white flex justify-between items-center">
                Confidence Score <Target className="w-4 h-4 text-purple-400" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 w-full">
                {SCENARIO_CONFIDENCE.map((scenario, index) => (
                  <div key={index} className="flex flex-col items-center justify-center gap-1 rounded border border-slate-700/50 bg-slate-800/30 p-2 text-center text-xs">
                    <span className={`font-bold text-sm ${scenario.score >= 80 ? 'text-emerald-400' : scenario.score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                      {scenario.score}%
                    </span>
                    <span className="font-semibold text-slate-300 leading-tight text-[10px]">
                      {scenario.name}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

{/* Critical Alerts */}
            <Card className="flex flex-col border-t-4 border-t-destructive shadow-[4px_4px_0_0_rgb(127_29_29)]">
              <CardHeader>
                <CardTitle className="text-base tracking-wide text-white flex justify-between items-center">
                  Critical Alerts <AlertTriangle className="w-4 h-4 text-red-400" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-85 space-y-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-black/20 [&::-webkit-scrollbar-thumb]:bg-cyan-950/80 [&::-webkit-scrollbar-thumb]:rounded-none hover:[&::-webkit-scrollbar-thumb]:bg-cyan-900/80">
                  {events.filter(ev => ["HAZARD", "BATTERY", "SURVIVOR"].includes(ev.level)).map((ev) => (
                    <div key={ev.id} className="rounded-md border border-slate-700/70 bg-slate-900/40 p-2">
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className={`font-semibold tracking-wide flex items-center gap-1 ${
                          ev.level === "BATTERY" ? "text-amber-400"
                          : ev.level === "HAZARD" ? "text-red-400"
                          : ev.level === "SURVIVOR" ? "text-emerald-400"
                          : "text-sky-300"
                        }`}>
                          {ev.level === "BATTERY" && <Battery className="w-3 h-3" />}
                          {ev.level === "HAZARD" && <AlertTriangle className="w-3 h-3" />}
                          {ev.level === "SURVIVOR" && <HeartPulse className="w-3 h-3" />}
                          {ev.level}
                        </span>
                        <span className="tabular-nums text-slate-400">{ev.ts}</span>
                      </div>
                      <p className="text-xs text-slate-300">{ev.text}</p>
                    </div>
                  ))}
                  {events.filter(ev => ["HAZARD", "BATTERY", "SURVIVOR"].includes(ev.level)).length === 0 && (
                    <div className="text-center text-xs text-slate-500 py-4 italic">No critical alerts active</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
    </div>
    </div>
  );
}
