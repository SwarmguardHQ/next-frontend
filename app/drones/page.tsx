"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Drone } from "@/types/api_types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cpu, Wifi, Battery, Activity, Eye, RadioReceiver, Fan, Radar } from "lucide-react";

// Mock telemetry data generator for a single drone
function generateTelemetry(baseAltitude: number) {
  return {
    altitude: (baseAltitude + (Math.random() * 0.4 - 0.2)).toFixed(1),
    speed: (12.5 + (Math.random() * 0.8 - 0.4)).toFixed(1),
    rpm1: Math.floor(4500 + Math.random() * 30 - 15),
    rpm2: Math.floor(4500 + Math.random() * 30 - 15),
    rpm3: Math.floor(4500 + Math.random() * 30 - 15),
    rpm4: Math.floor(4500 + Math.random() * 30 - 15),
    pitch: (Math.random() * 3 - 1.5).toFixed(2),
    roll: (Math.random() * 2 - 1.0).toFixed(2),
    yaw: (85 + Math.random() * 1.5).toFixed(1),
  };
}

export default function DigitalTwinPage() {
  const [drones, setDrones] = useState<Drone[]>([]);
  const [selectedDrone, setSelectedDrone] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState(generateTelemetry(50));

  // Sync with real backend for drone overview
  useEffect(() => {
    const fetchDrones = async () => {
      try {
        const res = await api.world.getDrones();
        setDrones(res.drones);
        if (!selectedDrone && res.drones.length > 0) {
          setSelectedDrone(res.drones[0].drone_id);
        }
      } catch (err) {
        console.error("Failed to fetch drones", err);
      }
    };
    fetchDrones();
    const interval = setInterval(fetchDrones, 3000);
    return () => clearInterval(interval);
  }, [selectedDrone]);

  // High-frequency UI update for fake telemetry to look "impressive"
  useEffect(() => {
    const activeDrone = drones.find((d) => d.drone_id === selectedDrone);
    if (activeDrone?.status === "offline" || activeDrone?.status === "charging" || activeDrone?.status === "idle") {
      return; // Stop updating telemetry if not flying
    }

    const interval = setInterval(() => {
      setTelemetry(generateTelemetry(activeDrone?.status === "returning" ? 80 : 50));
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedDrone, drones]);

  const activeDrone = drones.find((d) => d.drone_id === selectedDrone);
  const isFlying = activeDrone?.status === "flying" || activeDrone?.status === "scanning" || activeDrone?.status === "returning" || activeDrone?.status === "delivering";
  const isOffline = activeDrone?.status === "offline";

  // Determine video based on selected drone
  const videoSrc = activeDrone?.drone_id === "D2" ? "/drone-feed2.mp4" : "/drone-feed1.mp4";

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Drone Fleet & Digital Twin</h2>
          <p className="text-muted-foreground">Live vehicle telemetry and remote hardware inspection.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 flex-1 h-full">
        {/* Left Sidebar: Drone Selector */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle>Active Fleet</CardTitle>
            <CardDescription>Select a unit for deep inspection</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2">
            {drones.map((drone) => (
              <Button
                key={drone.drone_id}
                variant={selectedDrone === drone.drone_id ? "default" : "outline"}
                className={`w-full justify-start ${
                  selectedDrone === drone.drone_id ? "bg-slate-800 hover:bg-slate-700 text-white" : ""
                }`}
                onClick={() => setSelectedDrone(drone.drone_id)}
              >
                <div className="flex items-center w-full">
                  <span className="font-mono text-xs">{drone.drone_id}</span>
                  <Badge
                    variant="outline"
                    className={`ml-auto mr-2 text-[10px] ${
                      drone.status === "offline" ? "border-red-500 text-red-500" :
                      drone.status === "charging" ? "border-green-500 text-green-500" :
                      "border-blue-500 text-blue-500"
                    }`}
                  >
                    {drone.status.toUpperCase()}
                  </Badge>
                  <div className="flex gap-1" title="Equipped Sensors">
                    {drone.sensors?.map(s => {
                      const Icon = s.type === 'visual' ? Eye : s.type === 'thermal' ? Activity : s.type === 'audio' ? RadioReceiver : Radar;
                        return (
                          <span key={s.type} title={s.type}>
                            <Icon className={`h-3 w-3 ${s.status === 'active' ? 'text-green-400' : s.status === 'not_installed' ? 'text-slate-800' : 'text-red-500'}`} />
                          </span>
                        );
                    })}
                  </div>
                </div>
              </Button>
            ))}
          </CardContent>
        </Card>

        {/* Right Main Area: Digital Twin */}
        <div className="md:col-span-3 space-y-4 flex flex-col h-full">
          {/* Top Panel: Camera Feed & 3D representation mock */}
          <Card className="bg-slate-950 overflow-hidden relative border-slate-800">
            <CardHeader className="absolute top-0 z-10 w-full bg-gradient-to-b from-black/80 to-transparent pb-8">
              <div className="flex justify-between items-center text-green-400">
                <CardTitle className="font-mono text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4" /> FLIR OPTICAL MOUNT - {activeDrone?.drone_id}
                </CardTitle>
                <div className="font-mono text-sm tracking-widest bg-black/50 px-2 py-1 rounded">
                  REC <span className={`inline-block w-2 h-2 rounded-full ${isFlying ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`}></span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 h-64 sm:h-80 flex items-center justify-center bg-slate-900 relative">
              {isOffline ? (
                <div className="text-slate-600 font-mono text-xl flex flex-col items-center gap-4">
                  <Wifi className="h-12 w-12 opacity-50" />
                  NO SIGNAL - UPLINK LOST
                </div>
              ) : isFlying ? (
                <>
                  {/* Live Video Feed Background */}
                    <div className="absolute inset-0 w-full h-full z-0 overflow-hidden pointer-events-none">
                      <video
                        key={videoSrc}
                        autoPlay
                        loop={true}
                        muted
                        playsInline
                        className="w-full h-full object-cover grayscale contrast-125 select-none"
                      >
                        <source src={videoSrc} type="video/mp4" />                        </video>
                      </div>
                    {/* Military Tint Filter over Video */}
                    <div className="absolute inset-0 bg-green-900/30 mix-blend-color z-0 pointer-events-none"></div>
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] pointer-events-none z-10"></div>

                  {/* Crosshair overlay */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                    <div className="w-16 h-16 border-2 border-green-500/50 rounded-full flex items-center justify-center">
                      <div className="w-1 h-1 bg-green-400 rounded-full animate-ping"></div>
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-[1px] bg-green-500/50"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-24 w-[1px] bg-green-500/50"></div>
                    {/* Targeting Box */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-green-500/10">
                      <div className="absolute -top-1 -left-1 w-3 h-3 border-t-[3px] border-l-[3px] border-green-400"></div>
                      <div className="absolute -top-1 -right-1 w-3 h-3 border-t-[3px] border-r-[3px] border-green-400"></div>
                      <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-[3px] border-l-[3px] border-green-400"></div>
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-[3px] border-r-[3px] border-green-400"></div>
                    </div>
                  </div>

                  <div className="absolute bottom-4 left-4 text-green-400 font-mono text-xs z-20 bg-black/60 px-2 py-1 rounded backdrop-blur-md">
                    <div>LAT: {activeDrone?.position.y.toFixed(5)}</div>
                    <div>LNG: {activeDrone?.position.x.toFixed(5)}</div>
                    <div>ALT: <span className="text-white">{telemetry.altitude}m</span></div>
                  </div>
                  <div className="absolute bottom-4 right-4 text-green-400 font-mono text-xs text-right z-20 bg-black/60 px-2 py-1 rounded backdrop-blur-md">
                    <div>SPD: {telemetry.speed}km/h</div>
                    <div>BAT: {activeDrone?.battery}%</div>
                    <div>VSYNC: {telemetry.rpm1}</div>
                  </div>
                </>
              ) : (
                <div className="text-slate-400 font-mono text-xl flex flex-col items-center gap-4">
                  <Activity className="h-12 w-12 opacity-50" />
                  OPTICS ENGAGED - GROUND MODE
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bottom Panel: Hardware Diagnostics */}
          <div className="grid gap-4 md:grid-cols-2 pb-8">

            {/* Live Gyro / Motor Speeds */}
            <Card className="bg-slate-900 border-none text-slate-300">
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-sm text-cyan-400">Rotor Telemetry</CardTitle>
              </CardHeader>
              <CardContent className="font-mono text-xs space-y-4">
                <div className="flex justify-center gap-8 items-end">
                  <div className="flex flex-col items-center w-12">
                    <Fan className={`h-6 w-6 mb-2 ${isFlying ? 'animate-spin' : ''} text-slate-500`} />
                    <span>M1</span>
                    <span className="text-cyan-300 tabular-nums">{isFlying ? telemetry.rpm1 : 0}</span>
                  </div>
                  <div className="flex flex-col items-center w-12">
                    <Fan className={`h-6 w-6 mb-2 ${isFlying ? 'animate-spin' : ''} text-slate-500`} />
                    <span>M2</span>
                    <span className="text-cyan-300 tabular-nums">{isFlying ? telemetry.rpm2 : 0}</span>
                  </div>
                  <div className="flex flex-col items-center w-12">
                    <Fan className={`h-6 w-6 mb-2 ${isFlying ? 'animate-spin' : ''} text-slate-500`} />
                    <span>M3</span>
                    <span className="text-cyan-300 tabular-nums">{isFlying ? telemetry.rpm3 : 0}</span>
                  </div>
                  <div className="flex flex-col items-center w-12">
                    <Fan className={`h-6 w-6 mb-2 ${isFlying ? 'animate-spin' : ''} text-slate-500`} />
                    <span>M4</span>
                    <span className="text-cyan-300 tabular-nums">{isFlying ? telemetry.rpm4 : 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* IMU Data */}
            <Card className="bg-slate-900 border-none text-slate-300">
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-sm text-yellow-400">Navigation / IMU</CardTitle>
              </CardHeader>
              <CardContent className="font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span>PITCH</span>
                  <span className="text-yellow-300">{isFlying ? telemetry.pitch : "0.00"}°</span>
                </div>
                <div className="flex justify-between">
                  <span>YAW</span>
                  <span className="text-yellow-300">{isFlying ? telemetry.yaw : "0.0"}°</span>
                </div>
                <div className="flex justify-between">
                  <span>ROLL</span>
                  <span className="text-yellow-300">{isFlying ? telemetry.roll : "0.00"}°</span>
                </div>
                <div className="w-full bg-slate-800 h-2 mt-4 rounded overflow-hidden">
                  <div
                    className="bg-yellow-400 h-full transition-all duration-75"
                    style={{ width: isFlying ? `${50 + (parseFloat(telemetry.pitch) * 5)}%` : '50%' }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Sub-system Health Check */}
            <Card className="bg-slate-900 border-none text-slate-300">
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-sm text-emerald-400">Subsystem Diagnostics</CardTitle>
              </CardHeader>
              <CardContent className="font-mono text-xs space-y-3">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2"><Battery className="h-4 w-4" /> Power Cell</span>
                  {activeDrone && activeDrone.battery > 20 ? (
                    <span className="text-emerald-400 font-bold">NOMINAL</span>
                  ) : (
                    <span className="text-red-500 font-bold animate-pulse">CRITICAL</span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2"><RadioReceiver className="h-4 w-4" /> Mesh Radio</span>
                  {isOffline ? (
                    <span className="text-red-500 font-bold">DISCONNECTED</span>
                  ) : (
                    <span className="text-emerald-400 font-bold">NOMINAL</span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2"><Cpu className="h-4 w-4" /> Edge Compute</span>
                  {isOffline ? (
                    <span className="text-red-500 font-bold">UNRESPONSIVE</span>
                  ) : activeDrone?.status === "scanning" ? (
                    <span className="text-blue-400 font-bold">HIGH LOAD</span>
                  ) : (
                    <span className="text-emerald-400 font-bold">NOMINAL</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Sensor Telemetry */}
            <Card className="bg-slate-900 border-none text-slate-300">
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-sm text-cyan-400 flex items-center gap-2">
                  Environment Sensors
                </CardTitle>  
              </CardHeader>
              <CardContent className="font-mono text-xs">
                {!activeDrone?.sensors || activeDrone.sensors.length === 0 ? (
                  <div className="text-slate-500 italic">No sensor telemetry available.</div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {activeDrone.sensors.map((sensor, idx) => (
                      <div key={idx} className="flex flex-col gap-1 border border-slate-800 p-2 rounded-md">
                        <div className="flex justify-between items-center text-slate-400">
                          <span className="uppercase">{sensor.type}</span>
                          <span className={`${sensor.status === 'active' ? 'text-emerald-400' : sensor.status === 'damaged' ? 'text-red-500' : sensor.status === 'not_installed' ? 'text-slate-600' : 'text-slate-500'}`}>
                            {sensor.status === 'not_installed' ? 'N/A' : sensor.status.toUpperCase()}
                          </span>
                        </div>
                        <div className={`truncate font-semibold ${sensor.status === 'not_installed' ? 'text-slate-600' : 'text-slate-200'}`} title={String(sensor.value)}>
                          {sensor.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}
