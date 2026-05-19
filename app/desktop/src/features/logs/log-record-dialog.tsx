import { useEffect } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SessionDetailContent } from "@/features/logs/session-detail-panel";
import { formatDate } from "@/lib/format";
import { formatLifecycleLabel } from "@/lib/lifecycle";
import type { AppLogRecord, PhoneCallRecord, SessionRecord, ToolCallRecord, TranscriptRecord } from "@/lib/types";

export type LogDetailRecord =
  | { kind: "session"; record: SessionRecord }
  | { kind: "transcript"; record: TranscriptRecord }
  | { kind: "tool"; record: ToolCallRecord }
  | { kind: "app-log"; record: AppLogRecord };

type DetailRow = {
  label: string;
  value: string | number | null | undefined;
  code?: boolean;
};

function formatJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function detailRows(detail: LogDetailRecord): { title: string; description: string; badge: string; rows: DetailRow[] } {
  if (detail.kind === "session") {
    const { record } = detail;
    return {
      title: "Session",
      description: record.id,
      badge: record.status,
      rows: [
        { label: "Provider", value: record.provider },
        { label: "Mode", value: record.mode },
        { label: "Status", value: formatLifecycleLabel(record.status) },
        { label: "Started", value: formatDate(record.started_at) },
        { label: "Ended", value: formatDate(record.ended_at) },
        { label: "End reason", value: formatLifecycleLabel(record.ended_reason) },
        { label: "Timeout", value: formatDate(record.timeout_at) },
        { label: "Error", value: record.error_message ?? "-" },
      ],
    };
  }

  if (detail.kind === "transcript") {
    const { record } = detail;
    return {
      title: "Transcript",
      description: record.session_id,
      badge: record.speaker,
      rows: [
        { label: "Session", value: record.session_id },
        { label: "Speaker", value: record.speaker },
        { label: "Created", value: formatDate(record.created_at) },
        { label: "Final", value: record.is_final ? "yes" : "no" },
        { label: "Content", value: record.content, code: true },
      ],
    };
  }

  if (detail.kind === "tool") {
    const { record } = detail;
    return {
      title: "Tool Call",
      description: record.session_id ?? "No session",
      badge: record.status,
      rows: [
        { label: "Tool", value: record.tool_name },
        { label: "Session", value: record.session_id ?? "-" },
        { label: "Status", value: record.status },
        { label: "Started", value: formatDate(record.started_at) },
        { label: "Ended", value: formatDate(record.ended_at) },
        { label: "Error", value: record.error_message ?? "-" },
        { label: "Input", value: formatJson(record.input_json), code: true },
        { label: "Output", value: formatJson(record.output_json), code: true },
      ],
    };
  }

  const { record } = detail;
  return {
    title: "App Log",
    description: record.event,
    badge: record.level,
    rows: [
      { label: "Level", value: record.level },
      { label: "Event", value: record.event },
      { label: "Created", value: formatDate(record.created_at) },
      { label: "Message", value: record.message, code: true },
      { label: "Metadata", value: formatJson(record.metadata_json), code: true },
    ],
  };
}

export function LogRecordDialog({
  detail,
  sessionTranscripts,
  sessionToolCalls,
  sessionAppLogs,
  sessionPhoneCalls,
  sessionDetailLoading,
  onClose,
}: {
  detail: LogDetailRecord | null;
  sessionTranscripts: TranscriptRecord[];
  sessionToolCalls: ToolCallRecord[];
  sessionAppLogs: AppLogRecord[];
  sessionPhoneCalls: PhoneCallRecord[];
  sessionDetailLoading: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!detail) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detail, onClose]);

  if (!detail) return null;

  const view = detailRows(detail);
  const isSession = detail.kind === "session";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={onClose}
    >
      <Card
        className="max-h-[86vh] w-full max-w-5xl shadow-xl"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 border-b">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>{view.title}</CardTitle>
              <Badge tone="neutral">{view.badge}</Badge>
            </div>
            <CardDescription className="break-all">{view.description}</CardDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close detail" onClick={onClose}>
            <X />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isSession ? (
            <ScrollArea className="h-[72vh]">
              <div className="p-5">
                <SessionDetailContent
                  session={detail.record}
                  transcripts={sessionTranscripts}
                  toolCalls={sessionToolCalls}
                  appLogs={sessionAppLogs}
                  phoneCalls={sessionPhoneCalls}
                  loading={sessionDetailLoading}
                />
              </div>
            </ScrollArea>
          ) : (
            <ScrollArea className="h-[64vh]">
              <div className="space-y-4 p-5">
                {view.rows.map((row) => (
                  <div key={row.label} className="grid gap-2 rounded-md border bg-muted/20 p-4 md:grid-cols-[9rem_1fr]">
                    <div className="text-sm font-medium text-muted-foreground">{row.label}</div>
                    {row.code ? (
                      <pre className="whitespace-pre-wrap break-words rounded-md bg-background p-3 font-mono text-xs text-foreground">
                        {row.value ?? "-"}
                      </pre>
                    ) : (
                      <div className="break-words text-sm text-foreground">{row.value ?? "-"}</div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
