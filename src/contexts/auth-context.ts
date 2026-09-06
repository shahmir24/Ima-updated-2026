import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthContextValue {
  /** The persisted Supabase session, or null when signed out. */
  session: Session | null;
  /** Convenience accessor for session.user. */
  user: User | null;
  /**
   * Whether profiles.onboarding_completed_at is set.
   * null means "not known yet" — either still loading, or the profile row
   * could not be read. Route guards treat null as not-onboarded, which is the
   * safe direction: the worst case is a user re-answers onboarding, and that
   * write is an upsert.
   */
  onboardingCompleted: boolean | null;
  /** True until the initial session lookup AND profile lookup have settled. */
  loading: boolean;
  signOut: () => Promise<void>;
  /** Re-reads onboarding status. Call after finishing onboarding. */
  refreshOnboardingStatus: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return context;
}
