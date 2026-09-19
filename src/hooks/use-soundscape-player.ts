import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Looping playback for the Soundscaping screen.
 *
 * Web Audio is used for all five sounds rather than `<audio loop>`. The reason
 * is the binaural track: it is a stereo 200 Hz / 210 Hz pair whose length is a
 * whole number of cycles on both channels, so it only loops without an audible
 * seam if the loop is sample-exact. `HTMLMediaElement.loop` is not — MP3 frame
 * padding and the decoder's own gap put a short click at the wrap. An
 * `AudioBufferSourceNode` with `loop = true` wraps inside the decoded buffer,
 * which is exact. Running the four ambience beds through the same path costs
 * nothing and keeps one code path instead of two.
 *
 * Pause/resume suspends the AudioContext rather than stopping the source, so
 * the loop keeps its position — and, for the binaural track, its phase.
 */
export type SoundscapePlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface SoundscapePlayer {
  status: SoundscapePlayerStatus;
  /** The user wants sound: either it is running, or its buffer is loading. */
  isActive: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  /** Start `soundId`, resume it if it is the paused sound, or switch to it. */
  play: (soundId: string, url: string) => void;
  pause: () => void;
  /** 0–1, applied to the shared output gain. */
  setVolume: (value: number) => void;
}

type AudioContextConstructor = new () => AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return (window.AudioContext as AudioContextConstructor | undefined) ?? scope.webkitAudioContext ?? null;
}

/** Older Safari only has the callback form of decodeAudioData. */
function decodeAudio(context: AudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const returned = context.decodeAudioData(bytes, resolve, reject) as unknown;
    if (returned && typeof (returned as Promise<AudioBuffer>).then === 'function') {
      (returned as Promise<AudioBuffer>).then(resolve, reject);
    }
  });
}

const clampVolume = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

const LOAD_FAILED = "That sound couldn't load. Check your connection and try again.";
const BLOCKED = 'Your browser blocked playback. Tap play again to start.';
const UNSUPPORTED = "This browser can't play audio.";

export function useSoundscapePlayer(initialVolume = 1): SoundscapePlayer {
  const [status, setStatus] = useState<SoundscapePlayerStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  /** The sound currently wired into the graph — what a bare resume would play. */
  const loadedIdRef = useRef<string | null>(null);
  /** Bumped by every play/pause so a slow load cannot land after a newer one. */
  const requestRef = useRef(0);
  const volumeRef = useRef(clampVolume(initialVolume));
  const liveRef = useRef(true);

  const ensureGraph = useCallback((): AudioContext | null => {
    if (contextRef.current) return contextRef.current;

    const Constructor = getAudioContextConstructor();
    if (!Constructor) return null;

    const context = new Constructor();
    const gain = context.createGain();
    gain.gain.value = volumeRef.current;
    // Straight to the destination: no channel merging, no downmix, so the
    // binaural file's left/right separation reaches the headphones intact.
    gain.connect(context.destination);

    contextRef.current = context;
    gainRef.current = gain;
    return context;
  }, []);

  const stopSource = useCallback(() => {
    const source = sourceRef.current;
    sourceRef.current = null;
    if (!source) return;
    try {
      source.stop();
    } catch {
      // Already stopped; nothing to undo.
    }
    try {
      source.disconnect();
    } catch {
      // Already detached.
    }
  }, []);

  const play = useCallback(
    (soundId: string, url: string) => {
      const context = ensureGraph();
      if (!context) {
        setStatus('error');
        setErrorMessage(UNSUPPORTED);
        return;
      }

      const request = ++requestRef.current;
      const stale = () => !liveRef.current || request !== requestRef.current;

      // Spend the user gesture on resume() straight away. Awaiting the fetch
      // first would put the resume outside the gesture, where some browsers
      // refuse it.
      const resumed = context.resume().catch(() => undefined);

      // Resuming the sound that is already loaded: keep the running source so
      // the loop (and the binaural phase) picks up where it left off.
      if (loadedIdRef.current === soundId && sourceRef.current) {
        setStatus('playing');
        setErrorMessage(null);
        void resumed.then(() => {
          if (stale()) return;
          if (contextRef.current?.state === 'suspended') {
            setStatus('paused');
            setErrorMessage(BLOCKED);
          }
        });
        return;
      }

      const cached = buffersRef.current.get(soundId);
      if (cached) {
        startBuffer(soundId, cached);
        return;
      }

      setStatus('loading');
      setErrorMessage(null);

      void (async () => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Request for ${url} failed with ${response.status}`);
          const bytes = await response.arrayBuffer();
          const buffer = await decodeAudio(context, bytes);
          if (stale()) return;
          buffersRef.current.set(soundId, buffer);
          startBuffer(soundId, buffer);
        } catch {
          if (stale()) return;
          setStatus('error');
          setErrorMessage(LOAD_FAILED);
        }
      })();

      function startBuffer(id: string, buffer: AudioBuffer) {
        const gain = gainRef.current;
        if (!context || !gain || stale()) return;

        // Only ever one source: the outgoing one is stopped before the new one
        // starts, so repeated taps cannot stack two sounds.
        stopSource();

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain);

        try {
          source.start(0);
        } catch {
          setStatus('error');
          setErrorMessage(LOAD_FAILED);
          return;
        }

        sourceRef.current = source;
        loadedIdRef.current = id;
        setStatus('playing');
        setErrorMessage(null);

        void resumed.then(() => {
          if (stale()) return;
          if (contextRef.current?.state === 'suspended') {
            setStatus('paused');
            setErrorMessage(BLOCKED);
          }
        });
      }
    },
    [ensureGraph, stopSource]
  );

  const pause = useCallback(() => {
    // Cancels any load still in flight, so a sound the user has already paused
    // cannot start itself a moment later.
    requestRef.current++;

    setStatus(loadedIdRef.current ? 'paused' : 'idle');
    setErrorMessage(null);

    const context = contextRef.current;
    if (!context) return;
    void context.suspend().catch(() => undefined);
  }, []);

  const setVolume = useCallback((value: number) => {
    const volume = clampVolume(value);
    volumeRef.current = volume;

    const context = contextRef.current;
    const gain = gainRef.current;
    if (!context || !gain) return;

    try {
      gain.gain.cancelScheduledValues(context.currentTime);
      // Short ramp instead of a jump, which would click on a dragged slider.
      gain.gain.setTargetAtTime(volume, context.currentTime, 0.02);
    } catch {
      gain.gain.value = volume;
    }
  }, []);

  // Leaving the screen stops the sound and releases the audio hardware.
  const teardown = useCallback(() => {
    liveRef.current = false;
    requestRef.current++;
    stopSource();
    buffersRef.current.clear();
    loadedIdRef.current = null;

    const context = contextRef.current;
    contextRef.current = null;
    gainRef.current = null;
    if (context) void context.close().catch(() => undefined);
  }, [stopSource]);

  useEffect(() => {
    liveRef.current = true;
    return teardown;
  }, [teardown]);

  return {
    status,
    isActive: status === 'playing' || status === 'loading',
    isLoading: status === 'loading',
    errorMessage,
    play,
    pause,
    setVolume
  };
}
