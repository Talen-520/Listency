import { Bot, Plus, Save, Settings2 } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import type { AgentProfile } from "@/lib/types";

const ADD_AGENT_VALUE = "__add_agent__";

export function AgentView({
  agents,
  activeAgentId,
  agent,
  onAgentChange,
  onAddAgent,
  onSelectAgent,
  onDeleteAgent,
  onSave,
}: {
  agents: AgentProfile[];
  activeAgentId: string;
  agent: AgentProfile;
  onAgentChange: (agent: AgentProfile) => void;
  onAddAgent: () => void;
  onSelectAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const [manageOpen, setManageOpen] = useState(false);
  const canDelete = agents.length > 1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("agent.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("agent.description")}</p>
      </div>
      <Separator />

      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <Field label={t("agent.agentName")}>
            <Select
              value={activeAgentId}
              onValueChange={(nextAgentId) => {
                if (nextAgentId === ADD_AGENT_VALUE) {
                  onAddAgent();
                  return;
                }
                if (nextAgentId !== activeAgentId) {
                  onSelectAgent(nextAgentId);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("agent.selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {agents.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name || t("agent.untitled")}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={ADD_AGENT_VALUE}>
                  <span className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    {t("action.addAgent")}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Button variant="outline" onClick={() => setManageOpen(true)}>
            <Settings2 className="h-4 w-4" />
            {t("action.manageAgent")}
          </Button>
        </div>

        <div className="rounded-lg bg-muted/40 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">{agent.name || t("agent.untitled")}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {agent.system_prompt.trim() || t("agent.activeSummaryEmpty")}
              </p>
            </div>
          </div>
        </div>

        <Field label={t("agent.systemPrompt")}>
          <Textarea
            className="min-h-[28rem]"
            value={agent.system_prompt}
            onChange={(event) => onAgentChange({ ...agent, system_prompt: event.target.value })}
          />
        </Field>
      </div>

      <Separator />
      <div className="flex justify-end">
        <Button onClick={onSave}>
          <Save className="h-4 w-4" />
          {t("action.saveAgent")}
        </Button>
      </div>

      <Sheet open={manageOpen} onOpenChange={setManageOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("agent.editTitle")}</SheetTitle>
            <SheetDescription>{t("agent.editDescription")}</SheetDescription>
          </SheetHeader>

          <div className="mt-10 space-y-2">
            <label className="text-sm font-medium" htmlFor="agent-sheet-name">
              {t("agent.name")}
            </label>
            <Input
              id="agent-sheet-name"
              className="h-10 rounded-md px-3 text-sm"
              value={agent.name}
              onChange={(event) => onAgentChange({ ...agent, name: event.target.value })}
            />
          </div>

          <SheetFooter>
            <Button
              className="h-10 w-full text-sm"
              onClick={() => {
                onSave();
                setManageOpen(false);
              }}
            >
              {t("action.save")}
            </Button>
            <Button
              variant="ghost"
              className="h-9 w-full text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={!canDelete}
              onClick={() => {
                onDeleteAgent(agent.id);
                setManageOpen(false);
              }}
            >
              {t("action.delete")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
