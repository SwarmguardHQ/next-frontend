import {
  Shield,
  ScanSearch,
  Home,
  Grid3X3,
  AlertTriangle,
  UserRound,
  PauseCircle,
  HelpCircle,
} from "lucide-react";
import { DroneScenario, ScenarioId } from "@/types/drone";

export const SCENARIOS: Record<ScenarioId, DroneScenario> = {
  patrol: {
    id: "patrol",
    label: "Perimeter Patrol",
    icon: <Shield className="h-4 w-4" />,
    description: "Autonomous perimeter patrol along predefined waypoints",
    steps: [
      "Loading patrol waypoints from mission database",
      "Calculating optimal flight path",
      "Arming motors — pre-flight check passed",
      "Drone airborne — commencing patrol route",
      "Patrol active — 4 waypoints remaining",
    ],
    telemetry: { altitude: 45, speed: 8, status: "PATROL ACTIVE" },
  },
  inspect: {
    id: "inspect",
    label: "Infrastructure Inspect",
    icon: <ScanSearch className="h-4 w-4" />,
    description: "Close-range visual inspection with gimbal lock",
    steps: [
      "Identifying target structure from coordinates",
      "Plotting inspection orbit trajectory",
      "Engaging precision hover mode",
      "Gimbal locked — starting visual scan",
      "Inspection footage streaming to ground station",
    ],
    telemetry: { altitude: 12, speed: 1.5, status: "INSPECTING" },
  },
  rth: {
    id: "rth",
    label: "Return to Home",
    icon: <Home className="h-4 w-4" />,
    description: "Immediate return-to-home sequence",
    steps: [
      "RTH command acknowledged",
      "Calculating shortest safe route home",
      "Ascending to safe altitude — 50m",
      "Navigating home — ETA 2 min 14 sec",
      "Initiating landing sequence at home point",
    ],
    telemetry: { altitude: 50, speed: 12, status: "RTH ACTIVE" },
  },
  survey: {
    id: "survey",
    label: "Area Survey",
    icon: <Grid3X3 className="h-4 w-4" />,
    description: "Grid-pattern photogrammetry survey",
    steps: [
      "Importing survey area boundary",
      "Generating lawnmower grid pattern — 24 passes",
      "Camera set to 80% overlap, nadir angle",
      "Survey flight initiated — pass 1 of 24",
      "Capturing imagery — 340 photos acquired",
    ],
    telemetry: { altitude: 80, speed: 6, status: "SURVEY FLIGHT" },
  },
  emergency_land: {
    id: "emergency_land",
    label: "Emergency Land",
    icon: <AlertTriangle className="h-4 w-4" />,
    description: "Immediate forced landing at current position",
    steps: [
      "EMERGENCY LAND triggered",
      "Cutting non-essential systems",
      "Descending at max safe rate — 4 m/s",
      "Ground proximity detected — 5m",
      "Motors disarmed — drone secured",
    ],
    telemetry: { altitude: 0, speed: 0, status: "LANDED" },
  },
  follow: {
    id: "follow",
    label: "Follow Target",
    icon: <UserRound className="h-4 w-4" />,
    description: "Lock and follow a moving subject",
    steps: [
      "Activating subject tracking module",
      "Target acquired via vision pipeline",
      "Maintaining 8m follow distance",
      "Tracking active — subject moving NNE",
      "Follow mode engaged",
    ],
    telemetry: { altitude: 15, speed: 5, status: "FOLLOWING" },
  },
  hover: {
    id: "hover",
    label: "Hold Position",
    icon: <PauseCircle className="h-4 w-4" />,
    description: "Loiter at current position indefinitely",
    steps: [
      "Engaging GPS hold mode",
      "Position lock acquired — ±0.3m accuracy",
      "Altitude hold confirmed",
      "Drone loitering — awaiting next command",
    ],
    telemetry: { speed: 0, status: "LOITER" },
  },
  unknown: {
    id: "unknown",
    label: "Unrecognised Command",
    icon: <HelpCircle className="h-4 w-4" />,
    description: "Command could not be mapped to a drone scenario",
    steps: ["Parsing voice input", "No matching scenario found", "Awaiting clarification"],
    telemetry: {},
  },
};

export function classifyIntent(transcript: string): ScenarioId {
  const t = transcript.toLowerCase();
  if (t.match(/\b(patrol|perimeter|guard|circle|loop)\b/)) return "patrol";
  if (t.match(/\b(inspect|inspection|check|scan|examine|look at)\b/)) return "inspect";
  if (t.match(/\b(return|home|rth|come back|land home)\b/)) return "rth";
  if (t.match(/\b(survey|map|mapping|photogrammetry|grid)\b/)) return "survey";
  if (t.match(/\b(emergency|land now|force land|emergency land)\b/)) return "emergency_land";
  if (t.match(/\b(follow|track|pursue|chase)\b/)) return "follow";
  if (t.match(/\b(hover|hold|stay|loiter|wait|stop moving)\b/)) return "hover";
  return "unknown";
}

export const BASE_TELEMETRY = {
  altitude: 32,
  speed: 0,
  battery: 78,
  lat: 3.139,
  lng: 101.6869,
  status: "STANDBY",
};