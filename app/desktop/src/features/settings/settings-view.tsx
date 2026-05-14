import { useMemo, useState, type ReactNode } from "react";
import { BadgeCheck, CheckCircle2, KeyRound, Loader2, Play, RotateCcw, Trash2 } from "lucide-react";

import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ApiKeyHelp } from "@/features/settings/api-key-help";
import { VoiceHelp } from "@/features/settings/voice-help";
import { geminiLiveModelOptions } from "@/lib/models";
import type { PublicConfig, VoicePreviewCache } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isSupportedVoice, type VoiceOption, voiceOptionsForProvider } from "@/lib/voices";

const OPENAI_API_KEYS_URL = "https://platform.openai.com/settings/organization/api-keys";
const GEMINI_API_KEYS_URL = "https://aistudio.google.com/app/api-keys?project=stock-agent-f54f1";
const PROVIDER_DEFAULT_VOICE = "__provider_default__";

export function SettingsView({
  config,
  openAiKey,
  geminiKey,
  providerChoice,
  openAiModel,
  geminiModel,
  openAiMock,
  openAiVoice,
  geminiVoice,
  voicePreviewCache,
  onOpenAiKeyChange,
  onGeminiKeyChange,
  onProviderChoiceChange,
  onOpenAiModelChange,
  onGeminiModelChange,
  onOpenAiMockChange,
  onOpenAiVoiceChange,
  onGeminiVoiceChange,
  onPreviewVoice,
  onSave,
  onPruneLogs,
  onClearLogs,
  hasActiveSession,
}: {
  config: PublicConfig;
  openAiKey: string;
  geminiKey: string;
  providerChoice: string;
  openAiModel: string;
  geminiModel: string;
  openAiMock: string;
  openAiVoice: string;
  geminiVoice: string;
  voicePreviewCache: VoicePreviewCache;
  onOpenAiKeyChange: (value: string) => void;
  onGeminiKeyChange: (value: string) => void;
  onProviderChoiceChange: (value: string) => void;
  onOpenAiModelChange: (value: string) => void;
  onGeminiModelChange: (value: string) => void;
  onOpenAiMockChange: (value: string) => void;
  onOpenAiVoiceChange: (value: string) => void;
  onGeminiVoiceChange: (value: string) => void;
  onPreviewVoice: (provider: string, voice: string) => Promise<void>;
  onSave: () => void;
  onPruneLogs: () => void;
  onClearLogs: () => void;
  hasActiveSession: boolean;
}) {
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
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
          title="OpenAI Realtime"
          onSelect={() => onProviderChoiceChange("openai")}
        >
          <Field label="Model">
            <Input value={openAiModel} onChange={(event) => onOpenAiModelChange(event.target.value)} placeholder="gpt-realtime" />
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
  title,
}: {
  active: boolean;
  children: ReactNode;
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
        <div className="space-y-1">
          <h3 className={cn("text-base font-semibold transition-colors duration-300", active ? "text-foreground" : "text-muted-foreground")}>{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
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
