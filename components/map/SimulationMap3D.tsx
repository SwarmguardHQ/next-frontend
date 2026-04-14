"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer, TextLayer, PathLayer, ColumnLayer, IconLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import Map, { NavigationControl } from "react-map-gl/mapbox";
import type { Drone, Survivor } from "@/types/api_types";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const MAP_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

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

type SelectedObject =
  | { kind: "drone"; data: Drone }
  | { kind: "survivor"; data: Survivor }
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
}

function droneColor(status: string): Color4 {
  if (status === "charging") return [34, 197, 94, 230];
  if (status === "offline") return [239, 68, 68, 200];
  if (status === "returning") return [245, 158, 11, 230];
  return [61, 158, 228, 240];
}

function droneGlowColor(status: string): Color4 {
  const [r, g, b] = droneColor(status);
  return [r, g, b, 45];
}

function survivorFillColor(s: Survivor, pulse: number): Color4 {
  if (s.rescued) return [125, 211, 252, 230]; // Sky 300
  if (!s.detected) return [148, 163, 184, 255]; // Slate 400 (Muted)
  
  if (s.condition === "critical") return pulse ? [255, 60, 60, 255] : [239, 68, 68, 220]; // Red 500
  if (s.condition === "moderate") return [245, 158, 11, 240]; // Amber 500
  if (s.condition === "stable") return [34, 197, 94, 240]; // Emerald 500
  return [100, 116, 139, 220]; // Default Slate
}

function survivorLineColor(s: Survivor): Color4 {
  if (s.rescued) return [186, 230, 253, 255];
  if (!s.detected) return [148, 163, 184, 180];
  
  if (s.condition === "critical") return [255, 100, 100, 255];
  if (s.condition === "moderate") return [251, 191, 36, 255]; // Amber 400
  return [74, 222, 128, 220]; // Emerald 400
}

function survivorLabelColor(s: Survivor): Color4 {
  if (s.condition === "critical") return [255, 130, 130, 220];
  if (s.condition === "moderate") return [252, 193, 60, 220];
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
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<SelectedObject>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

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
      getColor: [61, 158, 228, 126], // Subtle cyan with low alpha
      getWidth: 1,
      widthMinPixels: 0.5,
      capRounded: true,
      jointRounded: true,
    }),

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
    }),
    new TextLayer<InfraItem>({
      id: "cs-labels",
      data: chargingStations,
      getPosition: (d) => toCoord(d.x, d.y),
      getText: (d) => `⚡ CHARGING ${d.id.split("-").pop()}`,
      getSize: 14,
      getColor: [16, 185, 129, 255],
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
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
        s.condition === "critical"
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
      getText: (s) => s.detected ? s.condition.slice(0, 4).toUpperCase() : "?",
      getSize: 11,
      getColor: (s) => s.detected ? survivorLabelColor(s) : [148, 163, 184, 180] as Color4,
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
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
      getPixelOffset: [0, -18],
      fontFamily: "Barlow Condensed, sans-serif",
      fontWeight: 700,
      billboard: true,
      sizeUnits: "pixels",
    }),

    // Battery % sub-label
    new TextLayer<Drone>({
      id: "drone-battery-labels",
      data: drones,
      getPosition: (d) => [...toCoord(d.position.x, d.position.y), 23],
      getText: (d) => `${Math.round(d.battery)}%`,
      getSize: 10,
      getColor: (d) =>
        d.battery <= 20
          ? [239, 68, 68, 200]
          : d.battery <= 50
            ? [245, 158, 11, 200]
            : [34, 197, 94, 180],
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      getPixelOffset: [0, 16],
      fontFamily: "JetBrains Mono, monospace",
      fontWeight: 600,
      billboard: true,
      sizeUnits: "pixels",
    }),
  ], [drones, survivors, pulse, gridSize, chargingStations, supplyDepots, toCoord]);

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

  return (
    <div className="relative h-full min-h-[520px] w-full overflow-hidden rounded-md">
      <DeckGL
        initialViewState={INITIAL_VIEW}
        controller
        layers={layers}
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
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-1.5">
        <div className="rounded border border-slate-400/20 bg-slate-900/80 px-2.5 py-1 font-mono text-[9px] tracking-widest text-slate-300 backdrop-blur-sm uppercase">
          MAPBOX SAT · DECK.GL v9 OVERLAY
        </div>
        <div className="rounded border border-sky-400/20 bg-slate-900/75 px-2.5 py-1 font-mono text-[9px] tracking-widest text-sky-300 backdrop-blur-sm uppercase">
          ● {drones.filter((d) => d.status !== "offline").length}/{drones.length} DRONES ACTIVE
        </div>
        <div className="rounded border border-amber-400/20 bg-slate-900/75 px-2.5 py-1 font-mono text-[9px] tracking-widest text-amber-300 backdrop-blur-sm uppercase">
          ♥ {survivors.filter((s) => s.detected).length} SURVIVORS DETECTED
        </div>
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
      <div className="pointer-events-none absolute bottom-2 right-3 z-10 font-mono text-[9px] tracking-wide text-slate-500">
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
  const clampedX = Math.min(x + 12, (typeof window !== "undefined" ? window.innerWidth : 1200) - 230);
  const clampedY = Math.min(y - 12, (typeof window !== "undefined" ? window.innerHeight : 800) - 220);

  return (
    <div
      className="absolute z-20 w-56 rounded-md border border-sky-400/30 bg-slate-900/96 p-3 shadow-[0_4px_32px_rgba(0,0,0,0.8)] backdrop-blur-md"
      style={{ left: clampedX, top: clampedY }}
    >
      <button
        type="button"
        className="absolute right-2 top-2 text-slate-400 transition-colors hover:text-white"
        onClick={onClose}
      >
        ✕
      </button>

      {selected.kind === "drone" ? (
        <DronePopup drone={selected.data} />
      ) : (
        <SurvivorPopup survivor={selected.data} />
      )}
    </div>
  );
}

function DronePopup({ drone }: { drone: Drone }) {
  const batColor =
    drone.battery <= 20
      ? "text-red-400"
      : drone.battery <= 50
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <>
      <p className="mb-2.5 font-mono text-[11px] font-bold tracking-widest text-sky-300 uppercase">
        {drone.drone_id.replace("_", " ").toUpperCase()}
      </p>
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
    </>
  );
}

function SurvivorPopup({ survivor }: { survivor: Survivor }) {
  const condColor =
    survivor.condition === "critical"
      ? "text-red-400"
      : survivor.condition === "moderate"
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <>
      <p className="mb-2.5 font-mono text-[11px] font-bold tracking-widest text-amber-300 uppercase">
        {survivor.survivor_id.replace("_", " ").toUpperCase()}
      </p>
      <div className="space-y-1.5 text-xs">
        <Row label="Condition" value={survivor.condition.toUpperCase()} valueClass={condColor} />
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
