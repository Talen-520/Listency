import { Activity, Clock, Plug } from "lucide-react";

import { LivePanel } from "@/components/live-panel";
import { MetricCard } from "@/components/metric-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TranscriptBubble } from "@/features/logs/transcript-bubble";
import { compareCreatedAt, formatDate } from "@/lib/format";
import type { AppLogRecord, SessionRecord, ToolCallRecord, TranscriptRecord } from "@/lib/types";

export function SessionDetailPanel({
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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Session Detail</CardTitle>
            <CardDescription>{session ? session.id : "No session selected"}</CardDescription>
          </div>
          {session && <Badge tone={session.status === "error" ? "red" : session.status === "stopped" ? "neutral" : "cyan"}>{session.status}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!session ? (
          <div className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">No session selected.</div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <MetricCard label="Provider" value={session.provider} icon={Plug} />
              <MetricCard label="Reason" value={session.ended_reason ?? "-"} icon={Activity} />
              <MetricCard label="Started" value={formatDate(session.started_at)} icon={Clock} />
              <MetricCard label="Ended" value={formatDate(session.ended_at)} icon={Clock} />
            </div>
            {session.error_message && (
              <Alert variant="destructive">
                <AlertTitle>Session Error</AlertTitle>
                <AlertDescription>{session.error_message}</AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="conversation">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="conversation">Conversation</TabsTrigger>
                <TabsTrigger value="events">Events</TabsTrigger>
                <TabsTrigger value="tools">Tools</TabsTrigger>
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
              <TabsContent value="events">
                <LivePanel
                  title="Session Events"
                  items={orderedLogs.map((item) => `${formatDate(item.created_at)} ${item.event}: ${item.message}`)}
                  empty="No events for this session."
                />
              </TabsContent>
              <TabsContent value="tools">
                <LivePanel
                  title="Tool Calls"
                  items={orderedToolCalls.map((item) => `${formatDate(item.started_at)} ${item.tool_name} ${item.status}${item.error_message ? `: ${item.error_message}` : ""}`)}
                  empty="No tool calls for this session."
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}
