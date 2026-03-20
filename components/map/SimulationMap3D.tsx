"use client";

import { useCallback, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import Map, { NavigationControl } from "react-map-gl/mapbox";
import type { Drone, Survivor } from "@/types/api_types";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const MAP_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

// Kuala Lumpur suburban disaster zone — mixed terrain + buildings on satellite
const MISSION_CENTER: [number, number] = [101.7125, 3.157]; // [lng, lat]
const CELL_DEG = 0.00042; // ~47 m per grid cell
const GRID = 20;

const INITIAL_VIEW = {
  longitude: MISSION_CENTER[0],
  latitude: MISSION_CENTER[1],
  zoom: 15.2,
  pitch: 55,
  bearing: -22,
  maxPitch: 85,
};

// Convert grid (x, y) → real-world [lng, lat]
function toCoord(x: number, y: number): [number, number] {
  const lng = MISSION_CENTER[0] + (x - (GRID - 1) / 2) * CELL_DEG;
  const lat = MISSION_CENTER[1] + (y - (GRID - 1) / 2) * CELL_DEG;
  return [lng, lat];
}

type Color4 = [number, number, number, number];

type SelectedObject =
  | { kind: "drone"; data: Drone }
  | { kind: "survivor"; data: Survivor }
  | null;

interface Props {
  drones: Drone[];
  survivors: Survivor[];
  pulse: number;
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
  if (!s.detected) return [100, 116, 139, 70];
  if (s.rescued) return [125, 211, 252, 200];
  if (s.condition === "critical") return pulse ? [255, 80, 80, 255] : [239, 68, 68, 180];
  if (s.condition === "moderate") return [245, 158, 11, 220];
  return [34, 197, 94, 220];
}

function survivorLineColor(s: Survivor): Color4 {
  if (!s.detected) return [100, 116, 139, 50];
  if (s.condition === "critical") return [239, 68, 68, 200];
  if (s.condition === "moderate") return [245, 158, 11, 160];
  return [34, 197, 94, 160];
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

export default function SimulationMap3D({ drones, survivors, pulse }: Props) {
  const [selected, setSelected] = useState<SelectedObject>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const handleMapLoad = useCallback((evt: MapLoadEvt) => {
    const { target: map } = evt;
    if (!map.getLayer("3d-buildings")) {
      map.addLayer(BUILDING_LAYER_SPEC);
    }
    map.setLight({ anchor: "viewport", color: "#3a6fa8", intensity: 0.35 });
  }, []);

  const layers = useMemo(() => [
    // Thermal heat bloom around detected survivors
    new ScatterplotLayer<Survivor>({
      id: "thermal-halos",
      data: survivors.filter((s) => s.detected),
      getPosition: (s) => toCoord(s.position.x, s.position.y),
      getRadius: 130,
      radiusMinPixels: 16,
      radiusMaxPixels: 90,
      getFillColor: (s) =>
        s.condition === "critical"
          ? [239, 68, 68, pulse ? 55 : 32]
          : [245, 158, 11, 40],
      filled: true,
      stroked: false,
      updateTriggers: { getFillColor: [pulse] },
    }),

    // Drone scanning radius rings (status = scanning)
    new ScatterplotLayer<Drone>({
      id: "scan-radius",
      data: drones.filter((d) => d.status === "scanning"),
      getPosition: (d) => toCoord(d.position.x, d.position.y),
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
      getPosition: (d) => toCoord(d.position.x, d.position.y),
      getRadius: 38,
      radiusMinPixels: 12,
      radiusMaxPixels: 30,
      getFillColor: (d) => droneGlowColor(d.status),
      filled: true,
      stroked: false,
    }),

    // Drone body markers
    new ScatterplotLayer<Drone>({
      id: "drones",
      data: drones,
      getPosition: (d) => toCoord(d.position.x, d.position.y),
      getRadius: 18,
      radiusMinPixels: 7,
      radiusMaxPixels: 20,
      getFillColor: (d) => droneColor(d.status),
      getLineColor: (d) => {
        const [r, g, b] = droneColor(d.status);
        return [r, g, b, 120] as Color4;
      },
      lineWidthMinPixels: 1.5,
      filled: true,
      stroked: true,
      pickable: true,
      onClick: (info: PickingInfo) => {
        if (info.object) {
          setSelected({ kind: "drone", data: info.object as Drone });
          setTooltipPos({ x: info.x, y: info.y });
        }
      },
    }),

    // Drone ID labels (above dot)
    new TextLayer<Drone>({
      id: "drone-labels",
      data: drones,
      getPosition: (d) => toCoord(d.position.x, d.position.y),
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

    // Battery % sub-label (below drone dot)
    new TextLayer<Drone>({
      id: "drone-battery-labels",
      data: drones,
      getPosition: (d) => toCoord(d.position.x, d.position.y),
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

    // Survivor markers
    new ScatterplotLayer<Survivor>({
      id: "survivors",
      data: survivors,
      getPosition: (s) => toCoord(s.position.x, s.position.y),
      getRadius: 20,
      radiusMinPixels: 6,
      radiusMaxPixels: 18,
      getFillColor: (s) => survivorFillColor(s, pulse),
      getLineColor: (s) => survivorLineColor(s),
      lineWidthMinPixels: 2,
      filled: true,
      stroked: true,
      pickable: true,
      updateTriggers: { getFillColor: [pulse] },
      onClick: (info: PickingInfo) => {
        if (info.object) {
          setSelected({ kind: "survivor", data: info.object as Survivor });
          setTooltipPos({ x: info.x, y: info.y });
        }
      },
    }),

    // Survivor condition labels
    new TextLayer<Survivor>({
      id: "survivor-labels",
      data: survivors.filter((s) => s.detected),
      getPosition: (s) => toCoord(s.position.x, s.position.y),
      getText: (s) => s.condition.slice(0, 4).toUpperCase(),
      getSize: 9,
      getColor: (s) => survivorLabelColor(s),
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      getPixelOffset: [0, 18],
      fontFamily: "Barlow Condensed, sans-serif",
      fontWeight: 700,
      billboard: true,
      sizeUnits: "pixels",
    }),
  ], [drones, survivors, pulse]);

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
