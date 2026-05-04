import { Cpu, Radio, Timer } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderStatusCard } from "@/features/dashboard/provider-status-card";
import { SessionTable } from "@/features/logs/session-table";
import { formatRuntimeStatus } from "@/lib/runtime";
import type { ActiveSession, ProviderInfo, RuntimeStatus, SessionRecord } from "@/lib/types";

export function DashboardView({
  status,
  activeSession,
  providers,
  sessions,
}: {
  status: RuntimeStatus;
  activeSession?: ActiveSession;
  providers: ProviderInfo[];
  sessions: SessionRecord[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle>Runtime</CardTitle>
          <CardDescription>Local background process and current call state.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
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
