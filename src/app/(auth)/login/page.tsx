'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Box, Button, TextField, Typography, Alert, CircularProgress } from '@mui/material'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        maxWidth: 400,
        mx: 'auto',
        mt: 12,
        px: 3,
      }}
    >
      <Typography variant="h5" component="h1">Sign in</Typography>
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
      <Button type="submit" variant="contained" disabled={loading}>
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
  )
}
