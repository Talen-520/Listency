import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "green" | "yellow" | "red" | "cyan";
  className?: string;
};

const tones = {
  neutral: "border-[#2a3658] bg-white/5 text-[#b8c2d9]",
  green: "border-green/30 bg-green/10 text-green",
  yellow: "border-yellow/30 bg-yellow/10 text-yellow",
  red: "border-red/30 bg-red/10 text-red",
  cyan: "border-cyan/30 bg-cyan/10 text-cyan",
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}
