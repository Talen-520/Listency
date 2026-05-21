import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { DEFAULT_GEMINI_LIVE_MODEL, DEFAULT_OPENAI_REALTIME_MODEL, isSupportedGeminiLiveModel } from "@/lib/models";
import { isRuntimeRunning } from "@/lib/runtime";
import type {
  AgentProfile,
  AppLogRecord,
  BackendHealth,
  BusinessProfile,
  LogTimeWindow,
  PhoneStatus,
  ProviderInfo,
  PublicConfig,
  ReadinessCheck,
  RuntimeStatus,
  SessionRecord,
  ToolCallRecord,
  ToolInfo,
  TranscriptRecord,
  TwilioDebuggerAlert,
  VoicePreviewCache,
} from "@/lib/types";
import { isSupportedVoice } from "@/lib/voices";

const emptyConfig: PublicConfig = {
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  OPENAI_REALTIME_MODEL: DEFAULT_OPENAI_REALTIME_MODEL,
  GEMINI_LIVE_MODEL: DEFAULT_GEMINI_LIVE_MODEL,
  OPENAI_REALTIME_MOCK: "false",
  DEFAULT_REALTIME_PROVIDER: "openai",
  OPENAI_DEFAULT_VOICE: "",
  GEMINI_DEFAULT_VOICE: "",
  DEFAULT_VOICE: "",
  PHONE_PROVIDER: "none",
  PHONE_CONNECTION_MODE: "automatic",
  PHONE_PUBLIC_BASE_URL: "",
  PHONE_REALTIME_PROVIDER: "",
  PHONE_TRANSFER_TARGET: "",
  PHONE_LAST_PROVISIONED_URL: "",
  PHONE_LAST_PROVISIONED_AT: "",
  CLOUDFLARED_BIN: "",
  TWILIO_ACCOUNT_SID: "",
  TWILIO_AUTH_TOKEN: "",
  TWILIO_PHONE_NUMBER: "",
  TWILIO_PHONE_NUMBER_SID: "",
  TELNYX_API_KEY: "",
  TELNYX_CALL_CONTROL_APP_ID: "",
  TELNYX_APPLICATION_NAME: "Listency",
  TELNYX_PHONE_NUMBER: "",
  has_openai_key: false,
  has_gemini_key: false,
  has_twilio_auth_token: false,
  has_telnyx_api_key: false,
  env_path: "",
};

const emptyStatus: RuntimeStatus = {
  background_status: "stopped",
  active_sessions: [],
  last_error: null,
  session_limit_seconds: 300,
};

const emptyBackendHealth: BackendHealth = {
  available: false,
  checking: true,
  message: "Checking local backend...",
  last_checked_at: null,
};

const emptyVoicePreviewCache: VoicePreviewCache = {
  cached: {},
};

const emptyPhoneStatus: PhoneStatus = {
  provider: "none",
  provider_ready: false,
  provider_error: null,
  connection: {
    mode: "automatic",
    status: "stopped",
    public_base_url: "",
    public_ws_url: "",
    message: "Automatic secure connection is stopped.",
    provider: "cloudflare",
  },
  configured: false,
  last_provisioned_url: "",
  last_provisioned_at: "",
  reprovision_required: false,
  reprovision_reason: "",
  transfer_target_ready: false,
  last_call_status: "",
  last_call_error: "",
  last_call_ended_reason: "",
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
  system_prompt: [
    "Role",
    "You are Listency, a realtime voice agent for a local business. Help callers with concise, natural speech.",
    "",
    "Tone",
    "Sound calm, warm, and professional. Keep most replies to one or two short spoken sentences.",
    "",
    "Reasoning",
    "Think before answering, but do not narrate your reasoning. Use the saved business profile and tools before guessing.",
    "",
    "Preambles",
    'If a tool call may take a moment, say a short preamble such as "Let me check that for you." Do not use a preamble for simple greetings, confirmations, or goodbyes.',
    "",
    "Business Information",
    "Use business_info_lookup for specific questions about hours, location, services, policies, prices, availability details, or anything that should come from the saved business profile. If the lookup is missing or unclear, say what you can verify and offer to take a message or transfer.",
    "",
    "Bookings",
    "Before create_booking, confirm the customer's name, requested date/time, and any important notes. If the time or customer name is missing, ask one focused follow-up question. After saving, summarize the booking clearly.",
    "",
    "Transfers And Escalation",
    "Use transfer_call when the caller asks for a person, manager, front desk, emergency help, billing dispute, complaint escalation, or anything outside the saved information. Explain that a real phone transfer depends on the configured phone provider.",
    "",
    "Unclear Audio",
    "If audio is unclear, ask the caller to repeat once. If still unclear, ask a narrower clarifying question.",
    "",
    "Call Ending",
    "If the caller says goodbye, says they are done, or asks to end the call, use end_call. After end_call returns, say exactly one brief goodbye and do not ask another question.",
  ].join("\n"),
  updated_at: null,
};

