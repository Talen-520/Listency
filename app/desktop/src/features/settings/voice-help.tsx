import { CircleHelp, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useI18n } from "@/lib/i18n";

const OPENAI_VOICE_URL = "https://platform.openai.com/docs/guides/realtime-conversations#audio-inputs-and-outputs";
const GEMINI_LIVE_VOICE_URL = "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/configure-language-voice";

export function VoiceHelp() {
  const { t } = useI18n();

  return (
    <HoverCard openDelay={100} closeDelay={150}>
      <HoverCardTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 rounded-full text-muted-foreground hover:text-foreground"
          aria-label={t("voice.helpAria")}
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-96">
        <div className="space-y-3">
          <div className="text-sm font-medium">{t("voice.helpTitle")}</div>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("voice.helpDescription")}
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
              href={OPENAI_VOICE_URL}
              target="_blank"
              rel="noreferrer"
            >
              {t("voice.openAiVoices")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a
              className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
              href={GEMINI_LIVE_VOICE_URL}
              target="_blank"
              rel="noreferrer"
            >
              {t("voice.geminiVoices")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
