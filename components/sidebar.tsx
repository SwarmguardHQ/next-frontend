"use client";

import {
  Home,
  BarChart3,
  Map,
  Layers,
  Shield,
  Settings,
  Target,
  Cpu,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", icon: Home, label: "Dashboard" },
    { href: "/map", icon: Map, label: "Live Map" },
    { href: "/missions", icon: Target, label: "Missions" },
    { href: "#", icon: Layers, label: "Scenarios" },
    { href: "#", icon: Cpu, label: "Drones" },
    { href: "#", icon: BarChart3, label: "Analytics" },
  ];

  return (
    <TooltipProvider>
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-48 flex-col border-r bg-background sm:flex transition-all">
        <nav className="flex flex-col items-start gap-4 px-4 sm:py-5">
          <Link
            href="#"
            className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:h-8 md:w-8 md:text-base mb-4"
          >
            <Shield className="h-4 w-4 transition-all group-hover:scale-110" />
            <span className="sr-only">SwarmguardHQ</span>
          </Link>

          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-foreground w-full",
                  isActive && "bg-accent text-accent-foreground font-bold"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <nav className="mt-auto flex flex-col items-start gap-4 px-4 sm:py-5">
          <Link
            href="#"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-foreground w-full",
              pathname === "/settings" && "bg-accent text-accent-foreground font-bold"
            )}
          >
            <Settings className="h-5 w-5" />
            <span className="text-sm font-medium">Settings</span>
          </Link>
        </nav>
      </aside>
    </TooltipProvider>
  );
}
