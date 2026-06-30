import { useEffect } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SessionDetailContent } from "@/features/logs/session-detail-panel";
import { formatDate } from "@/lib/format";
import { translateStatus, useI18n } from "@/lib/i18n";
import type { AppLogRecord, PhoneCallRecord, SessionRecord, ToolCallRecord, TranscriptRecord } from "@/lib/types";

export type LogDetailRecord =
  | { kind: "session"; record: SessionRecord }
  | { kind: "transcript"; record: TranscriptRecord }
  | { kind: "tool"; record: ToolCallRecord }
  | { kind: "phone"; record: PhoneCallRecord }
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

function detailRows(
  detail: LogDetailRecord,
  t: (key: string, fallback?: string) => string,
): { title: string; description: string; badge: string; rows: DetailRow[] } {
  if (detail.kind === "session") {
    const { record } = detail;
    return {
      title: t("common.session"),
      description: record.id,
      badge: translateStatus(record.status, t),
      rows: [
        { label: t("common.provider"), value: record.provider },
        { label: t("common.mode"), value: record.mode },
        { label: t("common.status"), value: translateStatus(record.status, t) },
        { label: t("common.started"), value: formatDate(record.started_at) },
        { label: t("common.ended"), value: formatDate(record.ended_at) },
        { label: t("common.endReason"), value: translateStatus(record.ended_reason, t) },
        { label: t("common.timeout"), value: formatDate(record.timeout_at) },
        { label: t("common.error"), value: record.error_message ?? "-" },
      ],
    };
  }

  if (detail.kind === "transcript") {
    const { record } = detail;
    return {
      title: t("common.transcripts"),
      description: record.session_id,
      badge: translateStatus(record.speaker, t),
      rows: [
        { label: t("common.session"), value: record.session_id },
        { label: t("common.speaker"), value: translateStatus(record.speaker, t) },
        { label: t("common.created"), value: formatDate(record.created_at) },
        { label: t("common.final"), value: record.is_final ? t("status.yes") : t("status.no") },
        { label: t("common.content"), value: record.content, code: true },
      ],
    };
  }

  if (detail.kind === "tool") {
    const { record } = detail;
    return {
      title: t("common.toolCalls"),
      description: record.session_id ?? t("shell.noActiveSession"),
      badge: translateStatus(record.status, t),
      rows: [
        { label: t("common.tool"), value: record.tool_name },
        { label: t("common.session"), value: record.session_id ?? "-" },
        { label: t("common.status"), value: translateStatus(record.status, t) },
        { label: t("common.started"), value: formatDate(record.started_at) },
        { label: t("common.ended"), value: formatDate(record.ended_at) },
        { label: t("common.error"), value: record.error_message ?? "-" },
        { label: t("common.input"), value: formatJson(record.input_json), code: true },
        { label: t("common.output"), value: formatJson(record.output_json), code: true },
      ],
    };
  }

  if (detail.kind === "phone") {
    const { record } = detail;
    return {
      title: t("common.phoneCalls"),
      description: record.provider_call_id,
      badge: translateStatus(record.status, t),
      rows: [
        { label: t("common.provider"), value: record.provider },
        { label: t("common.providerCallId"), value: record.provider_call_id },
        { label: t("common.streamId"), value: record.provider_stream_id ?? "-" },
        { label: t("common.session"), value: record.session_id ?? "-" },
        { label: t("common.route"), value: `${record.from_number || "-"} -> ${record.to_number || "-"}` },
        { label: t("common.status"), value: translateStatus(record.status, t) },
        { label: t("businessHours.title", "Business Hours"), value: translateStatus(record.business_hours_status || "not_tracked", t) },
        { label: t("common.policy", "Policy"), value: translateStatus(record.business_hours_policy || record.business_hours_mode, t) },
        { label: t("common.reason"), value: record.business_hours_reason || "-" },
        { label: t("common.endReason"), value: translateStatus(record.ended_reason, t) },
        { label: t("common.duration"), value: formatDuration(record.started_at, record.ended_at) },
        { label: t("common.started"), value: formatDate(record.started_at) },
        { label: t("common.answered"), value: formatDate(record.answered_at) },
        { label: t("common.ended"), value: formatDate(record.ended_at) },
        { label: t("common.error"), value: record.error_message ?? "-" },
      ],
    };
  }

  const { record } = detail;
  return {
    title: t("logs.appLogs"),
    description: record.event,
    badge: translateStatus(record.level, t),
    rows: [
      { label: t("common.level"), value: translateStatus(record.level, t) },
      { label: t("common.event"), value: record.event },
      { label: t("common.created"), value: formatDate(record.created_at) },
      { label: t("common.message"), value: record.message, code: true },
      { label: t("common.metadata"), value: formatJson(record.metadata_json), code: true },
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
  const { t } = useI18n();

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

  const view = detailRows(detail, t);
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
          <Button type="button" variant="ghost" size="icon" aria-label={t("action.close", "Close detail")} onClick={onClose}>
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
