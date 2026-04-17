const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean>;
}

export class ApiClient {
  static async request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { params, ...customConfig } = options;
    
    let url = `${API_BASE_URL}${endpoint}`;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        searchParams.append(key, String(value));
      });
      url += `?${searchParams.toString()}`;
    }

    const config: RequestInit = {
      ...customConfig,
      headers: {
        "Content-Type": "application/json",
        ...customConfig.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await response.json() : null;

      if (!response.ok) {
        throw new Error(data?.message || data?.detail || response.statusText || `HTTP error! status: ${response.status}`);
      }

      return data;

    } catch (error) {
      throw error;
    }
  }

  static async get<T>(endpoint: string, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  static async post<T>(endpoint: string, body?: any, options?: FetchOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  static async put<T>(endpoint: string, body?: any, options?: FetchOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  static async delete<T>(endpoint: string, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }
}

// Pre-defined API functions based on backend domains
import type {
  WorldMapResponse,
  WorldMetricsResponse,
  DronesResponse,
  SurvivorsResponse,
  MeshLogResponse,
  Drone,
  MissionsListResponse,
  MissionStartedResponse,
  MissionStatusResponse,
  MissionRequest,
  ScenariosListResponse,
  ScenarioDetailResponse
} from "../types/api_types";

export const api = {
  world: {
    getMap: () => ApiClient.get<WorldMapResponse>("/world/map"),
    getMetrics: () => ApiClient.get<WorldMetricsResponse>("/world/metrics"),
    getDrones: () => ApiClient.get<DronesResponse>("/world/drones"),
    getSurvivors: () => ApiClient.get<SurvivorsResponse>("/world/survivors"),
    getMeshLog: () => ApiClient.get<MeshLogResponse>("/world/mesh-log"),
    reset: () => ApiClient.post<{status: string, message: string}>("/world/reset"),
  },

  missions: {
    list: () => ApiClient.get<MissionsListResponse>("/mission/"),
    create: (data: MissionRequest) => ApiClient.post<MissionStartedResponse>("/mission/run", data),
    getStatus: (id: string) => ApiClient.get<MissionStatusResponse>(`/mission/${id}/status`),
  },

  scenarios: {
    list: () => ApiClient.get<ScenariosListResponse>("/scenarios/"),
    get: (name: string) => ApiClient.get<ScenarioDetailResponse>(`/scenarios/${name}`),
  },
	
  drones: {
    list: () => ApiClient.get<DronesResponse>("/world/drones"),
    get: (id: string) => ApiClient.get<Drone>(`/world/drones/${id}`),
  }
};
