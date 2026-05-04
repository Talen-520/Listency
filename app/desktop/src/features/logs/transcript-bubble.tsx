import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { TranscriptRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TranscriptBubble({ item }: { item: TranscriptRecord }) {
  const speakerTone = item.speaker === "assistant" ? "cyan" : item.speaker === "user" ? "green" : "neutral";
  const alignment = item.speaker === "assistant" ? "justify-start" : item.speaker === "user" ? "justify-end" : "justify-center";
  const bubbleClass =
    item.speaker === "assistant"
      ? "bg-muted text-foreground"
      : item.speaker === "user"
        ? "bg-primary text-primary-foreground"
        : "bg-background text-muted-foreground";

  return (
    <div className={cn("flex", alignment)}>
      <div className={cn("max-w-[88%] rounded-md border px-3 py-2", bubbleClass)}>
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge tone={speakerTone}>{item.speaker}</Badge>
          <span>{formatDate(item.created_at)}</span>
        </div>
        <div className="whitespace-pre-wrap text-sm leading-6">{item.content}</div>
      </div>
    </div>
  );
}
