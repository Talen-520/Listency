export type RuntimeStatus = {
  background_status: string;
  active_sessions: ActiveSession[];
  last_error: string | null;
  session_limit_seconds: number;
};

export type ActiveSession = {
  id: string;
  provider: string;
  started_at: string;
  timeout_at: string;
  audio_chunks: number;
  audio_bytes: number;
};

export type PublicConfig = {
  OPENAI_API_KEY: string;
  GEMINI_API_KEY: string;
  OPENAI_REALTIME_MODEL: string;
  GEMINI_LIVE_MODEL: string;
  OPENAI_REALTIME_MOCK: string;
  DEFAULT_REALTIME_PROVIDER: string;
  DEFAULT_VOICE: string;
  has_openai_key: boolean;
  has_gemini_key: boolean;
  env_path: string;
};

export type ProviderInfo = {
  name: "openai" | "gemini";
  display_name: string;
  ready: boolean;
  error: string | null;
  voices: string[];
};

export type ToolInfo = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  enabled: boolean;
};

export type BusinessProfile = {
  id: string;
  name: string;
  content: string;
  updated_at: string | null;
};

export type AgentProfile = {
  id: string;
  name: string;
  system_prompt: string;
  updated_at: string | null;
};

export type SessionRecord = {
  id: string;
  provider: string;
  mode: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  ended_reason: string | null;
  error_message: string | null;
  timeout_at: string | null;
};

export type TranscriptRecord = {
  session_id: string;
  speaker: string;
  content: string;
  is_final: number;
  created_at: string;
};

export type ToolCallRecord = {
  id: number;
  session_id: string | null;
  tool_name: string;
  input_json: string;
  output_json: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  error_message: string | null;
};

export type AppLogRecord = {
  id: number;
  level: string;
  event: string;
  message: string;
  metadata_json: string | null;
  created_at: string;
};
