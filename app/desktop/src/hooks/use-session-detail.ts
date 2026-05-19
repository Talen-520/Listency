import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { AppLogRecord, PhoneCallRecord, ToolCallRecord, TranscriptRecord } from "@/lib/types";

export function useSessionDetail(sessionId: string | null) {
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [appLogs, setAppLogs] = useState<AppLogRecord[]>([]);
  const [phoneCalls, setPhoneCalls] = useState<PhoneCallRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setTranscripts([]);
      setToolCalls([]);
      setAppLogs([]);
      setPhoneCalls([]);
      return;
    }

    let isCurrent = true;
    setTranscripts([]);
    setToolCalls([]);
    setAppLogs([]);
    setPhoneCalls([]);
    setLoading(true);
    Promise.all([
      api.transcripts(sessionId, 500),
      api.toolCalls(sessionId, 200),
      api.appLogs(sessionId, 300),
      api.phoneCalls(sessionId, 20),
    ])
      .then(([transcriptList, toolCallList, appLogList, phoneCallList]) => {
        if (!isCurrent) return;
        setTranscripts(transcriptList.transcripts);
        setToolCalls(toolCallList.tool_calls);
        setAppLogs(appLogList.logs);
        setPhoneCalls(phoneCallList.phone_calls);
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
    phoneCalls,
    loading,
  };
}
