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
