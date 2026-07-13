import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { LanguageProvider } from "./lib/i18n";
import "./styles.css";

type FatalErrorBoundaryProps = {
  children: React.ReactNode;
};

type FatalErrorBoundaryState = {
  error: Error | null;
};

class FatalErrorBoundary extends React.Component<FatalErrorBoundaryProps, FatalErrorBoundaryState> {
  state: FatalErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background p-8 text-foreground">
          <section className="max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h1 className="text-2xl font-semibold">Listency could not start</h1>
            <p className="mt-3 text-muted-foreground">
              The desktop interface hit a startup error. Restart the app, then export diagnostics if this continues.
            </p>
            <pre className="mt-4 max-h-56 overflow-auto rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              {this.state.error.message}
            </pre>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FatalErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <LanguageProvider>
          <TooltipProvider delayDuration={200}>
            <App />
            <Toaster position="top-center" duration={2000} richColors />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </FatalErrorBoundary>
  </React.StrictMode>,
);
