"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Drone, Survivor } from "@/types/api_types";
import {
  createTileSlabGeometry,
  gridSceneCenter,
  lodStepFromDistance,
  mapToWorldVec,
  SLAB_H,
} from "@/lib/tacticalIsoMath";
import { cn } from "@/lib/utils";

// module-level temp vector (avoids per-frame allocation)
const _tv3 = new THREE.Vector3();

// ─── camera constants ─────────────────────────────────────────────────────────
// Classic isometric: 60° from zenith = 30° above horizon
const DRONE_ALT = 0.82;
const BH_CS     = 0.75;
const BH_DEPOT  = 0.38;
const MIN_POLAR = (42 * Math.PI) / 180;
const MAX_POLAR = (72 * Math.PI) / 180;
const DEF_POLAR = (60 * Math.PI) / 180;   // ← classic 30° elevation isometric
const TILE_COLORS = ["#16223a", "#1a2840", "#1c2d48", "#19253e"] as const;

// ─── exported types ───────────────────────────────────────────────────────────
export type MapInfraItem = { id: string; x: number; y: number };
export type TacticalPick =
  | { kind: "drone";    data: Drone }
  | { kind: "survivor"; data: Survivor }
  | { kind: "charging"; data: MapInfraItem }
  | { kind: "depot";    data: MapInfraItem };
export type TacticalIsoControls = { setNorth: () => void; resetView: () => void };
export type TacticalIsoFieldProps = {
  gridSize: number;
  drones: Drone[];
  survivors: Survivor[];
  chargingStations: MapInfraItem[];
  supplyDepots: MapInfraItem[];
  simHeat: number[][] | null;
  pulse: number;
  locationName?: string;
  onSelectItem: (clientX: number, clientY: number, item: TacticalPick) => void;
  onDeselect: () => void;
  onAzimuthRad?: (rad: number) => void;
};

function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)); }
const setCursor = (v: string) => { if (typeof document !== "undefined") document.body.style.cursor = v; };

// ─── color helpers ────────────────────────────────────────────────────────────
function mcShirt(s: Survivor): string {
  if (s.rescued)                   return "#22d3ee";
  if (!s.detected && !s.rescued)   return "#64748b";
  if (s.condition === "critical")  return "#ef4444";
  if (s.condition === "moderate")  return "#f97316";
  if (s.condition === "stable")    return "#22c55e";
  return "#94a3b8";
}
function droneGlow(status: string): string {
  if (status === "charging")  return "#4ade80";
  if (status === "offline")   return "#6b7280";
  if (status === "returning") return "#fbbf24";
  return "#38bdf8";
}
function droneBody(status: string): string {
  if (status === "charging")  return "#065f46";
  if (status === "offline")   return "#374151";
  if (status === "returning") return "#92400e";
  return "#155e75";
}

// ─── 2-D minimap overlay ──────────────────────────────────────────────────────
const MM = 148; // minimap canvas physical pixels (CSS: 148px)

function MinimapLegend({ color, label, sq }: { color: string; label: string; sq?: boolean }) {
  return (
    <span className="flex items-center gap-1 text-[8px] font-semibold text-slate-400">
      <span className={cn("inline-block h-[7px] w-[7px]", sq ? "rounded-none" : "rounded-full", color)} />
      {label}
    </span>
  );
}

