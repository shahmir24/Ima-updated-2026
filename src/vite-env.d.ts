/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://abcdefgh.supabase.co */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase anon/publishable key. Safe in the browser — RLS protects the data. */
  readonly VITE_SUPABASE_ANON_KEY: string;
  /**
   * Web Push VAPID PUBLIC key (base64url, 87 characters). Public by design;
   * the matching private key lives only in Supabase secrets. Optional: when
   * missing or invalid, gentle nudges report 'not-configured'.
   */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
