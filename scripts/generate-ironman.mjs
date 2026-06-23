/**
 * Generates realistic PLACEHOLDER Ironman training data.
 *
 * Output: src/data/ironman-training.json  (the file the chart reads)
 * Reads:  src/data/ironman-config.json    (race + targets you own)
 *
 * Shape is IDENTICAL to scripts/import-coros.mjs, so swapping placeholder →
 * real COROS data needs no chart changes. Each week carries per-discipline
 * `hours` AND `distanceKm`, so the projection model (src/lib/ironman.js) can
 * derive race pace. Speeds improve over the block so the projected finish
 * trends down and crosses under the sub-12 goal near "now". Re-run with
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
const lerp = (a, b, t) => a + (b - a) * t;

function mondayOf(d) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  x.setHours(0, 0, 0, 0);
  return x;
}
const iso = (d) => d.toISOString().slice(0, 10);

// Share of weekly volume per discipline (swim/bike/run).
const SPLIT = { swim: 0.15, bike: 0.55, run: 0.3 };
// Training speeds (km/h) ramp from start → end of the block as fitness builds.
// (run 6:10→5:15 /km, swim ~2:13→2:00 /100m, bike 26→30 km/h)
const SPEED_START = { swim: 2.7, bike: 26, run: 9.73 };
const SPEED_END = { swim: 3.0, bike: 30, run: 11.43 };

const thisMonday = mondayOf(new Date());
const weeks = [];
const totals = { sessions: 0, movingHours: 0, distanceKm: { swim: 0, bike: 0, run: 0 } };

for (let i = 0; i < N; i++) {
  const monday = new Date(thisMonday);
  monday.setDate(monday.getDate() - (N - 1 - i) * 7);

  const progress = N > 1 ? i / (N - 1) : 1; // 0 (oldest) → 1 (newest)
  const isRecovery = i % 4 === 3; // every 4th week is a down week
  const weekHours = peak * (0.45 + 0.5 * progress) * (isRecovery ? 0.65 : 1) * jitter(0.12);

  const hours = {
    swim: +(weekHours * SPLIT.swim * jitter(0.25)).toFixed(2),
    bike: +(weekHours * SPLIT.bike * jitter(0.18)).toFixed(2),
    run: +(weekHours * SPLIT.run * jitter(0.18)).toFixed(2),
  };

  // Distance = hours × an improving speed (with a little weekly noise).
  const distanceKm = {
    swim: +(hours.swim * lerp(SPEED_START.swim, SPEED_END.swim, progress) * jitter(0.06)).toFixed(2),
    bike: +(hours.bike * lerp(SPEED_START.bike, SPEED_END.bike, progress) * jitter(0.05)).toFixed(1),
    run: +(hours.run * lerp(SPEED_START.run, SPEED_END.run, progress) * jitter(0.05)).toFixed(2),
  };

  const realHours = hours.swim + hours.bike + hours.run;
  const sessions = Math.max(3, Math.round(4 + weekHours * 0.5 * jitter(0.15)));
  const avgHr = Math.round((134 + progress * 12) * jitter(0.04));
  const load = Math.round(realHours * 60 * (avgHr / maxHr) * 1.5);

  weeks.push({ weekStart: iso(monday), hours, distanceKm, sessions, avgHr, load });

  totals.sessions += sessions;
  totals.movingHours += realHours;
  totals.distanceKm.swim += distanceKm.swim;
  totals.distanceKm.bike += distanceKm.bike;
  totals.distanceKm.run += distanceKm.run;
}

totals.movingHours = +totals.movingHours.toFixed(1);
totals.distanceKm.swim = Math.round(totals.distanceKm.swim);
totals.distanceKm.bike = Math.round(totals.distanceKm.bike);
totals.distanceKm.run = Math.round(totals.distanceKm.run);

const out = {
  _README:
    'GENERATED — do not hand-edit; re-run `npm run gen:ironman` (placeholder) or `npm run import:coros` (real COROS .FIT data). Race/targets/model come from ironman-config.json. `weeks` is oldest→newest; `hours` + `distanceKm` are per discipline (their ratio = pace); `load` is a TRIMP-like proxy.',
  generatedAt: new Date().toISOString(),
  source: 'placeholder',
  athlete: config.athlete,
  race: config.race,
  goalFinish: config.goalFinish,
  raceDistanceKm: config.raceDistanceKm,
  targets: config.targets,
  model: config.model,
  totals,
  weeks,
};

const outPath = join(dataDir, 'ironman-training.json');
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${weeks.length} weeks (placeholder) to ${outPath}`);
