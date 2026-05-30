import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { LanguageProvider } from "./lib/i18n";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark">
      <LanguageProvider>
        <TooltipProvider delayDuration={200}>
          <App />
          <Toaster position="top-center" duration={2000} richColors />
        </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
