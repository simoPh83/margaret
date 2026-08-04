# Margaret — Project Plan

App name: **Margaret** | Repo: `github.com/simoPh83/margaret` (private)

---

## ⚡ Session resume — read this first

> When starting a new session, share this file with Copilot and say: _"Resume the Margaret project from the plan doc."_

**Last worked on:** 2026-08-04  
**Workspace folder:** `/Users/simone/python working folder/margaret`  
**Last completed step:** Phase 1 steps 1–6 complete: `next.config.ts` configured, `.env.local` created, all lib files written, Providers wired into layout, login page built, protected layout auth guard, units table with MUI DataGrid.  
**Next step:** Tauri scaffold — `cargo tauri init`, configure `tauri.conf.json`, verify `tauri dev` opens the app.

**Credentials (never commit these):**
- Supabase URL: `https://hbnbeoysfmprnkrabroc.supabase.co`
- Supabase publishable (anon) key: `sb_publishable_samLAszsXPIY13LjRIJrpg_3N99txzD`
- Backend API: `https://weeklyreport-clean.up.railway.app`
- GitHub: `https://github.com/simoPh83/margaret` (private, created, not yet pushed)

**Stack already installed:**  
`next` · `react` · `typescript` · `@supabase/supabase-js` · `@tanstack/react-query` · `@mui/material` · `@mui/x-data-grid` · `@emotion/react` · `@emotion/styled`

---

## Architecture decisions (locked)

- **Framework**: Next.js (App Router) + TypeScript, `output: 'export'` (fully static — required by Tauri)
- **Desktop wrapper**: Tauri 2.x
- **Target platforms**: Windows (priority) + macOS
- **Shared codebase**: one repo, two deployment targets
  - Tauri build: `next build` → `out/` folder bundled by Tauri → ships as `.exe` / `.dmg`
  - Web build: same repo deployed to Vercel
- **Feature gating** via `isTauri` runtime detection (`'__TAURI__' in window`)
  - Phase 1 web: reports/charts only
  - Phase 1 desktop: full access
  - Phase 2: gate removed, full access everywhere
- **Cross-platform CI**: GitHub Actions matrix (`windows-latest` + `macos-latest`) — deferred to phase 2
- **Auto-update**: Tauri updater plugin pointing at GitHub Releases — deferred to phase 2
  - Can be tested on Windows without code signing (SmartScreen warns but doesn't block)
  - macOS requires code signing for auto-update to work

---

## Supabase

- Project URL: `https://hbnbeoysfmprnkrabroc.supabase.co`
- Anon key: _add when confirmed_
- Auth: email/password via `supabase.auth.signInWithPassword` — no backend `/api/auth/authenticate`

---

## Phase 1 — scope for today's session

### 1. GitHub repo
- [ ] Create private repo `margaret` under `simoPh83`
- [ ] Initial push with project scaffold

### 2. Next.js project scaffold
- [ ] `create-next-app` with TypeScript, App Router, `src/` dir, Tailwind off
- [x] Configure `next.config.ts`: `output: 'export'`
- [x] Install dependencies: `@supabase/supabase-js`, `@tanstack/react-query`, `@mui/material`, `@mui/x-data-grid`, `@emotion/react`, `@emotion/styled`
- [x] `.env.local` with Supabase URL + anon key + API URL
- [x] `.env.local.example` committed to repo (values blanked)

### 3. Core lib files
- [x] `src/lib/supabase.ts` — Supabase client singleton
- [x] `src/lib/api.ts` — `apiFetch` with auto-attached Bearer token
- [x] `src/lib/isTauri.ts` — platform detection helper

### 4. TanStack Query setup
- [x] `src/app/providers.tsx` — `QueryClientProvider` wrapper
- [x] Wire into `src/app/layout.tsx`

### 5. Auth
- [x] `src/app/(auth)/login/page.tsx` — email/password sign-in form (MUI)
- [x] Auth guard: `src/app/(protected)/layout.tsx` redirects unauthenticated users to `/login` (client-side; `proxy.js`/middleware is incompatible with `output: 'export'`)
- [x] Redirect authenticated users away from `/login`
- [x] Session persistence (Supabase SDK handles this automatically)

### 6. First protected screen — Units table
- [x] `src/app/(protected)/units/page.tsx`
- [x] `useQuery` calling `GET /api/units/table-data`
- [x] MUI DataGrid rendering the response
- [x] Loading + error states
- [ ] Confirm `GET /api/auth/me` returns 200 with the Supabase token (smoke test — run `next dev` and log in)

### 7. Tauri scaffold
- [ ] `cargo tauri init` inside the repo root
- [ ] `tauri.conf.json`: `frontendDist` → `../out`, `devUrl` → `http://localhost:3000`
- [ ] App icon placeholder
- [ ] Confirm `tauri dev` opens the Next.js app in a desktop window

> **Note (Next.js 16):** `middleware.js` is deprecated — the auth guard uses `proxy.js` convention but was implemented as a client-side layout since `output: 'export'` forbids server-side code.

---

## Phase 2 — deferred

- [ ] GitHub Actions CI/CD: build matrix (Windows + macOS), publish to GitHub Releases
- [ ] Tauri auto-updater plugin wired to GitHub Releases
- [ ] Code signing — Windows (Authenticode) + macOS (Apple Developer)
- [ ] Vercel web deployment (reports/charts only)
- [ ] CORS locked down on backend to Vercel domain
- [ ] Additional screens: buildings, letting-progress, dashboard
- [ ] Full web parity (Phase 2 goal: remove `isTauri` gate)

---

## Reference links

| Resource | URL |
|---|---|
| Backend API docs | https://weeklyreport-clean.up.railway.app/docs |
| OpenAPI spec | https://weeklyreport-clean.up.railway.app/openapi.json |
| Supabase dashboard | https://supabase.com/dashboard/project/hbnbeoysfmprnkrabroc |
| Tauri v2 docs | https://v2.tauri.app |
| GitHub repo | https://github.com/simoPh83/margaret |
