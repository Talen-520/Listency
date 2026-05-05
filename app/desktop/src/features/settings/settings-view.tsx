import { KeyRound } from "lucide-react";

import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ApiKeyHelp } from "@/features/settings/api-key-help";
import { VoiceHelp } from "@/features/settings/voice-help";
import type { PublicConfig } from "@/lib/types";

const OPENAI_API_KEYS_URL = "https://platform.openai.com/settings/organization/api-keys";
const GEMINI_API_KEYS_URL = "https://aistudio.google.com/app/api-keys?project=stock-agent-f54f1";

export function SettingsView({
  config,
  openAiKey,
  geminiKey,
  providerChoice,
  openAiModel,
  geminiModel,
  openAiMock,
  voice,
  onOpenAiKeyChange,
  onGeminiKeyChange,
  onProviderChoiceChange,
  onOpenAiModelChange,
  onGeminiModelChange,
  onOpenAiMockChange,
  onVoiceChange,
  onSave,
}: {
  config: PublicConfig;
  openAiKey: string;
  geminiKey: string;
  providerChoice: string;
  openAiModel: string;
  geminiModel: string;
  openAiMock: string;
  voice: string;
  onOpenAiKeyChange: (value: string) => void;
  onGeminiKeyChange: (value: string) => void;
  onProviderChoiceChange: (value: string) => void;
  onOpenAiModelChange: (value: string) => void;
  onGeminiModelChange: (value: string) => void;
  onOpenAiMockChange: (value: string) => void;
  onVoiceChange: (value: string) => void;
  onSave: () => void;
}) {
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
      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Default Provider">
          <Select value={providerChoice} onValueChange={onProviderChoiceChange}>
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
          <Input value={openAiModel} onChange={(event) => onOpenAiModelChange(event.target.value)} placeholder="gpt-realtime" />
        </Field>
        <Field label="Gemini Live Model">
          <Input value={geminiModel} onChange={(event) => onGeminiModelChange(event.target.value)} placeholder="gemini-3.1-flash-live-preview" />
        </Field>
        <Field label="OpenAI Mock Mode">
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
        <Field label="Default Voice" action={<VoiceHelp />}>
          <Input value={voice} onChange={(event) => onVoiceChange(event.target.value)} placeholder="provider default" />
        </Field>
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
