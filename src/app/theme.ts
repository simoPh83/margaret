import { createTheme } from '@mui/material/styles'

export const appTheme = createTheme({
  cssVariables: { colorSchemeSelector: 'media', cssVarPrefix: 'margaret' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#2563eb', dark: '#1d4ed8', light: '#60a5fa' },
        warning: { main: '#d97706' },
        success: { main: '#16a34a' },
        error: { main: '#dc2626' },
        background: { default: '#f3f6fb', paper: '#ffffff' },
        text: { primary: '#142033', secondary: '#5f6b7a' },
        divider: 'rgba(20, 32, 51, 0.12)',
      },
    },
    dark: {
      palette: {
        primary: { main: '#60a5fa', dark: '#3b82f6', light: '#93c5fd' },
        warning: { main: '#f59e0b' },
        success: { main: '#22c55e' },
        error: { main: '#f87171' },
        background: { default: '#0b1220', paper: '#131c2e' },
        text: { primary: '#edf3ff', secondary: '#9aa7bc' },
        divider: 'rgba(148, 163, 184, 0.24)',
      },
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'var(--font-geist-sans), Arial, Helvetica, sans-serif',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { height: '100%' },
        body: {
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
  },
})
