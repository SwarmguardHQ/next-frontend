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
  {
    mission_id: "m_fake_1",
    scenarios: "survivor_detect",
    status: "complete",
    started_at: new Date(Date.now() - 3600000).toISOString(),
    finished_at: new Date(Date.now() - 3500000).toISOString(),
  }
];

const fakeScenarios: ScenariosListResponse = {
  scenarios: [
    { name: "survivor_detect", prompt_preview: "Locate all survivors in the zone." },
    { name: "supply_run", prompt_preview: "Deliver supplies to critical survivors." },
    { name: "battery_crisis", prompt_preview: "Manage drone fleet with low batteries." }
  ],
  total: 3
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
