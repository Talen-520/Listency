import type { ReactNode } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";

import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ApiKeyHelp } from "@/features/settings/api-key-help";
import { VoiceHelp } from "@/features/settings/voice-help";
import { geminiLiveModelOptions } from "@/lib/models";
import type { PublicConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isSupportedVoice, voiceOptionsForProvider } from "@/lib/voices";

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
  onOpenAiKeyChange,
  onGeminiKeyChange,
  onProviderChoiceChange,
  onOpenAiModelChange,
  onGeminiModelChange,
  onOpenAiMockChange,
  onOpenAiVoiceChange,
  onGeminiVoiceChange,
  onSave,
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
  onOpenAiKeyChange: (value: string) => void;
  onGeminiKeyChange: (value: string) => void;
  onProviderChoiceChange: (value: string) => void;
  onOpenAiModelChange: (value: string) => void;
  onGeminiModelChange: (value: string) => void;
  onOpenAiMockChange: (value: string) => void;
  onOpenAiVoiceChange: (value: string) => void;
  onGeminiVoiceChange: (value: string) => void;
  onSave: () => void;
}) {
  const openAiVoiceOptions = voiceOptionsForProvider("openai");
  const geminiVoiceOptions = voiceOptionsForProvider("gemini");

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
            <Select
              value={openAiVoice || PROVIDER_DEFAULT_VOICE}
              onValueChange={(value) => onOpenAiVoiceChange(value === PROVIDER_DEFAULT_VOICE ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Provider default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PROVIDER_DEFAULT_VOICE}>Provider default</SelectItem>
                {openAiVoice.length > 0 && !isSupportedVoice("openai", openAiVoice) && (
                  <SelectItem value={openAiVoice}>{openAiVoice} - saved custom value</SelectItem>
                )}
                {openAiVoiceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Select
              value={geminiVoice || PROVIDER_DEFAULT_VOICE}
              onValueChange={(value) => onGeminiVoiceChange(value === PROVIDER_DEFAULT_VOICE ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Provider default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PROVIDER_DEFAULT_VOICE}>Provider default</SelectItem>
                {geminiVoice.length > 0 && !isSupportedVoice("gemini", geminiVoice) && (
                  <SelectItem value={geminiVoice}>{geminiVoice} - saved custom value</SelectItem>
                )}
                {geminiVoiceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </ProviderPanel>
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
