#!/usr/bin/env node
/**
 * Fetches a fresh /api/units/table-data response and saves it to
 * API-responses/units.table-data.json.
 *
 * Auth mirrors the app: Supabase email/password sign-in, then the session
 * access token is sent as a Bearer token to the backend.
 *
 * Usage: node scripts/fetch-units-table-data.js
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env.local');

/** Minimal .env parser (KEY=VALUE, ignores comments/blank lines). */
function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function main() {
  const env = loadEnv(envPath);
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_URL, USER_NAME, PASSWORD } = env;

  for (const [name, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_URL, USER_NAME, PASSWORD })) {
    if (!value) throw new Error(`Missing ${name} in .env.local`);
  }

  // 1. Sign in with Supabase to get an access token.
  const authRes = await fetch(
    `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: NEXT_PUBLIC_SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: USER_NAME, password: PASSWORD }),
    }
  );
  if (!authRes.ok) {
    throw new Error(`Supabase auth failed ${authRes.status}: ${await authRes.text()}`);
  }
  const { access_token } = await authRes.json();
  if (!access_token) throw new Error('Supabase auth returned no access_token');

  // 2. Call the backend with the token.
  const apiRes = await fetch(`${NEXT_PUBLIC_API_URL}/api/units/table-data`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
  });
  if (!apiRes.ok) {
    throw new Error(`API error ${apiRes.status}: ${await apiRes.text()}`);
  }
  const data = await apiRes.json();

  // 3. Save it alongside the previous snapshot.
  const outPath = path.join(root, 'API-responses', 'units.table-data.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');

  const tableData = data?.table_data ?? data;
  const rows = Array.isArray(tableData) ? tableData : tableData?.rows ?? tableData?.data ?? [];
  console.log(`Saved ${rows.length} rows to ${path.relative(root, outPath)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
