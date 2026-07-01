import { AlertCircle, CheckCircle2, Database, Play, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { formatMessage, translateStatus, useI18n } from "@/lib/i18n";
import type { EvaluationRun, EvaluationScenario, EvaluationScenarioResult } from "@/lib/types";

function statusTone(status: string): "green" | "red" | "neutral" {
  if (status === "passed") {
    return "green";
  }
  if (status === "failed") {
    return "red";
  }
  return "neutral";
}

function formatDurationMs(value: number) {
  if (value < 1000) {
    return `${value}ms`;
  }
  return `${(value / 1000).toFixed(1)}s`;
}

function latestRunSummary(run: EvaluationRun | undefined, t: (key: string, fallback?: string) => string) {
  if (!run) {
    return t("evaluations.noRunsShort");
  }
  return formatMessage(t("evaluations.latestSummary"), {
    failed: run.failed_count,
    passed: run.passed_count,
    total: run.scenario_count,
  });
}

function resultIcon(result: EvaluationScenarioResult) {
  return result.status === "passed" ? CheckCircle2 : AlertCircle;
}

export function EvaluationsView({
  evaluationRunning,
  latestRun,
  runs,
  scenarios,
  selectedRun,
  onInspectRun,
  onRunEvaluations,
}: {
  evaluationRunning: boolean;
  latestRun?: EvaluationRun;
  runs: EvaluationRun[];
  scenarios: EvaluationScenario[];
  selectedRun: EvaluationRun | null;
  onInspectRun: (id: string) => void;
  onRunEvaluations: () => void;
}) {
  const { t } = useI18n();
  const selectedResults = selectedRun?.results ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <CardTitle>{t("evaluations.title")}</CardTitle>
            <CardDescription>{t("evaluations.description")}</CardDescription>
          </div>
          <Button type="button" disabled={evaluationRunning} onClick={onRunEvaluations}>
            <Play className="h-4 w-4 fill-current stroke-current" />
            {evaluationRunning ? t("evaluations.running") : t("evaluations.run")}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="flex gap-3 rounded-lg bg-muted/40 p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("evaluations.scenarioCount")}</p>
              <p className="text-sm text-muted-foreground">{formatMessage(t("evaluations.scenarioCountValue"), { count: scenarios.length })}</p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg bg-muted/40 p-4">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("evaluations.dataSafety")}</p>
              <p className="text-sm text-muted-foreground">{t("evaluations.dataSafetyDescription")}</p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg bg-muted/40 p-4">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("evaluations.latestRun")}</p>
              <p className="text-sm text-muted-foreground">{latestRunSummary(latestRun, t)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("evaluations.scenarios")}</CardTitle>
            <CardDescription>{t("evaluations.scenariosDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {scenarios.length === 0 ? (
              <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{t("evaluations.noScenarios")}</div>
            ) : (
              <div className="flex flex-col gap-4">
                {scenarios.map((scenario) => (
                  <div key={scenario.id} className="rounded-lg bg-muted/40 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{scenario.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{scenario.description}</p>
                      </div>
                      <Badge variant="outline">{scenario.id}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("evaluations.recentRuns")}</CardTitle>
            <CardDescription>{t("evaluations.recentRunsDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{t("evaluations.noRuns")}</div>
            ) : (
              <ScrollArea className="h-[24rem]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead>{t("evaluations.result")}</TableHead>
                      <TableHead>{t("common.duration")}</TableHead>
                      <TableHead>{t("common.created")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id} className="cursor-pointer" onClick={() => onInspectRun(run.id)}>
                        <TableCell>
                          <Badge tone={statusTone(run.status)}>{translateStatus(run.status, t)}</Badge>
                        </TableCell>
                        <TableCell>
                          {formatMessage(t("evaluations.passFail"), {
                            failed: run.failed_count,
                            passed: run.passed_count,
                          })}
                        </TableCell>
                        <TableCell>{formatDurationMs(run.duration_ms)}</TableCell>
                        <TableCell>{formatDate(run.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("evaluations.runDetail")}</CardTitle>
          <CardDescription>
            {selectedRun ? formatMessage(t("evaluations.runDetailDescription"), { id: selectedRun.id }) : t("evaluations.noRunSelected")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedRun ? (
            <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{t("evaluations.selectRun")}</div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="grid gap-3 md:grid-cols-4">
                <SummaryTile label={t("common.status")} value={<Badge tone={statusTone(selectedRun.status)}>{translateStatus(selectedRun.status, t)}</Badge>} />
                <SummaryTile label={t("evaluations.passed")} value={selectedRun.passed_count} />
                <SummaryTile label={t("evaluations.failed")} value={selectedRun.failed_count} />
                <SummaryTile label={t("common.duration")} value={formatDurationMs(selectedRun.duration_ms)} />
              </div>
              <Separator />
              {selectedResults.length === 0 ? (
                <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{t("evaluations.resultsUnavailable")}</div>
              ) : (
                <div className="flex flex-col gap-4">
                  {selectedResults.map((result) => {
                    const Icon = resultIcon(result);
                    return (
                      <div key={result.id} className="rounded-lg bg-muted/40 p-4">
                        <div className="flex items-start gap-3">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium">{result.title}</p>
                              <Badge tone={statusTone(result.status)}>{translateStatus(result.status, t)}</Badge>
                              <Badge variant="outline">{formatDurationMs(result.duration_ms)}</Badge>
                            </div>
                            {result.errors.length > 0 && (
                              <div className="mt-3 flex flex-col gap-2">
                                {result.errors.map((error) => (
                                  <p key={error} className="text-sm text-destructive">{error}</p>
                                ))}
                              </div>
                            )}
                            <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-background p-3 text-xs text-muted-foreground">
                              {JSON.stringify(result.actual, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/40 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
