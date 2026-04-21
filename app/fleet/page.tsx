"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useWorldStream } from "@/lib/useWorldStream";
import type { Drone, WorldStreamSimVisual, WorldStreamTickPayload } from "@/types/api_types";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { getMeta, isFlying, buildDroneMesh, attachDefaultSensors } from "./shared";

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
    }, [drone.drone_id, flying]);

    const statusColorMap: Record<string, string> = {
        flying: "#3b82f6", scanning: "#10b981", relay: "#f59e0b",
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DroneFleetPage() {
    const [simVisual, setSimVisual] = useState<WorldStreamSimVisual | null>(null);
    const router = useRouter();

    const { droneData, worldStreamLive, apiError } = useWorldStream({
        intervalMs: 500,
        pollingMs: 5000,
        onStreamTick: (p: WorldStreamTickPayload) => {
            setSimVisual(p.sim_visual ?? null);
        },
    });

    const drones = droneData?.drones ? droneData.drones.map(attachDefaultSensors) : [];

    return (
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
                                <FleetCard key={drone.drone_id} drone={drone} onClick={() => router.push(`/fleet/${drone.drone_id}`)} />
                            ))}
                        </div>
                    )}
                    <div className="px-6 pb-6 text-center">
                        <p className="text-[10px] font-mono text-slate-700 tracking-widest uppercase">Select a unit to inspect</p>
                    </div>
        </div>
    );
}