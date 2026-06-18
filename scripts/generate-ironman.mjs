/**
 * Generates realistic PLACEHOLDER Ironman training data.
 *
 * Output: src/data/ironman-training.json  (the file the chart reads)
 * Reads:  src/data/ironman-config.json    (race + targets you own)
 *
 * The shape here is IDENTICAL to what scripts/fetch-strava.mjs produces, so
 * swapping placeholder → real Strava data needs no chart changes. Re-run with
 * `npm run gen:ironman`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');
const config = JSON.parse(readFileSync(join(dataDir, 'ironman-config.json'), 'utf8'));

const N = config.lookbackWeeks ?? 20;
const maxHr = config.targets?.maxHr ?? 190;
const peak = config.targets?.peakWeeklyHours ?? 14;

// Seeded PRNG so regeneration is stable.
let seed = 424242;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const jitter = (amt) => 1 + (rnd() - 0.5) * amt;

// Monday of the current week (local), then walk back N-1 weeks.
function mondayOf(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun .. 6 Sat
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  x.setHours(0, 0, 0, 0);
  return x;
}
const iso = (d) => d.toISOString().slice(0, 10);

// Rough moving speeds (km/h) to turn training hours into distance.
const SPEED = { swim: 3.4, bike: 29, run: 10 };
// Share of weekly volume per discipline (swim/bike/run).
const SPLIT = { swim: 0.15, bike: 0.55, run: 0.3 };

const thisMonday = mondayOf(new Date());
const weeks = [];
const totals = { sessions: 0, movingHours: 0, distanceKm: { swim: 0, bike: 0, run: 0 } };

for (let i = 0; i < N; i++) {
  const monday = new Date(thisMonday);
  monday.setDate(monday.getDate() - (N - 1 - i) * 7);

  const progress = N > 1 ? i / (N - 1) : 1; // 0 (oldest) → 1 (newest)
  const isRecovery = i % 4 === 3; // every 4th week is a down week
  // Base volume ramps from ~45% to ~95% of peak, minus recovery weeks.
  let weekHours = peak * (0.45 + 0.5 * progress) * (isRecovery ? 0.65 : 1) * jitter(0.12);

  const hours = {
    swim: +(weekHours * SPLIT.swim * jitter(0.25)).toFixed(2),
    bike: +(weekHours * SPLIT.bike * jitter(0.18)).toFixed(2),
    run: +(weekHours * SPLIT.run * jitter(0.18)).toFixed(2),
  };
  const realHours = hours.swim + hours.bike + hours.run;

  const sessions = Math.max(3, Math.round(4 + weekHours * 0.5 * jitter(0.15)));
  // Avg HR drifts up slightly as fitness/intensity build.
  const avgHr = Math.round((134 + progress * 12) * jitter(0.04));
  // TRIMP-like load: minutes × HR intensity.
  const load = Math.round(realHours * 60 * (avgHr / maxHr) * 1.5);

  weeks.push({ weekStart: iso(monday), hours, sessions, avgHr, load });

  totals.sessions += sessions;
  totals.movingHours += realHours;
  totals.distanceKm.swim += hours.swim * SPEED.swim;
  totals.distanceKm.bike += hours.bike * SPEED.bike;
  totals.distanceKm.run += hours.run * SPEED.run;
}

totals.movingHours = +totals.movingHours.toFixed(1);
totals.distanceKm.swim = Math.round(totals.distanceKm.swim);
totals.distanceKm.bike = Math.round(totals.distanceKm.bike);
totals.distanceKm.run = Math.round(totals.distanceKm.run);

const out = {
  _README:
    'GENERATED — do not hand-edit; re-run `npm run gen:ironman` (placeholder) or `npm run fetch:strava` (live). Race/targets come from ironman-config.json. `weeks` is oldest→newest; `hours` are moving-time hours per discipline; `load` is a TRIMP-like training-load proxy.',
  generatedAt: new Date().toISOString(),
  source: 'placeholder',
  athlete: config.athlete,
  race: config.race,
  targets: config.targets,
  totals,
  weeks,
};

const outPath = join(dataDir, 'ironman-training.json');
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${weeks.length} weeks (placeholder) to ${outPath}`);
