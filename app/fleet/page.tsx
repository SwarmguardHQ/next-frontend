"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { useWorldStream } from "@/lib/useWorldStream";
import type { Drone, WorldStreamSimVisual, WorldStreamTickPayload } from "@/types/api_types";
import {
    ArrowLeft, Zap, Wind, Weight, Navigation, Cpu, Radio,
    Camera, Shield, ChevronRight, Eye, Activity, RadioReceiver,
    Radar, Fan, Battery, Wifi, WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Static fleet metadata (merges with live API data) ───────────────────────

const FLEET_META: Record<string, {
    name: string; model: string; tagline: string; description: string;
    accentHex: string; accentHexLight: string; threeColor: number;
    maxSpeed: number; weightKg: number; rangeKm: number; flightTime: number;
    windResistance: string; payload: string;
    callouts: { label: string; angle: number; radius: number; yOffset: number }[];
}> = {
    DRONE_ALPHA: {
        name: "Falcon Alpha", model: "Recon MkIV", tagline: "Eyes in the sky",
        description: "Designed for extended perimeter surveillance. Equipped with a stabilised 4K gimbal, Falcon Alpha delivers crystal-clear imagery in challenging conditions with its IP54-rated enclosure.",
        accentHex: "#3b82f6", accentHexLight: "#93c5fd", threeColor: 0x3b82f6,
        maxSpeed: 18, weightKg: 1.4, rangeKm: 12, flightTime: 38, windResistance: "Level 5",
        payload: "4K Stabilised Gimbal",
        callouts: [
            { label: "4K Gimbal", angle: 45, radius: 1.6, yOffset: -0.3 },
            { label: "IMU Array", angle: 185, radius: 1.5, yOffset: 0.2 },
            { label: "GPS Module", angle: 275, radius: 1.4, yOffset: 0.4 },
        ],
    },
    DRONE_BRAVO: {
        name: "Hawk Beta", model: "Survey Pro X", tagline: "Map the unmappable",
        description: "A heavy-lift hexacopter built for precision mapping. Hawk Beta carries a full LiDAR suite and RGB camera array, generating centimetre-accurate 3D models of terrain and structures.",
        accentHex: "#10b981", accentHexLight: "#6ee7b7", threeColor: 0x10b981,
        maxSpeed: 14, weightKg: 2.1, rangeKm: 18, flightTime: 52, windResistance: "Level 6",
        payload: "LiDAR + RGB Array",
        callouts: [
            { label: "LiDAR Pod", angle: 30, radius: 1.7, yOffset: -0.4 },
            { label: "Hex Motors", angle: 155, radius: 1.6, yOffset: 0.1 },
            { label: "Data Link", angle: 265, radius: 1.5, yOffset: 0.5 },
        ],
    },
    DRONE_CHARLIE: {
        name: "Eagle Gamma", model: "Cargo Swift", tagline: "Speed when it matters",
        description: "Built for speed and payload capacity, Eagle Gamma is the fleet's supply runner. Its octocopter configuration provides redundant lift for fast point-to-point cargo delivery.",
        accentHex: "#f59e0b", accentHexLight: "#fcd34d", threeColor: 0xf59e0b,
        maxSpeed: 22, weightKg: 3.2, rangeKm: 8, flightTime: 24, windResistance: "Level 4",
        payload: "2 kg Cargo Bay",
        callouts: [
            { label: "Cargo Bay", angle: 20, radius: 1.8, yOffset: -0.5 },
            { label: "Octo Array", angle: 160, radius: 1.7, yOffset: 0.1 },
            { label: "RTK GPS", angle: 280, radius: 1.5, yOffset: 0.4 },
        ],
    },
    DRONE_DELTA: {
        name: "Osprey Delta", model: "Stealth Lite", tagline: "Silent. Swift. Decisive.",
        description: "Osprey Delta is the fleet's fastest responder. A whisper-quiet profile and thermal imaging suite make it ideal for night operations and covert surveillance.",
        accentHex: "#8b5cf6", accentHexLight: "#c4b5fd", threeColor: 0x8b5cf6,
        maxSpeed: 26, weightKg: 1.1, rangeKm: 15, flightTime: 44, windResistance: "Level 5",
        payload: "Thermal + Night Vision",
        callouts: [
            { label: "Thermal Cam", angle: 40, radius: 1.6, yOffset: -0.3 },
            { label: "Noise Damp.", angle: 170, radius: 1.5, yOffset: 0.2 },
            { label: "Stealth Body", angle: 275, radius: 1.6, yOffset: 0.3 },
        ],
    },
    DRONE_ECHO: {
        name: "Phantom Echo", model: "Signal Relay", tagline: "Never lose connection",
        description: "The backbone of the swarm's communication array. Phantom Echo acts as a mobile mesh relay, extending the operational range of the entire fleet in deep terrain.",
        accentHex: "#ec4899", accentHexLight: "#f9a8d4", threeColor: 0xec4899,
        maxSpeed: 18, weightKg: 1.6, rangeKm: 22, flightTime: 65, windResistance: "Level 4",
        payload: "High-Gain Mesh Antenna",
        callouts: [
            { label: "Mesh Antenna", angle: 45, radius: 1.6, yOffset: -0.5 },
            { label: "Signal Amp.", angle: 185, radius: 1.4, yOffset: 0.2 },
            { label: "High-Cap Battery", angle: 275, radius: 1.5, yOffset: 0.3 },
        ],
    },
};

const DEFAULT_META = {
    name: "Unknown Unit", model: "—", tagline: "No data",
    description: "No metadata available for this unit.",
    accentHex: "#64748b", accentHexLight: "#94a3b8", threeColor: 0x64748b,
    maxSpeed: 0, weightKg: 0, rangeKm: 0, flightTime: 0,
    windResistance: "—", payload: "—", callouts: [],
};

function getMeta(id: string) {
    return FLEET_META[id] ?? DEFAULT_META;
}

// ─── Telemetry generator ──────────────────────────────────────────────────────

function generateTelemetry(baseAltitude = 50) {
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

const isFlying = (status?: string) =>
    ["flying", "scanning", "returning", "delivering"].includes(status ?? "");

// ─── Three.js mesh builder ────────────────────────────────────────────────────

function buildDroneMesh(threeColor: number, motorCount = 4): THREE.Group {
    const g = new THREE.Group();
    const accent = new THREE.MeshStandardMaterial({ color: threeColor, metalness: 0.8, roughness: 0.2 });
    const body = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 1.0, roughness: 0.1 });
    const led = new THREE.MeshStandardMaterial({ color: threeColor, emissive: threeColor, emissiveIntensity: 3 });
    const prop = new THREE.MeshStandardMaterial({ color: threeColor, metalness: 0.4, roughness: 0.5, transparent: true, opacity: 0.75 });

    g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.11, 6), body)));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), accent);
    dome.position.y = 0.06; g.add(dome);
    const gim = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), dark);
    gim.position.set(0, -0.1, 0.18); g.add(gim);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 12),
        new THREE.MeshStandardMaterial({ color: 0x000010, metalness: 1, roughness: 0 }));
    lens.rotation.x = Math.PI / 2; lens.position.set(0, -0.1, 0.23); g.add(lens);

    const armCount = motorCount === 6 ? 6 : motorCount === 8 ? 8 : 4;
    for (let i = 0; i < armCount; i++) {
        const angle = (i / armCount) * Math.PI * 2;
        const ax = Math.sin(angle) * 0.72, az = Math.cos(angle) * 0.72;
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.76, 8), body);
        arm.rotation.z = Math.PI / 2; arm.rotation.y = angle;
        arm.position.set(ax * 0.48, 0, az * 0.48); g.add(arm);
        const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.065, 14), accent);
        motor.position.set(ax, 0.02, az); g.add(motor);
        for (let b = 0; b < 2; b++) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.007, 0.065), prop);
            p.rotation.y = (b * Math.PI) / 2; p.position.set(ax, 0.07, az);
            p.userData.isProp = true; g.add(p);
        }
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), led);
        l.position.set(ax, -0.04, az); g.add(l);
    }
    [Math.PI / 4, -Math.PI / 4, Math.PI * 3 / 4, -Math.PI * 3 / 4].forEach((a) => {
        const lx = Math.sin(a) * 0.22, lz = Math.cos(a) * 0.22;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.22, 6), dark);
        leg.position.set(lx, -0.16, lz); g.add(leg);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.12, 6), dark);
        foot.rotation.x = Math.PI / 2; foot.position.set(lx, -0.27, lz + 0.06); g.add(foot);
    });
    return g;
}

