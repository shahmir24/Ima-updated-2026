import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Configuration comes from the environment, not from source. Copy .env.example
// to .env and fill in the two values from your Supabase project's
// Settings > API page. The anon key is safe to expose in a browser bundle —
// Row Level Security is what protects the data.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Supabase is not configured. Copy .env.example to .env and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.'
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Keep the session in localStorage and refresh it in the background, so a
    // page refresh does not sign the user out. Both default to true; they are
    // written out because the whole "refresh stays authenticated" requirement
    // rests on them.
    persistSession: true,
    autoRefreshToken: true,

    // Read the tokens Supabase appends to the URL after an email confirmation
    // link is followed, then store them as a session. Without this the
    // confirmation link lands on the app and nothing happens.
    detectSessionInUrl: true,

    // Implicit, NOT pkce, and deliberately so.
    //
    // PKCE stores a code verifier in localStorage at signUp time and requires
    // it back when the emailed link is opened. Confirmation links are routinely
    // opened somewhere else — the mail app's in-app browser, a phone, a
    // different profile — where that verifier does not exist, and the exchange
    // fails with "code verifier should be non-empty". The implicit flow carries
    // the tokens in the redirect fragment itself, so the link works in whatever
    // browser opens it. Email/password is the only auth method in the MVP, so
    // there is no OAuth provider that would need PKCE.
    flowType: 'implicit'
  }
});
