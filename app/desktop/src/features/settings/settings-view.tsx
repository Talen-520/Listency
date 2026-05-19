import { useMemo, useState, type ReactNode } from "react";
import { BadgeCheck, CheckCircle2, CircleAlert, CircleDashed, KeyRound, Loader2, PhoneCall, Play, PlugZap, RotateCcw, Square, Trash2 } from "lucide-react";

import { Field } from "@/components/field";
import { ProviderBrandIcon } from "@/components/provider-brand-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ApiKeyHelp } from "@/features/settings/api-key-help";
import { VoiceHelp } from "@/features/settings/voice-help";
import { DEFAULT_OPENAI_REALTIME_MODEL, geminiLiveModelOptions } from "@/lib/models";
import type { PhoneStatus, PublicConfig, VoicePreviewCache } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isSupportedVoice, type VoiceOption, voiceOptionsForProvider } from "@/lib/voices";

const OPENAI_API_KEYS_URL = "https://platform.openai.com/settings/organization/api-keys";
const GEMINI_API_KEYS_URL = "https://aistudio.google.com/app/api-keys?project=stock-agent-f54f1";
const PROVIDER_DEFAULT_VOICE = "__provider_default__";
const PHONE_PROVIDER_LABELS: Record<string, string> = {
  none: "Off",
  telnyx: "Telnyx",
  twilio: "Twilio",
};
const PHONE_CONNECTION_LABELS: Record<string, string> = {
  missing_connector: "Missing Connector",
  not_configured: "Needs Public URL",
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
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

function titleCaseStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function providerLabel(value: string) {
  return PHONE_PROVIDER_LABELS[value] ?? titleCaseStatus(value || "none");
}

function connectionLabel(value: string) {
  return PHONE_CONNECTION_LABELS[value] ?? titleCaseStatus(value || "stopped");
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
}: {
  config: PublicConfig;
  phoneProvider: string;
  telnyxApiKey: string;
  telnyxCallControlAppId: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  twilioPhoneNumberSid: string;
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
      missing.push("Phone Number");
    }
  }

  if (phoneProvider === "telnyx") {
    if (!hasValue(telnyxApiKey) && !config.has_telnyx_api_key) {
      missing.push("API Key");
    }
    if (!hasValue(telnyxCallControlAppId)) {
      missing.push("Call Control App ID");
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
}): PhoneNoticeInfo | null {
  if (phoneProvider === "none") {
    return null;
  }

  if (phoneAction === "connecting") {
    return {
      blocking: true,
      detail: "Starting the local secure connection for inbound phone webhooks.",
      title: "Creating secure connection",
      tone: "info",
    };
  }

  if (phoneAction === "provisioning") {
    return {
      blocking: true,
      detail: `Configuring ${providerLabel(phoneProvider)} webhooks to point at Listency.`,
      title: "Configuring provider webhooks",
      tone: "info",
    };
  }

  if (phoneAction === "stopping") {
    return {
      blocking: true,
      detail: "Stopping the public connection used for inbound phone webhooks.",
      title: "Stopping phone connection",
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
  });

  if (missing.length > 0) {
    return {
      blocking: true,
      detail: `Missing ${missing.join(", ")}.`,
      title: `Add ${providerLabel(phoneProvider)} settings`,
      tone: "warning",
    };
  }

  if (phoneConnectionMode === "manual" && !phonePublicBaseUrl.trim()) {
    return {
      blocking: true,
      detail: "Advanced Custom URL mode needs a public HTTPS URL before provider webhooks can be configured.",
      title: "Add Custom Public URL",
      tone: "warning",
    };
  }

  if (phoneStatus.provider === phoneProvider && phoneStatus.provider_error) {
    return {
      blocking: false,
      detail: phoneStatus.provider_error,
      title: `${providerLabel(phoneProvider)} needs attention`,
      tone: "error",
    };
  }

  if (phoneConnectionStatus === "missing_connector" || phoneConnectionStatus === "not_configured") {
    return {
      blocking: false,
      detail: phoneStatus.connection.message || "Phone connection is not ready yet.",
      title: connectionLabel(phoneConnectionStatus),
      tone: "warning",
    };
  }

  if (selectedPhoneProviderConfigured) {
    return {
      blocking: false,
      detail: "Inbound calls are connected to the selected phone provider.",
      title: "Inbound calls ready",
      tone: "info",
    };
  }

  return {
    blocking: false,
    detail: "Click Connect Phone to create the secure connection and configure provider webhooks.",
    title: "Ready to connect",
    tone: "info",
  };
}

