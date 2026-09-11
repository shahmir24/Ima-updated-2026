import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AuthContext, type AuthContextValue } from './auth-context';

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * The onboarding answer, tagged with the user it was read for.
 *
 * Keeping the two together is what lets `loading` stay true until the profile
 * for the CURRENT user has landed: a plain boolean flag reports "resolved" for
 * the signed-out pass and opens a window where a restored session is paired
 * with a null onboarding status, which the guards read as "not onboarded".
 */
interface OnboardingState {
  userId: string;
  /** true / false, or null when the profile could not be read at all. */
  value: boolean | null;
}

/** Delay before the single retry of a failed profile read. */
const PROFILE_READ_RETRY_MS = 400;

/**
 * Single source of truth for "who is signed in, and have they onboarded".
 *
 * Session persistence across refreshes is handled by supabase-js itself, which
 * stores the session in localStorage. getSession() below rehydrates from that
 * store on mount, so a refresh does not sign the user out. getSession() also
 * waits on the client's initialisation, which is what parses the tokens out of
 * an email-confirmation redirect — so a confirmed user is already signed in by
 * the time `loading` flips to false.
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);

  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  // Rehydrate the persisted session, then follow every auth change.
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionResolved(true);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Only synchronous state updates belong in this callback — awaiting
      // another supabase call from inside it can deadlock the client. The
      // profile read is done by the effect below instead, keyed on user id.
      setSession(nextSession);
      setSessionResolved(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const readOnboardingStatus = useCallback(async (id: string): Promise<boolean | null> => {
    // Three states have to be told apart, and only the third means "onboarded":
    //   no row at all                     -> false (trigger may not have run)
    //   row, onboarding_completed_at NULL -> false
    //   row, onboarding_completed_at set  -> true
    //
    // limit(1) rather than maybeSingle(): maybeSingle unwraps the array only on
    // a GET, and only inside a version-specific workaround in postgrest-js. If
    // that unwrapping ever stops applying, `data` is an array and reading
    // .onboarding_completed_at off it silently yields undefined — every user
    // would read as not-onboarded forever. Handling the array ourselves removes
    // that dependency.
    //
    // Tried twice, because a false "not onboarded" is what sends an already
    // onboarded user back through /welcome. One dropped request on a flaky
    // connection should not do that.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed_at')
        .eq('id', id)
        .limit(1);

      if (!error) {
        const rows = Array.isArray(data) ? data : data ? [data] : [];
        if (rows.length === 0) return false;
        return Boolean(rows[0]?.onboarding_completed_at);
      }

      console.error(`Could not read onboarding status (attempt ${attempt + 1}):`, error);
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, PROFILE_READ_RETRY_MS));
      }
    }

    // Unknown, not "onboarded". The guards send null to onboarding, which is
    // the safe direction: re-answering is an upsert, being wrongly let in is not.
    return null;
  }, []);

  /**
   * Records a read result, but never downgrades a status we already know for
   * this same user to "unknown". Losing the network mid-session should not
   * push an onboarded user back into the questionnaire.
   */
  const applyOnboardingStatus = useCallback((id: string, value: boolean | null) => {
    setOnboarding((prev) => (value === null && prev?.userId === id ? prev : { userId: id, value }));
  }, []);

  // Load onboarding status whenever the signed-in user changes.
  useEffect(() => {
    let active = true;

    if (!userId) {
      setOnboarding(null);
      return;
    }

    readOnboardingStatus(userId).then((result) => {
      if (!active) return;
      applyOnboardingStatus(userId, result);
    });

    return () => {
      active = false;
    };
  }, [userId, readOnboardingStatus, applyOnboardingStatus]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      // A global sign out calls the server, and the server call fails whenever
      // the session it is presenting is already gone or expired — exactly when
      // signing out matters most. supabase-js returns early on that error
      // WITHOUT clearing local storage, which would strand the user in a
      // signed-in-looking app. A local sign out clears the stored session with
      // no server round trip.
      console.error('Sign out failed, falling back to a local sign out:', error);
      const { error: localError } = await supabase.auth.signOut({ scope: 'local' });
      if (localError) {
        console.error('Local sign out also failed:', localError);
      }
    }

    // onAuthStateChange normally clears the session; do it here too so the
    // guards redirect even if no event arrives, and so no stale onboarding
    // answer survives into the next sign-in.
    setSession(null);
    setSessionResolved(true);
    setOnboarding(null);
  }, []);

  const refreshOnboardingStatus = useCallback(async () => {
    if (!userId) return;
    applyOnboardingStatus(userId, await readOnboardingStatus(userId));
  }, [userId, readOnboardingStatus, applyOnboardingStatus]);

  const markOnboardingComplete = useCallback(() => {
    if (!userId) return;
    setOnboarding({ userId, value: true });
  }, [userId]);

  // Only trust the onboarding answer if it was read for the user who is signed
  // in right now.
  const onboardingForCurrentUser = userId && onboarding?.userId === userId ? onboarding : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      onboardingCompleted: onboardingForCurrentUser?.value ?? null,
      // Still loading while the session is unknown, or while a signed-in user's
      // onboarding status has not yet been read for that specific user.
      loading: !sessionResolved || (!!userId && !onboardingForCurrentUser),
      signOut,
      refreshOnboardingStatus,
      markOnboardingComplete
    }),
    [
      session,
      user,
      userId,
      onboardingForCurrentUser,
      sessionResolved,
      signOut,
      refreshOnboardingStatus,
      markOnboardingComplete
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
