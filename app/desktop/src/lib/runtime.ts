export function toTitleCase(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function formatRuntimeStatus(status: string) {
  const label = status === "standby" ? "running" : status;

  return toTitleCase(label);
}

export function isRuntimeRunning(status: string) {
  return status === "standby";
}
