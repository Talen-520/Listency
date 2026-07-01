export type RuntimeStatus = {
  background_status: string;
  active_sessions: ActiveSession[];
  last_error: string | null;
  session_limit_seconds: number;
};

export type PhoneTunnelStatus = {
  mode: string;
  status: string;
  public_base_url: string;
  public_ws_url: string;
  message: string;
  provider: string;
};

export type PhoneStatus = {
  provider: string;
  provider_ready: boolean;
  provider_error: string | null;
  connection: PhoneTunnelStatus;
  configured: boolean;
  last_provisioned_url: string;
  last_provisioned_at: string;
  reprovision_required: boolean;
  reprovision_reason: string;
  transfer_target_ready: boolean;
  last_call_status: string;
  last_call_error: string;
  last_call_ended_reason: string;
  last_call_outcome: string;
  recent_call_summary: {
    window_hours: number;
    total: number;
    outcomes: Record<string, number>;
  };
};

export type TwilioDebuggerAlert = {
  sid: string;
  date_created: string;
  date_generated: string;
  error_code: string;
  log_level: string;
  alert_text: string;
  request_method: string;
  request_url: string;
  resource_sid: string;
  more_info: string;
};

export type BackendHealth = {
  available: boolean;
  checking: boolean;
  message: string;
  last_checked_at: string | null;
};

export type ReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  ready: boolean;
};

export type ActiveSession = {
  id: string;
  provider: string;
  status: string;
  started_at: string;
  timeout_at: string;
  audio_chunks: number;
  audio_bytes: number;
  reconnect_attempts: number;
  last_error: string | null;
  phone_provider: string | null;
  provider_call_id: string | null;
};

