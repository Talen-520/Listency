import { useMemo, useState } from "react";
import { Check, Clipboard, Clock, FileText, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMessage, useI18n } from "@/lib/i18n";
import type { FollowUpTask, PhoneCallRecord, SessionRecord, ToolCallRecord, TranscriptRecord } from "@/lib/types";

export function InboxView({
  phoneCalls,
  sessions,
  tasks,
  toolCalls,
  transcripts,
  onComplete,
  onDelete,
  onDismiss,
  onInProgress,
  onOpenSession,
}: {
  phoneCalls: PhoneCallRecord[];
  sessions: SessionRecord[];
  tasks: FollowUpTask[];
  toolCalls: ToolCallRecord[];
  transcripts: TranscriptRecord[];
  onComplete: (id: number) => void;
  onDelete: (id: number) => void;
  onDismiss: (id: number) => void;
  onInProgress: (id: number) => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const { t } = useI18n();
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [typeFilter, setTypeFilter] = useState("all");
  const taskTypes = useMemo(() => Array.from(new Set(tasks.map((task) => task.type))).sort(), [tasks]);
  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const statusMatches =
          statusFilter === "all" ||
          (statusFilter === "open" ? task.status !== "done" && task.status !== "dismissed" : task.status === statusFilter);
        const typeMatches = typeFilter === "all" || task.type === typeFilter;
        return statusMatches && typeMatches;
      }),
    [statusFilter, tasks, typeFilter],
  );
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedSession = selectedTask?.session_id ? sessions.find((session) => session.id === selectedTask.session_id) ?? null : null;
  const selectedPhoneCall = useMemo(() => {
    if (!selectedTask) return null;
    if (selectedTask.phone_call_id) {
      return phoneCalls.find((phoneCall) => phoneCall.id === selectedTask.phone_call_id) ?? null;
    }
    if (selectedTask.session_id) {
      return phoneCalls.find((phoneCall) => phoneCall.session_id === selectedTask.session_id) ?? null;
    }
    return null;
  }, [phoneCalls, selectedTask]);
  const selectedTranscripts = selectedTask?.session_id
    ? transcripts.filter((transcript) => transcript.session_id === selectedTask.session_id).slice().reverse()
    : [];
  const selectedToolCalls = selectedTask?.session_id ? toolCalls.filter((toolCall) => toolCall.session_id === selectedTask.session_id) : [];

  function handleOpenSession(sessionId: string) {
    setSelectedTaskId(null);
    onOpenSession(sessionId);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("inbox.title", "Inbox")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("inbox.description", "Requests captured from calls for owner follow-up.")}
        </p>
      </div>
      <Separator />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={t("inbox.statusFilter", "Status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">{t("inbox.filterOpen", "Open")}</SelectItem>
              <SelectItem value="all">{t("inbox.filterAllStatuses", "All Statuses")}</SelectItem>
              <SelectItem value="new">{formatTaskLabel("new")}</SelectItem>
              <SelectItem value="in_progress">{formatTaskLabel("in_progress")}</SelectItem>
              <SelectItem value="done">{formatTaskLabel("done")}</SelectItem>
              <SelectItem value="dismissed">{formatTaskLabel("dismissed")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder={t("inbox.typeFilter", "Type")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("inbox.filterAllTypes", "All Types")}</SelectItem>
              {taskTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {formatTaskLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatMessage(t("inbox.visibleTasks", "{count} of {total} tasks"), {
            count: filteredTasks.length,
            total: tasks.length,
          })}
        </p>
      </div>
      <TaskTable
        emptyMessage={t("inbox.emptyFiltered", "No follow-up tasks match these filters.")}
        onComplete={onComplete}
        onDelete={onDelete}
        onSelect={setSelectedTaskId}
        tasks={filteredTasks}
        title={t("inbox.tasks", "Tasks")}
      />
      <Sheet open={Boolean(selectedTask)} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <SheetContent className="max-w-xl">
          {selectedTask && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedTask.title}</SheetTitle>
                <SheetDescription>{formatTaskLabel(selectedTask.type)}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 flex-1 space-y-6 overflow-y-auto pr-1">
                <section className="space-y-2">
                  <div className="text-sm font-medium">{t("inbox.summary", "Summary")}</div>
                  <p className="rounded-lg bg-muted p-4 text-sm leading-relaxed text-muted-foreground">{selectedTask.summary}</p>
                </section>

                <section className="grid gap-3 text-sm md:grid-cols-2">
                  <InfoBlock label={t("inbox.caller", "Caller")} value={selectedTask.caller_name || t("inbox.guest", "Guest")} />
                  <InfoBlock label={t("inbox.phone", "Phone")} value={selectedTask.caller_phone || selectedPhoneCall?.from_number || "-"} />
                  <InfoBlock label={t("inbox.status", "Status")} value={formatTaskLabel(selectedTask.status)} />
                  <InfoBlock label={t("inbox.priority", "Priority")} value={formatTaskLabel(selectedTask.priority)} />
                  <InfoBlock label={t("inbox.session", "Session")} value={selectedTask.session_id || "-"} />
                  <InfoBlock label={t("inbox.callStatus", "Call Status")} value={selectedPhoneCall?.status || selectedSession?.status || "-"} />
                </section>

                {selectedToolCalls.length > 0 && (
                  <section className="space-y-2">
                    <div className="text-sm font-medium">{t("inbox.relatedTools", "Related Tool Calls")}</div>
                    <div className="space-y-2">
                      {selectedToolCalls.slice(0, 5).map((toolCall) => (
                        <div key={toolCall.id} className="rounded-lg bg-muted p-3 text-sm">
                          <div className="font-medium">{toolCall.tool_name}</div>
                          <div className="mt-1 text-muted-foreground">{formatTaskLabel(toolCall.status)}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {selectedTranscripts.length > 0 && (
                  <section className="space-y-2">
                    <div className="text-sm font-medium">{t("inbox.transcriptExcerpt", "Transcript Excerpt")}</div>
                    <div className="space-y-2">
                      {selectedTranscripts.slice(-6).map((transcript, index) => (
                        <div key={`${transcript.created_at}-${index}`} className="rounded-lg bg-muted p-3 text-sm">
                          <div className="mb-1 text-xs uppercase text-muted-foreground">{transcript.speaker}</div>
                          <div>{transcript.content}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
              <SheetFooter>
                {selectedTask.session_id && (
                  <Button variant="outline" onClick={() => handleOpenSession(selectedTask.session_id || "")}>
                    <FileText className="h-4 w-4" />
                    {t("inbox.openSession", "Open Session")}
                  </Button>
                )}
                {selectedTask.caller_phone && (
                  <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(selectedTask.caller_phone || "")}>
                    <Clipboard className="h-4 w-4" />
                    {t("inbox.copyPhone", "Copy Phone")}
                  </Button>
                )}
                {selectedTask.status === "new" && (
                  <Button variant="outline" onClick={() => onInProgress(selectedTask.id)}>
                    <Clock className="h-4 w-4" />
                    {t("inbox.inProgress", "In Progress")}
                  </Button>
                )}
                {selectedTask.status !== "done" && (
                  <Button onClick={() => onComplete(selectedTask.id)}>
                    <Check className="h-4 w-4" />
                    {t("inbox.done", "Done")}
                  </Button>
                )}
                {selectedTask.status !== "dismissed" && (
                  <Button variant="outline" onClick={() => onDismiss(selectedTask.id)}>
                    {t("inbox.dismiss", "Dismiss")}
                  </Button>
                )}
                <Button variant="outline" onClick={() => onDelete(selectedTask.id)}>
                  <Trash2 className="h-4 w-4" />
                  {t("inbox.delete", "Delete")}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TaskTable({
  emptyMessage,
  onComplete,
  onDelete,
  onSelect,
  tasks,
  title,
}: {
  emptyMessage: string;
  onComplete: (id: number) => void;
  onDelete: (id: number) => void;
  onSelect: (id: number) => void;
  tasks: FollowUpTask[];
  title: string;
}) {
  const { t } = useI18n();

  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("inbox.request", "Request")}</TableHead>
              <TableHead>{t("inbox.caller", "Caller")}</TableHead>
              <TableHead>{t("inbox.status", "Status")}</TableHead>
              <TableHead>{t("inbox.created", "Created")}</TableHead>
              <TableHead className="text-right">{t("inbox.actions", "Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell className="py-8 text-center text-muted-foreground" colSpan={5}>
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => (
                <TableRow key={task.id} className="cursor-pointer" onClick={() => onSelect(task.id)}>
                  <TableCell className="max-w-xl">
                    <div className="font-medium">{task.title}</div>
                    <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.summary}</div>
                  </TableCell>
                  <TableCell>
                    <div>{task.caller_name || t("inbox.guest", "Guest")}</div>
                    {task.caller_phone && <div className="text-sm text-muted-foreground">{task.caller_phone}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={task.priority === "high" ? "yellow" : "neutral"}>{formatTaskLabel(task.priority)}</Badge>
                      <Badge tone={task.status === "new" ? "cyan" : "neutral"}>{formatTaskLabel(task.status)}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>{new Date(task.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {task.status !== "done" && (
                        <Button variant="outline" onClick={(event) => { event.stopPropagation(); onComplete(task.id); }}>
                          <Check className="h-4 w-4" />
                          {t("inbox.done", "Done")}
                        </Button>
                      )}
                      <Button variant="outline" onClick={(event) => { event.stopPropagation(); onDelete(task.id); }}>
                        <Trash2 className="h-4 w-4" />
                        {t("inbox.delete", "Delete")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function formatTaskLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-all font-medium">{value}</div>
    </div>
  );
}
