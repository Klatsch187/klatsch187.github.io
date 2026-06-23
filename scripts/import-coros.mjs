/**
 * Imports COROS workout exports (.FIT files) and writes
 * src/data/ironman-training.json.
 *
 * Runs at BUILD/EDIT TIME (locally) — never in the browser. COROS lets you
 * export your activities for free as .FIT files:
 *   • COROS Training Hub (desktop) → Activity List → Export Data → .FIT, or
 *   • COROS app → an activity → ⋯ → Export Data → .FIT.
 * Drop the files into `coros-exports/` (gitignored) and run this. Output shape
 * is IDENTICAL to scripts/generate-ironman.mjs, so the chart needs no changes.
 *
 * Source dir: `coros-exports/` by default; override with the COROS_DIR env var
 * or a path argument (`npm run import:coros -- ./some/dir`).
 *
 * Graceful degradation: if the dir is missing/empty or nothing parses, this is
 * a NO-OP (exit 0) and the committed data is kept, so the build never breaks.
 *
 * Run: `npm run import:coros`
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import FitParserPkg from 'fit-file-parser';

const FitParser = FitParserPkg.default || FitParserPkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const dataDir = join(repoRoot, 'src', 'data');
const outPath = join(dataDir, 'ironman-training.json');
const config = JSON.parse(readFileSync(join(dataDir, 'ironman-config.json'), 'utf8'));

const srcDir = resolve(repoRoot, process.argv[2] || process.env.COROS_DIR || 'coros-exports');

const lookbackWeeks = config.lookbackWeeks ?? 20;
const maxHr = config.targets?.maxHr ?? 190;

// --- Discipline buckets (FIT `sport` enum, lower-cased by fit-file-parser) ---
const bucketOf = (sport) =>
  sport === 'swimming' ? 'swim' : sport === 'cycling' ? 'bike' : sport === 'running' ? 'run' : null;
// Intensity factor when a session has no HR, per sport.
const DEFAULT_IF = { swim: 0.75, bike: 0.65, run: 0.8 };

function mondayOf(d) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  x.setHours(0, 0, 0, 0);
  return x;
}
const iso = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// Parse one .FIT buffer into its session summaries (Promise-wrapped callback API).
function parseFit(buffer) {
  const parser = new FitParser({
    force: true,
    speedUnit: 'km/h',
    lengthUnit: 'm', // keep distances in METRES so the /1000 below yields km
    mode: 'list',
  });
  return new Promise((res) => {
    parser.parse(buffer, (err, data) => {
      if (err) {
        res([]);
        return;
      }
      res(data.sessions ?? []);
    });
  });
}

// Read every .fit in srcDir → a flat list of normalized activities.
async function loadActivities() {
  if (!existsSync(srcDir)) return null; // signal "no source dir"
  const files = readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith('.fit'));
  if (!files.length) return [];

  const activities = [];
  for (const file of files) {
    let sessions;
    try {
      sessions = await parseFit(readFileSync(join(srcDir, file)));
    } catch (e) {
      console.warn(`[import-coros] Skipping unreadable ${file}: ${e.message}`);
      continue;
    }
    if (!sessions.length) {
      console.warn(`[import-coros] No sessions found in ${file} — skipped.`);
      continue;
    }
    for (const s of sessions) {
      const bucket = bucketOf(s.sport);
      if (!bucket) continue; // ignore walking/hiking/strength/etc.
      activities.push({
        bucket,
        start: s.start_time || s.timestamp,
        sec: s.total_timer_time || s.total_elapsed_time || 0,
        dist: s.total_distance || 0, // metres (lengthUnit: 'm')
        hr: s.avg_heart_rate || null,
      });
    }
  }
  return activities;
}

function aggregate(activities) {
  // Seed a continuous run of weeks (oldest → newest) so the x-axis has no gaps.
  const thisMonday = mondayOf(new Date());
  const byWeek = new Map();
  for (let i = 0; i < lookbackWeeks; i++) {
    const m = new Date(thisMonday);
    m.setDate(m.getDate() - (lookbackWeeks - 1 - i) * 7);
    byWeek.set(iso(m), {
      weekStart: iso(m),
      hours: { swim: 0, bike: 0, run: 0 },
      dist: { swim: 0, bike: 0, run: 0 },
      sessions: 0,
      load: 0,
      _hrSum: 0,
      _hrTime: 0,
    });
  }

  const totals = { sessions: 0, movingSeconds: 0, distanceKm: { swim: 0, bike: 0, run: 0 } };

  for (const a of activities) {
    const sport = a.bucket;
    const key = iso(mondayOf(a.start));
    const wk = byWeek.get(key);
    if (!wk) continue; // outside the lookback window

    const sec = a.sec || 0;
    const hr = a.hr || null;
    const intensity = hr ? Math.max(0.5, Math.min(1, hr / maxHr)) : DEFAULT_IF[sport];

    const km = (a.dist || 0) / 1000;
    wk.hours[sport] += sec / 3600;
    wk.dist[sport] += km;
    wk.sessions += 1;
    wk.load += (sec / 60) * intensity * 1.5;
    if (hr) { wk._hrSum += hr * sec; wk._hrTime += sec; }

    totals.sessions += 1;
    totals.movingSeconds += sec;
    totals.distanceKm[sport] += km;
  }

  const weeks = [...byWeek.values()].map((w) => ({
    weekStart: w.weekStart,
    hours: {
      swim: +w.hours.swim.toFixed(2),
      bike: +w.hours.bike.toFixed(2),
      run: +w.hours.run.toFixed(2),
    },
    distanceKm: {
      swim: +w.dist.swim.toFixed(2),
      bike: +w.dist.bike.toFixed(1),
      run: +w.dist.run.toFixed(2),
    },
    sessions: w.sessions,
    avgHr: w._hrTime ? Math.round(w._hrSum / w._hrTime) : null,
    load: Math.round(w.load),
  }));

  return {
    weeks,
    totals: {
      sessions: totals.sessions,
      movingHours: +(totals.movingSeconds / 3600).toFixed(1),
      distanceKm: {
        swim: Math.round(totals.distanceKm.swim),
        bike: Math.round(totals.distanceKm.bike),
        run: Math.round(totals.distanceKm.run),
      },
    },
  };
}

async function main() {
  const activities = await loadActivities();

  if (activities === null) {
    console.log(`[import-coros] No '${srcDir}' folder — keeping committed data. (Export .FIT files from COROS into it; see README.)`);
    process.exit(0);
  }
  if (!activities.length) {
    console.log('[import-coros] No swim/bike/run sessions found in the .FIT files — keeping committed data.');
    process.exit(0);
  }

  const { weeks, totals } = aggregate(activities);

  const out = {
    _README:
      'GENERATED from COROS .FIT exports — do not hand-edit; re-run `npm run import:coros`. Race/goal/targets/model come from ironman-config.json.',
    generatedAt: new Date().toISOString(),
    source: 'coros',
    athlete: config.athlete,
    race: config.race,
    goalFinish: config.goalFinish,
    raceDistanceKm: config.raceDistanceKm,
    targets: config.targets,
    model: config.model,
    totals,
    weeks,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log(`[import-coros] Wrote ${weeks.length} weeks from ${totals.sessions} sessions to ${outPath}`);
}

main().catch((err) => {
  // Don't break the workflow on a parse error — keep the last committed data.
  console.warn(`[import-coros] WARNING: ${err.message}\n[import-coros] Keeping existing data file.`);
  process.exit(0);
});
