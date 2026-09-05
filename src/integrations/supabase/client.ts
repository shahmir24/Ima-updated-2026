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

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
