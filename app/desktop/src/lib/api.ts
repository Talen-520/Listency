import type {
  AgentProfile,
  BusinessProfile,
  ProviderInfo,
  PublicConfig,
  RuntimeStatus,
  SessionRecord,
  ToolCallRecord,
  ToolInfo,
  TranscriptRecord,
} from "./types";

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8765";

function websocketBase() {
  return API_BASE.replace(/^http/, "ws");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean; runtime: RuntimeStatus }>("/health"),
  getConfig: () => request<PublicConfig>("/config"),
  saveConfig: (payload: {
    openai_api_key: string;
    gemini_api_key: string;
    default_realtime_provider: string;
    default_voice: string;
  }) =>
    request<PublicConfig>("/config", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  providers: () => request<{ providers: ProviderInfo[] }>("/providers"),
  runtimeStatus: () => request<RuntimeStatus>("/runtime/status"),
  startRuntime: () => request<RuntimeStatus>("/runtime/start", { method: "POST" }),
  stopRuntime: () => request<RuntimeStatus>("/runtime/stop", { method: "POST" }),
  startTestSession: (provider: string) =>
    request<{ id: string; provider: string; started_at: string; timeout_at: string }>("/sessions/test", {
      method: "POST",
      body: JSON.stringify({ provider }),
    }),
  stopSession: (id: string) => request(`/sessions/${id}/stop`, { method: "POST" }),
  sessionStreamUrl: (id: string) => `${websocketBase()}/sessions/${id}/stream`,
  sessions: () => request<{ sessions: SessionRecord[] }>("/sessions"),
  transcripts: (sessionId?: string) =>
    request<{ transcripts: TranscriptRecord[] }>(`/transcripts${sessionId ? `?session_id=${sessionId}` : ""}`),
  toolCalls: () => request<{ tool_calls: ToolCallRecord[] }>("/tool-calls"),
  tools: () => request<{ tools: ToolInfo[] }>("/tools"),
  setToolEnabled: (name: string, enabled: boolean) =>
    request<ToolInfo>(`/tools/${name}/enabled`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),
  businessProfile: () => request<BusinessProfile>("/business-profile"),
  saveBusinessProfile: (payload: { name: string; content: string }) =>
    request<BusinessProfile>("/business-profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  agent: () => request<AgentProfile>("/agent"),
  saveAgent: (payload: { name: string; system_prompt: string }) =>
    request<AgentProfile>("/agent", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
};