function logWindowSince(window: LogTimeWindow) {
  const hours = window === "24h" ? 24 : window === "7d" ? 24 * 7 : 24 * 30;
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function useAppData() {
  const [status, setStatus] = useState<RuntimeStatus>(emptyStatus);
  const [backendHealth, setBackendHealth] = useState<BackendHealth>(emptyBackendHealth);
  const [config, setConfig] = useState<PublicConfig>(emptyConfig);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus>(emptyPhoneStatus);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [appLogs, setAppLogs] = useState<AppLogRecord[]>([]);
  const [logWindow, setLogWindow] = useState<LogTimeWindow>("24h");
  const [voicePreviewCache, setVoicePreviewCache] = useState<VoicePreviewCache>(emptyVoicePreviewCache);
  const [twilioDebuggerAlerts, setTwilioDebuggerAlerts] = useState<TwilioDebuggerAlert[]>([]);
  const [twilioDebuggerError, setTwilioDebuggerError] = useState("");
  const [twilioDebuggerLoading, setTwilioDebuggerLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessProfile>(defaultBusiness);
  const [agent, setAgent] = useState<AgentProfile>(defaultAgent);
  const [openAiKey, setOpenAiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [providerChoice, setProviderChoice] = useState("openai");
  const [openAiModel, setOpenAiModel] = useState(DEFAULT_OPENAI_REALTIME_MODEL);
  const [geminiModel, setGeminiModel] = useState(DEFAULT_GEMINI_LIVE_MODEL);
  const [openAiMock, setOpenAiMock] = useState("false");
  const [openAiVoice, setOpenAiVoice] = useState("");
  const [geminiVoice, setGeminiVoice] = useState("");
  const [phoneProvider, setPhoneProvider] = useState("none");
  const [phoneConnectionMode, setPhoneConnectionMode] = useState("automatic");
  const [phonePublicBaseUrl, setPhonePublicBaseUrl] = useState("");
  const [phoneRealtimeProvider, setPhoneRealtimeProvider] = useState("");
  const [phoneTransferTarget, setPhoneTransferTarget] = useState("");
  const [cloudflaredBin, setCloudflaredBin] = useState("");
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState("");
  const [twilioPhoneNumberSid, setTwilioPhoneNumberSid] = useState("");
  const [telnyxApiKey, setTelnyxApiKey] = useState("");
  const [telnyxCallControlAppId, setTelnyxCallControlAppId] = useState("");
  const [telnyxApplicationName, setTelnyxApplicationName] = useState("Listency");
  const [telnyxPhoneNumber, setTelnyxPhoneNumber] = useState("");
  const [now, setNow] = useState(Date.now());
  const hasLoadedAllRef = useRef(false);
  const isLoadingAllRef = useRef(false);

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
  const selectedProvider = providers.find((provider) => provider.name === providerChoice);
  const selectedProviderReady = selectedProvider?.ready ?? false;
  const readinessChecks: ReadinessCheck[] = useMemo(() => {
    const enabledToolCount = tools.filter((tool) => tool.enabled).length;
    const selectedProviderHasKey = providerChoice === "gemini" ? config.has_gemini_key : config.has_openai_key;
    return [
      {
        id: "backend",
        label: "Backend health",
        detail: backendHealth.available ? "Local backend is responding on 127.0.0.1:8765." : backendHealth.message,
        ready: backendHealth.available,
      },
      {
        id: "runtime",
        label: "Runtime",
        detail:
          status.background_status === "degraded"
            ? status.last_error || "Runtime is degraded. Check the latest provider or phone error."
            : isRuntimeRunning(status.background_status)
              ? "Background runtime is running."
              : "Click Start to enter standby.",
        ready: isRuntimeRunning(status.background_status) && status.background_status !== "degraded",
      },
      {
        id: "provider",
        label: "Selected provider",
        detail:
          selectedProviderReady && selectedProviderHasKey
            ? `${selectedProvider?.display_name ?? providerChoice} is ready.`
            : `Add a ${providerChoice === "gemini" ? "Gemini" : "OpenAI"} API key in Settings.`,
        ready: selectedProviderReady && selectedProviderHasKey,
      },
      {
        id: "business",
        label: "Business profile",
        detail: business.content.trim() ? "Business information is saved locally." : "Add business details for the lookup tool.",
        ready: Boolean(business.content.trim()),
      },
      {
        id: "agent",
        label: "Agent prompt",
        detail: agent.system_prompt.trim() ? "System prompt is ready." : "Add a system prompt for new sessions.",
        ready: Boolean(agent.system_prompt.trim()),
      },
      {
        id: "tools",
        label: "Tools",
        detail:
          enabledToolCount > 0
            ? `${enabledToolCount} tool${enabledToolCount === 1 ? "" : "s"} enabled.`
            : "Enable at least one tool.",
        ready: enabledToolCount > 0,
      },
      {
        id: "phone",
        label: "Phone",
        detail:
          phoneStatus.provider === "none"
            ? "Phone calls are optional for the current local test flow."
            : phoneStatus.last_call_status === "failed" && phoneStatus.last_call_error
              ? phoneStatus.last_call_error
            : phoneStatus.configured
              ? `${phoneStatus.provider} inbound calls are connected.`
              : "Connect phone service from Settings.",
        ready: (phoneStatus.provider === "none" || phoneStatus.configured) && phoneStatus.last_call_status !== "failed",
      },
    ];
  }, [
    agent.system_prompt,
    backendHealth,
    business.content,
    config.has_gemini_key,
    config.has_openai_key,
    providerChoice,
    phoneStatus.configured,
    phoneStatus.last_call_error,
    phoneStatus.last_call_status,
    phoneStatus.provider,
    selectedProvider?.display_name,
    selectedProviderReady,
    status.background_status,
    status.last_error,
    tools,
  ]);

  const loadLogData = useCallback(async () => {
    const since = logWindowSince(logWindow);
    const [sessionList, transcriptList, toolCallList, appLogList] = await Promise.all([
      api.sessions(since, 200),
      api.transcripts(undefined, 300, since),
      api.toolCalls(undefined, 300, since),
      api.appLogs(undefined, 300, since),
    ]);
    setSessions(sessionList.sessions);
    setTranscripts(transcriptList.transcripts);
    setToolCalls(toolCallList.tool_calls);
    setAppLogs(appLogList.logs);
  }, [logWindow]);

  const loadAll = useCallback(async () => {
    if (isLoadingAllRef.current) {
      return false;
    }

    isLoadingAllRef.current = true;
    try {
      const since = logWindowSince(logWindow);
      const [
        health,
        cfg,
        providerList,
        phone,
        toolList,
        sessionList,
        transcriptList,
        toolCallList,
        appLogList,
        businessProfile,
        agentProfile,
        previewCache,
      ] = await Promise.all([
        api.health(),
        api.getConfig(),
        api.providers(),
        api.phoneStatus().catch(() => emptyPhoneStatus),
        api.tools(),
        api.sessions(since, 200),
        api.transcripts(undefined, 300, since),
        api.toolCalls(undefined, 300, since),
        api.appLogs(undefined, 300, since),
        api.businessProfile(),
        api.agent(),
        api.voicePreviewCache().catch(() => emptyVoicePreviewCache),
      ]);
      setBackendHealth({
        available: true,
        checking: false,
        message: "Local backend is healthy.",
        last_checked_at: new Date().toISOString(),
      });
      setStatus(health.runtime);
      setConfig(cfg);
      setProviders(providerList.providers);
      setPhoneStatus(phone);
      setTools(toolList.tools);
      setSessions(sessionList.sessions);
      setTranscripts(transcriptList.transcripts);
      setToolCalls(toolCallList.tool_calls);
      setAppLogs(appLogList.logs);
      setVoicePreviewCache(previewCache);
      setBusiness(businessProfile);
      setAgent(agentProfile);
      setProviderChoice(cfg.DEFAULT_REALTIME_PROVIDER || "openai");
      setOpenAiModel(cfg.OPENAI_REALTIME_MODEL || DEFAULT_OPENAI_REALTIME_MODEL);
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
      setPhoneProvider(cfg.PHONE_PROVIDER || "none");
      setPhoneConnectionMode(cfg.PHONE_CONNECTION_MODE || "automatic");
      setPhonePublicBaseUrl(cfg.PHONE_PUBLIC_BASE_URL || "");
      setPhoneRealtimeProvider(cfg.PHONE_REALTIME_PROVIDER || "");
      setPhoneTransferTarget(cfg.PHONE_TRANSFER_TARGET || "");
      setCloudflaredBin(cfg.CLOUDFLARED_BIN || "");
      setTwilioAccountSid("");
      setTwilioAuthToken("");
      setTwilioPhoneNumber(cfg.TWILIO_PHONE_NUMBER || "");
      setTwilioPhoneNumberSid("");
      setTelnyxApiKey("");
      setTelnyxCallControlAppId(cfg.TELNYX_CALL_CONTROL_APP_ID || "");
      setTelnyxApplicationName(cfg.TELNYX_APPLICATION_NAME || "Listency");
      setTelnyxPhoneNumber(cfg.TELNYX_PHONE_NUMBER || "");
      hasLoadedAllRef.current = true;
      return true;
    } catch (err) {
      setBackendHealth({
        available: false,
        checking: false,
        message: err instanceof Error ? err.message : "Backend unavailable",
        last_checked_at: new Date().toISOString(),
      });
      return false;
    } finally {
      isLoadingAllRef.current = false;
    }
  }, [logWindow]);

  useEffect(() => {
    let cancelled = false;
    const retryBootstrap = async () => {
      for (let attempt = 0; attempt < 20 && !cancelled && !hasLoadedAllRef.current; attempt += 1) {
        const loaded = await loadAll();
        if (loaded || cancelled) {
          return;
        }
        const delayMs = Math.min(500 + attempt * 250, 2000);
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      }
    };

    void retryBootstrap();
    const refresh = window.setInterval(() => {
      setNow(Date.now());
      api.health()
        .then((health) => {
          setStatus(health.runtime);
          setBackendHealth({
            available: true,
            checking: false,
            message: "Local backend is healthy.",
            last_checked_at: new Date().toISOString(),
          });
          if (!hasLoadedAllRef.current && !cancelled) {
            void loadAll();
          }
        })
        .catch((err) => {
          setBackendHealth({
            available: false,
            checking: false,
            message: err instanceof Error ? err.message : "Backend unavailable",
            last_checked_at: new Date().toISOString(),
          });
        });
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [loadAll]);

  useEffect(() => {
    if (!hasLoadedAllRef.current) {
      return;
    }
    loadLogData().catch((err) => {
      toast.error(err instanceof Error ? err.message : "Logs unavailable");
    });
  }, [loadLogData]);

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
      phone_provider: phoneProvider,
      phone_connection_mode: phoneConnectionMode,
      phone_public_base_url: phonePublicBaseUrl,
      phone_realtime_provider: phoneRealtimeProvider,
      phone_transfer_target: phoneTransferTarget,
      cloudflared_bin: cloudflaredBin,
      twilio_account_sid: twilioAccountSid,
      twilio_auth_token: twilioAuthToken,
      twilio_phone_number: twilioPhoneNumber,
      twilio_phone_number_sid: twilioPhoneNumberSid,
      telnyx_api_key: telnyxApiKey,
      telnyx_call_control_app_id: telnyxCallControlAppId,
      telnyx_application_name: telnyxApplicationName,
      telnyx_phone_number: telnyxPhoneNumber,
    });
    setOpenAiKey("");
    setGeminiKey("");
    setTwilioAccountSid("");
    setTwilioAuthToken("");
    setTwilioPhoneNumberSid("");
    setTelnyxApiKey("");
  }, [
    cloudflaredBin,
    geminiKey,
    geminiModel,
    geminiVoice,
    openAiKey,
    openAiMock,
    openAiModel,
    openAiVoice,
    phoneConnectionMode,
    phoneProvider,
    phonePublicBaseUrl,
    phoneRealtimeProvider,
    phoneTransferTarget,
    providerChoice,
    telnyxApiKey,
    telnyxApplicationName,
    telnyxCallControlAppId,
    telnyxPhoneNumber,
    twilioAccountSid,
    twilioAuthToken,
    twilioPhoneNumber,
    twilioPhoneNumberSid,
  ]);

  const connectPhone = useCallback(async () => {
    await saveSettings();
    const connected = await api.connectPhone();
    setPhoneStatus(connected.phone);
  }, [saveSettings]);

  const stopPhoneConnection = useCallback(async () => {
    const stopped = await api.stopPhoneConnection();
    setPhoneStatus(stopped.phone);
  }, []);

  const refreshTwilioDebugger = useCallback(async () => {
    setTwilioDebuggerLoading(true);
    setTwilioDebuggerError("");
    try {
      const result = await api.twilioDebugger(10, 24);
      setTwilioDebuggerAlerts(result.alerts);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Twilio Debugger unavailable";
      setTwilioDebuggerError(message);
      toast.error(message);
    } finally {
      setTwilioDebuggerLoading(false);
    }
  }, []);

  const previewVoice = useCallback(async (provider: string, voice: string) => {
    try {
      const preview = await api.createVoicePreview({ provider, voice });
      await new Audio(preview.audio_url).play();
      setVoicePreviewCache((current) => {
        const existing = current.cached[provider] ?? [];
        return {
          cached: {
            ...current.cached,
            [provider]: Array.from(new Set([...existing, voice])).sort(),
          },
        };
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Voice preview failed");
      throw err;
    }
  }, []);

  const downloadLogs = useCallback(async () => {
    const since = logWindowSince(logWindow);
    const payload = await api.exportLogs(since);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJson(`listency-logs-${logWindow}-${stamp}.json`, payload);
  }, [logWindow]);

  const pruneOldLogs = useCallback(async () => {
    await api.pruneLogs(30);
  }, []);

  const clearLogs = useCallback(async () => {
    await api.clearLogs();
  }, []);

  return {
    status,
    backendHealth,
    config,
    providers,
    phoneStatus,
    twilioDebuggerAlerts,
    twilioDebuggerError,
    twilioDebuggerLoading,
    tools,
    sessions,
    transcripts,
    toolCalls,
    appLogs,
    logWindow,
    voicePreviewCache,
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
    phoneProvider,
    phoneConnectionMode,
    phonePublicBaseUrl,
    phoneRealtimeProvider,
    phoneTransferTarget,
    cloudflaredBin,
    twilioAccountSid,
    twilioAuthToken,
    twilioPhoneNumber,
    twilioPhoneNumberSid,
    telnyxApiKey,
    telnyxCallControlAppId,
    telnyxApplicationName,
    telnyxPhoneNumber,
    activeSession,
    remainingSeconds,
    selectedProviderReady,
    readinessChecks,
    loadAll,
    runAction,
    saveSettings,
    connectPhone,
    stopPhoneConnection,
    refreshTwilioDebugger,
    previewVoice,
    downloadLogs,
    pruneOldLogs,
    clearLogs,
    setTranscripts,
    setToolCalls,
    setAppLogs,
    setLogWindow,
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
    setPhoneProvider,
    setPhoneConnectionMode,
    setPhonePublicBaseUrl,
    setPhoneRealtimeProvider,
    setPhoneTransferTarget,
    setCloudflaredBin,
    setTwilioAccountSid,
    setTwilioAuthToken,
    setTwilioPhoneNumber,
    setTwilioPhoneNumberSid,
    setTelnyxApiKey,
    setTelnyxCallControlAppId,
    setTelnyxApplicationName,
    setTelnyxPhoneNumber,
  };
}
