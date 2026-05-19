const lifecycleLabels: Record<string, string> = {
  active: "Active",
  agent_hung_up: "AI Hung Up",
  backend_shutdown: "Backend Shutdown",
  caller_hung_up: "Caller Hung Up",
  completed: "Completed",
  error: "Error",
  failed: "Failed",
  network_error: "Network Failure",
  provider_error: "Provider Failure",
  stopped: "Stopped",
  timeout: "Timed Out",
  timeout_5_minutes: "Timed Out",
  transferred: "Transferred",
  transferring: "Transferring",
  user_stopped: "User Stopped",
};

export function formatLifecycleLabel(value: string | null | undefined) {
  if (!value) return "-";
  return (
    lifecycleLabels[value] ??
    value
      .replace(/_/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ")
  );
}
