import { Database } from "lucide-react";

import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import type { BusinessProfile } from "@/lib/types";

export function BusinessView({
  business,
  onBusinessChange,
  onSave,
}: {
  business: BusinessProfile;
  onBusinessChange: (business: BusinessProfile) => void;
  onSave: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("business.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("business.description")}</p>
      </div>
      <Separator />
      <div className="space-y-4">
        <Field label={t("business.name")}>
          <Input value={business.name} onChange={(event) => onBusinessChange({ ...business, name: event.target.value })} />
        </Field>
        <Field label={t("business.content")}>
          <Textarea
            className="min-h-96"
            value={business.content}
            onChange={(event) => onBusinessChange({ ...business, content: event.target.value })}
          />
        </Field>
      </div>
      <Separator />
      <div className="flex justify-end">
        <Button onClick={onSave}>
          <Database className="h-4 w-4" />
          {t("action.save")}
        </Button>
      </div>
    </div>
  );
}
