/**
 * Shared tactical sector definitions.
 *
 * Single source of truth used by all three map views:
 *   - Flat 2D grid  (app/tactical/page.tsx)
 *   - Isometric 3D  (components/map/TacticalIsoField.tsx)
 *   - Mapbox 3D sat (components/map/SimulationMap3D.tsx)
 *
 * To add / rename / move a sector, edit ONLY this file.
 */

export type TacticalSector = {
  /** Display badge, e.g. "SEC-1" */
  id: string;
  /** Zone type label, e.g. "School" */
  type: string;
  /** Grid column (x) of the sector centre tile */
  x: number;
  /** Grid row (y) of the sector centre tile */
  y: number;
  /**
   * Accent color for this sector used across all map views.
   * hex string — used in Three.js materials and CSS.
   */
  color: string;
  /**
   * RGBA tuple used in DeckGL layers (r, g, b, a 0-255).
   */
  rgba: [number, number, number, number];
  /** Emoji icon shown in HUD labels */
  icon: string;
};

export const TACTICAL_SECTORS: TacticalSector[] = [
  { id: "SEC-1", type: "School",      x: 5,  y: 2,  color: "#facc15", rgba: [250, 204, 21,  255], icon: "🏫" },
  { id: "SEC-2", type: "Industrial",  x: 12, y: 12, color: "#f97316", rgba: [249, 115, 22,  255], icon: "🏭" },
  { id: "SEC-3", type: "Residential", x: 2,  y: 16, color: "#34d399", rgba: [52,  211, 153, 255], icon: "🏘️" },
  { id: "SEC-4", type: "Commercial",  x: 14, y: 6,  color: "#818cf8", rgba: [129, 140, 248, 255], icon: "🏢" },
];
