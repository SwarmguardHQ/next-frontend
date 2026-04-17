"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ChevronLeft, Terminal, Server, AlertOctagon, CheckCircle2, Activity } from "lucide-react";
import Link from "next/link";
import type { MissionStatusResponse } from "@/types/api_types";
import { getBackendOrigin } from "@/lib/backendOrigin";
import { Wifi, WifiOff, Battery, BatteryWarning } from "lucide-react";

export type DroneState = {
  id: string;
  name: string;
  status: "online" | "offline" | "reassigning";
  battery: number;
};

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

export default function LiveMissionConsole() {
  const params = useParams();
  const missionId = params.id as string;

  const [status, setStatus] = useState<MissionStatusResponse | null>(null);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [streamActive, setStreamActive] = useState(false);
  const [drones, setDrones] = useState<DroneState[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of terminal
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Fetch initial status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await api.missions.getStatus(missionId);
        setStatus(res);
        
        // Also fetch initial drone state from the world API
        const worldRes = await api.world.getDrones();
        if (worldRes.drones) {
          const mappedDrones: DroneState[] = worldRes.drones.map((d: any) => ({
            id: d.drone_id,
            name: d.name || `Drone-${d.drone_id}`,
            status: d.status as any,
            battery: d.battery
          }));
          setDrones(mappedDrones);
        }
      } catch (err) {
        console.error("Failed to fetch mission status or drones", err);
      }
    };
    fetchStatus();
    
    // Poll status periodically until complete
    const interval = setInterval(() => {
      fetchStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [missionId]);

  useEffect(() => {
    if (!missionId) return;

    // Use direct URL to bypass Next.js proxy buffering for SSE
    const origin = getBackendOrigin();
    const eventSource = new EventSource(`${origin}/mission/${missionId}/stream`);
    setStreamActive(true);

    eventSource.onmessage = (event) => {
      // Handle generic message if needed
    };

    const handleEvent = (type: LogEvent["type"], data: any) => {
      setLogs((prev) => [
        ...prev,
        {
          ...data,
          id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toLocaleTimeString(),
          type,
        } as LogEvent
      ]);
    };

    // Standard SSE event listeners
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
      if (!msgEvent.data || msgEvent.data === "undefined") return; // Skip empty or literal "undefined"
      try {
        const data = JSON.parse(msgEvent.data);
        handleEvent("error", data);
      } catch (err) {
        console.error("Failed to parse error event data", err);
      }
    });

    eventSource.addEventListener("complete", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      handleEvent("complete", data);
      eventSource.close();
      setStreamActive(false);
    });

    // Listen for incoming drone status changes from the backend
    eventSource.addEventListener("drone_update", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setDrones((prev) =>
          prev.map((drone) => (drone.id === data.id ? { ...drone, ...data } : drone))
        );
      } catch (err) {
        console.error("Failed to parse drone_update", err);
      }
    });

    // Fallback for types that might not be mapped specifically
    eventSource.onmessage = (e) => {
      if (!e.data || e.data === "undefined") return;
      try {
        const data = JSON.parse(e.data);
        if (data.type && !["log", "step", "error", "complete"].includes(data.type)) {
          handleEvent("log", { message: data.message || JSON.stringify(data) });
        }
      } catch (err) {
        // Not JSON or missing type
      }
    };

    eventSource.onerror = (err) => {
      console.warn("SSE stream encountered an interruption, attempting to reconnect...", err);
      setStreamActive(false);
    };

  }, [missionId]);

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/tactical">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">Mission Console</h2>
        {status?.status === "running" && (
          <Badge className="ml-auto bg-blue-500 animate-pulse">Running</Badge>
        )}
        {status?.status === "complete" && (
          <Badge className="ml-auto bg-green-500">Complete</Badge>
        )}
        {status?.status === "failed" && (
          <Badge variant="destructive" className="ml-auto">Failed</Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Sidebars */}
        <div className="md:col-span-1 space-y-4">
          <Card className="h-fit">
            <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" /> Mission Specs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">ID</span>
              <span className="font-mono">{missionId}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Scenario</span>
              <span className="capitalize">{status?.scenario?.replace(/_/g, " ") || "Loading..."}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Steps Logged</span>
              <span>{status?.steps_logged || logs.filter(l => l.type === "step").length} / ?</span>
            </div>
            <div className="flex justify-between pb-2">
              <span className="text-muted-foreground">Stream Status</span>
              <span className="flex items-center gap-1">
                {streamActive ? (
                  <><Activity className="h-3 w-3 text-blue-500 animate-pulse" /> connected</>
                ) : (
                  <span className="text-muted-foreground">closed</span>
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        </div>

        {/* Live Terminal */}
        <Card className="md:col-span-2 bg-slate-950 text-green-400 border-slate-800 shadow-2xl flex flex-col" style={{ height: '600px' }}>
          <CardHeader className="border-b border-slate-800 bg-slate-900/50 pb-4">
            <CardTitle className="text-slate-100 flex items-center gap-2 text-sm font-mono">
              <Terminal className="h-4 w-4" /> 
              SIREN Coordinator Terminal :: Chain of Thought
            </CardTitle>
          </CardHeader>
          
          <CardContent 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs sm:text-sm"
          >
            {logs.length === 0 && (
              <div className="text-slate-500 flex items-center gap-2">
                <Activity className="h-4 w-4 animate-spin" /> Awaiting telemetry from {missionId}...
              </div>
            )}
            
            {logs.map((log) => {
              if (log.type === "log") {
                return (
                  <div key={log.id} className="text-slate-400 break-words whitespace-pre-wrap">
                    <span className="text-slate-600">[{log.timestamp}]</span> SYS: {log.message}
                  </div>
                );
              }

              if (log.type === "error") {
                return (
                  <div key={log.id} className="text-red-400 font-bold bg-red-950/30 p-2 rounded border border-red-900/50 flex gap-2">
                    <AlertOctagon className="h-4 w-4 shrink-0" />
                    <span>[{log.timestamp}] FATAL: {log.message}</span>
                  </div>
                );
              }

              if (log.type === "complete") {
                return (
                  <div key={log.id} className="text-green-300 font-bold bg-green-950/30 p-2 rounded border border-green-900/50">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>[{log.timestamp}] MISSION COMPLETE. DEBRIEF:</span>
                    </div>
                    <div className="text-green-400/80 font-normal whitespace-pre-wrap mt-2 pl-6">
                      {log.debrief}
                    </div>
                  </div>
                );
              }

              if (log.type === "step") {
                return (
                  <div key={log.id} className="bg-slate-900/50 border border-slate-800 rounded p-3 space-y-2">
                    <div className="flex items-center justify-between text-blue-400 font-bold">
                      <span>[{log.timestamp}] {log.phase}</span>
                    </div>
                    
                    <div className="pl-2 border-l-2 border-slate-700 space-y-2">
                      <div className="text-slate-300">
                        <span className="text-slate-500 block mb-1">=== REASONING ===</span>
                        {log.reasoning}
                      </div>

                      <div className="text-yellow-300">
                        <span className="text-slate-500 block mb-1">=== ACTION ===</span>
                        ~&gt; call_tool: {log.tool}
                      </div>

                      <div className="text-cyan-300">
                        <span className="text-slate-500 block mb-1">=== RESULT ===</span>
                        {log.result_summary}
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

