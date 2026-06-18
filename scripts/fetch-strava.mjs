/**
 * Fetches Strava activities and writes src/data/ironman-training.json.
 *
 * Runs at BUILD TIME (locally or in GitHub Actions) — never in the browser —
 * so the Strava client secret stays out of the shipped site. Output shape is
 * identical to scripts/generate-ironman.mjs.
 *
 * Required env (set as GitHub repo secrets, or a local .env you export):
 *   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN
 *
 * Graceful degradation: if any secret is missing, this is a NO-OP (exit 0) and
 * the committed placeholder data is kept, so the build never breaks. On a
 * transient API error it warns and exits 0 (keeps the last committed data).
 *
 * Run: `npm run fetch:strava`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');
const outPath = join(dataDir, 'ironman-training.json');
const config = JSON.parse(readFileSync(join(dataDir, 'ironman-config.json'), 'utf8'));

const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env;

if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REFRESH_TOKEN) {
  console.log('[fetch-strava] No Strava secrets set — keeping committed placeholder. (See README to connect.)');
  process.exit(0);
}

const lookbackWeeks = config.lookbackWeeks ?? 20;
const maxHr = config.targets?.maxHr ?? 190;

// --- Discipline buckets ---
const BIKE = new Set(['Ride', 'VirtualRide', 'EBikeRide', 'MountainBikeRide', 'GravelRide']);
const RUN = new Set(['Run', 'TrailRun', 'VirtualRun']);
const bucketOf = (t) => (t === 'Swim' ? 'swim' : BIKE.has(t) ? 'bike' : RUN.has(t) ? 'run' : null);
// Intensity factor when an activity has no HR, per sport.
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

async function getAccessToken() {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: STRAVA_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function getActivities(token, afterEpoch) {
  const all = [];
  for (let page = 1; ; page++) {
    const url = `https://www.strava.com/api/v3/athlete/activities?after=${afterEpoch}&per_page=200&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Activities fetch failed: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 200) break;
  }
  return all;
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
    const sport = bucketOf(a.sport_type || a.type);
    if (!sport) continue;
    const key = iso(mondayOf(a.start_date_local || a.start_date));
    const wk = byWeek.get(key);
    if (!wk) continue; // outside the lookback window

    const sec = a.moving_time || 0;
    const hr = a.average_heartrate || null;
    const intensity = hr ? Math.max(0.5, Math.min(1, hr / maxHr)) : DEFAULT_IF[sport];

    const km = (a.distance || 0) / 1000;
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
  const afterEpoch = Math.floor((Date.now() - lookbackWeeks * 7 * 86400000) / 1000);
  const token = await getAccessToken();
  const activities = await getActivities(token, afterEpoch);
  const { weeks, totals } = aggregate(activities);

  const out = {
    _README:
      'GENERATED from Strava — do not hand-edit; re-run `npm run fetch:strava`. Race/goal/targets/model come from ironman-config.json.',
    generatedAt: new Date().toISOString(),
    source: 'strava',
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
  console.log(`[fetch-strava] Wrote ${weeks.length} weeks from ${totals.sessions} activities to ${outPath}`);
}

main().catch((err) => {
  // Don't break the deploy on a transient Strava error — keep last data.
  console.warn(`[fetch-strava] WARNING: ${err.message}\n[fetch-strava] Keeping existing data file.`);
  process.exit(0);
});
