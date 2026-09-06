import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AuthContext, type AuthContextValue } from './auth-context';

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Single source of truth for "who is signed in, and have they onboarded".
 *
 * Session persistence across refreshes is handled by supabase-js itself, which
 * stores the session in localStorage. getSession() below rehydrates from that
 * store on mount, so a refresh does not sign the user out.
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  // Which user the onboarding value above actually belongs to. Comparing this
  // against the live user id is what keeps `loading` true until the profile for
  // the CURRENT user has landed — a plain boolean flag reports "resolved" for
  // the signed-out pass and opens a window where a restored session is paired
  // with a null onboarding status, which the guards read as "not onboarded".
  const [onboardingUserId, setOnboardingUserId] = useState<string | null>(null);

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
    const { data, error } = await supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', id)
      .limit(1);

    if (error) {
      // Unknown, not "onboarded". The guards send null to onboarding, which is
      // the safe direction: re-answering is an upsert, being wrongly let in is not.
      console.error('Could not read onboarding status:', error);
      return null;
    }

    const rows = Array.isArray(data) ? data : data ? [data] : [];
    if (rows.length === 0) return false;

    return Boolean(rows[0]?.onboarding_completed_at);
  }, []);

  // Load onboarding status whenever the signed-in user changes.
  useEffect(() => {
    let active = true;

    if (!userId) {
      setOnboardingCompleted(null);
      setOnboardingUserId(null);
      return;
    }

    readOnboardingStatus(userId).then((result) => {
      if (!active) return;
      setOnboardingCompleted(result);
      setOnboardingUserId(userId);
    });

    return () => {
      active = false;
    };
  }, [userId, readOnboardingStatus]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign out failed:', error);
      return;
    }
    // onAuthStateChange clears the session; clear derived state eagerly so no
    // stale onboarding answer survives into the next sign-in.
    setOnboardingCompleted(null);
    setOnboardingUserId(null);
  }, []);

  const refreshOnboardingStatus = useCallback(async () => {
    if (!userId) return;
    setOnboardingCompleted(await readOnboardingStatus(userId));
    setOnboardingUserId(userId);
  }, [userId, readOnboardingStatus]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      onboardingCompleted,
      // Still loading while the session is unknown, or while a signed-in user's
      // onboarding status has not yet been read for that specific user.
      loading: !sessionResolved || (!!userId && onboardingUserId !== userId),
      signOut,
      refreshOnboardingStatus
    }),
    [session, user, userId, onboardingCompleted, sessionResolved, onboardingUserId, signOut, refreshOnboardingStatus]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
