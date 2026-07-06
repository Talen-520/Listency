export type ModelOption = {
  value: string;
  label: string;
};

export const DEFAULT_OPENAI_REALTIME_MODEL = "gpt-realtime-2.1";
export const DEFAULT_GEMINI_LIVE_MODEL = "gemini-3.1-flash-live-preview";

export const geminiLiveModelOptions: ModelOption[] = [
  {
    value: "gemini-3.1-flash-live-preview",
    label: "gemini-3.1-flash-live-preview",
  },
];

export function isSupportedGeminiLiveModel(model: string) {
  return geminiLiveModelOptions.some((option) => option.value === model);
}
