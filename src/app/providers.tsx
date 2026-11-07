'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CssBaseline } from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import { SnackbarProvider } from 'notistack'
import { useState, useEffect } from 'react'
import { checkForUpdate } from '@/lib/updater'
import { appTheme } from './theme'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  useEffect(() => {
    // Auto-update (baked in at build time via NEXT_PUBLIC_AUTO_UPDATE): install
    // immediately at launch, before login. The manual update button in the
    // protected layout still appears as a fallback when this is off or fails.
    if (process.env.NEXT_PUBLIC_AUTO_UPDATE === 'true') {
      checkForUpdate()
        .then((update) => update?.install())
        .catch((err) => console.error('Auto-update failed:', err))
    }
  }, [])

  useEffect(() => {
    // Suppress uncaught WKWebView IPC errors (macOS 26 / Tauri compatibility)
    const onError = (e: ErrorEvent) => { e.preventDefault(); return true; };
    const onUnhandled = (e: PromiseRejectionEvent) => { e.preventDefault(); };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={appTheme}>
        <CssBaseline enableColorScheme />
        <SnackbarProvider
          maxSnack={3}
          autoHideDuration={4000}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          {children}
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