// ─── ShowcaseCanvas ───────────────────────────────────────────────────────────

function ShowcaseCanvas({ drone, flying }: { drone: Drone; flying: boolean }) {
    const mountRef = useRef<HTMLDivElement>(null);
    const meta = getMeta(drone.drone_id);

    useEffect(() => {
        if (!mountRef.current) return;
        const el = mountRef.current;
        const W = el.clientWidth || 600, H = el.clientHeight || 500;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(W, H); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true; el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
        const spherical = { theta: 0.3, phi: 1.1, radius: 4.5 };
        const lookAtTarget = new THREE.Vector3(0, 0.6, 0); 

        scene.add(new THREE.AmbientLight(0x1a2744, 2));
        const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(4, 6, 4); key.castShadow = true; scene.add(key);
        const fill = new THREE.DirectionalLight(meta.threeColor, 1.5); fill.position.set(-4, 1, -3); scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffffff, 0.8); rim.position.set(0, -4, -6); scene.add(rim);

        const floor = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.012, 64),
            new THREE.MeshStandardMaterial({ color: 0x0d1526, metalness: 0.95, roughness: 0.05 }));
        floor.position.y = -0.4; floor.receiveShadow = true; scene.add(floor);

        const ringMat = new THREE.MeshBasicMaterial({ color: meta.threeColor, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        const ring = new THREE.Mesh(new THREE.RingGeometry(2.15, 2.25, 64), ringMat);
        ring.rotation.x = -Math.PI / 2; ring.position.y = -0.39; scene.add(ring);

        const mesh = buildDroneMesh(meta.threeColor, 4);
        mesh.position.y = flying ? 0.6 : -0.3;scene.add(mesh);

        const timer = new THREE.Timer();
        let dragging = false, prevMouse = { x: 0, y: 0 }, autoRotate = true, raf = 0;

        const onDown = (e: MouseEvent) => { dragging = true; autoRotate = false; prevMouse = { x: e.clientX, y: e.clientY }; };
        const onUp = () => { dragging = false; };
        const onMove = (e: MouseEvent) => {
            if (!dragging) return;
            spherical.theta -= (e.clientX - prevMouse.x) * 0.012;
            spherical.phi = Math.max(0.4, Math.min(Math.PI / 2, spherical.phi + (e.clientY - prevMouse.y) * 0.012));
            prevMouse = { x: e.clientX, y: e.clientY };
        };
        const onWheel = (e: WheelEvent) => { spherical.radius = Math.max(2.5, Math.min(8, spherical.radius + e.deltaY * 0.01)); };
        el.addEventListener("mousedown", onDown); window.addEventListener("mouseup", onUp);
        el.addEventListener("mousemove", onMove); el.addEventListener("wheel", onWheel, { passive: true });

        const animate = () => {
            raf = requestAnimationFrame(animate);
            timer.update();
            const t = timer.getElapsed();
            if (autoRotate) spherical.theta += 0.004;
            camera.position.set(
                spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta),
                spherical.radius * Math.cos(spherical.phi) + 0.5,
                spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta),
            );
            camera.lookAt(lookAtTarget);
            if (flying) {
                mesh.position.y = Math.sin(t * 1.4) * 0.08 + 0.65;
                mesh.rotation.z = Math.sin(t * 0.9) * 0.03;
                mesh.children.forEach((c) => { if (c.userData.isProp) c.rotation.y += 0.4; });
            }
            ringMat.opacity = 0.3 + Math.sin(t * 2) * 0.15;
            renderer.render(scene, camera);
        };
        animate();

        const onResize = () => {
            const w = el.clientWidth, h = el.clientHeight;
            camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
        };
        window.addEventListener("resize", onResize);

        return () => {
            cancelAnimationFrame(raf);
            el.removeEventListener("mousedown", onDown); window.removeEventListener("mouseup", onUp);
            el.removeEventListener("mousemove", onMove); el.removeEventListener("wheel", onWheel);
            window.removeEventListener("resize", onResize);
            renderer.dispose(); if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drone.drone_id, flying]);

    return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
}

