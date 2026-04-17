"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Home,
  LineChart,
  Map,
  Package,
  PanelLeft,
  Cpu,
  Layers,
  Settings,
  User,
  Bell,
  Menu
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { cn } from "@/lib/utils";
import Image from "next/image";

export default function Header() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", icon: Home, label: "HOME" },
    { href: "/tactical", icon: LineChart, label: "MAP" },
    { href: "/fleet", icon: Cpu, label: "FLEET" },
    { href: "/simulation", icon: Layers, label: "SIM" },
  ];

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-black/80 px-6 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost" className="md:hidden text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/50 border-cyan-900/50">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="sm:max-w-xs bg-slate-950 border-r border-cyan-900/50 text-slate-300">
            <nav className="grid gap-6 text-lg font-medium font-mono mt-6">
              <Link
                href="/"
                className="flex items-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-950/40 p-2"
              >
                <div className="text-cyan-400">
                  <Cpu className="h-6 w-6" />
                </div>
                <span className="text-sm font-bold tracking-widest text-cyan-400 uppercase drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]">
                  SIREN
                </span>
              </Link>

              {navItems.map((item) => {
                const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/");
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-4 px-2.5 transition-colors uppercase tracking-widest",
                      isActive 
                        ? "text-cyan-400 font-bold" 
                        : "text-slate-500 hover:text-cyan-300"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
        
        <h1 className="text-xl font-bold tracking-widest text-cyan-400 uppercase drop-shadow-[0_0_10px_rgba(34,211,238,0.4)] hidden sm:block">
          SIREN
        </h1>
      </div>

      <nav className="hidden md:flex items-center gap-8 text-xs font-semibold tracking-widest text-slate-500 uppercase">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/");
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "transition-colors pb-1 -mb-[1px]",
                isActive
                  ? "text-cyan-400 border-b-2 border-cyan-400"
                  : "hover:text-cyan-400"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-4 text-cyan-400">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="hover:text-white transition-colors focus:outline-none"><Settings className="w-5 h-5" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-slate-950 border-cyan-900/50 text-slate-300 font-mono text-xs">
            <DropdownMenuLabel className="text-cyan-400 tracking-widest">SYSTEM_CONFIG</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-cyan-900/30" />
            <DropdownMenuItem className="hover:bg-cyan-950 hover:text-cyan-300 focus:bg-cyan-950 focus:text-cyan-300 cursor-pointer">PREFERENCES</DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-cyan-950 hover:text-cyan-300 focus:bg-cyan-950 focus:text-cyan-300 cursor-pointer">DIAGNOSTICS</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="hover:text-white transition-colors focus:outline-none"><User className="w-5 h-5" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-slate-950 border-cyan-900/50 text-slate-300 font-mono text-xs">
            <DropdownMenuLabel className="text-cyan-400 tracking-widest">OPERATOR</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-cyan-900/30" />
            <DropdownMenuItem className="hover:bg-cyan-950 hover:text-cyan-300 focus:bg-cyan-950 focus:text-cyan-300 cursor-pointer">PROFILE</DropdownMenuItem>
            <DropdownMenuSeparator className="bg-cyan-900/30" />
            <DropdownMenuItem className="hover:bg-cyan-950 hover:text-cyan-300 focus:bg-cyan-950 focus:text-cyan-300 cursor-pointer">LOGOUT_SESSION</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button className="hover:text-white transition-colors"><Bell className="w-5 h-5" /></button>
      </div>
    </header>
  );
}
