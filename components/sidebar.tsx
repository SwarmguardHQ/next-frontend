"use client";

import {
  Home,
  BarChart3,
  Map,
  Layers,
  Settings,
  Target,
  Cpu,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? window.localStorage.getItem("sidebar-collapsed") : null;
    const isCollapsed = saved === "true";
    setCollapsed(isCollapsed);
    document.documentElement.dataset.sidebar = isCollapsed ? "collapsed" : "expanded";
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setCollapsed((prev) => {
        const next = !prev;
        window.localStorage.setItem("sidebar-collapsed", String(next));
        document.documentElement.dataset.sidebar = next ? "collapsed" : "expanded";
        return next;
      });
    };

    window.addEventListener("toggle-sidebar", onToggle);
    return () => window.removeEventListener("toggle-sidebar", onToggle);
  }, []);

  const navItems = [
    { href: "/", icon: Home, label: "Dashboard" },
    { href: "/map", icon: Map, label: "Live Map" },
    { href: "/missions", icon: Target, label: "Missions" },
    { href: "/drone-command", icon: Layers, label: "Human In Loop" },
    { href: "/drones", icon: Cpu, label: "Drones" },
    { href: "/analytics", icon: BarChart3, label: "Analytics" },
  ];

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground sm:flex transition-[width] duration-200",
        collapsed ? "w-18" : "w-48"
      )}
    >
      <nav className="flex flex-col items-start gap-4 px-4 sm:py-5">
        <Link
          href="/"
          className={cn(
            "mb-4 flex w-full items-center rounded-md border border-[#12305a]/25 bg-background p-2",
            collapsed ? "justify-center" : "gap-2"
          )}
        >
          <Image
            src="/siren-logo-v2.png"
            alt="SIREN"
            width={28}
            height={28}
            className="rounded-sm"
          />
          {!collapsed && (
            <span className="text-xs font-semibold tracking-wider text-foreground">SIREN</span>
          )}
        </Link>

        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex w-full items-center rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-foreground",
                collapsed ? "justify-center" : "gap-3",
                isActive && "bg-primary text-primary-foreground font-bold"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-5 w-5" />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <nav className="mt-auto flex flex-col items-start gap-4 px-4 sm:py-5">
        <Link
          href="#"
          className={cn(
            "flex w-full items-center rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-foreground",
            collapsed ? "justify-center" : "gap-3",
            pathname === "/settings" && "bg-primary text-primary-foreground font-bold"
          )}
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className="h-5 w-5" />
          {!collapsed && <span className="text-sm font-medium">Settings</span>}
        </Link>
      </nav>
    </aside>
  );
}
