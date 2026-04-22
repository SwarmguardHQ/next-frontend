"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer, TextLayer, PathLayer, ColumnLayer, IconLayer, PolygonLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import Map, { NavigationControl } from "react-map-gl/mapbox";
import type { Drone, Survivor } from "@/types/api_types";
import { cn } from "@/lib/utils";
import { TACTICAL_SECTORS, type TacticalSector } from "@/lib/tacticalSectors";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const MAP_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

import { useRouter } from "next/navigation";

// Kuala Lumpur suburban disaster zone — mixed terrain + buildings on satellite
const MISSION_CENTER: [number, number] = [100.303163, 5.356944]; // [lng, lat]
const CELL_DEG = 0.00042; // ~47 m per grid cell
const INITIAL_VIEW = {
  longitude: MISSION_CENTER[0],
  latitude: MISSION_CENTER[1],
  zoom: 15.2,
  pitch: 55,
  bearing: -22,
  maxPitch: 85,
};


type Color4 = [number, number, number, number];

type MesaHeatCell = { x: number; y: number; v: number };

type SelectedObject =
  | { kind: "drone"; data: Drone }
  | { kind: "survivor"; data: Survivor }
  | { kind: "charging"; data: InfraItem }
  | { kind: "depot"; data: InfraItem }
  | null;

