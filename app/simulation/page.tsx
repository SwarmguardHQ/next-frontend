"use client";

/**
 * SIREN Simulation — self-contained browser ABM.
 * Mirrors drone-sim/simulation/ (DroneAgent + DisasterZone) in TypeScript
 * so the page works without USE_MESA_SIM=1 or any backend dependency.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play, Pause, RotateCcw, SkipForward,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Constants (mirrors constants.py) ─────────────────────────────────────────
const GRID          = 20;
const N_DRONES      = 5;
const N_SURVIVORS   = 4;
const DRAIN         = 0.5;   // battery per step
const IDLE_DRAIN    = 0.1;
const CHARGE_RATE   = 2.0;
const CHARGE_ZONE   = [0, 0] as [number, number];
const EMERGENCY_THR = 10;    // % → recall
const SCAN_R        = 1;     // neighbourhood radius
const HEAT_THR      = 60;    // detection threshold
const MIN_SCANS     = 2;     // scans before confirm
const PEAK_HEAT     = 72;

// ─── Types ────────────────────────────────────────────────────────────────────
type Status = "scanning" | "idle" | "recalled" | "charging" | "offline";

interface Drone {
  id: number;
  x: number; y: number;
  battery: number;
  status: Status;
  target: [number, number] | null;
  path: [number, number][];
  lastHeat: number;
}

interface Confirmed {
  x: number; y: number;
  heat: number;
  confidence: number;
  scanCount: number;
  droneId: number;
}

interface Pending { x: number; y: number; scans: number; heat: number }

interface Sim {
  step: number;
  startMs: number;
  drones: Drone[];
  heatmap: number[][];           // [y][x] 0-100
  scanned: Set<string>;          // "x,y"
  confirmed: Confirmed[];
  pending: Map<string, Pending>;
  coverage: number;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

function buildHeatmap(hotspots: [number, number][]): number[][] {
  const m: number[][] = Array.from({ length: GRID }, () =>
    Array.from({ length: GRID }, () =>
      Math.max(0, PEAK_HEAT * 0.25 + (Math.random() - 0.5) * 10),
    ),
  );
  for (const [hx, hy] of hotspots) {
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const d2 = (x - hx) ** 2 + (y - hy) ** 2;
        m[y][x] = Math.min(100, m[y][x] + PEAK_HEAT * Math.exp(-d2 / (2 * 1.8 ** 2)));
      }
    }
  }
  return m;
}

function bfs(fx: number, fy: number, tx: number, ty: number): [number, number][] {
  if (fx === tx && fy === ty) return [];
  type Node = { x: number; y: number; path: [number, number][] };
  const q: Node[] = [{ x: fx, y: fy, path: [] }];
  const vis = new Set<string>([`${fx},${fy}`]);
  const dirs: [number, number][] = [[1,0],[-1,0],[0,1],[0,-1]];
  while (q.length) {
    const { x, y, path } = q.shift()!;
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
      const k = `${nx},${ny}`;
      if (vis.has(k)) continue;
      vis.add(k);
      const np: [number, number][] = [...path, [nx, ny]];
      if (nx === tx && ny === ty) return np;
      q.push({ x: nx, y: ny, path: np });
    }
  }
  return [[tx, ty]];
}

function nearestUnscanned(x: number, y: number, scanned: Set<string>): [number, number] | null {
  // Spiral outward for better distribution
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      if (scanned.has(`${cx},${cy}`)) continue;
      const d = Math.abs(cx - x) + Math.abs(cy - y);
      if (d < bestD) { bestD = d; best = [cx, cy]; }
    }
  }
  return best;
}

function initSim(): Sim {
  // Survivor hotspots — avoid corners and centre (where drones start)
  const reserved = new Set(["0,0","19,0","0,19","19,19","9,9","10,9","9,10","10,10"]);
  const hotspots: [number, number][] = [];
  while (hotspots.length < N_SURVIVORS) {
    const x = 2 + Math.floor(Math.random() * (GRID - 4));
    const y = 2 + Math.floor(Math.random() * (GRID - 4));
    const k = `${x},${y}`;
    if (!reserved.has(k)) { hotspots.push([x, y]); reserved.add(k); }
  }

  const starts: [number, number][] = [[0,0],[19,0],[0,19],[19,19],[9,9]];
  const drones: Drone[] = starts.slice(0, N_DRONES).map((s, i) => ({
    id: i, x: s[0], y: s[1],
    battery: 85 + Math.random() * 14,
    status: "idle",
    target: null, path: [], lastHeat: 0,
  }));

  return {
    step: 0,
    startMs: Date.now(),
    drones,
    heatmap: buildHeatmap(hotspots),
    scanned: new Set(),
    confirmed: [],
    pending: new Map(),
    coverage: 0,
  };
}

function tickSim(prev: Sim): Sim {
  const drones: Drone[] = prev.drones.map(d => ({ ...d, path: [...d.path] }));
  const scanned = new Set(prev.scanned);
  const pending = new Map(prev.pending);
  const confirmed: Confirmed[] = [...prev.confirmed];

  for (const d of drones) {
    if (d.status === "offline") continue;

    // ── Charging ──
    if (d.status === "charging") {
      d.battery = Math.min(100, d.battery + CHARGE_RATE);
      if (d.battery >= 95) d.status = "idle";
      scanAround(d, scanned, prev.heatmap, pending, confirmed);
      continue;
    }

    // ── Battery drain ──
    d.battery = Math.max(0, d.battery - (d.status === "idle" ? IDLE_DRAIN : DRAIN));
    if (d.battery <= 0) { d.status = "offline"; continue; }

    // ── Emergency recall ──
    if (d.battery <= EMERGENCY_THR && d.status !== "recalled") {
      d.status = "recalled";
      d.target = CHARGE_ZONE;
      d.path = bfs(d.x, d.y, CHARGE_ZONE[0], CHARGE_ZONE[1]);
    }

    // ── Recalled — move to charge ──
    if (d.status === "recalled") {
      if (d.x === CHARGE_ZONE[0] && d.y === CHARGE_ZONE[1]) {
        d.status = "charging"; d.target = null; d.path = [];
      } else {
        moveAlongPath(d, scanned, prev.heatmap, pending, confirmed);
      }
      continue;
    }

    // ── Pick next unscanned target ──
    if (!d.target || (d.x === d.target[0] && d.y === d.target[1])) {
      const t = nearestUnscanned(d.x, d.y, scanned);
      if (t) { d.target = t; d.path = bfs(d.x, d.y, t[0], t[1]); }
      else { d.status = "idle"; }
    }

    // ── Move + scan ──
    if (d.path.length) {
      moveAlongPath(d, scanned, prev.heatmap, pending, confirmed);
    } else {
      scanAround(d, scanned, prev.heatmap, pending, confirmed);
    }
  }

  const coverage = (scanned.size / (GRID * GRID)) * 100;
  return { ...prev, step: prev.step + 1, drones, scanned, confirmed, pending, coverage };
}

function moveAlongPath(
  d: Drone, scanned: Set<string>, hmap: number[][],
  pending: Map<string, Pending>, confirmed: Confirmed[],
) {
  if (!d.path.length) return;
  const [nx, ny] = d.path.shift()!;
  d.x = nx; d.y = ny;
  d.status = "scanning";
  scanAround(d, scanned, hmap, pending, confirmed);
}

function scanAround(
  d: Drone, scanned: Set<string>, hmap: number[][],
  pending: Map<string, Pending>, confirmed: Confirmed[],
) {
  for (let dy = -SCAN_R; dy <= SCAN_R; dy++) {
    for (let dx = -SCAN_R; dx <= SCAN_R; dx++) {
      const nx = d.x + dx, ny = d.y + dy;
      if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
      scanned.add(`${nx},${ny}`);
      const heat = hmap[ny][nx];
      d.lastHeat = Math.max(d.lastHeat, heat);
      if (heat >= HEAT_THR) {
        const k = `${nx},${ny}`;
        const p = pending.get(k);
        if (!p) {
          pending.set(k, { x: nx, y: ny, scans: 1, heat });
        } else {
          p.scans += 1;
          p.heat = Math.max(p.heat, heat);
          if (p.scans >= MIN_SCANS && !confirmed.some(c => c.x === nx && c.y === ny)) {
            confirmed.push({
              x: nx, y: ny,
              heat: Math.round(p.heat * 10) / 10,
              confidence: Math.min(0.99, (p.heat / 100) * 0.6 + Math.min(p.scans, 5) / 5 * 0.4),
              scanCount: p.scans,
              droneId: d.id,
            });
          }
        }
      }
    }
  }
}

// ─── Canvas renderer ─────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  scanning: "#3b82f6",
  idle:     "#64748b",
  recalled: "#f59e0b",
  charging: "#8b5cf6",
  offline:  "#ef4444",
};

function draw(canvas: HTMLCanvasElement, sim: Sim) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const cw = W / GRID, ch = H / GRID;

  // Background
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, W, H);

  // Heatmap
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const v = Math.min(1, sim.heatmap[y][x] / 100);
      if (v > 0.15) {
        const r = Math.round(30 + v * 220);
        const g = Math.round(v * 60);
        ctx.fillStyle = `rgba(${r},${g},0,${v * 0.6})`;
        ctx.fillRect(x * cw, y * ch, cw, ch);
      }
    }
  }

  // Scanned overlay
  for (const key of sim.scanned) {
    const [sx, sy] = key.split(",").map(Number);
    ctx.fillStyle = "rgba(56,189,248,0.06)";
    ctx.fillRect(sx * cw, sy * ch, cw, ch);
  }

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= GRID; i++) {
    ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * ch); ctx.lineTo(W, i * ch); ctx.stroke();
  }

  // Pending detections
  for (const [, p] of sim.pending) {
    if (sim.confirmed.some(c => c.x === p.x && c.y === p.y)) continue;
    const cx = p.x * cw + cw / 2, cy = p.y * ch + ch / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cw * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(245,158,11,0.18)";
    ctx.fill();
    ctx.strokeStyle = "rgba(245,158,11,0.7)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Confirmed survivors
  for (const s of sim.confirmed) {
    const cx = s.x * cw + cw / 2, cy = s.y * ch + ch / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cw * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(34,197,94,0.15)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, cw * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "#22c55e";
    ctx.fill();
  }

  // Drones
  for (const d of sim.drones) {
    const cx = d.x * cw + cw / 2, cy = d.y * ch + ch / 2;
    const col = STATUS_COLOR[d.status] ?? "#64748b";
    const r = cw * 0.27;

    // Shadow
    ctx.beginPath();
    ctx.arc(cx, cy + 1.5, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();

    // Arms
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * cw * 0.42, Math.sin(a) * cw * 0.42);
      ctx.stroke();
    }
    ctx.restore();

    // Body
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();

    // ID label
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(7, cw * 0.32)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(d.id), cx, cy);
  }
}

// ─── Speeds ───────────────────────────────────────────────────────────────────
const SPEEDS = [
  { label: "0.5×", ms: 1400 },
  { label: "1×",   ms: 700  },
  { label: "2×",   ms: 350  },
  { label: "4×",   ms: 140  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SimulationPage() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const [sim,      setSim]      = useState<Sim>(() => initSim());
  const [playing,  setPlaying]  = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [showLog,  setShowLog]  = useState(true);

  // Draw on every state update
  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, sim);
  }, [sim]);

  const step = useCallback(() => setSim(tickSim), []);

  // Auto-play
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!playing) return;
    timerRef.current = setInterval(step, SPEEDS[speedIdx].ms);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, speedIdx, step]);

  const reset = useCallback(() => {
    setPlaying(false);
    setSim(initSim());
  }, []);

  const elapsed = Math.round((Date.now() - sim.startMs) / 1000);
  const totalCells = GRID * GRID;

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-[#0d1117] text-[#e6edf3]">
      <div className="mx-auto max-w-[1300px] px-4 py-5 sm:px-6">

        {/* ── Header ── */}
        <div className="mb-5 flex items-center justify-between">
      <div>
            <h1 className="text-base font-semibold text-[#e6edf3]">
              SIREN Swarm Simulation
        </h1>
            <p className="mt-0.5 text-sm text-[#8b949e]">
              Agent-based rescue model · {GRID}×{GRID} grid · {N_DRONES} drones · {N_SURVIVORS} survivors
        </p>
      </div>
          <span className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
            playing
              ? "bg-[#1a2f1a] text-[#3fb950]"
              : "bg-[#1c2128] text-[#8b949e]",
          )}>
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              playing ? "bg-[#3fb950] animate-pulse" : "bg-[#8b949e]",
            )} />
            {playing ? "Running" : "Paused"}
          </span>
        </div>

        {/* ── Toolbar ── */}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2">
          {/* Play / Pause */}
          <button
            onClick={() => setPlaying(v => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              playing
                ? "bg-[#21262d] text-[#d29922] hover:bg-[#30363d]"
                : "bg-[#238636] text-white hover:bg-[#2ea043]",
            )}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "Pause" : "Run"}
          </button>

          {/* Step */}
          <button
            onClick={step}
            disabled={playing}
            className="flex items-center gap-1.5 rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-sm text-[#c9d1d9] hover:bg-[#30363d] disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            <SkipForward className="h-3.5 w-3.5" />
            Step
          </button>

          {/* Reset */}
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-sm text-[#c9d1d9] hover:bg-[#30363d] transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>

          {/* Divider */}
          <div className="mx-1 h-5 w-px bg-[#30363d]" />

          {/* Speed */}
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-[#8b949e]">Speed</span>
            {SPEEDS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setSpeedIdx(i)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs transition-colors",
                  speedIdx === i
                    ? "bg-[#388bfd1a] text-[#58a6ff] font-medium"
                    : "text-[#8b949e] hover:text-[#c9d1d9]",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Stats — right-aligned */}
          <div className="ml-auto flex items-center gap-4 text-xs text-[#8b949e]">
            <span>Step <span className="font-mono text-[#e6edf3]">{sim.step}</span></span>
            <span>Coverage <span className="font-mono text-[#e6edf3]">{sim.coverage.toFixed(1)}%</span></span>
            <span>Found <span className="font-mono text-[#3fb950]">{sim.confirmed.length}</span></span>
            <span className="hidden sm:inline">
              Elapsed <span className="font-mono text-[#e6edf3]">{elapsed}s</span>
            </span>
          </div>
        </div>

        {/* ── Main layout ── */}
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">

          {/* Canvas */}
          <div className="overflow-hidden rounded-lg border border-[#30363d]">
            <div className="flex items-center justify-between border-b border-[#21262d] bg-[#161b22] px-3 py-2">
              <span className="text-xs text-[#8b949e]">Field view</span>
              <div className="flex items-center gap-3 text-[11px] text-[#8b949e]">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#3b82f6]" /> Drone
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Confirmed
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Pending
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-orange-500" /> Heat
                </span>
              </div>
            </div>
            <canvas
              ref={canvasRef}
              width={560}
              height={560}
              className="w-full bg-[#0d1117]"
            />
            {/* Coverage bar */}
            <div className="border-t border-[#21262d] bg-[#161b22] px-3 py-2">
              <div className="flex items-center justify-between text-[11px] text-[#8b949e] mb-1">
                <span>Area scanned</span>
                <span className="font-mono">{sim.scanned.size} / {totalCells} cells</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#21262d]">
                <div
                  className="h-full rounded-full bg-[#58a6ff] transition-all duration-300"
                  style={{ width: `${sim.coverage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-3">

            {/* Drone fleet table */}
            <div className="overflow-hidden rounded-lg border border-[#30363d]">
              <div className="border-b border-[#21262d] bg-[#161b22] px-3 py-2">
                <span className="text-xs font-medium text-[#8b949e]">Fleet status</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#21262d] bg-[#161b22]">
                    <th className="px-3 py-1.5 text-left font-medium text-[#8b949e]">#</th>
                    <th className="px-3 py-1.5 text-left font-medium text-[#8b949e]">Status</th>
                    <th className="px-3 py-1.5 text-right font-medium text-[#8b949e]">Bat.</th>
                    <th className="px-3 py-1.5 text-right font-medium text-[#8b949e]">Pos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d]">
                  {sim.drones.map((d) => (
                    <tr key={d.id} className="bg-[#0d1117] hover:bg-[#161b22] transition-colors">
                      <td className="px-3 py-2">
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: STATUS_COLOR[d.status] ?? "#475569" }}
                        >
                          {d.id}
                        </span>
                      </td>
                      <td className="px-3 py-2 capitalize text-[#c9d1d9]">
                        {d.status}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={cn(
                          "font-mono",
                          d.battery > 50 ? "text-[#3fb950]"
                            : d.battery > 20 ? "text-[#d29922]"
                              : "text-[#f85149]",
                        )}>
                          {Math.round(d.battery)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[#8b949e]">
                        {d.x},{d.y}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Confirmed survivors */}
            <div className="overflow-hidden rounded-lg border border-[#30363d]">
              <button
                className="flex w-full items-center justify-between border-b border-[#21262d] bg-[#161b22] px-3 py-2 text-xs"
                onClick={() => setShowLog(v => !v)}
              >
                <span className="font-medium text-[#8b949e]">
                  Confirmed survivors
                  <span className={cn(
                    "ml-2 rounded-full px-1.5 py-0.5 text-[10px]",
                    sim.confirmed.length > 0
                      ? "bg-[#1a2f1a] text-[#3fb950]"
                      : "bg-[#1c2128] text-[#8b949e]",
                  )}>
                    {sim.confirmed.length}
                  </span>
                </span>
                {showLog
                  ? <ChevronUp className="h-3.5 w-3.5 text-[#8b949e]" />
                  : <ChevronDown className="h-3.5 w-3.5 text-[#8b949e]" />
                }
              </button>
              {showLog && (
                <div className="max-h-40 overflow-y-auto bg-[#0d1117]">
                  {sim.confirmed.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-[#8b949e]">
                      No detections yet — drones are sweeping the area.
                    </p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#21262d] bg-[#161b22]">
                          <th className="px-3 py-1.5 text-left font-medium text-[#8b949e]">Pos</th>
                          <th className="px-3 py-1.5 text-right font-medium text-[#8b949e]">Conf.</th>
                          <th className="px-3 py-1.5 text-right font-medium text-[#8b949e]">Scans</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#21262d]">
                        {sim.confirmed.map((s, i) => (
                          <tr key={i} className="bg-[#0d1117] hover:bg-[#161b22]">
                            <td className="px-3 py-1.5 font-mono text-[#3fb950]">
                              {s.x},{s.y}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-[#c9d1d9]">
                              {(s.confidence * 100).toFixed(0)}%
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-[#8b949e]">
                              {s.scanCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            {/* Pending */}
            {sim.pending.size > 0 && (
              <div className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2.5">
                <p className="mb-2 text-xs font-medium text-[#8b949e]">
                  Pending detection
                  <span className="ml-1.5 text-[#d29922]">({sim.pending.size})</span>
                </p>
                <div className="space-y-1">
                  {[...sim.pending.values()]
                    .filter(p => !sim.confirmed.some(c => c.x === p.x && c.y === p.y))
                    .slice(0, 4)
                    .map((p, i) => (
                      <div key={i} className="flex justify-between font-mono text-[11px]">
                        <span className="text-[#d29922]">{p.x},{p.y}</span>
                        <span className="text-[#8b949e]">{p.scans}/{MIN_SCANS} scans</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
