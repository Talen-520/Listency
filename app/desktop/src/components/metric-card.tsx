import type { ComponentType } from "react";
import { Activity } from "lucide-react";

export function MetricCard({
  label,
  value,
  icon: Icon = Activity,
}: {
  label: string;
  value: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-4">
      <div className="flex items-center justify-between pb-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="font-display text-lg font-semibold leading-none tracking-normal">{value}</p>
    </div>
  );
}
