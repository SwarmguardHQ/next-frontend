"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const BOOT_LINES = [
  "INITIALIZING SWARM MESH PROTOCOL...",
  "CALIBRATING SENSOR ARRAYS...",
  "ESTABLISHING SECURE UPLINK...",
  "LOADING TACTICAL GRID DATA...",
  "ALL SYSTEMS NOMINAL · SIREN ONLINE.",
];

const SPLASH_DURATION_MS = 3400;

export default function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bootIdx, setBootIdx] = useState(0);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("siren_booted")) return;
      sessionStorage.setItem("siren_booted", "1");
    } catch {
      // sessionStorage blocked (private browsing)
    }
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;

    startRef.current = performance.now();

    // Smooth progress via rAF
    const tick = (now: number) => {
      const pct = Math.min(100, ((now - startRef.current) / SPLASH_DURATION_MS) * 100);
      setProgress(pct);
      if (pct < 100) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Cycle boot lines
    const lineMs = SPLASH_DURATION_MS / BOOT_LINES.length;
    let idx = 0;
    const lineInterval = setInterval(() => {
      idx = Math.min(idx + 1, BOOT_LINES.length - 1);
      setBootIdx(idx);
    }, lineMs);

    // Auto-dismiss
    const timer = setTimeout(dismiss, SPLASH_DURATION_MS + 200);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(lineInterval);
      clearTimeout(timer);
    };
  }, [visible]);

  function dismiss() {
    setExiting(true);
    setTimeout(() => setVisible(false), 650);
  }

  if (!visible) return null;

  return (
    <>
      {/* Inline keyframes — avoids globals.css pollution */}
      <style>{`
        @keyframes siren-drone-hover {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
        @keyframes siren-rotor-cw  { to { transform: rotate( 360deg); } }
        @keyframes siren-rotor-ccw { to { transform: rotate(-360deg); } }
        @keyframes siren-glow-pulse {
          0%, 100% { opacity: 0.65; }
          50%       { opacity: 1.00; }
        }
        @keyframes siren-scan {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        .sr-drone-hover { animation: siren-drone-hover 2.6s ease-in-out infinite; }
        .sr-rotor-cw-a  { animation: siren-rotor-cw  0.27s linear infinite; transform-box: fill-box; transform-origin: center; }
        .sr-rotor-ccw-a { animation: siren-rotor-ccw 0.25s linear infinite; transform-box: fill-box; transform-origin: center; }
        .sr-rotor-cw-b  { animation: siren-rotor-cw  0.31s linear infinite; transform-box: fill-box; transform-origin: center; }
        .sr-rotor-ccw-b { animation: siren-rotor-ccw 0.29s linear infinite; transform-box: fill-box; transform-origin: center; }
        .sr-center-glow { animation: siren-glow-pulse 1.5s ease-in-out infinite; }
        .sr-scan        { animation: siren-scan 3.5s linear infinite; }
      `}</style>

      <div
        className={[
          "fixed inset-0 z-9999 flex flex-col items-center justify-center bg-slate-950",
          "transition-opacity duration-700 ease-in-out cursor-pointer select-none",
          exiting ? "opacity-0 pointer-events-none" : "opacity-100",
        ].join(" ")}
        onClick={dismiss}
        role="presentation"
        aria-label="SIREN initialisation screen"
      >
        {/* ── Background: CRT scan line ── */}
        <div className="sr-scan pointer-events-none absolute left-0 right-0 h-40 bg-linear-to-b from-transparent via-cyan-500/2.5 to-transparent" />

        {/* ── Background: dot grid ── */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.032]"
          style={{
            backgroundImage: "radial-gradient(circle, #22d3ee 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* ── Background: radial glow ── */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[520px] w-[520px] rounded-full bg-cyan-500/6 blur-3xl" />
        </div>

        {/* ── Main content ── */}
        <div className="relative flex flex-col items-center gap-9">

          {/* Drone illustration */}
          <div className="sr-drone-hover">
            <svg
              width="148"
              height="148"
              viewBox="0 0 148 148"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Shadow under drone (stays on ground visually) */}
              <ellipse cx="74" cy="138" rx="26" ry="5" fill="#06b6d4" opacity="0.07" />

              {/* Arms */}
              <line x1="74" y1="74" x2="24" y2="24" stroke="#1e293b" strokeWidth="5" strokeLinecap="round" />
              <line x1="74" y1="74" x2="124" y2="24" stroke="#1e293b" strokeWidth="5" strokeLinecap="round" />
              <line x1="74" y1="74" x2="24" y2="124" stroke="#1e293b" strokeWidth="5" strokeLinecap="round" />
              <line x1="74" y1="74" x2="124" y2="124" stroke="#1e293b" strokeWidth="5" strokeLinecap="round" />

              {/* Rotor mounts */}
              <circle cx="24"  cy="24"  r="16" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
              <circle cx="124" cy="24"  r="16" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
              <circle cx="24"  cy="124" r="16" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
              <circle cx="124" cy="124" r="16" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />

              {/* Rotor blades */}
              <g className="sr-rotor-cw-a">
                <ellipse cx="24" cy="24" rx="14" ry="3.5" fill="#06b6d4" opacity="0.60" />
              </g>
              <g className="sr-rotor-ccw-a">
                <ellipse cx="124" cy="24" rx="14" ry="3.5" fill="#06b6d4" opacity="0.60" />
              </g>
              <g className="sr-rotor-ccw-b">
                <ellipse cx="24" cy="124" rx="14" ry="3.5" fill="#06b6d4" opacity="0.60" />
              </g>
              <g className="sr-rotor-cw-b">
                <ellipse cx="124" cy="124" rx="14" ry="3.5" fill="#06b6d4" opacity="0.60" />
              </g>

              {/* Rotor ring glow */}
              <circle cx="24"  cy="24"  r="15" stroke="#06b6d4" strokeWidth="1" opacity="0.22" />
              <circle cx="124" cy="24"  r="15" stroke="#06b6d4" strokeWidth="1" opacity="0.22" />
              <circle cx="24"  cy="124" r="15" stroke="#06b6d4" strokeWidth="1" opacity="0.22" />
              <circle cx="124" cy="124" r="15" stroke="#06b6d4" strokeWidth="1" opacity="0.22" />

              {/* Body */}
              <circle cx="74" cy="74" r="18" fill="#0f172a" stroke="#1e293b" strokeWidth="2.5" />
              <circle cx="74" cy="74" r="11" fill="#0c1a2e" stroke="#164e63" strokeWidth="1.5" />

              {/* Camera eye */}
              <circle cx="74" cy="79" r="4.5" fill="#0ea5e9" opacity="0.75" />
              <circle cx="74" cy="79" r="2"   fill="#e0f2fe" opacity="0.95" />

              {/* Status light */}
              <circle cx="74" cy="67" r="3.5" fill="#06b6d4" className="sr-center-glow" />
            </svg>
          </div>

          {/* Logo + wordmark */}
          <div className="flex flex-col items-center gap-4">
            {/* Full horizontal logo — white */}
            <Image
              src="/siren-logo.png"
              alt="SIREN"
              width={260}
              height={72}
              className="h-14 w-auto object-contain brightness-0 invert"
              priority
            />
            <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-cyan-500/70">
              Swarm Intelligence Rescue Emergency Network
            </p>
          </div>

          {/* Boot line */}
          <div className="flex min-h-[18px] items-center gap-2.5 font-mono text-[11px] tracking-widest text-cyan-400/60">
            <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-cyan-400" />
            <span>{BOOT_LINES[bootIdx]}</span>
          </div>

          {/* Progress bar */}
          <div className="h-[2px] w-64 overflow-hidden rounded-full bg-slate-800/80">
            <div
              className="h-full rounded-full bg-cyan-500"
              style={{
                width: `${progress}%`,
                boxShadow: "0 0 8px rgba(6,182,212,0.9)",
                transition: "none",
              }}
            />
          </div>
        </div>

        {/* Skip hint */}
        <p className="absolute bottom-8 animate-pulse text-[9px] font-medium uppercase tracking-[0.25em] text-slate-700">
          Click anywhere to skip
        </p>
      </div>
    </>
  );
}
