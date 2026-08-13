# WeeklyReport — Frontend Seed

Internal property management tool. This is a new standalone frontend repository. The backend is a separate FastAPI project deployed on Railway.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router) + TypeScript |
| Data fetching / caching | TanStack Query |
| Table logic | TanStack Table (headless) |
| UI components | MUI (Material UI) — includes DataGrid |
| Auth | Supabase JS SDK (`@supabase/supabase-js`) |

MUI DataGrid handles sorting, filtering, and pagination out of the box and is the right choice for this data-heavy tool. TanStack Table can supplement it for any views where more control is needed.

---

## Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://hbnbeoysfmprnkrabroc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase dashboard → Settings → API → "Publishable key" (formerly anon key, starts with sb_publishable_)
NEXT_PUBLIC_API_URL=https://weeklyreport-clean.up.railway.app
```

---

## Authentication

Auth is handled entirely by Supabase SDK — do not call the backend `/api/auth/authenticate` endpoint.

```ts
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

**Sign in:**

```ts
const { data, error } = await supabase.auth.signInWithPassword({ email, password })
```

**Attaching the token to every backend API call:**

```ts
// lib/api.ts
async function apiFetch(path: string, options?: RequestInit) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  return fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
}
```

The Supabase SDK automatically refreshes the access token. No manual refresh logic is needed.

---

## API contract

Full interactive documentation (Swagger UI) is available at:

**`https://weeklyreport-clean.up.railway.app/docs`**

The OpenAPI JSON spec (for type generation) is at `/openapi.json`.

### Key endpoints to start with

All endpoints require `Authorization: Bearer <supabase_access_token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth/me` | Verify auth is working — returns current user + permissions |
| `GET` | `/api/window/get-initial-ui-state` | Main dashboard state — buildings, units summary, user context |
| `GET` | `/api/units/table-data` | Unit table rows (the primary data table) |
| `GET` | `/api/buildings/buildings-table` | Buildings table |
| `GET` | `/api/letting-progress/data` | Letting progress view |

Start with `GET /api/auth/me` to confirm the Supabase token is accepted by the backend.

---

## TanStack Query setup

```ts
// app/providers.tsx — wrap the app in QueryClientProvider
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const queryClient = new QueryClient()
export function Providers({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

Example query:

```ts
const { data, isLoading } = useQuery({
  queryKey: ['units', 'table'],
  queryFn: () => apiFetch('/api/units/table-data').then(r => r.json()),
})
```

---

## Notes

- All users must log in with **email** (not username). Legacy username auth has been removed.
- The backend uses PostgreSQL on Supabase. The frontend never connects to the database directly.
- CORS is currently open (`*`) on the backend. Lock it down to the frontend's Vercel/Railway domain before production.
