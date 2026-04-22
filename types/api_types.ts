export interface Position {
  x: number;
  y: number;
}

export interface SensorData {
  type: 'visual' | 'thermal' | 'lidar' | 'audio';
  status: 'active' | 'damaged' | 'offline' | 'not_installed';
  value: string | number;
}

// ── Multi-modal scan payloads ─────────────────────────────────────────────────

export interface ThermalBlob {
  centroid: [number, number];
  area: number;
  mean_heat: number;
  peak_heat: number;
}

export interface RGBChannels {
  r: number;
  g: number;
  b: number;
  confidence: number;
}

export interface ThermalScanCell {
  pos: [number, number];
  heat: number;
  confirmed: boolean;
  fused_confidence: number;
  modalities: ('thermal_ir' | 'rgb_camera' | 'thermal_blob')[];
  condition_hint: 'critical' | 'moderate' | 'stable' | 'unknown';
  rgb: RGBChannels | null;
}

export interface RGBHit {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  confidence: number;
  condition_hint: 'critical' | 'moderate' | 'stable' | 'unknown';
  distance: number;
}

/** Response from thermal_scan MCP tool */
export interface ThermalScanResult {
  drone_id: string;
  scan_position: { x: number; y: number };
  scan_radius: number;
  survivors_detected: {
    survivor_id: string;
    position: { x: number; y: number };
    condition: string;
    priority: number;
    heat_reading: number;
    distance: number;
    detection_method: 'thermal_ir';
  }[];
  thermal_blobs: ThermalBlob[];
  battery_remaining: number;
}

/** Response from rgb_scan MCP tool */
export interface RGBScanResult {
  drone_id: string;
  scan_position: { x: number; y: number };
  scan_radius: number;
  rgb_hits: (RGBHit & {
    survivor_id: string;
    position: { x: number; y: number };
    condition: string;
    rgb_confidence: number;
    detection_method: 'rgb_camera';
  })[];
  battery_remaining: number;
}

export interface Drone {
  drone_id: string;
  position: Position;
  battery: number;
  status: 'idle' | 'flying' | 'scanning' | 'returning' | 'charging' | 'delivering' | 'offline';
  payload: string | null;
  assigned_sector: string | null;
  last_seen: string;
  sensors?: SensorData[];
}

export interface Survivor {
  survivor_id: string;
  position: Position;
  condition: string;
  detected: boolean;
  rescued: boolean;
  supplies_received: string[];
}

export interface SwarmDronesSummary {
  total: number;
  active: number;
  offline: number;
  charging: number;
  low_battery: { id: string; battery: number }[];
}

export interface SwarmSurvivorsSummary {
  total: number;
  detected: number;
  rescued: number;
  critical_unrescued: number;
}

export interface SwarmSummary {
  drones: SwarmDronesSummary;
  survivors: SwarmSurvivorsSummary;
  mission_complete: boolean;
}

export interface WorldMapResponse {
  map: string;
  width: number;
  height: number;
}

export interface WorldMetricsResponse {
  grid_size: number;
  explored_cells: number;
  total_cells: number;
  coverage_pct: number;
  summary: SwarmSummary;
}

export interface DronesResponse {
  drones: Drone[];
  summary: SwarmSummary;
}

export interface SurvivorsResponse {
  survivors: Survivor[];
  priority_list: string[];
}

export interface MeshLogResponse {
  mesh_log: string[];
  total_entries: number;
}

/** Optional Mesa layer on stream ticks when ``USE_MESA_SIM=1`` */
export interface WorldStreamSimVisual {
  heatmap: number[][];
  mesa_step: number;
  mesa_coverage_pct: number;
  confirmed_survivors: number;
  pending_detections: number;
}

/** One SSE ``tick`` payload from ``GET /world/stream`` */
export interface WorldStreamTickPayload {
  ts: string;
  drones: Drone[];
  summary: SwarmSummary;
  metrics: WorldMetricsResponse;
  survivors: SurvivorsResponse;
  /** Recent mesh lines (tail); not full ``/world/mesh-log`` */
  mesh_log: string[];
  /** Normalized thermal grid + Mesa counters (null without ``USE_MESA_SIM``) */
  sim_visual: WorldStreamSimVisual | null;
}

/** POST /world/mesa/step — advance cached DisasterZone */
export interface MesaStepResponse {
  mesa_step: number;
  confirmed_survivors: number;
  coverage_pct: number;
  pulled_to_world?: boolean;
}

export interface Scenario {
  name: string;
  prompt_preview?: string;
}

export interface ScenariosListResponse {
  scenarios: Scenario[];
  total: number;
}

export interface ScenarioDetailResponse {
  name: string;
  prompt: string;
}

export interface MissionListItem {
  mission_id: string;
  scenarios: string; // The backend key is "scenarios" in list output
  status: 'running' | 'complete' | 'failed';
  started_at: string;
  finished_at: string | null;
}

export interface MissionsListResponse {
  missions: MissionListItem[];
}

export interface MissionRequest {
  scenarios: string;
  custom_prompt?: string;
	online_mode: boolean;
}

export interface MissionStartedResponse {
  mission_id: string;
  scenario: string;
  status: string;
  stream_url: string;
}

export interface MissionStatusResponse {
  mission_id: string;
  scenario: string;
  status: 'running' | 'complete' | 'failed';
  steps_logged: number;
  mission_complete: boolean;
  summary: SwarmSummary | null;
}
