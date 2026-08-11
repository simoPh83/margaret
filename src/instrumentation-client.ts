// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a user loads a page in their browser / WebView.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
//
// NOTE: This app uses `output: 'export'` (fully static, for Tauri), so there is no
// server/edge runtime. We only initialize the client-side SDK here.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only send events in production builds (i.e. inside the packaged Tauri app),
  // so local `npm run dev` doesn't spam your Sentry project.
  // TEMP: enabled in dev too, while we verify the Sentry wiring with a test error.
  enabled: true,

  // Performance monitoring: 100% in dev, 10% in production.
  // Adjust based on your traffic/usage in the Sentry dashboard.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Session Replay: capture 10% of sessions, and 100% of sessions that end in an error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [Sentry.replayIntegration()],

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
