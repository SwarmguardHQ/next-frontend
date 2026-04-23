"use client";

import { useEffect, useRef, useState, use } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { useWorldStream } from "@/lib/useWorldStream";
import type { Drone } from "@/types/api_types";
import {
    ArrowLeft, Zap, Wind, Weight, Navigation, Cpu, Radio,
    Camera, Shield, Eye, Activity, WifiOff, Fan
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getMeta, isFlying, buildDroneMesh, attachDefaultSensors, generateTelemetry, SensorIcon } from "../shared";

// ─── Thermal color palette (heat 0–100 → RGB) ────────────────────────────────
function thermalColor(heat: number): [number, number, number] {
    const h = Math.max(0, Math.min(100, heat));
    const stops: [number, [number, number, number]][] = [
        [0,   [4,   6,   22]],
        [12,  [0,   0,   110]],
        [28,  [0,   60,  200]],
        [44,  [0,   200, 220]],
        [58,  [80,  255, 40]],
        [68,  [255, 255, 0]],
        [78,  [255, 120, 0]],
        [88,  [255, 28,  0]],
        [100, [255, 255, 255]],
    ];
    let i = 0;
    while (i < stops.length - 2 && stops[i + 1][0] <= h) i++;
    const [h0, c0] = stops[i];
    const [h1, c1] = stops[i + 1];
    const t = (h - h0) / Math.max(1, h1 - h0);
    return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
    ];
}

// ─── Spectral signature per condition (matches backend sensor model) ──────────
const CONDITION_RGB: Record<string, [number, number, number]> = {
    critical: [0.82, 0.18, 0.14],
    moderate: [0.74, 0.55, 0.32],
    stable:   [0.52, 0.68, 0.78],
};

// ─── Camera feed panel ────────────────────────────────────────────────────────