function MinimapPanel({
  gridSize, drones, survivors, chargingStations, supplyDepots, onClose,
}: {
  gridSize: number; drones: Drone[]; survivors: Survivor[];
  chargingStations: MapInfraItem[]; supplyDepots: MapInfraItem[];
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cell = MM / gridSize;

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#080f1e";
    ctx.fillRect(0, 0, MM, MM);

    // Tiles
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const isCS    = chargingStations.some((s) => s.x === x && s.y === y);
        const isDepot = supplyDepots.some((s) => s.x === x && s.y === y);
        ctx.fillStyle = isCS ? "#065f46" : isDepot ? "#1e3a5f" : (x + y) % 2 === 0 ? "#111d30" : "#0d1826";
        ctx.fillRect(x * cell + 0.5, y * cell + 0.5, cell - 0.5, cell - 0.5);
      }
    }

    // Subtle grid lines
    ctx.strokeStyle = "rgba(30,58,94,0.45)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, MM); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(MM, i * cell); ctx.stroke();
    }

    // Survivors (circles)
    for (const s of survivors) {
      const x = clamp(Math.round(Number(s.position?.x)), 0, gridSize - 1);
      const y = clamp(Math.round(Number(s.position?.y)), 0, gridSize - 1);
      const r = Math.max(2.4, cell * 0.30);
      ctx.fillStyle = s.rescued ? "#22d3ee"
        : !s.detected ? "#475569"
        : s.condition === "critical" ? "#ef4444"
        : s.condition === "moderate" ? "#f97316"
        : "#22c55e";
      ctx.beginPath();
      ctx.arc(x * cell + cell / 2, y * cell + cell / 2, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Drones (squares to differentiate)
    for (const d of drones) {
      const x = clamp(Math.round(Number(d.position?.x)), 0, gridSize - 1);
      const y = clamp(Math.round(Number(d.position?.y)), 0, gridSize - 1);
      const r = Math.max(2, cell * 0.26);
      ctx.fillStyle = droneGlow(d.status);
      ctx.fillRect(x * cell + cell / 2 - r, y * cell + cell / 2 - r, r * 2, r * 2);
    }
  }, [gridSize, drones, survivors, chargingStations, supplyDepots, cell]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <div className="overflow-hidden rounded-xl border border-cyan-500/30 bg-black/90 shadow-xl shadow-black/60">
      <div className="flex items-center justify-between bg-cyan-950/50 px-2.5 py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-400">Minimap</span>
        <button
          onClick={onClose}
          className="ml-3 flex h-4 w-4 items-center justify-center rounded text-slate-500 hover:bg-slate-700/60 hover:text-slate-200 text-xs leading-none"
        >
          ×
        </button>
      </div>
      <canvas ref={canvasRef} width={MM} height={MM} style={{ width: MM, height: MM }} className="block" />
      <div className="flex items-center gap-3 bg-black/50 px-2.5 py-1.5">
        <MinimapLegend color="bg-emerald-400" label="G" />
        <MinimapLegend color="bg-red-400"     label="R" />
        <MinimapLegend color="bg-orange-400"  label="M" />
        <MinimapLegend color="bg-sky-400"     label="D" sq />
      </div>
    </div>
  );
}

// ─── location card ────────────────────────────────────────────────────────────
function LocationCard({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 self-end rounded-xl border border-slate-700/50 bg-black/88 px-3 py-2 shadow-lg shadow-black/50 backdrop-blur-sm">
      <svg className="h-3.5 w-3.5 shrink-0 text-red-400" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
      </svg>
      <div className="flex flex-col gap-0.5">
        <p className="text-[11px] font-semibold leading-none text-slate-100">{name}</p>
        <p className="text-[8px] font-bold uppercase tracking-wider text-cyan-400">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 align-middle" />
          Active
        </p>
      </div>
    </div>
  );
}

// ─── unit count badge ─────────────────────────────────────────────────────────
function UnitCountBadge({ drones, survivors }: { drones: Drone[]; survivors: Survivor[] }) {
  const count = drones.length + survivors.filter((s) => s.detected && !s.rescued).length;
  return (
    <div className="pointer-events-none absolute right-24 top-4 z-20 flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-black/75 px-2.5 py-1 shadow-sm backdrop-blur-sm">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      <span className="text-[12px] font-bold tabular-nums text-slate-100">{count}</span>
    </div>
  );
}

// ─── compass overlay ──────────────────────────────────────────────────────────
function CompassOverlay({ deg }: { deg: number }) {
  return (
    <div
      className="pointer-events-none absolute right-4 top-4 z-20 flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-cyan-500/45 bg-black/70 shadow-[0_0_0_1px_rgba(34,211,238,0.15)] backdrop-blur-sm"
      style={{ transform: `rotate(${-deg}deg)` }}
    >
      <span className="text-[11px] font-black leading-none text-cyan-300">N</span>
      <div className="mt-1 h-8 w-px bg-linear-to-b from-cyan-400 to-transparent" />
    </div>
  );
}

function AzimuthReporter({
  controlsRef,
  onAzimuthRad,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onAzimuthRad?: (r: number) => void;
}) {
  const last = useRef(1e9);
  useFrame(() => {
    const c = controlsRef.current;
    if (!c || !onAzimuthRad) return;
    const a = c.getAzimuthalAngle();
    if (Math.abs(a - last.current) < 0.015) return;
    last.current = a;
    onAzimuthRad(a);
  });
  return null;
}

function SceneFog() {
  const { scene } = useThree();
  useEffect(() => {
    const prev = scene.fog;
    scene.fog = new THREE.Fog("#02060e", 24, 70);
    return () => { scene.fog = prev; };
  }, [scene]);
  return null;
}


