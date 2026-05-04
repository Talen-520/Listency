export function compareCreatedAt(left: { created_at: string }, right: { created_at: string }) {
  return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
}

export function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
