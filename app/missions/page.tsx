// "use client";

// import { useEffect, useState } from "react";
// import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { api } from "@/lib/mock_api";
// import type { MissionsListResponse, ScenariosListResponse, MissionListItem, Scenario } from "@/types/api_types";
// import { AlertCircle, CheckCircle2, Clock, Play, AlertOctagon, Terminal } from "lucide-react";

// export default function MissionsPage() {
//   const [missionsData, setMissionsData] = useState<MissionsListResponse | null>(null);
//   const [scenariosData, setScenariosData] = useState<ScenariosListResponse | null>(null);
  
//   const [selectedScenario, setSelectedScenario] = useState<string>("");
//   const [isLoading, setIsLoading] = useState(true);
//   const [isStarting, setIsStarting] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   const fetchData = async () => {
//     try {
//       const [missionsRes, scenariosRes] = await Promise.all([
//         api.missions.list(),
//         api.scenarios.list(),
//       ]);
//       setMissionsData(missionsRes);
//       setScenariosData(scenariosRes);
//       setError(null);
//     } catch (err: any) {
//       setError(err.message || "Failed to fetch missions and scenarios.");
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchData();
//     const interval = setInterval(fetchData, 3000); 
//     return () => clearInterval(interval);
//   }, []);

//   const handleStartMission = async () => {
//     if (!selectedScenario) return;
    
//     try {
//       setIsStarting(true);
//       await api.missions.create({ scenarios: selectedScenario });
//       // Instantly refresh the missions list after starting
//       await fetchData();
//       setSelectedScenario("");
//     } catch (err: any) {
//       setError(err.message || "Failed to start the mission.");
//     } finally {
//       setIsStarting(false);
//     }
//   };

//   const getStatusIcon = (status: string) => {
//     switch (status) {
//       case "running": return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
//       case "complete": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
//       case "failed": return <AlertOctagon className="h-4 w-4 text-destructive" />;
//       default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
//     }
//   };

//   const sortedMissions = missionsData?.missions?.sort((a, b) => {
//     return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
//   }) || [];

//   return (
//     <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
//       <div className="flex items-center justify-between space-y-2">
//         <h2 className="text-3xl font-bold tracking-tight">Mission Control</h2>
//       </div>

//       {error && (
//         <div className="bg-destructive/15 text-destructive p-4 rounded-md mb-4 flex items-center gap-2">
//           <AlertOctagon className="h-5 w-5" />
//           <p className="text-sm font-medium">{error}</p>
//         </div>
//       )}

//       <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
//         {/* Launcher Card */}
//         <Card className="md:col-span-1 border-primary/20 bg-primary/5">
//           <CardHeader>
//             <CardTitle>Launch Scenario</CardTitle>
//             <CardDescription>Deploy the swarm to a new mission</CardDescription>
//           </CardHeader>
//           <CardContent className="space-y-4">
//             <div className="space-y-2">
//               <label className="text-sm font-medium">Select Scenario</label>
//               <Select
//                 disabled={isLoading || !scenariosData}
//                 value={selectedScenario}
//                 onValueChange={setSelectedScenario}
//               >
//                 <SelectTrigger>
//                   <SelectValue placeholder="Choose a scenario..." />
//                 </SelectTrigger>
//                 <SelectContent>
//                   {scenariosData?.scenarios.map((scenario) => (
//                     <SelectItem key={scenario.name} value={scenario.name}>
//                       {scenario.name}
//                     </SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             </div>
//           </CardContent>
//           <CardFooter>
//             <Button 
//               className="w-full" 
//               disabled={!selectedScenario || isStarting}
//               onClick={handleStartMission}
//             >
//               {isStarting ? (
//                 <>Deploying...</>
//               ) : (
//                 <>
//                   <Play className="mr-2 h-4 w-4" />
//                   Launch Mission
//                 </>
//               )}
//             </Button>
//           </CardFooter>
//         </Card>

//         {/* History / Active Missions Table */}
//         <Card className="md:col-span-2 lg:col-span-3">
//           <CardHeader>
//             <CardTitle>Mission History</CardTitle>
//             <CardDescription>Track active and previous deployments</CardDescription>
//           </CardHeader>
//           <CardContent>
//             {isLoading && !missionsData ? (
//               <div className="text-center py-6 text-muted-foreground animate-pulse">
//                 Loading missions...
//               </div>
//             ) : (
//               <Table>
//                 <TableHeader>
//                   <TableRow>
//                     <TableHead>Mission ID</TableHead>
//                     <TableHead>Scenario</TableHead>
//                     <TableHead>Status</TableHead>
//                     <TableHead>Started</TableHead>
//                     <TableHead className="text-right">Actions</TableHead>
//                   </TableRow>
//                 </TableHeader>
//                 <TableBody>
//                   {sortedMissions.map((mission) => (
//                     <TableRow key={mission.mission_id}>
//                       <TableCell className="font-mono text-xs">{mission.mission_id}</TableCell>
//                       <TableCell className="font-medium capitalize text-primary">
//                         {mission.scenarios.replace(/_/g, ' ')}
//                       </TableCell>
//                       <TableCell>
//                         <div className="flex items-center gap-2">
//                           {getStatusIcon(mission.status)}
//                           <span className="capitalize">{mission.status}</span>
//                         </div>
//                       </TableCell>
//                       <TableCell>
//                         {new Date(mission.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
//                       </TableCell>
//                       <TableCell className="text-right">
//                         <Button variant="default" size="sm" asChild>
//                           <a href={`/missions/${mission.mission_id}`}>
//                             <Terminal className="mr-2 h-4 w-4" />
//                             View Logs
//                           </a>
//                         </Button>
//                       </TableCell>
//                     </TableRow>
//                   ))}
//                   {sortedMissions.length === 0 && (
//                     <TableRow>
//                       <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
//                         No missions have been deployed yet.
//                       </TableCell>
//                     </TableRow>
//                   )}
//                 </TableBody>
//               </Table>
//             )}
//           </CardContent>
//         </Card>
//       </div>
//     </div>
//   );
// }


