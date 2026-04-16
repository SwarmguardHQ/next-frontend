"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getBackendOrigin } from "@/lib/backendOrigin";

type LogEvent = {
  id: string | number;
  type: "log" | "step" | "error" | "complete";
  timestamp: string;
  message?: string;
  phase?: string;
  tool?: string;
  reasoning?: string;
  result_summary?: string;
  debrief?: string;
};
import { Mic, MicOff, Settings, User, Bell, ChevronLeft, ChevronRight, History, ShieldAlert, Cpu, Radar, Send, Play, Terminal, Target, AlertOctagon, CheckCircle2, Clock, AlertCircle, Package, BatteryCharging, HeartPulse, Triangle, Map as MapIcon, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { classifyIntent, SCENARIOS } from "@/lib/drone-scenarios";
import { CommandStatus, DroneScenario } from "@/types/drone";
import { MissionsListResponse, ScenariosListResponse } from "@/types/api_types";
import { QuickCommands } from "@/components/drone-command/quick-commands";
import Header from "@/components/header";

import dynamic from "next/dynamic";
import { Drone, Survivor } from "@/types/api_types";

const SimulationMap3D = dynamic(() => import("@/components/map/SimulationMap3D"), { ssr: false });

function parseMapMetadata(gridText: string) {
  const chargingStations: { id: string; x: number; y: number }[] = [];
  const supplyDepots: { id: string; x: number; y: number }[] = [];

  const lines = gridText.split("\n");
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Legend") || trimmed.startsWith(" ")) return;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) return;

    const y = parseInt(parts[0], 10);
    if (isNaN(y)) return;
    const content = parts[1];

    for (let x = 0; x < content.length; x++) {
      const char = content[x];
      if (char === "C") chargingStations.push({ id: `CS-${x}-${y}`, x, y });
      if (char === "D") supplyDepots.push({ id: `D-${x}-${y}`, x, y });
    }
  });
  return { chargingStations, supplyDepots };
}

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
  if (!s.detected) return "text-slate-400";
  if (s.condition === "critical") return "text-red-500";
  if (s.condition === "moderate") return "text-amber-500";
  if (s.condition === "stable") return "text-emerald-500";
  return "text-slate-400";
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case "running":  return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
    case "complete": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":   return <AlertOctagon className="h-4 w-4 text-destructive" />;
    default:         return <AlertCircle className="h-4 w-4 text-slate-500" />;
  }
};

