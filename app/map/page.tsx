"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { 
  Map as MapIcon, Radar, Wifi, AlertCircle, CheckCircle2, 
  Clock, Play, AlertOctagon, Target, ChevronRight,
  BatteryCharging, HeartPulse, Package, Triangle,
  Terminal, Mic, MicOff, Send, Activity
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { Drone, Survivor, MissionsListResponse, ScenariosListResponse } from "@/types/api_types";
import { cn } from "@/lib/utils";

import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { classifyIntent, SCENARIOS, BASE_TELEMETRY } from "@/lib/drone-scenarios";
import { CommandLog, CommandStatus, DroneScenario, TelemetryState } from "@/types/drone";
import { QuickCommands } from "@/components/drone-command/quick-commands";

const SimulationMap3D = dynamic(() => import("@/components/map/SimulationMap3D"), { ssr: false });

// ─── Constants & Helpers ──────────────────────────────────────────────────────
const GRID_SIZE = 20;
const CHARGING_STATIONS = [{ id: "CS1", x: 0, y: 0 }, { id: "CS2", x: 19, y: 0 }];
const SUPPLY_DEPOTS = [{ id: "D1", x: 0, y: 0 }, { id: "D2", x: 19, y: 19 }];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function droneColor(status: string): string {
  if (status === "charging") return "text-emerald-400";
  if (status === "offline") return "text-red-500";
  if (status === "returning") return "text-amber-400";
  if (status === "scanning" || status === "flying") return "text-sky-400";
  return "text-slate-400";
}

