import { useMemo, useState, type ReactNode } from "react";
import { BadgeCheck, Bell, CheckCircle2, CircleAlert, CircleDashed, Download, ExternalLink, LifeBuoy, Loader2, PhoneCall, Play, PlugZap, RotateCcw, Square, Trash2 } from "lucide-react";

import { Field } from "@/components/field";
import { ProviderBrandIcon } from "@/components/provider-brand-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ApiKeyHelp } from "@/features/settings/api-key-help";
import { VoiceHelp } from "@/features/settings/voice-help";
import { formatMessage, translateStatus, useI18n } from "@/lib/i18n";
import { DEFAULT_OPENAI_REALTIME_MODEL, geminiLiveModelOptions } from "@/lib/models";
import type { PhoneStatus, PublicConfig, TwilioDebuggerAlert, VoicePreviewCache } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isSupportedVoice, type VoiceOption, voiceOptionsForProvider } from "@/lib/voices";

const OPENAI_API_KEYS_URL = "https://platform.openai.com/settings/organization/api-keys";
const GEMINI_API_KEYS_URL = "https://aistudio.google.com/app/api-keys?project=stock-agent-f54f1";
const DEVELOPER_CONTACT_URL = "https://x.com/Momo_tao205";
const LISTENCY_ISSUES_URL = "https://github.com/Talen-520/Listency/issues";
const PROVIDER_DEFAULT_VOICE = "__provider_default__";
const PHONE_PROVIDER_LABELS: Record<string, string> = {
  telnyx: "Telnyx",
  twilio: "Twilio",
};
type StatusTone = "neutral" | "ok" | "warning";
type PhoneActionState = "idle" | "connecting" | "provisioning" | "stopping";
type PhoneNoticeTone = "info" | "warning" | "error";
type PhoneNoticeInfo = {
  blocking: boolean;
  detail: string;
  title: string;
  tone: PhoneNoticeTone;
};
type ChecklistItemInfo = {
  detail: string;
  ready: boolean;
  title: string;
};

function titleCaseStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function providerLabel(value: string, t: (key: string, fallback?: string) => string) {
  if (value === "none") {
    return t("status.off");
  }
  return PHONE_PROVIDER_LABELS[value] ?? titleCaseStatus(value || "none");
}

function connectionLabel(value: string, t: (key: string, fallback?: string) => string) {
  const labels: Record<string, string> = {
    missing_connector: t("status.missingConnector", "Missing Connector"),
    not_configured: t("phone.notConfigured"),
    running: t("status.running"),
    starting: t("status.starting", "Starting"),
    stopped: t("status.stopped"),
  };
  return labels[value] ?? titleCaseStatus(value || "stopped");
}

function connectionTone(value: string): StatusTone {
  if (value === "running") {
    return "ok";
  }
  if (value === "missing_connector" || value === "not_configured") {
    return "warning";
  }
  return "neutral";
}

function phoneOutcomeLabel(value: string, t: (key: string, fallback?: string) => string) {
  if (!value || value === "none") {
    return t("phone.noRecentCalls");
  }
  return translateStatus(value, t);
}

function phoneOutcomeTone(value: string): StatusTone {
  if (["provider_error", "network_error", "failed", "unknown"].includes(value)) {
    return "warning";
  }
  if (["agent_hung_up", "caller_hung_up", "completed", "transferred", "timeout_5_minutes"].includes(value)) {
    return "ok";
  }
  return "neutral";
}

function recentCallSummaryValue(phoneStatus: PhoneStatus, t: (key: string, fallback?: string) => string) {
  const summary = phoneStatus.recent_call_summary;
  const total = Number(summary?.total ?? 0);
  if (total <= 0) {
    return t("phone.noRecentCalls");
  }
  const outcomes = summary?.outcomes ?? {};
  const failed =
    Number(outcomes.failed ?? 0)
    + Number(outcomes.network_error ?? 0)
    + Number(outcomes.provider_error ?? 0)
    + Number(outcomes.unknown ?? 0);
  return formatMessage(t("phone.recentCallSummary"), { failed, total });
}

function recentCallSummaryTone(phoneStatus: PhoneStatus): StatusTone {
  if (Number(phoneStatus.recent_call_summary?.total ?? 0) <= 0) {
    return "neutral";
  }
  const outcomes = phoneStatus.recent_call_summary?.outcomes ?? {};
  const failed =
    Number(outcomes.failed ?? 0)
    + Number(outcomes.network_error ?? 0)
    + Number(outcomes.provider_error ?? 0)
    + Number(outcomes.unknown ?? 0);
  return failed > 0 ? "warning" : "ok";
}

function translatePhoneConnectionMessage(message: string, t: (key: string, fallback?: string) => string) {
  const messageKeyMap: Record<string, string> = {
    "Automatic secure connection is stopped.": "phone.automaticConnectionStopped",
    "Automatic secure connection stopped.": "phone.automaticConnectionStopped",
    "Starting automatic secure connection...": "phone.startingConnection",
    "Automatic connection needs cloudflared bundled with the app or installed on PATH.": "phone.missingCloudflared",
    "Automatic connection stopped before it became ready.": "phone.connectionStoppedBeforeReady",
    "Automatic connection did not publish a URL in time.": "phone.connectionTimedOut",
  };
  const key = messageKeyMap[message];
  return key ? t(key) : message;
}

function hasValue(value: string | boolean) {
  return typeof value === "boolean" ? value : value.trim().length > 0;
}

