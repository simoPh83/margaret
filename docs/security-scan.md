# Security scan & hardening notes — 2026-08-21

This doc tracks how to re-run the GitHub security scan on this repo and what still
needs consideration across the wider project (FastAPI backend + Supabase Postgres).

## This repo: `simoPh83/margaret` (React frontend, public)

We installed the [`gh-secure`](https://github.com/GitHubSecurityLab/gh-secure) GitHub
CLI extension, which audits and enables the 5 GitHub Security Lab baseline features.

### Re-run the scan

```sh
# one-time install (already done)
gh extension install GitHubSecurityLab/gh-secure

# check current status (read-only, safe anytime)
gh secure status

# preview what would change, applying nothing
gh secure --yes --dry-run

# apply: enable all 5 features
gh secure --yes

# or enable only specific features (skip branch protection to keep direct push to main)
gh secure vulnerability-reporting secret-scanning dependabot code-scanning --yes
```

### The 5 features

| Feature | Flag | What it does |
| --- | --- | --- |
| Branch Protection | `bp` | Protects `main`: no force-push/deletion, nudges to PRs |
| Private Vulnerability Reporting | `vr` | Private channel for reporting security bugs |
| Secret Scanning + Push Protection | `ss` | Scans 300+ token types; blocks pushes containing secrets |
| Dependabot alerts + updates | `dep` | Alerts on vulnerable npm deps, opens fix PRs |
| Code Scanning (CodeQL) | `cs` | Static analysis of JS/TS on every push/PR |

> **Status as of 2026-08-21:** dry-run only — **no features enabled yet**.
> Decision deferred. When ready, run `gh secure status` to confirm, then apply.

### Considerations before enabling

- **Branch protection** blocks direct pushes to `main` (we push directly today, solo).
  Does **not** block pushing tags, so the `git push origin vX.Y.Z` release flow is safe.
- **Push protection** can block a push if it sees something secret-like. Verify
  `src-tauri/private.tauri.key.pass` is gitignored before enabling.
- CodeQL runs on every push/PR; findings are alerts only and don't block merges unless
  configured to.

## Other parts of the project — what to consider

CodeQL / Dependabot scan each repo independently. They will **not** trace data flow
across the HTTP boundary between this frontend and the backend, so each side needs its
own pass, plus manual attention at the boundary.

### FastAPI backend (separate repo)

- [ ] Enable the same 5 features there: `gh secure --yes --repo <owner>/<backend-repo>`
      (CodeQL has full Python + FastAPI support — highest-value scan of the three)
- [ ] **Input validation** on every endpoint — this is where untrusted data lands.
      Pydantic models everywhere; never trust client input.
- [ ] **AuthZ per route** — verify each endpoint enforces authentication and, where
      relevant, row/object ownership (not just "is logged in").
- [ ] **SQL injection** — use SQLAlchemy/ORM parameterization only; no string-built SQL.
- [ ] **CORS** — currently open (`*`); lock down to the real Vercel/Railway frontend
      domain before production (already noted in [frontend-seed.md](frontend-seed.md)).
- [ ] **Rate limiting** on auth + write endpoints (e.g. `slowapi`).
- [ ] **Secrets** — DB connection strings, Supabase service-role key, JWT secret in env
      only; confirm none are committed; rotate any that ever were.
- [ ] **Error handling** — don't leak stack traces / DB errors in responses.

### Supabase (Postgres)

> If the React client talks to Supabase directly, Row Level Security **is** the
> authorization layer — no scanner checks it, it needs a manual audit.

- [ ] **RLS enabled** on *every* table (Postgres default is full access without it).
- [ ] **Policies** restrict rows to the owning user/tenant — test with a second account
      that it cannot read/write other rows.
- [ ] **Anon key vs service-role key** — anon key is public (in the shipped frontend
      bundle); the service-role key must **never** reach the client. Backend-only.
- [ ] **Storage buckets** — private by default, signed URLs where needed.
- [ ] Confirm the frontend only ever uses the anon key + RLS, never a privileged key.

### Cross-cutting

- [ ] **Secret scanning + push protection** on the backend repo too (it's the classic
      leak source: env files, DB creds, service keys).
- [ ] **Dependabot** on the backend (`requirements.txt` / `pyproject.toml`).
- [ ] Dependency review on PRs in both repos to block adding known-vulnerable packages.

## Links

- Security overview: <https://github.com/simoPh83/margaret/security>
- Security settings: <https://github.com/simoPh83/margaret/settings/security_analysis>
- gh-secure: <https://github.com/GitHubSecurityLab/gh-secure>
- GitHub Security Lab: <https://securitylab.github.com/>
