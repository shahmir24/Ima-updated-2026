# Auth configuration (email + password)

Everything the code needs is already in the repo. The settings below live in the
Supabase dashboard and cannot be set from source — they are the reason a
confirmation email can arrive and still not land the user back in the app.

Project ref: `txvwvxihvfltnidejfcs` (see `supabase/config.toml`).

---

## 1. Authentication → URL Configuration

### Site URL

One value, the canonical origin of the deployed app, with **no path and no
trailing slash**:

```
https://<your-production-domain>
```

Supabase uses it for two things: as the base for `{{ .SiteURL }}` in email
templates, and as the **fallback** whenever a requested `redirect_to` is not on
the allow list below. That fallback is silent — no error, no warning in the
email — so a Site URL still pointing at `http://localhost:3000` (the Supabase
default) sends every confirmation click to a dead address on the user's machine.

### Redirect URLs

The app now asks Supabase to come back to `/auth/callback` on whatever origin
the signup happened on (`src/lib/auth-redirect.ts`). Every origin that will ever
run a signup needs to be allow-listed, or the Site URL fallback kicks in:

```
http://localhost:8080/**
https://<your-production-domain>/**
https://<your-vercel-project>-*.vercel.app/**
```

Notes:

* `8080` is the dev server port set in `vite.config.ts` — not Vite's default
  5173, and not 3000.
* The `/**` wildcard covers `/auth/callback` plus the query string and fragment
  Supabase appends. A bare origin with no wildcard does **not** match a path.
* The third line is only needed if you confirm accounts from Vercel preview
  deployments; drop it otherwise.

## 2. Authentication → Providers → Email

* **Email provider**: enabled.
* **Confirm email**: on or off, both work.
  * **On** (recommended): signup sends the confirmation mail, and the user is
    signed in when they follow the link.
  * **Off**: `signUp()` returns a session immediately and the app takes the user
    straight to `/welcome`. `src/pages/Auth.tsx` handles both.

Confirmation links are **single use and time limited** (Authentication →
Settings → "Email OTP Expiration", one hour by default). Corporate mail scanners
and link previewers routinely fetch the URL before a human clicks it, which
burns the token; the user then sees `error_code=otp_expired`. The app now
explains that instead of failing silently — signing up again with the same
address issues a fresh link.

## 3. Authentication → Email Templates → Confirm signup

The default template is correct. It must use:

```
{{ .ConfirmationURL }}
```

Do not replace it with a hand-built `{{ .SiteURL }}/...` link — `.ConfirmationURL`
is what carries the `redirect_to` the app asked for.

## 4. What the app does with the redirect

1. `signUp()` passes `emailRedirectTo: <origin>/auth/callback`.
2. Supabase verifies the token server-side and 302s the browser to
   `<origin>/auth/callback#access_token=…&refresh_token=…`, or
   `…#error=…&error_code=…&error_description=…` on failure.
3. `/auth/callback` is deliberately **unguarded** (`src/App.tsx`). A guard there
   would redirect before the page ran, and `<Navigate>` does not carry the URL
   fragment — the tokens or the error would be thrown away.
4. supabase-js reads the fragment on boot (`detectSessionInUrl`) and stores the
   session; `AuthProvider.getSession()` waits on that work, so the guards never
   see a half-initialised state.
5. `AuthCallback` then sends the user to `/welcome` (not yet onboarded) or `/`
   (already onboarded), or back to `/auth` with the reason the link failed.

The client is pinned to the **implicit** flow, not PKCE
(`src/integrations/supabase/client.ts`). PKCE keeps a code verifier in the
localStorage of the browser that signed up, and confirmation links are routinely
opened somewhere else — a mail app's in-app browser, a phone, another profile —
where that verifier does not exist and the exchange fails. Email/password is the
only auth method in the MVP, so nothing here needs PKCE.

## 5. SPA rewrite

`/auth/callback` is a client-side route with no file behind it. `vercel.json`
already rewrites every path to `index.html`; any other host needs the equivalent
SPA fallback, or the confirmation link 404s before React ever loads.
