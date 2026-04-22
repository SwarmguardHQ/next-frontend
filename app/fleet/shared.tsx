"use client";

import * as THREE from "three";
import { cn } from "@/lib/utils";
import type { Drone } from "@/types/api_types";
import { Activity, Eye, Radar, RadioReceiver } from "lucide-react";

export const FLEET_META: Record<string, {
    name: string; model: string; tagline: string; description: string;
    accentHex: string; accentHexLight: string; threeColor: number;
    maxSpeed: number; weightKg: number; rangeKm: number; flightTime: number;
    windResistance: string; payload: string;
}> = {
    DRONE_ALPHA: {
        name: "Falcon Alpha", model: "Recon MkIV", tagline: "Eyes in the sky",
        description: "Designed for extended perimeter surveillance. Equipped with a stabilised 4K gimbal, Falcon Alpha delivers crystal-clear imagery in challenging conditions with its IP54-rated enclosure.",
        accentHex: "#3b82f6", accentHexLight: "#93c5fd", threeColor: 0x3b82f6,
        maxSpeed: 18, weightKg: 1.4, rangeKm: 12, flightTime: 38, windResistance: "Level 5",
        payload: "4K Stabilised Gimbal",
    },
    DRONE_BRAVO: {
        name: "Hawk Beta", model: "Survey Pro X", tagline: "Map the unmappable",
        description: "A heavy-lift hexacopter built for precision mapping. Hawk Beta carries a full LiDAR suite and RGB camera array, generating centimetre-accurate 3D models of terrain and structures.",
        accentHex: "#10b981", accentHexLight: "#6ee7b7", threeColor: 0x10b981,
        maxSpeed: 14, weightKg: 2.1, rangeKm: 18, flightTime: 52, windResistance: "Level 6",
        payload: "LiDAR + RGB Array",
    },
    DRONE_CHARLIE: {
        name: "Eagle Gamma", model: "Cargo Swift", tagline: "Speed when it matters",
        description: "Built for speed and payload capacity, Eagle Gamma is the fleet's supply runner. Its octocopter configuration provides redundant lift for fast point-to-point cargo delivery.",
        accentHex: "#f59e0b", accentHexLight: "#fcd34d", threeColor: 0xf59e0b,
        maxSpeed: 22, weightKg: 3.2, rangeKm: 8, flightTime: 24, windResistance: "Level 4",
        payload: "2 kg Cargo Bay",
    },
    DRONE_DELTA: {
        name: "Osprey Delta", model: "Stealth Lite", tagline: "Silent. Swift. Decisive.",
        description: "Osprey Delta is the fleet's fastest responder. A whisper-quiet profile and thermal imaging suite make it ideal for night operations and covert surveillance.",
        accentHex: "#8b5cf6", accentHexLight: "#c4b5fd", threeColor: 0x8b5cf6,
        maxSpeed: 26, weightKg: 1.1, rangeKm: 15, flightTime: 44, windResistance: "Level 5",
        payload: "Thermal + Night Vision",
    },
    DRONE_ECHO: {
        name: "Phantom Echo", model: "Signal Relay", tagline: "Never lose connection",
        description: "The backbone of the swarm's communication array. Phantom Echo acts as a mobile mesh relay, extending the operational range of the entire fleet in deep terrain.",
        accentHex: "#ec4899", accentHexLight: "#f9a8d4", threeColor: 0xec4899,
        maxSpeed: 18, weightKg: 1.6, rangeKm: 22, flightTime: 65, windResistance: "Level 4",
        payload: "High-Gain Mesh Antenna",
    },
};

export const DEFAULT_META = {
    name: "Unknown Unit", model: "—", tagline: "No data",
    description: "No metadata available for this unit.",
    accentHex: "#64748b", accentHexLight: "#94a3b8", threeColor: 0x64748b,
    maxSpeed: 0, weightKg: 0, rangeKm: 0, flightTime: 0,
    windResistance: "—", payload: "—", callouts: [],
};

export function getMeta(id: string) {
    return FLEET_META[id] ?? DEFAULT_META;
}

export function generateTelemetry(baseAltitude = 50) {
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

export const isFlying = (status?: string) =>
    ["flying", "scanning", "relaying", "delivering"].includes(status ?? "");

export function buildDroneMesh(threeColor: number, motorCount = 4): THREE.Group {
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

export function SensorIcon({ type, className }: { type: string; className?: string }) {
    const icons: Record<string, React.ReactNode> = {
        visual: <Eye className={cn("h-3 w-3", className)} />,
        thermal: <Activity className={cn("h-3 w-3", className)} />,
        audio: <RadioReceiver className={cn("h-3 w-3", className)} />,
    };
    return <>{icons[type] ?? <Radar className={cn("h-3 w-3", className)} />}</>;
}

export function attachDefaultSensors(d: Drone): Drone {
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