import { Activity, CircleDollarSign, Clock, Hash, Phone, Timer } from "lucide-react";

import { ProviderBrandIcon } from "@/components/provider-brand-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TranscriptBubble } from "@/features/logs/transcript-bubble";
import { compareCreatedAt, formatDate } from "@/lib/format";
import { translateStatus, useI18n } from "@/lib/i18n";
import type { AppLogRecord, PhoneCallRecord, SessionRecord, ToolCallRecord, TranscriptRecord } from "@/lib/types";

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
  phoneCalls,
  loading,
}: {
  session: SessionRecord | null;
  transcripts: TranscriptRecord[];
  toolCalls: ToolCallRecord[];
  appLogs: AppLogRecord[];
  phoneCalls: PhoneCallRecord[];
  loading: boolean;
}) {
  const { t } = useI18n();
  const orderedTranscripts = [...transcripts].sort(compareCreatedAt);
  const orderedLogs = [...appLogs].sort(compareCreatedAt);
  const orderedToolCalls = [...toolCalls].sort((left, right) => new Date(left.started_at).getTime() - new Date(right.started_at).getTime());
  const phoneCall = phoneCalls[0] ?? null;
  const estimatedTextTokens = estimateTextTokens(orderedTranscripts);

  return (
    <div className="space-y-5">
      {!session ? (
        <div className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">{t("shell.noActiveSession")}</div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg bg-muted/30 p-4">
              <div className="flex items-center justify-between pb-2">
                <p className="text-sm font-medium text-muted-foreground">{t("common.provider")}</p>
                <ProviderBrandIcon provider={session.provider} className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="break-words font-display text-lg font-semibold leading-none tracking-normal">{session.provider}</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-4">
              <div className="flex items-center justify-between pb-2">
                <p className="text-sm font-medium text-muted-foreground">{t("common.duration")}</p>
                <Timer className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="break-words font-display text-lg font-semibold leading-none tracking-normal">{formatDuration(session.started_at, session.ended_at)}</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-4">
              <div className="flex items-center justify-between pb-2">
                <p className="text-sm font-medium text-muted-foreground">Est. text tokens</p>
                <Hash className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="break-words font-display text-lg font-semibold leading-none tracking-normal">
                {estimatedTextTokens ? `~${estimatedTextTokens.toLocaleString()}` : "-"}
              </p>
            </div>
            <div className="rounded-lg bg-muted/30 p-4">
              <div className="flex items-center justify-between pb-2">
                <p className="text-sm font-medium text-muted-foreground">Token cost</p>
                <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="break-words font-display text-lg font-semibold leading-none tracking-normal">{t("status.notTracked", "Not tracked")}</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-4">
              <div className="flex items-center justify-between pb-2">
                <p className="text-sm font-medium text-muted-foreground">{t("common.reason")}</p>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="break-words font-display text-lg font-semibold leading-none tracking-normal">{translateStatus(session.ended_reason, t)}</p>
            </div>
            {phoneCall && (
              <div className="rounded-lg bg-muted/30 p-4">
                <div className="flex items-center justify-between pb-2">
                  <p className="text-sm font-medium text-muted-foreground">{t("common.phoneEnd")}</p>
                  <Phone className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="break-words font-display text-lg font-semibold leading-none tracking-normal">
                  {translateStatus(phoneCall.ended_reason ?? phoneCall.status, t)}
                </p>
              </div>
            )}
            {phoneCall && (
              <div className="rounded-lg bg-muted/30 p-4">
                <div className="flex items-center justify-between pb-2">
                  <p className="text-sm font-medium text-muted-foreground">{t("common.callRoute")}</p>
                  <Phone className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="break-words font-display text-sm font-semibold leading-snug tracking-normal">
                  {(phoneCall.from_number || "-")}{" -> "}{(phoneCall.to_number || "-")}
                </p>
              </div>
            )}
            <div className="rounded-lg bg-muted/30 p-4">
              <div className="flex items-center justify-between pb-2">
                <p className="text-sm font-medium text-muted-foreground">{t("common.started")}</p>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="break-words font-display text-lg font-semibold leading-none tracking-normal">{formatDate(session.started_at)}</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-4">
              <div className="flex items-center justify-between pb-2">
                <p className="text-sm font-medium text-muted-foreground">{t("common.ended")}</p>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="break-words font-display text-lg font-semibold leading-none tracking-normal">{formatDate(session.ended_at)}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("logs.tokenEstimateNote", "Estimated text tokens are based on transcript length. Provider token cost requires usage metadata and is not tracked for this session yet.")}
          </p>
          {session.error_message && (
            <Alert variant="destructive">
              <AlertTitle>{t("logs.sessionError", "Session Error")}</AlertTitle>
              <AlertDescription>{session.error_message}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="conversation">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="conversation">{t("logs.conversation", "Conversation")}</TabsTrigger>
              <TabsTrigger value="tools">{t("common.tools")}</TabsTrigger>
              <TabsTrigger value="events">{t("common.events")}</TabsTrigger>
            </TabsList>
            <TabsContent value="conversation">
              <Card className="shadow-none">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm">{t("logs.conversation", "Conversation")}</CardTitle>
                    {loading && <span className="text-xs text-muted-foreground">{t("common.loading")}</span>}
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[28rem] pr-3">
                    {orderedTranscripts.length === 0 ? (
                      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">{t("logs.noSessionTranscript", "No transcript for this session.")}</div>
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
                  <CardTitle className="text-sm">{t("common.toolCalls")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {orderedToolCalls.length === 0 ? (
                    <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">{t("logs.noSessionToolCalls", "No tool calls for this session.")}</div>
                  ) : (
                    <ScrollArea className="h-[28rem]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("common.time")}</TableHead>
                            <TableHead>{t("common.tool")}</TableHead>
                            <TableHead>{t("common.status")}</TableHead>
                            <TableHead>{t("common.input")}</TableHead>
                            <TableHead>{t("common.output")}</TableHead>
                            <TableHead>{t("common.error")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderedToolCalls.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="whitespace-nowrap">{formatDate(item.started_at)}</TableCell>
                              <TableCell className="font-medium">{item.tool_name}</TableCell>
                              <TableCell>{translateStatus(item.status, t)}</TableCell>
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
                  <CardTitle className="text-sm">{t("logs.sessionEvents", "Session Events")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {orderedLogs.length === 0 ? (
                    <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">{t("logs.noSessionEvents", "No events for this session.")}</div>
                  ) : (
                    <ScrollArea className="h-[28rem]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("common.time")}</TableHead>
                            <TableHead>{t("common.level")}</TableHead>
                            <TableHead>{t("common.event")}</TableHead>
                            <TableHead>{t("common.message")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderedLogs.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="whitespace-nowrap">{formatDate(item.created_at)}</TableCell>
                              <TableCell>{translateStatus(item.level, t)}</TableCell>
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
  phoneCalls: PhoneCallRecord[];
  loading: boolean;
}) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t("logs.sessionDetail", "Session Detail")}</CardTitle>
            <CardDescription>{props.session ? props.session.id : t("shell.noActiveSession")}</CardDescription>
          </div>
          {props.session && (
            <Badge tone={props.session.status === "error" ? "red" : props.session.status === "stopped" ? "neutral" : "cyan"}>
              {translateStatus(props.session.status, t)}
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
