"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Drone, Survivor } from "@/types/api_types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Map, Plane, HeartPulse, BatteryCharging, Package, Activity, Navigation, Triangle } from "lucide-react";

const GRID_SIZE = 10;

const CHARGING_STATIONS = [
  { id: "CS1", x: 0, y: 0 },
  { id: "CS2", x: 9, y: 0 },
];

const SUPPLY_DEPOTS = [
  { id: "D1", x: 0, y: 0 },
  { id: "D2", x: 9, y: 9 },
];

export default function SimulationMapPage() {
  const [drones, setDrones] = useState<Drone[]>([]);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dRes, sRes] = await Promise.all([
          api.world.getDrones(),
          api.world.getSurvivors(),
        ]);
        setDrones(dRes.drones);
        // Only show detected survivors to be realistic, or show all for debug?
        // Let's show all but style undetected differently.
        setSurvivors(sRes.survivors);
      } catch (err) {
        console.error("Failed to fetch world state", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const cells = [];
  for (let y = GRID_SIZE - 1; y >= 0; y--) {
    for (let x = 0; x < GRID_SIZE; x++) {
      cells.push({ x, y });
    }
  }

  const getDroneColor = (status: string) => {
    switch(status) {
      case 'idle': return 'text-slate-400';
      case 'flying': case 'scanning': return 'text-blue-500';
      case 'returning': return 'text-orange-400';
      case 'charging': return 'text-green-400';
      case 'offline': return 'text-red-600';
      default: return 'text-blue-400';
    }
  };

  const getSurvivorColor = (s: Survivor) => {
    if (s.rescued) return "text-blue-400";
    switch (s.condition) {
      case "critical": return "text-red-500";
      case "moderate": return "text-yellow-500";
      case "stable": return "text-emerald-500";
      default: return "text-slate-400";
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Map className="h-8 w-8 text-primary" />
          Live Simulation Map
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {/* Left Side: The Map */}
        <Card className="md:col-span-3 bg-slate-950 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-200">Sector Grid (10x10)</CardTitle>
            <CardDescription className="text-slate-400">Real-time drone telemetry and survivor locations.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center p-6">
            <div 
              className="grid gap-[2px] bg-slate-800 p-[2px] rounded-lg shadow-2xl" 
              style={{
                gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
                width: '100%',
                maxWidth: '600px',
                aspectRatio: '1/1'
              }}
            >
              {cells.map((cell) => {
                const cellDrones = drones.filter(d => d.position.x === cell.x && d.position.y === cell.y);
                const cellSurvivors = survivors.filter(s => s.position.x === cell.x && s.position.y === cell.y);
                const isCS = CHARGING_STATIONS.some(cs => cs.x === cell.x && cs.y === cell.y);
                const isDepot = SUPPLY_DEPOTS.some(d => d.x === cell.x && d.y === cell.y);

                return (
                  <div 
                    key={`${cell.x}-${cell.y}`} 
                    className="bg-slate-900 relative rounded-sm flex items-center justify-center hover:bg-slate-800 transition-colors group"
                  >
                    {/* Background indicators for infrastructure */}
                    {isCS && <BatteryCharging className="absolute top-1 left-1 h-3 w-3 text-emerald-900 opacity-50" />}
                    {isDepot && <Package className="absolute bottom-1 right-1 h-3 w-3 text-blue-900 opacity-50" />}

                    {/* Cell coordinates tooltip on hover */}
                    <div className="absolute opacity-0 group-hover:opacity-100 z-10 bottom-full mb-2 bg-slate-800 text-xs text-white p-2 rounded pointer-events-none whitespace-nowrap shadow-xl">
                      Coord: ({cell.x}, {cell.y})
                      {isCS && <div>Charging Station</div>}
                      {isDepot && <div>Supply Depot</div>}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-1 p-1">
                      {/* Render Survivors First */}
                      {cellSurvivors.map(s => (
                        <div key={s.survivor_id} className="relative group/surv" title={`Survivor ${s.survivor_id}`}>
                          <HeartPulse 
                            className={`h-5 w-5 ${getSurvivorColor(s)} ${!s.detected && !s.rescued ? 'opacity-40 border border-dashed border-slate-600 rounded-full' : ''}`} 
                          />
                        </div>
                      ))}

                      {/* Render Drones */}
                      {cellDrones.map(d => (
                        <div key={d.drone_id} className="relative group/drone" title={`Drone ${d.drone_id}`}>
                          <Triangle 
                            fill="currentColor"
                            className={`h-5 w-5 ${getDroneColor(d.status)} ${d.status === 'offline' ? 'rotate-180' : ''}`} 
                          />
                          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[8px] font-bold text-slate-300">
                            {d.drone_id.split('_')[1]?.[0] || d.drone_id}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Right Side: Legend & Info */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Legend
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-2">
                <h4 className="font-semibold text-muted-foreground">Infrastructure</h4>
                <div className="flex items-center gap-2">
                  <BatteryCharging className="h-4 w-4 text-emerald-700" /> Charging Station
                </div>
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-700" /> Supply Depot
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-muted-foreground mt-4">Drones</h4>
                <div className="flex items-center gap-2">
                  <Triangle fill="currentColor" className="h-4 w-4 text-blue-500" /> Active Flight
                </div>
                <div className="flex items-center gap-2">
                  <Triangle fill="currentColor" className="h-4 w-4 text-green-400" /> Charging
                </div>
                <div className="flex items-center gap-2">
                  <Triangle fill="currentColor" className="h-4 w-4 text-red-600 rotate-180" /> Offline / Failure
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-muted-foreground mt-4">Survivors</h4>
                <div className="flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-red-500" /> Critical Condition
                </div>
                <div className="flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-yellow-500" /> Moderate
                </div>
                <div className="flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-emerald-500" /> Stable
                </div>
                <div className="flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-blue-400" /> Rescued (Supplied)
                </div>
                <div className="flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-slate-400 opacity-40 border border-dashed border-slate-600 rounded-full" /> Undetected
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Swarm Summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Drones</span>
                <span className="font-medium">{drones.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active Drones</span>
                <span className="font-medium text-green-500">{drones.filter(d => !['offline', 'idle'].includes(d.status)).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Survivors Detected</span>
                <span className="font-medium">{survivors.filter(s => s.detected).length} / {survivors.length}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}