"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/mock_api";
import type {
  MissionsListResponse, ScenariosListResponse,
} from "@/types/api_types";
import {
  AlertCircle, CheckCircle2, Clock, Play, AlertOctagon,
  Terminal, Mic, MicOff, Send,
} from "lucide-react";

import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { classifyIntent, SCENARIOS } from "@/lib/drone-scenarios";
import { CommandLog, CommandStatus, DroneScenario, TelemetryState } from "@/types/drone";
import { ScenarioSteps } from "@/components/drone-command/scenario-steps";
import { CommandHistory } from "@/components/drone-command/command-history";
import { TelemetryBar } from "@/components/drone-command/telementary-bar";
import { QuickCommands } from "@/components/drone-command/quick-commands";
import { BASE_TELEMETRY } from "@/lib/drone-scenarios";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getStatusIcon = (status: string) => {
  switch (status) {
    case "running":  return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
    case "complete": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":   return <AlertOctagon className="h-4 w-4 text-destructive" />;
    default:         return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MissionsPage() {
  // ── Mission API state ──
  const [missionsData, setMissionsData]     = useState<MissionsListResponse | null>(null);
  const [scenariosData, setScenariosData]   = useState<ScenariosListResponse | null>(null);
  const [selectedScenario, setSelectedScenario] = useState("");
  const [isLoading, setIsLoading]           = useState(true);
  const [isStarting, setIsStarting]         = useState(false);
  const [apiError, setApiError]             = useState<string | null>(null);

  // ── Voice command state ──
  const { isListening, transcript, interim, supported, start, stop } = useSpeechRecognition();
  const [voiceText, setVoiceText]           = useState("");
  const [cmdStatus, setCmdStatus]           = useState<CommandStatus>("idle");
  const [activeScenario, setActiveScenario] = useState<DroneScenario | null>(null);
  const [activeStep, setActiveStep]         = useState(0);
  const [telemetry, setTelemetry]           = useState<TelemetryState>(BASE_TELEMETRY);
  const [cmdLogs, setCmdLogs]               = useState<CommandLog[]>([]);
  const [feedback, setFeedback]             = useState("");


  // ── Fetch missions & scenarios ──
  const fetchData = async () => {
    try {
      const [mRes, sRes] = await Promise.all([
        api.missions.list(),
        api.scenarios.list(),
      ]);
      setMissionsData(mRes);
      setScenariosData(sRes);
      setApiError(null);
    } catch (err: any) {
      setApiError(err.message || "Failed to fetch data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 3000);
    return () => clearInterval(id);
  }, []);

  // ── Launch via dropdown ──
  const handleStartMission = async () => {
    if (!selectedScenario) return;
    try {
      setIsStarting(true);
      await api.missions.create({ scenarios: selectedScenario });
      await fetchData();
      setSelectedScenario("");
    } catch (err: any) {
      setApiError(err.message || "Failed to start mission.");
    } finally {
      setIsStarting(false);
    }
  };

  // ── Execute via voice / text ──
  const executeCommand = useCallback(
    async (text: string) => {
      if (!text.trim() || cmdStatus === "executing" || cmdStatus === "processing") return;

      const scenarioId = classifyIntent(text);
      const scenario   = SCENARIOS[scenarioId];

      setCmdStatus("processing");
      setFeedback("Classifying intent…");
      await new Promise((r) => setTimeout(r, 600));

      if (scenarioId === "unknown") {
        setFeedback(`Could not map "${text}" to a drone command.`);
        setCmdStatus("error");
        setTimeout(() => { setCmdStatus("idle"); setFeedback(""); }, 3000);
        return;
      }

      setActiveScenario(scenario);
      setActiveStep(0);
      setCmdStatus("executing");
      setFeedback(`Executing: ${scenario.label}`);
      const startTime = Date.now();

      for (let i = 0; i < scenario.steps.length; i++) {
        setActiveStep(i);
        await new Promise((r) => setTimeout(r, 700 + Math.random() * 400));
      }
      setActiveStep(scenario.steps.length);

      setTelemetry((prev) => ({
        ...prev,
        ...scenario.telemetry,
        battery: Math.max(prev.battery - Math.floor(Math.random() * 3 + 1), 5),
      }));

      const execTime = (Date.now() - startTime) / 1000;
      setCmdLogs((prev) =>
        [{
          id: crypto.randomUUID(),
          transcript: text,
          scenario,
          timestamp: new Date(),
          executionTime: execTime,
        }, ...prev].slice(0, 6)
      );

      setCmdStatus("done");
      setFeedback(`${scenario.label} — complete`);
      setTimeout(() => { setCmdStatus("idle"); setFeedback(""); }, 2500);
    },
    [cmdStatus]
  );

  // Auto-fire when STT stops
  useEffect(() => {
    if (!isListening && transcript && cmdStatus === "idle") {
      executeCommand(transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  const handleMic    = () => (isListening ? stop() : start());
  const handleSend   = () => { executeCommand(voiceText); setVoiceText(""); };
  const isCmdActive  = cmdStatus === "executing" || cmdStatus === "processing";

  const sortedMissions = missionsData?.missions?.sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  ) ?? [];

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Mission Control</h2>
      </div>

      {/* API error */}
      {apiError && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-4 text-destructive text-sm">
          <AlertOctagon className="h-5 w-5 shrink-0" />
          {apiError}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">

        {/* ── Launcher card ── */}
        <Card className="md:col-span-1 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Launch Mission</CardTitle>
            <CardDescription>Deploy via scenario or voice command</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Dropdown launcher */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Select Scenario</p>
              <Select
                disabled={isLoading || !scenariosData}
                value={selectedScenario}
                onValueChange={setSelectedScenario}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a scenario…" />
                </SelectTrigger>
                <SelectContent>
                  {scenariosData?.scenarios.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or use voice
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Voice / text input */}
            <div className="space-y-2">
              {/* Mic + transcript */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={isCmdActive || !supported}
                  onClick={handleMic}
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-full transition-all",
                    isListening && "border-blue-500 bg-blue-500/10 text-blue-400 ring-2 ring-blue-500/20 animate-pulse"
                  )}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                <p className={cn(
                  "flex-1 truncate text-sm",
                  !transcript && !interim ? "text-muted-foreground italic" : "text-foreground"
                )}>
                  {transcript || interim
                    ? <>{transcript}<span className="text-muted-foreground"> {interim}</span></>
                    : isListening ? "Listening…" : "Click mic or type below"
                  }
                </p>
              </div>

              {/* Text input */}
              <div className="flex gap-2">
                <Input
                  placeholder='"patrol", "return home"…'
                  value={voiceText}
                  disabled={isCmdActive}
                  onChange={(e) => setVoiceText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isCmdActive || !voiceText.trim()}
                  onClick={handleSend}
                  className="h-8 shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Feedback */}
              {feedback && (
                <p className={cn(
                  "text-xs font-mono flex items-center gap-1.5",
                  cmdStatus === "error"   ? "text-destructive" :
                  cmdStatus === "done"    ? "text-green-500"   : "text-muted-foreground"
                )}>
                  {isCmdActive && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />}
                  {feedback}
                </p>
              )}
            </div>
          </CardContent>

          <CardFooter>
            <Button
              className="w-full"
              disabled={!selectedScenario || isStarting || isCmdActive}
              onClick={handleStartMission}
            >
              {isStarting ? "Deploying…" : (
                <><Play className="mr-2 h-4 w-4" />Launch Mission</>
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* ── Right side ── */}
        <div className="md:col-span-2 lg:col-span-3 space-y-4">

          {/* Telemetry — always visible */}
          <TelemetryBar telemetry={telemetry} />

          {/* Quick commands */}
          <QuickCommands disabled={isCmdActive} onCommand={executeCommand} />

          {/* Execution trace */}
          {activeScenario && (
            <ScenarioSteps scenario={activeScenario} activeStep={activeStep} />
          )}

          {/* Voice command history */}
          <CommandHistory logs={cmdLogs} />

          {/* Mission history table */}
          <Card>
            <CardHeader>
              <CardTitle>Mission History</CardTitle>
              <CardDescription>Track active and previous deployments</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !missionsData ? (
                <p className="py-6 text-center text-sm text-muted-foreground animate-pulse">
                  Loading missions…
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mission ID</TableHead>
                      <TableHead>Scenario</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedMissions.map((mission) => (
                      <TableRow key={mission.mission_id}>
                        <TableCell className="font-mono text-xs">{mission.mission_id}</TableCell>
                        <TableCell className="font-medium capitalize text-primary">
                          {mission.scenarios.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(mission.status)}
                            <span className="capitalize">{mission.status}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(mission.started_at).toLocaleTimeString([], {
                            hour: "2-digit", minute: "2-digit", second: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="default" size="sm" asChild>
                            <a href={`/missions/${mission.mission_id}`}>
                              <Terminal className="mr-2 h-4 w-4" />
                              View Logs
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {sortedMissions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          No missions deployed yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}