// ─── Fleet card ───────────────────────────────────────────────────────────────

function FleetCard({ drone, onClick }: { drone: Drone; onClick: () => void }) {
    const mountRef = useRef<HTMLDivElement>(null);
    const meta = getMeta(drone.drone_id);
    const flying = isFlying(drone.status);

    useEffect(() => {
        if (!mountRef.current) return;
        const el = mountRef.current;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(el.clientWidth, el.clientHeight); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 50);
        camera.position.set(0, 1.2, 3.8); camera.lookAt(0, 0, 0);
        scene.add(new THREE.AmbientLight(0x1a2744, 2.5));
        const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(3, 5, 4); scene.add(key);
        const acc = new THREE.DirectionalLight(meta.threeColor, 2); acc.position.set(-3, 0, -3); scene.add(acc);
        const mesh = buildDroneMesh(meta.threeColor, 4);
        if (!flying) mesh.position.y = -0.3; scene.add(mesh);
        let raf = 0, t = 0;
        const animate = () => {
            raf = requestAnimationFrame(animate); t += 0.016;
            mesh.rotation.y += 0.008;
            if (flying) { mesh.position.y = Math.sin(t * 1.3) * 0.07; mesh.children.forEach((c) => { if (c.userData.isProp) c.rotation.y += 0.35; }); }
            renderer.render(scene, camera);
        };
        animate();
        return () => { cancelAnimationFrame(raf); renderer.dispose(); if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drone.drone_id]);

    const statusColorMap: Record<string, string> = {
        flying: "#3b82f6", scanning: "#10b981", returning: "#f59e0b",
        delivering: "#f59e0b", charging: "#22c55e", idle: "#64748b", offline: "#ef4444",
    };
    const statusColor = statusColorMap[drone.status] ?? "#64748b";

    return (
        <button
            onClick={onClick}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-left transition-all duration-300 hover:border-slate-600 hover:scale-[1.02] hover:shadow-2xl"
        >
            <div ref={mountRef} className="h-36 w-full" />
            <div className="absolute inset-x-0 top-24 h-24 bg-gradient-to-b from-transparent to-slate-750 pointer-events-none" />
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{drone.status}</span>
            </div>
            <div className="px-4 pb-4 pt-1 space-y-1">
                <div className="flex items-baseline justify-between">
                    <h3 className="font-semibold text-slate-100 text-sm tracking-tight">{meta.name}</h3>
                    <span className="text-[10px] font-mono text-slate-600">{drone.drone_id}</span>
                </div>
                <p className="text-xs text-slate-500">{meta.model}</p>
                <div className="flex items-center gap-1 pt-1">
                    <div className="h-1 flex-1 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{
                            width: `${drone.battery}%`,
                            background: drone.battery > 50 ? meta.accentHex : drone.battery > 25 ? "#f59e0b" : "#ef4444",
                        }} />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{drone.battery}%</span>
                </div>
            </div>
            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="h-4 w-4" style={{ color: meta.accentHex }} />
            </div>
            <div className="absolute bottom-0 inset-x-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(90deg, transparent, ${meta.accentHex}, transparent)` }} />
        </button>
    );
}

