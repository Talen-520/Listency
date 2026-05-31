import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Play, Square } from "lucide-react";

import { LanguageToggle } from "@/components/language-toggle";
import { ModeToggle } from "@/components/mode-toggle";
import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { NavItem, View } from "@/app/navigation";
import appIconMask from "@/assets/app-icon.svg";
import appIconRunningDark from "@/assets/app-icon-running-dark.mp4";
import appIconRunningLight from "@/assets/app-icon-running-light.mp4";
import appIconStartingDark from "@/assets/app-icon-starting-dark.mp4";
import appIconStartingLight from "@/assets/app-icon-starting-light.mp4";
import appIconStoppingDark from "@/assets/app-icon-stopping-dark.mp4";
import appIconStoppingLight from "@/assets/app-icon-stopping-light.mp4";
import { formatMessage, translateStatus, useI18n } from "@/lib/i18n";
import { isRuntimeRunning } from "@/lib/runtime";
import type { ActiveSession, BackendHealth, RuntimeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const activePillTransition = {
  type: "spring",
  bounce: 0.18,
  duration: 0.46,
} as const;

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
  const { t } = useI18n();
  const runtimeLabel = translateStatus(status.background_status, t);
  const runtimeRunning = isRuntimeRunning(status.background_status);
  const backendLabel = backendHealth.available
    ? t("shell.backendOnline")
    : backendHealth.checking
      ? t("shell.backendChecking")
      : t("shell.backendOffline");
  const RuntimeToggleIcon = runtimeRunning ? Square : Play;
  const runtimeToggleLabel = runtimeRunning ? t("action.stop") : t("action.start");

  return (
    <main className="h-screen bg-background text-foreground overflow-hidden">
      <div className="flex h-screen">
        <aside className="hidden w-72 shrink-0 bg-sidebar text-sidebar-foreground md:flex md:flex-col">
          <div className="flex h-20 items-center gap-4 px-5">
            <AppIcon className="h-12 w-12" graphicClassName="h-10 w-10" running={runtimeRunning} />
            <div className="min-w-0">
              <div className="font-display text-xl font-semibold leading-tight tracking-normal">Listency</div>
              <div className="mt-0.5 text-sm text-muted-foreground">{t("shell.subtitle")}</div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <NavList items={navItems} view={view} onViewChange={onViewChange} />
          </nav>

          <div className="space-y-3 p-4">
            <StatusRow label={t("common.backend")} value={backendHealth.available ? t("status.online") : t("status.offline")} />
            <StatusRow label={t("common.runtime")} value={runtimeLabel} />
            <StatusRow label={t("common.session")} value={activeSession ? activeSession.provider : t("status.idle")} />
            {remainingSeconds !== null && <StatusRow label={t("common.limit")} value={`${remainingSeconds}s`} />}
          </div>
        </aside>

        <section className="flex flex-col min-w-0 flex-1">
          <header className="shrink-0 z-20 border-b bg-background/90 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <AppIcon className="md:hidden" running={runtimeRunning} />
                  <div>
                    <h1 className="font-display text-2xl font-semibold tracking-normal">{t(`nav.${currentNav.id}`, currentNav.label)}</h1>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={runtimeRunning ? "green" : "neutral"} className="gap-1.5">
                        {runtimeRunning && <Spinner />}
                        {runtimeLabel}
                      </Badge>
                      <Badge tone={backendHealth.available ? "green" : "red"}>{backendLabel}</Badge>
                      <Badge tone={activeSession ? "cyan" : "neutral"}>{activeSession ? t("shell.sessionActive") : t("shell.noActiveSession")}</Badge>
                      {remainingSeconds !== null && (
                        <Badge tone={remainingSeconds < 30 ? "yellow" : "cyan"}>
                          {formatMessage(t("shell.secondsLeft"), { seconds: remainingSeconds })}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ModeToggle />
                <LanguageToggle />
                <Button
                  variant="outline"
                  disabled={!backendHealth.available}
                  className="border-transparent bg-foreground text-background hover:bg-foreground/90 hover:text-background"
                  aria-pressed={runtimeRunning}
                  onClick={runtimeRunning ? onStopRuntime : onStartRuntime}
                >
                  <RuntimeToggleIcon className="h-4 w-4 fill-current stroke-current" />
                  {runtimeToggleLabel}
                </Button>
              </div>
            </div>
            <NavList compact items={navItems} view={view} onViewChange={onViewChange} />
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">{children}</div>
        </section>
      </div>
    </main>
  );
}

function NavList({
  compact = false,
  items,
  onViewChange,
  view,
}: {
  compact?: boolean;
  items: NavItem[];
  onViewChange: (view: View) => void;
  view: View;
}) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<View, HTMLButtonElement>());
  const [indicator, setIndicator] = useState({ height: 0, left: 0, top: 0, width: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const activeItem = itemRefs.current.get(view);

    if (!container || !activeItem) {
      return;
    }

    const measure = () => {
      setIndicator({
        height: activeItem.offsetHeight,
        left: activeItem.offsetLeft,
        top: activeItem.offsetTop,
        width: activeItem.offsetWidth,
      });
    };

    measure();
    window.addEventListener("resize", measure);

    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(activeItem);

    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [compact, items, view]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative",
        compact
          ? "flex gap-2 overflow-x-auto border-t px-4 py-2 md:hidden"
          : "flex flex-col gap-1",
      )}
    >
      <motion.div
        aria-hidden="true"
        animate={{
          height: indicator.height,
          width: indicator.width,
          x: indicator.left,
          y: indicator.top,
        }}
        className={cn("pointer-events-none absolute left-0 top-0 rounded-full", compact ? "bg-muted" : "bg-sidebar-accent")}
        initial={false}
        transition={reduceMotion ? { duration: 0 } : activePillTransition}
      />
      {items.map((item) => {
        const Icon = item.icon;
        const selected = view === item.id;

        return (
          <button
            key={item.id}
            ref={(node) => {
              if (node) {
                itemRefs.current.set(item.id, node);
              } else {
                itemRefs.current.delete(item.id);
              }
            }}
            type="button"
            aria-current={selected ? "page" : undefined}
            className={cn(
              "relative z-10 inline-flex items-center rounded-full text-sm font-medium outline-none transition-colors duration-200",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              compact ? "h-8 shrink-0 gap-2 px-3" : "h-10 w-full gap-3 px-3 text-left",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onViewChange(item.id)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{t(`nav.${item.id}`, item.label)}</span>
          </button>
        );
      })}
    </div>
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
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<"idle" | "starting" | "running" | "stopping">(
    running ? "running" : "idle",
  );
  const previousRunningRef = useRef(running);
  const mask = `url(${appIconMask}) center / contain no-repeat`;
  const themedIcon = {
    running: resolvedTheme === "dark" ? appIconRunningDark : appIconRunningLight,
    starting: resolvedTheme === "dark" ? appIconStartingDark : appIconStartingLight,
    stopping: resolvedTheme === "dark" ? appIconStoppingDark : appIconStoppingLight,
  };

  useEffect(() => {
    if (reduceMotion) {
      previousRunningRef.current = running;
      setPhase(running ? "running" : "idle");
      return;
    }

    if (previousRunningRef.current === running) {
      return;
    }

    previousRunningRef.current = running;
    setPhase(running ? "starting" : "stopping");
  }, [reduceMotion, running]);

  const showVideo = !reduceMotion && phase !== "idle";
  const videoSource =
    phase === "starting"
      ? themedIcon.starting
      : phase === "stopping"
        ? themedIcon.stopping
        : themedIcon.running;

  return (
    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden", className)}>
      {showVideo ? (
        <video
          key={`${resolvedTheme}-${phase}`}
          aria-label={phase === "running" ? t("appIcon.running", "Listency running") : t("appIcon.changing", "Listency changing runtime state")}
          autoPlay
          className={cn("h-7 w-7 object-contain", graphicClassName)}
          loop={phase === "running"}
          muted
          onEnded={() => setPhase(phase === "starting" ? "running" : "idle")}
          playsInline
          preload="metadata"
          src={videoSource}
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
