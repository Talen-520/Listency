import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";

export function ModeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const { language } = useI18n();
  const isDark = resolvedTheme === "dark";
  const label = language === "zh" ? (isDark ? "切换到浅色主题" : "切换到深色主题") : isDark ? "Switch to light theme" : "Switch to dark theme";
  const tooltip = language === "zh" ? (isDark ? "浅色" : "深色") : isDark ? "Light" : "Dark";

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
