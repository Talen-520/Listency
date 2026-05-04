import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("h-3.5 w-3.5 animate-spin", className)} aria-hidden="true" />;
}
