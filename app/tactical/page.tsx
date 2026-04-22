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

type MapInfraItem = { id: string; x: number; y: number };

type SelectedMapItem =
  | { kind: "drone"; data: Drone }
  | { kind: "survivor"; data: Survivor }
  | { kind: "charging" | "depot"; data: MapInfraItem }
  | null;

type SelectedMapPanelPos = { x: number; y: number } | null;

import { Mic, MicOff, Settings, User, Bell, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, History, ShieldAlert, Cpu, Radar, Send, Play, Terminal, Target, AlertOctagon, CheckCircle2, Clock, AlertCircle, Package, BatteryCharging, HeartPulse, Triangle, Map as MapIcon, Wifi, Activity } from "lucide-react";
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
import { QuickCommands, INCIDENT_EVENTS } from "@/components/drone-command/quick-commands";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import dynamic from "next/dynamic";
import type { Drone, Survivor, WorldStreamSimVisual, WorldStreamTickPayload } from "@/types/api_types";
import { useWorldStream } from "@/lib/useWorldStream";
import { MesaSimPanel } from "@/components/sim/MesaSimPanel";
import { Grid2DViewport } from "@/components/map/Grid2DViewport";
import type { TacticalIsoControls, TacticalPick } from "@/components/map/TacticalIsoField";
import {
  BlockySurvivorSprite,
  BlockyDroneSprite,
  BlockyChargingSprite,
  BlockyDepotSprite,
  survivorShirtColors,
  droneBlockyColors,
} from "@/components/map/BlockyGameSprites";
import { useRouter } from "next/navigation";

const SimulationMap3D = dynamic(() => import("@/components/map/SimulationMap3D"), { ssr: false });
const TacticalIsoField = dynamic(() => import("@/components/map/TacticalIsoField"), { ssr: false });

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

    let strIndex = 0;
    let gridX = 0;
    while (strIndex < content.length) {
      if (content.startsWith("CS", strIndex)) {
        chargingStations.push({ id: `CS-${gridX}-${y}`, x: gridX, y });
        strIndex += 2;
      } else if (content.startsWith("DS", strIndex)) {
        supplyDepots.push({ id: `D-${gridX}-${y}`, x: gridX, y });
        strIndex += 2;
      } else {
        strIndex += 1;
      }
      gridX += 1;
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
  if (status === "scanning" || status === "flying" || status === "delivering") return "text-sky-400";
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
    case "running": return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
    case "complete": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed": return <AlertOctagon className="h-4 w-4 text-destructive" />;
    default: return <AlertCircle className="h-4 w-4 text-slate-500" />;
  }
};

