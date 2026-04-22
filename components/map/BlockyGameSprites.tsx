"use client";

import { cn } from "@/lib/utils";
import type { Survivor } from "@/types/api_types";

/** Hex palette aligned with SIREN tactical UI (cyan / slate / restrained accent). */
export function survivorShirtColors(s: Survivor): { shirt: string; dimmed: boolean } {
  if (s.rescued) return { shirt: "#22d3ee", dimmed: false };
  if (!s.detected && !s.rescued) return { shirt: "#475569", dimmed: true };
  if (s.condition === "critical") return { shirt: "#fb7185", dimmed: false };
  if (s.condition === "moderate") return { shirt: "#fdba74", dimmed: false };
  if (s.condition === "stable") return { shirt: "#86efac", dimmed: false };
  return { shirt: "#94a3b8", dimmed: false };
}

export function droneBlockyColors(status: string): { hull: string; accent: string; inverted: boolean } {
  const st = status.toLowerCase();
  if (st === "charging") return { hull: "#134e4a", accent: "#5eead4", inverted: false };
  if (st === "offline") return { hull: "#27272a", accent: "#a1a1aa", inverted: true };
  if (st === "relaying") return { hull: "#713f12", accent: "#fcd34d", inverted: false };
  if (st === "scanning" || st === "flying" || st === "delivering") return { hull: "#155e75", accent: "#38bdf8", inverted: false };
  return { hull: "#1e293b", accent: "#94a3b8", inverted: false };
}

const OUT = "#020617";

/** Block operator figure — crisp pixels, premium tactical colors (not grass-world). */
export function BlockySurvivorSprite({
  shirt,
  skin = "#cbd5e1",
  pants = "#1e3a8a",
  hair = "#0f172a",
  className,
  dimmed,
}: {
  shirt: string;
  skin?: string;
  pants?: string;
  hair?: string;
  className?: string;
  dimmed?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 14 18"
      className={cn(
        "shrink-0 overflow-visible drop-shadow-[0_2px_0_rgba(0,0,0,0.75)]",
        dimmed && "opacity-50",
        className,
      )}
      shapeRendering="crispEdges"
      aria-hidden
    >
      <title>Survivor</title>
      <rect x="4" y="0" width="6" height="3" fill={hair} stroke={OUT} strokeWidth="0.5" />
      <rect x="4" y="2" width="6" height="5" fill={skin} stroke={OUT} strokeWidth="0.5" />
      <rect x="5" y="4" width="1" height="1" fill="#0f172a" />
      <rect x="8" y="4" width="1" height="1" fill="#0f172a" />
      <rect x="3" y="7" width="8" height="5" fill={shirt} stroke={OUT} strokeWidth="0.5" />
      <rect x="1" y="8" width="2" height="4" fill={skin} stroke={OUT} strokeWidth="0.5" />
      <rect x="11" y="8" width="2" height="4" fill={skin} stroke={OUT} strokeWidth="0.5" />
      <rect x="4" y="12" width="2" height="5" fill={pants} stroke={OUT} strokeWidth="0.5" />
      <rect x="8" y="12" width="2" height="5" fill={pants} stroke={OUT} strokeWidth="0.5" />
    </svg>
  );
}

export function BlockyDroneSprite({
  hull,
  accent,
  className,
  inverted,
}: {
  hull: string;
  accent: string;
  className?: string;
  inverted?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn(
        "shrink-0 overflow-visible drop-shadow-[0_2px_0_rgba(0,0,0,0.75)]",
        inverted && "rotate-180",
        className,
      )}
      shapeRendering="crispEdges"
      aria-hidden
    >
      <title>Drone</title>
      <rect x="1" y="1" width="4" height="2" fill={accent} stroke={OUT} strokeWidth="0.5" />
      <rect x="11" y="1" width="4" height="2" fill={accent} stroke={OUT} strokeWidth="0.5" />
      <rect x="1" y="13" width="4" height="2" fill={accent} stroke={OUT} strokeWidth="0.5" />
      <rect x="11" y="13" width="4" height="2" fill={accent} stroke={OUT} strokeWidth="0.5" />
      <rect x="2" y="6" width="3" height="2" fill="#0f172a" stroke={OUT} strokeWidth="0.5" />
      <rect x="11" y="6" width="3" height="2" fill="#0f172a" stroke={OUT} strokeWidth="0.5" />
      <rect x="5" y="5" width="6" height="6" fill={hull} stroke={OUT} strokeWidth="0.5" />
      <rect x="7" y="7" width="2" height="2" fill={accent} stroke={OUT} strokeWidth="0.5" />
    </svg>
  );
}

/** Charging tile — cyan / emerald tech slab */
export function BlockyChargingSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={cn("shrink-0 drop-shadow-[0_1px_0_#000]", className)} shapeRendering="crispEdges" aria-hidden>
      <rect x="0" y="0" width="10" height="10" fill="#0f172a" stroke={OUT} strokeWidth="0.5" />
      <rect x="1" y="1" width="8" height="2" fill="#155e75" />
      <rect x="1" y="4" width="8" height="2" fill="#22d3ee" opacity="0.85" />
      <rect x="1" y="7" width="8" height="2" fill="#0d9488" />
    </svg>
  );
}

/** Supply module — slate + cyan latch */
export function BlockyDepotSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={cn("shrink-0 drop-shadow-[0_1px_0_#000]", className)} shapeRendering="crispEdges" aria-hidden>
      <rect x="0" y="2" width="10" height="7" fill="#1e293b" stroke={OUT} strokeWidth="0.5" />
      <rect x="0" y="2" width="10" height="2" fill="#334155" />
      <rect x="2" y="5" width="6" height="1" fill="#0f172a" />
      <rect x="4" y="6" width="2" height="2" fill="#22d3ee" />
    </svg>
  );
}
