export interface Position {
  x: number;
  y: number;
}

export interface Drone {
  drone_id: string;
  position: Position;
  battery: number;
  status: 'idle' | 'flying' | 'scanning' | 'returning' | 'charging' | 'delivering' | 'offline';
  payload: string | null;
  assigned_sector: string | null;
  last_seen: string;
}

export interface Survivor {
  survivor_id: string;
  position: Position;
  condition: string;
  detected: boolean;
  rescued: boolean;
  supplies_received: string[];
}

export interface SwarmSummary {
  total: number;
  active: number;
  offline: number;
  charging: number;
  low_battery: string[];
}

export interface WorldMapResponse {
  map: string;
  width: number;
  height: number;
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