function missingPhoneFields({
  config,
  phoneProvider,
  telnyxApiKey,
  telnyxCallControlAppId,
  twilioAccountSid,
  twilioAuthToken,
  twilioPhoneNumber,
  twilioPhoneNumberSid,
  t,
}: {
  config: PublicConfig;
  phoneProvider: string;
  telnyxApiKey: string;
  telnyxCallControlAppId: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  twilioPhoneNumberSid: string;
  t: (key: string, fallback?: string) => string;
}) {
  const missing: string[] = [];

  if (phoneProvider === "twilio") {
    if (!hasValue(twilioAccountSid) && !hasValue(config.TWILIO_ACCOUNT_SID)) {
      missing.push("Account SID");
    }
    if (!hasValue(twilioAuthToken) && !config.has_twilio_auth_token) {
      missing.push("Auth Token");
    }
    if (!hasValue(twilioPhoneNumber) && !hasValue(twilioPhoneNumberSid) && !hasValue(config.TWILIO_PHONE_NUMBER_SID)) {
      missing.push(t("phone.missingPhoneNumber", "Phone Number"));
    }
  }

  if (phoneProvider === "telnyx") {
    if (!hasValue(telnyxApiKey) && !config.has_telnyx_api_key) {
      missing.push("API Key");
    }
    if (!hasValue(telnyxCallControlAppId)) {
      missing.push(t("phone.callControlAppId"));
    }
  }

  return missing;
}

function phoneNotice({
  config,
  phoneAction,
  phoneConnectionMode,
  phoneConnectionStatus,
  phoneProvider,
  phonePublicBaseUrl,
  phoneStatus,
  selectedPhoneProviderConfigured,
  telnyxApiKey,
  telnyxCallControlAppId,
  twilioAccountSid,
  twilioAuthToken,
  twilioPhoneNumber,
  twilioPhoneNumberSid,
  t,
}: {
  config: PublicConfig;
  phoneAction: PhoneActionState;
  phoneConnectionMode: string;
  phoneConnectionStatus: string;
  phoneProvider: string;
  phonePublicBaseUrl: string;
  phoneStatus: PhoneStatus;
  selectedPhoneProviderConfigured: boolean;
  telnyxApiKey: string;
  telnyxCallControlAppId: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  twilioPhoneNumberSid: string;
  t: (key: string, fallback?: string) => string;
}): PhoneNoticeInfo | null {
  if (phoneProvider === "none") {
    return null;
  }

  if (phoneAction === "connecting") {
    return {
      blocking: true,
      detail: t("phone.startingConnection"),
      title: t("phone.secureConnection"),
      tone: "info",
    };
  }

  if (phoneAction === "provisioning") {
    return {
      blocking: true,
      detail: formatMessage(t("phone.configuringProvider"), { provider: providerLabel(phoneProvider, t) }),
      title: t("phone.configuringWebhooks"),
      tone: "info",
    };
  }

  if (phoneAction === "stopping") {
    return {
      blocking: true,
      detail: t("phone.stopConnectionDetail"),
      title: t("phone.stopConnection"),
      tone: "info",
    };
  }

  const missing = missingPhoneFields({
    config,
    phoneProvider,
    telnyxApiKey,
    telnyxCallControlAppId,
    twilioAccountSid,
    twilioAuthToken,
    twilioPhoneNumber,
    twilioPhoneNumberSid,
    t,
  });

  if (missing.length > 0) {
    return {
      blocking: true,
      detail: formatMessage(t("phone.missing"), { fields: missing.join(", ") }),
      title: formatMessage(t("phone.addSettings"), { provider: providerLabel(phoneProvider, t) }),
      tone: "warning",
    };
  }

  if (phoneConnectionMode === "manual" && !phonePublicBaseUrl.trim()) {
    return {
      blocking: true,
      detail: t("phone.customUrlRequiredDetail"),
      title: t("phone.addCustomUrl"),
      tone: "warning",
    };
  }

  if (phoneStatus.provider === phoneProvider && phoneStatus.provider_error) {
    return {
      blocking: false,
      detail: phoneStatus.provider_error,
      title: formatMessage(t("phone.needsAttention"), { provider: providerLabel(phoneProvider, t) }),
      tone: "error",
    };
  }

  if (phoneStatus.provider === phoneProvider && phoneStatus.last_call_status === "failed" && phoneStatus.last_call_error) {
    return {
      blocking: false,
      detail: phoneStatus.last_call_error,
      title: t("phone.latestFailed"),
      tone: "error",
    };
  }

  if (phoneConnectionStatus === "missing_connector" || phoneConnectionStatus === "not_configured") {
    return {
      blocking: false,
      detail: translatePhoneConnectionMessage(phoneStatus.connection.message, t) || t("phone.connectionNotReady"),
      title: connectionLabel(phoneConnectionStatus, t),
      tone: "warning",
    };
  }

  if (phoneStatus.provider === phoneProvider && phoneStatus.reprovision_required) {
    return {
      blocking: false,
      detail: phoneStatus.reprovision_reason || t("phone.webhookUpdateNeededDetail"),
      title: t("phone.webhookUpdateNeeded"),
      tone: "warning",
    };
  }

  if (selectedPhoneProviderConfigured) {
    return {
      blocking: false,
      detail: t("phone.inboundReadyDetail"),
      title: t("phone.inboundReady"),
      tone: "info",
    };
  }

  return {
    blocking: false,
    detail: t("phone.readyToConnectDetail"),
    title: t("phone.readyToConnect"),
    tone: "info",
  };
}

