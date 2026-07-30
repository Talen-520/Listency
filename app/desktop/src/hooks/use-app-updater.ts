import { useCallback, useEffect, useRef, useState } from "react";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

const AUTO_CHECK_DELAY_MS = 5_000;
const AUTO_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1_000;

export type AppUpdatePhase =
  | "unsupported"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "deferred"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export type AppUpdateState = {
  phase: AppUpdatePhase;
  currentVersion: string;
  nextVersion: string;
  notes: string;
  progress: number | null;
  error: string;
  lastCheckedAt: string | null;
  blockedByActiveSession: boolean;
};

export type AppUpdaterController = AppUpdateState & {
  checkForUpdates: () => Promise<void>;
  deferUpdate: () => void;
  installUpdate: () => Promise<void>;
};

const initialState: AppUpdateState = {
  phase: "idle",
  currentVersion: "",
  nextVersion: "",
  notes: "",
  progress: null,
  error: "",
  lastCheckedAt: null,
  blockedByActiveSession: false,
};

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useAppUpdater({ hasActiveSession }: { hasActiveSession: boolean }): AppUpdaterController {
  const [state, setState] = useState<AppUpdateState>(() =>
    isTauriRuntime() ? initialState : { ...initialState, phase: "unsupported" },
  );
  const updateRef = useRef<Update | null>(null);
  const activeSessionRef = useRef(hasActiveSession);
  const operationRef = useRef<"idle" | "checking" | "updating">("idle");
  const autoCheckStartedRef = useRef(false);

  useEffect(() => {
    activeSessionRef.current = hasActiveSession;
    if (!hasActiveSession) {
      setState((current) =>
        current.blockedByActiveSession ? { ...current, blockedByActiveSession: false } : current,
      );
    }
  }, [hasActiveSession]);

  const checkForUpdates = useCallback(async () => {
    if (!isTauriRuntime() || operationRef.current !== "idle") {
      return;
    }

    operationRef.current = "checking";
    setState((current) => ({
      ...current,
      phase: "checking",
      error: "",
      blockedByActiveSession: false,
    }));

    try {
      const [{ getVersion }, { check }] = await Promise.all([
        import("@tauri-apps/api/app"),
        import("@tauri-apps/plugin-updater"),
      ]);
      const currentVersion = await getVersion();
      const update = await check({ timeout: 15_000 });
      const checkedAt = new Date().toISOString();

      if (!update) {
        if (updateRef.current) {
          await updateRef.current.close().catch(() => undefined);
          updateRef.current = null;
        }
        setState({
          ...initialState,
          phase: "up-to-date",
          currentVersion,
          lastCheckedAt: checkedAt,
        });
        return;
      }

      if (updateRef.current && updateRef.current !== update) {
        await updateRef.current.close().catch(() => undefined);
      }
      updateRef.current = update;
      setState({
        ...initialState,
        phase: "available",
        currentVersion,
        nextVersion: update.version,
        notes: update.body ?? "",
        lastCheckedAt: checkedAt,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        phase: "error",
        error: errorMessage(error),
        lastCheckedAt: new Date().toISOString(),
      }));
    } finally {
      operationRef.current = "idle";
    }
  }, []);

  const deferUpdate = useCallback(() => {
    setState((current) => ({
      ...current,
      phase: current.phase === "ready" ? "ready" : "deferred",
      blockedByActiveSession: false,
    }));
  }, []);

  const installUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update || operationRef.current !== "idle") {
      return;
    }
    if (activeSessionRef.current) {
      setState((current) => ({ ...current, blockedByActiveSession: true }));
      return;
    }

    operationRef.current = "updating";
    let downloadedBytes = 0;
    let contentLength = 0;
    const alreadyDownloaded = state.phase === "ready";

    try {
      if (!alreadyDownloaded) {
        setState((current) => ({
          ...current,
          phase: "downloading",
          progress: 0,
          error: "",
          blockedByActiveSession: false,
        }));
        await update.download((event: DownloadEvent) => {
          if (event.event === "Started") {
            contentLength = event.data.contentLength ?? 0;
            downloadedBytes = 0;
          } else if (event.event === "Progress") {
            downloadedBytes += event.data.chunkLength;
          } else if (event.event === "Finished") {
            downloadedBytes = contentLength || downloadedBytes;
          }
          const progress =
            contentLength > 0 ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100)) : null;
          setState((current) => ({ ...current, progress }));
        });
      }

      setState((current) => ({ ...current, phase: "ready", progress: 100 }));
      if (activeSessionRef.current) {
        setState((current) => ({ ...current, blockedByActiveSession: true }));
        return;
      }

      setState((current) => ({ ...current, phase: "installing", blockedByActiveSession: false }));
      await update.install();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      setState((current) => ({
        ...current,
        phase: "error",
        error: errorMessage(error),
      }));
    } finally {
      operationRef.current = "idle";
    }
  }, [state.phase]);

  useEffect(() => {
    if (!isTauriRuntime() || autoCheckStartedRef.current) {
      return;
    }
    autoCheckStartedRef.current = true;
    const initialTimer = window.setTimeout(() => void checkForUpdates(), AUTO_CHECK_DELAY_MS);
    const interval = window.setInterval(() => void checkForUpdates(), AUTO_CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [checkForUpdates]);

  useEffect(
    () => () => {
      if (updateRef.current) {
        void updateRef.current.close();
      }
    },
    [],
  );

  return {
    ...state,
    checkForUpdates,
    deferUpdate,
    installUpdate,
  };
}
