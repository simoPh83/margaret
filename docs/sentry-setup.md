# Sentry Integration

How Sentry is wired into this project and how to use it.

## Architecture decision: client-only

This app uses `output: 'export'` in `next.config.ts` (fully static export, required
because the app ships inside **Tauri**). There is **no running Next.js server** in
production — Tauri just serves the static files into a WebView.

Because of that, only the **client-side (browser/WebView)** Sentry SDK is used. The
standard Next.js server pieces were deliberately **not** added:

- ❌ No `withSentryConfig` wrapper in `next.config.ts`
- ❌ No `sentry.server.config.ts` / `sentry.edge.config.ts`
- ❌ No `instrumentation.ts` (server registration)
- ❌ No `tunnelRoute` (needs a server to proxy through)

Adding any of those would be dead weight — they never execute in a static/Tauri build.

## Files

| File | Purpose |
|------|---------|
| [src/instrumentation-client.ts](../src/instrumentation-client.ts) | Client-side `Sentry.init()`. Next.js auto-loads this file in the browser/WebView. |
| [src/app/global-error.tsx](../src/app/global-error.tsx) | App Router global error boundary — captures React render crashes via `Sentry.captureException`. |
| [.env.local](../.env.local) | Holds `NEXT_PUBLIC_SENTRY_DSN` (gitignored, safe). |

## Package

```
@sentry/nextjs
```

Only the client-side part of the SDK is exercised, but the full `@sentry/nextjs`
package is what provides `instrumentation-client.ts` auto-loading.

## DSN configuration

The DSN is read from an env var so it isn't hardcoded:

```
# .env.local  (gitignored)
NEXT_PUBLIC_SENTRY_DSN=https://<key>@o<orgId>.ingest.<region>.sentry.io/<projectId>
```

Get the DSN from Sentry → **Settings → Projects → margaret → Client Keys (DSN)**.
After changing `.env.local`, restart the dev server.

## Enabling Sentry in development (the important bit)

By default Sentry only sends events in **production builds**, so `npm run dev` does
not spam the Sentry project with local noise:

```ts
// src/instrumentation-client.ts
enabled: process.env.NODE_ENV === "production",
```

To **test Sentry locally** (e.g. with a throw-error button), temporarily flip it on:

```ts
// src/instrumentation-client.ts
enabled: true,   // TEMP: while verifying Sentry wiring
```

> ⚠️ **Remember to revert this back to `process.env.NODE_ENV === "production"`**
> once you've confirmed events arrive in Sentry. Leaving it on means every local
> dev error gets reported.

## Testing that it works

1. Set `enabled: true` (see above).
2. Add a temporary button that throws, e.g.:

   ```tsx
   <Button
     type="button"
     variant="outlined"
     color="error"
     onClick={() => {
       throw new Error('Sentry test error from Margaret')
     }}
   >
     Throw test error
   </Button>
   ```

3. Restart `npm run dev`, click the button. The Next.js error overlay appears
   (expected — the error is uncaught).
4. Check Sentry → **Issues**. The error should appear within a few seconds.
5. Revert the temp button and the `enabled` flag.

Note: a click-handler `throw` is caught by Sentry's global `onerror` handler. A
**render** error is caught by `global-error.tsx` instead. Both paths report.

## Source maps (not yet set up)

Stack traces in Sentry will point to minified bundles unless source maps are
uploaded at build time. This requires `@sentry/cli` (or the build plugin) and a
`SENTRY_AUTH_TOKEN`. Deliberately deferred — revisit when it matters.
