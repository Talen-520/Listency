import type { ReactNode } from "react";
import { Activity, Database, Mic, Play, Radio, Square, Timer } from "lucide-react";

import { LivePanel } from "@/components/live-panel";
import { ProviderBrandIcon } from "@/components/provider-brand-icon";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatBytes } from "@/lib/format";
import type { ActiveSession, TranscriptRecord } from "@/lib/types";

const providerDisplayNames: Record<string, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
};

function formatStatusValue(value: string) {
  const normalized = value.trim();
  const providerName = providerDisplayNames[normalized.toLowerCase()];

  if (providerName) {
    return providerName;
  }

  return normalized
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

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
        <TestCallStatusCard icon={<Mic className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />} label="Mic" value={formatStatusValue(micReady ? "ready" : "not checked")} />
        <TestCallStatusCard
          icon={<ProviderBrandIcon provider={providerChoice} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          label="Provider"
          value={formatStatusValue(providerChoice)}
        />
        <TestCallStatusCard icon={<Activity className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />} label="Stream" value={formatStatusValue(streamStatus)} />
        <TestCallStatusCard
          icon={<Timer className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          label="Timer"
          value={remainingSeconds === null ? formatStatusValue("idle") : `${remainingSeconds}s`}
        />
        <TestCallStatusCard
          icon={<Radio className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          label="Chunks"
          value={formatStatusValue(activeSession ? String(activeSession.audio_chunks) : "0")}
        />
        <TestCallStatusCard
          icon={<Database className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          label="Bytes"
          value={formatStatusValue(activeSession ? formatBytes(activeSession.audio_bytes) : "0 B")}
        />
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

function TestCallStatusCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-lg bg-muted/40 p-4">
      {icon}
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className="text-sm text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}
