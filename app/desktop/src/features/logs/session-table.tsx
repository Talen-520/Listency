import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
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
  if (sessions.length === 0) {
    return <div className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">No sessions yet.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Provider</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Ended</TableHead>
          <TableHead>Reason</TableHead>
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
            <TableCell>{session.status}</TableCell>
            <TableCell>{formatDate(session.started_at)}</TableCell>
            <TableCell>{formatDate(session.ended_at)}</TableCell>
            <TableCell>{session.ended_reason ?? "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