function CameraFeed({ drone, telemetry }: { drone: Drone; telemetry: ReturnType<typeof generateTelemetry> }) {
    const flying = isFlying(drone.status);
    const offline = drone.status === "offline";
    const [viewMode, setViewMode] = useState<"optical" | "thermal">("optical");
    // NOTE: Browsers block absolute local paths (e.g. C:\...) for security.
    // To use custom videos, place them in the 'public' folder and use relative paths.
    const videoSrc = "/rgb_video.mp4";
    const thermalSrc = "/thermal_video.mp4";

    // Real thermal canvas
    const thermalCanvasRef = useRef<HTMLCanvasElement>(null);
    const { survivorData } = useWorldStream({ intervalMs: 1500 });

    useEffect(() => {
        if (viewMode !== "thermal") return;
        const canvas = thermalCanvasRef.current;
        if (!canvas) return;

        const draw = () => {
            const parent = canvas.parentElement;
            const W = parent?.clientWidth || 400;
            const H = parent?.clientHeight || 220;
            if (canvas.width !== W || canvas.height !== H) {
                canvas.width = W;
                canvas.height = H;
            }
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            const GRID = 20;
            const survivors = survivorData?.survivors ?? [];


            const cW = W / GRID;
            const cH = H / GRID;


            // Blob detection circles around detected survivors
            for (const sv of survivors) {
                if (!sv.detected || sv.rescued) continue;
                const px = (sv.position.x + 0.5) * cW;
                const py = (sv.position.y + 0.5) * cH;
                // Outer blob ring
                ctx.strokeStyle = "rgba(255, 240, 60, 0.85)";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(px, py, (cW + cH) / 2 * 1.6, 0, Math.PI * 2);
                ctx.stroke();
                // Inner hot spot
                ctx.strokeStyle = "rgba(255,255,255,0.7)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(px, py, (cW + cH) / 2 * 0.6, 0, Math.PI * 2);
                ctx.stroke();
                // Condition label
                const condLabel = sv.condition === "critical" ? "CRIT" : sv.condition === "moderate" ? "MOD" : "STB";
                ctx.font = `bold ${Math.round(cW * 0.55)}px monospace`;
                ctx.fillStyle = "rgba(255,255,100,0.95)";
                ctx.textAlign = "center";
                ctx.fillText(condLabel, px, py - (cW + cH) / 2 * 1.9);
            }

            // Drone crosshair
            const dpx = (drone.position.x + 0.5) * cW;
            const dpy = (drone.position.y + 0.5) * cH;
            ctx.strokeStyle = "rgba(0, 255, 128, 0.9)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(dpx - cW * 1.2, dpy); ctx.lineTo(dpx + cW * 1.2, dpy);
            ctx.moveTo(dpx, dpy - cH * 1.2); ctx.lineTo(dpx, dpy + cH * 1.2);
            ctx.stroke();
            // Scan radius (THERMAL_SCAN_RADIUS ≈ 3 cells)
            ctx.strokeStyle = "rgba(0, 255, 128, 0.3)";
            ctx.setLineDash([3, 3]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(dpx, dpy, 3 * (cW + cH) / 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        };

        draw();
        const id = window.setInterval(draw, 1600);
        return () => window.clearInterval(id);
    }, [viewMode, flying, survivorData, drone.position]);

    // Nearby detected survivors for RGB panel (within 6 cells)
    const nearbyDetected = (survivorData?.survivors ?? []).filter(sv => {
        if (!sv.detected || sv.rescued) return false;
        const dx = sv.position.x - drone.position.x;
        const dy = sv.position.y - drone.position.y;
        return Math.sqrt(dx * dx + dy * dy) <= 6;
    });

    return (
        <div className="flex flex-col w-full h-full bg-slate-900 overflow-hidden rounded-xl border border-slate-800">
        <div className="relative flex-1 overflow-hidden">
            {/* Header HUD */}
            <div className="absolute top-0 inset-x-0 z-20 flex justify-between items-center px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
                <span className="font-mono text-xs text-green-400 flex items-center gap-2 drop-shadow-md">
                    <Eye className="h-3.5 w-3.5" /> {viewMode === "thermal" ? "THERMAL IR · BLOB DETECT" : "OPTICAL RGB CAMERA"} — {drone.drone_id}
                </span>
                <span className="font-mono text-xs bg-black/50 px-2 py-1 rounded text-green-400 flex items-center gap-1.5">
                    REC <span className={cn("inline-block w-2 h-2 rounded-full", flying ? "bg-red-500 animate-pulse" : "bg-slate-600")} />
                </span>
            </div>

            {/* View Mode Switcher */}
            <div className="absolute top-12 right-4 z-30 flex items-center gap-1 bg-black/60 p-1 rounded-md backdrop-blur-smshadow-xl font-mono text-[10px] tracking-widest uppercase">
                <button
                    onClick={() => setViewMode("optical")}
                    className={cn("px-2 py-1 rounded transition-colors", viewMode === "optical" ? "bg-green-500/20 text-green-400 font-bold" : "text-slate-400 hover:text-green-300")}
                >
                    OPT
                </button>
                <button
                    onClick={() => setViewMode("thermal")}
                    className={cn("px-2 py-1 rounded transition-colors", viewMode === "thermal" ? "bg-amber-500/20 text-amber-500 font-bold" : "text-slate-400 hover:text-amber-400")}
                >
                    IR
                </button>
            </div>

	            {/* Camera / Thermal view */}
            {offline ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-600 font-mono">
                    <WifiOff className="h-10 w-10" /> NO SIGNAL — UPLINK LOST
                </div>
            ) : (
                <>
                <div className="absolute inset-0 flex divide-x divide-green-500/20">
                    {/* Optical: only shows live video when flying */}
                    {viewMode === "optical" && (
                        flying ? (
                            <div className="relative flex-1 bg-black overflow-hidden group">
                                <span className="absolute top-12 left-4 z-30 font-mono text-[10px] text-green-400 bg-black/60 px-2 py-1 flex items-center gap-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                    OPTICAL VIS
                                </span>
                                <video
                                    key={`vis-${videoSrc}`}
                                    src={videoSrc}
                                    autoPlay
                                    loop
                                    muted
                                    playsInline
                                    className="absolute inset-0 w-full h-full object-cover grayscale contrast-125"
                                />
                            </div>
                        ) : (
                            <div className="relative flex-1 bg-slate-950 flex flex-col items-center justify-center gap-2 font-mono text-slate-500 text-xs">
                                <Activity className="h-7 w-7 opacity-40" />
                                <span className="uppercase tracking-widest text-[10px]">OPTICS STANDBY</span>
                                <span className="text-[9px] text-slate-700 uppercase tracking-wide">{drone.status} — RGB ready on takeoff</span>
                            </div>
                        )
                    )}
                    {/* Thermal: shows IR video when flying, else standby */}
                    {viewMode === "thermal" && (
												flying ? (
                            <div className="relative flex-1 bg-black overflow-hidden group">
                                <span className="absolute top-12 left-4 z-30 font-mono text-[10px] text-green-400 bg-black/60 px-2 py-1 flex items-center gap-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                    THERMAL IR
                                </span>
                                <video
                                    key={`thermal-${thermalSrc}`}
                                    src={thermalSrc}
                                    autoPlay
                                    loop
                                    muted
                                    playsInline
                                    className="absolute inset-0 w-full h-full object-cover contrast-125"
                                />
                            </div>
                        ) : (
                            <div className="relative flex-1 bg-slate-950 flex flex-col items-center justify-center gap-2 font-mono text-slate-500 text-xs">
                                <Activity className="h-7 w-7 opacity-40" />
                                <span className="uppercase tracking-widest text-[10px]">THERMAL STANDBY</span>
                                <span className="text-[9px] text-slate-700 uppercase tracking-wide">{drone.status} — IR ready on takeoff</span>
                            </div>
                        )
                    )}

                    {/* <div className="absolute inset-0 bg-green-900/10 mix-blend-color pointer-events-none" />
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] pointer-events-none z-10" /> */}
                    {/* Crosshair */}
                    <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                        <div className="relative w-16 h-16 border-2 border-green-500/50 rounded-full flex items-center justify-center">
                            <div className="w-1 h-1 bg-green-400 rounded-full animate-ping" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-px bg-green-500/50" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-24 w-px bg-green-500/50" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-green-500/10">
                                {["-top-1 -left-1 border-t-[3px] border-l-[3px]", "-top-1 -right-1 border-t-[3px] border-r-[3px]",
                                    "-bottom-1 -left-1 border-b-[3px] border-l-[3px]", "-bottom-1 -right-1 border-b-[3px] border-r-[3px]"].map((cls, i) => (
                                        <div key={i} className={`absolute w-3 h-3 border-green-400 ${cls}`} />
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>
                {/* Bottom HUD */}
                <div className="absolute bottom-3 left-3 z-20 font-mono text-[10px] text-green-400 bg-black/60 px-2 py-1.5 rounded backdrop-blur-sm space-y-0.5">
                    <div>LAT: {drone.position.y.toFixed(5)}</div>
                    <div>LNG: {drone.position.x.toFixed(5)}</div>
                    <div>ALT: <span className="text-white">{flying ? `${telemetry.altitude}m` : "0m"}</span></div>
                </div>
                <div className="absolute bottom-3 right-3 z-20 font-mono text-[10px] text-green-400 text-right bg-black/60 px-2 py-1.5 rounded backdrop-blur-sm space-y-0.5">
                    <div>SPD: {flying ? `${telemetry.speed}km/h` : "0 km/h"}</div>
                    <div>BAT: {drone.battery}%</div>
                    <div>VSYNC: {flying ? telemetry.rpm1 : "—"}</div>
                </div>
                </>
            )}
        </div>

        {/* RGB Spectral Readout — always visible in optical mode */}
        {viewMode === "optical" && (
            <div className="shrink-0 border-t border-slate-800 bg-slate-950/95 px-3 py-2 space-y-1.5">
                <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-green-400">RGB Spectral Signatures</span>
                    <span className="font-mono text-[8px] text-slate-600">
                        {nearbyDetected.length > 0 ? `${nearbyDetected.length} target${nearbyDetected.length > 1 ? "s" : ""} in FOV` : "Awaiting detections"}
                    </span>
                </div>
                {nearbyDetected.length === 0 ? (
                    <div className="flex items-center gap-2 py-1">
                        <div className="flex gap-0.5 items-end h-4">
                            {[["R", 0.15, "#ef4444"], ["G", 0.12, "#22c55e"], ["B", 0.18, "#3b82f6"]].map(([ch, val, color]) => (
                                <div key={String(ch)} className="flex-1 flex flex-col items-center gap-0.5 w-6">
                                    <div className="w-full rounded-sm opacity-20" style={{ height: `${Math.round(Number(val) * 18)}px`, background: String(color) }} />
                                    <span className="font-mono text-[7px] text-slate-700">{ch}</span>
                                </div>
                            ))}
                        </div>
                        <span className="font-mono text-[8px] text-slate-700 italic">No survivors in camera FOV — run a scan mission</span>
                    </div>
                ) : nearbyDetected.slice(0, 3).map((sv) => {
                    const [r, g, b] = CONDITION_RGB[sv.condition] ?? CONDITION_RGB.stable;
                    const condColor = sv.condition === "critical" ? "text-red-400" : sv.condition === "moderate" ? "text-amber-400" : "text-emerald-400";
                    return (
                        <div key={sv.survivor_id} className="space-y-0.5">
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-[8px] text-slate-400">{sv.survivor_id.replace("SURVIVOR_", "SV-")}</span>
                                <span className={cn("font-mono text-[8px] uppercase font-bold", condColor)}>{sv.condition}</span>
                            </div>
                            <div className="flex gap-0.5 items-center h-2.5">
                                {([["R", r, "#ef4444"], ["G", g, "#22c55e"], ["B", b, "#3b82f6"]] as [string, number, string][]).map(([ch, val, color]) => (
                                    <div key={ch} className="flex items-center gap-0.5 flex-1">
                                        <span className="font-mono text-[7px] text-slate-600 w-2">{ch}</span>
                                        <div className="flex-1 h-1.5 rounded-full bg-slate-800">
                                            <div
                                                className="h-full rounded-full transition-all duration-700"
                                                style={{ width: `${Math.round(val * 100)}%`, background: color, opacity: 0.85 }}
                                            />
                                        </div>
                                        <span className="font-mono text-[7px] text-slate-500 w-5 text-right">{Math.round(val * 100)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
        </div>
    );
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

// ─── Showcase view ────────────────────────────────────────────────────────────

function ShowcaseView({ drone, onBack }: { drone: Drone; onBack: () => void }) {
    const meta = getMeta(drone.drone_id);
    const flying = isFlying(drone.status);
    const [tab, setTab] = useState<"specs" | "systems" | "sensors" | "imu">("specs");
    const [telemetry, setTelemetry] = useState(generateTelemetry(drone.status === "relaying" ? 80 : 50));

    useEffect(() => {
        if (!flying) return;
        const id = setInterval(() => setTelemetry(generateTelemetry(drone.status === "relaying" ? 80 : 50)), 1000);
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
                        <CameraFeed drone={drone} telemetry={telemetry} />
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

export default function DroneDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();

    const { droneData } = useWorldStream({
        intervalMs: 500,
        pollingMs: 5000,
    });

    const drone = droneData?.drones?.find((d) => d.drone_id === id);
    const droneWithSensors = drone ? attachDefaultSensors(drone) : null;

    if (!droneWithSensors) {
        return (
            <div className="inset-0 z-[100] flex items-center justify-center bg-[#060b14] text-slate-300 font-mono overflow-hidden h-screen">
                Loading drone {id}...
            </div>
        );
    }

    return (
        <div className="inset-0 z-[100] flex flex-col bg-black text-slate-300 font-mono overflow-hidden h-screen">
            <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#060b14" }}>
                <ShowcaseView drone={droneWithSensors} onBack={() => router.push("/fleet")} />
            </div>
        </div>
    );
}