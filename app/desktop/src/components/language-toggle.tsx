import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";

export function LanguageToggle() {
  const { language, toggleLanguage, t } = useI18n();
  const nextLabel = language === "en" ? t("language.switchToChinese") : t("language.switchToEnglish");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" aria-label={nextLabel} onClick={toggleLanguage}>
          <Languages className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{language === "en" ? t("language.chinese") : t("language.english")}</TooltipContent>
    </Tooltip>
  );
}
