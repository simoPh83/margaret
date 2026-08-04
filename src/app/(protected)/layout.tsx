'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppBar, Box, Button, CircularProgress, Toolbar, Typography } from '@mui/material'
import { supabase } from '@/lib/supabase'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login')
      } else {
        setUserEmail(data.session.user.email ?? null)
        setChecking(false)
      }
    })
  }, [router])

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (checking) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 12 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar sx={{ justifyContent: 'flex-end', gap: 2 }}>
          {userEmail && (
            <Typography variant="body2" color="text.secondary">
              {userEmail}
            </Typography>
          )}
          <Button variant="outlined" size="small" onClick={logout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>
      {children}
    </>
  )
}
