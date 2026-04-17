"use client";

import Image from "next/image";
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
  Cpu,
  Layers,
  Settings,
  User,
  Bell,
  Menu,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Horizontal lockup (icon + wordmark + tagline) — light artwork; sits on dark header bar */
const LOGO_HORIZONTAL = "/siren-logo.png";
/** Compact drone mark for tight spaces */
const LOGO_COMPACT = "/siren-logo-v2.png";

export default function Header() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/tactical", icon: LineChart, label: "Tactical" },
    { href: "/fleet", icon: Cpu, label: "Fleet" },
    { href: "/simulation", icon: Layers, label: "Simulation" },
  ];

  function navLinkClass(href: string) {
    const isActive =
      pathname === href || (href !== "/" && pathname.startsWith(href));
    return cn(
      "flex items-center gap-2 rounded-md border-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition-none",
      isActive
        ? "border-foreground bg-foreground text-background shadow-[3px_3px_0_0_var(--ring)]"
        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
    );
  }

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b-4 border-foreground bg-card shadow-[0_4px_0_0_var(--nb-shadow)]">
      <div className="mx-auto grid h-16 max-w-[1800px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 sm:gap-4 sm:px-6">
        {/* Brand + mobile menu */}
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="md:hidden size-9 shrink-0 rounded-md border-2 border-border bg-background shadow-[3px_3px_0_0_var(--nb-shadow)] hover:translate-x-px hover:translate-y-px hover:shadow-none"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[min(100%,20rem)] border-r-4 border-foreground bg-card p-0 font-mono text-sm"
            >
              <div className="border-b-2 border-border bg-white px-4 py-4">
                <Image
                  src={LOGO_HORIZONTAL}
                  alt="SIREN"
                  width={260}
                  height={72}
                  className="h-auto w-full max-w-[220px] object-contain object-left"
                />
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Navigation
                </p>
              </div>
              <nav className="flex flex-col gap-1 p-3">
                {navItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md border-2 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition-none",
                        isActive
                          ? "border-foreground bg-foreground text-background shadow-[3px_3px_0_0_var(--ring)]"
                          : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-3">
            {/* Narrow viewports: compact mark */}
            <span className="flex shrink-0 items-center justify-center rounded-md border-2 border-border bg-white p-1 sm:hidden">
              <Image
                src={LOGO_COMPACT}
                alt="SIREN"
                width={40}
                height={40}
                priority
                className="h-8 w-8 object-contain"
              />
            </span>
            {/* sm+: horizontal lockup on light chip (asset is light-background) */}
            <span className="hidden shrink-0 items-center rounded-md border-2 border-border bg-white px-2 py-1.5 sm:inline-flex">
              <Image
                src={LOGO_HORIZONTAL}
                alt="SIREN · Swarm intelligence · Earthquake SAR"
                width={280}
                height={72}
                priority
                className="h-8 w-auto max-w-[min(46vw,260px)] object-contain object-left md:h-9 md:max-w-[min(40vw,300px)]"
              />
            </span>
          </Link>
        </div>

        {/* Primary nav — centered on md+ */}
        <nav className="hidden items-center justify-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={navLinkClass(item.href)}>
              <item.icon className="hidden h-3.5 w-3.5 lg:inline" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-9 rounded-md border-2 border-border bg-background shadow-[3px_3px_0_0_var(--nb-shadow)] hover:translate-x-px hover:translate-y-px hover:shadow-none"
              >
                <Settings className="h-4 w-4" />
                <span className="sr-only">Settings</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="rounded-md border-2 border-border bg-popover font-mono text-xs shadow-[4px_4px_0_0_var(--nb-shadow)]"
            >
              <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                System
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem className="cursor-pointer rounded-sm focus:bg-muted">
                Preferences
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer rounded-sm focus:bg-muted">
                Diagnostics
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-9 rounded-md border-2 border-border bg-background shadow-[3px_3px_0_0_var(--nb-shadow)] hover:translate-x-px hover:translate-y-px hover:shadow-none"
              >
                <User className="h-4 w-4" />
                <span className="sr-only">Account</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="rounded-md border-2 border-border bg-popover font-mono text-xs shadow-[4px_4px_0_0_var(--nb-shadow)]"
            >
              <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Operator
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem className="cursor-pointer rounded-sm focus:bg-muted">Profile</DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem className="cursor-pointer rounded-sm focus:bg-muted">Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="icon"
            className="size-9 rounded-md border-2 border-border bg-background shadow-[3px_3px_0_0_var(--nb-shadow)] hover:translate-x-px hover:translate-y-px hover:shadow-none"
          >
            <Bell className="h-4 w-4" />
            <span className="sr-only">Notifications</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
