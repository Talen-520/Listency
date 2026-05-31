import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMessage, languageOptions, type Language, useI18n } from "@/lib/i18n";

export function LanguageToggle() {
  const { language, setLanguage, t } = useI18n();
  const currentLanguage = languageOptions.find((option) => option.value === language) ?? languageOptions[0];
  const currentLabel = t(currentLanguage.labelKey);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label={t("language.select")}>
              <Languages className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{formatMessage(t("language.current"), { language: currentLabel })}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={language} onValueChange={(value) => setLanguage(value as Language)}>
          {languageOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {t(option.labelKey)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
