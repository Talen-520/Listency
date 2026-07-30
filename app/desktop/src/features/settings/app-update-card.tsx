import { CircleAlert, Download, Loader2, RefreshCw, RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AppUpdaterController } from "@/hooks/use-app-updater";
import { formatMessage, useI18n } from "@/lib/i18n";

function formatCheckedAt(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString();
}

export function AppUpdateCard({
  updater,
  hasActiveSession,
}: {
  updater: AppUpdaterController;
  hasActiveSession: boolean;
}) {
  const { t } = useI18n();
  const busy = updater.phase === "checking" || updater.phase === "downloading" || updater.phase === "installing";
  const updateAvailable = ["available", "deferred", "ready"].includes(updater.phase);
  const checkedAt = formatCheckedAt(updater.lastCheckedAt);
  const versionLabel = updater.currentVersion
    ? formatMessage(t("updates.currentVersion"), { version: updater.currentVersion })
    : t("updates.desktopOnly");

  return (
    <Card className="space-y-4 rounded-lg p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{t("updates.title")}</h3>
            <Badge variant="secondary">{versionLabel}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{t("updates.description")}</p>
          {checkedAt && (
            <p className="text-xs text-muted-foreground">
              {formatMessage(t("updates.lastChecked"), { time: checkedAt })}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || updater.phase === "unsupported"}
          onClick={() => void updater.checkForUpdates()}
        >
          {updater.phase === "checking" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {t("updates.checkNow")}
        </Button>
      </div>

      {updater.phase === "unsupported" && (
        <p className="text-sm text-muted-foreground">{t("updates.desktopOnlyDetail")}</p>
      )}
      {updater.phase === "up-to-date" && (
        <p className="text-sm text-muted-foreground">{t("updates.upToDate")}</p>
      )}
      {updater.phase === "error" && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{t("updates.failed")}</AlertTitle>
          <AlertDescription>{updater.error || t("updates.failedDetail")}</AlertDescription>
        </Alert>
      )}
      {updateAvailable && (
        <div className="space-y-3 rounded-lg bg-muted/40 p-4">
          <div>
            <p className="text-sm font-medium">
              {formatMessage(t("updates.available"), { version: updater.nextVersion })}
            </p>
            {updater.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{updater.notes}</p>}
          </div>
          {(hasActiveSession || updater.blockedByActiveSession) && (
            <Alert>
              <CircleAlert />
              <AlertTitle>{t("updates.callActive")}</AlertTitle>
              <AlertDescription>{t("updates.callActiveDetail")}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={hasActiveSession || busy}
              onClick={() => void updater.installUpdate()}
            >
              {updater.phase === "ready" ? <RotateCcw /> : <Download />}
              {updater.phase === "ready" ? t("updates.installRestart") : t("updates.updateNow")}
            </Button>
            {updater.phase !== "ready" && (
              <Button type="button" variant="outline" disabled={busy} onClick={updater.deferUpdate}>
                {t("updates.later")}
              </Button>
            )}
          </div>
        </div>
      )}
      {(updater.phase === "downloading" || updater.phase === "installing") && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>
              {updater.phase === "installing" ? t("updates.installing") : t("updates.downloading")}
            </span>
            {updater.phase === "downloading" && updater.progress !== null && <span>{updater.progress}%</span>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-200"
              style={{ width: `${updater.phase === "installing" ? 100 : updater.progress ?? 12}%` }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
