import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createVoiceCapture, isVoiceSupported, type VoiceCaptureController, type VoiceEnv, type VoiceState, type TranscribeResult } from '@/lib/voice/voice-capture';
import { requestTranscription } from '@/lib/voice/transcribe';

/** The real browser, read lazily. Every piece may be missing. */
export function browserVoiceEnv(): VoiceEnv {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return {};
  const devices = (navigator as Navigator & { mediaDevices?: MediaDevices }).mediaDevices;
  return {
    getUserMedia: devices?.getUserMedia ? (constraints) => devices.getUserMedia(constraints) : undefined,
    MediaRecorder: (window as unknown as { MediaRecorder?: VoiceEnv['MediaRecorder'] }).MediaRecorder,
    isSecureContext: window.isSecureContext
  };
}

const IDLE: VoiceState = Object.freeze({ status: 'idle', error: null, message: null, elapsedMs: 0, autoStopped: false });
const noSubscription = () => () => {};
const idleState = () => IDLE;

export interface VoiceCapture extends VoiceState {
  /** This browser can record (secure context, microphone API, a supported container). */
  supported: boolean;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

export interface UseVoiceCaptureOptions {
  /** False for guests: nothing is created and the microphone is never touched. */
  enabled: boolean;
  /** Test seams; the app uses the real browser and Edge Function. */
  env?: VoiceEnv;
  transcribe?: (audio: Blob) => Promise<TranscribeResult>;
}

/**
 * Voice Brain Dump for one Quick Capture sheet. The controller is created in
 * an effect and disposed in its cleanup, so unmounting (or React's
 * development double-mount) always releases the microphone.
 */
export function useVoiceCapture(onTranscript: (text: string) => void, options: UseVoiceCaptureOptions): VoiceCapture {
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const { enabled, env, transcribe } = options;
  const [controller, setController] = useState<VoiceCaptureController | null>(null);
  const [supported] = useState(() => enabled && isVoiceSupported(env ?? browserVoiceEnv()));

  useEffect(() => {
    if (!enabled) return;
    const created = createVoiceCapture({
      env: env ?? browserVoiceEnv(),
      transcribe: transcribe ?? ((audio) => requestTranscription(audio)),
      onTranscript: (text) => onTranscriptRef.current(text)
    });
    setController(created);
    return () => {
      created.dispose();
      setController(null);
    };
  }, [enabled, env, transcribe]);

  const state = useSyncExternalStore(
    controller ? controller.subscribe : noSubscription,
    controller ? controller.getState : idleState,
    controller ? controller.getState : idleState
  );

  return {
    ...state,
    supported: enabled && supported,
    start: () => void controller?.start(),
    stop: () => controller?.stop(),
    cancel: () => controller?.cancel()
  };
}
