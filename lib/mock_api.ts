import type {
  WorldMapResponse,
  DronesResponse,
  SurvivorsResponse,
  MeshLogResponse,
  Drone,
  MissionsListResponse,
  MissionStartedResponse,
  MissionStatusResponse,
  MissionRequest,
  ScenariosListResponse,
  ScenarioDetailResponse,
  MissionListItem
} from "../types/api_types";

// In-memory fake state
let fakeMissions: MissionListItem[] = [

];

const fakeScenarios: ScenariosListResponse = {
  scenarios: [
    { name: "battery_crisis", prompt_preview: "Manage drone fleet with low batteries." },
    { name: "offline_recovery", prompt_preview: "Recover connection to offline drone units." },
    { name: "rescue_priority", prompt_preview: "Determine priority for multiple rescue targets." },
    { name: "supply_run", prompt_preview: "Deliver supplies to critical survivors." },
    { name: "survivor_detect", prompt_preview: "Locate all survivors in the zone." },
    { name: "swarm_status", prompt_preview: "Analyze and report the full swarm status." }
  ],
  total: 7
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const api = {
  world: {
    getMap: async () => { await delay(200); return {} as WorldMapResponse; },
    getDrones: async () => { await delay(200); return { drones: [], summary: { total: 0, active: 0, offline: 0, charging: 0, low_battery: [] } } as DronesResponse; },
    getSurvivors: async () => { await delay(200); return { survivors: [], priority_list: [] } as SurvivorsResponse; },
    getMeshLog: async () => { await delay(200); return { mesh_log: [], total_entries: 0 } as MeshLogResponse; },
    reset: async () => { await delay(500); return { status: "success", message: "Reset complete." }; },
  },

  missions: {
    list: async (): Promise<MissionsListResponse> => {
      await delay(300);
      return { missions: [...fakeMissions] };
    },
    create: async (data: MissionRequest): Promise<MissionStartedResponse> => {
      await delay(800);
      const newMission: MissionListItem = {
        mission_id: `m_${Date.now()}`,
        scenarios: data.scenarios,
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
      };
      fakeMissions.push(newMission);
      return {
        mission_id: newMission.mission_id,
        scenario: newMission.scenarios,
        status: "started",
        stream_url: `/api/stream/${newMission.mission_id}`
      };
    },
    getStatus: async (id: string): Promise<MissionStatusResponse> => {
      await delay(200);
      const mission = fakeMissions.find(m => m.mission_id === id);
      return {
        mission_id: id,
        scenario: mission?.scenarios || "unknown",
        status: mission?.status || "running",
        steps_logged: 10,
        mission_complete: mission?.status === "complete",
        summary: null
      };
    },
  },

  scenarios: {
    list: async (): Promise<ScenariosListResponse> => {
      await delay(200);
      return fakeScenarios;
    },
    get: async (name: string): Promise<ScenarioDetailResponse> => {
      await delay(200);
      return { name, prompt: `Launch the ${name} protocol...` };
    },
  },

  drones: {
    list: async () => { await delay(200); return { drones: [], summary: { total: 0, active: 0, offline: 0, charging: 0, low_battery: [] } } as DronesResponse; },
    get: async (id: string) => { await delay(200); return {} as Drone; },
  }
};
