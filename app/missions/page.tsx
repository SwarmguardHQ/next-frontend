"use client";

import { useEffect, useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type {
  MissionsListResponse, ScenariosListResponse,
} from "@/types/api_types";
import {
  AlertCircle, CheckCircle2, Clock, Play, AlertOctagon, Terminal
} from "lucide-react";

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
  const [missionsData, setMissionsData]     = useState<MissionsListResponse | null>(null);
  const [scenariosData, setScenariosData]   = useState<ScenariosListResponse | null>(null);
  const [selectedScenario, setSelectedScenario] = useState("");
  const [isLoading, setIsLoading]           = useState(true);
  const [isStarting, setIsStarting]         = useState(false);
  const [apiError, setApiError]             = useState<string | null>(null);

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

  const sortedMissions = missionsData?.missions?.sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  ) ?? [];

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Mission Control</h2>
      </div>

      {apiError && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-4 text-destructive text-sm">
          <AlertOctagon className="h-5 w-5 shrink-0" />
          {apiError}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {/* Launcher card */}
        <Card className="md:col-span-1 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Launch Mission</CardTitle>
            <CardDescription>Deploy a new swarm mission</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Select Scenario</p>
              <Select
                disabled={isLoading || !scenariosData}
                value={selectedScenario}
                onValueChange={setSelectedScenario}
              >
                <SelectTrigger className="capitalize">
                  <SelectValue placeholder="Choose a scenario..." />
                </SelectTrigger>
                <SelectContent>
                  {scenariosData?.scenarios.map((s) => (
                    <SelectItem key={s.name} value={s.name} className="capitalize">
                      {s.name.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              disabled={!selectedScenario || isStarting}
              onClick={handleStartMission}
            >
              {isStarting ? "Deploying..." : (
                <><Play className="mr-2 h-4 w-4" />Launch Mission</>
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* Missions table */}
        <div className="md:col-span-2 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Mission History</CardTitle>
              <CardDescription>Track active and previous deployments</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !missionsData ? (
                <p className="py-6 text-center text-sm text-muted-foreground animate-pulse">
                  Loading missions...
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