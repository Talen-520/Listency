import { ProviderBrandIcon } from "@/components/provider-brand-icon";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ProviderInfo } from "@/lib/types";

export function VoiceView({ providers }: { providers: ProviderInfo[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Voice Providers</h2>
        <p className="text-sm text-muted-foreground">Available Realtime providers and their voice options.</p>
      </div>
      <Separator />
      <div className="space-y-1">
        {providers.map((provider, index) => (
          <div key={provider.name}>
            <div className="flex items-start justify-between gap-4 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
                  <ProviderBrandIcon provider={provider.name} className="h-4 w-4" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{provider.display_name}</p>
                    <Badge tone={provider.ready ? "green" : "yellow"}>
                      {provider.ready ? "ready" : "missing key"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{provider.name}</p>
                  {provider.voices.length > 0 && (
                    <p className="text-sm text-muted-foreground">Voices: {provider.voices.join(", ")}</p>
                  )}
                </div>
              </div>
            </div>
            {index < providers.length - 1 && <Separator />}
          </div>
        ))}
      </div>
    </div>
  );
}
