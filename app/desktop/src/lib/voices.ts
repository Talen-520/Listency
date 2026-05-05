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
  { value: "Kore", label: "Kore - Firm" },
  { value: "Puck", label: "Puck - Upbeat" },
  { value: "Zephyr", label: "Zephyr - Bright" },
  { value: "Charon", label: "Charon - Informative" },
  { value: "Fenrir", label: "Fenrir - Excitable" },
  { value: "Leda", label: "Leda - Youthful" },
  { value: "Orus", label: "Orus - Firm" },
  { value: "Aoede", label: "Aoede - Breezy" },
  { value: "Callirrhoe", label: "Callirrhoe - Easy-going" },
  { value: "Autonoe", label: "Autonoe - Bright" },
  { value: "Enceladus", label: "Enceladus - Breathy" },
  { value: "Iapetus", label: "Iapetus - Clear" },
  { value: "Umbriel", label: "Umbriel - Easy-going" },
  { value: "Algieba", label: "Algieba - Smooth" },
  { value: "Despina", label: "Despina - Smooth" },
  { value: "Erinome", label: "Erinome - Clear" },
  { value: "Algenib", label: "Algenib - Gravelly" },
  { value: "Rasalgethi", label: "Rasalgethi - Informative" },
  { value: "Laomedeia", label: "Laomedeia - Upbeat" },
  { value: "Achernar", label: "Achernar - Soft" },
  { value: "Alnilam", label: "Alnilam - Firm" },
  { value: "Schedar", label: "Schedar - Even" },
  { value: "Gacrux", label: "Gacrux - Mature" },
  { value: "Pulcherrima", label: "Pulcherrima - Forward" },
  { value: "Achird", label: "Achird - Friendly" },
  { value: "Zubenelgenubi", label: "Zubenelgenubi - Casual" },
  { value: "Vindemiatrix", label: "Vindemiatrix - Gentle" },
  { value: "Sadachbia", label: "Sadachbia - Lively" },
  { value: "Sadaltager", label: "Sadaltager - Knowledgeable" },
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
