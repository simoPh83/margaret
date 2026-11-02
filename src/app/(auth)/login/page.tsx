'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Box, Button, TextField, Typography, Alert, CircularProgress } from '@mui/material'
import { supabase } from '@/lib/supabase'

const HERO_SRC = '/login-hero.jpg'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [heroAvailable, setHeroAvailable] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/units')
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) {
      setError(authError.message)
    } else {
      router.replace('/units')
    }
  }

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: '100dvh' }}>
      {/* Form side */}
      <Box
        sx={{
          flex: { xs: '1 1 100%', md: '0 0 480px' },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          px: { xs: 3, sm: 6 },
          py: 6,
        }}
      >
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            width: '100%',
            maxWidth: 400,
            mx: 'auto',
          }}
        >
          <Box sx={{ mb: 2 }}>
            <Typography variant="overline" color="primary" sx={{ letterSpacing: 2 }}>
              Margaret
            </Typography>
            <Typography variant="h4" component="h1" sx={{ mt: 0.5 }}>
              Welcome back
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Sign in to manage The Langham Estate portfolio.
            </Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Button type="submit" variant="contained" size="large" disabled={loading}>
            {loading ? <CircularProgress size={20} color="inherit" /> : 'Sign in'}
          </Button>
          {/* TEMP: Sentry test button — commented out, re-enable to verify Sentry
          <Button
            type="button"
            variant="outlined"
            color="error"
            onClick={() => {
              throw new Error('Sentry test error from Margaret (login page)')
            }}
          >
            Throw test error
          </Button>
          */}
        </Box>
      </Box>

      {/* Image side — hidden on small screens */}
      <Box
        sx={{
          display: { xs: 'none', md: 'block' },
          position: 'relative',
          flex: 1,
          overflow: 'hidden',
          // Fallback backdrop shown until public/login-hero.jpg is added
          background:
            'linear-gradient(160deg, #1e3a8a 0%, #2563eb 45%, #0ea5e9 100%)',
        }}
      >
        {heroAvailable && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              animation: 'kenburns 40s ease-in-out infinite alternate',
              willChange: 'transform',
              '@keyframes kenburns': {
                from: { transform: 'scale(1) translate(0, 0)' },
                to: { transform: 'scale(1.12) translate(-1.5%, -2%)' },
              },
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          >
            <Image
              src={HERO_SRC}
              alt="The Langham Estate"
              fill
              priority
              unoptimized // required with output: 'export' (static/Tauri build)
              sizes="(min-width: 900px) 60vw, 100vw"
              style={{ objectFit: 'cover' }}
              onError={() => setHeroAvailable(false)}
            />
          </Box>
        )}
        {/* Scrim keeps caption text readable over any photo */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to top, rgba(11, 18, 32, 0.65) 0%, rgba(11, 18, 32, 0.1) 45%, rgba(11, 18, 32, 0.25) 100%)',
          }}
        />
        <Box sx={{ position: 'absolute', left: 48, bottom: 48, right: 48, color: '#fff' }}>
          <Typography variant="h5" component="p" sx={{ fontWeight: 600 }}>
            The Langham Estate
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.5 }}>
            Properties, leases and portfolio insights — all in one place.
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
