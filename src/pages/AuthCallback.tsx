import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthLoading } from '@/components/auth/RouteGuards';
import { useAuth } from '@/contexts/auth-context';
import { consumeAuthCallbackError } from '@/lib/auth-redirect';

/**
 * Where Supabase sends the browser back to after an email confirmation link.
 *
 * This route is deliberately outside every guard. The tokens (or the error)
 * arrive in the URL fragment, and a guard that redirects before this page runs
 * throws that fragment away — react-router's <Navigate> does not carry it
 * along. Landing somewhere unguarded first means the outcome is read before
 * anything navigates.
 *
 * By the time this renders, supabase-js has already parsed the fragment: the
 * provider's getSession() waits on the client's initialisation, so `loading`
 * covers that work.
 */
const AuthCallback = () => {
  const { loading, session, onboardingCompleted } = useAuth();

  // Read once, on first render, before any redirect can remount this.
  const [callbackError] = useState(() => consumeAuthCallbackError());

  if (callbackError) {
    return <Navigate to="/auth" replace state={{ authMessage: callbackError }} />;
  }

  if (loading) return <AuthLoading />;

  if (!session) {
    return (
      <Navigate
        to="/auth"
        replace
        state={{ authMessage: 'That link did not sign you in. Please sign in to continue.' }}
      />
    );
  }

  // Signed in: new users still owe us the questionnaire, returning users do not.
  return <Navigate to={onboardingCompleted ? '/' : '/welcome'} replace />;
};

export default AuthCallback;
