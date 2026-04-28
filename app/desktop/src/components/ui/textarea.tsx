import * as React from "react";
import { cn } from "../../lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-32 w-full rounded-md border border-[#2a3658] bg-[#0b1020]/90 px-3 py-3 text-sm leading-6 text-text outline-none transition placeholder:text-muted focus:border-cyan focus:ring-2 focus:ring-cyan/20",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
