import { useState, type ReactNode } from "react";
import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogRecordDialog, type LogDetailRecord } from "@/features/logs/log-record-dialog";
import { SessionTable } from "@/features/logs/session-table";
import { formatDate } from "@/lib/format";
import { formatLifecycleLabel } from "@/lib/lifecycle";
import type { AppLogRecord, LogTimeWindow, PhoneCallRecord, SessionRecord, ToolCallRecord, TranscriptRecord } from "@/lib/types";

const logWindowLabels: Record<LogTimeWindow, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

type ActivityColumn<T> = {
  heading: string;
  className?: string;
  cell: (item: T) => ReactNode;
};

function ActivityTable<T>({
  title,
  description,
  items,
  empty,
  columns,
  getKey,
  onInspect,
}: {
  title: string;
  description: string;
  items: T[];
  empty: string;
  columns: ActivityColumn<T>[];
  getKey: (item: T, index: number) => string | number;
  onInspect: (item: T) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">{empty}</div>
        ) : (
          <ScrollArea className="h-[28rem]">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column.heading} className={column.className}>
                      {column.heading}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={getKey(item, index)} className="cursor-pointer" onClick={() => onInspect(item)}>
                    {columns.map((column) => (
                      <TableCell key={column.heading} className={column.className}>
                        {column.cell(item)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-semibold tracking-normal">{value}</div>
    </div>
  );
}

function phoneCallDurationSeconds(item: PhoneCallRecord) {
  const start = new Date(item.started_at).getTime();
  const end = item.ended_at ? new Date(item.ended_at).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "-";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes <= 0) return `${remaining}s`;
  return `${minutes}m ${remaining.toString().padStart(2, "0")}s`;
}

function providerLabel(provider: string) {
  return provider ? provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase() : "-";
}

function phoneCallSummary(phoneCalls: PhoneCallRecord[]) {
  const durations = phoneCalls.map(phoneCallDurationSeconds).filter((value): value is number => value !== null);
  const failures = phoneCalls.filter((item) => item.status === "failed" || Boolean(item.error_message));
  const longCalls = phoneCalls.filter((item) => {
    const duration = phoneCallDurationSeconds(item);
    return duration !== null && duration >= 240;
  });
  const maxDuration = durations.length ? Math.max(...durations) : null;
  const averageDuration = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;

  return {
    averageDuration,
    failures,
    longCalls,
    maxDuration,
  };
}

export function LogsView({
  sessions,
  selectedSessionId,
  onSelectSession,
  logWindow,
  onLogWindowChange,
  sessionTranscripts,
  sessionToolCalls,
  sessionAppLogs,
  sessionPhoneCalls,
  sessionDetailLoading,
  transcripts,
  toolCalls,
  appLogs,
  phoneCalls,
  onDownloadLogs,
}: {
  sessions: SessionRecord[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  logWindow: LogTimeWindow;
  onLogWindowChange: (window: LogTimeWindow) => void;
  sessionTranscripts: TranscriptRecord[];
  sessionToolCalls: ToolCallRecord[];
  sessionAppLogs: AppLogRecord[];
  sessionPhoneCalls: PhoneCallRecord[];
  sessionDetailLoading: boolean;
  transcripts: TranscriptRecord[];
  toolCalls: ToolCallRecord[];
  appLogs: AppLogRecord[];
  phoneCalls: PhoneCallRecord[];
  onDownloadLogs: () => void;
}) {
  const [detail, setDetail] = useState<LogDetailRecord | null>(null);
  const phoneSummary = phoneCallSummary(phoneCalls);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 space-y-0 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Logs</CardTitle>
            <CardDescription>Filter local sessions, transcripts, tool calls, and app logs by time range.</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={onDownloadLogs}>
            <Download className="h-4 w-4" />
            Download JSON
          </Button>
        </CardHeader>
        <CardContent className="grid gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_1fr]">
          <div className="space-y-2">
            <Label htmlFor="log-time-window">Time range</Label>
            <Select value={logWindow} onValueChange={(value) => onLogWindowChange(value as LogTimeWindow)}>
              <SelectTrigger id="log-time-window">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(logWindowLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Showing records from {logWindowLabels[logWindow].toLowerCase()}.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-5">
            <SummaryField label="Sessions" value={sessions.length} />
            <SummaryField label="Transcripts" value={transcripts.length} />
            <SummaryField label="Tool calls" value={toolCalls.length} />
            <SummaryField label="App logs" value={appLogs.length} />
            <SummaryField label="Phone calls" value={phoneCalls.length} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Phone Stability</CardTitle>
          <CardDescription>Use this after repeated real inbound calls to spot duration and failure patterns.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <SummaryField label="Long calls" value={phoneSummary.longCalls.length} />
          <SummaryField label="Failures" value={phoneSummary.failures.length} />
          <SummaryField label="Longest" value={formatDuration(phoneSummary.maxDuration)} />
          <SummaryField label="Average" value={formatDuration(phoneSummary.averageDuration)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>Click a session to open full conversation, tool calls, and event detail.</CardDescription>
        </CardHeader>
        <CardContent>
          <SessionTable
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSelect={onSelectSession}
            onInspect={(record) => setDetail({ kind: "session", record })}
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="transcripts">
        <TabsList className="grid w-full grid-cols-4 md:w-auto">
          <TabsTrigger value="transcripts">Transcripts</TabsTrigger>
          <TabsTrigger value="tools">Tool Calls</TabsTrigger>
          <TabsTrigger value="phone">Phone Calls</TabsTrigger>
          <TabsTrigger value="logs">App Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="transcripts">
          <ActivityTable
            title="Recent Transcripts"
            description="User and agent transcript records."
            items={transcripts.slice(0, 30)}
            empty="No transcripts in this range."
            getKey={(item, index) => `${item.session_id}-${item.created_at}-${index}`}
            onInspect={(record) => setDetail({ kind: "transcript", record })}
            columns={[
              {
                heading: "Time",
                className: "whitespace-nowrap",
                cell: (item) => formatDate(item.created_at),
              },
              {
                heading: "Speaker",
                cell: (item) => <Badge tone="neutral">{item.speaker}</Badge>,
              },
              {
                heading: "Content",
                className: "min-w-[24rem] max-w-[36rem] truncate",
                cell: (item) => item.content,
              },
              {
                heading: "Session",
                className: "max-w-[12rem] truncate text-muted-foreground",
                cell: (item) => item.session_id,
              },
            ]}
          />
        </TabsContent>
        <TabsContent value="tools">
          <ActivityTable
            title="Recent Tool Calls"
            description="Tool invocation input, output, and status."
            items={toolCalls.slice(0, 30)}
            empty="No tool calls in this range."
            getKey={(item) => item.id}
            onInspect={(record) => setDetail({ kind: "tool", record })}
            columns={[
              {
                heading: "Time",
                className: "whitespace-nowrap",
                cell: (item) => formatDate(item.started_at),
              },
              {
                heading: "Tool",
                className: "font-medium",
                cell: (item) => item.tool_name,
              },
              {
                heading: "Status",
                cell: (item) => <Badge tone={item.status === "error" ? "red" : "neutral"}>{item.status}</Badge>,
              },
              {
                heading: "Session",
                className: "max-w-[14rem] truncate text-muted-foreground",
                cell: (item) => item.session_id ?? "-",
              },
              {
                heading: "Error",
                className: "max-w-[18rem] truncate",
                cell: (item) => item.error_message ?? "-",
              },
            ]}
          />
        </TabsContent>
        <TabsContent value="phone">
          <ActivityTable
            title="Phone Calls"
            description="Inbound provider call records, duration, and failure reason."
            items={phoneCalls.slice(0, 30)}
            empty="No phone calls in this range."
            getKey={(item) => item.id}
            onInspect={(record) => setDetail({ kind: "phone", record })}
            columns={[
              {
                heading: "Started",
                className: "whitespace-nowrap",
                cell: (item) => formatDate(item.started_at),
              },
              {
                heading: "Provider",
                cell: (item) => providerLabel(item.provider),
              },
              {
                heading: "Duration",
                cell: (item) => formatDuration(phoneCallDurationSeconds(item)),
              },
              {
                heading: "Status",
                cell: (item) => <Badge tone={item.status === "failed" ? "red" : "neutral"}>{formatLifecycleLabel(item.status)}</Badge>,
              },
              {
                heading: "End reason",
                cell: (item) => formatLifecycleLabel(item.ended_reason),
              },
              {
                heading: "Route",
                className: "max-w-[18rem] truncate text-muted-foreground",
                cell: (item) => `${item.from_number || "-"} -> ${item.to_number || "-"}`,
              },
              {
                heading: "Error",
                className: "max-w-[18rem] truncate",
                cell: (item) => item.error_message ?? "-",
              },
            ]}
          />
        </TabsContent>
        <TabsContent value="logs">
          <ActivityTable
            title="App Logs"
            description="Runtime events and local backend notices."
            items={appLogs.slice(0, 30)}
            empty="No app logs in this range."
            getKey={(item) => item.id}
            onInspect={(record) => setDetail({ kind: "app-log", record })}
            columns={[
              {
                heading: "Time",
                className: "whitespace-nowrap",
                cell: (item) => formatDate(item.created_at),
              },
              {
                heading: "Level",
                cell: (item) => <Badge tone={item.level === "error" ? "red" : "neutral"}>{item.level}</Badge>,
              },
              {
                heading: "Event",
                className: "font-medium",
                cell: (item) => item.event,
              },
              {
                heading: "Message",
                className: "min-w-[24rem] max-w-[38rem] truncate",
                cell: (item) => item.message,
              },
            ]}
          />
        </TabsContent>
      </Tabs>

      <LogRecordDialog
        detail={detail}
        sessionTranscripts={sessionTranscripts}
        sessionToolCalls={sessionToolCalls}
        sessionAppLogs={sessionAppLogs}
        sessionPhoneCalls={sessionPhoneCalls}
        sessionDetailLoading={sessionDetailLoading}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
