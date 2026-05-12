import { Activity, CircleDollarSign, Clock, Hash, Plug, Timer } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TranscriptBubble } from "@/features/logs/transcript-bubble";
import { compareCreatedAt, formatDate } from "@/lib/format";
import type { AppLogRecord, SessionRecord, ToolCallRecord, TranscriptRecord } from "@/lib/types";

function formatJsonPreview(value: string | null) {
  if (!value) return "-";
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value;
  }
}

function formatDuration(startedAt: string, endedAt: string | null) {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "-";

  const totalSeconds = Math.round((end - start) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function estimateTextTokens(transcripts: TranscriptRecord[]) {
  const content = transcripts.map((item) => item.content.trim()).filter(Boolean).join("\n");
  if (!content) return 0;
  return Math.ceil(content.length / 4);
}

export function SessionDetailContent({
  session,
  transcripts,
  toolCalls,
  appLogs,
  loading,
}: {
  session: SessionRecord | null;
  transcripts: TranscriptRecord[];
  toolCalls: ToolCallRecord[];
  appLogs: AppLogRecord[];
  loading: boolean;
}) {
  const orderedTranscripts = [...transcripts].sort(compareCreatedAt);
  const orderedLogs = [...appLogs].sort(compareCreatedAt);
  const orderedToolCalls = [...toolCalls].sort((left, right) => new Date(left.started_at).getTime() - new Date(right.started_at).getTime());
  const estimatedTextTokens = estimateTextTokens(orderedTranscripts);

  return (
    <div className="space-y-5">
      {!session ? (
        <div className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">No session selected.</div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Provider" value={session.provider} icon={Plug} />
            <MetricCard label="Duration" value={formatDuration(session.started_at, session.ended_at)} icon={Timer} />
            <MetricCard label="Est. text tokens" value={estimatedTextTokens ? `~${estimatedTextTokens.toLocaleString()}` : "-"} icon={Hash} />
            <MetricCard label="Token cost" value="Not tracked" icon={CircleDollarSign} />
            <MetricCard label="Reason" value={session.ended_reason ?? "-"} icon={Activity} />
            <MetricCard label="Started" value={formatDate(session.started_at)} icon={Clock} />
            <MetricCard label="Ended" value={formatDate(session.ended_at)} icon={Clock} />
          </div>
          <p className="text-xs text-muted-foreground">
            Estimated text tokens are based on transcript length. Provider token cost requires usage metadata and is not tracked for this session yet.
          </p>
          {session.error_message && (
            <Alert variant="destructive">
              <AlertTitle>Session Error</AlertTitle>
              <AlertDescription>{session.error_message}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="conversation">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="conversation">Conversation</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
            </TabsList>
            <TabsContent value="conversation">
              <Card className="shadow-none">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm">Conversation</CardTitle>
                    {loading && <span className="text-xs text-muted-foreground">Loading</span>}
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[28rem] pr-3">
                    {orderedTranscripts.length === 0 ? (
                      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">No transcript for this session.</div>
                    ) : (
                      <div className="space-y-3">
                        {orderedTranscripts.map((item, index) => (
                          <TranscriptBubble key={`${item.created_at}-${index}`} item={item} />
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="tools">
              <Card className="shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Tool Calls</CardTitle>
                </CardHeader>
                <CardContent>
                  {orderedToolCalls.length === 0 ? (
                    <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">No tool calls for this session.</div>
                  ) : (
                    <ScrollArea className="h-[28rem]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Tool</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Input</TableHead>
                            <TableHead>Output</TableHead>
                            <TableHead>Error</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderedToolCalls.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="whitespace-nowrap">{formatDate(item.started_at)}</TableCell>
                              <TableCell className="font-medium">{item.tool_name}</TableCell>
                              <TableCell>{item.status}</TableCell>
                              <TableCell className="max-w-[18rem] truncate font-mono text-xs">{formatJsonPreview(item.input_json)}</TableCell>
                              <TableCell className="max-w-[18rem] truncate font-mono text-xs">{formatJsonPreview(item.output_json)}</TableCell>
                              <TableCell className="max-w-[16rem] truncate">{item.error_message ?? "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="events">
              <Card className="shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Session Events</CardTitle>
                </CardHeader>
                <CardContent>
                  {orderedLogs.length === 0 ? (
                    <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">No events for this session.</div>
                  ) : (
                    <ScrollArea className="h-[28rem]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Level</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead>Message</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderedLogs.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="whitespace-nowrap">{formatDate(item.created_at)}</TableCell>
                              <TableCell>{item.level}</TableCell>
                              <TableCell className="font-medium">{item.event}</TableCell>
                              <TableCell className="max-w-[28rem] truncate">{item.message}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

export function SessionDetailPanel(props: {
  session: SessionRecord | null;
  transcripts: TranscriptRecord[];
  toolCalls: ToolCallRecord[];
  appLogs: AppLogRecord[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Session Detail</CardTitle>
            <CardDescription>{props.session ? props.session.id : "No session selected"}</CardDescription>
          </div>
          {props.session && (
            <Badge tone={props.session.status === "error" ? "red" : props.session.status === "stopped" ? "neutral" : "cyan"}>
              {props.session.status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <SessionDetailContent {...props} />
      </CardContent>
    </Card>
  );
}
