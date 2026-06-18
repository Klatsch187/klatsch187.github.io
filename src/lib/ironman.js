/**
 * Ironman finish-time projection model.
 *
 * Transparent heuristic (NOT a physiological model): we estimate race pace per
 * discipline from recent training speed, nudge it with editable `paceFactors`
 * (race pace = factor × training pace — e.g. run > 1 for off-the-bike fade),
 * add transitions, and sum. All knobs live in src/data/ironman-config.json so
 * the numbers are calibratable rather than a black box.
 *
 * Shared by IronmanTraining.astro (frontmatter + client script) so the math is
 * defined in exactly one place.
 */

// ---- time helpers ---------------------------------------------------------

/** "11:43:00" or "11:43" → seconds. */
export function parseHMS(str) {
  const [h = 0, m = 0, s = 0] = String(str).split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/** seconds → "H:MM:SS" (hours not zero-padded). */
export function formatHMS(seconds) {
  const sec = Math.max(0, Math.round(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** seconds → "H:MM" (for compact axis ticks). */
export function formatHM(seconds) {
  const sec = Math.max(0, Math.round(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** signed seconds → "−17 min" / "+5 min" (rounded to whole minutes). */
export function formatSignedMin(seconds) {
  const min = Math.round(seconds / 60);
  if (min === 0) return 'on the line';
  const sign = min < 0 ? '−' : '+';
  return `${sign}${Math.abs(min)} min`;
}

// ---- pace / projection ----------------------------------------------------

const DISCIPLINES = ['swim', 'bike', 'run'];

/**
 * Distance-weighted average speed (km/h) per discipline over the most recent
 * `windowWeeks` weeks. Returns null for a discipline with no logged volume.
 * @param {Array} weeks oldest→newest week records with {hours, distanceKm}
 */
export function disciplineSpeeds(weeks, windowWeeks) {
  const window = weeks.slice(-windowWeeks);
  const speeds = {};
  for (const d of DISCIPLINES) {
    let dist = 0;
    let hours = 0;
    for (const w of window) {
      dist += w.distanceKm?.[d] ?? 0;
      hours += w.hours?.[d] ?? 0;
    }
    speeds[d] = hours > 0 ? dist / hours : null;
  }
  return speeds;
}

/**
 * Project a full-race finish from per-discipline training speeds.
 * @returns {{ total:number, legs:{swim:number,T1:number,bike:number,T2:number,run:number} }|null}
 *          seconds; null if any discipline lacks a speed estimate.
 */
export function projectFinish(speeds, config) {
  const dist = config.raceDistanceKm;
  const factors = config.model.paceFactors;
  if (DISCIPLINES.some((d) => !speeds[d] || speeds[d] <= 0)) return null;

  // race pace = factor × training pace  ⇒  race speed = training speed / factor
  const legSec = (d) => (dist[d] / (speeds[d] / factors[d])) * 3600;
  const swim = legSec('swim');
  const bike = legSec('bike');
  const run = legSec('run');

  const transSec = (config.model.transitionMinutes ?? 8) * 60;
  const T1 = transSec * 0.45; // swim → bike (wetsuit strip)
  const T2 = transSec * 0.55; // bike → run

  return { total: swim + T1 + bike + T2 + run, legs: { swim, T1, bike, T2, run } };
}

/**
 * Projected finish recomputed each week from a trailing `paceWindowWeeks`
 * window — the "journey" series. Weeks without enough data yield null.
 * @returns {Array<{ weekStart:string, finishSeconds:number|null }>}
 */
export function projectionTrend(weeks, config) {
  const window = config.model.paceWindowWeeks ?? 6;
  return weeks.map((w, i) => {
    const speeds = disciplineSpeeds(weeks.slice(0, i + 1), window);
    const proj = projectFinish(speeds, config);
    return { weekStart: w.weekStart, finishSeconds: proj ? proj.total : null };
  });
}

/** Gap to goal in seconds (negative = under / ahead of the goal). */
export function goalGap(finishSeconds, goalSeconds) {
  return finishSeconds - goalSeconds;
}

/**
 * % of the journey from the starting projection to the goal that's been closed.
 * 100 once the projection reaches the goal; clamped to [0, 100].
 */
export function goalProgress(baselineSeconds, currentSeconds, goalSeconds) {
  if (baselineSeconds == null || currentSeconds == null) return 0;
  if (currentSeconds <= goalSeconds) return 100;
  if (baselineSeconds <= goalSeconds) return 100;
  const pct = ((baselineSeconds - currentSeconds) / (baselineSeconds - goalSeconds)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/**
 * One-call summary for the component: current & baseline projection, gap to
 * goal, and progress. `weeks` oldest→newest, `config` the merged training data
 * config (race/targets/model + goalFinish/raceDistanceKm).
 */
export function summarize(weeks, config) {
  const window = config.model.paceWindowWeeks ?? 6;
  const goalSeconds = parseHMS(config.goalFinish);

  const current = projectFinish(disciplineSpeeds(weeks, window), config);
  const baseline = projectFinish(disciplineSpeeds(weeks.slice(0, window), window), config);

  return {
    goalSeconds,
    current, // { total, legs } | null
    baselineSeconds: baseline ? baseline.total : null,
    gapSeconds: current ? goalGap(current.total, goalSeconds) : null,
    progressPct: current ? goalProgress(baseline?.total, current.total, goalSeconds) : 0,
  };
}
