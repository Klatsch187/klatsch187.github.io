/**
 * Lazy game loader.
 *
 * `import.meta.glob` lets Vite discover every game module at build time and
 * split each into its own chunk that is fetched ONLY when that game is opened.
 * So adding src/games/<id>/game.js is automatically picked up — no imports to
 * wire up here.
 *
 * Each game module must export:
 *   export function mount(rootEl) { ... }   // required: render into rootEl
 *   export function unmount() { ... }        // optional: cleanup (timers, etc.)
 */
const modules = import.meta.glob('./*/game.js');

/**
 * Dynamically import a game module by id.
 * @param {string} id matches the folder name src/games/<id>/
 * @returns {Promise<{ mount: Function, unmount?: Function }>}
 */
export function loadGame(id) {
  const key = `./${id}/game.js`;
  const importer = modules[key];
  if (!importer) {
    return Promise.reject(new Error(`No game module found at src/games/${id}/game.js`));
  }
  return importer();
}