function hasUnsavedPhoneSettings({
  cloudflaredBin,
  config,
  phoneConnectionMode,
  phoneProvider,
  phonePublicBaseUrl,
  phoneRealtimeProvider,
  phoneTransferTarget,
  telnyxApiKey,
  telnyxApplicationName,
  telnyxCallControlAppId,
  telnyxPhoneNumber,
  twilioAccountSid,
  twilioAuthToken,
  twilioPhoneNumber,
  twilioPhoneNumberSid,
}: {
  cloudflaredBin: string;
  config: PublicConfig;
  phoneConnectionMode: string;
  phoneProvider: string;
  phonePublicBaseUrl: string;
  phoneRealtimeProvider: string;
  phoneTransferTarget: string;
  telnyxApiKey: string;
  telnyxApplicationName: string;
  telnyxCallControlAppId: string;
  telnyxPhoneNumber: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  twilioPhoneNumberSid: string;
}) {
  return (
    phoneProvider !== (config.PHONE_PROVIDER || "none") ||
    phoneConnectionMode !== (config.PHONE_CONNECTION_MODE || "automatic") ||
    phonePublicBaseUrl !== (config.PHONE_PUBLIC_BASE_URL || "") ||
    phoneRealtimeProvider !== (config.PHONE_REALTIME_PROVIDER || "") ||
    phoneTransferTarget !== (config.PHONE_TRANSFER_TARGET || "") ||
    cloudflaredBin !== (config.CLOUDFLARED_BIN || "") ||
    twilioPhoneNumber !== (config.TWILIO_PHONE_NUMBER || "") ||
    telnyxCallControlAppId !== (config.TELNYX_CALL_CONTROL_APP_ID || "") ||
    telnyxApplicationName !== (config.TELNYX_APPLICATION_NAME || "Listency") ||
    telnyxPhoneNumber !== (config.TELNYX_PHONE_NUMBER || "") ||
    Boolean(twilioAccountSid || twilioAuthToken || twilioPhoneNumberSid || telnyxApiKey)
  );
}

function twilioChecklist({
  config,
  phoneConnectionMode,
  phoneConnectionStatus,
  phonePublicBaseUrl,
  phoneStatus,
  phoneUnsaved,
  twilioAccountSid,
  twilioAuthToken,
  twilioPhoneNumber,
  twilioPhoneNumberSid,
  t,
}: {
  config: PublicConfig;
  phoneConnectionMode: string;
  phoneConnectionStatus: string;
  phonePublicBaseUrl: string;
  phoneStatus: PhoneStatus;
  phoneUnsaved: boolean;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  twilioPhoneNumberSid: string;
  t: (key: string, fallback?: string) => string;
}) {
  const missing = missingPhoneFields({
    config,
    phoneProvider: "twilio",
    telnyxApiKey: "",
    telnyxCallControlAppId: "",
    twilioAccountSid,
    twilioAuthToken,
    twilioPhoneNumber,
    twilioPhoneNumberSid,
    t,
  });
  const connectionReady =
    phoneConnectionStatus === "running" ||
    (phoneConnectionMode === "manual" && Boolean(phonePublicBaseUrl.trim()));

  return [
    {
      detail: missing.length > 0 ? formatMessage(t("phone.missing"), { fields: missing.join(", ") }) : t("phone.twilioCredentialsReady"),
      ready: missing.length === 0,
      title: t("phone.twilioCredentials"),
    },
    {
      detail:
        phoneConnectionMode === "manual"
          ? t("phone.secureConnectionCustomReady")
          : connectionReady
            ? t("phone.secureConnectionAutomaticReady")
            : t("phone.secureConnectionPending"),
      ready: connectionReady,
      title: t("phone.secureConnection"),
    },
    {
      detail: phoneStatus.configured && phoneStatus.provider === "twilio" ? t("phone.twilioWebhooksReady") : t("phone.webhookProvisioningPending"),
      ready: phoneStatus.configured && phoneStatus.provider === "twilio",
      title: t("phone.webhookProvisioning"),
    },
    {
      detail: phoneUnsaved ? t("phone.unsavedDetail") : t("phone.savedSettingsApplied"),
      ready: !phoneUnsaved,
      title: t("phone.savedSettings"),
    },
  ] satisfies ChecklistItemInfo[];
}

