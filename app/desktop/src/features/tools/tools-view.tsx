import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import type { ToolInfo } from "@/lib/types";

export function ToolsView({
  tools,
  onToolEnabledChange,
}: {
  tools: ToolInfo[];
  onToolEnabledChange: (toolName: string, enabled: boolean) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("tools.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("tools.description")}</p>
      </div>
      <Separator />
      <div className="space-y-1">
        {tools.map((tool, index) => (
          <div key={tool.name}>
            <div className="flex items-start justify-between gap-6 py-4">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium leading-none">{tool.name}</p>
                <p className="text-sm text-muted-foreground">{tool.description}</p>
              </div>
              <Switch
                checked={tool.enabled}
                onCheckedChange={(checked) => onToolEnabledChange(tool.name, checked)}
              />
            </div>
            {index < tools.length - 1 && <Separator />}
          </div>
        ))}
      </div>
    </div>
  );
}