export function SettingsView({
  config,
  phoneStatus,
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
  onConnectPhone,
  onStopPhoneConnection,
  onSave,
  onPruneLogs,
  onClearLogs,
  hasActiveSession,
}: {
  config: PublicConfig;
  phoneStatus: PhoneStatus;
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
  onConnectPhone: () => Promise<void>;
  onStopPhoneConnection: () => Promise<void>;
  onSave: () => void;
  onPruneLogs: () => void;
  onClearLogs: () => void;
  hasActiveSession: boolean;
}) {
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
    if (window.confirm("Clear all local sessions, transcripts, tool calls, and app logs? This cannot be undone.")) {
      onClearLogs();
    }
  }

  const phoneConnectionStatus = phoneStatus.connection.status || "stopped";
  const phoneActionBusy = phoneAction !== "idle";
  const canStopPhoneConnection = phoneConnectionStatus === "running" || phoneConnectionStatus === "starting";
  const selectedPhoneProviderConfigured = phoneStatus.configured && phoneStatus.provider === phoneProvider;
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
  });
  const canConnectPhone = !phoneActionBusy && !notice?.blocking;
  const connectPhoneLabel =
    phoneAction === "connecting" ? "Connecting..." : phoneAction === "provisioning" ? "Configuring Webhooks..." : "Connect Phone";

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

  return (
    <div className="space-y-6">
      {/* API Keys Section */}
      <div>
        <h2 className="text-lg font-semibold">API Keys</h2>
        <p className="text-sm text-muted-foreground">Provider keys stored locally in your .env file.</p>
      </div>
      <Separator />
      <div className="grid gap-6 md:grid-cols-2">
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
          <Input type="password" placeholder={config.OPENAI_API_KEY || "sk-..."} value={openAiKey} onChange={(event) => onOpenAiKeyChange(event.target.value)} />
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
          <Input type="password" placeholder={config.GEMINI_API_KEY || "AIza..."} value={geminiKey} onChange={(event) => onGeminiKeyChange(event.target.value)} />
        </Field>
      </div>

      {/* Runtime Section */}
      <div className="pt-2">
        <h2 className="text-lg font-semibold">Runtime</h2>
        <p className="text-sm text-muted-foreground">Default provider and model configuration.</p>
      </div>
      <Separator />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProviderPanel
          active={providerChoice === "openai"}
          description="Realtime speech with OpenAI."
          provider="openai"
          title="OpenAI Realtime"
          onSelect={() => onProviderChoiceChange("openai")}
        >
          <Field label="Model">
            <Input value={openAiModel} onChange={(event) => onOpenAiModelChange(event.target.value)} placeholder={DEFAULT_OPENAI_REALTIME_MODEL} />
          </Field>
          <Field label="Voice" action={<VoiceHelp />}>
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
          <Field label="Mock Mode">
            <Select value={openAiMock} onValueChange={onOpenAiMockChange}>
              <SelectTrigger>
                <SelectValue placeholder="Mock mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Off</SelectItem>
                <SelectItem value="true">On</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </ProviderPanel>

        <ProviderPanel
          active={providerChoice === "gemini"}
          description="Native audio dialogue with Gemini Live."
          provider="gemini"
          title="Gemini Live"
          onSelect={() => onProviderChoiceChange("gemini")}
        >
          <Field label="Model">
            <Select value={geminiModel} onValueChange={onGeminiModelChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select Gemini Live model" />
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
          <Field label="Voice" action={<VoiceHelp />}>
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
        <h2 className="text-lg font-semibold">Phone</h2>
        <p className="text-sm text-muted-foreground">Connect inbound calls without exposing technical webhook settings.</p>
      </div>
      <Separator />
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <PhoneProviderCard
            active={phoneProvider === "none"}
            title="Off"
            description="Use local Test Call only."
            onSelect={() => onPhoneProviderChange("none")}
          />
          <PhoneProviderCard
            active={phoneProvider === "twilio"}
            title="Twilio"
            description="Connect Twilio inbound calls."
            onSelect={() => onPhoneProviderChange("twilio")}
          />
          <PhoneProviderCard
            active={phoneProvider === "telnyx"}
            title="Telnyx"
            description="Prepare Telnyx Call Control."
            onSelect={() => onPhoneProviderChange("telnyx")}
          />
        </div>

        {phoneProvider !== "none" && (
          <Card className="space-y-5 rounded-lg p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">Phone Connection</h3>
                <p className="text-sm text-muted-foreground">
                  Automatic mode creates a secure public connection and configures provider webhooks for you.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={!canConnectPhone} onClick={handleConnectPhone}>
                  {phoneAction === "connecting" || phoneAction === "provisioning" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlugZap className="h-4 w-4" />
                  )}
                  {connectPhoneLabel}
                </Button>
                <Button type="button" variant="outline" disabled={!canStopPhoneConnection || phoneActionBusy} onClick={handleStopPhoneConnection}>
                  {phoneAction === "stopping" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 fill-current stroke-current" />}
                  Stop Connection
                </Button>
              </div>
            </div>

            {notice && <PhoneNotice notice={notice} />}

            <div className="grid gap-4 md:grid-cols-3">
              <StatusTile label="Provider" value={providerLabel(phoneProvider)} tone={phoneProvider === "none" ? "neutral" : "ok"} />
              <StatusTile label="Connection" value={connectionLabel(phoneConnectionStatus)} tone={connectionTone(phoneConnectionStatus)} />
              <StatusTile label="Inbound Calls" value={selectedPhoneProviderConfigured ? "Ready" : "Not Connected"} tone={selectedPhoneProviderConfigured ? "ok" : "warning"} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Connection Mode">
                <Select value={phoneConnectionMode} onValueChange={onPhoneConnectionModeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Connection mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automatic">Automatic Secure Connection</SelectItem>
                    <SelectItem value="manual">Advanced Custom URL</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="AI Provider For Calls">
                <Select value={phoneRealtimeProvider || "default"} onValueChange={(next) => onPhoneRealtimeProviderChange(next === "default" ? "" : next)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Use runtime default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use Runtime Default</SelectItem>
                    <SelectItem value="openai">OpenAI Realtime</SelectItem>
                    <SelectItem value="gemini">Gemini Live</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Transfer Target Number">
              <Input placeholder="+15551234567" value={phoneTransferTarget} onChange={(event) => onPhoneTransferTargetChange(event.target.value)} />
            </Field>

            {phoneProvider === "twilio" && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Twilio Account SID">
                  <Input type="password" placeholder={config.TWILIO_ACCOUNT_SID || "AC..."} value={twilioAccountSid} onChange={(event) => onTwilioAccountSidChange(event.target.value)} />
                </Field>
                <Field label="Twilio Auth Token">
                  <Input type="password" placeholder={config.TWILIO_AUTH_TOKEN || "auth token"} value={twilioAuthToken} onChange={(event) => onTwilioAuthTokenChange(event.target.value)} />
                </Field>
                <Field label="Twilio Phone Number">
                  <Input placeholder="+15551234567" value={twilioPhoneNumber} onChange={(event) => onTwilioPhoneNumberChange(event.target.value)} />
                </Field>
                <Field label="Phone Number SID">
                  <Input type="password" placeholder={config.TWILIO_PHONE_NUMBER_SID || "optional"} value={twilioPhoneNumberSid} onChange={(event) => onTwilioPhoneNumberSidChange(event.target.value)} />
                </Field>
              </div>
            )}

            {phoneProvider === "telnyx" && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Telnyx API Key">
                  <Input type="password" placeholder={config.TELNYX_API_KEY || "KEY..."} value={telnyxApiKey} onChange={(event) => onTelnyxApiKeyChange(event.target.value)} />
                </Field>
                <Field label="Call Control App ID">
                  <Input value={telnyxCallControlAppId} onChange={(event) => onTelnyxCallControlAppIdChange(event.target.value)} />
                </Field>
                <Field label="Application Name">
                  <Input value={telnyxApplicationName} onChange={(event) => onTelnyxApplicationNameChange(event.target.value)} />
                </Field>
                <Field label="Telnyx Phone Number">
                  <Input placeholder="+15551234567" value={telnyxPhoneNumber} onChange={(event) => onTelnyxPhoneNumberChange(event.target.value)} />
                </Field>
              </div>
            )}

            <details className="rounded-lg bg-muted/40 p-4">
              <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Custom Public URL">
                  <Input placeholder="https://voice.example.com" value={phonePublicBaseUrl} onChange={(event) => onPhonePublicBaseUrlChange(event.target.value)} />
                </Field>
                <Field label="Connector Path">
                  <Input placeholder="Bundled automatically" value={cloudflaredBin} onChange={(event) => onCloudflaredBinChange(event.target.value)} />
                  <p className="text-xs text-muted-foreground">Packaged builds provide this automatically. Use a custom path only for development.</p>
                </Field>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{phoneStatus.connection.message}</p>
            </details>
          </Card>
        )}
      </div>

      {/* Data Section */}
      <div className="pt-2">
        <h2 className="text-lg font-semibold">Data</h2>
        <p className="text-sm text-muted-foreground">Manage local session history and log storage.</p>
      </div>
      <Separator />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3 rounded-lg p-5">
          <div>
            <h3 className="text-base font-semibold">Retention Cleanup</h3>
            <p className="text-sm text-muted-foreground">Delete sessions, transcripts, tool calls, and app logs older than 30 days.</p>
          </div>
          <Button type="button" variant="outline" onClick={onPruneLogs}>
            <RotateCcw className="h-4 w-4" />
            Clean 30+ Days
          </Button>
        </Card>
        <Card className="space-y-3 rounded-lg p-5">
          <div>
            <h3 className="text-base font-semibold">Clear Logs</h3>
            <p className="text-sm text-muted-foreground">
              Remove all local sessions, transcripts, tool calls, and app logs. Active calls must be stopped first.
            </p>
          </div>
          <Button type="button" variant="destructive" disabled={hasActiveSession} onClick={handleClearLogs}>
            <Trash2 className="h-4 w-4" />
            Clear Logs
          </Button>
        </Card>
      </div>

      {/* Save Section */}
      <Separator />
      <div className="flex items-center justify-between gap-4">
        <p className="truncate text-sm text-muted-foreground">{config.env_path || ".env"}</p>
        <Button onClick={onSave}>
          <KeyRound className="h-4 w-4" />
          Save
        </Button>
      </div>
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
  return (
    <div className="flex gap-2">
      <Select value={value || PROVIDER_DEFAULT_VOICE} onValueChange={(next) => onValueChange(next === PROVIDER_DEFAULT_VOICE ? "" : next)}>
        <SelectTrigger className="min-w-0 flex-1">
          <SelectValue placeholder="Provider default" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PROVIDER_DEFAULT_VOICE}>Provider default</SelectItem>
          {value.length > 0 && !isSupportedVoice(provider, value) && (
            <SelectItem value={value}>{value} - saved custom value</SelectItem>
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
      <Button type="button" variant="outline" size="icon" disabled={!value || previewing} onClick={onPreview} aria-label="Play voice preview">
        {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
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
