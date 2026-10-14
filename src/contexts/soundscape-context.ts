import { createContext, useContext } from 'react';
import type { SoundscapePlayerStatus } from '@/hooks/use-soundscape-player';
import type { SoundOption } from '@/lib/soundscape/soundscape-session';

export interface SoundscapeValue {
  selectedSound: SoundOption;
  /** 0–100, as the slider shows it. */
  volume: number;
  status: SoundscapePlayerStatus;
  /** The user wants sound: it is playing, or its buffer is loading. */
  isActive: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  /** Playback has been started at least once since sign-in: the floating control may show. */
  activated: boolean;
  /** Play or pause the selected sound. Must be called from a user gesture. */
  togglePlay(): void;
  /** Select a sound; switches to it straight away only if something is already playing. */
  selectSound(id: string): void;
  setVolume(volume: number): void;
}

export const SoundscapeContext = createContext<SoundscapeValue | null>(null);

export function useSoundscape(): SoundscapeValue {
  const value = useContext(SoundscapeContext);
  if (!value) throw new Error('useSoundscape must be used within a <SoundscapeProvider>');
  return value;
}

/** For optional readers (the floating control): null outside a provider. */
export const useOptionalSoundscape = (): SoundscapeValue | null => useContext(SoundscapeContext);
