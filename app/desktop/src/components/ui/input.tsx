import * as React from "react";
import { cn } from "../../lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-[#2a3658] bg-[#0b1020]/90 px-3 text-sm text-text outline-none transition placeholder:text-muted focus:border-cyan focus:ring-2 focus:ring-cyan/20",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
