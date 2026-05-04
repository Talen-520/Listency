import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

export function Field({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm font-medium">{label}</Label>
        {action}
      </div>
      {children}
    </div>
  );
}
