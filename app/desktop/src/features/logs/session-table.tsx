import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { translateStatus, useI18n } from "@/lib/i18n";
import type { SessionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SessionTable({
  sessions,
  selectedSessionId,
  onSelect,
  onInspect,
}: {
  sessions: SessionRecord[];
  selectedSessionId?: string | null;
  onSelect?: (sessionId: string) => void;
  onInspect?: (session: SessionRecord) => void;
}) {
  const { t } = useI18n();

  if (sessions.length === 0) {
    return <div className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">{t("logs.noSessions")}</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("common.provider")}</TableHead>
          <TableHead>{t("common.status")}</TableHead>
          <TableHead>{t("common.started")}</TableHead>
          <TableHead>{t("common.ended")}</TableHead>
          <TableHead>{t("common.reason")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="divide-y divide-border">
        {sessions.map((session) => (
          <TableRow
            key={session.id}
            className={cn((onSelect || onInspect) && "cursor-pointer", selectedSessionId === session.id && "bg-muted")}
            onClick={() => {
              onSelect?.(session.id);
              onInspect?.(session);
            }}
          >
            <TableCell className="font-medium">{session.provider}</TableCell>
            <TableCell>{translateStatus(session.status, t)}</TableCell>
            <TableCell>{formatDate(session.started_at)}</TableCell>
            <TableCell>{formatDate(session.ended_at)}</TableCell>
            <TableCell>{translateStatus(session.ended_reason, t)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
