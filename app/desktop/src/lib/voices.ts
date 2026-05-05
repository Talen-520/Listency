export type VoiceOption = {
  value: string;
  label: string;
};

const openAiRealtimeVoices: VoiceOption[] = [
  { value: "marin", label: "marin - best quality" },
  { value: "cedar", label: "cedar - best quality" },
  { value: "alloy", label: "alloy" },
  { value: "ash", label: "ash" },
  { value: "ballad", label: "ballad" },
  { value: "coral", label: "coral" },
  { value: "echo", label: "echo" },
  { value: "sage", label: "sage" },
  { value: "shimmer", label: "shimmer" },
  { value: "verse", label: "verse" },
];

const geminiLiveVoices: VoiceOption[] = [
  { value: "Zephyr", label: "Zephyr - Bright" },
  { value: "Kore", label: "Kore - Firm" },
  { value: "Orus", label: "Orus - Firm" },
  { value: "Autonoe", label: "Autonoe - Bright" },
  { value: "Umbriel", label: "Umbriel - Easy-going" },
  { value: "Erinome", label: "Erinome - Clear" },
  { value: "Laomedeia", label: "Laomedeia - Upbeat" },
  { value: "Schedar", label: "Schedar - Even" },
  { value: "Achird", label: "Achird - Friendly" },
  { value: "Sadachbia", label: "Sadachbia - Lively" },
  { value: "Puck", label: "Puck - Upbeat" },
  { value: "Fenrir", label: "Fenrir - Excitable" },
  { value: "Aoede", label: "Aoede - Breezy" },
  { value: "Enceladus", label: "Enceladus - Breathy" },
  { value: "Algieba", label: "Algieba - Smooth" },
  { value: "Algenib", label: "Algenib - Gravelly" },
  { value: "Achernar", label: "Achernar - Soft" },
  { value: "Gacrux", label: "Gacrux - Mature" },
  { value: "Zubenelgenubi", label: "Zubenelgenubi - Casual" },
  { value: "Sadaltager", label: "Sadaltager - Knowledgeable" },
  { value: "Charon", label: "Charon - Informative" },
  { value: "Leda", label: "Leda - Youthful" },
  { value: "Callirrhoe", label: "Callirrhoe - Easy-going" },
  { value: "Iapetus", label: "Iapetus - Clear" },
  { value: "Despina", label: "Despina - Smooth" },
  { value: "Rasalgethi", label: "Rasalgethi - Informative" },
  { value: "Alnilam", label: "Alnilam - Firm" },
  { value: "Pulcherrima", label: "Pulcherrima - Forward" },
  { value: "Vindemiatrix", label: "Vindemiatrix - Gentle" },
  { value: "Sulafat", label: "Sulafat - Warm" },
];

const voiceOptionsByProvider: Record<string, VoiceOption[]> = {
  openai: openAiRealtimeVoices,
  gemini: geminiLiveVoices,
};

export function voiceOptionsForProvider(provider: string) {
  return voiceOptionsByProvider[provider] ?? [];
}

export function isSupportedVoice(provider: string, voice: string) {
  if (!voice) {
    return true;
  }
  return voiceOptionsForProvider(provider).some((option) => option.value === voice);
}
