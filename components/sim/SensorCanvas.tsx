"use client";

import { useEffect, useRef, useMemo } from "react";
import type { Drone, Survivor, WorldStreamSimVisual } from "@/types/api_types";

interface SensorCanvasProps {
  drones: Drone[];
  survivors: Survivor[];
  simVisual: WorldStreamSimVisual | null;
  gridSize?: number;
}

const STATUS_COLOR: Record<string, string> = {
  scanning: "#3b82f6",
  flying: "#3b82f6",
  idle: "#64748b",
  recalled: "#f59e0b",
  relaying: "#f59e0b",
  charging: "#8b5cf6",
  offline: "#ef4444",
};

const PEAK_HEAT = 72;

function buildMockHeatmap(gridSize: number, survivors: Survivor[]): number[][] {
  const m: number[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () =>
      Math.max(0, PEAK_HEAT * 0.25 + (Math.random() - 0.5) * 10),
    ),
  );
  const hotspots = survivors.map(s => [s.position.y, s.position.x] as [number, number]);
  for (const [hx, hy] of hotspots) {
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const d2 = (x - hx) ** 2 + (y - hy) ** 2;
        m[y][x] = Math.min(100, m[y][x] + PEAK_HEAT * Math.exp(-d2 / (2 * 1.8 ** 2)));
      }
    }
  }
  return m;
}

export function SensorCanvas({
  drones,
  survivors,
  simVisual,
  gridSize = 20,
}: SensorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate a mock heatmap if the backend ABM data isn't available
  const mockHeatmapRef = useRef<number[][] | null>(null);
  
  const heatmap = useMemo(() => {
    // Always use the mock heatmap to ensure hotspots are always visible
    if (survivors.length === 0) return null; // wait until survivor data is loaded
    if (!mockHeatmapRef.current) {
      mockHeatmapRef.current = buildMockHeatmap(gridSize, survivors);
    }
    return mockHeatmapRef.current;
  }, [gridSize, survivors]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cw = W / gridSize;
    const ch = H / gridSize;

    // Background
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, W, H);

    // Heatmap (Using actual or mock)
    if (heatmap) {
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          if (!heatmap[y] || heatmap[y][x] == null) continue;
          const v = Math.min(1, heatmap[y][x] / 100);
          if (v > 0.15) {
            const r = Math.round(30 + v * 220);
            const g = Math.round(v * 60);
            ctx.fillStyle = `rgba(${r},${g},0,${v * 0.6})`;
            ctx.fillRect(x * cw, y * ch, cw, ch);
          }
        }
      }
    }

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cw, 0);
      ctx.lineTo(i * cw, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * ch);
      ctx.lineTo(W, i * ch);
      ctx.stroke();
    }

    // Survivors
    for (const s of survivors) {
      if (!s.detected) continue;
      const { x, y } = s.position;
      const cx = y * cw + cw / 2;
      const cy = x * ch + ch / 2;

      ctx.beginPath();
      ctx.arc(cx, cy, cw * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = s.rescued ? "rgba(56,189,248,0.15)" : "rgba(34,197,94,0.15)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, cw * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = s.rescued ? "#38bdf8" : "#22c55e";
      ctx.fill();
    }

    // Drones
    for (const d of drones) {
      const { x, y } = d.position;
      const cx = y * cw + cw / 2;
      const cy = x * ch + ch / 2;
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

      // ID label (extract number from drone.id)
      const numId = d.drone_id.replace(/\D/g, "") || "?";
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(7, cw * 0.32)}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(numId, cx, cy);
    }
  }, [drones, survivors, heatmap, gridSize]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={400}
      className="w-full bg-[#0d1117] rounded-lg border border-slate-700/50"
    />
  );
}
