import { BarChart3, CalendarClock, CheckCircle2, Clock3, Inbox, PhoneCall, PhoneOff, Wrench } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { formatMessage, translateStatus, useI18n } from "@/lib/i18n";
import type { LocalAnalytics, LogTimeWindow } from "@/lib/types";

const windowLabelKeys: Record<LogTimeWindow, string> = {
  "24h": "logs.window.24h",
  "7d": "logs.window.7d",
  "30d": "logs.window.30d",
};

function formatDuration(seconds: number) {
  if (seconds <= 0) {
    return "0s";
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes <= 0) {
    return `${remaining}s`;
  }
  return `${minutes}m ${remaining.toString().padStart(2, "0")}s`;
}

function recordRows(record: Record<string, number>) {
  return Object.entries(record)
    .filter(([, value]) => value > 0)
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]));
}

function taskTypeLabel(type: string, t: (key: string, fallback?: string) => string) {
  return t(`analytics.task.${type}`, type.split("_").join(" "));
}

function toolLabel(tool: string, t: (key: string, fallback?: string) => string) {
  return t(`analytics.tool.${tool}`, tool.split("_").join(" "));
}

function outcomeTone(outcome: string): "green" | "red" | "yellow" | "neutral" {
  if (["agent_hung_up", "caller_hung_up", "completed", "transferred"].includes(outcome)) {
    return "green";
  }
  if (["backend_shutdown", "failed", "network_error", "provider_error", "unknown"].includes(outcome)) {
    return "red";
  }
  if (["active", "timeout_5_minutes", "transferring"].includes(outcome)) {
    return "yellow";
  }
  return "neutral";
}

export function AnalyticsView({
  analytics,
  window,
  onWindowChange,
}: {
  analytics: LocalAnalytics | null;
  window: LogTimeWindow;
  onWindowChange: (window: LogTimeWindow) => void;
}) {
  const { t } = useI18n();
  const currentWindowLabel = t(windowLabelKeys[window]);

  if (!analytics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("analytics.title")}</CardTitle>
          <CardDescription>{t("analytics.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{t("analytics.unavailable")}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>{t("analytics.title")}</CardTitle>
            <CardDescription>{t("analytics.description")}</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-64">
            <Label htmlFor="analytics-window">{t("logs.timeRange")}</Label>
            <Select value={window} onValueChange={(value) => onWindowChange(value as LogTimeWindow)}>
              <SelectTrigger id="analytics-window">
                <SelectValue placeholder={t("logs.selectRange")} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(windowLabelKeys).map(([value, labelKey]) => (
                  <SelectItem key={value} value={value}>
                    {t(labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{formatMessage(t("analytics.windowLabel"), { range: currentWindowLabel })}</Badge>
            <Badge variant="outline">{formatMessage(t("analytics.generatedAt"), { time: formatDate(analytics.generated_at) })}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard icon={<PhoneCall />} label={t("analytics.totalCalls")} value={analytics.calls.total} />
            <MetricCard icon={<CheckCircle2 />} label={t("analytics.answeredCalls")} value={analytics.calls.answered} />
            <MetricCard icon={<PhoneOff />} label={t("analytics.needsAttention")} value={analytics.calls.failed_or_error} tone={analytics.calls.failed_or_error > 0 ? "red" : "neutral"} />
            <MetricCard icon={<Clock3 />} label={t("analytics.averageDuration")} value={formatDuration(analytics.calls.average_duration_seconds)} />
            <MetricCard icon={<CalendarClock />} label={t("analytics.bookingRequests")} value={analytics.highlights.booking_requests} />
            <MetricCard icon={<Inbox />} label={t("analytics.callbacks")} value={analytics.highlights.callbacks} />
            <MetricCard icon={<Inbox />} label={t("analytics.customerRequests")} value={analytics.highlights.customer_requests} />
            <MetricCard icon={<Inbox />} label={t("analytics.unresolvedQuestions")} value={analytics.highlights.unresolved_questions} />
            <MetricCard icon={<BarChart3 />} label={t("analytics.transferRequests")} value={analytics.highlights.transfer_requests} />
            <MetricCard icon={<Wrench />} label={t("analytics.providerFailures")} value={analytics.highlights.provider_failures} tone={analytics.highlights.provider_failures > 0 ? "red" : "neutral"} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <BreakdownTable
          title={t("analytics.callOutcomes")}
          description={t("analytics.callOutcomesDescription")}
          empty={t("analytics.noCallOutcomes")}
          rows={recordRows(analytics.calls.by_outcome)}
          labelFor={(key) => translateStatus(key, t)}
          badgeFor={(key) => <Badge tone={outcomeTone(key)}>{translateStatus(key, t)}</Badge>}
        />
        <BreakdownTable
          title={t("analytics.taskBreakdown")}
          description={t("analytics.taskBreakdownDescription")}
          empty={t("analytics.noTasks")}
          rows={recordRows(analytics.tasks.by_type)}
          labelFor={(key) => taskTypeLabel(key, t)}
        />
        <BreakdownTable
          title={t("analytics.toolUsage")}
          description={t("analytics.toolUsageDescription")}
          empty={t("analytics.noTools")}
          rows={recordRows(analytics.tools.by_tool)}
          labelFor={(key) => toolLabel(key, t)}
        />
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone?: "neutral" | "red";
}) {
  return (
    <div className="flex gap-3 rounded-lg bg-muted/40 p-4">
      <div className={tone === "red" ? "mt-0.5 shrink-0 text-destructive [&_svg]:h-4 [&_svg]:w-4" : "mt-0.5 shrink-0 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4"}>{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className={tone === "red" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{value}</p>
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  description,
  empty,
  rows,
  labelFor,
  badgeFor,
}: {
  title: string;
  description: string;
  empty: string;
  rows: Array<[string, number]>;
  labelFor: (key: string) => string;
  badgeFor?: (key: string) => ReactNode;
}) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{empty}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.type")}</TableHead>
                <TableHead className="text-right">{t("common.count")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([key, value]) => (
                <TableRow key={key}>
                  <TableCell>{badgeFor ? badgeFor(key) : labelFor(key)}</TableCell>
                  <TableCell className="text-right">{value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