export default function TacticalPage() {
  const router = useRouter();
  // Map State
  const [drones, setDrones] = useState<Drone[]>([]);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [pulse, setPulse] = useState(0);
  const [gridSize, setGridSize] = useState(20);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [infra, setInfra] = useState<any>({ chargingStations: [], supplyDepots: [] });
  const [selectedMapItem, setSelectedMapItem] = useState<SelectedMapItem>(null);
  const [selectedMapPanelPos, setSelectedMapPanelPos] = useState<SelectedMapPanelPos>(null);
  const mapBodyRef = useRef<HTMLDivElement>(null);
  const tacticalIsoRef = useRef<TacticalIsoControls | null>(null);

  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<typeof INCIDENT_EVENTS[0] | null>(null);
  const [eventCoords, setEventCoords] = useState<{ x: string, y: string }>({ x: "", y: "" });

  const handleEventAction = (eventId: string) => {
     const ev = INCIDENT_EVENTS.find(e => e.id === eventId);
     if (ev) {
         setPendingEvent(ev);
         setEventCoords({ x: "", y: "" });
         setEventModalOpen(true);
     }
  };

  const submitEvent = async () => {
      if (!pendingEvent || !eventCoords.x || !eventCoords.y) return;
      const parsedX = parseInt(eventCoords.x, 10);
      const parsedY = parseInt(eventCoords.y, 10);
      
      const insight = `There is a ${pendingEvent.label.toLowerCase()} at (${parsedX}, ${parsedY})`;
      
      setFeedback(`Reporting: ${insight}`);
      try {
          // Mock API Call endpoint blank
          // await fetch('/api/report-insight', { method: 'POST', body: JSON.stringify({ insight }) });
          console.log("Payload to endpoint:", JSON.stringify({ insight }));
          setTimeout(() => setFeedback(`AI Agent analyzing Swarm response to: ${insight}`), 1000);
          setTimeout(() => setFeedback(""), 5000);
      } catch (err) {
          console.error("Failed to report event", err);
          setFeedback("Failed to reach agent endpoint.");
      }
      
      setEventModalOpen(false);
      setPendingEvent(null);
  };

  const openSelectedMapItem = useCallback(
    (event: React.MouseEvent<HTMLElement>, item: NonNullable<SelectedMapItem>) => {
      const panelWidth = 224;
      const panelHeight = item.kind === "drone" ? 260 : 200;
      const margin = 12;
      const mapRect = mapBodyRef.current?.getBoundingClientRect();

      if (!mapRect) {
        setSelectedMapItem(item);
        setSelectedMapPanelPos({ x: 16, y: 16 });
        return;
      }

      let nextX = event.clientX - mapRect.left + margin;
      let nextY = event.clientY - mapRect.top + margin;

      if (nextX + panelWidth > mapRect.width - margin) {
        nextX = event.clientX - mapRect.left - panelWidth - margin;
      }
      if (nextY + panelHeight > mapRect.height - margin) {
        nextY = mapRect.height - panelHeight - margin;
      }

      nextX = clamp(nextX, margin, Math.max(margin, mapRect.width - panelWidth - margin));
      nextY = clamp(nextY, margin, Math.max(margin, mapRect.height - panelHeight - margin));

      setSelectedMapItem(item);
      setSelectedMapPanelPos({ x: nextX, y: nextY });
    },
    [],
  );

  const handleIsoPick = useCallback(
    (clientX: number, clientY: number, item: TacticalPick) => {
      const evt = { clientX, clientY } as unknown as React.MouseEvent<HTMLElement>;
      openSelectedMapItem(evt, item as NonNullable<SelectedMapItem>);
    },
    [openSelectedMapItem],
  );

  const handleIsoDeselect = useCallback(() => {
    setSelectedMapItem(null);
    setSelectedMapPanelPos(null);
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => setPulse((n) => (n + 1) % 2), 900);
    return () => window.clearInterval(tick);
  }, []);

  const [leftOpen,  setLeftOpen]  = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // [ and ] keyboard shortcuts to toggle panels
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "[") setLeftOpen((v) => !v);
      if (e.key === "]") setRightOpen((v) => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const [legendOpen, setLegendOpen] = useState(true);

  const [missionsData, setMissionsData] = useState<MissionsListResponse | null>(null);
  const [scenariosData, setScenariosData] = useState<ScenariosListResponse | null>(null);
  const [selectedScenario, setSelectedScenario] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const { isListening, transcript, interim, supported, start, stop } = useSpeechRecognition();
  const [voiceText, setVoiceText] = useState("");
  const [cmdStatus, setCmdStatus] = useState<CommandStatus>("idle");
  const [feedback, setFeedback] = useState("");

  const [simVisual, setSimVisual] = useState<WorldStreamSimVisual | null>(null);
  const [mesaBusy, setMesaBusy] = useState(false);
  const simHeat = useMemo(() => {
    const h = simVisual?.heatmap;
    return h?.length ? h : null;
  }, [simVisual]);

  const { droneData, survivorData, worldStreamLive, refetch } = useWorldStream({
    intervalMs: 500,
    pollingMs: 5000,
    onStreamTick: (p: WorldStreamTickPayload) => {
      setSimVisual(p.sim_visual ?? null);
    },
  });

  useEffect(() => {
    if (!droneData?.drones?.length) return;
    setDrones(droneData.drones);
    if (survivorData?.survivors) setSurvivors(survivorData.survivors);
  }, [droneData, survivorData]);

  const handleMesaStep = useCallback(async () => {
    setMesaBusy(true);
    try {
      await api.world.mesaStep(1);
      await refetch();
    } catch {
      /* optional Mesa */
    } finally {
      setMesaBusy(false);
    }
  }, [refetch]);

  useEffect(() => {
    const fetchMissions = async () => {
      try {
        const [mRes, scRes] = await Promise.all([api.missions.list(), api.scenarios.list()]);
        setMissionsData(mRes);
        setScenariosData(scRes);
      } catch (e) { }
    };

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

    const missionId = setInterval(fetchMissions, 5000);
    return () => {
      clearInterval(missionId);
    };
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
      } catch (err) { }
    });

    eventSource.addEventListener("complete", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      handleEvent("complete", data);
      eventSource.close();
      setStreamActive(false);
      
      // Optionally fetch updated active sorties 
      try { api.missions.list().then((res) => setMissionsData(res)); } catch (e) { }
    });

    eventSource.onmessage = (e) => {
      if (!e.data || e.data === "undefined") return;
      try {
        const data = JSON.parse(e.data);
        if (data.type && !["log", "step", "error", "complete"].includes(data.type)) {
          handleEvent("log", { message: data.message || JSON.stringify(data) });
        }
      } catch (err) { }
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
      const res = await api.missions.create({ scenarios: selectedScenario, online_mode: true });
      setSelectedScenario("");
      if (res && res.mission_id) {
         setActiveMissionId(res.mission_id);
         setMissionLogs([]);
      }
    } catch (e) { } finally {
      setIsStarting(false);
    }
  };

  const executeCommand = useCallback(async (text: string, targetPosition?: { x: number, y: number }, targetDrone?: string) => {
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

    let target: string | undefined =
      targetDrone ||
      (selectedMapItem?.kind === "drone" ? selectedMapItem.data.drone_id : undefined) ||
      drones[0]?.drone_id;
    let originalPosition = { x: 0, y: 0 };

    if (targetPosition && target) {
      setFeedback(
        `[DEMO] Sending ${target} to (${targetPosition.x}, ${targetPosition.y})`,
      );
      setDrones((prevDrones) => {
        const newDrones = [...prevDrones];
        const idx = newDrones.findIndex((d) => d.drone_id === target);
        if (idx !== -1) {
          originalPosition = { ...newDrones[idx].position };
          newDrones[idx] = {
            ...newDrones[idx],
            status: "flying",
            position: { x: targetPosition.x, y: targetPosition.y },
          };
        }
        return newDrones;
      });
    } else {
    setFeedback(`Executing: ${scenario.label}`);
    }
    
    for (let i = 0; i < scenario.steps.length; i++) {
      if (targetPosition) {
         setFeedback(`[DEMO] ${target} is performing: ${scenario.steps[i]}`);
      }
      await new Promise((r) => setTimeout(r, 700 + Math.random() * 400));
    }

    // Revert demo position
    if (targetPosition && target) {
      setDrones((prevDrones) => {
         const newDrones = [...prevDrones];
         const idx = newDrones.findIndex((d) => d.drone_id === target);
         if (idx !== -1) {
            newDrones[idx] = { 
               ...newDrones[idx], 
               status: 'idle',
               position: originalPosition 
            };
         }
         return newDrones;
       });
    }

    setCmdStatus("done");
    setFeedback(`${scenario.label} — complete`);
    setTimeout(() => { setCmdStatus("idle"); setFeedback(""); }, 2500);
  }, [cmdStatus, drones, selectedMapItem]);

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
    <>
    <div className="fixed top-16 left-0 right-0 bottom-0 flex flex-col overflow-hidden bg-background font-mono text-muted-foreground">
      {/* ---------- MAIN WORKSPACE ---------- */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        
          {/* Map Body */}
          <div ref={(node) => { if (mapBodyRef) (mapBodyRef as any).current = node; }} className="absolute inset-0 z-0 bg-slate-950 flex flex-col">
            <div className="relative flex-1">
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
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
    );
  }

  function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="text-slate-500">{label}</span>
        <span className={cn("text-slate-200", mono && "font-mono text-slate-400")}>{value}</span>
              </div>
    );
  }

              {viewMode === "2d" ? (
                <div className="absolute inset-0 z-0 flex min-h-0 flex-col bg-slate-950/90 p-2 sm:p-3">
                  <Grid2DViewport className="min-h-0 flex-1" toolbarClassName="shrink-0">
                    <div className="mx-auto aspect-square w-full max-w-[min(98vw,1600px)] min-w-[800px]">
                      <div
                        className="grid h-full w-full gap-px rounded-md bg-slate-800/80 p-px shadow-[0_0_0_1px_rgba(34,211,238,0.12)]"
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
                      const sector = [
                        { id: "sector_1", type: "School", x: 5, y: 2 },
                        { id: "sector_2", type: "Industrial", x: 12, y: 12 },
                        { id: "sector_3", type: "Residential", x: 2, y: 16 },
                        { id: "sector_4", type: "Commercial", x: 14, y: 6 },
                      ].find(s => s.x === cell.x && s.y === cell.y);

                      const heatVal =
                        simHeat != null &&
                        Array.isArray(simHeat[cell.y]) &&
                        simHeat[cell.y][cell.x] != null &&
                        Number.isFinite(simHeat[cell.y][cell.x])
                          ? Number(simHeat[cell.y][cell.x])
                          : null;

                      return (
                        <div
                          key={key}
                          onClick={() => {
                            setSelectedMapItem(null);
                            setSelectedMapPanelPos(null);
                          }}
                          title={`Cell (${cell.x}, ${cell.y})${isCS ? " · charging" : ""}${isDepot ? " · depot" : ""}${hasDrones ? " · drones" : ""}${hasSurvivors ? " · survivors" : ""}`}
                          className={
                            "group relative flex aspect-square items-center justify-center transition-colors hover:z-1 hover:ring-1 hover:ring-cyan-400/45 " +
                            (isCS ? "bg-emerald-950/60" : isDepot ? "bg-sky-950/60" : "bg-slate-900")
                          }
                        >
                          {heatVal != null && (
                            <div
                              className="pointer-events-none absolute inset-0 rounded-xs"
                              style={{
                                backgroundColor: `rgba(56, 189, 248, ${0.1 + heatVal * 0.45})`,
                              }}
                              aria-hidden
                            />
                          )}
                          {isCS && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const station = infra.chargingStations.find((cs: MapInfraItem) => cs.x === cell.x && cs.y === cell.y);
                                if (station) openSelectedMapItem(e, { kind: "charging", data: station });
                              }}
                              className="absolute left-0.5 top-0.5 flex flex-col items-center justify-center rounded bg-emerald-500/25 p-1 ring-1 ring-emerald-400/60 z-10 hover:bg-emerald-500/35"
                              title="Charging station details"
                            >
                              <BatteryCharging className="h-4 w-4 text-emerald-400" />
                            </button>
                          )}
                          {isDepot && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const depot = infra.supplyDepots.find((d: MapInfraItem) => d.x === cell.x && d.y === cell.y);
                                if (depot) openSelectedMapItem(e, { kind: "depot", data: depot });
                              }}
                              className="absolute left-0.5 top-0.5 flex flex-col items-center justify-center rounded bg-sky-500/25 p-1 ring-1 ring-sky-400/60 z-10 hover:bg-sky-500/35"
                              title="Supply depot details"
                            >
                              <Package className="h-4 w-4 text-sky-400" />
                            </button>
                          )}
                          {(hasSurvivors || hasDrones) && (
                            <span className="absolute inset-0 rounded-xs ring-1 ring-sky-400/40" />
                          )}
                          {sector && (
                            <>
                              <div
                                className="absolute pointer-events-none border-[3px] border-cyan-400 z-10 opacity-70"
                                style={{ width: "300%", height: "300%", left: "-100%", top: "-100%" }}
                              />
                              <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center">
                                <span className="text-center text-[9.5px] font-black text-cyan-400 uppercase tracking-widest leading-none bg-sky-950/90 px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(34,211,238,0.5)] border border-cyan-400/80">
                                  {sector.id.replace('sector_', 'SEC ')}
                                </span>
                              </div>
                            </>
                          )}
                          <div className="flex flex-wrap items-center justify-center gap-2 p-1 z-20 relative content-center text-center">
                            {cellSurvivors.map((s) => (
                              <button
                                key={s.survivor_id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSelectedMapItem(e, { kind: "survivor", data: s });
                                }}
                                className="flex flex-col items-center gap-0.5 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]"
                                title={`Survivor ${s.survivor_id} details`}
                              >
                                <HeartPulse
                                  className={"h-5 w-5 " + survivorColor(s) + " " + (!s.detected && !s.rescued ? "opacity-60" : pulse ? "opacity-100" : "opacity-90")}
                                />
                                <span className={"text-[8px] font-bold tracking-wider leading-none uppercase drop-shadow-md " + survivorColor(s)}>
                                  {s.survivor_id.split('_').pop()}
                                </span>
                              </button>
                            ))}
                            {cellDrones.map((d) => (
                              <button
                                key={d.drone_id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSelectedMapItem(e, { kind: "drone", data: d });
                                }}
                                className="flex flex-col items-center gap-0.5 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]"
                                title={`Drone ${d.drone_id} details`}
                              >
                                <Triangle
                                  fill="currentColor"
                                  className={"h-5 w-5 " + droneColor(d.status) + " " + (d.status === "offline" ? "rotate-180" : "")}
                                />
                                <span className={"text-[8px] font-bold tracking-wider leading-none uppercase drop-shadow-md " + droneColor(d.status)}>
                                  {d.drone_id.replace('DRONE_', '')}
                                </span>
                              </button>
                            ))}
                          </div>

            {/* Map canvas area */}
            <div className="relative min-h-0 flex-1">
              {viewMode === "2d" ? (
                <div className="absolute inset-0 z-0 flex min-h-0 flex-col">
                  <Grid2DViewport
                    className="min-h-0 flex-1"
                    toolbarClassName="shrink-0"
                    gameMode
                    isoScene
                    sceneControlRef={tacticalIsoRef}
                  >
                    <TacticalIsoField
                      ref={tacticalIsoRef}
                      gridSize={gridSize}
                      drones={drones}
                      survivors={survivors}
                      chargingStations={infra.chargingStations as MapInfraItem[]}
                      supplyDepots={infra.supplyDepots as MapInfraItem[]}
                      simHeat={simHeat}
                      pulse={pulse}
                      locationName="Disaster Zone Alpha"
                      onSelectItem={handleIsoPick}
                      onDeselect={handleIsoDeselect}
                    />
                  </Grid2DViewport>
                </div>
              ) : (
                <SimulationMap3D
                  drones={drones}
                  survivors={survivors}
                  pulse={pulse}
                  gridSize={gridSize}
                  chargingStations={infra.chargingStations}
                  supplyDepots={infra.supplyDepots}
                  simHeat={simHeat}
                />
              )}

              {/* ── Selected entity popup ── */}
              {selectedMapItem && selectedMapPanelPos && (
                <div
                  className="absolute z-50 w-64 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950/95 shadow-[0_8px_40px_rgba(0,0,0,0.85)] backdrop-blur-lg"
                  style={{ left: `${selectedMapPanelPos.x}px`, top: `${selectedMapPanelPos.y}px` }}
                >
                  {/* Popup header */}
                  <div className={cn(
                    "flex items-center justify-between px-3.5 py-2.5",
                    selectedMapItem.kind === "drone"     && "bg-sky-950/60 border-b border-sky-800/40",
                    selectedMapItem.kind === "survivor"  && "bg-amber-950/60 border-b border-amber-800/40",
                    selectedMapItem.kind === "charging"  && "bg-emerald-950/60 border-b border-emerald-800/40",
                    selectedMapItem.kind === "depot"     && "bg-cyan-950/60 border-b border-cyan-800/40",
                  )}>
                    <div>
                      <p className={cn(
                        "text-[10px] font-bold uppercase tracking-[0.18em]",
                        selectedMapItem.kind === "drone"    && "text-sky-300",
                        selectedMapItem.kind === "survivor" && "text-amber-300",
                        selectedMapItem.kind === "charging" && "text-emerald-300",
                        selectedMapItem.kind === "depot"    && "text-cyan-300",
                      )}>
                        {selectedMapItem.kind === "drone"    && selectedMapItem.data.drone_id.replace(/_/g, " ").toUpperCase()}
                        {selectedMapItem.kind === "survivor" && selectedMapItem.data.survivor_id.replace(/_/g, " ").toUpperCase()}
                        {selectedMapItem.kind === "charging" && "Charging Station"}
                        {selectedMapItem.kind === "depot"    && "Supply Depot"}
                      </p>
                      <p className="text-[9px] uppercase tracking-widest text-slate-500">
                        {selectedMapItem.kind === "drone"    && `${selectedMapItem.data.status}`}
                        {selectedMapItem.kind === "survivor" && `${selectedMapItem.data.condition}`}
                        {selectedMapItem.kind === "charging" && "Power Hub"}
                        {selectedMapItem.kind === "depot"    && "Logistics Node"}
                      </p>
                </div>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-700/60 hover:text-slate-200"
                      onClick={() => { setSelectedMapItem(null); setSelectedMapPanelPos(null); }}
                    >
                      ✕
                    </button>
                </div>

                  <div className="space-y-2 p-3.5">
                    {selectedMapItem.kind === "drone" && (() => {
                      const d = selectedMapItem.data;
                      const battColor = d.battery <= 20 ? "bg-red-500" : d.battery <= 50 ? "bg-amber-500" : "bg-emerald-500";
                      return (
                        <>
                          <InfoRow label="Battery" value={
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 w-16 rounded-full bg-slate-800 overflow-hidden">
                                <span className={cn("h-full rounded-full block transition-all", battColor)} style={{ width: `${d.battery}%` }} />
                              </span>
                              <span className={d.battery <= 20 ? "text-red-400" : d.battery <= 50 ? "text-amber-400" : "text-emerald-400"}>
                                {d.battery.toFixed(0)}%
                              </span>
                            </span>
                          } />
                          <InfoRow label="Sector"  value={d.assigned_sector ?? "—"} />
                          <InfoRow label="Grid"    value={`(${d.position.x}, ${d.position.y})`} mono />
                          <InfoRow label="Payload" value={d.payload ?? "None"} />
                          <div className="pt-1">
                            <button
                              onClick={() => router.push(`/fleet/${d.drone_id}`)}
                              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-800/60 bg-sky-950/50 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-sky-300 transition-colors hover:bg-sky-900/60"
                            >
                              <Cpu className="h-3 w-3" /> Inspect Drone
                            </button>
                </div>
                        </>
                      );
                    })()}

                    {selectedMapItem.kind === "survivor" && (() => {
                      const s = selectedMapItem.data;
                      return (
                        <>
                          <InfoRow label="Condition" value={
                            <span className={s.condition === "critical" ? "text-red-400" : s.condition === "moderate" ? "text-amber-400" : "text-emerald-400"}>
                              {s.condition.toUpperCase()}
                            </span>
                          } />
                          <InfoRow label="Detected" value={s.detected ? <span className="text-emerald-400">Yes</span> : <span className="text-slate-500">No</span>} />
                          <InfoRow label="Rescued"  value={s.rescued  ? <span className="text-sky-400">Yes</span>     : <span className="text-slate-500">Pending</span>} />
                          <InfoRow label="Grid"     value={`(${s.position.x}, ${s.position.y})`} mono />
                          {s.supplies_received.length > 0 && (
                            <InfoRow label="Supplies" value={<span className="text-sky-300">{s.supplies_received.join(", ")}</span>} />
                          )}
                        </>
                      );
                    })()}

                    {selectedMapItem.kind === "charging" && (
                      <>
                        <InfoRow label="ID"   value={selectedMapItem.data.id.toUpperCase()} />
                        <InfoRow label="Type" value={<span className="text-emerald-300">Power Hub</span>} />
                        <InfoRow label="Grid" value={`(${selectedMapItem.data.x}, ${selectedMapItem.data.y})`} mono />
                      </>
                    )}

                    {selectedMapItem.kind === "depot" && (
                      <>
                        <InfoRow label="ID"   value={selectedMapItem.data.id.toUpperCase()} />
                        <InfoRow label="Type" value={<span className="text-cyan-300">Logistics Node</span>} />
                        <InfoRow label="Grid" value={`(${selectedMapItem.data.x}, ${selectedMapItem.data.y})`} mono />
                      </>
                    )}
              </div>
            </div>
              )}

              {/* ── Map Legend (collapsible, bottom-left) ── */}
        <div className={cn(
                "absolute bottom-20 left-4 z-20 hidden flex-col overflow-hidden rounded-xl border border-slate-700/50 bg-slate-950/92 font-mono shadow-xl backdrop-blur-md transition-all duration-300 lg:flex",
                legendOpen ? "w-auto" : "w-10",
        )}>
                {/* Toggle header */}
          <button 
                  type="button"
                  onClick={() => setLegendOpen(!legendOpen)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 font-bold text-cyan-500 hover:text-cyan-300"
                >
                  <MapIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className={cn(
                    "whitespace-nowrap text-[9px] uppercase tracking-widest transition-all duration-300",
                    legendOpen ? "max-w-24 opacity-100" : "max-w-0 overflow-hidden opacity-0",
                  )}>
                    Legend
                  </span>
          </button>

                {/* Legend body */}
                <div className={cn("overflow-hidden transition-all duration-300", legendOpen ? "max-h-[420px] pb-3" : "max-h-0")}>
                  <div className="flex gap-5 px-3">

                    {/* ── Drones ── */}
                    <LegendCol title="Drones" items={[
                      {
                        icon: <BlockyDroneSprite className="h-6 w-6" {...droneBlockyColors("flying")} />,
                        ring: "bg-cyan-400",
                        label: "Active",
                        desc: "On patrol / scan",
                      },
                      {
                        icon: <BlockyDroneSprite className="h-6 w-6" {...droneBlockyColors("charging")} />,
                        ring: "bg-emerald-400",
                        label: "Charging",
                        desc: "At power hub",
                      },
                      {
                        icon: <BlockyDroneSprite className="h-6 w-6" {...droneBlockyColors("returning")} />,
                        ring: "bg-amber-400",
                        label: "Returning",
                        desc: "En route home",
                      },
                      {
                        icon: <BlockyDroneSprite className="h-6 w-6" {...droneBlockyColors("offline")} />,
                        ring: "bg-slate-500",
                        label: "Offline",
                        desc: "Inactive",
                      },
                    ]} />

                    {/* separator */}
                    <div className="w-px self-stretch bg-slate-800/60" />

                    {/* ── Survivors ── */}
                    <LegendCol title="Survivors" items={[
                      {
                        icon: <BlockySurvivorSprite shirt="#ef4444" className="h-6 w-6" />,
                        ring: "bg-red-400",
                        label: "Critical",
                        desc: "Needs rescue now",
                      },
                      {
                        icon: <BlockySurvivorSprite shirt="#f97316" className="h-6 w-6" />,
                        ring: "bg-orange-400",
                        label: "Moderate",
                        desc: "Stable for now",
                      },
                      {
                        icon: <BlockySurvivorSprite shirt="#22c55e" className="h-6 w-6" />,
                        ring: "bg-emerald-400",
                        label: "Stable",
                        desc: "Low urgency",
                      },
                      {
                        icon: <BlockySurvivorSprite shirt="#22d3ee" className="h-6 w-6" />,
                        ring: "bg-sky-400",
                        label: "Rescued",
                        desc: "Mission complete",
                      },
                      {
                        icon: <BlockySurvivorSprite shirt="#475569" className="h-6 w-6" dimmed />,
                        ring: "bg-slate-600",
                        label: "Undetected",
                        desc: "Not yet found",
                      },
                    ]} />

                    {/* separator */}
                    <div className="w-px self-stretch bg-slate-800/60" />

                    {/* ── Infrastructure ── */}
                    <LegendCol title="Infrastructure" items={[
                      {
                        icon: <BlockyChargingSprite className="h-6 w-6" />,
                        ring: "bg-emerald-500",
                        label: "Charging Station",
                        desc: "Drone power hub",
                      },
                      {
                        icon: <BlockyDepotSprite className="h-6 w-6" />,
                        ring: "bg-sky-400",
                        label: "Supply Depot",
                        desc: "Logistics node",
                      },
                    ]} />

                  </div>
                </div>
              </div>

              {/* ── View mode toggle — centered bottom ── */}
              <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
                <div className="flex items-center gap-1 rounded-full border border-slate-700/60 bg-slate-950/85 p-1 shadow-[0_4px_24px_rgba(0,0,0,0.6)] backdrop-blur-md">
                  {(["2d", "3d"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      className={cn(
                        "rounded-full px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all duration-200",
                        viewMode === mode
                          ? "bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                          : "text-slate-500 hover:text-slate-300",
                      )}
                    >
                      {mode === "2d" ? "ISO Field" : "3D Satellite"}
                    </button>
                  ))}
                </div>
              </div>
              
              </div>
            </div>
        {/* ── LEFT PANEL PULL TAB (visible when collapsed) ── */}
        {!leftOpen && (
          <button
            onClick={() => setLeftOpen(true)}
            title="Open Mission Control  [ [ ]"
            className="absolute left-0 top-1/2 z-30 flex -translate-y-1/2 cursor-pointer flex-col items-center gap-1.5 rounded-r-xl border border-l-0 border-slate-700/50 bg-slate-950/90 px-2 py-4 text-slate-400 shadow-xl backdrop-blur-md transition-colors hover:border-cyan-700/60 hover:bg-slate-900/95 hover:text-cyan-400"
          >
            <ChevronRight className="h-4 w-4" />
            <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-slate-500 [writing-mode:vertical-rl]">Mission Control</span>
          </button>
        )}

        {/* ---------- LEFT PANEL: MISSION COMMAND ---------- */}
        <div className={cn(
          "absolute left-0 top-0 bottom-0 z-20 flex w-72 flex-col border-r border-slate-800/50 bg-slate-950/95 shadow-2xl backdrop-blur-xl transition-transform duration-300",
          leftOpen ? "translate-x-0" : "-translate-x-full",
        )}>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-track]:bg-transparent">
            {/* Panel header */}
            <div className="flex items-start justify-between">
            <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-100">Mission Control</h2>
                <p className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-slate-600">Op-ID · Alpha-9</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest",
                  worldStreamLive ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40" : "bg-amber-950/60 text-amber-400 border border-amber-800/40"
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", worldStreamLive ? "bg-emerald-400 animate-pulse" : "bg-amber-400")} />
                  {worldStreamLive ? "Live" : "Fallback"}
                </span>
                <button
                  onClick={() => setLeftOpen(false)}
                  title="Collapse  [ [ ]"
                  className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-1 text-slate-500 transition-colors hover:border-cyan-700/40 hover:text-cyan-400"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* MesaSimPanel only shown when sim_visual data is actually available */}
            {simVisual && (
              <div className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-3">
              <MesaSimPanel
                variant="card"
                simVisual={simVisual}
                streamLive={worldStreamLive}
                mesaBusy={mesaBusy}
                onMesaStep={handleMesaStep}
                  className="border-t-0! pt-0!"
              />
            </div>
            )}

            {/* Deploy Scenario */}
            <div className="space-y-3">
              <SectionLabel>Deploy Scenario</SectionLabel>
              <Select disabled={!scenariosData} value={selectedScenario} onValueChange={setSelectedScenario}>
                <SelectTrigger className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-900/60 text-xs capitalize text-slate-200 focus:ring-cyan-500">
                  <SelectValue placeholder="Select an operation..." />
                </SelectTrigger>
                <SelectContent className="z-200 rounded-lg border-slate-700 bg-slate-950 text-slate-200">
                  {scenariosData?.scenarios.map((s) => (
                    <SelectItem key={s.name} value={s.name} className="text-xs capitalize focus:bg-slate-800">
                      {s.name.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button 
                className="h-9 w-full rounded-lg border border-cyan-700/50 bg-cyan-950/40 text-[10px] font-bold uppercase tracking-widest text-cyan-300 hover:bg-cyan-900/60 hover:text-cyan-200 disabled:opacity-40"
                variant="outline"
                disabled={!selectedScenario || isStarting} 
                onClick={handleStartMission}
              >
                {isStarting ? "Processing…" : <><Play className="mr-2 h-3.5 w-3.5" />Launch Scenario</>}
              </Button>
            </div>

            {/* Voice Command */}
            <div className="space-y-3 border-t border-slate-800/50 pt-5">
              <SectionLabel icon={<Mic className="h-3 w-3 text-cyan-400" />}>Voice Override</SectionLabel>
                <div className="flex items-center gap-2">
                <Button
                  type="button" variant="outline" size="icon"
                  disabled={isCmdActive || !supported}
                  onClick={handleMic}
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-lg border-slate-700/60 bg-slate-900/60 text-slate-400 hover:text-cyan-400 transition-all",
                    isListening && "border-emerald-600 bg-emerald-950/50 text-emerald-400 ring-2 ring-emerald-500/20 animate-pulse",
                  )}
                >
                  {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  </Button>
                  <Input
                  placeholder="e.g. patrol route"
                      value={voiceText}
                      disabled={isCmdActive}
                      onChange={(e) => setVoiceText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  className="h-9 flex-1 rounded-lg border-slate-700/60 bg-slate-900/60 text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-500"
                />
                <Button
                  size="icon" variant="outline"
                  disabled={isCmdActive || !voiceText.trim()}
                  onClick={handleSend}
                  className="h-9 w-9 shrink-0 rounded-lg border-slate-700/60 bg-slate-900/60 text-slate-400 hover:text-cyan-400"
                >
                  <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
                
              <div className="min-h-8 rounded-lg border border-slate-800/50 bg-slate-900/40 px-2.5 py-1.5">
                <p className={cn("text-[10px] uppercase tracking-widest leading-relaxed", (!transcript && !interim) ? "text-slate-600" : "text-emerald-400")}>
                  {transcript || interim
                    ? <span className="animate-pulse">{transcript}<span className="text-slate-500"> {interim}</span></span>
                    : isListening ? "Awaiting audio…" : "Standby"}
                  </p>
                  {feedback && (
                  <p className={cn(
                    "mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest",
                    cmdStatus === "error" ? "text-red-400" : cmdStatus === "done" ? "text-emerald-400" : "text-cyan-400",
                  )}>
                    {isCmdActive && <span className="h-1.5 w-1.5 shrink-0 animate-pulse bg-cyan-400" />}
                      {feedback}
                    </p>
                  )}
              </div>
            </div>

            {/* Quick Commands */}
            <div className="space-y-4 border-t border-white/10 pt-6">
              <h3 className="text-xs font-semibold tracking-widest text-slate-300 uppercase flex items-center gap-2">
                <Target className="w-4 h-4 text-red-500" /> Incident Reporting
              </h3>
              <div className="opacity-80 hover:opacity-100 transition-opacity">
                <QuickCommands disabled={isCmdActive} onEventAction={handleEventAction} />
              </div>
            </div>

            {/* Left panel footer */}
            <div className="mt-auto flex shrink-0 items-center justify-between border-t border-slate-800/50 pt-3 text-[8px] uppercase tracking-widest text-slate-700">
              <span>© 2025 SIREN Tactical</span>
              <span className="flex items-center gap-1.5 text-emerald-600">
                <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                Link Stable
              </span>
            </div>

        </div>

        {/* Space filler to push right panel when left panel collapses */}
        <div className="flex-1" />

        {/* ---------- RIGHT PANEL: MISSION CONSOLE TERMINAL ---------- */}
        <div className={cn(
          "relative z-10 flex w-112.5 flex-col border-l border-white/10 bg-black/95 shadow-2xl transition-all duration-300",
          rightOpen ? "translate-x-0" : "translate-x-full"
        )}>
          {/* Toggle Button */}
          <button
            onClick={() => setRightOpen(!rightOpen)}
            className="absolute -left-6 top-1/2 -translate-y-1/2 flex h-12 w-6 items-center justify-center rounded-l bg-black/60 border border-r-0 border-white/10 text-slate-400 hover:text-cyan-400"
          >
            {rightOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          <div className="flex flex-col h-full p-6 text-xs uppercase tracking-wider relative overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-black/20 [&::-webkit-scrollbar-thumb]:bg-cyan-950/80 [&::-webkit-scrollbar-thumb]:rounded-none hover:[&::-webkit-scrollbar-thumb]:bg-cyan-900/80">

            {/* Drone Activity Matrix */}
            <div className="border-b border-white/10 pb-6 mb-6">
              <h3 className="text-xs font-bold tracking-widest text-slate-300 uppercase mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" /> Swarm Task Matrix
              </h3>
              <div className="border border-cyan-900/50 bg-black/40 rounded-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="border-cyan-900/50 hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-widest h-8 px-3 text-slate-500">Drone</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-widest h-8 px-3 text-slate-500">Task / Payload</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-widest h-8 px-3 text-right text-slate-500">Pos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drones.map((drone) => {
                      let currentTask = null;
                      const droneName = drone.drone_id.toUpperCase();
                      for (let i = missionLogs.length - 1; i >= 0; i--) {
                        const log = missionLogs[i];
                        if (log.reasoning && log.reasoning.includes(droneName)) {
                          currentTask = log.reasoning;
                          break;
                        }
                        if (log.message && log.message.includes(droneName)) {
                          currentTask = log.message;
                          break;
                        }
                      }

                      if (currentTask) {
                        const lowerLog = currentTask.toLowerCase();
                        if (lowerLog.includes("anomaly detected") && lowerLog.includes("offline")) {
                          currentTask = "Recover offline drone";
                        } else if (lowerLog.includes("executing won claim on 'sector_")) {
                          const m = currentTask.match(/sector_(\d+)/i);
                          currentTask = m ? `Scan Sector ${m[1]}` : "Scan Sector";
                        } else if (lowerLog.includes("relay") && lowerLog.includes("deployed to")) {
                          currentTask = "Deploy relay drone";
                        } else if (lowerLog.includes("rescue directive:")) {
                          const mMatch = currentTask.match(/→\s*(S\d+)\s*\(([^)]+)\)/i);
                          if (mMatch) {
                            const payloadFormatted = mMatch[2] === "medical_kit" ? "Medical Kit" : mMatch[2].charAt(0).toUpperCase() + mMatch[2].slice(1).toLowerCase();
                            currentTask = `Rescue ${mMatch[1].toUpperCase()} (${payloadFormatted})`;
                          } else {
                            currentTask = "Rescue Survivor";
                          }
                        } else if (lowerLog.includes("auto-recharge triggered")) {
                          currentTask = "Recharge drone battery";
                        } else if (lowerLog.includes("rescuing s")) {
                          const m = currentTask.match(/rescuing\s+(S\d+)/i);
                          currentTask = m ? `Rescuing ${m[1].toUpperCase()}` : "Rescuing Survivor";
                        } else if (lowerLog.includes("scanning sector")) {
                          const m = currentTask.match(/scanning\s+sector\s+(\d+)/i);
                          currentTask = m ? `Scanning Sector ${m[1]}` : "Scanning Sector";
                        } else {
                          // Clean up log format: remove brackets, emojis, drone name, arrows
                          const clean = currentTask
                            .replace(/\[.*?\]/g, "")
                            .replace(/[^\x00-\x7F]/g, "")
                            .replace(droneName, "")
                            .replace(/drone_\w+/ig, "")
                            .replace(/->/g, "")
                            .trim();
                          const words = clean.split(/\s+/).filter(w => w.length > 0).slice(0, 4);
                          currentTask = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                          if (!currentTask) currentTask = "En Route";
                        }
                      }

                      return (
                      <TableRow key={drone.drone_id} className="border-cyan-900/30 hover:bg-cyan-950/40 transition-colors">
                        <TableCell className="font-bold uppercase text-cyan-300 text-[10px] px-3 py-2 w-16">
                          {drone.drone_id.replace("drone_", "")}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-[10px] text-slate-300">
                          <div className="flex flex-col gap-0.5">
                            <div>
                              <span className={cn("font-semibold", droneColor(drone.status))}>{drone.status.toUpperCase()}</span>
                              {drone.payload ? ` · ${drone.payload.replace(/_/g, " ")}` : ""}
                            </div>
                            {currentTask && (
                              <div className="text-[9px] text-slate-400 italic line-clamp-2" title={currentTask}>
                                {currentTask}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-2 text-[10px] text-slate-500 font-mono tracking-widest w-16 align-top pt-2.5 whitespace-nowrap text-right">
                          ({Math.round(drone.position.x)}, {Math.round(drone.position.y)})
                        </TableCell>
                      </TableRow>
                    )})}
                    {drones.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-6 text-[10px] uppercase tracking-widest text-slate-500">
                          NO DRONES DETECTED
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

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
                          <div className="text-[9px] text-slate-500 font-mono mt-0.5 w-full">{mission.mission_id.slice(0, 8)}</div>
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

    <Dialog open={eventModalOpen} onOpenChange={setEventModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-slate-200 pointer-events-auto sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex gap-2 items-center text-slate-100">
              {pendingEvent?.icon} Report {pendingEvent?.label} Incident
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Agents will automatically re-allocate drone swarms based on this insight input.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label htmlFor="coord-x" className="text-xs text-slate-400 font-mono tracking-wider">Coordinate X</label>
                <Input 
                   id="coord-x" 
                   type="number" 
                   value={eventCoords.x} 
                   onChange={(e) => setEventCoords({ ...eventCoords, x: e.target.value })} 
                   placeholder="12" 
                   className="bg-slate-950 border-slate-700 text-slate-100" 
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="coord-y" className="text-xs text-slate-400 font-mono tracking-wider">Coordinate Y</label>
                <Input 
                   id="coord-y" 
                   type="number" 
                   value={eventCoords.y} 
                   onChange={(e) => setEventCoords({ ...eventCoords, y: e.target.value })} 
                   placeholder="2" 
                   className="bg-slate-950 border-slate-700 text-slate-100" 
                />
              </div>
            </div>
            <div className="mt-2 p-3 bg-red-950/20 border border-red-900/50 rounded-md font-mono text-sm text-red-200/80">
              &#123;"insight": "There is a {pendingEvent?.label.toLowerCase()} at ({eventCoords.x || "0"}, {eventCoords.y || "0"})"&#125;
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEventModalOpen(false)} className="border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-800">Cancel</Button>
            <Button onClick={submitEvent} className="bg-red-600 hover:bg-red-500 text-white">Broadcast Insight</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}











