import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import {
  createNudgePushController,
  type NudgePushApi,
  type NudgePushController,
  type NudgePushEnvironment,
  type NudgePushResult,
  type NudgePushState
} from '@/lib/push/gentle-nudges-push';
import { supabaseNudgePushApi } from '@/lib/push/gentle-nudges-push-api';

export type { NudgePushError, NudgePushErrorCode, NudgePushResult, NudgePushState } from '@/lib/push/gentle-nudges-push';

export interface GentleNudgesPush extends NudgePushState {
  /** A user is signed in. Everything else is inert while this is false. */
  signedIn: boolean;
  /**
   * Turn nudges on for this account and this browser.
   *
   * MUST be called directly inside the click/tap handler — before any await
   * of your own — or Safari (iPhone, iPad, Mac) will not show the permission
   * prompt:
   *
   *   <Switch onCheckedChange={(on) => void (on ? nudges.enable() : nudges.disable())} />
   */
  enable(): Promise<NudgePushResult>;
  /** Turn nudges off for the account and remove this browser's subscription. */
  disable(): Promise<NudgePushResult>;
  /** Re-read permission and this browser's subscription (never prompts). */
  refresh(): Promise<void>;
}

/** What a signed-out visitor (including every Guest Mode screen) gets. */
export const SIGNED_OUT_NUDGE_STATE: NudgePushState = Object.freeze({
  supported: false,
  installRequired: false,
  configured: false,
  permission: 'unsupported',
  subscribed: false,
  loading: false,
  error: null
});

const signedOutResult = (): Promise<NudgePushResult> =>
  Promise.resolve({ ok: false, error: { code: 'unsupported', message: 'Sign in to turn on gentle nudges.' } });
const noopSubscribe = () => () => {};
const signedOutState = () => SIGNED_OUT_NUDGE_STATE;

export interface UseGentleNudgesPushOptions {
  /** Test seams. The app uses the real browser, Supabase and VITE_VAPID_PUBLIC_KEY. */
  environment?: NudgePushEnvironment;
  api?: NudgePushApi;
  vapidPublicKey?: string;
}

/**
 * Gentle nudges for the signed-in user on this browser.
 *
 * Signed out — which is every Guest Mode screen — there is no controller at
 * all: the state is SIGNED_OUT_NUDGE_STATE and enable() resolves with an
 * error without touching Notification, the service worker or Supabase.
 *
 * Signed in, mounting only READS the current status. It never asks for
 * permission and never subscribes; only enable() does, from a click.
 */
export function useGentleNudgesPush(options: UseGentleNudgesPushOptions = {}): GentleNudgesPush {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const { environment, api, vapidPublicKey } = options;

  const controller: NudgePushController | null = useMemo(
    () =>
      userId
        ? createNudgePushController({
            userId,
            vapidPublicKey: vapidPublicKey ?? import.meta.env.VITE_VAPID_PUBLIC_KEY,
            api: api ?? supabaseNudgePushApi,
            environment
          })
        : null,
    [userId, vapidPublicKey, api, environment]
  );

  const state = useSyncExternalStore(
    controller ? controller.subscribe : noopSubscribe,
    controller ? controller.getState : signedOutState,
    controller ? controller.getState : signedOutState
  );

  useEffect(() => {
    void controller?.refresh();
  }, [controller]);

  // Not async, and nothing before controller.enable(): the permission request
  // must stay in the same synchronous turn as the click.
  const enable = useCallback((): Promise<NudgePushResult> => {
    if (!controller) return signedOutResult();
    return controller.enable().then((result) => {
      void queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      return result;
    });
  }, [controller, queryClient]);

  const disable = useCallback((): Promise<NudgePushResult> => {
    if (!controller) return signedOutResult();
    return controller.disable().then((result) => {
      void queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      return result;
    });
  }, [controller, queryClient]);

  const refresh = useCallback(() => controller?.refresh() ?? Promise.resolve(), [controller]);

  return { ...state, signedIn: controller !== null, enable, disable, refresh };
}
