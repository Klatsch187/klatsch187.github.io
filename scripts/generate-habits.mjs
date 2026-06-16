/**
 * Generates realistic PLACEHOLDER data for the habit heatmap-calendar.
 *
 * Output: src/data/habits.json
 *   {
 *     name:  "Guitar practice",   // habit label
 *     unit:  "minutes",            // tooltip unit
 *     year:  2025,                 // calendar year to render
 *     values: { "2025-01-07": 35, ... }  // sparse map: date -> amount
 *   }
 *
 * The heatmap fills any missing day as 0. To edit by hand later, just add or
 * change entries in `values`. Re-run with `npm run gen:habits` to regenerate.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const YEAR = 2025;
const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'src', 'data', 'habits.json');

// Simple seeded PRNG so regeneration is stable run-to-run.
let seed = 20250101;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

const values = {};
let streak = 0;
for (let d = new Date(Date.UTC(YEAR, 0, 1)); d.getUTCFullYear() === YEAR; d.setUTCDate(d.getUTCDate() + 1)) {
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  // Higher chance to practice on weekends; momentum from current streak.
  const base = dow === 0 || dow === 6 ? 0.7 : 0.45;
  const p = Math.min(0.92, base + streak * 0.04);
  if (rnd() < p) {
    streak += 1;
    // Minutes practiced, loosely correlated with streak length.
    const minutes = Math.round(10 + rnd() * 35 + Math.min(streak, 8) * 3);
    const iso = d.toISOString().slice(0, 10);
    values[iso] = minutes;
  } else {
    streak = 0;
  }
}

const data = {
  _README:
    "Heatmap-calendar of a daily habit. `values` maps an ISO date (YYYY-MM-DD) to an amount. Missing days render as empty. Change `name`/`unit`/`year` freely. Regenerate placeholder data with `npm run gen:habits`.",
  name: 'Guitar practice',
  unit: 'minutes',
  year: YEAR,
  values,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');
console.log(`Wrote ${Object.keys(values).length} days to ${outPath}`);