// ─── grid lines ───────────────────────────────────────────────────────────────
function IsoGridLines({ gridSize, lodStep }: { gridSize: number; lodStep: 1 | 2 | 4 }) {
  const geom = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const y = SLAB_H + 0.005;
    for (let g = 0; g <= gridSize; g += lodStep) {
      pts.push(mapToWorldVec(g, 0, y), mapToWorldVec(g, gridSize, y));
      pts.push(mapToWorldVec(0, g, y), mapToWorldVec(gridSize, g, y));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [gridSize, lodStep]);
  useEffect(() => () => geom.dispose(), [geom]);
  const op = lodStep >= 4 ? 0.07 : lodStep >= 2 ? 0.12 : 0.18;
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color="#38bdf8" transparent opacity={op} depthWrite={false} />
    </lineSegments>
  );
}

function GridBorder({ gridSize }: { gridSize: number }) {
  const obj = useMemo(() => {
    const y = SLAB_H + 0.016;
    const pts = [
      mapToWorldVec(0, 0, y), mapToWorldVec(gridSize, 0, y),
      mapToWorldVec(gridSize, gridSize, y), mapToWorldVec(0, gridSize, y),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.50 });
    return new THREE.LineLoop(geo, mat);
  }, [gridSize]);
  useEffect(() => () => { obj.geometry.dispose(); (obj.material as THREE.Material).dispose(); }, [obj]);
  return <primitive object={obj} />;
}

function HoverRing({ ix, iy }: { ix: number; iy: number }) {
  const obj = useMemo(() => {
    const y = SLAB_H + 0.014;
    const pts = [
      mapToWorldVec(ix,     iy,     y), mapToWorldVec(ix + 1, iy,     y),
      mapToWorldVec(ix + 1, iy + 1, y), mapToWorldVec(ix,     iy + 1, y),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.95 });
    return new THREE.LineLoop(geo, mat);
  }, [ix, iy]);
  useEffect(() => () => { obj.geometry.dispose(); (obj.material as THREE.Material).dispose(); }, [obj]);
  return <primitive object={obj} />;
}

// ─── tile slab ────────────────────────────────────────────────────────────────
function IsoTile({
  ix, iy, heat, isHovered, isCS, isDepot, onHover, onClickVoid,
}: {
  ix: number; iy: number; heat: number | null;
  isHovered: boolean; isCS: boolean; isDepot: boolean;
  onHover: (c: { x: number; y: number } | null) => void;
  onClickVoid: () => void;
}) {
  const geo = useMemo(() => createTileSlabGeometry(ix, iy), [ix, iy]);
  useEffect(() => () => geo.dispose(), [geo]);
  const color = isCS ? "#0e2e1c" : isDepot ? "#0e1e32" : TILE_COLORS[(ix * 3 + iy * 5) % TILE_COLORS.length];
  const hv = heat != null ? 0.05 + heat * 0.24 : 0;
  return (
    <group>
      <mesh geometry={geo} receiveShadow
        onPointerOver={(e) => { e.stopPropagation(); onHover({ x: ix, y: iy }); }}
        onPointerOut={(e)  => { e.stopPropagation(); onHover(null); }}
        onClick={(e)       => { e.stopPropagation(); onClickVoid(); }}
      >
        <meshStandardMaterial color={color} roughness={0.80} metalness={0.06}
          emissive={isHovered || heat != null ? "#22d3ee" : "#000000"}
          emissiveIntensity={isHovered ? 0.17 : hv}
        />
      </mesh>
      {isHovered && <HoverRing ix={ix} iy={iy} />}
    </group>
  );
}

// ─── drone tether ─────────────────────────────────────────────────────────────
function DroneTether({ wx, wz }: { wx: number; wz: number }) {
  const obj = useMemo(() => {
    const pts = [
      new THREE.Vector3(wx, SLAB_H + 0.022, wz),
      new THREE.Vector3(wx, DRONE_ALT * 0.86, wz),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineDashedMaterial({ color: "#38bdf8", transparent: true, opacity: 0.35, dashSize: 0.07, gapSize: 0.055 });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    return line;
  }, [wx, wz]);
  useEffect(() => () => { obj.geometry.dispose(); (obj.material as THREE.Material).dispose(); }, [obj]);
  return <primitive object={obj} />;
}

// ─── Minecraft-style survivor ─────────────────────────────────────────────────
// Deterministic phase offset per entity (avoids all characters bobbing in sync)
function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return h * 0.001;
}

