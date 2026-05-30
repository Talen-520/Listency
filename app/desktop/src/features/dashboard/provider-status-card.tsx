import { ProviderBrandIcon } from "@/components/provider-brand-icon";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import type { ProviderInfo } from "@/lib/types";

export function ProviderStatusCard({ provider }: { provider: ProviderInfo }) {
  const { t } = useI18n();

  return (
    <div className="group flex items-center justify-between gap-4 rounded-lg bg-muted/40 p-4 transition-colors">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground transition-colors group-hover:bg-muted group-hover:text-foreground">
          <ProviderBrandIcon provider={provider.name} />
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-base font-semibold">{provider.display_name}</div>
          <div className="text-sm text-muted-foreground">{provider.name}</div>
        </div>
      </div>
      <Badge className="shrink-0" tone={provider.ready ? "green" : "yellow"}>
        {provider.ready ? t("status.ready") : t("status.missingKey")}
      </Badge>
    </div>
  );
}
