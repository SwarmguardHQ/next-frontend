"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Crosshair,
  Cpu,
  Layers,
  Bell,
  Settings,
  User,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Radio,
  Shield,
  LogOut,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LOGO_HORIZONTAL = "/siren-logo.png";
const LOGO_COMPACT    = "/siren-logo-v2.png";

const NAV_ITEMS = [
  { href: "/",            icon: LayoutDashboard, label: "Dashboard",  live: false },
  { href: "/tactical",    icon: Crosshair,       label: "Tactical",   live: true  },
  { href: "/fleet",       icon: Cpu,             label: "Fleet",      live: false },
  { href: "/simulation",  icon: Layers,          label: "Simulation", live: false },
] as const;

// Static mock — swap for a real notification hook when ready
const ALERT_COUNT = 1;

export default function Header() {
  const pathname              = usePathname();
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  return (
    <>
      {/* ═══════════════════════  MAIN HEADER  ═══════════════════════ */}
      <header className="sticky top-0 z-50 shrink-0">

        {/* Top 1-px cyan accent line */}
        <div className="h-px w-full bg-linear-to-r from-transparent via-cyan-500/70 to-transparent" />

        <div className="border-b border-slate-800/70 bg-slate-950/96 shadow-[0_2px_16px_rgba(0,0,0,0.5)] backdrop-blur-lg">
          <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-3 px-4 sm:px-6">

            {/* ── Mobile hamburger ── */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/80 text-slate-400 transition-colors hover:border-cyan-700/50 hover:text-cyan-400 md:hidden"
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>

            {/* ── Brand ── */}
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <Image
                src={LOGO_COMPACT}
                alt="SIREN"
                width={32}
                height={32}
                priority
                className="h-8 w-8 object-contain brightness-0 invert sm:hidden"
              />
              <Image
                src={LOGO_HORIZONTAL}
                alt="SIREN · Swarm Intelligence Rescue Emergency Network"
                width={260}
                height={72}
                priority
                className="hidden h-8 w-auto max-w-[180px] object-contain object-left brightness-0 invert sm:block md:max-w-[210px]"
              />
            </Link>

            {/* System live pill */}
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-emerald-800/50 bg-emerald-950/60 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-400 sm:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              System Live
            </span>

            {/* ── Divider ── */}
            <div className="mx-1 hidden h-5 w-px bg-slate-800/80 md:block" />

            {/* ── Primary nav ── */}
            <nav className="hidden items-center gap-0.5 md:flex">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11px] font-semibold uppercase tracking-widest transition-all duration-150",
                      active
                        ? "text-white"
                        : "text-slate-500 hover:bg-slate-800/50 hover:text-slate-200",
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-colors",
                        active ? "text-cyan-400" : "text-slate-600 group-hover:text-slate-300",
                      )}
                      aria-hidden
                    />
                    {item.label}
                    {item.live && (
                      <span className="ml-0.5 rounded-full bg-cyan-500/20 px-1.5 py-px text-[8px] font-bold text-cyan-400 leading-none">
                        LIVE
                      </span>
                    )}
                    {/* Active underline */}
                    {active && (
                      <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-linear-to-r from-cyan-500/40 via-cyan-400 to-cyan-500/40" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* ── Spacer ── */}
            <div className="flex-1" />

            {/* ── Right actions ── */}
            <div className="flex items-center gap-1.5">

              {/* Alert bell */}
              <button
                aria-label={`Alerts (${ALERT_COUNT})`}
                className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/80 text-slate-400 transition-colors hover:border-amber-600/50 hover:text-amber-400"
              >
                <Bell className="h-3.5 w-3.5" />
                {ALERT_COUNT > 0 && (
                  <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white leading-none">
                    {ALERT_COUNT}
                  </span>
                )}
              </button>

              {/* Settings */}
              <button
                aria-label="Settings"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/80 text-slate-400 transition-colors hover:border-cyan-700/50 hover:text-cyan-400"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>

              {/* ── Divider ── */}
              <div className="mx-1 hidden h-5 w-px bg-slate-800/80 sm:block" />

              {/* Operator profile + dropdown */}
              <div className="relative">
                <button
                  onClick={() => setProfileOpen((v) => !v)}
                  className="flex h-8 items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/80 pl-1.5 pr-2.5 text-slate-300 transition-colors hover:border-cyan-700/50 hover:text-white"
                  aria-label="Operator menu"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 ring-1 ring-cyan-500/30">
                    <User className="h-3 w-3 text-cyan-400" />
                  </div>
                  <span className="hidden text-[10px] font-semibold uppercase tracking-widest sm:block">
                    Operator
                  </span>
                  <ChevronDown
                    className={cn(
                      "hidden h-3 w-3 text-slate-500 transition-transform duration-150 sm:block",
                      profileOpen && "rotate-180",
                    )}
                  />
                </button>

                {/* Dropdown */}
                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 top-10 z-50 min-w-[200px] overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950/98 shadow-2xl backdrop-blur-xl">
                      {/* Profile header */}
                      <div className="border-b border-slate-800/60 px-4 py-3">
                        <p className="text-xs font-bold text-slate-100">Field Operator</p>
                        <p className="text-[10px] text-slate-500">Alpha-9 · Clearance L3</p>
                      </div>
                      {/* Menu items */}
                      {[
                        { icon: Shield,   label: "Credentials"   },
                        { icon: KeyRound, label: "Access Keys"    },
                        { icon: Settings, label: "Preferences"    },
                      ].map((item) => (
                        <button
                          key={item.label}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-100"
                          onClick={() => setProfileOpen(false)}
                        >
                          <item.icon className="h-3.5 w-3.5 text-slate-600" />
                          {item.label}
                        </button>
                      ))}
                      <div className="border-t border-slate-800/60">
                        <button
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[11px] font-medium text-red-400/80 transition-colors hover:bg-red-950/40 hover:text-red-300"
                          onClick={() => setProfileOpen(false)}
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* ── Primary CTA: Open Tactical ── */}
              <Link
                href="/tactical"
                className="hidden items-center gap-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)] transition-all duration-150 hover:bg-cyan-500/25 hover:border-cyan-400/50 hover:text-cyan-200 hover:shadow-[0_0_18px_rgba(6,182,212,0.25)] sm:flex"
              >
                <Radio className="h-3.5 w-3.5" />
                Tactical Ops
                <ChevronRight className="h-3 w-3 opacity-60" />
              </Link>
            </div>
          </div>
        </div>

        {/* Sub-breadcrumb bar — shows current section context */}
        <div className="hidden border-b border-slate-800/40 bg-slate-950/70 px-6 py-1.5 md:block">
          <div className="mx-auto flex max-w-[1800px] items-center gap-1.5">
            {NAV_ITEMS.map((item, i) => {
              const active = isActive(item.href);
              if (!active) return null;
              return (
                <div key={item.href} className="flex items-center gap-1.5">
                  <item.icon className="h-3 w-3 text-cyan-400" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                    {item.label}
                  </span>
                  <span className="text-[10px] text-slate-600">
                    {item.href === "/" ? "· Fleet Intelligence · Live World Stream" :
                     item.href === "/tactical" ? "· Operational Field View · ISO Grid" :
                     item.href === "/fleet" ? "· Drone Asset Management" :
                     "· Agent-Based Modelling"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* ═══════════════════════  MOBILE DRAWER  ═══════════════════════ */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Drawer panel */}
          <nav
            className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-slate-800/70 bg-slate-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex h-14 items-center justify-between border-b border-slate-800/60 px-4">
              <Image
                src={LOGO_COMPACT}
                alt="SIREN"
                width={32}
                height={32}
                className="h-8 w-8 object-contain brightness-0 invert"
              />
              <button
                onClick={() => setMobileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/60 text-slate-400 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto p-3">
              <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-600">
                Navigation
              </p>
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                      active
                        ? "bg-cyan-500/10 text-cyan-300"
                        : "text-slate-500 hover:bg-slate-800/60 hover:text-slate-200",
                    )}
                  >
                    <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-cyan-400" : "text-slate-600")} />
                    <span className="flex-1">{item.label}</span>
                    {item.live && (
                      <span className="rounded-full bg-cyan-500/20 px-1.5 py-px text-[8px] font-bold text-cyan-400">
                        LIVE
                      </span>
                    )}
                    {active && <ChevronRight className="h-3.5 w-3.5 text-cyan-500/60" />}
                  </Link>
                );
              })}

              {/* Quick launch */}
              <div className="mt-4 border-t border-slate-800/60 pt-4">
                <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-600">
                  Quick Launch
                </p>
                <Link
                  href="/tactical"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-cyan-300 transition-colors hover:bg-cyan-500/20"
                >
                  <Radio className="h-4 w-4 text-cyan-400" />
                  Open Tactical Ops
                  <ChevronRight className="ml-auto h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* Drawer footer — operator info + status */}
            <div className="border-t border-slate-800/60 p-4">
              <div className="flex items-center gap-3 rounded-lg bg-slate-900/60 px-3 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 ring-1 ring-cyan-500/30">
                  <User className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-200">Field Operator</p>
                  <p className="text-[9px] text-slate-500">Alpha-9 · Clearance L3</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 px-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">
                  System Live
                </span>
              </div>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
