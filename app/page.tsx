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
import { getBackendOrigin } from "@/lib/backendOrigin";
import type { WorldStreamSimVisual, WorldStreamTickPayload } from "@/types/api_types";
import { cn } from "@/lib/utils";

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
    case "relaying": return "text-amber-400";
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

  // ── Telemetry mount + seed events ──
  const [simVisual, setSimVisual] = useState<WorldStreamSimVisual | null>(null);

  const { droneData, survivorData, worldMetrics, worldStreamLive, apiError, apiLoading } =
    useWorldStream({
      onPollMeshLog: applyMeshTailToEvents,
      onStreamTick: (data: WorldStreamTickPayload) => {
        if (data.mesh_log?.length) applyMeshTailToEvents(data.mesh_log);
        setSimVisual(data.sim_visual ?? null);
      },
    });

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

  const activeStatuses = ["flying", "scanning", "delivering", "relaying"];
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

  /** Backend + stream wiring (REST via /api rewrite, SSE direct to FastAPI origin). */
  const backendOrigin = useMemo(() => getBackendOrigin(), []);
  const linkStatus = useMemo(() => {
    if (apiError) return "offline" as const;
    if (apiLoading && !droneData) return "connecting" as const;
    if (worldStreamLive) return "live" as const;
    if (droneData) return "rest" as const;
    return "connecting" as const;
  }, [apiError, apiLoading, droneData, worldStreamLive]);

  if (!mounted) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] w-full animate-pulse bg-background" />
    );
  }

  return (
    <div className="siren-grid-bg flex min-h-[calc(100dvh-4rem)] w-full flex-col overflow-y-auto font-mono text-muted-foreground">
      <div className="mx-auto w-full max-w-[1600px] flex-1 space-y-4 p-4 pb-16 sm:p-6">

      {/* ── Page header ── */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Title */}
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold uppercase tracking-[0.12em] text-white sm:text-2xl">
              Command Dashboard
            </h2>
            {/* Live status badge */}
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]",
              linkStatus === "live"       ? "border-emerald-800/50 bg-emerald-950/60 text-emerald-400" :
              linkStatus === "rest"       ? "border-amber-800/50   bg-amber-950/60   text-amber-400"   :
              linkStatus === "offline"    ? "border-red-800/50     bg-red-950/60     text-red-400"     :
                                            "border-slate-700/50   bg-slate-900/60   text-slate-400",
            )}>
              <span className={cn(
                "h-1.5 w-1.5 rounded-full",
                linkStatus === "live"    ? "bg-emerald-400 animate-pulse" :
                linkStatus === "rest"    ? "bg-amber-400" :
                linkStatus === "offline" ? "bg-red-400"   : "bg-slate-500 animate-pulse",
              )} />
              {linkStatus === "live" ? "Live Stream" : linkStatus === "rest" ? "REST Only" : linkStatus === "offline" ? "Offline" : "Connecting…"}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-600">
            Fleet Intelligence · SAR Coordination · World Stream
          </p>
        </div>

        {/* Right: badges + CTA */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border border-sky-400/40 bg-sky-500/10 text-sky-300">
            <Target className="h-3 w-3" /> AI Allocation
          </Badge>
          {simVisual && worldStreamLive && (
            <Badge className="border border-violet-400/40 bg-violet-500/10 text-violet-200">
              <Radar className="h-3 w-3" /> Mesa Step {simVisual.mesa_step}
            </Badge>
          )}
          {apiError && (
            <Badge className="border border-red-500/40 bg-red-500/10 text-red-300" title={apiError}>
              <WifiOff className="h-3 w-3" /> API Error
            </Badge>
          )}
        </div>
      </div>

      {/* ── Mission State ── */}
      <div className="overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900/50 shadow-xl">
        {/* Top accent strip with risk color */}
        <div className={cn(
          "h-[3px] w-full",
          riskBand === "CRITICAL" ? "bg-linear-to-r from-red-600 via-red-400 to-red-600" :
          riskBand === "ELEVATED" ? "bg-linear-to-r from-amber-600 via-amber-400 to-amber-600" :
                                    "bg-linear-to-r from-cyan-700 via-cyan-400 to-cyan-700",
        )} />
        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">Live Mission State</p>
                <p className="mt-0.5 text-xl font-bold tracking-wide text-white">{missionStatus}</p>
              </div>
              <div className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                riskBand === "CRITICAL" ? "border-red-500/40 bg-red-950/60 text-red-300" :
                riskBand === "ELEVATED" ? "border-amber-500/40 bg-amber-950/60 text-amber-300" :
                                          "border-emerald-500/40 bg-emerald-950/60 text-emerald-300",
              )}>
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  riskBand === "CRITICAL" ? "bg-red-400 animate-pulse" :
                  riskBand === "ELEVATED" ? "bg-amber-400" : "bg-emerald-400",
                )} />
                Risk {riskBand}
              </div>
            </div>
            {/* Coverage bar */}
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold uppercase tracking-widest text-slate-500">Area Coverage</span>
                <span className="tabular-nums font-bold text-white">{current.coverage.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    current.coverage >= 85 ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" :
                    current.coverage >= 70 ? "bg-sky-400    shadow-[0_0_8px_rgba(56,189,248,0.5)]" :
                                             "bg-amber-400  shadow-[0_0_8px_rgba(251,191,36,0.5)]",
                  )}
                  style={{ width: `${current.coverage}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4 KPI Cards ── */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Mission Progress",
            value: `${missionProgress.toFixed(1)}%`,
            hint: "Weighted objective completion",
            icon: <Target className="h-4 w-4" />,
            accent: "border-l-emerald-500",
            iconColor: "text-emerald-400",
            glow: "shadow-[inset_0_0_40px_rgba(52,211,153,0.04)]",
          },
          {
            label: "Area Coverage",
            value: `${current.coverage.toFixed(1)}%`,
            hint: "Geographic sectors scanned",
            icon: <Radar className="h-4 w-4" />,
            accent: "border-l-sky-500",
            iconColor: "text-sky-400",
            glow: "shadow-[inset_0_0_40px_rgba(56,189,248,0.04)]",
          },
          {
            label: "Survivors Rescued",
            value: `${rescuedCount} / ${totalSurvivors}`,
            hint: `${totalSurvivors - rescuedCount} awaiting · ${criticalUnrescued} critical`,
            icon: <Users className="h-4 w-4" />,
            accent: criticalUnrescued > 0 ? "border-l-red-500" : "border-l-amber-500",
            iconColor: criticalUnrescued > 0 ? "text-red-400" : "text-amber-400",
            glow: criticalUnrescued > 0 ? "shadow-[inset_0_0_40px_rgba(239,68,68,0.05)]" : "shadow-[inset_0_0_40px_rgba(251,191,36,0.04)]",
          },
          {
            label: "Swarm Efficiency",
            value: `${taskEfficiency}%`,
            hint: `Fleet utilisation ${avgUtilization}%`,
            icon: <Zap className="h-4 w-4" />,
            accent: "border-l-violet-500",
            iconColor: "text-violet-400",
            glow: "shadow-[inset_0_0_40px_rgba(139,92,246,0.04)]",
          },
        ].map((item, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col justify-between rounded-xl border border-slate-800/60 border-l-2 bg-slate-900/50 p-4",
              item.accent, item.glow,
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
              <span className={cn("rounded-lg bg-slate-800/60 p-1.5", item.iconColor)}>
                {item.icon}
              </span>
            </div>
            <div className="mt-3">
              <span className="tabular-nums text-3xl font-bold leading-none text-white">{item.value}</span>
            </div>
            <p className="mt-2 text-[9px] text-slate-600">{item.hint}</p>
          </div>
        ))}
      </div>

      {/* ── Tier 2: Network, Safety & Recovery ── */}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {[
          {
            label: "Drone Utilisation",
            value: `${avgUtilization}%`,
            icon: <Zap className="h-3.5 w-3.5 text-sky-400" />,
            sub: null as React.ReactNode,
          },
          {
            label: "Redundancy Scans",
            value: `${overlapPct}%`,
            icon: hasOverlapping
              ? <Activity className="h-3.5 w-3.5 text-amber-400" />
              : <Target className="h-3.5 w-3.5 text-emerald-400" />,
            sub: null as React.ReactNode,
          },
          {
            label: "Mesh Comm Rate",
            value: `${commSuccess}%`,
            icon: <Wifi className={cn("h-3.5 w-3.5", parseFloat(commSuccess) < 99 ? "text-amber-400" : "text-emerald-400")} />,
            sub: null as React.ReactNode,
          },
          {
            label: "Collision Avoid",
            value: "100%",
            icon: <ShieldCheck className="h-3.5 w-3.5 text-violet-400" />,
            sub: null as React.ReactNode,
          },
          {
            label: "Drone Failures",
            value: null,
            icon: <Activity className="h-3.5 w-3.5 text-sky-400" />,
            sub: (
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                  <span className="tabular-nums text-xl font-bold text-emerald-400">{failuresHandled}</span>
                  <span className="text-[8px] uppercase tracking-widest text-slate-600">Handled</span>
                </div>
                <div className="h-6 w-px bg-slate-700/60" />
                <div className="flex flex-col items-center">
                  <span className="tabular-nums text-xl font-bold text-emerald-400">{avgRecoveryTime}s</span>
                  <span className="text-[8px] uppercase tracking-widest text-slate-600">Avg Recovery</span>
                </div>
              </div>
            ),
          },
        ].map((item, i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-800/60 bg-slate-900/50 p-4 text-center"
          >
            <div className="flex items-center gap-1.5">
              {item.icon}
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
            </div>
            {item.value
              ? <span className="tabular-nums text-2xl font-bold text-white">{item.value}</span>
              : item.sub
            }
          </div>
        ))}
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
                          const colors: Record<string, string> = { "flying": T.blue, "scanning": T.blue, "delivering": T.blue, "charging": T.green, "offline": T.red, "relaying": T.amber };
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
                      const colors: Record<string, string> = { "flying": T.blue, "scanning": T.blue, "delivering": T.blue, "charging": T.green, "offline": T.red, "relaying": T.amber };
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
                <div className="max-h-52 space-y-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-black/20 [&::-webkit-scrollbar-thumb]:bg-cyan-950/80 [&::-webkit-scrollbar-thumb]:rounded-none hover:[&::-webkit-scrollbar-thumb]:bg-cyan-900/80">
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