// ─── Camera feed panel ────────────────────────────────────────────────────────

function CameraFeed({ drone, telemetry }: { drone: Drone; telem: typeof generateTelemetry; telemetry: ReturnType<typeof generateTelemetry> }) {
    const flying = isFlying(drone.status);
    const offline = drone.status === "offline";
    const videoSrc = drone.drone_id === "D2" ? "/drone-feed2.mp4" : "/drone-feed1.mp4";

    return (
        <div className="relative w-full h-full bg-slate-900 overflow-hidden rounded-xl border border-slate-800">
            {/* Header HUD */}
            <div className="absolute top-0 inset-x-0 z-20 flex justify-between items-center px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
                <span className="font-mono text-xs text-green-400 flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5" /> FLIR OPTICAL — {drone.drone_id}
                </span>
                <span className="font-mono text-xs bg-black/50 px-2 py-1 rounded text-green-400 flex items-center gap-1.5">
                    REC <span className={cn("inline-block w-2 h-2 rounded-full", flying ? "bg-red-500 animate-pulse" : "bg-slate-600")} />
                </span>
            </div>

            {offline ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-600 font-mono">
                    <WifiOff className="h-10 w-10" /> NO SIGNAL — UPLINK LOST
                </div>
            ) : flying ? (
                <>
                    <video key={videoSrc} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover grayscale contrast-125">
                        <source src={videoSrc} type="video/mp4" />
                    </video>
                    <div className="absolute inset-0 bg-green-900/30 mix-blend-color pointer-events-none" />
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] pointer-events-none z-10" />
                    {/* Crosshair */}
                    <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                        <div className="relative w-16 h-16 border-2 border-green-500/50 rounded-full flex items-center justify-center">
                            <div className="w-1 h-1 bg-green-400 rounded-full animate-ping" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-[1px] bg-green-500/50" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-24 w-[1px] bg-green-500/50" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-green-500/10">
                                {["-top-1 -left-1 border-t-[3px] border-l-[3px]", "-top-1 -right-1 border-t-[3px] border-r-[3px]",
                                    "-bottom-1 -left-1 border-b-[3px] border-l-[3px]", "-bottom-1 -right-1 border-b-[3px] border-r-[3px]"].map((cls, i) => (
                                        <div key={i} className={`absolute w-3 h-3 border-green-400 ${cls}`} />
                                    ))}
                            </div>
                        </div>
                    </div>
                    {/* Bottom HUD */}
                    <div className="absolute bottom-3 left-3 z-20 font-mono text-[10px] text-green-400 bg-black/60 px-2 py-1.5 rounded backdrop-blur-sm space-y-0.5">
                        <div>LAT: {drone.position.y.toFixed(5)}</div>
                        <div>LNG: {drone.position.x.toFixed(5)}</div>
                        <div>ALT: <span className="text-white">{telemetry.altitude}m</span></div>
                    </div>
                    <div className="absolute bottom-3 right-3 z-20 font-mono text-[10px] text-green-400 text-right bg-black/60 px-2 py-1.5 rounded backdrop-blur-sm space-y-0.5">
                        <div>SPD: {telemetry.speed}km/h</div>
                        <div>BAT: {drone.battery}%</div>
                        <div>VSYNC: {telemetry.rpm1}</div>
                    </div>
                </>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500 font-mono text-sm">
                    <Activity className="h-10 w-10 opacity-50" /> OPTICS ENGAGED — GROUND MODE
                </div>
            )}
        </div>
    );
}

