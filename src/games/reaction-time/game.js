/**
 * Reaction Time — sample game proving the "self-contained module" pattern.
 *
 * Contract (see src/games/loader.js):
 *   mount(rootEl): render the game into rootEl
 *   unmount():     clear any timers / listeners
 *
 * State machine:
 *   idle -> waiting -> ready -> result        (normal flow)
 *   waiting -> tooSoon                         (clicked too early)
 * Best score is persisted to localStorage.
 */
import './game.css';

const BEST_KEY = 'rt-best-ms';
let activeTimeout = null; // module-scoped so unmount() can clear it

function readBest() {
  const v = Number(localStorage.getItem(BEST_KEY));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function mount(root) {
  let state = 'idle';
  let greenAt = 0; // timestamp when stage turned green
  let last = null;
  const attempts = [];

  root.innerHTML = `
    <div class="rt">
      <div class="rt__stage" data-state="idle" role="button" tabindex="0"
           aria-label="Reaction test area. Activate to start, then activate again when it turns green.">
        <div>
          <p class="rt__big" data-big>Reaction Time</p>
          <p class="rt__sub" data-sub>Click / tap or press Space to start</p>
          <p class="rt__hint">When the box turns <strong>green</strong>, react as fast as you can.</p>
        </div>
      </div>
      <dl class="rt__stats">
        <div class="rt__stat"><dt>Last</dt><dd data-last>—</dd></div>
        <div class="rt__stat"><dt>Average</dt><dd data-avg>—</dd></div>
        <div class="rt__stat"><dt>Best</dt><dd data-best>—</dd></div>
      </dl>
    </div>
  `;

  const stage = root.querySelector('.rt__stage');
  const big = root.querySelector('[data-big]');
  const sub = root.querySelector('[data-sub]');
  const lastEl = root.querySelector('[data-last]');
  const avgEl = root.querySelector('[data-avg]');
  const bestEl = root.querySelector('[data-best]');

  const renderBest = () => {
    const b = readBest();
    bestEl.textContent = b ? `${b} ms` : '—';
  };
  renderBest();

  function setState(next) {
    state = next;
    stage.dataset.state = next;
  }

  function startWaiting() {
    setState('waiting');
    big.textContent = 'Wait for green…';
    sub.textContent = 'Don’t click yet!';
    const delay = 1200 + Math.random() * 2600; // 1.2s–3.8s
    activeTimeout = window.setTimeout(() => {
      setState('ready');
      big.textContent = 'CLICK!';
      sub.textContent = 'Now!';
      greenAt = performance.now();
    }, delay);
  }

  function recordResult(ms) {
    last = ms;
    attempts.push(ms);
    lastEl.textContent = `${ms} ms`;
    const avg = Math.round(attempts.reduce((a, b) => a + b, 0) / attempts.length);
    avgEl.textContent = `${avg} ms`;

    const best = readBest();
    if (best === null || ms < best) {
      try { localStorage.setItem(BEST_KEY, String(ms)); } catch (e) { /* ignore */ }
    }
    renderBest();
  }

  function handleActivate() {
    switch (state) {
      case 'idle':
      case 'result':
      case 'tooSoon':
        startWaiting();
        break;
      case 'waiting':
        // Clicked before green.
        if (activeTimeout) clearTimeout(activeTimeout);
        setState('tooSoon');
        big.textContent = 'Too soon! 😅';
        sub.textContent = 'Click to try again';
        break;
      case 'ready': {
        const ms = Math.round(performance.now() - greenAt);
        setState('result');
        big.textContent = `${ms} ms`;
        sub.textContent = 'Click to go again';
        recordResult(ms);
        break;
      }
    }
  }

  function onKey(e) {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      handleActivate();
    }
  }

  stage.addEventListener('click', handleActivate);
  stage.addEventListener('keydown', onKey);

  // Save handlers for unmount.
  mount._cleanup = () => {
    if (activeTimeout) clearTimeout(activeTimeout);
    stage.removeEventListener('click', handleActivate);
    stage.removeEventListener('keydown', onKey);
  };
}

export function unmount() {
  if (activeTimeout) clearTimeout(activeTimeout);
  if (typeof mount._cleanup === 'function') mount._cleanup();
}
