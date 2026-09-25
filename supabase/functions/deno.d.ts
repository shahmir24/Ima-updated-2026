/**
 * The two Deno globals this project's Edge Functions use.
 *
 * A typecheck aid only, so `tsc -b` can cover index.ts rather than skipping it.
 * Deno's own type checking at `supabase functions deploy` is authoritative;
 * keep this shim to the smallest surface actually used so it cannot drift far.
 */
declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}

/**
 * The one export push-spike uses from npm:web-push (pinned). Deno resolves the
 * real package at deploy; this only lets `tsc -b` type-check the call.
 */
declare module 'npm:web-push@3.6.7' {
  interface RequestDetails {
    endpoint: string;
    headers: Record<string, string | number>;
    body: Uint8Array;
  }
  const webpush: {
    generateRequestDetails(
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
      payload: string,
      options: {
        vapidDetails: { subject: string; publicKey: string; privateKey: string };
        TTL?: number;
        contentEncoding?: 'aes128gcm' | 'aesgcm';
        urgency?: 'very-low' | 'low' | 'normal' | 'high';
      }
    ): RequestDetails;
    generateVAPIDKeys(): { publicKey: string; privateKey: string };
  };
  export default webpush;
}
