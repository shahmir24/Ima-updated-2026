
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';

const Welcome = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  // "Already have an account?" is reachable only WITH a session — this screen
  // sits behind <OnboardingRoute>. Navigating straight to /auth therefore does
  // nothing: <PublicOnlyRoute> sees the session and sends the browser right
  // back here. Signing out first is what actually gets the person to the
  // sign-in form, e.g. when a shared device confirmed the wrong account.
  const handleSignInInstead = () => {
    void signOut();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-6">
          <div className="flex items-center justify-center mb-8">
            <img 
              src="/lovable-uploads/d8549ee1-5d5d-4efb-9c5b-9c1b49629e14.png" 
              alt="iMA Logo" 
              className="h-20 w-auto object-contain"
            />
          </div>
          
          <h1 className="text-5xl font-bold font-morisawa mb-4">Hey there 👋</h1>
          <h2 className="text-3xl font-semibold text-muted-foreground mb-6">Let's get to know you!</h2>
          
          <p className="text-xl text-muted-foreground leading-relaxed">
            We'll ask a few gentle questions to personalize your iMA experience and help you on your wellness journey.
          </p>
        </div>
        
        <div className="space-y-4">
          <Button 
            onClick={() => navigate('/onboarding')}
            className="w-full py-6 text-xl font-semibold bg-gradient-to-r from-blue-500 to-teal-400 hover:from-blue-600 hover:to-teal-500 shadow-lg"
          >
            Let's begin 🌿
          </Button>
          
          <button
            onClick={handleSignInInstead}
            className="text-lg text-primary hover:underline"
          >
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  );
};

export default Welcome;
