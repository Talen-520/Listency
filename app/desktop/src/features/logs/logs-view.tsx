import { LivePanel } from "@/components/live-panel";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionDetailPanel } from "@/features/logs/session-detail-panel";
import { SessionTable } from "@/features/logs/session-table";
import { formatDate } from "@/lib/format";
import type { AppLogRecord, SessionRecord, ToolCallRecord, TranscriptRecord } from "@/lib/types";

export function LogsView({
  sessions,
  selectedSession,
  selectedSessionId,
  onSelectSession,
  sessionTranscripts,
  sessionToolCalls,
  sessionAppLogs,
  sessionDetailLoading,
  transcripts,
  toolCalls,
  appLogs,
}: {
  sessions: SessionRecord[];
  selectedSession: SessionRecord | null;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  sessionTranscripts: TranscriptRecord[];
  sessionToolCalls: ToolCallRecord[];
  sessionAppLogs: AppLogRecord[];
  sessionDetailLoading: boolean;
  transcripts: TranscriptRecord[];
  toolCalls: ToolCallRecord[];
  appLogs: AppLogRecord[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Sessions</h2>
        <p className="text-sm text-muted-foreground">Click a row to inspect transcript and tool calls.</p>
      </div>
      <Separator />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <SessionTable sessions={sessions} selectedSessionId={selectedSessionId} onSelect={onSelectSession} />
        <SessionDetailPanel
          session={selectedSession}
          transcripts={sessionTranscripts}
          toolCalls={sessionToolCalls}
          appLogs={sessionAppLogs}
          loading={sessionDetailLoading}
        />
      </div>

      <div className="pt-2">
        <h2 className="text-lg font-semibold">Recent Activity</h2>
        <p className="text-sm text-muted-foreground">Transcript, tool, and app log streams.</p>
      </div>
      <Separator />
      <Tabs defaultValue="transcripts">
        <TabsList className="grid w-full grid-cols-3 md:w-auto">
          <TabsTrigger value="transcripts">Transcripts</TabsTrigger>
          <TabsTrigger value="tools">Tool Calls</TabsTrigger>
          <TabsTrigger value="logs">App Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="transcripts">
          <LivePanel
            title="Recent Transcripts"
            items={transcripts.slice(0, 12).map((item) => `${formatDate(item.created_at)} ${item.speaker}: ${item.content}`)}
            empty="No transcripts yet."
          />
        </TabsContent>
        <TabsContent value="tools">
          <LivePanel
            title="Recent Tool Calls"
            items={toolCalls.slice(0, 12).map((item) => `${formatDate(item.started_at)} ${item.tool_name} ${item.status}`)}
            empty="No tool calls yet."
          />
        </TabsContent>
        <TabsContent value="logs">
          <LivePanel
            title="App Logs"
            items={appLogs.slice(0, 12).map((item) => `${formatDate(item.created_at)} ${item.level} ${item.event}: ${item.message}`)}
            empty="No app logs yet."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
