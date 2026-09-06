import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';

/**
 * Shown while the session and profile lookups settle. Without it the guards
 * would briefly see "no session" on every load and flash the sign-in screen.
 * Uses the app's existing theme tokens — no new design.
 */
const AuthLoading = () => (
  <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 rounded-full border-2 border-muted border-t-primary animate-spin" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  </div>
);

/**
 * The app proper. Requires a session AND completed onboarding.
 * Signed out -> /auth. Signed in but not onboarded -> /welcome.
 */
export const ProtectedRoute = () => {
  const { loading, session, onboardingCompleted } = useAuth();

  if (loading) return <AuthLoading />;
  if (!session) return <Navigate to="/auth" replace />;
  if (!onboardingCompleted) return <Navigate to="/welcome" replace />;

  return <Outlet />;
};

/**
 * The welcome/onboarding flow. Requires a session but *not* onboarding.
 * Signed out -> /auth. Already onboarded -> / (nothing left to do here).
 */
export const OnboardingRoute = () => {
  const { loading, session, onboardingCompleted } = useAuth();

  if (loading) return <AuthLoading />;
  if (!session) return <Navigate to="/auth" replace />;
  if (onboardingCompleted) return <Navigate to="/" replace />;

  return <Outlet />;
};

/**
 * The sign-in / sign-up screen. Only for signed-out visitors; anyone with a
 * session is sent on to wherever they actually belong.
 */
export const PublicOnlyRoute = () => {
  const { loading, session, onboardingCompleted } = useAuth();

  if (loading) return <AuthLoading />;
  if (session) return <Navigate to={onboardingCompleted ? '/' : '/welcome'} replace />;

  return <Outlet />;
};
