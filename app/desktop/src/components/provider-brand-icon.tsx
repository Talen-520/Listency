import { BsOpenai } from "react-icons/bs";
import { SiGooglegemini } from "react-icons/si";

import { cn } from "@/lib/utils";

const providerIcons = {
  gemini: SiGooglegemini,
  google: SiGooglegemini,
  openai: BsOpenai,
} as const;

export function ProviderBrandIcon({ provider, className }: { provider: string; className?: string }) {
  const Icon = providerIcons[provider.toLowerCase() as keyof typeof providerIcons] ?? SiGooglegemini;

  return <Icon className={cn("h-5 w-5", className)} aria-hidden="true" />;
}
