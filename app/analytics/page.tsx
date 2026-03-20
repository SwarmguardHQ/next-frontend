"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock3,
  Radar,
  ShieldCheck,
  Wifi,
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

const MAX_POINTS = 48;
const START_TIME = Date.now() - MAX_POINTS * 2000;
const TACTICAL = {
  card: "#111827",
  border: "rgba(61,158,228,0.35)",
  textDim: "#64748b",
  blue: "#3d9ee4",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createSeedPoints(): StreamPoint[] {
  const points: StreamPoint[] = [];
  for (let i = 0; i < MAX_POINTS; i += 1) {
    const t = START_TIME + i * 2000;
    const anomaly = i === 33 ? 46 : 0;
    const latency = 52 + Math.sin(i / 5) * 9 + anomaly;
    const coverage = 38 + i * 1.04 + Math.cos(i / 7) * 1.3;
    const activeDrones = i > 34 ? 4 : 5;
    const risk = latency > 90 ? 72 : 24 + Math.sin(i / 4) * 6;
    points.push({
      time: formatClock(t),
      latencyMs: Math.round(clamp(latency, 30, 170)),
      coverage: Number(clamp(coverage, 0, 99).toFixed(1)),
      activeDrones,
      risk: Number(clamp(risk, 10, 95).toFixed(1)),
    });
  }
  return points;
}

function toSafePoints(input: StreamPoint[]): StreamPoint[] {
  return input.map((p) => ({
    time: typeof p.time === "string" ? p.time : "--:--:--",
    latencyMs: clamp(Number(p.latencyMs), 0, 300),
    coverage: clamp(Number(p.coverage), 0, 100),
    activeDrones: Math.round(clamp(Number(p.activeDrones), 0, 8)),
    risk: clamp(Number(p.risk), 0, 100),
  }));
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export default function AnalyticsPage() {
  const [stream, setStream] = useState<StreamPoint[]>(() => createSeedPoints());
  const [events, setEvents] = useState<EventLog[]>([]);

  useEffect(() => {
    const now = Date.now();
    setEvents([
      {
        id: "e1",
        ts: formatClock(now - 12000),
        level: "OBS",
        text: "Mesh health nominal. Sector SW link budget stable at 82%.",
      },
      {
        id: "e2",
        ts: formatClock(now - 8000),
        level: "WARN",
        text: "Relay R-3 interference burst detected. RTT exceeded 95ms threshold.",
      },
      {
        id: "e3",
        ts: formatClock(now - 4000),
        level: "ACTION",
        text: "Fallback route enabled. Drone D3 reassigned to maintain sweep continuity.",
      },
    ]);
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setStream((prev) => {
        const last = prev[prev.length - 1];
        const nextLatency = clamp(
          last.latencyMs + (Math.random() * 16 - 8) + (Math.random() > 0.93 ? 38 : 0),
          34,
          170
        );
        const nextCoverage = clamp(last.coverage + Math.random() * 0.75, 0, 98.6);
        const nextActive = nextLatency > 120 ? 4 : 5;
        const nextRisk = clamp(
          (nextLatency - 40) * 0.82 + (5 - nextActive) * 16 + (Math.random() * 6 - 3),
          8,
          99
        );
        const nextPoint: StreamPoint = {
          time: formatClock(Date.now()),
          latencyMs: Math.round(nextLatency),
          coverage: Number(nextCoverage.toFixed(1)),
          activeDrones: nextActive,
          risk: Number(nextRisk.toFixed(1)),
        };
        return [...prev.slice(-(MAX_POINTS - 1)), nextPoint];
      });
    }, 1800);

    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const last = stream[stream.length - 1];
    if (!last) return;
    if (last.latencyMs > 120) {
      setEvents((prev) => [
        {
          id: crypto.randomUUID(),
          ts: last.time,
          level: "WARN",
          text: `Latency anomaly ${last.latencyMs}ms. Prioritising command channel and lowering payload sync rate.`,
        },
        ...prev.slice(0, 5),
      ]);
    }
  }, [stream]);

  const points = useMemo(() => toSafePoints(stream), [stream]);
  const current = points[points.length - 1];
  const previous = points[points.length - 2] ?? current;
  const latencyDelta = current.latencyMs - previous.latencyMs;
  const riskBand =
    current.risk >= 75 ? "CRITICAL" : current.risk >= 55 ? "ELEVATED" : "STABLE";
  const missionStatusText =
    current.risk >= 75
      ? "Contingency routing active"
      : current.risk >= 55
        ? "Route optimization engaged"
        : "Mission envelope nominal";

  const droneStatusData = useMemo(
    () => [
      { name: "Flying", value: Math.max(current.activeDrones - 2, 0), color: "#3d9ee4" },
      { name: "Scanning", value: 2, color: "#22c55e" },
      { name: "Charging", value: 1, color: "#f59e0b" },
      { name: "Offline", value: 5 - current.activeDrones, color: "#ef4444" },
    ],
    [current.activeDrones]
  );

  const missionPerformanceData = [
    { sector: "NW", completed: 16, pending: 2 },
    { sector: "NE", completed: 13, pending: 3 },
    { sector: "C", completed: 19, pending: 1 },
    { sector: "SW", completed: 11, pending: 4 },
    { sector: "SE", completed: 14, pending: 3 },
  ];

  const survivorNeedsData = [
    { need: "Medical", count: 42 },
    { need: "Water", count: 77 },
    { need: "Food", count: 63 },
    { need: "Shelter", count: 28 },
    { need: "Extraction", count: 22 },
  ];

  return (
    <div className="flex-1 space-y-4 rounded-lg bg-[#0d1117] p-4 text-white sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-wide sm:text-3xl">
            Tactical Analytics Grid
          </h2>
          <p className="text-xs tracking-widest text-slate-300 uppercase">
            Realtime mission intelligence and anomaly watch
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="border border-emerald-400/40 bg-emerald-500/10 text-emerald-300">
            <Wifi className="h-3 w-3" /> LIVE LINK
          </Badge>
          <Badge className="border border-sky-400/40 bg-sky-500/10 text-sky-300">
            <Radar className="h-3 w-3" /> OFFLINE CAPABLE
          </Badge>
        </div>
      </div>

      <Card className="border border-sky-400/30 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.25)]">
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] tracking-[0.16em] text-slate-300 uppercase">
                Live Mission Command State
              </p>
              <p className="mt-1 text-2xl font-bold tracking-wide text-white">
                {missionStatusText}
              </p>
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
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="tracking-widest uppercase">Area Closure Progress</span>
              <span className="tabular-nums font-bold text-white">{current.coverage.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800">
              <div
                className={`h-2 rounded-full transition-all ${
                  current.coverage >= 85
                    ? "bg-emerald-400"
                    : current.coverage >= 70
                      ? "bg-sky-400"
                      : "bg-amber-400"
                }`}
                style={{ width: `${current.coverage}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Mesh Latency",
            value: `${current.latencyMs} ms`,
            hint:
              latencyDelta > 0
                ? `+${latencyDelta} ms vs last sample`
                : `${latencyDelta} ms vs last sample`,
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
            value: `${current.activeDrones}/5 Active`,
            hint:
              current.activeDrones < 5
                ? "One drone in degraded state"
                : "All mission drones available",
            icon: <ShieldCheck className="h-4 w-4 text-emerald-300" />,
          },
          {
            label: "Risk Index",
            value: `${Math.round(current.risk)}`,
            hint: current.risk > 70 ? "Warning zone" : "Within safe envelope",
            icon: <AlertTriangle className="h-4 w-4 text-amber-300" />,
          },
        ].map((item) => (
          <Card
            key={item.label}
            className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.2)]"
          >
            <CardHeader className="pb-1">
              <CardDescription className="text-[11px] tracking-[0.14em] text-slate-300 uppercase">
                {item.label}
              </CardDescription>
              <CardTitle className="flex items-center justify-between text-2xl font-semibold tracking-wide">
                <span className="tabular-nums font-bold text-white">{item.value}</span>
                {item.icon}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-slate-300">{item.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="col-span-4 border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.22)]">
          <CardHeader>
            <CardTitle className="text-base tracking-wide text-white">
              Mesh Latency + Risk Timeline
            </CardTitle>
            <CardDescription className="text-slate-300">
              2s ingest cadence, 48-sample rolling window
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: TACTICAL.textDim, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={26}
                  />
                  <YAxis
                    yAxisId="latency"
                    domain={[20, 180]}
                    tick={{ fill: TACTICAL.textDim, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="risk"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fill: TACTICAL.textDim, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ReferenceLine
                    yAxisId="latency"
                    y={95}
                    stroke={TACTICAL.amber}
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    yAxisId="latency"
                    y={120}
                    stroke={TACTICAL.red}
                    strokeDasharray="4 4"
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: TACTICAL.card,
                      border: `1px solid ${TACTICAL.border}`,
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                    formatter={(value: unknown, key: unknown) => {
                      const safeValue = toNumber(value);
                      return key === "latencyMs"
                        ? [`${safeValue} ms`, "Latency"]
                        : [`${safeValue}`, "Risk"];
                    }}
                  />
                  <Line
                    yAxisId="latency"
                    type="monotone"
                    dataKey="latencyMs"
                    stroke={TACTICAL.blue}
                    strokeWidth={2.2}
                    dot={false}
                  />
                  <Line
                    yAxisId="risk"
                    type="monotone"
                    dataKey="risk"
                    stroke={TACTICAL.amber}
                    strokeWidth={1.7}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3 border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.22)]">
          <CardHeader>
            <CardTitle className="text-base tracking-wide text-white">
              Fleet State Distribution
            </CardTitle>
            <CardDescription className="text-slate-300">
              Mission-ready posture by drone mode
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[310px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={droneStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={88}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {droneStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: TACTICAL.card,
                      border: `1px solid ${TACTICAL.border}`,
                      borderRadius: 8,
                    }}
                    formatter={(value: unknown) => {
                      const safeValue = toNumber(value);
                      return [`${safeValue} drones`, "Count"];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                {droneStatusData.map((st) => (
                  <div
                    key={st.name}
                    className="flex items-center justify-between rounded-md border border-slate-700/70 bg-slate-900/40 px-2 py-1"
                  >
                    <span className="flex items-center gap-1 text-slate-300">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: st.color }}
                      />
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

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.22)] xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base tracking-wide text-white">
              Sector Completion Matrix
            </CardTitle>
            <CardDescription className="text-slate-300">
              Completed vs remaining scans per sector
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={missionPerformanceData}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis
                    dataKey="sector"
                    tick={{ fill: TACTICAL.textDim, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: TACTICAL.textDim, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: TACTICAL.card,
                      border: `1px solid ${TACTICAL.border}`,
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="completed" fill={TACTICAL.green} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" fill={TACTICAL.amber} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.22)] xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base tracking-wide text-white">
              Survivor Need Pressure
            </CardTitle>
            <CardDescription className="text-slate-300">
              Aggregated demand by supply class
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={survivorNeedsData} layout="vertical">
                  <CartesianGrid
                    stroke="rgba(148,163,184,0.12)"
                    horizontal
                    vertical={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fill: TACTICAL.textDim, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="need"
                    tick={{ fill: TACTICAL.textDim, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: TACTICAL.card,
                      border: `1px solid ${TACTICAL.border}`,
                      borderRadius: 8,
                    }}
                    formatter={(value: unknown) => {
                      const safeValue = toNumber(value);
                      return [`${safeValue} requests`, "Demand"];
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={16}>
                    {survivorNeedsData.map((item) => (
                      <Cell
                        key={item.need}
                        fill={
                          item.count >= 70
                            ? TACTICAL.red
                            : item.count >= 50
                              ? TACTICAL.amber
                              : TACTICAL.blue
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.22)] xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base tracking-wide text-white">Command Event Feed</CardTitle>
            <CardDescription className="text-slate-300">
              Recent autonomous decisions and warnings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] space-y-2 overflow-auto pr-1">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-md border border-slate-700/70 bg-slate-900/40 p-2"
                >
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span
                      className={`font-semibold tracking-wide ${
                        event.level === "WARN"
                          ? "text-amber-300"
                          : event.level === "ACTION"
                            ? "text-emerald-300"
                            : "text-sky-300"
                      }`}
                    >
                      [{event.level}]
                    </span>
                    <span className="tabular-nums text-slate-400">{event.ts}</span>
                  </div>
                  <p className="text-xs text-slate-300">{event.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.22)]">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base tracking-wide text-white">Coverage Momentum</CardTitle>
            <CardDescription className="text-slate-300">
              Operational area closure and communications health
            </CardDescription>
          </div>
          <Badge className="border border-slate-500/50 bg-slate-700/30 text-slate-200">
            <Clock3 className="h-3 w-3" /> Last sample {current.time}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="h-[190px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points}>
                <defs>
                  <linearGradient id="coverageFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="4%" stopColor={TACTICAL.blue} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={TACTICAL.blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fill: TACTICAL.textDim, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={30}
                />
                <YAxis
                  domain={[30, 100]}
                  tick={{ fill: TACTICAL.textDim, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: TACTICAL.card,
                    border: `1px solid ${TACTICAL.border}`,
                    borderRadius: 8,
                  }}
                  formatter={(value: unknown) => {
                    const safeValue = toNumber(value);
                    return [`${safeValue}%`, "Coverage"];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="coverage"
                  stroke={TACTICAL.blue}
                  strokeWidth={2}
                  fill="url(#coverageFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
