import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type SheetContextValue = {
  open: boolean;
  rendered: boolean;
  closing: boolean;
  onOpenChange: (open: boolean) => void;
};

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheet() {
  const context = React.useContext(SheetContext);
  if (!context) {
    throw new Error("Sheet components must be used inside Sheet.");
  }
  return context;
}

export function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [rendered, setRendered] = React.useState(open);
  const [closing, setClosing] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return;
    }

    if (!rendered) {
      return;
    }

    setClosing(true);
    const timeout = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [open, rendered]);

  React.useEffect(() => {
    if (!rendered) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, rendered]);

  return <SheetContext.Provider value={{ open, rendered, closing, onOpenChange }}>{children}</SheetContext.Provider>;
}

export function SheetContent({
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement>) {
  const { rendered, closing, onOpenChange } = useSheet();

  if (!rendered || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close sheet"
        className={cn(
          "absolute inset-0 bg-background/70 backdrop-blur-sm",
          closing ? "animate-sheet-overlay-out" : "animate-sheet-overlay-in",
        )}
        onClick={() => onOpenChange(false)}
      />
      <section
        role="dialog"
        aria-modal="true"
        className={cn(
          "fixed right-0 top-0 flex h-full w-full max-w-md flex-col border-l bg-background p-6 shadow-lg",
          closing ? "animate-sheet-slide-out-right" : "animate-sheet-slide-in-right",
          className,
        )}
      >
        <button
          type="button"
          aria-label="Close sheet"
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </section>
    </div>,
    document.body,
  );
}

export const SheetHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("space-y-2 pr-8", className)} {...props} />
  ),
);
SheetHeader.displayName = "SheetHeader";

export const SheetFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mt-auto flex flex-col gap-2 pt-6", className)} {...props} />
  ),
);
SheetFooter.displayName = "SheetFooter";

export const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn("font-display text-lg font-semibold tracking-normal", className)} {...props} />
  ),
);
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />
  ),
);
SheetDescription.displayName = "SheetDescription";