export default function TacticalPage() {
  // Map State
  const [drones, setDrones] = useState<Drone[]>([]);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [pulse, setPulse] = useState(0);
  const [gridSize, setGridSize] = useState(20);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("3d");
  const [infra, setInfra] = useState<any>({ chargingStations: [], supplyDepots: [] });

  const cells = useMemo(() => {
    const list: { x: number; y: number }[] = [];
    for (let y = gridSize - 1; y >= 0; y -= 1) {
      for (let x = 0; x < gridSize; x += 1) list.push({ x, y });
    }
    return list;
  }, [gridSize]);

  const dronesByCell = useMemo(() => {
    const map = new Map<string, Drone[]>();
    for (const drone of drones) {
      const x = Math.round(clamp(Number(drone.position?.x), 0, gridSize - 1));
      const y = Math.round(clamp(Number(drone.position?.y), 0, gridSize - 1));
      const key = `${x}-${y}`;
      map.set(key, [...(map.get(key) ?? []), drone]);
    }
    return map;
  }, [drones, gridSize]);

  const survivorsByCell = useMemo(() => {
    const map = new Map<string, Survivor[]>();
    for (const survivor of survivors) {
      const x = Math.round(clamp(Number(survivor.position?.x), 0, gridSize - 1));
      const y = Math.round(clamp(Number(survivor.position?.y), 0, gridSize - 1));
      const key = `${x}-${y}`;
      map.set(key, [...(map.get(key) ?? []), survivor]);
    }
    return map;
  }, [survivors, gridSize]);

  useEffect(() => {
    const tick = window.setInterval(() => setPulse((n) => (n + 1) % 2), 900);
    return () => window.clearInterval(tick);
  }, []);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const [missionsData, setMissionsData] = useState<MissionsListResponse | null>(null);
  const [scenariosData, setScenariosData] = useState<ScenariosListResponse | null>(null);
  const [selectedScenario, setSelectedScenario] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const { isListening, transcript, interim, supported, start, stop } = useSpeechRecognition();
  const [voiceText, setVoiceText] = useState("");
  const [cmdStatus, setCmdStatus] = useState<CommandStatus>("idle");
  const [feedback, setFeedback] = useState("");

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

    const fetchGrid = async () => {
      try {
        const mapData = await api.world.getMap();
        setGridSize(mapData.width || 20);
        if (mapData.map) {
          const { chargingStations, supplyDepots } = parseMapMetadata(mapData.map);
          setInfra({ chargingStations, supplyDepots });
        }
      } catch (e) {
        console.error("Failed to fetch map dimensions", e);
      }
    };
    fetchGrid();

    const mapId = setInterval(fetchMap, 800);
    const missionId = setInterval(fetchMissions, 5000);
    return () => { clearInterval(mapId); clearInterval(missionId); };
  }, []);

  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [missionLogs, setMissionLogs] = useState<LogEvent[]>([]);
  const [streamActive, setStreamActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [missionLogs]);

  useEffect(() => {
    if (!activeMissionId) return;

    const origin = getBackendOrigin();
    const eventSource = new EventSource(`${origin}/mission/${activeMissionId}/stream`);
    setStreamActive(true);

    const handleEvent = (type: LogEvent["type"], data: any) => {
      setMissionLogs((prev) => [
        ...prev,
        {
          ...data,
          id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toLocaleTimeString(),
          type,
        } as LogEvent
      ]);
    };

    eventSource.addEventListener("log", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      handleEvent("log", data);
    });

    eventSource.addEventListener("step", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      handleEvent("step", data);
    });

    eventSource.addEventListener("error", (e) => {
      const msgEvent = e as MessageEvent;
      if (!msgEvent.data || msgEvent.data === "undefined") return;
      try {
        const data = JSON.parse(msgEvent.data);
        handleEvent("error", data);
      } catch (err) {}
    });

    eventSource.addEventListener("complete", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      handleEvent("complete", data);
      eventSource.close();
      setStreamActive(false);
      
      // Optionally fetch updated active sorties 
      try { api.missions.list().then((res) => setMissionsData(res)); } catch(e){}
    });

    eventSource.onmessage = (e) => {
      if (!e.data || e.data === "undefined") return;
      try {
        const data = JSON.parse(e.data);
        if (data.type && !["log", "step", "error", "complete"].includes(data.type)) {
          handleEvent("log", { message: data.message || JSON.stringify(data) });
        }
      } catch (err) {}
    };

    eventSource.onerror = (err) => {
      setStreamActive(false);
    };

    return () => {
      eventSource.close();
      setStreamActive(false);
    };
  }, [activeMissionId]);

  const handleStartMission = async () => {
    if (!selectedScenario) return;
    try {
      setIsStarting(true);
      const res = await api.missions.create({ scenarios: selectedScenario });
      setSelectedScenario("");
      if (res && res.mission_id) {
         setActiveMissionId(res.mission_id);
         setMissionLogs([]);
      }
    } catch (e) {} finally {
      setIsStarting(false);
    }
  };

  const executeCommand = useCallback(async (text: string) => {
    if (!text.trim() || cmdStatus === "executing" || cmdStatus === "processing") return;
    const scenarioId = classifyIntent(text);
    const scenario = SCENARIOS[scenarioId];
    setCmdStatus("processing");
    setFeedback("Classifying intent�");
    await new Promise((r) => setTimeout(r, 600));

    if (scenarioId === "unknown") {
      setFeedback(`Could not map "${text}" to a drone command.`);
      setCmdStatus("error");
      setTimeout(() => { setCmdStatus("idle"); setFeedback(""); }, 3000);
      return;
    }

    setCmdStatus("executing");
    setFeedback(`Executing: ${scenario.label}`);
    
    for (let i = 0; i < scenario.steps.length; i++) {
      await new Promise((r) => setTimeout(r, 700 + Math.random() * 400));
    }

    setCmdStatus("done");
    setFeedback(`${scenario.label} � complete`);
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
  const sortedMissions = missionsData?.missions?.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()) ?? [];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-slate-300 font-mono overflow-hidden">
      
      {/* ---------- HEADER ---------- */}
      <Header />

      {/* ---------- MAIN WORKSPACE ---------- */}
      <div className="relative flex flex-1 overflow-hidden">
        
          {/* Map Body */}
          <div className="absolute inset-0 z-0 bg-slate-950 flex flex-col">
            <div className="relative flex-1">
              <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
                <div className="flex rounded-md border border-cyan-900/50 bg-black/60 p-1 backdrop-blur-md">
                    <button
                      type="button"
                      onClick={() => setViewMode("2d")}
                      className={"rounded px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase transition-colors " + (viewMode === "2d" ? "bg-cyan-500/20 text-cyan-300" : "text-slate-500 hover:text-cyan-400 hover:bg-cyan-950/40")}
                    >
                      2D Grid
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("3d")}
                      className={"rounded px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase transition-colors " + (viewMode === "3d" ? "bg-cyan-500/20 text-cyan-300" : "text-slate-500 hover:text-cyan-400 hover:bg-cyan-950/40")}
                    >
                      3D Map
                    </button>
                </div>
              </div>

              {viewMode === "2d" ? (
                <div className="absolute inset-0 flex items-center justify-center p-8 bg-slate-950/80 overflow-auto">
                  <div className="flex justify-center min-w-[400px] w-full max-w-[800px] aspect-square mx-auto my-auto">
                    <div
                      className="grid gap-px rounded-md bg-slate-800/80 p-px w-full h-full"
                      style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
                    >
                    {cells.map((cell) => {
                      const key = `${cell.x}-${cell.y}`;
                      const cellDrones = dronesByCell.get(key) ?? [];
                      const cellSurvivors = survivorsByCell.get(key) ?? [];
                      const isCS = infra.chargingStations.some((cs: any) => cs.x === cell.x && cs.y === cell.y);
                      const isDepot = infra.supplyDepots.some((d: any) => d.x === cell.x && d.y === cell.y);
                      const hasDrones = cellDrones.length > 0;
                      const hasSurvivors = cellSurvivors.length > 0;

                      return (
                        <div
                          key={key}
                          className={"group relative flex aspect-square items-center justify-center transition-colors " + (isCS ? "bg-emerald-950/60" : isDepot ? "bg-sky-950/60" : "bg-slate-900")}
                        >
                          {isCS && (
                            <div className="absolute left-0.5 top-0.5 flex items-center justify-center rounded bg-emerald-500/25 p-0.5 ring-1 ring-emerald-400/60">
                              <BatteryCharging className="h-3 w-3 text-emerald-400" />
                            </div>
                          )}
                          {isDepot && (
                            <div className="absolute bottom-0.5 right-0.5 flex items-center justify-center rounded bg-sky-500/25 p-0.5 ring-1 ring-sky-400/60">
                              <Package className="h-3 w-3 text-sky-400" />
                            </div>
                          )}
                          {(hasSurvivors || hasDrones) && (
                            <span className="absolute inset-0 rounded-[2px] ring-1 ring-sky-400/40" />
                          )}
                          <div className="flex flex-wrap items-center justify-center gap-1 p-1">
                            {cellSurvivors.map((s) => (
                              <HeartPulse
                                key={s.survivor_id}
                                className={"h-4 w-4 drop-shadow-sm " + survivorColor(s) + " " + (!s.detected && !s.rescued ? "opacity-60" : pulse ? "opacity-100" : "opacity-90")}
                              />
                            ))}
                            {cellDrones.map((d) => (
                              <div key={d.drone_id} className="relative drop-shadow-sm">
                                <Triangle
                                  fill="currentColor"
                                  className={"h-4 w-4 " + droneColor(d.status) + " " + (d.status === "offline" ? "rotate-180" : "")}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                </div>
              ) : (
                <SimulationMap3D
                  drones={drones}
                  survivors={survivors}
                  pulse={pulse}
                  gridSize={gridSize}
                  chargingStations={infra.chargingStations}
                  supplyDepots={infra.supplyDepots}
                />
              )}

              {/* ----- MAP LEGEND ----- */}
              <div className="absolute bottom-6 left-6 z-50 bg-black/60 backdrop-blur-md border border-cyan-900/50 p-4 px-6 rounded-sm flex gap-8 text-[10px] uppercase font-mono text-slate-400 select-none shadow-[0_0_15px_rgba(8,145,178,0.15)] hidden lg:flex transition-opacity duration-300 hover:bg-black/80">
                <div className="flex flex-col gap-2.5">
                  <span className="text-cyan-500 font-bold mb-1 tracking-widest">Drones</span>
                  <div className="flex items-center gap-2"><Triangle fill="currentColor" className="h-3 w-3 text-cyan-400" /> Active</div>
                  <div className="flex items-center gap-2"><Triangle fill="currentColor" className="h-3 w-3 text-emerald-400" /> Charging</div>
                  <div className="flex items-center gap-2"><Triangle fill="currentColor" className="h-3 w-3 text-amber-400" /> Returning</div>
                  <div className="flex items-center gap-2"><Triangle fill="currentColor" className="h-3 w-3 text-red-500 rotate-180" /> Offline</div>
                </div>
                <div className="flex flex-col gap-2.5 border-l border-cyan-900/30 pl-8">
                  <span className="text-cyan-500 font-bold mb-1 tracking-widest">Survivors</span>
                  <div className="flex items-center gap-2"><HeartPulse className="h-3 w-3 text-sky-300" /> Rescued</div>
                  <div className="flex items-center gap-2"><HeartPulse className="h-3 w-3 text-emerald-500" /> Stable</div>
                  <div className="flex items-center gap-2"><HeartPulse className="h-3 w-3 text-amber-500" /> Moderate</div>
                  <div className="flex items-center gap-2"><HeartPulse className="h-3 w-3 text-red-500" /> Critical</div>
                  <div className="flex items-center gap-2"><HeartPulse className="h-3 w-3 text-slate-500 opacity-60" /> Undetected</div>
                </div>
                <div className="flex flex-col gap-2.5 border-l border-cyan-900/30 pl-8">
                  <span className="text-cyan-500 font-bold mb-1 tracking-widest">Grid Tech</span>
                  <div className="flex items-center gap-2"><BatteryCharging className="h-3 w-3 text-emerald-500" /> Charging Station</div>
                  <div className="flex items-center gap-2"><Package className="h-3 w-3 text-sky-500" /> Supply Depot</div>
                </div>
              </div>
              
              </div>
            </div>
        {/* ---------- LEFT PANEL: MISSION COMMAND ---------- */}
        <div className={cn(
          "relative z-10 flex w-80 flex-col border-r border-white/10 bg-black/95 shadow-2xl transition-all duration-300",
          leftOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          {/* Toggle Button */}
          <button 
            onClick={() => setLeftOpen(!leftOpen)}
            className="absolute -right-6 top-1/2 -translate-y-1/2 flex h-12 w-6 items-center justify-center rounded-r bg-black/60 border border-l-0 border-white/10 text-slate-400 hover:text-cyan-400"
          >
            {leftOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          <div className="flex flex-col p-6 space-y-6 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-black/20 [&::-webkit-scrollbar-thumb]:bg-cyan-950/80 [&::-webkit-scrollbar-thumb]:rounded-none hover:[&::-webkit-scrollbar-thumb]:bg-cyan-900/80">
            {/* Headers */}
            <div>
              <h2 className="text-xl font-bold text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.4)]">MISSION_CTRL</h2>
              <p className="text-[10px] tracking-widest text-slate-500 mt-1 uppercase">OP_ID: ALPHA_9</p>
            </div>

            {/* Deploy Scenario Component */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold tracking-widest text-slate-300 uppercase">Deploy Scenario</h3>
              <Select disabled={!scenariosData} value={selectedScenario} onValueChange={setSelectedScenario}>
                <SelectTrigger className="w-full h-10 text-xs capitalize bg-black/50 border border-cyan-900/50 text-cyan-100 placeholder:text-slate-600 focus:ring-cyan-500 rounded-sm">
                  <SelectValue placeholder="Select an operation..." />
                </SelectTrigger>
                <SelectContent className="z-[200] bg-slate-950 border-cyan-900 text-cyan-100">
                  {scenariosData?.scenarios.map((s) => (
                    <SelectItem key={s.name} value={s.name} className="capitalize text-xs hover:bg-cyan-900/50 focus:bg-cyan-900/50">
                      {s.name.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button 
                variant="outline"
                className="w-full h-10 text-xs tracking-widest uppercase border border-cyan-700 bg-cyan-950/30 text-cyan-400 hover:bg-cyan-900 hover:text-cyan-300 rounded-sm transition-all" 
                disabled={!selectedScenario || isStarting} 
                onClick={handleStartMission}
              >
                {isStarting ? "PROCESSING..." : <><Play className="mr-2 h-3.5 w-3.5" />LAUNCH SCENARIO</>}
              </Button>
            </div>

            {/* Voice Command Block */}
            <div className="space-y-4 border-t border-white/10 pt-6">
              <h3 className="text-xs font-semibold tracking-widest text-slate-300 uppercase flex items-center gap-2">
                <Mic className="w-4 h-4 text-cyan-400" /> Voice Override
              </h3>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" disabled={isCmdActive || !supported} onClick={handleMic}
                      className={cn("h-10 w-10 shrink-0 rounded-sm border-cyan-800 bg-cyan-950/30 text-cyan-400 hover:bg-cyan-900 transition-all", isListening && "border-green-500 bg-green-500/10 text-green-400 ring-2 ring-green-500/20 animate-pulse")}
                  >
                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                  <Input
                      placeholder='e.g. "patrol route"'
                      value={voiceText}
                      disabled={isCmdActive}
                      onChange={(e) => setVoiceText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSend()}
                      className="h-10 text-xs flex-1 bg-black/50 border-cyan-800/50 text-cyan-100 placeholder:text-cyan-800 rounded-sm focus-visible:ring-cyan-500"
                  />
                  <Button size="icon" variant="outline" disabled={isCmdActive || !voiceText.trim()} onClick={handleSend} className="h-10 w-10 shrink-0 rounded-sm border-cyan-800 bg-cyan-950/30 hover:bg-cyan-900 text-cyan-400">
                      <Send className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="h-6">
                  <p className={cn("text-[10px] uppercase tracking-widest", (!transcript && !interim) ? "text-slate-600" : "text-green-400")}>
                      {transcript || interim ? <span className="animate-pulse">{transcript}<span className="text-slate-600"> {interim}</span></span> : isListening ? "AWAITING AUDIO INPUT..." : "STANDBY"}
                  </p>
                  {feedback && (
                    <p className={cn("text-[10px] tracking-widest uppercase flex items-center gap-1.5 mt-1", cmdStatus === "error" ? "text-red-400" : cmdStatus === "done" ? "text-emerald-400" : "text-cyan-400")}>
                      {isCmdActive && <span className="h-1.5 w-1.5 bg-cyan-400 animate-pulse shrink-0" />}
                      {feedback}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Commands */}
            <div className="border-t border-white/10 pt-6">
               <h3 className="text-xs font-semibold tracking-widest text-slate-300 uppercase mb-3">Quick Actions</h3>
               {/* We wrap QuickCommands here, styling might need to be global, but we can just drop it in. */}
               <div className="opacity-80 hover:opacity-100 transition-opacity grayscale-[50%] contrast-125">
                  <QuickCommands disabled={isCmdActive} onCommand={executeCommand} />
               </div>
            </div>
            {/* Footer */}
            <div className="shrink-0 flex justify-between items-center text-[8px] text-slate-600 mt-4 tracking-widest border-t border-white/5 pt-4">
              <span>© 2024 SIREN TACTICAL</span>
              <span className="text-green-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                LINK_STABLE
              </span>
            </div>

          </div>
        </div>

        {/* Space filler to push right panel when left panel collapses */}
        <div className="flex-1" />

        {/* ---------- RIGHT PANEL: MISSION CONSOLE TERMINAL ---------- */}
        <div className={cn(
          "relative z-10 flex w-[450px] flex-col border-l border-white/10 bg-black/95 shadow-2xl transition-all duration-300",
          rightOpen ? "translate-x-0" : "translate-x-full"
        )}>
          {/* Toggle Button */}
          <button 
            onClick={() => setRightOpen(!rightOpen)}
            className="absolute -left-6 top-1/2 -translate-y-1/2 flex h-12 w-6 items-center justify-center rounded-l bg-black/60 border border-r-0 border-white/10 text-slate-400 hover:text-cyan-400"
          >
            {rightOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          <div className="flex flex-col h-full p-6 text-xs uppercase tracking-wider relative">
            
            
            {/* Active Deployments Table */}
            <div className="border-b border-white/10 pb-6 mb-6">
                  <h3 className="text-xs font-bold tracking-widest text-slate-300 uppercase mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4 text-cyan-400" /> Active Sorties
                  </h3>
                  <div className="border border-cyan-900/50 bg-black/40 rounded-sm">
                    <Table>
                        <TableHeader>
                          <TableRow className="border-cyan-900/50 hover:bg-transparent">
                            <TableHead className="text-[10px] uppercase tracking-widest h-8 px-3 text-slate-500">Scenario</TableHead>
                            <TableHead className="text-[10px] uppercase tracking-widest h-8 px-3 text-right text-slate-500">State</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedMissions.slice(0, 3).map((mission) => (
                            <TableRow key={mission.mission_id} className="border-cyan-900/30 hover:bg-cyan-950/40 transition-colors group cursor-pointer relative" onClick={() => { setActiveMissionId(mission.mission_id); setMissionLogs([]); }}>
                              <TableCell className="font-medium uppercase text-cyan-300 text-xs px-3 py-2">
                                <button onClick={(e) => { e.stopPropagation(); setActiveMissionId(mission.mission_id); setMissionLogs([]); }} className="hover:text-cyan-200 flex items-center gap-1.5 focus:outline-none">
                                  {mission.scenarios.replace(/_/g, " ")}
                                  <Terminal className="h-3.5 w-3.5 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                                <div className="text-[9px] text-slate-500 font-mono mt-0.5 w-full">{mission.mission_id.slice(0,8)}</div>
                              </TableCell>
                              <TableCell className="px-3 py-2">
                                <div className="flex items-center justify-end gap-1.5 text-[10px] uppercase font-bold tracking-wider">
                                  <span className={mission.status === "failed" ? "text-red-400" : mission.status === "complete" ? "text-green-400" : "text-blue-400"}>
                                    {mission.status}
                                  </span>
                                  {getStatusIcon(mission.status)}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {sortedMissions.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center py-6 text-[10px] uppercase tracking-widest text-slate-500">
                                NO ACTIVE SORTIES
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                  </div>
                </div>

              {/* Mission Log */}
            <div className="flex-1 flex min-h-0 flex-col">
                <div className="flex justify-between mb-4 border-b border-white/10 pb-2 shrink-0">
                   <span className="text-slate-300 font-bold tracking-widest flex items-center gap-2">
                     MISSION_LOG
                     {activeMissionId && <span className="text-cyan-500 font-mono text-[8px] border border-cyan-900/50 px-1 rounded-sm">{activeMissionId.slice(0, 8)}</span>}
                   </span>
                   {streamActive ? (
                     <span className="text-cyan-600 text-[10px] animate-pulse">RECORDING...</span>
                   ) : (
                     <span className="text-slate-600 text-[10px]">STANDBY</span>
                   )}
                </div>

<div ref={scrollRef} className="space-y-4 font-mono text-xs text-slate-400 overflow-y-auto no-scrollbar pb-6 flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-black/20 [&::-webkit-scrollbar-thumb]:bg-cyan-950/80 [&::-webkit-scrollbar-thumb]:rounded-none hover:[&::-webkit-scrollbar-thumb]:bg-cyan-900/80">
                    {!activeMissionId && (
                      <div className="text-center text-slate-500 mt-10 text-sm">NO SIGNAL // SELECT ACTIVE SORTIE</div>
                    )}

                    {missionLogs.map((log) => {
                      let colorClass = "text-slate-300";
                      let rowHtml = null;

                      if (log.type === "error") colorClass = "text-red-400";
                      if (log.type === "complete") colorClass = "text-green-400 font-bold";
                      if (log.type === "step") colorClass = "text-cyan-300";

                      if (log.type === "log" || log.type === "error" || log.type === "complete") {
                        rowHtml = (
                          <div key={log.id} className="flex gap-3 leading-relaxed tracking-wide">
                            <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                            <span className={colorClass}>{log.message || log.debrief || log.result_summary || "EVENT TRIGGERED"}</span>
                          </div>
                        );
                      } else if (log.type === "step") {
                        rowHtml = (
                          <div key={log.id} className="flex flex-col gap-2 border-l-2 border-cyan-800/80 bg-cyan-950/20 p-3 ml-1 rounded-r-sm my-2">
                            <div className="flex gap-3 text-slate-400 font-medium">
                               <span className="shrink-0 text-slate-500">[{log.timestamp}]</span>
                               <span className="text-cyan-400 font-bold uppercase">ACTION_STEP: {log.tool || log.phase}</span>
                            </div>
                            {log.reasoning && <div className="text-slate-300/90 italic leading-relaxed py-1">"{log.reasoning}"</div>}
                            {log.result_summary && <div className={`${colorClass} font-medium pt-1`}>{">"} {log.result_summary}</div>}
                        </div>
                      );
                    }
                    return rowHtml;
                  })}

                  {streamActive && (
                    <div className="flex gap-2 items-center mt-2">
                      <span className="text-slate-600 shrink-0">{">"}</span>
                      <span className="w-1.5 h-3 bg-cyan-400 animate-pulse mt-0.5"></span>
                    </div>
                  )}
                </div>
              </div>

            {/* Footer Diagnostics */}
            <div className="shrink-0 border-t border-white/5 pt-4 flex justify-between items-center text-[10px] text-slate-500">
               <div className="flex items-center gap-2">
                  <Settings className="w-3 h-3" />
                  DIAGNOSTICS
               </div>
               <span>v4.0.2-STABLE</span>
            </div>

            <div className="absolute -bottom-8 right-0 text-[8px] tracking-widest w-full flex justify-between">
                <span>ENCRYPTION_LAYER_V4</span>
                <span className="text-cyan-600">NODE_LATENCY_12MS</span>
            </div>
            
          </div>
        </div>

      </div>
    </div>
  );
}











