import { Database } from "lucide-react";

import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Business Profile</h2>
        <p className="text-sm text-muted-foreground">Local text used by business lookup tools and session instructions.</p>
      </div>
      <Separator />
      <div className="space-y-4">
        <Field label="Business Name">
          <Input value={business.name} onChange={(event) => onBusinessChange({ ...business, name: event.target.value })} />
        </Field>
        <Field label="Profile Content">
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
          Save
        </Button>
      </div>
    </div>
  );
}
