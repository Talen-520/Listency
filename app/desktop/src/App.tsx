import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  Activity,
  Bot,
  CircleHelp,
  Database,
  ExternalLink,
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
import { toast } from "sonner";

import { ModeToggle } from "@/components/mode-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type {
  AgentProfile,
  AppLogRecord,
  BusinessProfile,
  ProviderInfo,
  PublicConfig,
  RuntimeStatus,
  SessionRecord,
  ToolCallRecord,
  ToolInfo,
  TranscriptRecord,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type View = "dashboard" | "agent" | "voice" | "business" | "tools" | "test" | "logs" | "settings";

const REALTIME_PCM_SAMPLE_RATE = 24000;
const OPENAI_API_KEYS_URL = "https://platform.openai.com/settings/organization/api-keys";
const GEMINI_API_KEYS_URL = "https://aistudio.google.com/app/api-keys?project=stock-agent-f54f1";

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
  OPENAI_REALTIME_MODEL: "gpt-realtime",
  OPENAI_REALTIME_MOCK: "false",
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
  const [appLogs, setAppLogs] = useState<AppLogRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionTranscripts, setSessionTranscripts] = useState<TranscriptRecord[]>([]);
  const [sessionToolCalls, setSessionToolCalls] = useState<ToolCallRecord[]>([]);
  const [sessionAppLogs, setSessionAppLogs] = useState<AppLogRecord[]>([]);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
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
  const [openAiModel, setOpenAiModel] = useState("gpt-realtime");
  const [openAiMock, setOpenAiMock] = useState("false");
  const [voice, setVoice] = useState("");
  const [micReady, setMicReady] = useState(false);
  const [streamStatus, setStreamStatus] = useState("idle");
  const [liveEvents, setLiveEvents] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const outputPlaybackTimeRef = useRef(0);
  const agentHangupTimerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const activeSession = status.active_sessions[0];
  const remainingSeconds = useMemo(() => {
    if (!activeSession) return null;
    return Math.max(0, Math.ceil((new Date(activeSession.timeout_at).getTime() - now) / 1000));
  }, [activeSession, now]);
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? sessions[0] ?? null,
    [selectedSessionId, sessions],
  );
  const selectedSessionDetailId = selectedSession?.id ?? null;
  const currentNav = navItems.find((item) => item.id === view) ?? navItems[0];
  const selectedProviderReady = providers.find((provider) => provider.name === providerChoice)?.ready ?? false;

  useEffect(() => {
    if (!selectedSessionDetailId) {
      setSessionTranscripts([]);
      setSessionToolCalls([]);
      setSessionAppLogs([]);
      return;
    }

    let isCurrent = true;
    setSessionDetailLoading(true);
    Promise.all([
      api.transcripts(selectedSessionDetailId, 500),
      api.toolCalls(selectedSessionDetailId, 200),
      api.appLogs(selectedSessionDetailId, 300),
    ])
      .then(([transcriptList, toolCallList, appLogList]) => {
        if (!isCurrent) return;
        setSessionTranscripts(transcriptList.transcripts);
        setSessionToolCalls(toolCallList.tool_calls);
        setSessionAppLogs(appLogList.logs);
      })
      .catch((err) => {
        if (isCurrent) {
          toast.error(err instanceof Error ? err.message : "Session detail unavailable");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setSessionDetailLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedSessionDetailId]);

  async function loadAll() {
    try {
      const [runtime, cfg, providerList, toolList, sessionList, transcriptList, toolCallList, appLogList, businessProfile, agentProfile] = await Promise.all([
        api.runtimeStatus(),
        api.getConfig(),
        api.providers(),
        api.tools(),
        api.sessions(),
        api.transcripts(),
        api.toolCalls(),
        api.appLogs(),
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
      setAppLogs(appLogList.logs);
      setBusiness(businessProfile);
      setAgent(agentProfile);
      setProviderChoice(cfg.DEFAULT_REALTIME_PROVIDER || "openai");
      setOpenAiModel(cfg.OPENAI_REALTIME_MODEL || "gpt-realtime");
      setOpenAiMock(cfg.OPENAI_REALTIME_MOCK || "false");
      setVoice(cfg.DEFAULT_VOICE || "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backend unavailable");
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
    try {
      await action();
      toast.success(message);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function requestMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicReady(true);
      toast.success("Microphone ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Microphone permission failed");
    }
  }

  async function saveSettings() {
    await api.saveConfig({
      openai_api_key: openAiKey,
      gemini_api_key: geminiKey,
      openai_realtime_model: openAiModel,
      openai_realtime_mock: openAiMock,
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
    if (agentHangupTimerRef.current !== null) {
      window.clearTimeout(agentHangupTimerRef.current);
      agentHangupTimerRef.current = null;
    }

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
    outputAudioContextRef.current?.close().catch(() => undefined);
    outputAudioContextRef.current = null;
    outputPlaybackTimeRef.current = 0;

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
    setLiveEvents([]);
    setStreamStatus("requesting mic");

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    setMicReady(true);

    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const outputAudioContext = outputAudioContextRef.current ?? new AudioContextCtor();
    outputAudioContextRef.current = outputAudioContext;
    void outputAudioContext.resume().catch(() => undefined);

    try {
      const session = await api.startTestSession(providerChoice);
      appendEvent(`session ${session.id.slice(0, 8)} started`);

      const socket = new WebSocket(api.sessionStreamUrl(session.id));
      socketRef.current = socket;
      setStreamStatus("connecting");

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        appendEvent(formatStreamEvent(payload));
        if (payload.type === "provider.output_audio.delta" && payload.audio) {
          playPcm16Audio(payload.audio, payload.sample_rate ?? 24000);
        }
        if (payload.type === "tool.call") {
          api.toolCalls().then((toolCallList) => setToolCalls(toolCallList.tool_calls)).catch(() => undefined);
          api.appLogs().then((appLogList) => setAppLogs(appLogList.logs)).catch(() => undefined);
        }
        if (payload.type === "session.agent_hangup_ready") {
          scheduleAgentHangupComplete();
        }
        if (payload.type === "provider.error") {
          const message = String(payload.message ?? "Realtime provider returned an error.");
          toast.error(message);
          setTranscripts((current) => [
            {
              session_id: session.id,
              speaker: "system",
              content: `Provider error: ${message}`,
              is_final: 1,
              created_at: new Date().toISOString(),
            },
            ...current,
          ]);
        }
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
        if (payload.type === "provider.transcript.delta" || payload.type === "provider.transcript.done") {
          const content = String(payload.content ?? "");
          if (content) {
            setTranscripts((current) => [
              {
                session_id: session.id,
                speaker: String(payload.speaker ?? "assistant"),
                content,
                is_final: payload.is_final ? 1 : 0,
                created_at: new Date().toISOString(),
              },
              ...current,
            ]);
          }
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

      socket.send(JSON.stringify({ type: "audio.start", format: "pcm16", sample_rate: REALTIME_PCM_SAMPLE_RATE, channels: 1 }));

      const audioContext = new AudioContextCtor();
      void audioContext.resume().catch(() => undefined);
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
        const resampled = resampleMono(input, audioContext.sampleRate, REALTIME_PCM_SAMPLE_RATE);
        socket.send(floatToPcm16(resampled));
      };

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      setStreamStatus("streaming");
      toast.success("Local PCM16 audio stream started");
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

  function playPcm16Audio(base64Audio: string, sampleRate: number) {
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = outputAudioContextRef.current ?? new AudioContextCtor();
    outputAudioContextRef.current = audioContext;
    void audioContext.resume().catch(() => undefined);

    const samples = decodeBase64Pcm16(base64Audio);
    if (!samples.length) {
      return;
    }

    const buffer = audioContext.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const startAt = Math.max(audioContext.currentTime + 0.02, outputPlaybackTimeRef.current || 0);
    source.start(startAt);
    outputPlaybackTimeRef.current = startAt + buffer.duration;
  }

  function scheduleAgentHangupComplete() {
    if (agentHangupTimerRef.current !== null) {
      window.clearTimeout(agentHangupTimerRef.current);
    }
    const audioContext = outputAudioContextRef.current;
    const queuedAudioMs = audioContext ? Math.max(0, outputPlaybackTimeRef.current - audioContext.currentTime) * 1000 : 0;
    const delayMs = Math.max(900, queuedAudioMs + 500);
    toast.info("AI will end the call after goodbye");
    agentHangupTimerRef.current = window.setTimeout(() => {
      agentHangupTimerRef.current = null;
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "session.agent_hangup_complete" }));
      }
    }, delayMs);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col">
          <div className="flex h-16 items-center gap-3 px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-background text-foreground">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-display text-base font-semibold">voiceAgent</div>
              <div className="text-xs text-muted-foreground">Local voice runtime</div>
            </div>
          </div>
          <Separator />

          <nav className="flex-1 space-y-1 p-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const selected = view === item.id;
              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  className={cn(
                    "h-10 w-full justify-start gap-3 px-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    selected && "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                  onClick={() => setView(item.id)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </nav>

          <div className="space-y-3 border-t p-4">
            <StatusRow label="Runtime" value={status.background_status} />
            <StatusRow label="Session" value={activeSession ? activeSession.provider : "idle"} />
            {remainingSeconds !== null && <StatusRow label="Limit" value={`${remainingSeconds}s`} />}
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-card md:hidden">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="font-display text-2xl font-semibold tracking-normal">{currentNav.label}</h1>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={status.background_status === "standby" ? "green" : "neutral"}>{status.background_status}</Badge>
                      <Badge tone={activeSession ? "cyan" : "neutral"}>{activeSession ? "session active" : "no active session"}</Badge>
                      {remainingSeconds !== null && <Badge tone={remainingSeconds < 30 ? "yellow" : "cyan"}>{remainingSeconds}s left</Badge>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ModeToggle />
                <Button variant="outline" onClick={() => runAction(api.startRuntime, "Runtime started")}>
                  <Play className="h-4 w-4" />
                  Start
                </Button>
                <Button variant="outline" onClick={() => runAction(api.stopRuntime, "Runtime stopped")}>
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto border-t px-4 py-2 md:hidden">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.id}
                    variant={view === item.id ? "secondary" : "ghost"}
                    size="sm"
                    className="shrink-0"
                    onClick={() => setView(item.id)}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </header>

          <div className="p-4 md:p-6">
            {view === "dashboard" && (
              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Runtime</CardTitle>
                    <CardDescription>Local background process and current call state.</CardDescription>
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
                    <CardDescription>Readiness based on local configuration.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {providers.map((provider) => (
                      <div key={provider.name} className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
                        <span className="font-medium">{provider.display_name}</span>
                        <Badge tone={provider.ready ? "green" : "yellow"}>{provider.ready ? "ready" : "missing key"}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="xl:col-span-2">
                  <CardHeader>
                    <CardTitle>Recent Sessions</CardTitle>
                    <CardDescription>Latest local Realtime sessions.</CardDescription>
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
                  <CardDescription>Provider keys and Realtime defaults stored on this machine.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="OpenAI API Key"
                    action={
                      <ApiKeyHelp
                        provider="OpenAI"
                        href={OPENAI_API_KEYS_URL}
                        description="Create or copy an OpenAI API key from your organization settings."
                      />
                    }
                  >
                    <Input type="password" placeholder={config.OPENAI_API_KEY || "sk-..."} value={openAiKey} onChange={(event) => setOpenAiKey(event.target.value)} />
                  </Field>
                  <Field
                    label="Gemini API Key"
                    action={
                      <ApiKeyHelp
                        provider="Gemini"
                        href={GEMINI_API_KEYS_URL}
                        description="Create or copy a Gemini API key from Google AI Studio."
                      />
                    }
                  >
                    <Input type="password" placeholder={config.GEMINI_API_KEY || "AIza..."} value={geminiKey} onChange={(event) => setGeminiKey(event.target.value)} />
                  </Field>
                  <Field label="Default Provider">
                    <Select value={providerChoice} onValueChange={setProviderChoice}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI Realtime</SelectItem>
                        <SelectItem value="gemini">Gemini Live</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="OpenAI Realtime Model">
                    <Input value={openAiModel} onChange={(event) => setOpenAiModel(event.target.value)} placeholder="gpt-realtime" />
                  </Field>
                  <Field label="OpenAI Mock Mode">
                    <Select value={openAiMock} onValueChange={setOpenAiMock}>
                      <SelectTrigger>
                        <SelectValue placeholder="Mock mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">Off</SelectItem>
                        <SelectItem value="true">On</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Default Voice">
                    <Input value={voice} onChange={(event) => setVoice(event.target.value)} placeholder="provider default" />
                  </Field>
                  <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground md:col-span-2">
                    <span className="truncate">{config.env_path || ".env"}</span>
                    <Button onClick={() => runAction(saveSettings, ".env saved")}>
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
                  <CardDescription>Default system behavior for new local sessions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Agent Name">
                    <Input value={agent.name} onChange={(event) => setAgent({ ...agent, name: event.target.value })} />
                  </Field>
                  <Field label="System Prompt">
                    <Textarea
                      className="min-h-72"
                      value={agent.system_prompt}
                      onChange={(event) => setAgent({ ...agent, system_prompt: event.target.value })}
                    />
                  </Field>
                  <Button onClick={() => runAction(() => api.saveAgent({ name: agent.name, system_prompt: agent.system_prompt }), "Agent saved")}>Save Agent</Button>
                </CardContent>
              </Card>
            )}

            {view === "voice" && (
              <div className="grid gap-4 md:grid-cols-2">
                {providers.map((provider) => (
                  <Card key={provider.name}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle>{provider.display_name}</CardTitle>
                          <CardDescription>{provider.name}</CardDescription>
                        </div>
                        <Badge tone={provider.ready ? "green" : "yellow"}>{provider.ready ? "ready" : "missing key"}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                        Voices: {provider.voices.join(", ")}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {view === "business" && (
              <Card>
                <CardHeader>
                  <CardTitle>Business Profile</CardTitle>
                  <CardDescription>Local text used by business lookup tools and session instructions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Business Name">
                    <Input value={business.name} onChange={(event) => setBusiness({ ...business, name: event.target.value })} />
                  </Field>
                  <Field label="Profile Content">
                    <Textarea
                      className="min-h-96"
                      value={business.content}
                      onChange={(event) => setBusiness({ ...business, content: event.target.value })}
                    />
                  </Field>
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
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <CardTitle className="break-words">{tool.name}</CardTitle>
                          <CardDescription>{tool.enabled ? "Enabled" : "Disabled"}</CardDescription>
                        </div>
                        <Switch
                          checked={tool.enabled}
                          onCheckedChange={(checked) => runAction(() => api.setToolEnabled(tool.name, checked), "Tool updated")}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm leading-6 text-muted-foreground">{tool.description}</CardContent>
                  </Card>
                ))}
              </div>
            )}

            {view === "test" && (
              <Card>
                <CardHeader>
                  <CardTitle>Test Call</CardTitle>
                  <CardDescription>Local microphone to selected Realtime provider.</CardDescription>
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
                    <Button variant="outline" onClick={requestMic}>
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
                      variant="destructive"
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
              <div className="grid gap-4 xl:grid-cols-[1fr_1.15fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Sessions</CardTitle>
                    <CardDescription>Click a row to inspect transcript and tool calls.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SessionTable sessions={sessions} selectedSessionId={selectedSessionDetailId} onSelect={setSelectedSessionId} />
                  </CardContent>
                </Card>

                <SessionDetailPanel
                  session={selectedSession}
                  transcripts={sessionTranscripts}
                  toolCalls={sessionToolCalls}
                  appLogs={sessionAppLogs}
                  loading={sessionDetailLoading}
                />

                <Card className="xl:col-span-2">
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>Transcript, tool, and app log streams.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="transcripts">
                      <TabsList className="grid w-full grid-cols-3 md:w-auto">
                        <TabsTrigger value="transcripts">Transcripts</TabsTrigger>
                        <TabsTrigger value="tools">Tool Calls</TabsTrigger>
                        <TabsTrigger value="logs">App Logs</TabsTrigger>
                      </TabsList>
                      <TabsContent value="transcripts">
                        <LivePanel
                          title="Recent Transcripts"
                          items={transcripts.slice(0, 12).map((item) => `${formatDate(item.created_at)} ${item.speaker}: ${item.content}`)}
                          empty="No transcripts yet."
                        />
                      </TabsContent>
                      <TabsContent value="tools">
                        <LivePanel
                          title="Recent Tool Calls"
                          items={toolCalls.slice(0, 12).map((item) => `${formatDate(item.started_at)} ${item.tool_name} ${item.status}`)}
                          empty="No tool calls yet."
                        />
                      </TabsContent>
                      <TabsContent value="logs">
                        <LivePanel
                          title="App Logs"
                          items={appLogs.slice(0, 12).map((item) => `${formatDate(item.created_at)} ${item.level} ${item.event}: ${item.message}`)}
                          empty="No app logs yet."
                        />
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function Field({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
        {action}
      </div>
      {children}
    </div>
  );
}

function ApiKeyHelp({ provider, href, description }: { provider: string; href: string; description: string }) {
  return (
    <HoverCard openDelay={100} closeDelay={150}>
      <HoverCardTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 rounded-full text-muted-foreground hover:text-foreground"
          aria-label={`Where to get ${provider} API key`}
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-80">
        <div className="space-y-2">
          <div className="text-sm font-medium">{provider} API key</div>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          <a
            className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            Open API key page
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-4">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 truncate font-display text-xl font-semibold">{value}</div>
    </div>
  );
}

function LivePanel({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 pr-3">
          {items.length === 0 ? (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">{empty}</div>
          ) : (
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-md border bg-background px-3 py-2 text-sm leading-6 text-muted-foreground">
                  {item}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function SessionDetailPanel({
  session,
  transcripts,
  toolCalls,
  appLogs,
  loading,
}: {
  session: SessionRecord | null;
  transcripts: TranscriptRecord[];
  toolCalls: ToolCallRecord[];
  appLogs: AppLogRecord[];
  loading: boolean;
}) {
  const orderedTranscripts = [...transcripts].sort(compareCreatedAt);
  const orderedLogs = [...appLogs].sort(compareCreatedAt);
  const orderedToolCalls = [...toolCalls].sort((left, right) => new Date(left.started_at).getTime() - new Date(right.started_at).getTime());

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Session Detail</CardTitle>
            <CardDescription>{session ? session.id : "No session selected"}</CardDescription>
          </div>
          {session && <Badge tone={session.status === "error" ? "red" : session.status === "stopped" ? "neutral" : "cyan"}>{session.status}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!session ? (
          <div className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">No session selected.</div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <Metric label="Provider" value={session.provider} />
              <Metric label="Reason" value={session.ended_reason ?? "-"} />
              <Metric label="Started" value={formatDate(session.started_at)} />
              <Metric label="Ended" value={formatDate(session.ended_at)} />
            </div>
            {session.error_message && (
              <Alert variant="destructive">
                <AlertTitle>Session Error</AlertTitle>
                <AlertDescription>{session.error_message}</AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="conversation">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="conversation">Conversation</TabsTrigger>
                <TabsTrigger value="events">Events</TabsTrigger>
                <TabsTrigger value="tools">Tools</TabsTrigger>
              </TabsList>
              <TabsContent value="conversation">
                <Card className="shadow-none">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-sm">Conversation</CardTitle>
                      {loading && <span className="text-xs text-muted-foreground">Loading</span>}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[28rem] pr-3">
                      {orderedTranscripts.length === 0 ? (
                        <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">No transcript for this session.</div>
                      ) : (
                        <div className="space-y-3">
                          {orderedTranscripts.map((item, index) => (
                            <TranscriptBubble key={`${item.created_at}-${index}`} item={item} />
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="events">
                <LivePanel
                  title="Session Events"
                  items={orderedLogs.map((item) => `${formatDate(item.created_at)} ${item.event}: ${item.message}`)}
                  empty="No events for this session."
                />
              </TabsContent>
              <TabsContent value="tools">
                <LivePanel
                  title="Tool Calls"
                  items={orderedToolCalls.map((item) => `${formatDate(item.started_at)} ${item.tool_name} ${item.status}${item.error_message ? `: ${item.error_message}` : ""}`)}
                  empty="No tool calls for this session."
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TranscriptBubble({ item }: { item: TranscriptRecord }) {
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

function SessionTable({
  sessions,
  selectedSessionId,
  onSelect,
}: {
  sessions: SessionRecord[];
  selectedSessionId?: string | null;
  onSelect?: (sessionId: string) => void;
}) {
  if (sessions.length === 0) {
    return <div className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">No sessions yet.</div>;
  }

  return (
    <div className="rounded-md border">
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
        <TableBody>
          {sessions.map((session) => (
            <TableRow
              key={session.id}
              className={cn(onSelect && "cursor-pointer", selectedSessionId === session.id && "bg-muted")}
              onClick={() => onSelect?.(session.id)}
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
    </div>
  );
}

function compareCreatedAt(left: { created_at: string }, right: { created_at: string }) {
  return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
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

function formatStreamEvent(payload: Record<string, unknown>) {
  if (payload.type === "provider.error" && payload.message) {
    return `${payload.type}: ${payload.message}`;
  }
  if (payload.type === "tool.call" && payload.tool_name) {
    const ok = (payload.output as { ok?: boolean } | undefined)?.ok;
    return `${payload.type}: ${payload.tool_name} ${ok === false ? "failed" : "completed"}`;
  }
  if (payload.type === "session.agent_hangup_ready") {
    return "AI goodbye complete, ending call";
  }
  return String(payload.type ?? "event");
}

function resampleMono(input: Float32Array, sourceRate: number, targetRate: number) {
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

function decodeBase64Pcm16(base64: string) {
  const binary = window.atob(base64);
  const output = new Float32Array(binary.length / 2);
  for (let i = 0; i < output.length; i += 1) {
    const lo = binary.charCodeAt(i * 2);
    const hi = binary.charCodeAt(i * 2 + 1);
    const value = (hi << 8) | lo;
    const signed = value >= 0x8000 ? value - 0x10000 : value;
    output[i] = signed / 0x8000;
  }
  return output;
}
