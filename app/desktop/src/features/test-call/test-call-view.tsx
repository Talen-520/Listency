import { Activity, Database, Mic, Play, Plug, Radio, Square, Timer } from "lucide-react";

import { LivePanel } from "@/components/live-panel";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatBytes } from "@/lib/format";
import type { ActiveSession, TranscriptRecord } from "@/lib/types";

export function TestCallView({
  micReady,
  providerChoice,
  streamStatus,
  remainingSeconds,
  activeSession,
  selectedProviderReady,
  liveEvents,
  transcripts,
  onRequestMic,
  onStartTest,
  onStopSession,
}: {
  micReady: boolean;
  providerChoice: string;
  streamStatus: string;
  remainingSeconds: number | null;
  activeSession?: ActiveSession;
  selectedProviderReady: boolean;
  liveEvents: string[];
  transcripts: TranscriptRecord[];
  onRequestMic: () => void;
  onStartTest: () => void;
  onStopSession: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Test Call</h2>
        <p className="text-sm text-muted-foreground">Local microphone to selected Realtime provider.</p>
      </div>
      <Separator />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Mic" value={micReady ? "ready" : "not checked"} icon={Mic} />
        <MetricCard label="Provider" value={providerChoice} icon={Plug} />
        <MetricCard label="Stream" value={streamStatus} icon={Activity} />
        <MetricCard label="Timer" value={remainingSeconds === null ? "idle" : `${remainingSeconds}s`} icon={Timer} />
        <MetricCard label="Chunks" value={activeSession ? String(activeSession.audio_chunks) : "0"} icon={Radio} />
        <MetricCard label="Bytes" value={activeSession ? formatBytes(activeSession.audio_bytes) : "0 B"} icon={Database} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={onRequestMic}>
          <Mic className="h-4 w-4" />
          Check Mic
        </Button>
        <Button disabled={!selectedProviderReady || Boolean(activeSession)} onClick={onStartTest}>
          <Play className="h-4 w-4" />
          Start Test
        </Button>
        <Button variant="destructive" disabled={!activeSession} onClick={onStopSession}>
          <Square className="h-4 w-4" />
          Stop Session
        </Button>
      </div>
      <Separator />
      <div className="grid gap-4 lg:grid-cols-2">
        <LivePanel title="Live Events" items={liveEvents} empty="No stream events yet." />
        <LivePanel
          title="Session Transcript"
          items={transcripts.slice(0, 8).map((item) => `${item.speaker}: ${item.content}`)}
          empty="No transcript events yet."
        />
      </div>
    </div>
  );
}
