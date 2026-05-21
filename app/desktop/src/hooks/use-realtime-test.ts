import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { decodeBase64Pcm16, floatToPcm16, resampleMono } from "@/lib/audio";
import type { ActiveSession, AppLogRecord, ToolCallRecord, TranscriptRecord } from "@/lib/types";

const OPENAI_PCM_SAMPLE_RATE = 24000;
const GEMINI_PCM_SAMPLE_RATE = 16000;

type TranscriptPayload = {
  speaker?: unknown;
  content?: unknown;
  is_final?: unknown;
};

type RealtimeStreamEvent = {
  type?: unknown;
  message?: unknown;
  tool_name?: unknown;
  output?: { ok?: boolean };
  audio?: unknown;
  sample_rate?: unknown;
  transcript?: TranscriptPayload;
  content?: unknown;
  speaker?: unknown;
  is_final?: unknown;
};

export function useRealtimeTest({
  activeSession,
  providerChoice,
  loadAll,
  setTranscripts,
  setToolCalls,
  setAppLogs,
}: {
  activeSession?: ActiveSession;
  providerChoice: string;
  loadAll: () => Promise<unknown>;
  setTranscripts: Dispatch<SetStateAction<TranscriptRecord[]>>;
  setToolCalls: Dispatch<SetStateAction<ToolCallRecord[]>>;
  setAppLogs: Dispatch<SetStateAction<AppLogRecord[]>>;
}) {
  const [micReady, setMicReady] = useState(false);
  const [streamStatus, setStreamStatus] = useState("idle");
  const [liveEvents, setLiveEvents] = useState<string[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const outputPlaybackTimeRef = useRef(0);
  const agentHangupTimerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const appendEvent = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString();
    setLiveEvents((current) => [`${time} ${message}`, ...current].slice(0, 12));
  }, []);

  const cleanupLocalStream = useCallback(() => {
    if (agentHangupTimerRef.current !== null) {
      window.clearTimeout(agentHangupTimerRef.current);
      agentHangupTimerRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
    }
    processorRef.current = null;

    sourceRef.current?.disconnect();
    sourceRef.current = null;

    silentGainRef.current?.disconnect();
    silentGainRef.current = null;

    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    outputAudioContextRef.current?.close().catch(() => undefined);
    outputAudioContextRef.current = null;
    outputPlaybackTimeRef.current = 0;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify({ type: "audio.stop" }));
        socketRef.current.close();
      } catch {
        // The socket may already be closing.
      }
    }
    socketRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const playPcm16Audio = useCallback((base64Audio: string, sampleRate: number) => {
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = outputAudioContextRef.current ?? new AudioContextCtor();
    outputAudioContextRef.current = audioContext;
    void audioContext.resume().catch(() => undefined);

    const samples = decodeBase64Pcm16(base64Audio);
    if (!samples.length) {
      return;
    }

    const buffer = audioContext.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const startAt = Math.max(audioContext.currentTime + 0.02, outputPlaybackTimeRef.current || 0);
    source.start(startAt);
    outputPlaybackTimeRef.current = startAt + buffer.duration;
  }, []);

  const scheduleAgentHangupComplete = useCallback(() => {
    if (agentHangupTimerRef.current !== null) {
      window.clearTimeout(agentHangupTimerRef.current);
    }
    const audioContext = outputAudioContextRef.current;
    const queuedAudioMs = audioContext ? Math.max(0, outputPlaybackTimeRef.current - audioContext.currentTime) * 1000 : 0;
    const delayMs = Math.max(900, queuedAudioMs + 500);
    toast.info("AI will end the call after goodbye");
    agentHangupTimerRef.current = window.setTimeout(() => {
      agentHangupTimerRef.current = null;
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "session.agent_hangup_complete" }));
      }
    }, delayMs);
  }, []);

  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicReady(true);
      toast.success("Microphone ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Microphone permission failed");
    }
  }, []);

  const startLiveTest = useCallback(async () => {
    const inputSampleRate = providerChoice === "gemini" ? GEMINI_PCM_SAMPLE_RATE : OPENAI_PCM_SAMPLE_RATE;

    setLiveEvents([]);
    setStreamStatus("requesting mic");

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    setMicReady(true);

    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const outputAudioContext = outputAudioContextRef.current ?? new AudioContextCtor();
    outputAudioContextRef.current = outputAudioContext;
    void outputAudioContext.resume().catch(() => undefined);

    try {
      const session = await api.startTestSession(providerChoice);
      appendEvent(`session ${session.id.slice(0, 8)} started`);

      const socket = new WebSocket(api.sessionStreamUrl(session.id));
      socketRef.current = socket;
      setStreamStatus("connecting");

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as RealtimeStreamEvent;
        appendEvent(formatStreamEvent(payload));
        if (payload.type === "provider.output_audio.delta" && typeof payload.audio === "string") {
          playPcm16Audio(payload.audio, typeof payload.sample_rate === "number" ? payload.sample_rate : 24000);
        }
        if (payload.type === "tool.call") {
          api.toolCalls().then((toolCallList) => setToolCalls(toolCallList.tool_calls)).catch(() => undefined);
          api.appLogs().then((appLogList) => setAppLogs(appLogList.logs)).catch(() => undefined);
        }
        if (payload.type === "session.agent_hangup_ready") {
          scheduleAgentHangupComplete();
        }
        if (payload.type === "provider.error") {
          const message = String(payload.message ?? "Realtime provider returned an error.");
          toast.error(message);
          setTranscripts((current) => [
            {
              session_id: session.id,
              speaker: "system",
              content: `Provider error: ${message}`,
              is_final: 1,
              created_at: new Date().toISOString(),
            },
            ...current,
          ]);
        }
        if (payload.type === "provider.reconnecting") {
          setStreamStatus("reconnecting");
          toast.warning(String(payload.message ?? "Provider connection lost. Reconnecting."));
        }
        if (payload.type === "provider.reconnected") {
          setStreamStatus("streaming");
          toast.success(String(payload.message ?? "Provider connection recovered."));
        }
        if (payload.type === "session.ended") {
          const message = payload.message ? String(payload.message) : "Session ended.";
          toast.info(message);
        }
        if (payload.transcript) {
          setTranscripts((current) => [
            {
              session_id: session.id,
              speaker: String(payload.transcript?.speaker ?? "assistant"),
              content: String(payload.transcript?.content ?? ""),
              is_final: payload.transcript?.is_final ? 1 : 0,
              created_at: new Date().toISOString(),
            },
            ...current,
          ]);
        }
        if (payload.type === "provider.transcript.delta" || payload.type === "provider.transcript.done") {
          const content = String(payload.content ?? "");
          if (content) {
            setTranscripts((current) => [
              {
                session_id: session.id,
                speaker: String(payload.speaker ?? "assistant"),
                content,
                is_final: payload.is_final ? 1 : 0,
                created_at: new Date().toISOString(),
              },
              ...current,
            ]);
          }
        }
      };

      socket.onclose = () => {
        appendEvent("stream closed");
        setStreamStatus("idle");
      };

      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error("WebSocket connection failed"));
      });

      socket.send(JSON.stringify({ type: "audio.start", format: "pcm16", sample_rate: inputSampleRate, channels: 1 }));

      const audioContext = new AudioContextCtor();
      void audioContext.resume().catch(() => undefined);
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;

      audioContextRef.current = audioContext;
      sourceRef.current = source;
      processorRef.current = processor;
      silentGainRef.current = silentGain;

      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }
        const input = event.inputBuffer.getChannelData(0);
        const resampled = resampleMono(input, audioContext.sampleRate, inputSampleRate);
        socket.send(floatToPcm16(resampled));
      };

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      setStreamStatus("streaming");
      toast.success("Local PCM16 audio stream started");
      await loadAll();
    } catch (err) {
      cleanupLocalStream();
      setStreamStatus("idle");
      throw err;
    }
  }, [appendEvent, cleanupLocalStream, loadAll, playPcm16Audio, providerChoice, scheduleAgentHangupComplete, setAppLogs, setToolCalls, setTranscripts]);

  const stopLiveTest = useCallback(async () => {
    const sessionId = activeSession?.id;
    cleanupLocalStream();
    setStreamStatus("idle");
    if (sessionId) {
      await api.stopSession(sessionId);
    }
  }, [activeSession, cleanupLocalStream]);

  useEffect(() => cleanupLocalStream, [cleanupLocalStream]);

  return {
    micReady,
    streamStatus,
    liveEvents,
    requestMic,
    startLiveTest,
    stopLiveTest,
    cleanupLocalStream,
  };
}

function formatStreamEvent(payload: RealtimeStreamEvent) {
  if (payload.type === "provider.error" && payload.message) {
    return `${payload.type}: ${payload.message}`;
  }
  if (payload.type === "tool.call" && payload.tool_name) {
    const ok = payload.output?.ok;
    return `${payload.type}: ${payload.tool_name} ${ok === false ? "failed" : "completed"}`;
  }
  if (payload.type === "session.agent_hangup_ready") {
    return "AI goodbye complete, ending call";
  }
  if (payload.type === "provider.reconnecting" && payload.message) {
    return `provider.reconnecting: ${payload.message}`;
  }
  if (payload.type === "provider.reconnected" && payload.message) {
    return `provider.reconnected: ${payload.message}`;
  }
  if (payload.type === "session.ended" && payload.message) {
    return `session.ended: ${payload.message}`;
  }
  return String(payload.type ?? "event");
}
