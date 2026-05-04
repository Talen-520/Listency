export function formatRuntimeStatus(status: string) {
  return status === "standby" ? "running" : status;
}

export function isRuntimeRunning(status: string) {
  return status === "standby";
}