export function SettingsView({
  config,
  phoneStatus,
  twilioDebuggerAlerts,
  twilioDebuggerError,
  twilioDebuggerLoading,
  desktopNotificationsEnabled,
  desktopNotificationPermission,
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
  voicePreviewCache,
  onOpenAiKeyChange,
  onGeminiKeyChange,
  onProviderChoiceChange,
  onOpenAiModelChange,
  onGeminiModelChange,
  onOpenAiMockChange,
  onOpenAiVoiceChange,
  onGeminiVoiceChange,
  onPhoneProviderChange,
  onPhoneConnectionModeChange,
  onPhonePublicBaseUrlChange,
  onPhoneRealtimeProviderChange,
  onPhoneTransferTargetChange,
  onCloudflaredBinChange,
  onTwilioAccountSidChange,
  onTwilioAuthTokenChange,
  onTwilioPhoneNumberChange,
  onTwilioPhoneNumberSidChange,
  onTelnyxApiKeyChange,
  onTelnyxCallControlAppIdChange,
  onTelnyxApplicationNameChange,
  onTelnyxPhoneNumberChange,
  onPreviewVoice,
  onRefreshTwilioDebugger,
  onDesktopNotificationsEnabledChange,
  onConnectPhone,
  onStopPhoneConnection,
  onSave,
  onPruneLogs,
  onClearLogs,
  onDownloadDiagnostics,
  hasActiveSession,
}: {
  config: PublicConfig;
  phoneStatus: PhoneStatus;
  twilioDebuggerAlerts: TwilioDebuggerAlert[];
  twilioDebuggerError: string;
  twilioDebuggerLoading: boolean;
  desktopNotificationsEnabled: boolean;
  desktopNotificationPermission: NotificationPermission | "unsupported";
  openAiKey: string;
  geminiKey: string;
  providerChoice: string;
  openAiModel: string;
  geminiModel: string;
  openAiMock: string;
  openAiVoice: string;
  geminiVoice: string;
  phoneProvider: string;
  phoneConnectionMode: string;
  phonePublicBaseUrl: string;
  phoneRealtimeProvider: string;
  phoneTransferTarget: string;
  cloudflaredBin: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  twilioPhoneNumberSid: string;
  telnyxApiKey: string;
  telnyxCallControlAppId: string;
  telnyxApplicationName: string;
  telnyxPhoneNumber: string;
  voicePreviewCache: VoicePreviewCache;
  onOpenAiKeyChange: (value: string) => void;
  onGeminiKeyChange: (value: string) => void;
  onProviderChoiceChange: (value: string) => void;
  onOpenAiModelChange: (value: string) => void;
  onGeminiModelChange: (value: string) => void;
  onOpenAiMockChange: (value: string) => void;
  onOpenAiVoiceChange: (value: string) => void;
  onGeminiVoiceChange: (value: string) => void;
  onPhoneProviderChange: (value: string) => void;
  onPhoneConnectionModeChange: (value: string) => void;
  onPhonePublicBaseUrlChange: (value: string) => void;
  onPhoneRealtimeProviderChange: (value: string) => void;
  onPhoneTransferTargetChange: (value: string) => void;
  onCloudflaredBinChange: (value: string) => void;
  onTwilioAccountSidChange: (value: string) => void;
  onTwilioAuthTokenChange: (value: string) => void;
  onTwilioPhoneNumberChange: (value: string) => void;
  onTwilioPhoneNumberSidChange: (value: string) => void;
  onTelnyxApiKeyChange: (value: string) => void;
  onTelnyxCallControlAppIdChange: (value: string) => void;
  onTelnyxApplicationNameChange: (value: string) => void;
  onTelnyxPhoneNumberChange: (value: string) => void;
  onPreviewVoice: (provider: string, voice: string) => Promise<void>;
  onRefreshTwilioDebugger: () => Promise<void>;
  onDesktopNotificationsEnabledChange: (enabled: boolean) => Promise<void>;
  onConnectPhone: () => Promise<void>;
  onStopPhoneConnection: () => Promise<void>;
  onSave: () => void;
  onPruneLogs: () => void;
  onClearLogs: () => void;
  onDownloadDiagnostics: () => void;
  hasActiveSession: boolean;
}) {
  const { t } = useI18n();
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [phoneAction, setPhoneAction] = useState<PhoneActionState>("idle");
  const openAiVoiceOptions = voiceOptionsForProvider("openai");
  const geminiVoiceOptions = voiceOptionsForProvider("gemini");
  const cachedOpenAiVoices = useMemo(() => new Set(voicePreviewCache.cached.openai ?? []), [voicePreviewCache.cached.openai]);
  const cachedGeminiVoices = useMemo(() => new Set(voicePreviewCache.cached.gemini ?? []), [voicePreviewCache.cached.gemini]);

  async function handlePreviewVoice(provider: string, voice: string) {
    if (!voice) {
      return;
    }
    const key = `${provider}:${voice}`;
    setPreviewingVoice(key);
    try {
      await onPreviewVoice(provider, voice);
    } finally {
      setPreviewingVoice(null);
    }
  }

  function handleClearLogs() {
    if (hasActiveSession) {
      return;
    }
    if (window.confirm(t("settings.clearConfirm"))) {
      onClearLogs();
    }
  }

  const phoneConnectionStatus = phoneStatus.connection.status || "stopped";
  const phoneActionBusy = phoneAction !== "idle";
  const canStopPhoneConnection = phoneConnectionStatus === "running" || phoneConnectionStatus === "starting";
  const selectedPhoneProviderConfigured = phoneStatus.configured && phoneStatus.provider === phoneProvider;
  const phoneUnsaved = hasUnsavedPhoneSettings({
    cloudflaredBin,
    config,
    phoneConnectionMode,
    phoneProvider,
    phonePublicBaseUrl,
    phoneRealtimeProvider,
    phoneTransferTarget,
    telnyxApiKey,
    telnyxApplicationName,
    telnyxCallControlAppId,
    telnyxPhoneNumber,
    twilioAccountSid,
    twilioAuthToken,
    twilioPhoneNumber,
    twilioPhoneNumberSid,
  });
  const notice = phoneNotice({
    config,
    phoneAction,
    phoneConnectionMode,
    phoneConnectionStatus,
    phoneProvider,
    phonePublicBaseUrl,
    phoneStatus,
    selectedPhoneProviderConfigured,
    telnyxApiKey,
    telnyxCallControlAppId,
    twilioAccountSid,
    twilioAuthToken,
    twilioPhoneNumber,
    twilioPhoneNumberSid,
    t,
  });
  const canConnectPhone = !phoneActionBusy && !notice?.blocking;
  const canTogglePhoneConnection = canStopPhoneConnection ? !phoneActionBusy : canConnectPhone;
  const connectPhoneLabel =
    phoneAction === "connecting"
      ? t("phone.connecting")
      : phoneAction === "provisioning"
        ? t("phone.configuringWebhooks")
        : phoneStatus.provider === phoneProvider && phoneStatus.reprovision_required
          ? t("action.updateWebhooks")
          : t("action.connectPhone");
  const phoneConnectionToggleLabel =
    phoneAction === "stopping"
      ? t("phone.stopping")
      : canStopPhoneConnection
        ? t("action.stopConnection")
        : connectPhoneLabel;
  const PhoneConnectionToggleIcon =
    phoneActionBusy ? Loader2 : canStopPhoneConnection ? Square : PlugZap;
  const twilioTestChecklist = twilioChecklist({
    config,
    phoneConnectionMode,
    phoneConnectionStatus,
    phonePublicBaseUrl,
    phoneStatus,
    phoneUnsaved,
    twilioAccountSid,
    twilioAuthToken,
    twilioPhoneNumber,
    twilioPhoneNumberSid,
    t,
  });

  async function handleConnectPhone() {
    if (!canConnectPhone) {
      return;
    }
    setPhoneAction("connecting");
    const provisioningTimer = window.setTimeout(() => {
      setPhoneAction("provisioning");
    }, 800);
    try {
      await onConnectPhone();
    } finally {
      window.clearTimeout(provisioningTimer);
      setPhoneAction("idle");
    }
  }

  async function handleStopPhoneConnection() {
    if (!canStopPhoneConnection || phoneActionBusy) {
      return;
    }
    setPhoneAction("stopping");
    try {
      await onStopPhoneConnection();
    } finally {
      setPhoneAction("idle");
    }
  }

  async function handleTogglePhoneConnection() {
    if (canStopPhoneConnection) {
      await handleStopPhoneConnection();
      return;
    }
    await handleConnectPhone();
  }

  return (
    <div className="space-y-6">
      {/* API Keys Section */}
      <div>
        <h2 className="text-lg font-semibold">{t("settings.apiKeys")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.apiKeysDescription")}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{config.env_path || ".env"}</p>
      </div>
      <Separator />
      <div className="grid gap-6 md:grid-cols-2">
        <Field
          label={t("settings.openAiKey")}
          action={
            <ApiKeyHelp
              provider="OpenAI"
              href={OPENAI_API_KEYS_URL}
              description={t("settings.openAiHelp")}
            />
          }
        >
          <InlineSaveInput
            placeholder={config.OPENAI_API_KEY || "sk-..."}
            value={openAiKey}
            onChange={onOpenAiKeyChange}
            onSave={onSave}
          />
        </Field>
        <Field
          label={t("settings.geminiKey")}
          action={
            <ApiKeyHelp
              provider="Gemini"
              href={GEMINI_API_KEYS_URL}
              description={t("settings.geminiHelp")}
            />
          }
        >
          <InlineSaveInput
            placeholder={config.GEMINI_API_KEY || "AIza..."}
            value={geminiKey}
            onChange={onGeminiKeyChange}
            onSave={onSave}
          />
        </Field>
      </div>

      {/* Runtime Section */}
      <div className="pt-2">
        <h2 className="text-lg font-semibold">{t("common.runtime")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.runtimeDescription")}</p>
      </div>
      <Separator />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProviderPanel
          active={providerChoice === "openai"}
          description={t("settings.providerOpenAiDescription")}
          provider="openai"
          title="OpenAI Realtime"
          onSelect={() => onProviderChoiceChange("openai")}
        >
          <Field label={t("common.model")}>
            <Input value={openAiModel} onChange={(event) => onOpenAiModelChange(event.target.value)} placeholder={DEFAULT_OPENAI_REALTIME_MODEL} />
          </Field>
          <Field label={t("common.voice")} action={<VoiceHelp />}>
            <VoiceSelect
              cachedVoices={cachedOpenAiVoices}
              onPreview={() => handlePreviewVoice("openai", openAiVoice)}
              onValueChange={onOpenAiVoiceChange}
              options={openAiVoiceOptions}
              previewing={previewingVoice === `openai:${openAiVoice}`}
              provider="openai"
              value={openAiVoice}
            />
          </Field>
          <Field label={t("settings.mockMode")}>
            <Select value={openAiMock} onValueChange={onOpenAiMockChange}>
              <SelectTrigger>
                <SelectValue placeholder={t("settings.mockModePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">{t("status.off")}</SelectItem>
                <SelectItem value="true">{t("status.on")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </ProviderPanel>

        <ProviderPanel
          active={providerChoice === "gemini"}
          description={t("settings.providerGeminiDescription")}
          provider="gemini"
          title="Gemini Live"
          onSelect={() => onProviderChoiceChange("gemini")}
        >
          <Field label={t("common.model")}>
            <Select value={geminiModel} onValueChange={onGeminiModelChange}>
              <SelectTrigger>
                <SelectValue placeholder={t("settings.selectGeminiModel", "Select Gemini Live model")} />
              </SelectTrigger>
              <SelectContent>
                {geminiLiveModelOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("common.voice")} action={<VoiceHelp />}>
            <VoiceSelect
              cachedVoices={cachedGeminiVoices}
              onPreview={() => handlePreviewVoice("gemini", geminiVoice)}
              onValueChange={onGeminiVoiceChange}
              options={geminiVoiceOptions}
              previewing={previewingVoice === `gemini:${geminiVoice}`}
              provider="gemini"
              value={geminiVoice}
            />
          </Field>
        </ProviderPanel>
      </div>

      {/* Phone Section */}
      <div className="pt-2">
        <h2 className="text-lg font-semibold">{t("phone.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("phone.connectDescription")}</p>
      </div>
      <Separator />
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <PhoneProviderCard
            active={phoneProvider === "none"}
            title={t("status.off")}
            description={t("phone.descriptionOff")}
            onSelect={() => onPhoneProviderChange("none")}
          />
          <PhoneProviderCard
            active={phoneProvider === "twilio"}
            title="Twilio"
            description={t("phone.descriptionTwilio")}
            onSelect={() => onPhoneProviderChange("twilio")}
          />
          <PhoneProviderCard
            active={phoneProvider === "telnyx"}
            title="Telnyx"
            description={t("phone.descriptionTelnyx")}
            onSelect={() => onPhoneProviderChange("telnyx")}
          />
        </div>

        {phoneUnsaved && <UnsavedPhoneSettingsNotice />}

        {phoneProvider !== "none" && (
          <Card className="space-y-5 rounded-lg p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">{t("phone.phoneConnection")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("phone.automaticDetail")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={canStopPhoneConnection ? "outline" : "default"}
                  disabled={!canTogglePhoneConnection}
                  onClick={handleTogglePhoneConnection}
                >
                  <PhoneConnectionToggleIcon
                    className={cn(
                      "h-4 w-4",
                      phoneActionBusy && "animate-spin",
                      canStopPhoneConnection && !phoneActionBusy && "fill-current stroke-current",
                    )}
                  />
                  {phoneConnectionToggleLabel}
                </Button>
              </div>
            </div>

            {notice && <PhoneNotice notice={notice} />}

            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
              <StatusTile label={t("common.provider")} value={providerLabel(phoneProvider, t)} tone={phoneProvider === "none" ? "neutral" : "ok"} />
              <StatusTile label={t("common.connection")} value={connectionLabel(phoneConnectionStatus, t)} tone={connectionTone(phoneConnectionStatus)} />
              <StatusTile label={t("phone.inboundCalls")} value={selectedPhoneProviderConfigured ? t("phone.ready") : t("phone.notConnected")} tone={selectedPhoneProviderConfigured ? "ok" : "warning"} />
              <StatusTile label={t("phone.latestCall")} value={phoneOutcomeLabel(phoneStatus.last_call_outcome, t)} tone={phoneOutcomeTone(phoneStatus.last_call_outcome)} />
              <StatusTile label={t("phone.recentCalls")} value={recentCallSummaryValue(phoneStatus, t)} tone={recentCallSummaryTone(phoneStatus)} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("phone.connectionMode")}>
                <Select value={phoneConnectionMode} onValueChange={onPhoneConnectionModeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("phone.connectionModePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automatic">{t("phone.automatic")}</SelectItem>
                    <SelectItem value="manual">{t("phone.advancedCustomUrl")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("phone.aiProvider")}>
                <Select value={phoneRealtimeProvider || "default"} onValueChange={(next) => onPhoneRealtimeProviderChange(next === "default" ? "" : next)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("phone.useRuntimeDefault", "Use runtime default")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t("phone.useRuntimeDefault", "Use Runtime Default")}</SelectItem>
                    <SelectItem value="openai">OpenAI Realtime</SelectItem>
                    <SelectItem value="gemini">Gemini Live</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label={t("phone.transferTarget")}>
              <Input placeholder="+15551234567" value={phoneTransferTarget} onChange={(event) => onPhoneTransferTargetChange(event.target.value)} />
            </Field>

            {phoneProvider === "twilio" && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={t("phone.accountSid")}>
                    <Input type="password" placeholder={config.TWILIO_ACCOUNT_SID || "AC..."} value={twilioAccountSid} onChange={(event) => onTwilioAccountSidChange(event.target.value)} />
                  </Field>
                  <Field label={t("phone.authToken")}>
                    <Input type="password" placeholder={config.TWILIO_AUTH_TOKEN || t("placeholder.authToken")} value={twilioAuthToken} onChange={(event) => onTwilioAuthTokenChange(event.target.value)} />
                  </Field>
                  <Field label={t("phone.number")}>
                    <Input placeholder="+15551234567" value={twilioPhoneNumber} onChange={(event) => onTwilioPhoneNumberChange(event.target.value)} />
                  </Field>
                  <Field label={t("phone.numberSid")}>
                    <Input type="password" placeholder={config.TWILIO_PHONE_NUMBER_SID || t("placeholder.optional")} value={twilioPhoneNumberSid} onChange={(event) => onTwilioPhoneNumberSidChange(event.target.value)} />
                  </Field>
                </div>
                <PhoneTestChecklist items={twilioTestChecklist} />
                <TwilioDebuggerPanel
                  alerts={twilioDebuggerAlerts}
                  error={twilioDebuggerError}
                  loading={twilioDebuggerLoading}
                  onRefresh={onRefreshTwilioDebugger}
                />
              </>
            )}

            {phoneProvider === "telnyx" && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t("phone.apiKey")}>
                  <Input type="password" placeholder={config.TELNYX_API_KEY || "KEY..."} value={telnyxApiKey} onChange={(event) => onTelnyxApiKeyChange(event.target.value)} />
                </Field>
                <Field label={t("phone.callControlAppId")}>
                  <Input value={telnyxCallControlAppId} onChange={(event) => onTelnyxCallControlAppIdChange(event.target.value)} />
                </Field>
                <Field label={t("common.applicationName")}>
                  <Input value={telnyxApplicationName} onChange={(event) => onTelnyxApplicationNameChange(event.target.value)} />
                </Field>
                <Field label={t("phone.telnyxPhoneNumber", "Telnyx Phone Number")}>
                  <Input placeholder="+15551234567" value={telnyxPhoneNumber} onChange={(event) => onTelnyxPhoneNumberChange(event.target.value)} />
                </Field>
              </div>
            )}

            <details className="rounded-lg bg-muted/40 p-4">
              <summary className="cursor-pointer text-sm font-medium">{t("common.advanced")}</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label={t("phone.customUrl")}>
                  <Input placeholder="https://voice.example.com" value={phonePublicBaseUrl} onChange={(event) => onPhonePublicBaseUrlChange(event.target.value)} />
                </Field>
                <Field label={t("phone.connectorPath")}>
                  <Input placeholder={t("placeholder.bundledAutomatically")} value={cloudflaredBin} onChange={(event) => onCloudflaredBinChange(event.target.value)} />
                  <p className="text-xs text-muted-foreground">{t("phone.connectorHint")}</p>
                </Field>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {translatePhoneConnectionMessage(phoneStatus.connection.message, t)}
              </p>
            </details>
          </Card>
        )}
      </div>

      {/* Notifications Section */}
      <div className="pt-2">
        <h2 className="text-lg font-semibold">{t("settings.notificationsTitle", "Notifications")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.notificationsDescription", "Show local desktop alerts when calls create work for the owner.")}
        </p>
      </div>
      <Separator />
      <Card className="rounded-lg p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="text-base font-semibold">{t("settings.desktopNotificationsTitle", "Follow-up Task Alerts")}</h3>
              <p className="text-sm text-muted-foreground">
                {t(
                  "settings.desktopNotificationsDescription",
                  "Notify you when Listency captures a new booking, callback, customer request, or failure that needs review.",
                )}
              </p>
              {desktopNotificationPermission === "unsupported" && (
                <p className="text-sm text-destructive">
                  {t("settings.notificationsUnsupported", "Desktop notifications are not available in this environment.")}
                </p>
              )}
              {desktopNotificationPermission === "denied" && (
                <p className="text-sm text-destructive">
                  {t("settings.notificationsDenied", "Notifications are blocked. Enable them in your browser or system settings.")}
                </p>
              )}
            </div>
          </div>
          <Switch
            checked={desktopNotificationsEnabled}
            disabled={desktopNotificationPermission === "unsupported"}
            aria-label={t("settings.desktopNotificationsTitle", "Follow-up Task Alerts")}
            onCheckedChange={(checked) => void onDesktopNotificationsEnabledChange(checked)}
          />
        </div>
      </Card>

      {/* Data Section */}
      <div className="pt-2">
        <h2 className="text-lg font-semibold">{t("settings.dataTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.dataDescription")}</p>
      </div>
      <Separator />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 rounded-lg p-5">
          <div>
            <h3 className="text-base font-semibold">{t("settings.retentionTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("settings.retentionDescription")}</p>
          </div>
          <Button type="button" variant="outline" onClick={onPruneLogs}>
            <RotateCcw className="h-4 w-4" />
            {t("action.clean30Days")}
          </Button>
        </Card>
        <Card className="space-y-3 rounded-lg p-5">
          <div>
            <h3 className="text-base font-semibold">{t("settings.clearLogsTitle")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("settings.clearLogsDescription")}
            </p>
          </div>
          <Button type="button" variant="destructive" disabled={hasActiveSession} onClick={handleClearLogs}>
            <Trash2 className="h-4 w-4" />
            {t("action.clearLogs")}
          </Button>
        </Card>
        <Card className="space-y-3 rounded-lg p-5">
          <div>
            <h3 className="text-base font-semibold">{t("settings.diagnosticsTitle", "Export Diagnostics")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("settings.diagnosticsDescription", "Download a redacted support file with local runtime, phone, and recent error context.")}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onDownloadDiagnostics}>
            <Download className="h-4 w-4" />
            {t("action.exportDiagnostics", "Export Diagnostics")}
          </Button>
        </Card>
      </div>

      {/* Support Section */}
      <div className="pt-2">
        <h2 className="text-lg font-semibold">{t("settings.supportTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.supportDescription")}</p>
      </div>
      <Separator />
      <Card className="space-y-4 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <LifeBuoy className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold">{t("settings.supportHelpTitle")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("settings.supportHelpDescription")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild type="button" variant="outline">
            <a href={DEVELOPER_CONTACT_URL} target="_blank" rel="noreferrer">
              {t("action.contactDeveloper")}
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button asChild type="button" variant="outline">
            <a href={LISTENCY_ISSUES_URL} target="_blank" rel="noreferrer">
              {t("action.reportIssue")}
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </Card>
    </div>
  );
}

function VoiceSelect({
  cachedVoices,
  onPreview,
  onValueChange,
  options,
  previewing,
  provider,
  value,
}: {
  cachedVoices: Set<string>;
  onPreview: () => void;
  onValueChange: (value: string) => void;
  options: VoiceOption[];
  previewing: boolean;
  provider: string;
  value: string;
}) {
  const { t } = useI18n();

  return (
    <div className="flex gap-2">
      <Select value={value || PROVIDER_DEFAULT_VOICE} onValueChange={(next) => onValueChange(next === PROVIDER_DEFAULT_VOICE ? "" : next)}>
        <SelectTrigger className="min-w-0 flex-1">
          <SelectValue placeholder={t("voice.providerDefault", "Provider default")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PROVIDER_DEFAULT_VOICE}>{t("voice.providerDefault", "Provider default")}</SelectItem>
          {value.length > 0 && !isSupportedVoice(provider, value) && (
            <SelectItem value={value}>{value} - {t("voice.customSavedValue")}</SelectItem>
          )}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex items-center gap-2">
                {cachedVoices.has(option.value) && <BadgeCheck className="h-3.5 w-3.5 text-muted-foreground" />}
                <span>{option.label}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" size="icon" disabled={!value || previewing} onClick={onPreview} aria-label={t("action.playVoicePreview")}>
        {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function InlineSaveInput({
  onChange,
  onSave,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  onSave: () => void;
  placeholder: string;
  value: string;
}) {
  const { t } = useI18n();

  return (
    <div className="relative">
      <Input
        type="password"
        className="pr-20"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-1 top-1 h-8 px-3"
        onClick={onSave}
      >
        {t("action.save")}
      </Button>
    </div>
  );
}

function ProviderPanel({
  active,
  children,
  description,
  onSelect,
  provider,
  title,
}: {
  active: boolean;
  children: ReactNode;
  description: string;
  onSelect: () => void;
  provider: string;
  title: string;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "space-y-5 rounded-lg p-5 outline-none transition-all duration-300 ease-out",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active
          ? "border-foreground/35 bg-card text-card-foreground shadow-sm ring-1 ring-foreground/10"
          : "border-border bg-muted/25 text-muted-foreground opacity-70 shadow-none hover:bg-muted/40 hover:opacity-100",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-300",
              active ? "bg-background text-foreground" : "bg-background/70 text-muted-foreground",
            )}
          >
            <ProviderBrandIcon provider={provider} className="h-4 w-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className={cn("text-base font-semibold transition-colors duration-300", active ? "text-foreground" : "text-muted-foreground")}>{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ease-out",
            active ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground",
          )}
        >
          <CheckCircle2 className={cn("h-4 w-4 transition-opacity duration-300", active ? "opacity-100" : "opacity-0")} />
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function PhoneProviderCard({
  active,
  description,
  onSelect,
  title,
}: {
  active: boolean;
  description: string;
  onSelect: () => void;
  title: string;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex items-start gap-3 rounded-lg p-4 outline-none transition-all duration-300",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active ? "border-foreground/35 bg-card text-foreground ring-1 ring-foreground/10" : "bg-muted/25 text-muted-foreground opacity-70 hover:bg-muted/40 hover:opacity-100",
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
        <PhoneCall className="h-4 w-4" />
      </div>
      <div className="min-w-0 space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </Card>
  );
}

function UnsavedPhoneSettingsNotice() {
  const { t } = useI18n();

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
      <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("phone.unsaved")}</p>
        <p className="text-sm text-muted-foreground">{t("phone.unsavedDetail")}</p>
      </div>
    </div>
  );
}

function formatAlertTime(value: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function debuggerTone(level: string) {
  const normalized = level.toLowerCase();
  if (normalized === "error") return "red";
  if (normalized === "warning") return "yellow";
  return "neutral";
}

function TwilioDebuggerPanel({
  alerts,
  error,
  loading,
  onRefresh,
}: {
  alerts: TwilioDebuggerAlert[];
  error: string;
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3 rounded-lg bg-muted/30 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-medium">{t("phone.twilioDebugger")}</h4>
          <p className="text-sm text-muted-foreground">{t("phone.twilioDebuggerDescription")}</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void onRefresh()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          {t("action.refresh")}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!error && alerts.length === 0 && (
        <p className="rounded-lg bg-background/60 p-3 text-sm text-muted-foreground">
          {t("phone.noDebuggerAlerts", "No recent Twilio Debugger alerts loaded. Refresh after a failed inbound call.")}
        </p>
      )}

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div key={alert.sid || `${alert.date_created}-${alert.error_code}`} className="space-y-2 rounded-lg bg-background/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={debuggerTone(alert.log_level)}>{translateStatus(alert.log_level || "alert", t)}</Badge>
                {alert.error_code && <Badge tone="neutral">{alert.error_code}</Badge>}
                <span className="text-xs text-muted-foreground">{formatAlertTime(alert.date_generated || alert.date_created)}</span>
              </div>
              <p className="text-sm font-medium">{alert.alert_text || t("phone.twilioAlert")}</p>
              {(alert.request_method || alert.request_url) && (
                <p className="break-all text-xs text-muted-foreground">
                  {[alert.request_method, alert.request_url].filter(Boolean).join(" ")}
                </p>
              )}
              {alert.more_info && (
                <a className="text-xs text-muted-foreground underline underline-offset-4" href={alert.more_info} target="_blank" rel="noreferrer">
                  {t("phone.twilioErrorReference")}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PhoneTestChecklist({ items }: { items: ChecklistItemInfo[] }) {
  const { t } = useI18n();

  return (
    <div className="space-y-3 rounded-lg bg-muted/30 p-4">
      <div>
        <h4 className="text-sm font-medium">{t("phone.twilioTestPrep")}</h4>
        <p className="text-sm text-muted-foreground">{t("phone.twilioTestPrepDescription")}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => {
          const Icon = item.ready ? CheckCircle2 : CircleDashed;
          return (
            <div key={item.title} className="flex items-start gap-3 rounded-lg bg-background/60 p-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PhoneNotice({ notice }: { notice: PhoneNoticeInfo }) {
  const Icon = notice.tone === "info" ? CircleDashed : CircleAlert;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4",
        notice.tone === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : notice.tone === "warning"
            ? "border-destructive/25 bg-destructive/10 text-destructive"
            : "border-border bg-muted/40 text-foreground",
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", notice.tone === "info" && "text-muted-foreground")} />
      <div className="space-y-1">
        <p className="text-sm font-medium">{notice.title}</p>
        <p className={cn("text-sm", notice.tone === "info" ? "text-muted-foreground" : "text-current/80")}>{notice.detail}</p>
      </div>
    </div>
  );
}

function StatusTile({ label, tone = "neutral", value }: { label: string; tone?: StatusTone; value: string }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warning" ? CircleAlert : CircleDashed;
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-4">
      <Icon className={cn("mt-0.5 h-4 w-4", tone === "warning" ? "text-destructive" : "text-muted-foreground")} />
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}
