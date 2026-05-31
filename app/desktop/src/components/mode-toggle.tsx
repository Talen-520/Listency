import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";

export function ModeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const isDark = resolvedTheme === "dark";
  const label = isDark ? t("language.switchToLightTheme") : t("language.switchToDarkTheme");
  const tooltip = isDark ? t("language.lightTheme") : t("language.darkTheme");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={label}
          onClick={toggleTheme}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
