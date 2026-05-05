import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { DEFAULT_GEMINI_LIVE_MODEL, isSupportedGeminiLiveModel } from "@/lib/models";
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
import { isSupportedVoice } from "@/lib/voices";

const emptyConfig: PublicConfig = {
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  OPENAI_REALTIME_MODEL: "gpt-realtime",
  GEMINI_LIVE_MODEL: DEFAULT_GEMINI_LIVE_MODEL,
  OPENAI_REALTIME_MOCK: "false",
  DEFAULT_REALTIME_PROVIDER: "openai",
  OPENAI_DEFAULT_VOICE: "",
  GEMINI_DEFAULT_VOICE: "",
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

const defaultBusiness: BusinessProfile = {
  id: "default",
  name: "Default Business",
  content: "",
  updated_at: null,
};

const defaultAgent: AgentProfile = {
  id: "default",
  name: "Default Agent",
  system_prompt: "You are a helpful local business voice agent. Keep responses concise and natural.",
  updated_at: null,
};

export function useAppData() {
  const [status, setStatus] = useState<RuntimeStatus>(emptyStatus);
  const [config, setConfig] = useState<PublicConfig>(emptyConfig);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [appLogs, setAppLogs] = useState<AppLogRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessProfile>(defaultBusiness);
  const [agent, setAgent] = useState<AgentProfile>(defaultAgent);
  const [openAiKey, setOpenAiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [providerChoice, setProviderChoice] = useState("openai");
  const [openAiModel, setOpenAiModel] = useState("gpt-realtime");
  const [geminiModel, setGeminiModel] = useState(DEFAULT_GEMINI_LIVE_MODEL);
  const [openAiMock, setOpenAiMock] = useState("false");
  const [openAiVoice, setOpenAiVoice] = useState("");
  const [geminiVoice, setGeminiVoice] = useState("");
  const [now, setNow] = useState(Date.now());

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
  const selectedProviderReady = providers.find((provider) => provider.name === providerChoice)?.ready ?? false;

  const loadAll = useCallback(async () => {
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
      setGeminiModel(isSupportedGeminiLiveModel(cfg.GEMINI_LIVE_MODEL) ? cfg.GEMINI_LIVE_MODEL : DEFAULT_GEMINI_LIVE_MODEL);
      setOpenAiMock(cfg.OPENAI_REALTIME_MOCK || "false");
      const legacyVoice = cfg.DEFAULT_VOICE || "";
      const defaultProvider = cfg.DEFAULT_REALTIME_PROVIDER || "openai";
      setOpenAiVoice(
        cfg.OPENAI_DEFAULT_VOICE ||
          (defaultProvider === "openai" && isSupportedVoice("openai", legacyVoice) ? legacyVoice : ""),
      );
      setGeminiVoice(
        cfg.GEMINI_DEFAULT_VOICE ||
          (defaultProvider === "gemini" && isSupportedVoice("gemini", legacyVoice) ? legacyVoice : ""),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backend unavailable");
    }
  }, []);

  useEffect(() => {
    void loadAll();
    const refresh = window.setInterval(() => {
      setNow(Date.now());
      api.runtimeStatus()
        .then((runtime) => setStatus(runtime))
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(refresh);
  }, [loadAll]);

  const runAction = useCallback(
    async (action: () => Promise<unknown>, message: string) => {
      try {
        await action();
        toast.success(message);
        await loadAll();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    },
    [loadAll],
  );

  const saveSettings = useCallback(async () => {
    await api.saveConfig({
      openai_api_key: openAiKey,
      gemini_api_key: geminiKey,
      openai_realtime_model: openAiModel,
      gemini_live_model: geminiModel,
      openai_realtime_mock: openAiMock,
      default_realtime_provider: providerChoice,
      openai_default_voice: openAiVoice,
      gemini_default_voice: geminiVoice,
      default_voice: providerChoice === "gemini" ? geminiVoice : openAiVoice,
    });
    setOpenAiKey("");
    setGeminiKey("");
  }, [geminiKey, geminiModel, geminiVoice, openAiKey, openAiMock, openAiModel, openAiVoice, providerChoice]);

  return {
    status,
    config,
    providers,
    tools,
    sessions,
    transcripts,
    toolCalls,
    appLogs,
    selectedSessionId,
    selectedSession,
    selectedSessionDetailId,
    business,
    agent,
    openAiKey,
    geminiKey,
    providerChoice,
    openAiModel,
    geminiModel,
    openAiMock,
    openAiVoice,
    geminiVoice,
    activeSession,
    remainingSeconds,
    selectedProviderReady,
    loadAll,
    runAction,
    saveSettings,
    setTranscripts,
    setToolCalls,
    setAppLogs,
    setSelectedSessionId,
    setBusiness,
    setAgent,
    setOpenAiKey,
    setGeminiKey,
    setProviderChoice,
    setOpenAiModel,
    setGeminiModel,
    setOpenAiMock,
    setOpenAiVoice,
    setGeminiVoice,
  };
}
