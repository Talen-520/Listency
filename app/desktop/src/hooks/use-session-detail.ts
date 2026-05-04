import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { AppLogRecord, ToolCallRecord, TranscriptRecord } from "@/lib/types";

export function useSessionDetail(sessionId: string | null) {
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [appLogs, setAppLogs] = useState<AppLogRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setTranscripts([]);
      setToolCalls([]);
      setAppLogs([]);
      return;
    }

    let isCurrent = true;
    setLoading(true);
    Promise.all([api.transcripts(sessionId, 500), api.toolCalls(sessionId, 200), api.appLogs(sessionId, 300)])
      .then(([transcriptList, toolCallList, appLogList]) => {
        if (!isCurrent) return;
        setTranscripts(transcriptList.transcripts);
        setToolCalls(toolCallList.tool_calls);
        setAppLogs(appLogList.logs);
      })
      .catch((err) => {
        if (isCurrent) {
          toast.error(err instanceof Error ? err.message : "Session detail unavailable");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [sessionId]);

  return {
    transcripts,
    toolCalls,
    appLogs,
    loading,
  };
}