// Lucide HeartPulse SVG -> Data URI (White version for masking)
const HEART_PULSE_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>'
)}`;

const ICON_MAPPING = {
  heart: { x: 0, y: 0, width: 24, height: 24, mask: true },
};

interface InfraItem {
  id: string;
  x: number;
  y: number;
}

interface Props {
  drones: Drone[];
  survivors: Survivor[];
  pulse: number;
  gridSize: number;
  chargingStations: InfraItem[];
  supplyDepots: InfraItem[];
  /** Normalized 0–1 thermal grid from GET /world/stream sim_visual (Mesa); optional */
  simHeat?: number[][] | null;
}

function droneColor(status: string): Color4 {
  if (status === "charging") return [34, 197, 94, 230];
  if (status === "offline") return [239, 68, 68, 200];
  if (status === "relaying") return [245, 158, 11, 230];
  return [61, 158, 228, 240];
}

function droneGlowColor(status: string): Color4 {
  const [r, g, b] = droneColor(status);
  return [r, g, b, 45];
}

function survivorConditionKey(condition: string | null | undefined): string {
  return (condition ?? "").trim().toLowerCase();
}

function survivorFillColor(s: Survivor, pulse: number): Color4 {
  if (s.rescued) return [125, 211, 252, 230]; // Sky 300
  if (!s.detected) return [151, 163, 184, 255]; // Slate 400

  const condition = survivorConditionKey(s.condition);
  if (condition === "critical") return pulse ? [255, 60, 60, 255] : [239, 68, 68, 220]; // Red 500
  if (condition === "moderate") return [245, 158, 11, 240]; // Amber 500
  if (condition === "stable") return [34, 197, 94, 240]; // Emerald 500
  return [100, 116, 139, 220]; // Default Slate
}

function survivorLineColor(s: Survivor): Color4 {
  if (s.rescued) return [186, 230, 253, 255];
  if (!s.detected) return [148, 163, 184, 180];

  const condition = survivorConditionKey(s.condition);
  if (condition === "critical") return [255, 100, 100, 255];
  if (condition === "moderate") return [251, 191, 36, 255]; // Amber 400
  return [74, 222, 128, 220]; // Emerald 400
}

function survivorLabelColor(s: Survivor): Color4 {
  const condition = survivorConditionKey(s.condition);
  if (condition === "critical") return [255, 130, 130, 220];
  if (condition === "moderate") return [252, 193, 60, 220];
  return [100, 230, 140, 220];
}

interface MapLoadEvt {
  target: {
    addLayer: (layer: object) => void;
    getLayer: (id: string) => object | undefined;
    setLight: (light: object) => void;
  };
}

const BUILDING_LAYER_SPEC = {
  id: "3d-buildings",
  source: "composite",
  "source-layer": "building",
  filter: ["==", "extrude", "true"],
  type: "fill-extrusion",
  minzoom: 14,
  paint: {
    "fill-extrusion-color": [
      "interpolate",
      ["linear"],
      ["get", "height"],
      0, "#111827",
      40, "#162236",
      120, "#1a2d4e",
      400, "#1f3864",
    ],
    "fill-extrusion-height": [
      "interpolate", ["linear"], ["zoom"],
      15, 0,
      15.05, ["get", "height"],
    ],
    "fill-extrusion-base": [
      "interpolate", ["linear"], ["zoom"],
      15, 0,
      15.05, ["get", "min_height"],
    ],
    "fill-extrusion-opacity": 0.88,
  },
};


export default function SimulationMap3D({
  drones,
  survivors,
  pulse,
  gridSize,
  chargingStations,
  supplyDepots,
  simHeat = null,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<SelectedObject>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(INITIAL_VIEW.zoom);

  // Helper for dynamic coordinate conversion
  const toCoord = useCallback((x: number, y: number): [number, number] => {
    const lng = MISSION_CENTER[0] + (x - (gridSize - 1) / 2) * CELL_DEG;
    const lat = MISSION_CENTER[1] + (y - (gridSize - 1) / 2) * CELL_DEG;
    return [lng, lat];
  }, [gridSize]);

  // Generate tactical grid based on dynamic size
  const gridLines = useMemo(() => {
    const lines: { path: [number, number][] }[] = [];
    const start = -0.5;
    const end = gridSize - 0.5;
    for (let x = 0; x <= gridSize; x++) {
      const gx = x - 0.5;
      lines.push({ path: [toCoord(gx, start), toCoord(gx, end)] });
    }
    for (let y = 0; y <= gridSize; y++) {
      const gy = y - 0.5;
      lines.push({ path: [toCoord(start, gy), toCoord(end, gy)] });
    }
    return lines;
  }, [gridSize, toCoord]);

  const mesaHeatCells = useMemo((): MesaHeatCell[] => {
    if (!simHeat?.length) return [];
    const out: MesaHeatCell[] = [];
    const gh = Math.min(gridSize, simHeat.length);
    for (let y = 0; y < gh; y++) {
      const row = simHeat[y];
      if (!Array.isArray(row)) continue;
      const gw = Math.min(gridSize, row.length);
      for (let x = 0; x < gw; x++) {
        const v = Number(row[x]);
        if (!Number.isFinite(v) || v < 0.02) continue;
        out.push({ x, y, v });
      }
    }
    return out;
  }, [simHeat, gridSize]);

  useEffect(() => { setMounted(true); }, []);

  const handleMapLoad = useCallback((evt: MapLoadEvt) => {
    const { target: map } = evt;
    if (!map.getLayer("3d-buildings")) {
      map.addLayer(BUILDING_LAYER_SPEC);
    }
    map.setLight({ anchor: "viewport", color: "#3a6fa8", intensity: 0.35 });
  }, []);

  const layers = useMemo(() => [
    // Tactical HUD Grid
    new PathLayer({
      id: "tactical-grid",
      data: gridLines,
      getPath: (d) => d.path,
      visible: zoom > 13.5,
      getColor: [61, 158, 228, 255], // Subtle cyan with low alpha
      getWidth: 1,
      widthMinPixels: 0.5,
      capRounded: true,
      jointRounded: true,
    }),

    // ── Sector zones: coloured polygon fill (3×3 cell footprint) ──────────────
    new PolygonLayer<TacticalSector>({
      id: "sector-fill",
      data: TACTICAL_SECTORS,
      getPolygon: (d) => {
        const half = 1.5 * CELL_DEG;
        const [lng, lat] = toCoord(d.x, d.y);
        return [
          [lng - half, lat - half],
          [lng + half, lat - half],
          [lng + half, lat + half],
          [lng - half, lat + half],
        ] as [number, number][];
      },
      getFillColor: (d) => [d.rgba[0], d.rgba[1], d.rgba[2], 22] as Color4,
      getLineColor: (d) => [d.rgba[0], d.rgba[1], d.rgba[2], 180] as Color4,
      lineWidthMinPixels: 2,
      filled: true,
      stroked: true,
      extruded: false,
      pickable: false,
      visible: zoom > 13.5,
    }),

    // ── Sector landmark columns per type (split into 4 layers for distinct shapes)
    ...TACTICAL_SECTORS.map((s) => new ColumnLayer<TacticalSector>({
      id: `sector-col-${s.id}`,
      data: [s],
      getPosition: (d) => toCoord(d.x, d.y),
      diskResolution:
        s.type === "School"      ? 4    // square
        : s.type === "Industrial"  ? 6  // hexagon
        : s.type === "Residential" ? 5  // pentagon
        : 8,                            // octagon (Commercial)
      radius: 18,
      extruded: true,
      getElevation: (_d) =>
        s.type === "Commercial"  ? 55
        : s.type === "Industrial"  ? 42
        : s.type === "School"      ? 30
        : 28,
      getFillColor: (_d) => [s.rgba[0], s.rgba[1], s.rgba[2], 210] as Color4,
      getLineColor: (_d) => [s.rgba[0], s.rgba[1], s.rgba[2], 255] as Color4,
      lineWidthMinPixels: 1,
      pickable: false,
      visible: zoom > 13.5,
    })),

    // ── Sector ID badge (icon + id) ───────────────────────────────────────────
    new TextLayer<TacticalSector>({
      id: "sector-id-labels",
      data: TACTICAL_SECTORS,
      getPosition: (d) => toCoord(d.x, d.y),
      getText: (d) => `${d.icon} ${d.id}`,
      getSize: 15,
      getColor: (d) => [d.rgba[0], d.rgba[1], d.rgba[2], 255] as Color4,
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      visible: zoom > 13.5,
      getPixelOffset: [0, -14],
      fontFamily: "Barlow Condensed, sans-serif",
      fontWeight: 900,
      billboard: true,
      sizeUnits: "pixels",
      background: true,
      getBackgroundColor: [2, 6, 20, 220] as Color4,
      backgroundPadding: [8, 4, 8, 4],
    }),

    // ── Sector type sub-label ─────────────────────────────────────────────────
    new TextLayer<TacticalSector>({
      id: "sector-type-labels",
      data: TACTICAL_SECTORS,
      getPosition: (d) => toCoord(d.x, d.y),
      getText: (d) => d.type.toUpperCase(),
      getSize: 10,
      getColor: (d) => [d.rgba[0], d.rgba[1], d.rgba[2], 200] as Color4,
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      visible: zoom > 14.5,
      getPixelOffset: [0, 12],
      fontFamily: "Barlow Condensed, sans-serif",
      fontWeight: 700,
      billboard: true,
      sizeUnits: "pixels",
    }),

    ...(mesaHeatCells.length
      ? [
          new ColumnLayer<MesaHeatCell>({
            id: "mesa-sim-thermal",
            data: mesaHeatCells,
            getPosition: (d) => toCoord(d.x, d.y),
            diskResolution: 10,
            radius: 22,
            extruded: true,
            getElevation: (d) => 6 + d.v * 90,
            getFillColor: (d) => {
              const a = Math.round(32 + d.v * 205);
              return [56, 189, 248, a] as Color4;
            },
            getLineColor: [125, 211, 252, 70] as Color4,
            lineWidthMinPixels: 0,
            pickable: false,
          }),
        ]
      : []),

    // ── Infrastructure: Charging Station glow (pulsing)
    new ScatterplotLayer<InfraItem>({
      id: "cs-glow",
      data: chargingStations,
      getPosition: (d) => toCoord(d.x, d.y),
      getRadius: pulse ? 120 : 80,
      radiusMinPixels: 25,
      radiusMaxPixels: 80,
      getFillColor: [34, 197, 94, pulse ? 70 : 40],
      filled: true,
      stroked: false,
      updateTriggers: { getRadius: [pulse], getFillColor: [pulse] },
    }),
    new ColumnLayer<InfraItem>({
      id: "cs-column",
      data: chargingStations,
      getPosition: (d) => toCoord(d.x, d.y),
      diskResolution: 6, // Hexagonal base
      radius: 20,
      extruded: true,
      getElevation: 20,
      getFillColor: [34, 197, 94, 200],
      getLineColor: [167, 243, 208, 255],
      lineWidthMinPixels: 1,
      pickable: true,
      onClick: (info: PickingInfo) => {
        if (info.object) {
          setSelected({ kind: "charging", data: info.object as InfraItem });
          setTooltipPos({ x: info.x, y: info.y });
        }
      },
    }),
    new TextLayer<InfraItem>({
      id: "cs-labels",
      data: chargingStations,
      getPosition: (d) => toCoord(d.x, d.y),
      getText: (d) => `PWR ${d.id.split("-").pop()}`,
      getSize: 14,
      getColor: [16, 185, 129, 255],
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      visible: zoom > 15.5,
      getPixelOffset: [0, -45],
      fontFamily: "Barlow Condensed, sans-serif",
      fontWeight: 800,
      billboard: true,
      sizeUnits: "pixels",
    }),

    // ── Infrastructure: Supply Depot glow (pulsing)
    new ScatterplotLayer<InfraItem>({
      id: "depot-glow",
      data: supplyDepots,
      getPosition: (d) => toCoord(d.x, d.y),
      getRadius: pulse ? 120 : 80,
      radiusMinPixels: 25,
      radiusMaxPixels: 80,
      getFillColor: [56, 189, 248, pulse ? 70 : 40],
      filled: true,
      stroked: false,
      updateTriggers: { getRadius: [pulse], getFillColor: [pulse] },
    }),
    new ColumnLayer<InfraItem>({
      id: "depot-column",
      data: supplyDepots,
      getPosition: (d) => toCoord(d.x, d.y),
      diskResolution: 6, // Hexagonal base
      radius: 20,
      extruded: true,
      getElevation: 20,
      getFillColor: [14, 165, 233, 200],
      getLineColor: [186, 230, 253, 255],
      lineWidthMinPixels: 1,
      pickable: true,
      onClick: (info: PickingInfo) => {
        if (info.object) {
          setSelected({ kind: "depot", data: info.object as InfraItem });
          setTooltipPos({ x: info.x, y: info.y });
        }
      },
    }),
    new TextLayer<InfraItem>({
      id: "depot-labels",
      data: supplyDepots,
      getPosition: (d) => toCoord(d.x, d.y),
      getText: (d) => `📦 DEPOT ${d.id.split("-").pop()}`,
      getSize: 14,
      getColor: [56, 189, 248, 255],
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      visible: zoom > 15.5,
      getPixelOffset: [0, -45],
      fontFamily: "Barlow Condensed, sans-serif",
      fontWeight: 800,
      billboard: true,
      sizeUnits: "pixels",
    }),

    // Thermal heat bloom around detected survivors
    new ScatterplotLayer<Survivor>({
      id: "thermal-halos",
      data: survivors.filter((s) => s.detected),
      getPosition: (s) => toCoord(s.position.x, s.position.y),
      getRadius: 140,
      radiusMinPixels: 20,
      radiusMaxPixels: 100,
      getFillColor: (s) =>
        survivorConditionKey(s.condition) === "critical"
          ? [239, 68, 68, pulse ? 80 : 50]
          : [245, 158, 11, 60],
      filled: true,
      stroked: false,
      updateTriggers: { getFillColor: [pulse] },
    }),

    // Survivor markers — Lucide HeartPulse Icons
    new IconLayer<Survivor>({
      id: "survivors",
      data: survivors,
      getPosition: (s) => toCoord(s.position.x, s.position.y),
      iconAtlas: HEART_PULSE_SVG,
      iconMapping: ICON_MAPPING,
      getIcon: () => "heart",
      sizeUnits: "pixels",
      getSize: pulse ? 32 : 26,
      getColor: (s) => survivorFillColor(s, pulse),
      pickable: true,
      updateTriggers: { getSize: [pulse], getColor: [pulse] },
      onClick: (info: PickingInfo) => {
        if (info.object) {
          setSelected({ kind: "survivor", data: info.object as Survivor });
          setTooltipPos({ x: info.x, y: info.y });
        }
      },
    }),

    // Survivor condition labels (show for all, dimmer for undetected)
    new TextLayer<Survivor>({
      id: "survivor-labels",
      data: survivors,
      getPosition: (s) => toCoord(s.position.x, s.position.y),
      getText: (s) => s.survivor_id.split("_").pop()?.toUpperCase() ?? "",
      getSize: 11,
      getColor: (s) => s.detected ? survivorLabelColor(s) : [148, 163, 184, 180] as Color4,
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      visible: zoom > 16.0,
      getPixelOffset: [0, 22],
      fontFamily: "Barlow Condensed, sans-serif",
      fontWeight: 700,
      billboard: true,
      sizeUnits: "pixels",
    }),

    // ── DRONES (Moved to end for Method 3) ──

    // Drone scanning radius rings
    new ScatterplotLayer<Drone>({
      id: "scan-radius",
      data: drones.filter((d) => d.status === "scanning"),
      getPosition: (d) => [...toCoord(d.position.x, d.position.y), 21],
      getRadius: 200,
      radiusMinPixels: 32,
      radiusMaxPixels: 130,
      visible: zoom > 14.8,
      getFillColor: [61, 158, 228, 14],
      getLineColor: [61, 158, 228, 55],
      lineWidthMinPixels: 1,
      filled: true,
      stroked: true,
    }),

    // Drone outer glow
    new ScatterplotLayer<Drone>({
      id: "drone-glow",
      data: drones,
      getPosition: (d) => [...toCoord(d.position.x, d.position.y), 21],
      getRadius: 38,
      radiusMinPixels: 12,
      radiusMaxPixels: 30,
      getFillColor: (d) => droneGlowColor(d.status),
      filled: true,
      stroked: false,
    }),

    // Drone markers — Floating Tactical Triangle Pillars
    new ColumnLayer<Drone>({
      id: "drones",
      data: drones,
      getPosition: (d) => [...toCoord(d.position.x, d.position.y), 22],
      diskResolution: 3, // Triangle
      radius: 18,
      extruded: true,
      getElevation: 4, // Thickness of the hover disk
      getFillColor: (d) => droneColor(d.status),
      getLineColor: (d) => {
        const [r, g, b] = droneColor(d.status);
        return [r, g, b, 255] as Color4;
      },
      lineWidthMinPixels: 1,
      pickable: true,
      onClick: (info: PickingInfo) => {
        if (info.object) {
          setSelected({ kind: "drone", data: info.object as Drone });
          setTooltipPos({ x: info.x, y: info.y });
        }
      },
    }),

    // Drone ID labels
    new TextLayer<Drone>({
      id: "drone-labels",
      data: drones,
      getPosition: (d) => [...toCoord(d.position.x, d.position.y), 23],
      getText: (d) => d.drone_id.replace("drone_", "D"),
      getSize: 12,
      getColor: [255, 255, 255, 220],
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      visible: zoom > 15.8,
      getPixelOffset: [0, -18],
      fontFamily: "Barlow Condensed, sans-serif",
      fontWeight: 700,
      billboard: true,
      sizeUnits: "pixels",
    }),
  ], [
    drones,
    survivors,
    pulse,
    gridSize,
    chargingStations,
    supplyDepots,
    toCoord,
    mesaHeatCells,
    gridLines,
    zoom,
  ]);

  if (!mounted) return null;

  if (!TOKEN) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-md border border-amber-500/30 bg-[#0d1117]">
        <div className="space-y-2 text-center">
          <p className="font-mono text-sm text-amber-400">NEXT_PUBLIC_MAPBOX_TOKEN not set</p>
          <p className="text-xs text-slate-500">Add your Mapbox token to .env.local to enable the 3D satellite map</p>
          <code className="block rounded bg-slate-800/80 px-3 py-1 font-mono text-[11px] text-sky-300">
            NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...
          </code>
        </div>
      </div>
    );
  }

  const criticalCount = survivors.filter((s) => s.condition === "critical" && !s.rescued).length;

  return (
    <div className="relative h-full min-h-[520px] w-full overflow-hidden rounded-md">
      {/* HUD corner brackets */}
      <div className="pointer-events-none absolute left-3  top-3    z-20 h-7 w-7 border-l-2 border-t-2 border-cyan-500/45" />
      <div className="pointer-events-none absolute right-3 top-3    z-20 h-7 w-7 border-r-2 border-t-2 border-cyan-500/45" />
      <div className="pointer-events-none absolute left-3  bottom-3 z-20 h-7 w-7 border-b-2 border-l-2 border-cyan-500/45" />
      <div className="pointer-events-none absolute right-3 bottom-3 z-20 h-7 w-7 border-b-2 border-r-2 border-cyan-500/45" />
      {/* Top scan line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-linear-to-r from-transparent via-cyan-500/30 to-transparent" />
      <DeckGL
        initialViewState={INITIAL_VIEW}
        controller
        layers={layers}
        onViewStateChange={({ viewState }: any) => setZoom(viewState.zoom)}
        onClick={(info: PickingInfo) => {
          if (!info.picked) {
            setSelected(null);
            setTooltipPos(null);
          }
        }}
      >
        <Map
          mapboxAccessToken={TOKEN}
          mapStyle={MAP_STYLE}
          onLoad={handleMapLoad as Parameters<typeof Map>[0]["onLoad"]}
          reuseMaps
        >
          <NavigationControl position="top-right" visualizePitch />
        </Map>
      </DeckGL>

      {/* HUD overlay — top left */}
      <div className="pointer-events-none absolute left-5 top-5 z-10 flex flex-col gap-2">
        {/* System label */}
        <div className="rounded-md border border-cyan-500/30 bg-slate-950/92 px-3 py-1.5 font-mono text-[9px] tracking-[0.2em] text-cyan-400 backdrop-blur-sm uppercase shadow-lg">
          SIREN · 3D Tactical · SAT
        </div>
        {/* Drone status */}
        <div className="flex items-center gap-2 rounded-md border border-sky-500/35 bg-slate-950/90 px-3 py-1.5 font-mono backdrop-blur-sm shadow-md">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
          <span className="text-[10px] font-bold tracking-widest text-sky-300 uppercase">
            {drones.filter((d) => d.status !== "offline").length}/{drones.length} Drones Active
          </span>
        </div>
        {/* Survivor status */}
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-slate-950/90 px-3 py-1.5 font-mono backdrop-blur-sm shadow-md">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="text-[10px] font-bold tracking-widest text-amber-300 uppercase">
            {survivors.filter((s) => s.detected && !s.rescued).length} Detected · {survivors.filter((s) => s.rescued).length} Rescued
          </span>
        </div>
        {/* Critical alert (conditional) */}
        {criticalCount > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-red-500/45 bg-red-950/70 px-3 py-1.5 font-mono backdrop-blur-sm shadow-md">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
            <span className="text-[10px] font-bold tracking-widest text-red-300 uppercase">
              {criticalCount} Critical Survivor{criticalCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Click-to-inspect popup */}
      {selected && tooltipPos && (
        <InspectPopup
          selected={selected}
          x={tooltipPos.x}
          y={tooltipPos.y}
          onClose={() => { setSelected(null); setTooltipPos(null); }}
        />
      )}

      {/* Navigation hint */}
      <div className="pointer-events-none absolute bottom-6 right-5 z-10 rounded border border-slate-700/30 bg-slate-950/60 px-2.5 py-1 font-mono text-[8px] tracking-[0.15em] text-slate-600 backdrop-blur-sm uppercase">
        Drag · Scroll · Right-drag to orbit
      </div>
    </div>
  );
}

interface PopupProps {
  selected: NonNullable<SelectedObject>;
  x: number;
  y: number;
  onClose: () => void;
}

function InspectPopup({ selected, x, y, onClose }: PopupProps) {
  const clampedX = Math.min(x + 12, (typeof window !== "undefined" ? window.innerWidth : 1200) - 260);
  const clampedY = Math.min(y - 12, (typeof window !== "undefined" ? window.innerHeight : 800) - 280);

  const headerCls =
    selected.kind === "drone"     ? "bg-sky-950/90 border-sky-800/50 text-sky-300"
    : selected.kind === "survivor" ? "bg-amber-950/90 border-amber-800/50 text-amber-300"
    : selected.kind === "charging" ? "bg-emerald-950/90 border-emerald-800/50 text-emerald-300"
    :                                "bg-cyan-950/90 border-cyan-800/50 text-cyan-300";

  const headerLabel =
    selected.kind === "drone"
      ? `Drone · ${selected.data.drone_id.replace(/^drone_/i, "").replace(/^DRONE_/i, "").toUpperCase()}`
    : selected.kind === "survivor"
      ? `Survivor · ${selected.data.survivor_id.split("_").pop()?.toUpperCase()}`
    : selected.kind === "charging"
      ? "Power Hub"
      : "Supply Depot";

  return (
    <div
      className="absolute z-20 w-60 overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900/96 shadow-[0_8px_40px_rgba(0,0,0,0.85)] backdrop-blur-md"
      style={{ left: clampedX, top: clampedY }}
    >
      {/* Colored entity-type header */}
      <div className={cn("flex items-center justify-between border-b px-3.5 py-2.5", headerCls)}>
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest">
          {headerLabel}
        </span>
        <button
          type="button"
          className="ml-3 flex h-5 w-5 items-center justify-center rounded text-xs leading-none opacity-70 transition-colors hover:bg-white/10 hover:opacity-100"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="p-3.5">
        {selected.kind === "drone" ? (
          <DronePopup drone={selected.data} />
        ) : selected.kind === "survivor" ? (
          <SurvivorPopup survivor={selected.data} />
        ) : selected.kind === "charging" ? (
          <ChargingStationPopup station={selected.data} />
        ) : (
          <SupplyDepotPopup depot={selected.data} />
        )}
      </div>
    </div>
  );
}

function DronePopup({ drone }: { drone: Drone }) {
  const router = useRouter();
  const batColor =
    drone.battery <= 20
      ? "text-red-400"
      : drone.battery <= 50
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <>
      <div className="space-y-1.5 text-xs">
        <Row label="Status" value={drone.status.toUpperCase()} valueClass="text-white" />
        <Row label="Battery" value={`${drone.battery.toFixed(1)}%`} valueClass={batColor} />
        <Row label="Sector" value={drone.assigned_sector ?? "—"} valueClass="text-white" />
        <Row
          label="Grid"
          value={`(${drone.position.x}, ${drone.position.y})`}
          valueClass="font-mono text-slate-300"
        />
        <Row label="Payload" value={drone.payload ?? "None"} valueClass="text-slate-300" />
      </div>
      <div className="mt-3 pt-3 border-t border-cyan-800/40 font-mono">
        <button
          onClick={() => router.push(`/fleet/${drone.drone_id}`)}
          className="w-full flex items-center justify-center py-1.5 px-3 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800 text-[10px] text-cyan-300 font-bold uppercase tracking-widest rounded-sm transition-colors"
        >
          Inspect Drone Details
        </button>
      </div>
    </>
  );
}

function SurvivorPopup({ survivor }: { survivor: Survivor }) {
  const survivorCondition = survivorConditionKey(survivor.condition);
  const condColor =
    survivorCondition === "critical"
      ? "text-red-400"
      : survivorCondition === "moderate"
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <>
      <div className="space-y-1.5 text-xs">
        <Row label="Condition" value={survivorCondition.toUpperCase() || "UNKNOWN"} valueClass={condColor} />
        <Row
          label="Detected"
          value={survivor.detected ? "YES" : "NO"}
          valueClass={survivor.detected ? "text-emerald-400" : "text-slate-400"}
        />
        <Row
          label="Rescued"
          value={survivor.rescued ? "YES" : "PENDING"}
          valueClass={survivor.rescued ? "text-sky-400" : "text-slate-500"}
        />
        <Row
          label="Grid"
          value={`(${survivor.position.x}, ${survivor.position.y})`}
          valueClass="font-mono text-slate-300"
        />
        {survivor.supplies_received.length > 0 && (
          <Row
            label="Supplies"
            value={survivor.supplies_received.join(", ")}
            valueClass="text-sky-300"
          />
        )}
      </div>
    </>
  );
}

function ChargingStationPopup({ station }: { station: InfraItem }) {
  return (
    <>
      <div className="space-y-1.5 text-xs">
        <Row label="ID" value={station.id.toUpperCase()} valueClass="text-white" />
        <Row label="Type" value="POWER HUB" valueClass="text-emerald-300" />
        <Row label="Grid" value={`(${station.x}, ${station.y})`} valueClass="font-mono text-slate-300" />
      </div>
    </>
  );
}

function SupplyDepotPopup({ depot }: { depot: InfraItem }) {
  return (
    <>
      <div className="space-y-1.5 text-xs">
        <Row label="ID" value={depot.id.toUpperCase()} valueClass="text-white" />
        <Row label="Type" value="LOGISTICS NODE" valueClass="text-sky-300" />
        <Row label="Grid" value={`(${depot.x}, ${depot.y})`} valueClass="font-mono text-slate-300" />
      </div>
    </>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className={valueClass ?? "text-white"}>{value}</span>
    </div>
  );
}
