'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CssBaseline } from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import { useState, useEffect } from 'react'
import { appTheme } from './theme'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

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
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
