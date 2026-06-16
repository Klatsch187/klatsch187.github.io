# Adding a game

Games are **self-contained modules**. Adding one takes two steps and touches no
shared rendering code.

## 1. Create the module folder

```
src/games/<your-id>/
├── game.js     # required — exports mount() (and optionally unmount())
└── game.css    # optional — imported by game.js, bundled only when the game loads
```

`<your-id>` is a URL-safe slug (e.g. `memory-match`). It becomes the route
`/games/<your-id>/` **and** must match the `id` in the registry.

### The module contract

```js
import './game.css'; // optional styles, namespaced with a prefix to avoid clashes

/** Render your game into `root` (an empty <div>). */
export function mount(root) {
  root.innerHTML = `<button class="mm-btn">Play</button>`;
  // ...wire up your game...
}

/** Optional: clear timers / listeners when the player navigates away. */
export function unmount() {}
```

That's it — the loader (`src/games/loader.js`) discovers `game.js` automatically
via `import.meta.glob`, so each game is code-split and lazy-loaded on demand.

## 2. Register it

Add one entry to [`manifest.js`](./manifest.js):

```js
{
  id: 'memory-match',                 // MUST equal the folder name
  title: 'Memory Match',
  description: 'Flip tiles and find the pairs.',
  thumbnail: '/images/games/memory-match.svg',
  tags: ['memory'],
}
```

Drop a thumbnail at `public/images/games/<your-id>.svg` (or `.png`/`.jpg`).

Done — the card shows up on `/games/` and the route `/games/<your-id>/` works.

## Tips

- **Keep styles namespaced** (`.mm-*`) so games don't fight each other.
- Use the design tokens (`var(--color-accent)`, `var(--space-4)`, …) to match
  the site and get dark mode for free.
- Persist high scores with `localStorage` (see `reaction-time/game.js`).
- For keyboard accessibility, make your main control a real `<button>` or add
  `role="button"` + `tabindex="0"` + a keydown handler.
