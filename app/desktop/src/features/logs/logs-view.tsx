import { useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogRecordDialog, type LogDetailRecord } from "@/features/logs/log-record-dialog";
import { SessionTable } from "@/features/logs/session-table";
import { formatDate } from "@/lib/format";
import type { AppLogRecord, LogTimeWindow, SessionRecord, ToolCallRecord, TranscriptRecord } from "@/lib/types";

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

function SummaryField({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-semibold tracking-normal">{value}</div>
    </div>
  );
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
  sessionDetailLoading,
  transcripts,
  toolCalls,
  appLogs,
}: {
  sessions: SessionRecord[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  logWindow: LogTimeWindow;
  onLogWindowChange: (window: LogTimeWindow) => void;
  sessionTranscripts: TranscriptRecord[];
  sessionToolCalls: ToolCallRecord[];
  sessionAppLogs: AppLogRecord[];
  sessionDetailLoading: boolean;
  transcripts: TranscriptRecord[];
  toolCalls: ToolCallRecord[];
  appLogs: AppLogRecord[];
}) {
  const [detail, setDetail] = useState<LogDetailRecord | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
          <CardDescription>Filter local sessions, transcripts, tool calls, and app logs by time range.</CardDescription>
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
          <div className="grid gap-3 sm:grid-cols-4">
            <SummaryField label="Sessions" value={sessions.length} />
            <SummaryField label="Transcripts" value={transcripts.length} />
            <SummaryField label="Tool calls" value={toolCalls.length} />
            <SummaryField label="App logs" value={appLogs.length} />
          </div>
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
        <TabsList className="grid w-full grid-cols-3 md:w-auto">
          <TabsTrigger value="transcripts">Transcripts</TabsTrigger>
          <TabsTrigger value="tools">Tool Calls</TabsTrigger>
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
        sessionDetailLoading={sessionDetailLoading}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
