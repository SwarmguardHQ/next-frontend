export type ScenarioId =
  | "patrol"
  | "inspect"
  | "rth"
  | "survey"
  | "emergency_land"
  | "follow"
  | "hover"
  | "unknown";

export type CommandStatus =
  | "idle"
  | "listening"
  | "processing"
  | "executing"
  | "done"
  | "error";

export interface DroneScenario {
  id: ScenarioId;
  label: string;
  icon: React.ReactNode;
  description: string;
  steps: string[];
  telemetry: Partial<TelemetryState>;
}

export interface TelemetryState {
  altitude: number;
  speed: number;
  battery: number;
  lat: number;
  lng: number;
  status: string;
}

export interface CommandLog {
  id: string;
  transcript: string;
  scenario: DroneScenario;
  timestamp: Date;
  executionTime: number;
}