function MinecraftSurvivor({
  survivor, wx, wz, pulse, onPick,
}: {
  survivor: Survivor; wx: number; wz: number; pulse: number;
  onPick: (cx: number, cy: number) => void;
}) {
  const groupRef   = useRef<THREE.Group>(null);
  const scaleRef   = useRef<THREE.Group>(null);
  const bodyRef    = useRef<THREE.Mesh>(null);
  const headRef    = useRef<THREE.Mesh>(null);
  const lArmRef    = useRef<THREE.Mesh>(null);
  const rArmRef    = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  const shirt  = mcShirt(survivor);
  const dimmed = !survivor.detected && !survivor.rescued;
  const op     = dimmed ? 0.55 : 1.0;
  const skin   = "#f5c9a0";
  const pants  = "#1e3a8a";
  const hair   = "#2c1a0e";
  const isCrit = survivor.condition === "critical" && !survivor.rescued;
  const phase  = useMemo(() => idHash(survivor.survivor_id), [survivor.survivor_id]);

  // Single useFrame: camera-facing + idle breathing + critical pulse
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;

    // Always face camera (Y-axis only)
    g.getWorldPosition(_tv3);
    g.rotation.y = Math.atan2(camera.position.x - _tv3.x, camera.position.z - _tv3.z);

    // Idle breathing bob
    const t   = Date.now() * 0.0014 + phase;
    const bob = Math.sin(t) * 0.0028;
    if (bodyRef.current) bodyRef.current.position.y = 0.115 + bob;
    if (headRef.current) headRef.current.position.y = 0.206 + bob * 1.15;

    // Arm sway — opposing sides, very subtle
    const swing = Math.sin(t * 0.75) * 0.055;
    if (lArmRef.current) { lArmRef.current.position.y = 0.113 + bob; lArmRef.current.rotation.z =  swing; }
    if (rArmRef.current) { rArmRef.current.position.y = 0.113 + bob; rArmRef.current.rotation.z = -swing; }

    // Critical pulse scale
    if (scaleRef.current && isCrit) {
      const s = 1 + Math.sin(Date.now() * 0.003) * 0.05;
      scaleRef.current.scale.setScalar(s);
    }
  });

  const mat = (color: string) => (
    <meshStandardMaterial color={color} roughness={0.78} metalness={0.04} transparent opacity={op} />
  );

  return (
    <group
      ref={groupRef}
      position={[wx, SLAB_H, wz]}
      onClick={(e) => { e.stopPropagation(); onPick(e.clientX, e.clientY); }}
      onPointerOver={(e) => { e.stopPropagation(); setCursor("pointer"); }}
      onPointerOut={(e)  => { e.stopPropagation(); setCursor("auto"); }}
    >
      {/* Condition status ring on ground — most visible indicator */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <ringGeometry args={[0.062, 0.092, 22]} />
        <meshBasicMaterial color={shirt} transparent opacity={dimmed ? 0.18 : 0.70} depthWrite={false} />
      </mesh>
      {/* AO foot shadow inside ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[0.060, 14]} />
        <meshBasicMaterial color="#010b14" transparent opacity={0.38} depthWrite={false} />
      </mesh>

      <group ref={scaleRef}>
        {/* Left leg */}
        <mesh position={[-0.019, 0.038, 0]} castShadow>{mat(pants)}
          <boxGeometry args={[0.030, 0.072, 0.033]} />
        </mesh>
        {/* Right leg */}
        <mesh position={[ 0.019, 0.038, 0]} castShadow>{mat(pants)}
          <boxGeometry args={[0.030, 0.072, 0.033]} />
        </mesh>
        {/* Body — ref for breathing bob */}
        <mesh ref={bodyRef} position={[0, 0.115, 0]} castShadow>
          <boxGeometry args={[0.066, 0.088, 0.040]} />
          {mat(shirt)}
        </mesh>
        {/* Left arm — ref for sway */}
        <mesh ref={lArmRef} position={[-0.050, 0.113, 0]} castShadow>{mat(skin)}
          <boxGeometry args={[0.028, 0.082, 0.028]} />
        </mesh>
        {/* Right arm — ref for sway */}
        <mesh ref={rArmRef} position={[ 0.050, 0.113, 0]} castShadow>{mat(skin)}
          <boxGeometry args={[0.028, 0.082, 0.028]} />
        </mesh>
        {/* Neck */}
        <mesh position={[0, 0.168, 0]}>{mat(skin)}
          <boxGeometry args={[0.022, 0.016, 0.022]} />
        </mesh>
        {/* Head — ref for breathing bob */}
        <mesh ref={headRef} position={[0, 0.206, 0]} castShadow>
          <boxGeometry args={[0.074, 0.068, 0.074]} />
          {mat(skin)}
        </mesh>
        {/* Hair */}
        <mesh position={[0, 0.245, 0]}>{mat(hair)}
          <boxGeometry args={[0.078, 0.018, 0.078]} />
        </mesh>
        {/* Eyes */}
        <mesh position={[-0.018, 0.208, 0.038]}>
          <boxGeometry args={[0.013, 0.012, 0.002]} />
          <meshBasicMaterial color="#111827" />
        </mesh>
        <mesh position={[ 0.018, 0.208, 0.038]}>
          <boxGeometry args={[0.013, 0.012, 0.002]} />
          <meshBasicMaterial color="#111827" />
        </mesh>
        {/* Critical pulse dot above head */}
        {isCrit && (
          <mesh position={[0, 0.282, 0]}>
            <sphereGeometry args={[0.014, 6, 5]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={pulse === 1 ? 1.5 : 0.5} />
          </mesh>
        )}
      </group>
    </group>
  );
}

// ─── 3-D quad-copter drone ────────────────────────────────────────────────────
const ROTOR_ANGLES = [45, 135, 225, 315].map((d) => (d * Math.PI) / 180) as [number, number, number, number];

function Drone3D({
  drone, wx, wz, onPick,
}: {
  drone: Drone; wx: number; wz: number;
  onPick: (cx: number, cy: number) => void;
}) {
  const rotorRef  = useRef<THREE.Group>(null);
  const hoverRef  = useRef<THREE.Group>(null);
  const phase     = useMemo(() => idHash(drone.drone_id), [drone.drone_id]);

  useFrame((_, dt) => {
    // Rotor spin
    if (rotorRef.current) rotorRef.current.rotation.y += dt * (drone.status === "offline" ? 1.2 : 9);
    // Gentle hover bob
    if (hoverRef.current) {
      const bob = Math.sin(Date.now() * 0.0016 + phase) * 0.018;
      hoverRef.current.position.y = DRONE_ALT + bob;
    }
  });

  const body = droneBody(drone.status);
  const glow = droneGlow(drone.status);

  return (
    <group
      onClick={(e) => { e.stopPropagation(); onPick(e.clientX, e.clientY); }}
      onPointerOver={(e) => { e.stopPropagation(); setCursor("pointer"); }}
      onPointerOut={(e)  => { e.stopPropagation(); setCursor("auto"); }}
    >
      {/* Status-colored ground ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[wx, SLAB_H + 0.008, wz]}>
        <ringGeometry args={[0.085, 0.118, 22]} />
        <meshBasicMaterial color={glow} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {/* AO shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[wx, SLAB_H + 0.005, wz]}>
        <circleGeometry args={[0.082, 16]} />
        <meshBasicMaterial color="#010b14" transparent opacity={0.38} depthWrite={false} />
      </mesh>

      <DroneTether wx={wx} wz={wz} />

      <group ref={hoverRef} position={[wx, DRONE_ALT, wz]}>
        {/* Hexagonal body */}
        <mesh castShadow>
          <cylinderGeometry args={[0.048, 0.058, 0.036, 6]} />
          <meshStandardMaterial color={body} roughness={0.42} metalness={0.48} />
        </mesh>
        {/* X-arms */}
        <mesh rotation={[0,  Math.PI / 4, 0]} castShadow>
          <boxGeometry args={[0.21, 0.013, 0.022]} />
          <meshStandardMaterial color="#0f172a" roughness={0.38} metalness={0.58} />
        </mesh>
        <mesh rotation={[0, -Math.PI / 4, 0]} castShadow>
          <boxGeometry args={[0.21, 0.013, 0.022]} />
          <meshStandardMaterial color="#0f172a" roughness={0.38} metalness={0.58} />
        </mesh>
        {/* Rotors (spinning) */}
        <group ref={rotorRef}>
          {ROTOR_ANGLES.map((rad, i) => (
            <mesh key={i}
              position={[Math.cos(rad) * 0.105, 0.013, Math.sin(rad) * 0.105]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <circleGeometry args={[0.042, 8]} />
              <meshStandardMaterial color="#1e293b" roughness={0.28} metalness={0.68}
                side={THREE.DoubleSide} transparent opacity={0.78} />
            </mesh>
          ))}
        </group>
        {/* Status glow */}
        <mesh position={[0, 0.028, 0]}>
          <sphereGeometry args={[0.018, 8, 6]} />
          <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.8} />
        </mesh>
        {/* Landing legs */}
        {ROTOR_ANGLES.map((rad, i) => (
          <mesh key={i} position={[Math.cos(rad) * 0.04, -0.022, Math.sin(rad) * 0.04]} castShadow>
            <cylinderGeometry args={[0.006, 0.006, 0.012, 4]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─── buildings ────────────────────────────────────────────────────────────────
function ChargingStationBuilding({ st }: { st: MapInfraItem }) {
  const p = mapToWorldVec(st.x + 0.5, st.y + 0.5);
  return (
    <group position={[p.x, SLAB_H, p.z]}>
      <RoundedBox args={[0.42, BH_CS, 0.42]} radius={0.05} smoothness={4} position={[0, BH_CS / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#0d3d26" roughness={0.60} metalness={0.28} />
      </RoundedBox>
      <mesh position={[0, BH_CS + 0.045, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.31, 0.09, 8]} />
        <meshStandardMaterial color="#065f46" emissive="#10b981" emissiveIntensity={1.1} roughness={0.22} metalness={0.55} />
      </mesh>
      <mesh position={[0.214, BH_CS * 0.38, 0]}>
        <planeGeometry args={[0.055, BH_CS * 0.58]} />
        <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.58} side={THREE.DoubleSide} transparent opacity={0.82} depthWrite={false} />
      </mesh>
    </group>
  );
}

function SupplyDepotBuilding({ st }: { st: MapInfraItem }) {
  const p = mapToWorldVec(st.x + 0.5, st.y + 0.5);
  return (
    <group position={[p.x, SLAB_H, p.z]}>
      <RoundedBox args={[0.74, BH_DEPOT, 0.74]} radius={0.04} smoothness={4} position={[0, BH_DEPOT / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1e3a5f" roughness={0.70} metalness={0.20} />
      </RoundedBox>
      <mesh position={[0, BH_DEPOT + 0.026, 0]} castShadow>
        <boxGeometry args={[0.78, 0.052, 0.78]} />
        <meshStandardMaterial color="#1e4976" emissive="#0284c7" emissiveIntensity={0.48} roughness={0.38} />
      </mesh>
      <mesh position={[0.26, BH_DEPOT + 0.18, 0.26]}>
        <cylinderGeometry args={[0.013, 0.013, 0.30, 5]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.82} roughness={0.18} />
      </mesh>
      <mesh position={[0.26, BH_DEPOT + 0.35, 0.26]}>
        <sphereGeometry args={[0.022, 6, 6]} />
        <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function BuildingHitbox({
  st, bh, kind, onSelectItem,
}: {
  st: MapInfraItem; bh: number;
  kind: "charging" | "depot";
  onSelectItem: TacticalIsoFieldProps["onSelectItem"];
}) {
  const p = mapToWorldVec(st.x + 0.5, st.y + 0.5, SLAB_H + bh / 2 + 0.12);
  return (
    <mesh
      position={[p.x, p.y, p.z]}
      onClick={(e) => { e.stopPropagation(); onSelectItem(e.clientX, e.clientY, { kind, data: st }); }}
      onPointerOver={(e) => { e.stopPropagation(); setCursor("pointer"); }}
      onPointerOut={(e)  => { e.stopPropagation(); setCursor("auto"); }}
    >
      <boxGeometry args={[0.72, bh + 0.24, 0.72]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function LodUpdater({
  controlsRef, setLod,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  setLod: React.Dispatch<React.SetStateAction<1 | 2 | 4>>;
}) {
  const { camera } = useThree();
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.2) return;
    acc.current = 0;
    const c = controlsRef.current;
    if (!c) return;
    const next = lodStepFromDistance(camera.position.distanceTo(c.target));
    setLod((p) => (p === next ? p : next));
  });
  return null;
}

// ─── main R3F scene ───────────────────────────────────────────────────────────
const IsoScene = forwardRef<
  TacticalIsoControls,
  TacticalIsoFieldProps & { onAzimuthRad?: (r: number) => void }
>((props, ref) => {
  const {
    gridSize, drones, survivors,
    chargingStations, supplyDepots,
    simHeat, pulse,
    onSelectItem, onDeselect, onAzimuthRad,
  } = props;

  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera }  = useThree();
  const center      = useMemo(() => gridSceneCenter(gridSize), [gridSize]);
  const home        = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const [lodStep, setLodStep] = useState<1 | 2 | 4>(1);
  const [hovered,  setHovered]  = useState<{ x: number; y: number } | null>(null);

  const dronesByCell = useMemo(() => {
    const m = new Map<string, Drone[]>();
    for (const d of drones) {
      const x = Math.round(clamp(Number(d.position?.x), 0, gridSize - 1));
      const y = Math.round(clamp(Number(d.position?.y), 0, gridSize - 1));
      m.set(`${x}-${y}`, [...(m.get(`${x}-${y}`) ?? []), d]);
    }
    return m;
  }, [drones, gridSize]);

  const survivorsByCell = useMemo(() => {
    const m = new Map<string, Survivor[]>();
    for (const s of survivors) {
      const x = Math.round(clamp(Number(s.position?.x), 0, gridSize - 1));
      const y = Math.round(clamp(Number(s.position?.y), 0, gridSize - 1));
      m.set(`${x}-${y}`, [...(m.get(`${x}-${y}`) ?? []), s]);
    }
    return m;
  }, [survivors, gridSize]);

  const cells = useMemo(() => {
    const list: { x: number; y: number }[] = [];
    for (let y = 0; y < gridSize; y++) for (let x = 0; x < gridSize; x++) list.push({ x, y });
    return list;
  }, [gridSize]);

  useEffect(() => {
    const dist  = gridSize * 1.18;
    const theta = DEF_POLAR;   // 60° → 30° above horizon
    const phi   = Math.PI / 4;
    const pos   = new THREE.Vector3(
      center.x + dist * Math.sin(theta) * Math.cos(phi),
      dist * Math.cos(theta),
      center.z + dist * Math.sin(theta) * Math.sin(phi),
    );
    home.current = { pos, target: center.clone() };
    camera.position.copy(pos);
    camera.lookAt(center);
    controlsRef.current?.target.copy(center);
    controlsRef.current?.update?.();
  }, [camera, center, gridSize]);

  useImperativeHandle(ref, () => ({
    setNorth: () => { controlsRef.current?.setAzimuthalAngle(0); controlsRef.current?.update(); },
    resetView: () => {
      const h = home.current; const c = controlsRef.current;
      if (!h || !c) return;
      camera.position.copy(h.pos); c.target.copy(h.target); c.setAzimuthalAngle(0); c.update();
    },
  }), [camera]);

  const pickDrone    = useCallback((cx: number, cy: number, d: Drone)    => onSelectItem(cx, cy, { kind: "drone",    data: d }), [onSelectItem]);
  const pickSurvivor = useCallback((cx: number, cy: number, s: Survivor) => onSelectItem(cx, cy, { kind: "survivor", data: s }), [onSelectItem]);

  const csSet    = useMemo(() => new Set(chargingStations.map((s) => `${s.x}-${s.y}`)), [chargingStations]);
  const depotSet = useMemo(() => new Set(supplyDepots.map((s)    => `${s.x}-${s.y}`)), [supplyDepots]);

  return (
    <>
      <color attach="background" args={["#02060e"]} />
      <SceneFog />

      <ambientLight intensity={0.28} />
      <directionalLight
        castShadow position={[12, 22, 8]} intensity={1.38} color="#e8f4fd"
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-near={0.5} shadow-camera-far={80}
        shadow-camera-left={-28} shadow-camera-right={28}
        shadow-camera-top={28} shadow-camera-bottom={-28}
        shadow-bias={-0.0003}
      />
      <directionalLight position={[-9, 5, -7]} intensity={0.36} color="#4ade80" />
      <hemisphereLight args={["#1a3a5c", "#02060e", 0.18]} />

      <OrbitControls
        ref={controlsRef} target={center}
        enablePan enableZoom
        minDistance={gridSize * 0.3} maxDistance={gridSize * 2.8}
        minPolarAngle={MIN_POLAR} maxPolarAngle={MAX_POLAR}
        enableDamping dampingFactor={0.08}
        rotateSpeed={0.82} zoomSpeed={0.88}
      />
      <AzimuthReporter controlsRef={controlsRef} onAzimuthRad={onAzimuthRad} />
      <LodUpdater controlsRef={controlsRef} setLod={setLodStep} />

      <IsoGridLines gridSize={gridSize} lodStep={lodStep} />
      <GridBorder gridSize={gridSize} />

      {cells.map(({ x: ix, y: iy }) => {
        const key  = `${ix}-${iy}`;
        const heat = simHeat != null && Array.isArray(simHeat[iy]) &&
          simHeat[iy][ix] != null && Number.isFinite(simHeat[iy][ix])
            ? Number(simHeat[iy][ix]) : null;
        return (
          <IsoTile key={`t-${key}`} ix={ix} iy={iy} heat={heat}
            isHovered={hovered?.x === ix && hovered?.y === iy}
            isCS={csSet.has(key)} isDepot={depotSet.has(key)}
            onHover={setHovered} onClickVoid={onDeselect}
          />
        );
      })}

      {chargingStations.map((st) => <ChargingStationBuilding key={st.id} st={st} />)}
      {supplyDepots.map((st)       => <SupplyDepotBuilding    key={st.id} st={st} />)}
      {chargingStations.map((st) => <BuildingHitbox key={`hb-cs-${st.id}`} st={st} bh={BH_CS}    kind="charging" onSelectItem={onSelectItem} />)}
      {supplyDepots.map((st)       => <BuildingHitbox key={`hb-dp-${st.id}`} st={st} bh={BH_DEPOT} kind="depot"    onSelectItem={onSelectItem} />)}

      {cells.map(({ x: ix, y: iy }) => {
        const k  = `${ix}-${iy}`;
        const ds = dronesByCell.get(k) ?? [];
        const ss = survivorsByCell.get(k) ?? [];
        if (!ds.length && !ss.length) return null;
        return (
          <group key={`u-${k}`}>
            {ss.map((s, i) => {
              const spread = (i - (ss.length - 1) / 2) * 0.18;
              const w = mapToWorldVec(ix + 0.5 + spread * 0.3, iy + 0.5 + spread * 0.18);
              return (
                <MinecraftSurvivor
                  key={s.survivor_id} survivor={s} wx={w.x} wz={w.z}
                  pulse={pulse} onPick={(cx, cy) => pickSurvivor(cx, cy, s)}
                />
              );
            })}
            {ds.map((d, i) => {
              const spread = (i - (ds.length - 1) / 2) * 0.18;
              const w = mapToWorldVec(ix + 0.5 - spread * 0.3, iy + 0.5 + spread * 0.18);
              return (
                <Drone3D
                  key={d.drone_id} drone={d} wx={w.x} wz={w.z}
                  onPick={(cx, cy) => pickDrone(cx, cy, d)}
                />
              );
            })}
          </group>
        );
      })}
    </>
  );
});
IsoScene.displayName = "IsoScene";

// ─── canvas + overlay wrapper ─────────────────────────────────────────────────
export const TacticalIsoField = forwardRef<TacticalIsoControls, TacticalIsoFieldProps>(
  (props, ref) => {
    const { drones, survivors, chargingStations, supplyDepots, gridSize, locationName } = props;
    const [azimuthDeg, setAzimuthDeg] = useState(0);
    const [showMinimap, setShowMinimap] = useState(true);
    const onAz = useCallback((r: number) => setAzimuthDeg((r * 180) / Math.PI), []);

    return (
      <div className="relative h-full min-h-0 w-full flex-1">
        {/* Compass */}
        <CompassOverlay deg={azimuthDeg} />

        {/* Vignette */}
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(2,6,14,0.62)_100%)]" />

        {/* HUD corner brackets */}
        <div className="pointer-events-none absolute left-3  top-3    z-10 h-6 w-6 border-l-2 border-t-2 border-cyan-500/45" />
        <div className="pointer-events-none absolute right-3 top-3    z-10 h-6 w-6 border-r-2 border-t-2 border-cyan-500/45" />
        <div className="pointer-events-none absolute left-3  bottom-3 z-10 h-6 w-6 border-b-2 border-l-2 border-cyan-500/45" />
        <div className="pointer-events-none absolute right-3 bottom-3 z-10 h-6 w-6 border-b-2 border-r-2 border-cyan-500/45" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-linear-to-r from-transparent via-cyan-500/30 to-transparent" />

        {/* 3-D canvas — FoV 38° = telephoto, minimal perspective distortion */}
        <Canvas
          className="h-full w-full min-h-[420px] touch-none"
          shadows
          gl={{ antialias: true, alpha: false }}
          camera={{ fov: 38, near: 0.08, far: 260 }}
          onCreated={({ gl }) => {
            // Suppress PCFSoftShadowMap deprecation in newer Three.js builds
            gl.shadowMap.type = THREE.PCFShadowMap;
          }}
          onPointerMissed={() => props.onDeselect()}
        >
          <IsoScene ref={ref} {...props} onAzimuthRad={props.onAzimuthRad ?? onAz} />
        </Canvas>

        {/* ── Bottom-right: location card + minimap ── */}
        <div className="absolute bottom-4 right-4 z-20 flex flex-row items-end gap-2">
          {/* Location pill */}
          <LocationCard name={locationName ?? "Tactical Zone"} />

          {/* Minimap or reopen button */}
          {showMinimap ? (
            <MinimapPanel
              gridSize={gridSize}
              drones={drones}
              survivors={survivors}
              chargingStations={chargingStations}
              supplyDepots={supplyDepots}
              onClose={() => setShowMinimap(false)}
            />
          ) : (
            <button
              onClick={() => setShowMinimap(true)}
              className="rounded-xl border border-cyan-500/30 bg-black/88 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-cyan-400 hover:bg-cyan-950/60 hover:text-cyan-300 transition-colors"
            >
              Map
            </button>
          )}
        </div>
      </div>
    );
  },
);
TacticalIsoField.displayName = "TacticalIsoField";

export default TacticalIsoField;
