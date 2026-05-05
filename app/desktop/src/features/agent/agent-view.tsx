import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { AgentProfile } from "@/lib/types";

export function AgentView({
  agent,
  onAgentChange,
  onSave,
}: {
  agent: AgentProfile;
  onAgentChange: (agent: AgentProfile) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Prompt</h2>
        <p className="text-sm text-muted-foreground">Default system behavior for new local sessions.</p>
      </div>
      <Separator />
      <div className="space-y-4">
        <Field label="Agent Name">
          <Input value={agent.name} onChange={(event) => onAgentChange({ ...agent, name: event.target.value })} />
        </Field>
        <Field label="System Prompt">
          <Textarea
            className="min-h-72"
            value={agent.system_prompt}
            onChange={(event) => onAgentChange({ ...agent, system_prompt: event.target.value })}
          />
        </Field>
      </div>
      <Separator />
      <div className="flex justify-end">
        <Button onClick={onSave}>Save Agent</Button>
      </div>
    </div>
  );
}
