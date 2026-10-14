import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from './auth-context';
import { SoundscapeContext, type SoundscapeValue } from './soundscape-context';
import { useSoundscapePlayer } from '@/hooks/use-soundscape-player';
import { useUserSettings } from '@/hooks/use-user-settings';
import { audioFocus } from '@/lib/audio/audio-focus';
import { createSoundscapeController } from '@/lib/soundscape/soundscape-controller';
import { FALLBACK_VOLUME, findSound } from '@/lib/soundscape/soundscape-session';

/**
 * The one Soundscape for the whole app.
 *
 * Mounted once in App.tsx, outside the routes, so playback carries on while
 * the user moves around iMA. It holds the existing player — one AudioContext,
 * one looping source at a time, its own safeguards unchanged — and a
 * controller (lib/soundscape/soundscape-controller.ts) for the selected sound,
 * the volume, spoken-guidance priority and account changes. The Soundscape
 * page and the floating control are both views of it.
 *
 * Nothing plays on its own: the AudioContext is created by the first play,
 * and every play follows a tap. A fresh visit is silent.
 */
export const SoundscapeProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const player = useSoundscapePlayer(FALLBACK_VOLUME / 100);
  const { play, pause, stop, setVolume, status, isActive, isLoading, errorMessage } = player;

  // The controller reads the player's live state through a ref.
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const [controller] = useState(() =>
    createSoundscapeController({
      player: { play, pause, stop, setVolume, isActive: () => isActiveRef.current },
      focus: audioFocus
    })
  );
  useEffect(() => controller.connect(), [controller]);

  const snapshot = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);

  // Sign-out or a different account: stop, and forget the previous account's choices.
  // Runs before the seeding below, so a new account's saved volume lands after the reset.
  const ownerRef = useRef(userId);
  useEffect(() => {
    if (ownerRef.current === userId) return;
    ownerRef.current = userId;
    controller.resetForAccount();
  }, [controller, userId]);

  // Saved volume, once per account.
  const { data: settings, isFetched: settingsLoaded } = useUserSettings();
  useEffect(() => {
    if (userId && settingsLoaded && settings) controller.seedVolume(settings.sound_volume);
  }, [controller, userId, settingsLoaded, settings]);

  const value = useMemo<SoundscapeValue>(
    () => ({
      selectedSound: findSound(snapshot.selectedSoundId),
      volume: snapshot.volume,
      status,
      isActive,
      isLoading,
      errorMessage,
      activated: snapshot.activated && userId !== null,
      togglePlay: controller.togglePlay,
      selectSound: controller.selectSound,
      setVolume: controller.setVolume
    }),
    [snapshot, status, isActive, isLoading, errorMessage, userId, controller]
  );

  return <SoundscapeContext.Provider value={value}>{children}</SoundscapeContext.Provider>;
};

export default SoundscapeProvider;
