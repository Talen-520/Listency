import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { formatMessage, useI18n } from "@/lib/i18n";
import { DEFAULT_GEMINI_LIVE_MODEL, DEFAULT_OPENAI_REALTIME_MODEL, isSupportedGeminiLiveModel } from "@/lib/models";
import { isRuntimeRunning } from "@/lib/runtime";
import type {
  AgentProfile,
  AppLogRecord,
  BackendHealth,
  BusinessHoursConfig,
  BusinessHoursStatus,
  BusinessInfoSections,
  BusinessProfile,
  FollowUpTask,
  LogTimeWindow,
  PhoneStatus,
  PhoneCallRecord,
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

const DESKTOP_NOTIFICATIONS_ENABLED_KEY = "listency.desktopNotificationsEnabled";
const NOTIFIED_FOLLOW_UP_TASK_IDS_KEY = "listency.notifiedFollowUpTaskIds";
const FOLLOW_UP_TASK_REFRESH_MS = 10_000;

type NotificationPermissionState = NotificationPermission | "unsupported";

function notificationPermissionState(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return window.Notification.permission;
}

function readDesktopNotificationsEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(DESKTOP_NOTIFICATIONS_ENABLED_KEY) === "true";
}

function writeDesktopNotificationsEnabled(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(DESKTOP_NOTIFICATIONS_ENABLED_KEY, enabled ? "true" : "false");
}

