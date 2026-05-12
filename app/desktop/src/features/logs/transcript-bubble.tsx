import { formatDate } from "@/lib/format";
import type { TranscriptRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TranscriptBubble({ item }: { item: TranscriptRecord }) {
  const alignment = item.speaker === "user" ? "justify-end" : "justify-start";

  return (
    <div className={cn("flex", alignment)}>
      <div className="max-w-[88%] rounded-md border bg-muted/40 px-3 py-2 text-foreground">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border bg-background px-2 py-0.5 font-medium text-foreground">{item.speaker}</span>
          <span>{formatDate(item.created_at)}</span>
        </div>
        <div className="whitespace-pre-wrap text-sm leading-6">{item.content}</div>
      </div>
    </div>
  );
}
