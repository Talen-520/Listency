import type {
  AgentProfile,
  AgentList,
  AppLogRecord,
  BusinessProfile,
  BusinessHoursConfig,
  BusinessHoursPayload,
  BusinessInfoSections,
  DiagnosticsExport,
  FollowUpTask,
  LogClearResult,
  LogExport,
  LogPruneResult,
  ProviderInfo,
  PhoneCallRecord,
  PhoneStatus,
  PublicConfig,
  RuntimeStatus,
  SessionRecord,
  ToolCallRecord,
  ToolInfo,
  TranscriptRecord,
  TwilioDebuggerAlert,
  VoicePreviewCache,
  VoicePreviewRecord,
} from "./types";

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8765";

function websocketBase() {
  return API_BASE.replace(/^http/, "ws");
}

function assetUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  return `${API_BASE}${path}`;
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
    openai_realtime_model: string;
    gemini_live_model: string;
    openai_realtime_mock: string;
    default_realtime_provider: string;
    openai_default_voice: string;
    gemini_default_voice: string;
    default_voice: string;
    phone_provider: string;
    phone_connection_mode: string;
    phone_public_base_url: string;
    phone_realtime_provider: string;
    phone_transfer_target: string;
    cloudflared_bin: string;
    twilio_account_sid: string;
    twilio_auth_token: string;
    twilio_phone_number: string;
    twilio_phone_number_sid: string;
    telnyx_api_key: string;
    telnyx_call_control_app_id: string;
    telnyx_application_name: string;
    telnyx_phone_number: string;
  }) =>
    request<PublicConfig>("/config", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  providers: () => request<{ providers: ProviderInfo[] }>("/providers"),
  phoneStatus: () => request<PhoneStatus>("/phone/status"),
  startPhoneConnection: () => request<{ connection: PhoneStatus["connection"]; phone: PhoneStatus }>("/phone/connection/start", { method: "POST" }),
  stopPhoneConnection: () => request<{ connection: PhoneStatus["connection"]; phone: PhoneStatus }>("/phone/connection/stop", { method: "POST" }),
  connectPhone: () => request<{ connection: PhoneStatus["connection"]; result: Record<string, string>; phone: PhoneStatus }>("/phone/connect", { method: "POST" }),
  provisionPhone: () => request<{ result: Record<string, string>; phone: PhoneStatus }>("/phone/provision", { method: "POST" }),
  twilioDebugger: (limit = 10, hours = 24) => request<{ alerts: TwilioDebuggerAlert[] }>(`/phone/twilio/debugger?limit=${limit}&hours=${hours}`),
  voicePreviewCache: () => request<VoicePreviewCache>("/voice-previews"),
  createVoicePreview: async (payload: { provider: string; voice: string; text?: string }) => {
    const preview = await request<VoicePreviewRecord>("/voice-preview", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ...preview, audio_url: assetUrl(preview.audio_url) };
  },
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
  sessions: (since?: string, limit = 100) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (since) params.set("since", since);
    return request<{ sessions: SessionRecord[] }>(`/sessions?${params.toString()}`);
  },
  transcripts: (sessionId?: string, limit = 100, since?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (sessionId) params.set("session_id", sessionId);
    if (since) params.set("since", since);
    return request<{ transcripts: TranscriptRecord[] }>(`/transcripts?${params.toString()}`);
  },
  toolCalls: (sessionId?: string, limit = 100, since?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (sessionId) params.set("session_id", sessionId);
    if (since) params.set("since", since);
    return request<{ tool_calls: ToolCallRecord[] }>(`/tool-calls?${params.toString()}`);
  },
  appLogs: (sessionId?: string, limit = 100, since?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (sessionId) params.set("session_id", sessionId);
    if (since) params.set("since", since);
    return request<{ logs: AppLogRecord[] }>(`/app-logs?${params.toString()}`);
  },
  phoneCalls: (sessionId?: string, limit = 100, since?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (sessionId) params.set("session_id", sessionId);
    if (since) params.set("since", since);
    return request<{ phone_calls: PhoneCallRecord[] }>(`/phone-calls?${params.toString()}`);
  },
  exportLogs: (since?: string, sessionId?: string) => {
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    if (sessionId) params.set("session_id", sessionId);
    const query = params.toString();
    return request<LogExport>(`/logs/export${query ? `?${query}` : ""}`);
  },
  exportDiagnostics: () => request<DiagnosticsExport>("/diagnostics/export"),
  pruneLogs: (retentionDays = 30) =>
    request<LogPruneResult>("/logs/prune", {
      method: "POST",
      body: JSON.stringify({ retention_days: retentionDays }),
    }),
  clearLogs: () => request<LogClearResult>("/logs/clear", { method: "POST" }),
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
  businessHours: () => request<BusinessHoursPayload>("/business-hours"),
  saveBusinessHours: (payload: BusinessHoursConfig) =>
    request<BusinessHoursPayload>("/business-hours", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  businessInfoSections: () => request<{ sections: BusinessInfoSections }>("/business-info-sections"),
  saveBusinessInfoSections: (payload: BusinessInfoSections) =>
    request<{ sections: BusinessInfoSections }>("/business-info-sections", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  followUpTasks: () => request<{ tasks: FollowUpTask[] }>("/follow-up-tasks"),
  updateFollowUpTaskStatus: (id: number, status: FollowUpTask["status"]) =>
    request<FollowUpTask>(`/follow-up-tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  deleteFollowUpTask: (id: number) => request<{ deleted: FollowUpTask }>(`/follow-up-tasks/${id}`, { method: "DELETE" }),
  agent: () => request<AgentProfile>("/agent"),
  saveAgent: (payload: { name: string; system_prompt: string }) =>
    request<AgentProfile>("/agent", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  agents: async () => {
    try {
      return await request<AgentList>("/agents");
    } catch (err) {
      if (err instanceof Error && /404|not found/i.test(err.message)) {
        const agent = await request<AgentProfile>("/agent");
        return { agents: [agent], active_agent_id: agent.id };
      }
      throw err;
    }
  },
  createAgent: (payload: { name: string; system_prompt: string }) =>
    request<AgentProfile>("/agents", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAgent: (id: string, payload: { name: string; system_prompt: string }) =>
    request<AgentProfile>(`/agents/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteAgent: (id: string) =>
    request<{ deleted: AgentProfile; active_agent_id: string }>(`/agents/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  selectAgent: (id: string) => request<AgentProfile>(`/agents/${encodeURIComponent(id)}/select`, { method: "POST" }),
};