// ─── Sensor icon helper ───────────────────────────────────────────────────────

function SensorIcon({ type, className }: { type: string; className?: string }) {
    const icons: Record<string, React.ReactNode> = {
        visual: <Eye className={cn("h-3 w-3", className)} />,
        thermal: <Activity className={cn("h-3 w-3", className)} />,
        audio: <RadioReceiver className={cn("h-3 w-3", className)} />,
    };
    return <>{icons[type] ?? <Radar className={cn("h-3 w-3", className)} />}</>;
}

// ─── Showcase view ────────────────────────────────────────────────────────────

function ShowcaseView({ drone, onBack }: { drone: Drone; onBack: () => void }) {
    const meta = getMeta(drone.drone_id);
    const flying = isFlying(drone.status);
    const [tab, setTab] = useState<"specs" | "systems" | "sensors" | "imu">("specs");
    const [telemetry, setTelemetry] = useState(generateTelemetry(drone.status === "returning" ? 80 : 50));

    useEffect(() => {
        if (!flying) return;
        const id = setInterval(() => setTelemetry(generateTelemetry(drone.status === "returning" ? 80 : 50)), 1000);
        return () => clearInterval(id);
    }, [flying, drone.status]);

    const specs = [
        { icon: <Wind className="h-4 w-4" />, label: "Max speed", value: `${meta.maxSpeed} m/s` },
        { icon: <Weight className="h-4 w-4" />, label: "Weight", value: `${meta.weightKg} kg` },
        { icon: <Cpu className="h-4 w-4" />, label: "Motors", value: "4×" },
        { icon: <Navigation className="h-4 w-4" />, label: "Range", value: `${meta.rangeKm} km` },
        { icon: <Zap className="h-4 w-4" />, label: "Flight time", value: `${meta.flightTime} min` },
        { icon: <Shield className="h-4 w-4" />, label: "Wind resistance", value: meta.windResistance },
        { icon: <Camera className="h-4 w-4" />, label: "Payload", value: meta.payload },
        { icon: <Radio className="h-4 w-4" />, label: "Signal", value: "95%" },
    ];

    const systems = [
        { name: "Flight Controller", health: 100 },
        { name: "GPS Module", health: 98 },
        { name: "IMU / Gyro", health: 100 },
        { name: "Battery Mgmt", health: drone.battery },
        { name: "Gimbal Control", health: 96 },
        { name: "Comms Link", health: 95 },
    ];

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300">
            {/* Top bar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0">
                <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-100 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Fleet
                </button>
                <div className="flex items-center gap-2">
                    {/* Sensor badges */}
                    {drone.sensors?.map((s) => (
                        <span key={s.type} title={`${s.type} — ${s.status}`}>
                            <SensorIcon type={s.type} className={s.status === "active" ? "text-green-400" : s.status === "not_installed" ? "text-slate-700" : "text-red-400"} />
                        </span>
                    ))}
                    <span className="text-xs font-mono text-slate-500 ml-2">{drone.drone_id}</span>
                    <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-widest"
                        style={{ color: meta.accentHex, borderColor: `${meta.accentHex}50`, background: `${meta.accentHex}15` }}
                    >
                        {drone.status}
                    </span>
                </div>
            </div>

            {/* Main */}
            <div className="flex flex-1 min-h-0">

                {/* Left: 3D + camera stacked */}
                <div className="flex-1 flex flex-col min-h-0 min-w-0"
                    style={{ background: "radial-gradient(ellipse at 50% 60%, #0d1f3c 0%, #060b14 70%)" }}>
                    {/* Camera feed — bottom half */}
                    <div className="h-70 shrink-0 p-3 border-t border-slate-800">
                        <CameraFeed drone={drone} telem={generateTelemetry} telemetry={telemetry} />
                    </div>
                    {/* 3D showcase — top half */}
                    <div className="flex-1 relative min-h-0">
                        <ShowcaseCanvas drone={drone} flying={flying} />

                        {/* Name overlay */}
                        <div className="absolute bottom-4 left-6 pointer-events-none">
                            <p className="text-3xl font-bold tracking-tighter leading-none"
                                style={{ color: meta.accentHexLight, textShadow: `0 0 40px ${meta.accentHex}80`, fontFamily: "'DM Sans', sans-serif" }}>
                                {meta.name}
                            </p>
                            <p className="text-xs text-slate-500 mt-1 font-mono">{meta.model} · {meta.tagline}</p>
                        </div>

                        {/* Callout annotations */}
                        {meta.callouts.map((c, i) => {
                            const rad = (c.angle * Math.PI) / 180;
                            const cx = 50 + Math.sin(rad) * c.radius * 11;
                            const cy = 48 - c.yOffset * 18 - Math.cos(rad) * c.radius * 5;
                            return (
                                <div key={i} className="absolute pointer-events-none animate-in fade-in duration-500"
                                    style={{ left: `${cx}%`, top: `${cy}%`, animationDelay: `${i * 150}ms` }}>
                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                        <div className="h-px w-8 opacity-60" style={{ background: meta.accentHex }} />
                                        <span className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded border"
                                            style={{ color: meta.accentHexLight, borderColor: `${meta.accentHex}40`, background: "#060b14cc" }}>
                                            {c.label}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                        <p className="absolute bottom-4 right-5 text-[10px] font-mono text-slate-700 pointer-events-none">drag to rotate</p>
                    </div>


                </div>

                {/* Right panel */}
                <div className="w-72 shrink-0 flex flex-col border-l border-slate-800 bg-slate-950 overflow-hidden">

                    {/* Description */}
                    <div className="p-5 border-b border-slate-800 shrink-0">
                        <h2 className="text-lg font-bold text-slate-100 tracking-tight mb-0.5">{meta.name}</h2>
                        <p className="text-[10px] font-mono text-slate-600 mb-2 uppercase tracking-widest">{meta.model}</p>
                        <p className="text-xs text-slate-400 leading-relaxed">{meta.description}</p>
                    </div>

                    {/* Live telemetry strip */}
                    <div className="grid grid-cols-3 border-b border-slate-800 shrink-0"
                        style={{ borderTop: `1px solid ${meta.accentHex}30` }}>
                        {[
                            { label: "ALT", value: flying ? `${telemetry.altitude}m` : "—" },
                            { label: "SPD", value: flying ? `${telemetry.speed}` : "0" },
                            { label: "BAT", value: `${drone.battery}%` },
                        ].map((item, i) => (
                            <div key={item.label} className={cn("flex flex-col items-center py-3", i < 2 && "border-r border-slate-800")}>
                                <span className="text-base font-bold font-mono leading-none" style={{ color: meta.accentHexLight }}>{item.value}</span>
                                <span className="text-[9px] font-mono text-slate-600 mt-1 tracking-widest uppercase">{item.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Battery bar */}
                    <div className="px-5 py-3 border-b border-slate-800 shrink-0">
                        <div className="flex justify-between text-[10px] mb-1.5 font-mono">
                            <span className="text-slate-500">BATTERY</span>
                            <span style={{ color: meta.accentHex }}>{drone.battery}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{
                                width: `${drone.battery}%`,
                                background: drone.battery > 50 ? `linear-gradient(90deg, ${meta.accentHex}80, ${meta.accentHex})` : drone.battery > 25 ? "#f59e0b" : "#ef4444",
                            }} />
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-slate-800 shrink-0">
                        {(["specs", "systems", "sensors", "imu"] as const).map((t) => (
                            <button key={t} onClick={() => setTab(t)}
                                className={cn("flex-1 py-2 text-[9px] font-mono tracking-widest uppercase transition-colors border-b-2",
                                    tab === t ? "text-slate-100 border-b-2" : "text-slate-600 hover:text-slate-400 border-transparent")}
                                style={tab === t ? { borderBottomColor: meta.accentHex } : {}}>
                                {t}
                            </button>
                        ))}
                    </div>

                    {/* Tab body */}
                    <div className="flex-1 overflow-y-auto">
                        {tab === "specs" && (
                            <div className="divide-y divide-slate-800/60">
                                {specs.map((s) => (
                                    <div key={s.label} className="flex items-center justify-between px-5 py-2.5">
                                        <div className="flex items-center gap-2 text-slate-500 text-xs">
                                            <span style={{ color: meta.accentHex }}>{s.icon}</span>{s.label}
                                        </div>
                                        <span className="text-xs font-mono text-slate-300">{s.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {tab === "systems" && (
                            <div className="px-5 py-4 space-y-4">
                                {systems.map((sys) => (
                                    <div key={sys.name} className="space-y-1">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-300">{sys.name}</span>
                                            <span className="font-mono" style={{ color: sys.health > 80 ? meta.accentHex : sys.health > 50 ? "#f59e0b" : "#ef4444" }}>
                                                {sys.health}%
                                            </span>
                                        </div>
                                        <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                                            <div className="h-full rounded-full" style={{
                                                width: `${sys.health}%`,
                                                background: sys.health > 80 ? meta.accentHex : sys.health > 50 ? "#f59e0b" : "#ef4444",
                                            }} />
                                        </div>
                                    </div>
                                ))}
                                {/* Rotor RPMs */}
                                <div className="pt-2 border-t border-slate-800">
                                    <p className="text-[10px] font-mono text-slate-500 mb-3 uppercase tracking-widest">Rotor RPM</p>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[telemetry.rpm1, telemetry.rpm2, telemetry.rpm3, telemetry.rpm4].map((rpm, i) => (
                                            <div key={i} className="flex flex-col items-center gap-1">
                                                <Fan className={cn("h-4 w-4 text-slate-500", flying && "animate-spin")} />
                                                <span className="text-[9px] font-mono text-slate-500">M{i + 1}</span>
                                                <span className="text-[10px] font-mono" style={{ color: meta.accentHexLight }}>{flying ? rpm : 0}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {tab === "sensors" && (
                            <div className="px-5 py-4 space-y-3">
                                {!drone.sensors?.length ? (
                                    <p className="text-xs text-slate-600 italic">No sensor data available.</p>
                                ) : drone.sensors.map((sensor, i) => (
                                    <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-xs text-slate-400 uppercase font-mono tracking-wider">
                                                <SensorIcon type={sensor.type} className={sensor.status === "active" ? "text-green-400" : "text-slate-600"} />
                                                {sensor.type}
                                            </div>
                                            <span className={cn("text-[10px] font-mono", sensor.status === "active" ? "text-green-400" : sensor.status === "damaged" ? "text-red-400" : "text-slate-600")}>
                                                {sensor.status === "not_installed" ? "N/A" : sensor.status.toUpperCase()}
                                            </span>
                                        </div>
                                        <p className={cn("text-xs font-mono truncate", sensor.status === "not_installed" ? "text-slate-700" : "text-slate-200")}>
                                            {String(sensor.value)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {tab === "imu" && (
                            <div className="px-5 py-4 space-y-4">
                                {[
                                    { label: "PITCH", value: flying ? `${telemetry.pitch}°` : "0.00°", color: "#f59e0b" },
                                    { label: "ROLL", value: flying ? `${telemetry.roll}°` : "0.00°", color: "#f59e0b" },
                                    { label: "YAW", value: flying ? `${telemetry.yaw}°` : "0.0°", color: "#f59e0b" },
                                ].map((item) => (
                                    <div key={item.label} className="space-y-1.5">
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-slate-500">{item.label}</span>
                                            <span style={{ color: item.color }}>{item.value}</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                            <div className="h-full rounded-full transition-all duration-75 bg-amber-400"
                                                style={{ width: flying && item.label === "PITCH" ? `${50 + parseFloat(telemetry.pitch) * 5}%` : "50%" }} />
                                        </div>
                                    </div>
                                ))}
                                <div className="pt-2 border-t border-slate-800 space-y-2">
                                    {[
                                        { label: "Altitude", value: flying ? `${telemetry.altitude} m` : "0 m" },
                                        { label: "Airspeed", value: flying ? `${telemetry.speed} km/h` : "0 km/h" },
                                        { label: "Position", value: `${drone.position.y.toFixed(4)}, ${drone.position.x.toFixed(4)}` },
                                    ].map((item) => (
                                        <div key={item.label} className="flex justify-between text-xs">
                                            <span className="text-slate-500">{item.label}</span>
                                            <span className="font-mono text-slate-300">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function attachDefaultSensors(d: Drone): Drone {
    return {
        ...d,
        sensors: d.sensors?.length
            ? d.sensors
            : [
                  { type: "visual", status: d.battery < 10 ? "damaged" : "active", value: "4K/60fps" },
                  { type: "thermal", status: d.battery < 10 ? "offline" : "active", value: "FLIR Boson" },
                  { type: "audio", status: "not_installed", value: "N/A" },
              ],
    };
}

export default function DroneFleetPage() {
    const [drones, setDrones] = useState<Drone[]>([]);
    const [selected, setSelected] = useState<Drone | null>(null);
    const [simVisual, setSimVisual] = useState<WorldStreamSimVisual | null>(null);

    const { droneData, worldStreamLive, apiError } = useWorldStream({
        intervalMs: 500,
        pollingMs: 5000,
        onStreamTick: (p: WorldStreamTickPayload) => {
            setSimVisual(p.sim_visual ?? null);
        },
    });

    useEffect(() => {
        if (!droneData?.drones) return;
        const dronesWithSensors = droneData.drones.map(attachDefaultSensors);
        setDrones(dronesWithSensors);
        setSelected((prev) =>
            prev ? dronesWithSensors.find((d) => d.drone_id === prev.drone_id) ?? prev : null,
        );
    }, [droneData]);

    return (
        <div className="flex h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden bg-background font-mono text-muted-foreground">
            <div className="siren-grid-bg flex min-h-0 flex-1 flex-col overflow-hidden">
            {selected ? (
                <ShowcaseView drone={selected} onBack={() => setSelected(null)} />
            ) : (
                <div className="flex flex-col h-full overflow-y-auto">
                    <div className="px-6 pt-8 pb-6 shrink-0">
                        <p className="text-[10px] font-mono tracking-[0.3em] uppercase text-cyan-400 mb-2">Ground Control · Fleet Registry</p>
                        <h1 className="text-4xl font-bold tracking-tighter text-slate-100 uppercase" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                            Drone Fleet
                        </h1>
                        <p className="text-sm text-cyan-500/70 mt-1">
                            {drones.filter((d) => isFlying(d.status)).length} active · {drones.length} registered units
                            {" · "}
                            <span className={worldStreamLive ? "text-emerald-400" : "text-amber-400/90"}>
                                {worldStreamLive ? "WORLD SSE" : apiError ? "offline" : "REST"}
                            </span>
                            {simVisual && worldStreamLive && (
                                <>
                                    {" · "}
                                    <span className="text-violet-300/90">
                                        Mesa step {simVisual.mesa_step} · cov {simVisual.mesa_coverage_pct.toFixed(0)}%
                                    </span>
                                </>
                            )}
                        </p>
                    </div>
                    {drones.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-slate-600 font-mono text-sm">
                            Loading fleet data…
                        </div>
                    ) : (
                        <div className="px-6 pb-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {drones.map((drone) => (
                                <FleetCard key={drone.drone_id} drone={drone} onClick={() => setSelected(drone)} />
                            ))}
                        </div>
                    )}
                    <div className="px-6 pb-6 text-center">
                        <p className="text-[10px] font-mono text-slate-700 tracking-widest uppercase">Select a unit to inspect</p>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}