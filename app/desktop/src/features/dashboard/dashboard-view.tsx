import { AlertCircle, CheckCircle2, Cpu, Radio, Server, Timer } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderStatusCard } from "@/features/dashboard/provider-status-card";
import { SessionTable } from "@/features/logs/session-table";
import { formatMessage, translateStatus, useI18n } from "@/lib/i18n";
import { isRuntimeRunning, toTitleCase } from "@/lib/runtime";
import type { ActiveSession, BackendHealth, ProviderInfo, ReadinessCheck, RuntimeStatus, SessionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

function translateReadinessLabel(
  id: string,
  fallback: string,
  t: (key: string, fallback?: string) => string,
) {
  const keyById: Record<string, string> = {
    agent: "agent.title",
    backend: "common.backend",
    business: "business.title",
    phone: "phone.title",
    provider: "common.provider",
    runtime: "common.runtime",
    tools: "common.tools",
  };

  return t(keyById[id] ?? "", fallback);
}

export function DashboardView({
  status,
  backendHealth,
  activeSession,
  providers,
  sessions,
  readinessChecks,
}: {
  status: RuntimeStatus;
  backendHealth: BackendHealth;
  activeSession?: ActiveSession;
  providers: ProviderInfo[];
  sessions: SessionRecord[];
  readinessChecks: ReadinessCheck[];
}) {
  const { t } = useI18n();
  const readyCount = readinessChecks.filter((check) => check.ready).length;
  const runtimeRunning = isRuntimeRunning(status.background_status);
  const runtimeLabel = translateStatus(status.background_status, t);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle>{t("common.runtime")}</CardTitle>
          <CardDescription>{t("dashboard.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status.last_error && (
            <div className="flex gap-3 rounded-lg bg-destructive/10 p-4 text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium leading-none">{t("dashboard.runtimeDegraded")}</p>
                <p className="text-sm">{status.last_error}</p>
              </div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex gap-3 rounded-lg bg-muted/40 p-4">
            <Server className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium leading-none">{t("common.backend")}</p>
              <p className="text-sm text-muted-foreground">{backendHealth.available ? t("status.online") : t("status.offline")}</p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg bg-muted/40 p-4">
            <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium leading-none">{t("common.runtime")}</p>
              <p className={cn("text-sm text-muted-foreground", runtimeRunning && "shimmer-text")}>{runtimeLabel}</p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg bg-muted/40 p-4">
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium leading-none">{t("common.session")}</p>
              <p className="text-sm text-muted-foreground">{translateStatus(activeSession ? activeSession.status : "idle", t)}</p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg bg-muted/40 p-4">
            <Timer className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium leading-none">{t("common.limit")}</p>
              <p className="text-sm text-muted-foreground">{toTitleCase(`${status.session_limit_seconds / 60} min`)}</p>
            </div>
          </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.providers")}</CardTitle>
          <CardDescription>{t("dashboard.providerDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {providers.map((provider) => (
            <ProviderStatusCard key={provider.name} provider={provider} />
          ))}
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>{t("dashboard.readiness")}</CardTitle>
          <CardDescription>
            {formatMessage(t("dashboard.readinessDescription"), { ready: readyCount, total: readinessChecks.length })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {readinessChecks.map((check) => {
            const Icon = check.ready ? CheckCircle2 : AlertCircle;
            return (
              <div key={check.id} className="flex gap-3 rounded-lg bg-muted/40 p-4">
                <Icon
                  className={
                    check.ready
                      ? "mt-0.5 h-4 w-4 shrink-0 text-foreground"
                      : "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  }
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium leading-none">{translateReadinessLabel(check.id, check.label, t)}</p>
                  <p className="text-sm text-muted-foreground">{check.detail}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>{t("dashboard.recentSessions")}</CardTitle>
          <CardDescription>{t("dashboard.recentSessionsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SessionTable sessions={sessions.slice(0, 6)} />
        </CardContent>
      </Card>
    </div>
  );
}
