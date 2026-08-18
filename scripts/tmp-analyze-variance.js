// One-off analysis of the variance (ERV variation) values in the saved API snapshot.
const data = require('../API-responses/units.table-data.json');
const rows = data.table_data?.rows ?? data.rows ?? [];
console.log('rows:', rows.length);
const vals = [];
for (const r of rows) {
  const v = r.cells?.variance?.sort_value;
  if (typeof v === 'number' && Number.isFinite(v) && v !== -999) vals.push(v);
}
vals.sort((a, b) => a - b);
console.log('n =', vals.length);
const pct = (p) => vals[Math.floor((vals.length - 1) * p)];
console.log('min', vals[0], 'p10', pct(0.1), 'p25', pct(0.25), 'median', pct(0.5), 'p75', pct(0.75), 'p90', pct(0.9), 'p95', pct(0.95), 'max', vals[vals.length - 1]);
const within50 = vals.filter((v) => Math.abs(v) <= 50).length;
const within25 = vals.filter((v) => Math.abs(v) <= 25).length;
const within10 = vals.filter((v) => Math.abs(v) <= 10).length;
console.log('within ±50%:', within50, '/', vals.length, '=', ((100 * within50) / vals.length).toFixed(1) + '%');
console.log('within ±25%:', within25, '=', ((100 * within25) / vals.length).toFixed(1) + '%');
console.log('within ±10%:', within10, '=', ((100 * within10) / vals.length).toFixed(1) + '%');
// histogram in 10% buckets
const hist = new Map();
for (const v of vals) {
  const b = Math.max(-10, Math.min(10, Math.trunc(v / 10)));
  hist.set(b * 10, (hist.get(b * 10) ?? 0) + 1);
}
console.log('\nhistogram (bucket start -> count):');
for (const [b, n] of [...hist.entries()].sort((a, b2) => a[0] - b2[0])) {
  console.log(String(b).padStart(5), '|', '#'.repeat(n), n);
}