function survivorColor(s: Survivor): string {
  if (s.rescued) return "text-sky-300";
  if (s.condition === "critical") return "text-red-400";
  if (s.condition === "moderate") return "text-amber-400";
  if (s.condition === "stable") return "text-emerald-400";
  return "text-slate-400";
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case "running":  return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
    case "complete": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":   return <AlertOctagon className="h-4 w-4 text-destructive" />;
    default:         return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function MergeCollapsePage() {
  // Map State
  const [drones, setDrones] = useState<Drone[]>([]);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [pulse, setPulse] = useState(0);
  
  // UI State
  const [viewMode, setViewMode] = useState<"2d" | "3d">("3d");
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Mission State
  const [missionsData, setMissionsData] = useState<MissionsListResponse | null>(null);
  const [scenariosData, setScenariosData] = useState<ScenariosListResponse | null>(null);
  const [selectedScenario, setSelectedScenario] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  // Voice Command State
  const { isListening, transcript, interim, supported, start, stop } = useSpeechRecognition();
  const [voiceText, setVoiceText] = useState("");
  const [cmdStatus, setCmdStatus] = useState<CommandStatus>("idle");
  const [feedback, setFeedback] = useState("");

  // ─── Timers & Fetching
  useEffect(() => {
    const tick = window.setInterval(() => setPulse((n) => (n + 1) % 2), 900);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const fetchMap = async () => {
      try {
        const [dRes, sRes] = await Promise.all([api.world.getDrones(), api.world.getSurvivors()]);
        setDrones(dRes.drones || []);
        setSurvivors(sRes.survivors || []);
      } catch (e) {}
    };
    
    const fetchMissions = async () => {
      try {
        const [mRes, scRes] = await Promise.all([api.missions.list(), api.scenarios.list()]);
        setMissionsData(mRes);
        setScenariosData(scRes);
      } catch (e) {}
    };

    fetchMap();
    fetchMissions();
    const mapId = setInterval(fetchMap, 1800);
    const missionId = setInterval(fetchMissions, 5000);
    return () => { clearInterval(mapId); clearInterval(missionId); };
  }, []);

  // ─── Commands Execution
  const handleStartMission = async () => {
    if (!selectedScenario) return;
    try {
      setIsStarting(true);
      await api.missions.create({ scenarios: selectedScenario });
      setSelectedScenario("");
    } catch (e) {} finally {
      setIsStarting(false);
    }
  };

  const executeCommand = useCallback(async (text: string) => {
    if (!text.trim() || cmdStatus === "executing" || cmdStatus === "processing") return;
    const scenarioId = classifyIntent(text);
    const scenario = SCENARIOS[scenarioId];
    setCmdStatus("processing");
    setFeedback("Classifying intent…");
    await new Promise((r) => setTimeout(r, 600));

    if (scenarioId === "unknown") {
      setFeedback(`Could not map "${text}" to a drone command.`);
      setCmdStatus("error");
      setTimeout(() => { setCmdStatus("idle"); setFeedback(""); }, 3000);
      return;
    }

    setCmdStatus("executing");
    setFeedback(`Executing: ${scenario.label}`);
    
    // Simulate real execution delay
    for (let i = 0; i < scenario.steps.length; i++) {
      await new Promise((r) => setTimeout(r, 700 + Math.random() * 400));
    }

    setCmdStatus("done");
    setFeedback(`${scenario.label} — complete`);
    setTimeout(() => { setCmdStatus("idle"); setFeedback(""); }, 2500);
  }, [cmdStatus]);

  useEffect(() => {
    if (!isListening && transcript && cmdStatus === "idle") {
      executeCommand(transcript);
    }
  }, [isListening, transcript, cmdStatus, executeCommand]);

  const handleMic = () => (isListening ? stop() : start());
  const handleSend = () => { executeCommand(voiceText); setVoiceText(""); };
  const isCmdActive = cmdStatus === "executing" || cmdStatus === "processing";

  // ─── 2D Map Derived Data
  const cells = useMemo(() => {
    const list: { x: number; y: number }[] = [];
    for (let y = GRID_SIZE - 1; y >= 0; y -= 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) list.push({ x, y });
    }
    return list;
  }, []);

  const dronesByCell = useMemo(() => {
    const map = new Map<string, Drone[]>();
    for (const drone of drones) {
      const x = Math.round(clamp(Number(drone.position?.x), 0, GRID_SIZE - 1));
      const y = Math.round(clamp(Number(drone.position?.y), 0, GRID_SIZE - 1));
      const key = `${x}-${y}`;
      map.set(key, [...(map.get(key) ?? []), drone]);
    }
    return map;
  }, [drones]);

  const survivorsByCell = useMemo(() => {
    const map = new Map<string, Survivor[]>();
    for (const survivor of survivors) {
      const x = Math.round(clamp(Number(survivor.position?.x), 0, GRID_SIZE - 1));
      const y = Math.round(clamp(Number(survivor.position?.y), 0, GRID_SIZE - 1));
      const key = `${x}-${y}`;
      map.set(key, [...(map.get(key) ?? []), survivor]);
    }
    return map;
  }, [survivors]);

  const sortedMissions = missionsData?.missions?.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()) ?? [];

  return (
    <div className="flex-1 rounded-lg bg-[#0d1117] text-white flex h-[calc(100vh-theme(spacing.16))] relative overflow-hidden">
      
      {/* ── Main Map Area ── */}
      <div className="flex-1 flex flex-col p-4 sm:p-6 transition-all duration-300">
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 mb-4 pr-14">
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-wide text-white sm:text-3xl">
            <MapIcon className="h-7 w-7 text-sky-400" />
            Live Map & Operations
          </h2>
          <div className="flex items-center gap-2">
            <div className="mr-1 inline-flex rounded-md border border-slate-600/70 bg-slate-900/70 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("2d")}
                  className={`rounded px-2 py-1 text-xs font-semibold tracking-wide ${viewMode === "2d" ? "bg-sky-500/20 text-sky-200" : "text-slate-300 hover:bg-slate-800"}`}
                >
                  2D
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("3d")}
                  className={`rounded px-2 py-1 text-xs font-semibold tracking-wide ${viewMode === "3d" ? "bg-sky-500/20 text-sky-200" : "text-slate-300 hover:bg-slate-800"}`}
                >
                  3D
                </button>
            </div>
            <Badge className="border border-sky-400/40 bg-sky-500/10 text-sky-300">
              <Wifi className="h-3 w-3 mr-1" /> LIVE STREAM
            </Badge>
          </div>
        </div>

        <div className="flex-1 flex gap-4 min-h-0">
          <Card className="flex-1 border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.18)] flex flex-col min-h-0">
            <CardContent className={viewMode === "2d" ? "overflow-auto p-4 h-full" : "p-0 h-full relative border-none"}>
              {viewMode === "2d" ? (
                <div className="flex justify-center min-w-[500px]">
                  <div
                    className="grid gap-px rounded-md bg-slate-800/80 p-px"
                    style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`, width: "100%", maxWidth: "980px", aspectRatio: "1/1" }}
                  >
                  {cells.map((cell) => {
                    const key = `${cell.x}-${cell.y}`;
                    const cellDrones = dronesByCell.get(key) ?? [];
                    const cellSurvivors = survivorsByCell.get(key) ?? [];
                    const isCS = CHARGING_STATIONS.some((cs) => cs.x === cell.x && cs.y === cell.y);
                    const isDepot = SUPPLY_DEPOTS.some((d) => d.x === cell.x && d.y === cell.y);

                    return (
                      <div key={key} className="group relative flex aspect-square items-center justify-center bg-slate-900 transition-colors hover:bg-slate-800">
                        {isCS && <BatteryCharging className="absolute left-1 top-1 h-3 w-3 text-emerald-800/80" />}
                        {isDepot && <Package className="absolute bottom-1 right-1 h-3 w-3 text-sky-800/80" />}
                        {(cellSurvivors.length > 0 || cellDrones.length > 0) && <span className="absolute inset-0 rounded-[2px] ring-1 ring-sky-400/15" />}
                        <div className="flex flex-wrap items-center justify-center gap-1 p-1">
                          {cellSurvivors.map((s) => (
                            <HeartPulse key={s.survivor_id} className={`h-4 w-4 ${survivorColor(s)} ${!s.detected && !s.rescued ? "opacity-45" : pulse ? "opacity-100" : "opacity-70"}`} />
                          ))}
                          {cellDrones.map((d) => (
                            <div key={d.drone_id} className="relative">
                              <Triangle fill="currentColor" className={`h-4 w-4 ${droneColor(d.status)} ${d.status === "offline" ? "rotate-180" : ""}`} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              ) : (
                <SimulationMap3D drones={drones} survivors={survivors} pulse={pulse} />
              )}
            </CardContent>
          </Card>

          {/* Map Legend (Pinned to left side of map when Panel isn't obstructing, or we can just keep it next to map) */}
          <div className="hidden lg:block w-[240px] shrink-0 overflow-y-auto">
             <Card className="border border-sky-400/20 bg-[#111827] shadow-[0_0_0_1px_rgba(61,158,228,0.18)]">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base tracking-wide text-white">
                    <Activity className="h-4 w-4 text-sky-300" />
                    Legend
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 text-xs text-slate-300 p-4 pt-0">
                  <p className="font-semibold tracking-widest text-slate-400 uppercase">Infrastructure</p>
                  <div className="flex items-center gap-2"><BatteryCharging className="h-4 w-4 text-emerald-500" /> Charging Station</div>
                  <div className="flex items-center gap-2"><Package className="h-4 w-4 text-sky-500" /> Supply Depot</div>

                  <p className="mt-2 font-semibold tracking-widest text-slate-400 uppercase">Drone States</p>
                  <div className="flex items-center gap-2"><Triangle fill="currentColor" className="h-4 w-4 text-sky-400" /> Flying / Scanning</div>
                  <div className="flex items-center gap-2"><Triangle fill="currentColor" className="h-4 w-4 text-amber-400" /> Returning</div>
                  <div className="flex items-center gap-2"><Triangle fill="currentColor" className="h-4 w-4 text-emerald-400" /> Charging</div>
                  <div className="flex items-center gap-2"><Triangle fill="currentColor" className="h-4 w-4 rotate-180 text-red-500" /> Offline</div>

                  <p className="mt-2 font-semibold tracking-widest text-slate-400 uppercase">Survivors</p>
                  <div className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-red-400" /> Critical</div>
                  <div className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-amber-400" /> Moderate</div>
                  <div className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-emerald-400" /> Stable</div>
                  <div className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-slate-400 opacity-45" /> Undetected</div>
                </CardContent>
              </Card>
          </div>
        </div>
      </div>

      {/* ── Floating Toggle Button ── */}
      <div className={cn("absolute top-6 z-20 transition-all duration-300", isPanelOpen ? "right-[410px]" : "right-6")}>
        <Button 
          variant="default"
          size="icon"
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          className="h-10 w-10 shrink-0 rounded-full shadow-[0_0_15px_rgba(50,200,255,0.4)] bg-sky-600 hover:bg-sky-500 border border-sky-400/50"
        >
          {isPanelOpen ? <ChevronRight className="h-5 w-5" /> : <Target className="h-5 w-5" />}
        </Button>
      </div>

      {/* ── Collapsible Right Mission Panel ── */}
      <div 
        className={cn(
          "absolute right-0 top-0 bottom-0 z-10 w-[400px] border-l border-sky-500/30 bg-[#0b101a]/95 backdrop-blur-md shadow-2xl transition-transform duration-300 flex flex-col",
          isPanelOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center h-[72px] px-6 border-b border-slate-800 shrink-0">
            <h3 className="text-lg font-semibold tracking-wide text-white">Mission Command</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <Card className="border-sky-500/30 bg-sky-500/5 shadow-inner">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Deploy Scenario</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pb-2">
              <Select disabled={!scenariosData} value={selectedScenario} onValueChange={setSelectedScenario}>
                <SelectTrigger className="w-full h-9 text-xs capitalize"><SelectValue placeholder="Select an operation..." /></SelectTrigger>
                <SelectContent>
                  {scenariosData?.scenarios.map((s) => (
                    <SelectItem key={s.name} value={s.name} className="capitalize text-xs">{s.name.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <div className="flex items-center gap-2 text-xs text-slate-500 my-1 justify-center">
                 <div className="h-px w-12 bg-slate-700"></div> or use voice <div className="h-px w-12 bg-slate-700"></div>
              </div>

               <div className="space-y-2">
                  <div className="flex flex-col gap-2">
                     <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="icon" disabled={isCmdActive || !supported} onClick={handleMic}
                            className={cn("h-9 w-9 shrink-0 rounded-full transition-all", isListening && "border-blue-500 bg-blue-500/10 text-blue-400 ring-2 ring-blue-500/20 animate-pulse")}
                        >
                            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                        </Button>
                        <Input
                            placeholder='"patrol", "return home"…'
                            value={voiceText}
                            disabled={isCmdActive}
                            onChange={(e) => setVoiceText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSend()}
                            className="h-9 text-xs flex-1 bg-slate-900 border-slate-700"
                        />
                        <Button size="icon" variant="outline" disabled={isCmdActive || !voiceText.trim()} onClick={handleSend} className="h-9 w-9 shrink-0">
                            <Send className="h-4 w-4 text-sky-400" />
                        </Button>
                     </div>
                     <p className={cn("text-xs px-1", !transcript && !interim ? "text-slate-500 italic" : "text-sky-300")}>
                        {transcript || interim ? <>{transcript}<span className="text-slate-500"> {interim}</span></> : isListening ? "Listening…" : "Click mic or type"}
                     </p>
                  </div>

                  {feedback && (
                    <p className={cn("text-xs font-mono flex items-center gap-1.5 px-1 pt-1", cmdStatus === "error" ? "text-red-400" : cmdStatus === "done" ? "text-emerald-400" : "text-sky-400")}>
                      {isCmdActive && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />}
                      {feedback}
                    </p>
                  )}
               </div>

               <QuickCommands disabled={isCmdActive} onCommand={executeCommand} />
            </CardContent>
            <CardFooter>
              <Button className="w-full h-9 shadow-md relative overflow-hidden" disabled={!selectedScenario || isStarting} onClick={handleStartMission}>
                {isStarting ? "Processing..." : <><Play className="mr-2 h-3.5 w-3.5" />Launch Scenario</>}
              </Button>
            </CardFooter>
          </Card>

          <Card className="border border-slate-800 bg-[#111827]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Active Deployments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
               <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-[10px] h-8 px-4 text-slate-400">Scenario</TableHead>
                        <TableHead className="text-[10px] h-8 px-4 text-right text-slate-400">State</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedMissions.map((mission) => (
                        <TableRow key={mission.mission_id} className="border-slate-800 hover:bg-slate-800/50 transition-colors group cursor-pointer relative" onClick={() => window.location.href = `/missions/${mission.mission_id}`}>
                          <TableCell className="font-medium capitalize text-sky-400 text-xs px-4 py-2">
                            <a href={`/missions/${mission.mission_id}`} className="hover:underline flex items-center gap-1.5">
                              {mission.scenarios.replace(/_/g, " ")}
                              <Terminal className="h-3 w-3 text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>
                            <div className="text-[9px] text-slate-500 font-mono mt-0.5">{mission.mission_id.slice(0,8)}...</div>
                          </TableCell>
                          <TableCell className="px-4 py-2">
                            <div className="flex items-center justify-end gap-1.5 text-[11px]">
                              <span className="capitalize text-slate-300">{mission.status}</span>
                              {getStatusIcon(mission.status)}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {sortedMissions.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center py-6 text-xs text-slate-500">
                            No active missions.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}
