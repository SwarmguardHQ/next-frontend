import * as THREE from "three";

/** World units per map step along X / Z (classic 2:1 diamond isometric). */
export const DEFAULT_TILE_W = 1;
export const DEFAULT_TILE_H = 0.5;

/**
 * Isometric screen-style mapping into Three.js (Y up):
 * - Ground lies on the XZ plane.
 * - `map.z` is vertical height (buildings / flight altitude).
 *
 * Matches the common 2D projection:
 *   screen.x = (map.x - map.y) * (tileWidth / 2)
 *   screen.y = (map.x + map.y) * (tileHeight / 2) - map.z
 *
 * Here we map `screen.x → world.x`, `screen.y → world.z`, `map.z → world.y`.
 */
export function mapToWorldVec(
  mapX: number,
  mapY: number,
  mapZ = 0,
  tileW = DEFAULT_TILE_W,
  tileH = DEFAULT_TILE_H,
): THREE.Vector3 {
  const tw = tileW / 2;
  const th = tileH / 2;
  // Swapping mapX and mapY to fix inverted coordinates in Iso Field
  const wx = (mapY - mapX) * tw;
  const wz = (mapY + mapX) * th;
  const wy = mapZ;
  return new THREE.Vector3(wx, wy, wz);
}

/** Inverse of {@link mapToWorldVec} on the ground plane (world.y = 0). */
export function worldXZToMapFrac(
  wx: number,
  wz: number,
  tileW = DEFAULT_TILE_W,
  tileH = DEFAULT_TILE_H,
): { mx: number; my: number } {
  const tw2 = tileW / 2;
  const th2 = tileH / 2;
  const sum = wz / th2;
  const diff = wx / tw2;
  // Swapping mx and my to match mapToWorldVec fix
  return { mx: (sum - diff) / 2, my: (sum + diff) / 2 };
}

/** Scene origin: center of the grid in map space (cell centers). */
export function gridSceneCenter(gridSize: number): THREE.Vector3 {
  const c = (gridSize - 1) / 2;
  return mapToWorldVec(c + 0.5, c + 0.5, 0);
}

export function lodStepFromDistance(dist: number): 1 | 2 | 4 {
  if (dist > 22) return 4;
  if (dist > 14) return 2;
  return 1;
}

/** Visible height of each tile slab. */
export const SLAB_H = 0.055;

/**
 * Diamond slab for grid cell (ix, iy) — top face + 4 outward side faces.
 * Normals are computed per-face (flat shading), so directional light gives
 * natural top-bright / sides-darker depth automatically.
 */
export function createTileSlabGeometry(ix: number, iy: number): THREE.BufferGeometry {
  const p00 = mapToWorldVec(ix,     iy);
  const p10 = mapToWorldVec(ix + 1, iy);
  const p01 = mapToWorldVec(ix,     iy + 1);
  const p11 = mapToWorldVec(ix + 1, iy + 1);
  const h = SLAB_H;

  const pos: number[] = [];

  /** Push one quad (2 tris, 6 unique verts) into pos. Winding: CCW from face front. */
  const addQuad = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
  ) => {
    pos.push(ax,ay,az, bx,by,bz, cx,cy,cz);
    pos.push(ax,ay,az, cx,cy,cz, dx,dy,dz);
  };

  // Top face — CCW from above gives +Y normal
  addQuad(p00.x,h,p00.z, p01.x,h,p01.z, p11.x,h,p11.z, p10.x,h,p10.z);

  // Four side faces (each winding gives outward normal):
  addQuad(p00.x,h,p00.z, p10.x,h,p10.z, p10.x,0,p10.z, p00.x,0,p00.z); // NE
  addQuad(p10.x,h,p10.z, p11.x,h,p11.z, p11.x,0,p11.z, p10.x,0,p10.z); // SE
  addQuad(p11.x,h,p11.z, p01.x,h,p01.z, p01.x,0,p01.z, p11.x,0,p11.z); // SW
  addQuad(p01.x,h,p01.z, p00.x,h,p00.z, p00.x,0,p00.z, p01.x,0,p01.z); // NW

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  return geo;
}
