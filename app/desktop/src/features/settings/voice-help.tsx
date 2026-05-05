import { CircleHelp, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

const OPENAI_VOICE_URL = "https://platform.openai.com/docs/guides/realtime-conversations#audio-inputs-and-outputs";
const GEMINI_LIVE_VOICE_URL = "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/configure-language-voice";

export function VoiceHelp() {
  return (
    <HoverCard openDelay={100} closeDelay={150}>
      <HoverCardTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Default voice help"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-96">
        <div className="space-y-3">
          <div className="text-sm font-medium">Default voice</div>
          <p className="text-sm leading-6 text-muted-foreground">
            Choose Provider default to let the selected provider decide. OpenAI Realtime recommends <code>marin</code> or <code>cedar</code>.
            Gemini Live supports TTS voices such as <code>Kore</code>.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
              href={OPENAI_VOICE_URL}
              target="_blank"
              rel="noreferrer"
            >
              OpenAI voices
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a
              className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
              href={GEMINI_LIVE_VOICE_URL}
              target="_blank"
              rel="noreferrer"
            >
              Gemini voices
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
