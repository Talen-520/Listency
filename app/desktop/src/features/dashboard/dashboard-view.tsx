import { AlertCircle, CheckCircle2, Cpu, Radio, Server, Timer } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderStatusCard } from "@/features/dashboard/provider-status-card";
import { SessionTable } from "@/features/logs/session-table";
import { formatRuntimeStatus } from "@/lib/runtime";
import type { ActiveSession, BackendHealth, ProviderInfo, ReadinessCheck, RuntimeStatus, SessionRecord } from "@/lib/types";

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
  const readyCount = readinessChecks.filter((check) => check.ready).length;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle>Runtime</CardTitle>
          <CardDescription>Local background process and current call state.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Backend" value={backendHealth.available ? "online" : "offline"} icon={Server} />
          <MetricCard label="Runtime" value={formatRuntimeStatus(status.background_status)} icon={Cpu} />
          <MetricCard label="Session" value={activeSession ? activeSession.provider : "idle"} icon={Radio} />
          <MetricCard label="Limit" value={`${status.session_limit_seconds / 60} min`} icon={Timer} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Providers</CardTitle>
          <CardDescription>Readiness based on local configuration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {providers.map((provider) => (
            <ProviderStatusCard key={provider.name} provider={provider} />
          ))}
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Readiness</CardTitle>
          <CardDescription>{readyCount} of {readinessChecks.length} checks ready for a local test call.</CardDescription>
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
                  <p className="text-sm font-medium leading-none">{check.label}</p>
                  <p className="text-sm text-muted-foreground">{check.detail}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Recent Sessions</CardTitle>
          <CardDescription>Latest local Realtime sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          <SessionTable sessions={sessions.slice(0, 6)} />
        </CardContent>
      </Card>
    </div>
  );
}
