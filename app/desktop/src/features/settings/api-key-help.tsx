import { CircleHelp, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { formatMessage, useI18n } from "@/lib/i18n";

export function ApiKeyHelp({ provider, href, description }: { provider: string; href: string; description: string }) {
  const { t } = useI18n();

  return (
    <HoverCard openDelay={100} closeDelay={150}>
      <HoverCardTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 rounded-full text-muted-foreground hover:text-foreground"
          aria-label={formatMessage(t("apiKeyHelp.aria"), { provider })}
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-80">
        <div className="space-y-2">
          <div className="text-sm font-medium">{formatMessage(t("apiKeyHelp.title"), { provider })}</div>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          <a
            className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            {t("apiKeyHelp.link")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
