'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppBar, Box, Button, CircularProgress, Toolbar, Typography } from '@mui/material'
import { getVersion } from '@tauri-apps/api/app'
import { supabase } from '@/lib/supabase'
import { checkForUpdate, UpdateInfo } from '@/lib/updater'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {})
  }, [])

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
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1 }}>
            Margaret App{version && ` v${version}`}
          </Typography>
          {userEmail && (
            <Typography variant="body2" color="text.secondary">
              {userEmail}
            </Typography>
          )}
          <Button variant="outlined" size="small" onClick={logout}>
            Logout
          </Button>
          {update && (
            <Button variant="contained" size="small" color="warning" onClick={update.install}>
              Update to {update.version}
            </Button>
          )}
        </Toolbar>
      </AppBar>
      {children}
    </>
  )
}