function readNotifiedFollowUpTaskIds() {
  if (typeof window === "undefined") {
    return new Set<number>();
  }

  try {
    const raw = window.localStorage.getItem(NOTIFIED_FOLLOW_UP_TASK_IDS_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return new Set<number>(Array.isArray(ids) ? ids.filter((id) => Number.isFinite(id)) : []);
  } catch {
    return new Set<number>();
  }
}

function writeNotifiedFollowUpTaskIds(ids: Set<number>) {
  if (typeof window === "undefined") {
    return;
  }
  const latestIds = Array.from(ids).slice(-300);
  window.localStorage.setItem(NOTIFIED_FOLLOW_UP_TASK_IDS_KEY, JSON.stringify(latestIds));
}

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

const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const defaultBusinessHours: BusinessHoursConfig = {
  timezone: "",
  weekly_hours: Object.fromEntries(weekdays.map((day) => [day, []])),
  closures: [],
  after_hours_mode: "take_callback",
  after_hours_message: "",
  open_hours_transfer_target: "",
  after_hours_transfer_target: "",
};

const defaultBusinessHoursStatus: BusinessHoursStatus = {
  configured: false,
  status: "not_configured",
  is_open: true,
  timezone: "",
  local_time: null,
  reason: "Business hours are not configured.",
  active_policy: "open_hours",
  after_hours_mode: "take_callback",
  message: "",
  transfer_target: "",
  next_change: null,
  allowed_tools: [],
};

const defaultBusinessInfoSections: BusinessInfoSections = {
  business_type: "general",
  location: "",
  services: "",
  pricing: "",
  booking_rules: "",
  policies: "",
  faq: "",
  parking_accessibility: "",
};

const defaultAgent: AgentProfile = {
  id: "default",
  name: "Default Agent",
  system_prompt: [
    "System Guardrails",
    "You are Listency, a realtime phone assistant for a local business. Speak naturally, briefly, and professionally. Do not read section titles aloud.",
    "",
    "You can answer business questions, collect booking requests, log customer requests, transfer calls, and end calls. You cannot make unsupported promises, invent business facts, guarantee availability, provide legal/medical/financial advice, or act outside the enabled tools.",
    "",
    "Use the caller's language when possible. Keep most replies to one or two short spoken sentences. Ask only one focused question at a time.",
    "",
    "Use business_info_lookup before answering questions about hours, location, services, prices, policies, amenities, availability details, or any business-specific fact. If the saved information is missing or unclear, say what you can verify and offer to log the request or transfer the caller.",
    "",
    "Use create_booking only after confirming the customer's name and requested date/time. A booking tool call saves a local request; it does not guarantee final availability unless the business information explicitly says so.",
    "",
    "Use transfer_call when the caller asks for a person, manager, front desk, emergency help, complaint escalation, billing dispute, or anything outside the saved information or enabled tools.",
    "",
    "Use log_customer_request when the caller has a request you cannot confidently complete after one reasonable clarification attempt.",
    "",
    "Use end_call when the caller says goodbye, asks to end the call, becomes abusive, repeatedly goes off-topic, or the conversation is complete. After end_call returns, say exactly one brief goodbye and do not ask another question.",
    "",
    "Default Agent Template",
    "Business type: local service business.",
    "Tone: warm, calm, concise, and helpful.",
    "Primary goal: answer common questions from the saved Business Info, collect booking or callback requests, and route complex issues to staff.",
    "Greeting: Thank the caller for calling the business, then ask how you can help.",
    "Booking flow: collect customer name, requested date/time, party size or service type, contact details if offered, and any special notes. Do not guarantee final confirmation unless the saved Business Info clearly allows it.",
    "FAQ flow: answer from Business Info first. If the answer is not available, offer to log the question for staff follow-up.",
    "Transfer flow: if the caller asks for a human or the issue is urgent, sensitive, or outside scope, use transfer_call.",
    "Closing: when the task is complete, ask if there is anything else. If the caller is done, use end_call and say a short goodbye.",
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
  const { t } = useI18n();
  const [status, setStatus] = useState<RuntimeStatus>(emptyStatus);
  const [backendHealth, setBackendHealth] = useState<BackendHealth>(() => ({
    ...emptyBackendHealth,
    message: t("shell.backendChecking"),
  }));
  const [config, setConfig] = useState<PublicConfig>(emptyConfig);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus>(() => ({
    ...emptyPhoneStatus,
    connection: {
      ...emptyPhoneStatus.connection,
      message: t("phone.automaticConnectionStopped"),
    },
  }));
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [appLogs, setAppLogs] = useState<AppLogRecord[]>([]);
  const [phoneCalls, setPhoneCalls] = useState<PhoneCallRecord[]>([]);
  const [followUpTasks, setFollowUpTasks] = useState<FollowUpTask[]>([]);
  const [logWindow, setLogWindow] = useState<LogTimeWindow>("24h");
  const [voicePreviewCache, setVoicePreviewCache] = useState<VoicePreviewCache>(emptyVoicePreviewCache);
  const [twilioDebuggerAlerts, setTwilioDebuggerAlerts] = useState<TwilioDebuggerAlert[]>([]);
  const [twilioDebuggerError, setTwilioDebuggerError] = useState("");
  const [twilioDebuggerLoading, setTwilioDebuggerLoading] = useState(false);
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabledState] = useState(readDesktopNotificationsEnabled);
  const [desktopNotificationPermission, setDesktopNotificationPermission] =
    useState<NotificationPermissionState>(notificationPermissionState);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessProfile>(defaultBusiness);
  const [businessHours, setBusinessHours] = useState<BusinessHoursConfig>(defaultBusinessHours);
  const [businessHoursStatus, setBusinessHoursStatus] = useState<BusinessHoursStatus>(defaultBusinessHoursStatus);
  const [businessInfoSections, setBusinessInfoSections] = useState<BusinessInfoSections>(defaultBusinessInfoSections);
  const [agents, setAgents] = useState<AgentProfile[]>([defaultAgent]);
  const [activeAgentId, setActiveAgentId] = useState(defaultAgent.id);
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
  const followUpNotificationsPrimedRef = useRef(false);
  const notifiedFollowUpTaskIdsRef = useRef(readNotifiedFollowUpTaskIds());

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
  const businessInfoReadiness = useMemo(() => {
    if (business.content.trim()) {
      return { ready: true, detail: t("readiness.businessSaved") };
    }

    const fieldLabels: Record<keyof Omit<BusinessInfoSections, "business_type">, string> = {
      location: t("businessSections.location", "Location and Directions"),
      services: t("businessSections.services", "Services or Menu"),
      pricing: t("businessSections.pricing", "Pricing Notes"),
      booking_rules: t("businessSections.bookingRules", "Booking Rules"),
      policies: t("businessSections.policies", "Policies"),
      faq: t("businessSections.faq", "FAQ"),
      parking_accessibility: t("businessSections.parkingAccessibility", "Parking and Accessibility"),
    };
    const requiredFields: Array<keyof Omit<BusinessInfoSections, "business_type">> =
      businessInfoSections.business_type === "hotel"
        ? ["location", "services", "booking_rules", "policies"]
        : businessInfoSections.business_type === "restaurant"
          ? ["location", "services", "booking_rules"]
          : businessInfoSections.business_type === "appointment"
            ? ["location", "services", "pricing", "booking_rules"]
            : ["location", "services"];
    const missingFields = requiredFields.filter((field) => !businessInfoSections[field].trim());

    if (missingFields.length === 0) {
      return { ready: true, detail: t("readiness.businessStructuredReady", "Structured business information is ready.") };
    }

    return {
      ready: false,
      detail: formatMessage(t("readiness.addBusinessDetails", "Add Business Info: {fields}."), {
        fields: missingFields.map((field) => fieldLabels[field]).join(", "),
      }),
    };
  }, [business.content, businessInfoSections, t]);
  const businessHoursReadinessDetail = useMemo(() => {
    if (!businessHoursStatus.configured) {
      return t(
        "businessHours.notConfigured",
        "Set hours so Listency knows whether to answer normally, collect callbacks, transfer, or end calls after hours.",
      );
    }

    const nextChange = businessHoursStatus.next_change ? new Date(businessHoursStatus.next_change).toLocaleString() : "";
    const modeLabel = t(`businessHours.mode.${businessHoursStatus.after_hours_mode}`, businessHoursStatus.after_hours_mode);
    const key = businessHoursStatus.is_open ? "businessHours.readyOpenDetail" : "businessHours.readyClosedDetail";
    const fallback = businessHoursStatus.is_open
      ? "Open now. Incoming calls use normal open-hours behavior."
      : "Closed now. Incoming calls follow the configured after-hours mode: {mode}.";
    const detail = formatMessage(t(key, fallback), { mode: modeLabel });
    return nextChange
      ? `${detail} ${formatMessage(t("businessHours.nextChangeDetail", "Next change: {time}."), { time: nextChange })}`
      : detail;
  }, [
    businessHoursStatus.after_hours_mode,
    businessHoursStatus.configured,
    businessHoursStatus.is_open,
    businessHoursStatus.next_change,
    t,
  ]);
  const readinessChecks: ReadinessCheck[] = useMemo(() => {
    const enabledToolCount = tools.filter((tool) => tool.enabled).length;
    const selectedProviderHasKey = providerChoice === "gemini" ? config.has_gemini_key : config.has_openai_key;
    return [
      {
        id: "backend",
        label: "Backend health",
        detail: backendHealth.available ? t("readiness.backendHealthy") : backendHealth.checking ? t("shell.backendChecking") : backendHealth.message,
        ready: backendHealth.available,
      },
      {
        id: "runtime",
        label: "Runtime",
        detail:
          status.background_status === "degraded"
            ? status.last_error || t("readiness.runtimeDegraded")
            : isRuntimeRunning(status.background_status)
              ? t("readiness.runtimeRunning")
              : t("readiness.clickStart"),
        ready: isRuntimeRunning(status.background_status) && status.background_status !== "degraded",
      },
      {
        id: "provider",
        label: "Selected provider",
        detail:
          selectedProviderReady && selectedProviderHasKey
            ? formatMessage(t("readiness.providerReady"), { provider: selectedProvider?.display_name ?? providerChoice })
            : formatMessage(t("readiness.addProviderKey"), { provider: providerChoice === "gemini" ? "Gemini" : "OpenAI" }),
        ready: selectedProviderReady && selectedProviderHasKey,
      },
      {
        id: "business",
        label: "Business profile",
        detail: businessInfoReadiness.detail,
        ready: businessInfoReadiness.ready,
      },
      {
        id: "business_hours",
        label: "Business hours",
        detail: businessHoursReadinessDetail,
        ready: businessHoursStatus.configured,
      },
      {
        id: "agent",
        label: "Agent prompt",
        detail: agent.system_prompt.trim() ? t("readiness.agentReady") : t("readiness.addAgentPrompt"),
        ready: Boolean(agent.system_prompt.trim()),
      },
      {
        id: "tools",
        label: "Tools",
        detail:
          enabledToolCount > 0
            ? formatMessage(t(enabledToolCount === 1 ? "readiness.toolEnabled" : "readiness.toolsEnabled"), { count: enabledToolCount })
            : t("readiness.enableTool"),
        ready: enabledToolCount > 0,
      },
      {
        id: "phone",
        label: "Phone",
        detail:
          phoneStatus.provider === "none"
            ? t("readiness.phoneOptional")
            : phoneStatus.last_call_status === "failed" && phoneStatus.last_call_error
              ? phoneStatus.last_call_error
            : phoneStatus.configured
              ? formatMessage(t("readiness.phoneConnected"), { provider: phoneStatus.provider })
              : t("readiness.connectPhone"),
        ready: (phoneStatus.provider === "none" || phoneStatus.configured) && phoneStatus.last_call_status !== "failed",
      },
    ];
  }, [
    agent.system_prompt,
    backendHealth,
    businessInfoReadiness.detail,
    businessInfoReadiness.ready,
    businessHoursReadinessDetail,
    businessHoursStatus.configured,
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
    t,
    tools,
  ]);

  useEffect(() => {
    const permission = notificationPermissionState();
    setDesktopNotificationPermission(permission);
    if (desktopNotificationsEnabled && permission !== "granted") {
      writeDesktopNotificationsEnabled(false);
      setDesktopNotificationsEnabledState(false);
    }
  }, [desktopNotificationsEnabled]);

  const loadLogData = useCallback(async () => {
    const since = logWindowSince(logWindow);
    const [sessionList, transcriptList, toolCallList, appLogList, phoneCallList] = await Promise.all([
      api.sessions(since, 200),
      api.transcripts(undefined, 300, since),
      api.toolCalls(undefined, 300, since),
      api.appLogs(undefined, 300, since),
      api.phoneCalls(undefined, 200, since),
    ]);
    setSessions(sessionList.sessions);
    setTranscripts(transcriptList.transcripts);
    setToolCalls(toolCallList.tool_calls);
    setAppLogs(appLogList.logs);
    setPhoneCalls(phoneCallList.phone_calls);
  }, [logWindow]);

  const notifyFollowUpTask = useCallback(
    (task: FollowUpTask) => {
      if (!desktopNotificationsEnabled || desktopNotificationPermission !== "granted" || !("Notification" in window)) {
        return;
      }

      const title = task.type === "provider_failure"
        ? t("notifications.providerFailureTitle", "Provider failure needs attention")
        : task.title || t("notifications.followUpTitle", "New follow-up task");
      const caller = task.caller_name || task.caller_phone || "";
      const summary = task.summary || t("notifications.followUpFallback", "A call created a task for owner review.");
      const body = caller ? `${caller}: ${summary}` : summary;

      try {
        const notification = new window.Notification(title, {
          body,
          icon: "/favicon.svg",
          tag: `listency-follow-up-${task.id}`,
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch {
        // Notification support differs across WebView/browser shells. Keep this best-effort.
      }
    },
    [desktopNotificationPermission, desktopNotificationsEnabled, t],
  );

  const syncFollowUpTasks = useCallback(
    (tasks: FollowUpTask[], options: { prime?: boolean } = {}) => {
      setFollowUpTasks(tasks);

      if (options.prime || !followUpNotificationsPrimedRef.current) {
        followUpNotificationsPrimedRef.current = true;
        const notifiedIds = notifiedFollowUpTaskIdsRef.current;
        let notifiedChanged = false;
        for (const task of tasks) {
          if (task.status === "new" && !notifiedIds.has(task.id)) {
            notifiedIds.add(task.id);
            notifiedChanged = true;
          }
        }
        if (notifiedChanged) {
          writeNotifiedFollowUpTaskIds(notifiedIds);
        }
        return;
      }

      let notifiedChanged = false;
      const notifiedIds = notifiedFollowUpTaskIdsRef.current;
      for (const task of tasks) {
        if (task.status !== "new" || notifiedIds.has(task.id)) {
          continue;
        }
        notifyFollowUpTask(task);
        notifiedIds.add(task.id);
        notifiedChanged = true;
      }

      if (notifiedChanged) {
        writeNotifiedFollowUpTaskIds(notifiedIds);
      }
    },
    [notifyFollowUpTask],
  );

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
        phoneCallList,
        followUpTaskList,
        businessProfile,
        businessHoursPayload,
        businessInfoSectionsPayload,
        agentList,
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
        api.phoneCalls(undefined, 200, since),
        api.followUpTasks().catch(() => ({ tasks: [] })),
        api.businessProfile(),
        api.businessHours().catch(() => ({ config: defaultBusinessHours, status: defaultBusinessHoursStatus })),
        api.businessInfoSections().catch(() => ({ sections: defaultBusinessInfoSections })),
        api.agents(),
        api.voicePreviewCache().catch(() => emptyVoicePreviewCache),
      ]);
      const loadedAgents = agentList.agents.length ? agentList.agents : [defaultAgent];
      const activeAgent =
        loadedAgents.find((loadedAgent) => loadedAgent.id === agentList.active_agent_id) ?? loadedAgents[0] ?? defaultAgent;
      setBackendHealth({
        available: true,
        checking: false,
        message: t("readiness.backendHealthy"),
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
      setPhoneCalls(phoneCallList.phone_calls);
      syncFollowUpTasks(followUpTaskList.tasks, { prime: !hasLoadedAllRef.current });
      setVoicePreviewCache(previewCache);
      setBusiness(businessProfile);
      setBusinessHours(businessHoursPayload.config);
      setBusinessHoursStatus(businessHoursPayload.status);
      setBusinessInfoSections(businessInfoSectionsPayload.sections);
      setAgents(loadedAgents);
      setActiveAgentId(activeAgent.id);
      setAgent(activeAgent);
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
        message: err instanceof Error ? err.message : t("backend.unavailable", "Backend unavailable"),
        last_checked_at: new Date().toISOString(),
      });
      return false;
    } finally {
      isLoadingAllRef.current = false;
    }
  }, [logWindow, syncFollowUpTasks, t]);

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
            message: t("readiness.backendHealthy"),
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
            message: err instanceof Error ? err.message : t("backend.unavailable", "Backend unavailable"),
            last_checked_at: new Date().toISOString(),
          });
        });
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [loadAll, t]);

  useEffect(() => {
    if (!hasLoadedAllRef.current) {
      return;
    }
    loadLogData().catch((err) => {
      toast.error(err instanceof Error ? err.message : t("logs.unavailable", "Logs unavailable"));
    });
  }, [loadLogData, t]);

  useEffect(() => {
    if (!backendHealth.available || !hasLoadedAllRef.current) {
      return;
    }

    const refreshTasks = () => {
      api.followUpTasks()
        .then((result) => syncFollowUpTasks(result.tasks))
        .catch(() => {
          // The backend health loop already owns user-visible offline state.
        });
    };

    const refresh = window.setInterval(refreshTasks, FOLLOW_UP_TASK_REFRESH_MS);
    return () => window.clearInterval(refresh);
  }, [backendHealth.available, syncFollowUpTasks]);

  const runAction = useCallback(
    async (action: () => Promise<unknown>, message: string) => {
      try {
        await action();
        toast.success(message);
        await loadAll();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("toast.actionFailed", "Action failed"));
      }
    },
    [loadAll, t],
  );

  const setDesktopNotificationsEnabled = useCallback(
    async (enabled: boolean) => {
      if (!enabled) {
        writeDesktopNotificationsEnabled(false);
        setDesktopNotificationsEnabledState(false);
        toast.success(t("toast.notificationsDisabled", "Desktop notifications disabled"));
        return;
      }

      if (!("Notification" in window)) {
        setDesktopNotificationPermission("unsupported");
        writeDesktopNotificationsEnabled(false);
        setDesktopNotificationsEnabledState(false);
        toast.error(t("settings.notificationsUnsupported", "Desktop notifications are not available in this environment."));
        return;
      }

      let permission = window.Notification.permission;
      if (permission === "default") {
        permission = await window.Notification.requestPermission();
      }

      setDesktopNotificationPermission(permission);
      const granted = permission === "granted";
      writeDesktopNotificationsEnabled(granted);
      setDesktopNotificationsEnabledState(granted);
      if (granted) {
        toast.success(t("toast.notificationsEnabled", "Desktop notifications enabled"));
      } else {
        toast.error(t("settings.notificationsDenied", "Notifications are blocked. Enable them in your browser or system settings."));
      }
    },
    [t],
  );

  const updateAgentDraft = useCallback((nextAgent: AgentProfile) => {
    setAgent(nextAgent);
    setAgents((current) =>
      current.some((storedAgent) => storedAgent.id === nextAgent.id)
        ? current.map((storedAgent) => (storedAgent.id === nextAgent.id ? nextAgent : storedAgent))
        : [...current, nextAgent],
    );
  }, []);

  const createAgent = useCallback(async () => {
    await api.createAgent({
      name: `Agent ${agents.length + 1}`,
      system_prompt: defaultAgent.system_prompt,
    });
  }, [agents.length]);

  const saveAgent = useCallback(async () => {
    await api.updateAgent(agent.id, {
      name: agent.name,
      system_prompt: agent.system_prompt,
    });
  }, [agent.id, agent.name, agent.system_prompt]);

  const selectAgent = useCallback(async (agentId: string) => {
    const selected = await api.selectAgent(agentId);
    setActiveAgentId(selected.id);
    setAgent(selected);
  }, []);

  const deleteAgent = useCallback(async (agentId: string) => {
    await api.deleteAgent(agentId);
  }, []);

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
      const message = err instanceof Error ? err.message : t("phone.twilioDebuggerUnavailable", "Twilio Debugger unavailable");
      setTwilioDebuggerError(message);
      toast.error(message);
    } finally {
      setTwilioDebuggerLoading(false);
    }
  }, [t]);

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
      toast.error(err instanceof Error ? err.message : t("voice.previewFailed", "Voice preview failed"));
      throw err;
    }
  }, [t]);

  const downloadLogs = useCallback(async () => {
    const since = logWindowSince(logWindow);
    const payload = await api.exportLogs(since);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJson(`listency-logs-${logWindow}-${stamp}.json`, payload);
  }, [logWindow]);

  const downloadDiagnostics = useCallback(async () => {
    const payload = await api.exportDiagnostics();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJson(`listency-diagnostics-${stamp}.json`, payload);
  }, []);

  const pruneOldLogs = useCallback(async () => {
    await api.pruneLogs(30);
  }, []);

  const clearLogs = useCallback(async () => {
    await api.clearLogs();
  }, []);

  const saveBusinessHours = useCallback(async () => {
    const result = await api.saveBusinessHours(businessHours);
    setBusinessHours(result.config);
    setBusinessHoursStatus(result.status);
  }, [businessHours]);

  const saveBusinessInfo = useCallback(async () => {
    const [profile, sections] = await Promise.all([
      api.saveBusinessProfile({ name: business.name, content: business.content }),
      api.saveBusinessInfoSections(businessInfoSections),
    ]);
    setBusiness(profile);
    setBusinessInfoSections(sections.sections);
  }, [business.content, business.name, businessInfoSections]);

  const updateFollowUpTaskStatus = useCallback(async (id: number, status: FollowUpTask["status"]) => {
    await api.updateFollowUpTaskStatus(id, status);
  }, []);

  const deleteFollowUpTask = useCallback(async (id: number) => {
    await api.deleteFollowUpTask(id);
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
    desktopNotificationsEnabled,
    desktopNotificationPermission,
    tools,
    sessions,
    transcripts,
    toolCalls,
    appLogs,
    phoneCalls,
    followUpTasks,
    logWindow,
    voicePreviewCache,
    selectedSessionId,
    selectedSession,
    selectedSessionDetailId,
    business,
    businessHours,
    businessHoursStatus,
    businessInfoSections,
    agents,
    activeAgentId,
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
    createAgent,
    saveAgent,
    selectAgent,
    deleteAgent,
    saveSettings,
    connectPhone,
    stopPhoneConnection,
    refreshTwilioDebugger,
    setDesktopNotificationsEnabled,
    previewVoice,
    downloadLogs,
    downloadDiagnostics,
    pruneOldLogs,
    clearLogs,
    saveBusinessHours,
    saveBusinessInfo,
    updateFollowUpTaskStatus,
    deleteFollowUpTask,
    setTranscripts,
    setToolCalls,
    setAppLogs,
    setLogWindow,
    setSelectedSessionId,
    setBusiness,
    setBusinessHours,
    setBusinessInfoSections,
    setAgent: updateAgentDraft,
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