export type PublicConfig = {
  OPENAI_API_KEY: string;
  GEMINI_API_KEY: string;
  OPENAI_REALTIME_MODEL: string;
  GEMINI_LIVE_MODEL: string;
  OPENAI_REALTIME_MOCK: string;
  DEFAULT_REALTIME_PROVIDER: string;
  OPENAI_DEFAULT_VOICE: string;
  GEMINI_DEFAULT_VOICE: string;
  DEFAULT_VOICE: string;
  PHONE_PROVIDER: string;
  PHONE_CONNECTION_MODE: string;
  PHONE_PUBLIC_BASE_URL: string;
  PHONE_REALTIME_PROVIDER: string;
  PHONE_TRANSFER_TARGET: string;
  PHONE_LAST_PROVISIONED_URL: string;
  PHONE_LAST_PROVISIONED_AT: string;
  CLOUDFLARED_BIN: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  TWILIO_PHONE_NUMBER_SID: string;
  TELNYX_API_KEY: string;
  TELNYX_CALL_CONTROL_APP_ID: string;
  TELNYX_APPLICATION_NAME: string;
  TELNYX_PHONE_NUMBER: string;
  has_openai_key: boolean;
  has_gemini_key: boolean;
  has_twilio_auth_token: boolean;
  has_telnyx_api_key: boolean;
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

export type LocalAnalytics = {
  window: LogTimeWindow;
  since: string;
  generated_at: string;
  calls: {
    total: number;
    answered: number;
    active: number;
    failed_or_error: number;
    average_duration_seconds: number;
    longest_duration_seconds: number;
    by_outcome: Record<string, number>;
  };
  tasks: {
    total: number;
    open: number;
    completed: number;
    dismissed: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
  };
  tools: {
    total: number;
    failed: number;
    by_tool: Record<string, number>;
  };
  highlights: {
    booking_requests: number;
    callbacks: number;
    customer_requests: number;
    unresolved_questions: number;
    transfer_requests: number;
    transfer_failures: number;
    provider_failures: number;
  };
};

export type BusinessProfile = {
  id: string;
  name: string;
  content: string;
  updated_at: string | null;
};

export type BusinessHoursWindow = {
  open: string;
  close: string;
};

export type BusinessHoursConfig = {
  timezone: string;
  weekly_hours: Record<string, BusinessHoursWindow[]>;
  closures: Array<{
    date?: string;
    start_date?: string;
    end_date?: string;
    reason?: string;
    message?: string;
  }>;
  after_hours_mode: "take_callback" | "information_only" | "transfer" | "closed_message";
  after_hours_message: string;
  open_hours_transfer_target: string;
  after_hours_transfer_target: string;
};

export type BusinessHoursStatus = {
  configured: boolean;
  status: string;
  is_open: boolean;
  timezone: string;
  local_time: string | null;
  reason: string;
  active_policy: string;
  after_hours_mode: string;
  message: string;
  transfer_target: string;
  next_change: string | null;
  allowed_tools: string[];
};

export type BusinessHoursPayload = {
  config: BusinessHoursConfig;
  status: BusinessHoursStatus;
};

export type BusinessInfoSections = {
  business_type: "general" | "hotel" | "restaurant" | "appointment";
  location: string;
  services: string;
  pricing: string;
  booking_rules: string;
  policies: string;
  faq: string;
  parking_accessibility: string;
};

export type CalendarAvailabilitySlot = {
  id: string;
  label: string;
  start: string;
  end: string;
  capacity: number | null;
  metadata?: Record<string, unknown>;
};

export type CalendarAvailability = {
  adapter: "manual";
  slots: CalendarAvailabilitySlot[];
};

export type CalendarAvailabilityPayload = {
  availability: CalendarAvailability;
};

export type AgentProfile = {
  id: string;
  name: string;
  system_prompt: string;
  updated_at: string | null;
};

export type AgentList = {
  agents: AgentProfile[];
  active_agent_id: string;
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

export type PhoneCallRecord = {
  id: number;
  provider: string;
  provider_call_id: string;
  provider_stream_id: string | null;
  session_id: string | null;
  from_number: string | null;
  to_number: string | null;
  business_hours_status: string | null;
  business_hours_policy: string | null;
  business_hours_mode: string | null;
  business_hours_reason: string | null;
  status: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  ended_reason: string | null;
  error_message: string | null;
};

export type VoicePreviewCache = {
  cached: Record<string, string[]>;
};

export type VoicePreviewRecord = {
  provider: string;
  voice: string;
  cached: boolean;
  content_type: string;
  audio_url: string;
};

export type LogTimeWindow = "24h" | "7d" | "30d";

export type FollowUpTask = {
  id: number;
  session_id: string | null;
  phone_call_id: number | null;
  status: "new" | "in_progress" | "done" | "dismissed";
  priority: string;
  type: string;
  title: string;
  summary: string;
  caller_name: string | null;
  caller_phone: string | null;
  due_at: string | null;
  source_event: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type EvaluationScenario = {
  id: string;
  title: string;
  description: string;
};

export type EvaluationScenarioResult = {
  id: string;
  title: string;
  status: string;
  duration_ms: number;
  actual: Record<string, unknown>;
  errors: string[];
};

export type EvaluationRun = {
  id: string;
  status: string;
  scenario_count: number;
  passed_count: number;
  failed_count: number;
  duration_ms: number;
  uses_scratch_database: boolean;
  created_at: string;
  results?: EvaluationScenarioResult[];
};

export type LogExport = {
  generated_at: string;
  since: string | null;
  session_id: string | null;
  sessions: SessionRecord[];
  transcripts: TranscriptRecord[];
  tool_calls: ToolCallRecord[];
  app_logs: AppLogRecord[];
  phone_calls: PhoneCallRecord[];
};

export type DiagnosticsExport = {
  generated_at: string;
  app: Record<string, unknown>;
  config: Record<string, unknown>;
  runtime: Record<string, unknown>;
  phone: Record<string, unknown>;
  providers: Array<Record<string, unknown>>;
  business_hours: Record<string, unknown>;
  recent: Record<string, unknown[]>;
};

export type LogDeleteCounts = {
  sessions: number;
  messages: number;
  transcripts: number;
  tool_calls: number;
  app_logs: number;
  phone_calls: number;
};

export type LogPruneResult = {
  retention_days: number;
  cutoff: string;
  deleted: LogDeleteCounts;
};

export type LogClearResult = {
  deleted: LogDeleteCounts;
};
