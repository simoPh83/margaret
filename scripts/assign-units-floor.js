#!/usr/bin/env node
/**
 * Assigns a numeric value to the `floor` column of the `units` table based on
 * `unit_name`, so the frontend can order units within each building.
 *
 * Mapping (lowest mention wins for names spanning several floors):
 *   sub-basement -> -3
 *   basement / vaults -> -2
 *   lower ground / "(B & G)" shorthand -> -1
 *   ground / whole building -> 0
 *   first/1st -> 1, second/2nd -> 2, ... tenth/10th -> 10
 *   residential flats -> lowest flat number in the name
 * Names with no recognisable floor (Roof, Garage, Mezzanine, sub-stations,
 * ...) are treated as extras and get one below the lowest real floor in the
 * data (e.g. -4 when the lowest real floor is -3), so they sink to the
 * bottom of every building's list.
 *
 * Connects to Postgres directly via DATABASE_URL in .env.local.
 * Get it from Supabase Dashboard -> Connect (or Settings -> Database ->
 * Connection string), e.g. the pooler URI:
 *   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
 * The password is the database password (resettable under Settings ->
 * Database). Writes run in a single transaction (all-or-nothing).
 *
 * Usage:
 *   node scripts/assign-units-floor.js           # dry run (default)
 *   node scripts/assign-units-floor.js --apply   # write changes to the db
 */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env.local');
const APPLY = process.argv.includes('--apply');

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

const WORD_ORDINALS = [
  ['first', 1], ['second', 2], ['third', 3], ['fourth', 4], ['fifth', 5],
  ['sixth', 6], ['seventh', 7], ['eighth', 8], ['ninth', 9], ['tenth', 10],
];

/**
 * Returns the floor number for a unit_name, or null when no floor can be
 * determined. For names mentioning several floors the lowest one wins, so
 * the unit sorts at the bottom of its range within a building.
 */
function floorForName(unitName) {
  if (!unitName) return null;
  const name = unitName.toLowerCase().replace(/\s+/g, ' ').trim();

  // Whole-building units sort at ground level.
  if (/^whole( building)?$/.test(name)) return 0;

  const found = [];

  if (/\bsub[- ]?basement\b/.test(name)) found.push(-3);
  if (/\bbasement\b/.test(name)) found.push(-2);
  if (/\b(pavement )?vaults?\b/.test(name)) found.push(-2);
  if (/\blower ground\b/.test(name)) found.push(-1);
  // "(B & G)" / "(B, G ...)" shorthand for basement & ground -> -1
  if (/\bb\s*[,&]\s*g\b/.test(name)) found.push(-1);
  if (/\b(ground|grnd)\b/.test(name)) found.push(0);

  for (const [word, n] of WORD_ORDINALS) {
    if (new RegExp(`\\b${word}\\b`).test(name)) found.push(n);
  }
  // Numeric ordinals: 1st, 2nd, 3rd, 4th... (street numbers lack the suffix)
  for (const m of name.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\b/g)) {
    found.push(parseInt(m[1], 10));
  }
  // Residential flats carry no floor word — use the lowest flat number so
  // they still get a sequential value (Flat 1 -> 1, Flats 1 - 9 -> 1).
  if (/\bflats?\b/.test(name)) {
    const nums = [...name.matchAll(/\b(\d{1,2})\b/g)].map((m) => parseInt(m[1], 10));
    if (nums.length > 0) found.push(Math.min(...nums));
  }

  if (found.length === 0) return null;
  return Math.min(...found);
}

async function main() {
  const env = loadEnv(envPath);
  const DATABASE_URL = env.DATABASE_URL || process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error(
      'Missing DATABASE_URL in .env.local — see the header comment for where to find it.'
    );
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  // 1. Read all units.
  const { rows: units } = await client.query(
    'SELECT id, building_id, unit_name, floor FROM units ORDER BY building_id, unit_name'
  );
  console.log(`Read ${units.length} units from the database.\n`);

  // 2. Parse every unit name first; extras then go one below the lowest
  // real floor so they sort at the bottom of their building's list.
  const parsed = units.map((u) => ({ unit: u, floor: floorForName(u.unit_name) }));
  const realFloors = parsed.filter((p) => p.floor !== null).map((p) => p.floor);
  const minFloor = realFloors.length > 0 ? Math.min(...realFloors) : -3;
  const extrasFloor = minFloor - 1;

  // 3. Compute assignments.
  const changes = [];
  const extras = new Map(); // unit_name -> count
  for (const { unit: u, floor } of parsed) {
    const target = floor ?? extrasFloor;
    if (floor === null) extras.set(u.unit_name, (extras.get(u.unit_name) ?? 0) + 1);
    if (u.floor !== target) changes.push({ ...u, newFloor: target });
  }

  // 4. Report.
  const byFloor = new Map();
  for (const c of changes) byFloor.set(c.newFloor, (byFloor.get(c.newFloor) ?? 0) + 1);
  console.log('Assignments to write:');
  for (const [floor, count] of [...byFloor.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  floor ${String(floor).padStart(3)}: ${count} units`);
  }
  console.log(`\nTotal to update: ${changes.length} / ${units.length}`);
  console.log(
    `\nExtras with no floor in the name -> ${extrasFloor} ` +
      `(one below the lowest real floor, ${minFloor}):`
  );
  for (const [name, count] of [...extras.entries()].sort()) {
    console.log(`  ${String(count).padStart(3)}x ${name}`);
  }

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to write these values.');
    await client.end();
    return;
  }

  // 5. Apply updates inside a single transaction (all-or-nothing).
  await client.query('BEGIN');
  try {
    for (const [i, c] of changes.entries()) {
      await client.query('UPDATE units SET floor = $1 WHERE id = $2', [c.newFloor, c.id]);
      const done = i + 1;
      if (done % 50 === 0) console.log(`  ...${done}/${changes.length}`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`Update failed — rolled back, nothing was written. Cause: ${err.message}`);
  }
  console.log(`\nDone — updated ${changes.length} units.`);
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
