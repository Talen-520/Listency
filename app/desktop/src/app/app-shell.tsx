import { useEffect, useState, type ReactNode } from "react";
import { Play, Square } from "lucide-react";

import { ModeToggle } from "@/components/mode-toggle";
import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { NavItem, View } from "@/app/navigation";
import appIconMask from "@/assets/app-icon.svg";
import appIconRunningDark from "@/assets/app-icon-running-dark.mp4";
import appIconRunningLight from "@/assets/app-icon-running-light.mp4";
import { formatRuntimeStatus, isRuntimeRunning } from "@/lib/runtime";
import type { ActiveSession, BackendHealth, RuntimeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AppShell({
  view,
  navItems,
  currentNav,
  status,
  backendHealth,
  activeSession,
  remainingSeconds,
  onViewChange,
  onStartRuntime,
  onStopRuntime,
  children,
}: {
  view: View;
  navItems: NavItem[];
  currentNav: NavItem;
  status: RuntimeStatus;
  backendHealth: BackendHealth;
  activeSession?: ActiveSession;
  remainingSeconds: number | null;
  onViewChange: (view: View) => void;
  onStartRuntime: () => void;
  onStopRuntime: () => void;
  children: ReactNode;
}) {
  const runtimeLabel = formatRuntimeStatus(status.background_status);
  const runtimeRunning = isRuntimeRunning(status.background_status);
  const backendLabel = backendHealth.available
    ? "backend online"
    : backendHealth.checking
      ? "checking backend"
      : "backend offline";

  return (
    <main className="h-screen bg-background text-foreground overflow-hidden">
      <div className="flex h-screen">
        <aside className="hidden w-72 shrink-0 border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col">
          <div className="flex h-20 items-center gap-4 px-5">
            <AppIcon className="h-12 w-12" graphicClassName="h-10 w-10" running={runtimeRunning} />
            <div className="min-w-0">
              <div className="font-display text-xl font-semibold leading-tight tracking-normal">Listency</div>
              <div className="mt-0.5 text-sm text-muted-foreground">Local voice runtime</div>
            </div>
          </div>
          <Separator />

          <nav className="flex-1 overflow-y-auto space-y-1 p-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const selected = view === item.id;
              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  className={cn(
                    "h-10 w-full justify-start gap-3 rounded-lg px-3 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                    selected && "bg-sidebar-accent text-foreground hover:bg-sidebar-accent",
                  )}
                  onClick={() => onViewChange(item.id)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </nav>

          <div className="space-y-3 border-t p-4">
            <StatusRow label="Backend" value={backendHealth.available ? "online" : "offline"} />
            <StatusRow label="Runtime" value={runtimeLabel} />
            <StatusRow label="Session" value={activeSession ? activeSession.provider : "idle"} />
            {remainingSeconds !== null && <StatusRow label="Limit" value={`${remainingSeconds}s`} />}
          </div>
        </aside>

        <section className="flex flex-col min-w-0 flex-1">
          <header className="shrink-0 z-20 border-b bg-background/90 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <AppIcon className="md:hidden" running={runtimeRunning} />
                  <div>
                    <h1 className="font-display text-2xl font-semibold tracking-normal">{currentNav.label}</h1>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={runtimeRunning ? "green" : "neutral"} className="gap-1.5">
                        {runtimeRunning && <Spinner />}
                        {runtimeLabel}
                      </Badge>
                      <Badge tone={backendHealth.available ? "green" : "red"}>{backendLabel}</Badge>
                      <Badge tone={activeSession ? "cyan" : "neutral"}>{activeSession ? "session active" : "no active session"}</Badge>
                      {remainingSeconds !== null && <Badge tone={remainingSeconds < 30 ? "yellow" : "cyan"}>{remainingSeconds}s left</Badge>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ModeToggle />
                <Button variant="outline" disabled={!backendHealth.available} onClick={onStartRuntime}>
                  <Play className="h-4 w-4" />
                  Start
                </Button>
                <Button variant="outline" disabled={!backendHealth.available} onClick={onStopRuntime}>
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto border-t px-4 py-2 md:hidden">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.id}
                    variant="ghost"
                    size="sm"
                    className={cn("shrink-0 rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground", view === item.id && "bg-muted text-foreground")}
                    onClick={() => onViewChange(item.id)}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">{children}</div>
        </section>
      </div>
    </main>
  );
}

function AppIcon({
  className,
  graphicClassName,
  running,
}: {
  className?: string;
  graphicClassName?: string;
  running: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const mask = `url(${appIconMask}) center / contain no-repeat`;
  const showRunningIcon = running && !reduceMotion;
  const runningIcon = resolvedTheme === "dark" ? appIconRunningDark : appIconRunningLight;

  return (
    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden", className)}>
      {showRunningIcon ? (
        <video
          key={runningIcon}
          aria-label="Listency running"
          autoPlay
          className={cn("h-7 w-7 object-contain", graphicClassName)}
          loop
          muted
          playsInline
          preload="metadata"
          src={runningIcon}
        />
      ) : (
        <span
          aria-label="Listency"
          className={cn("h-7 w-7 bg-foreground", graphicClassName)}
          role="img"
          style={{
            WebkitMask: mask,
            mask,
          }}
        />
      )}
    </div>
  );
}

function useReducedMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(query.matches);

    const handleChange = () => setReduceMotion(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return reduceMotion;
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
