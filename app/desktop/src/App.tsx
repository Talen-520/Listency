import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  Activity,
  Bot,
  Database,
  FileText,
  KeyRound,
  Mic,
  PhoneForwarded,
  Play,
  Settings,
  Square,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import { api } from "./lib/api";
import type {
  AgentProfile,
  BusinessProfile,
  ProviderInfo,
  PublicConfig,
  RuntimeStatus,
  SessionRecord,
  ToolCallRecord,
  ToolInfo,
  TranscriptRecord,
} from "./lib/types";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { cn } from "./lib/utils";

type View = "dashboard" | "agent" | "voice" | "business" | "tools" | "test" | "logs" | "settings";

const navItems: Array<{ id: View; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "business", label: "Business Info", icon: FileText },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "test", label: "Test Call", icon: PhoneForwarded },
  { id: "logs", label: "Logs", icon: TerminalSquare },
  { id: "settings", label: "Settings", icon: Settings },
];

const emptyConfig: PublicConfig = {
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  DEFAULT_REALTIME_PROVIDER: "openai",
  DEFAULT_VOICE: "",
  has_openai_key: false,
  has_gemini_key: false,
  env_path: "",
};

const emptyStatus: RuntimeStatus = {
  background_status: "stopped",
  active_sessions: [],
  last_error: null,
  session_limit_seconds: 300,
};

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [status, setStatus] = useState<RuntimeStatus>(emptyStatus);
  const [config, setConfig] = useState<PublicConfig>(emptyConfig);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [business, setBusiness] = useState<BusinessProfile>({ id: "default", name: "Default Business", content: "", updated_at: null });
  const [agent, setAgent] = useState<AgentProfile>({
    id: "default",
    name: "Default Agent",
    system_prompt: "You are a helpful local business voice agent. Keep responses concise and natural.",
    updated_at: null,
  });
  const [openAiKey, setOpenAiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [providerChoice, setProviderChoice] = useState("openai");
  const [voice, setVoice] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micReady, setMicReady] = useState(false);
  const [streamStatus, setStreamStatus] = useState("idle");
  const [liveEvents, setLiveEvents] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const activeSession = status.active_sessions[0];
  const remainingSeconds = useMemo(() => {
    if (!activeSession) return null;
    return Math.max(0, Math.ceil((new Date(activeSession.timeout_at).getTime() - now) / 1000));
  }, [activeSession, now]);

  async function loadAll() {
    try {
      const [runtime, cfg, providerList, toolList, sessionList, transcriptList, toolCallList, businessProfile, agentProfile] = await Promise.all([
        api.runtimeStatus(),
        api.getConfig(),
        api.providers(),
        api.tools(),
        api.sessions(),
        api.transcripts(),
        api.toolCalls(),
        api.businessProfile(),
        api.agent(),
      ]);
      setStatus(runtime);
      setConfig(cfg);
      setProviders(providerList.providers);
      setTools(toolList.tools);
      setSessions(sessionList.sessions);
      setTranscripts(transcriptList.transcripts);
      setToolCalls(toolCallList.tool_calls);
      setBusiness(businessProfile);
      setAgent(agentProfile);
      setProviderChoice(cfg.DEFAULT_REALTIME_PROVIDER || "openai");
      setVoice(cfg.DEFAULT_VOICE || "");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backend unavailable");
    }
  }

  useEffect(() => {
    loadAll();
    const refresh = window.setInterval(() => {
      setNow(Date.now());
      api.runtimeStatus()
        .then((runtime) => {
          setStatus(runtime);
          if (runtime.active_sessions.length === 0 && socketRef.current) {
            cleanupLocalStream();
            setStreamStatus("idle");
          }
        })
        .catch(() => undefined);
    }, 1000);
    return () => {
      window.clearInterval(refresh);
      cleanupLocalStream();
    };
  }, []);

  async function runAction(action: () => Promise<unknown>, message: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(message);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function requestMic() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicReady(true);
      setNotice("Microphone ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone permission failed");
    }
  }

  async function saveSettings() {
    await api.saveConfig({
      openai_api_key: openAiKey,
      gemini_api_key: geminiKey,
      default_realtime_provider: providerChoice,
      default_voice: voice,
    });
    setOpenAiKey("");
    setGeminiKey("");
  }

  function appendEvent(message: string) {
    const time = new Date().toLocaleTimeString();
    setLiveEvents((current) => [`${time} ${message}`, ...current].slice(0, 12));
  }

  function cleanupLocalStream() {
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
    }
    processorRef.current = null;

    sourceRef.current?.disconnect();
    sourceRef.current = null;

    silentGainRef.current?.disconnect();
    silentGainRef.current = null;

    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify({ type: "audio.stop" }));
        socketRef.current.close();
      } catch {
        // The socket may already be closing.
      }
    }
    socketRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startLiveTest() {
    setError(null);
    setNotice(null);
    setLiveEvents([]);
    setStreamStatus("requesting mic");

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    setMicReady(true);

    try {
      const session = await api.startTestSession(providerChoice);
      appendEvent(`session ${session.id.slice(0, 8)} started`);

      const socket = new WebSocket(api.sessionStreamUrl(session.id));
      socketRef.current = socket;
      setStreamStatus("connecting");

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        appendEvent(payload.type);
        if (payload.transcript) {
          setTranscripts((current) => [
            {
              session_id: session.id,
              speaker: payload.transcript.speaker,
              content: payload.transcript.content,
              is_final: payload.transcript.is_final ? 1 : 0,
              created_at: new Date().toISOString(),
            },
            ...current,
          ]);
        }
      };

      socket.onclose = () => {
        appendEvent("stream closed");
        setStreamStatus("idle");
      };

      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error("WebSocket connection failed"));
      });

      socket.send(JSON.stringify({ type: "audio.start", format: "pcm16", sample_rate: 16000, channels: 1 }));

      const AudioContextCtor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextCtor();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;

      audioContextRef.current = audioContext;
      sourceRef.current = source;
      processorRef.current = processor;
      silentGainRef.current = silentGain;

      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }
        const input = event.inputBuffer.getChannelData(0);
        const downsampled = downsampleTo16k(input, audioContext.sampleRate);
        socket.send(floatToPcm16(downsampled));
      };

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      setStreamStatus("streaming");
      setNotice("Local PCM16 audio stream started");
      await loadAll();
    } catch (err) {
      cleanupLocalStream();
      setStreamStatus("idle");
      throw err;
    }
  }

  async function stopLiveTest() {
    const sessionId = activeSession?.id;
    cleanupLocalStream();
    setStreamStatus("idle");
    if (sessionId) {
      await api.stopSession(sessionId);
    }
  }

  const selectedProviderReady = providers.find((provider) => provider.name === providerChoice)?.ready ?? false;

  return (
    <main className="flex min-h-screen text-text">
      <aside className="hidden w-64 shrink-0 border-r border-[#1f2a44] bg-page/72 p-4 backdrop-blur md:block">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan text-page">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-lg font-bold">voiceAgent</div>
            <div className="text-xs text-muted">Local runtime</div>
          </div>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold text-[#b8c2d9] transition hover:bg-white/10 hover:text-text",
                  view === item.id && "bg-white/10 text-text",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1f2a44] bg-page/42 px-6 py-4 backdrop-blur">
          <div>
            <h1 className="font-display text-2xl font-bold">{navItems.find((item) => item.id === view)?.label}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={status.background_status === "standby" ? "green" : "neutral"}>{status.background_status}</Badge>
              <Badge tone={activeSession ? "cyan" : "neutral"}>{activeSession ? "session active" : "no active session"}</Badge>
              {remainingSeconds !== null && <Badge tone={remainingSeconds < 30 ? "yellow" : "cyan"}>{remainingSeconds}s left</Badge>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => runAction(api.startRuntime, "Runtime started")}>
              <Play className="h-4 w-4" />
              Start
            </Button>
            <Button variant="secondary" onClick={() => runAction(api.stopRuntime, "Runtime stopped")}>
              <Square className="h-4 w-4" />
              Stop
            </Button>
          </div>
        </header>

        <div className="p-6">
          {(notice || error) && (
            <div className="mb-4 flex flex-wrap gap-3">
              {notice && <Badge tone="green">{notice}</Badge>}
              {error && <Badge tone="red">{error}</Badge>}
            </div>
          )}

          {view === "dashboard" && (
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Runtime</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <Metric label="Background" value={status.background_status} />
                  <Metric label="Session" value={activeSession ? activeSession.provider : "idle"} />
                  <Metric label="Limit" value={`${status.session_limit_seconds / 60} min`} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Providers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {providers.map((provider) => (
                    <div key={provider.name} className="flex items-center justify-between rounded-md border border-[#1f2a44] bg-white/5 p-3">
                      <span className="font-semibold">{provider.display_name}</span>
                      <Badge tone={provider.ready ? "green" : "yellow"}>{provider.ready ? "ready" : "missing key"}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle>Recent Sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  <SessionTable sessions={sessions.slice(0, 6)} />
                </CardContent>
              </Card>
            </div>
          )}

          {view === "settings" && (
            <Card>
              <CardHeader>
                <CardTitle>Local .env</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <Field label="OpenAI API Key">
                  <Input type="password" placeholder={config.OPENAI_API_KEY || "sk-..."} value={openAiKey} onChange={(event) => setOpenAiKey(event.target.value)} />
                </Field>
                <Field label="Gemini API Key">
                  <Input type="password" placeholder={config.GEMINI_API_KEY || "AIza..."} value={geminiKey} onChange={(event) => setGeminiKey(event.target.value)} />
                </Field>
                <Field label="Default Provider">
                  <select
                    className="h-10 w-full rounded-md border border-[#2a3658] bg-[#0b1020]/90 px-3 text-sm text-text outline-none"
                    value={providerChoice}
                    onChange={(event) => setProviderChoice(event.target.value)}
                  >
                    <option value="openai">OpenAI Realtime</option>
                    <option value="gemini">Gemini Live</option>
                  </select>
                </Field>
                <Field label="Default Voice">
                  <Input value={voice} onChange={(event) => setVoice(event.target.value)} placeholder="provider default" />
                </Field>
                <div className="md:col-span-2 flex items-center justify-between rounded-md border border-[#1f2a44] bg-white/5 p-3 text-sm text-[#b8c2d9]">
                  <span>{config.env_path || ".env"}</span>
                  <Button
                    onClick={() =>
                      runAction(saveSettings, ".env saved")
                    }
                  >
                    <KeyRound className="h-4 w-4" />
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {view === "agent" && (
            <Card>
              <CardHeader>
                <CardTitle>Prompt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input value={agent.name} onChange={(event) => setAgent({ ...agent, name: event.target.value })} />
                <Textarea
                  className="min-h-72"
                  value={agent.system_prompt}
                  onChange={(event) => setAgent({ ...agent, system_prompt: event.target.value })}
                />
                <Button onClick={() => runAction(() => api.saveAgent({ name: agent.name, system_prompt: agent.system_prompt }), "Agent saved")}>Save Agent</Button>
              </CardContent>
            </Card>
          )}

          {view === "voice" && (
            <div className="grid gap-4 md:grid-cols-2">
              {providers.map((provider) => (
                <Card key={provider.name}>
                  <CardHeader>
                    <CardTitle>{provider.display_name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Badge tone={provider.ready ? "green" : "yellow"}>{provider.ready ? "ready" : provider.error}</Badge>
                    <div className="text-sm text-[#b8c2d9]">Voices: {provider.voices.join(", ")}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {view === "business" && (
            <Card>
              <CardHeader>
                <CardTitle>Business Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input value={business.name} onChange={(event) => setBusiness({ ...business, name: event.target.value })} />
                <Textarea
                  className="min-h-96"
                  value={business.content}
                  onChange={(event) => setBusiness({ ...business, content: event.target.value })}
                />
                <Button onClick={() => runAction(() => api.saveBusinessProfile({ name: business.name, content: business.content }), "Business profile saved")}>
                  <Database className="h-4 w-4" />
                  Save
                </Button>
              </CardContent>
            </Card>
          )}

          {view === "tools" && (
            <div className="grid gap-4 md:grid-cols-2">
              {tools.map((tool) => (
                <Card key={tool.name}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle>{tool.name}</CardTitle>
                      <Button
                        variant={tool.enabled ? "secondary" : "primary"}
                        size="sm"
                        onClick={() => runAction(() => api.setToolEnabled(tool.name, !tool.enabled), "Tool updated")}
                      >
                        {tool.enabled ? "Enabled" : "Disabled"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm leading-6 text-[#b8c2d9]">{tool.description}</CardContent>
                </Card>
              ))}
            </div>
          )}

          {view === "test" && (
            <Card>
              <CardHeader>
                <CardTitle>Test Call</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <Metric label="Mic" value={micReady ? "ready" : "not checked"} />
                  <Metric label="Provider" value={providerChoice} />
                  <Metric label="Stream" value={streamStatus} />
                  <Metric label="Timer" value={remainingSeconds === null ? "idle" : `${remainingSeconds}s`} />
                  <Metric label="Chunks" value={activeSession ? String(activeSession.audio_chunks) : "0"} />
                  <Metric label="Bytes" value={activeSession ? formatBytes(activeSession.audio_bytes) : "0 B"} />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={requestMic}>
                    <Mic className="h-4 w-4" />
                    Check Mic
                  </Button>
                  <Button
                    disabled={!selectedProviderReady || Boolean(activeSession)}
                    onClick={() => runAction(startLiveTest, "Session started")}
                  >
                    <Play className="h-4 w-4" />
                    Start Test
                  </Button>
                  <Button
                    variant="danger"
                    disabled={!activeSession}
                    onClick={() => activeSession && runAction(stopLiveTest, "Session stopped")}
                  >
                    <Square className="h-4 w-4" />
                    Stop Session
                  </Button>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <LivePanel title="Live Events" items={liveEvents} empty="No stream events yet." />
                  <LivePanel
                    title="Session Transcript"
                    items={transcripts.slice(0, 8).map((item) => `${item.speaker}: ${item.content}`)}
                    empty="No transcript events yet."
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {view === "logs" && (
            <Card>
              <CardHeader>
                <CardTitle>Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <SessionTable sessions={sessions} />
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <LivePanel
                    title="Recent Transcripts"
                    items={transcripts.slice(0, 12).map((item) => `${formatDate(item.created_at)} ${item.speaker}: ${item.content}`)}
                    empty="No transcripts yet."
                  />
                  <LivePanel
                    title="Recent Tool Calls"
                    items={toolCalls.slice(0, 12).map((item) => `${formatDate(item.started_at)} ${item.tool_name} ${item.status}`)}
                    empty="No tool calls yet."
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#1f2a44] bg-white/5 p-4">
      <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="mt-2 truncate font-display text-xl font-bold text-text">{value}</div>
    </div>
  );
}

function LivePanel({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-md border border-[#1f2a44] bg-white/5">
      <div className="border-b border-[#1f2a44] px-4 py-3 text-sm font-bold text-text">{title}</div>
      <div className="max-h-64 overflow-auto p-3">
        {items.length === 0 ? (
          <div className="text-sm text-[#b8c2d9]">{empty}</div>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={`${item}-${index}`} className="rounded-md bg-page/60 px-3 py-2 text-sm leading-6 text-[#b8c2d9]">
                {item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionTable({ sessions }: { sessions: SessionRecord[] }) {
  if (sessions.length === 0) {
    return <div className="rounded-md border border-[#1f2a44] bg-white/5 p-6 text-sm text-[#b8c2d9]">No sessions yet.</div>;
  }

  return (
    <div className="overflow-hidden rounded-md border border-[#1f2a44]">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="bg-white/10 text-xs uppercase tracking-[0.12em] text-muted">
          <tr>
            <th className="px-4 py-3">Provider</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Started</th>
            <th className="px-4 py-3">Ended</th>
            <th className="px-4 py-3">Reason</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id} className="border-t border-[#1f2a44] text-[#b8c2d9]">
              <td className="px-4 py-3 font-semibold text-text">{session.provider}</td>
              <td className="px-4 py-3">{session.status}</td>
              <td className="px-4 py-3">{formatDate(session.started_at)}</td>
              <td className="px-4 py-3">{formatDate(session.ended_at)}</td>
              <td className="px-4 py-3">{session.ended_reason ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function downsampleTo16k(input: Float32Array, sourceRate: number) {
  const targetRate = 16000;
  if (sourceRate === targetRate) {
    return input;
  }
  const ratio = sourceRate / targetRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j += 1) {
      sum += input[j];
    }
    output[i] = sum / Math.max(1, end - start);
  }
  return output;
}

function floatToPcm16(input: Float32Array) {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}
