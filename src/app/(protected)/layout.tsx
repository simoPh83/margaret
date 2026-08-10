'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AppBar, Box, Button, CircularProgress, Tab, Tabs, Toolbar, Typography } from '@mui/material'
import { getAppVersion, openExternal } from '@/lib/appInfo'
import { supabase } from '@/lib/supabase'
import { checkForUpdate, UpdateInfo } from '@/lib/updater'

const NAV_TABS = [
  { label: 'Units', path: '/units' },
  { label: 'Charts', path: '/charts' },
]

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    getAppVersion().then(setVersion)
  }, [])

  useEffect(() => {
    checkForUpdate().then(setUpdate).catch(() => {})
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
            <Button variant="contained" size="small" color="warning" onClick={() =>
              update.install().catch(() => openExternal(update.manualUrl))
            }>
              Update to {update.version} ↗
            </Button>
          )}
        </Toolbar>
        <Tabs
          value={NAV_TABS.findIndex((t) => pathname.startsWith(t.path))}
          onChange={(_e, i: number) => router.push(NAV_TABS[i].path)}
          sx={{ px: 2, bgcolor: 'background.paper' }}
        >
          {NAV_TABS.map((t) => (
            <Tab key={t.path} label={t.label} />
          ))}
        </Tabs>
      </AppBar>
      {children}
    </>
  )
}
