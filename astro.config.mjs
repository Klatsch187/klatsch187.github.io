// @ts-check
import { defineConfig } from 'astro/config';

// ---------------------------------------------------------------------------
// GitHub Pages configuration
// ---------------------------------------------------------------------------
// This repo is `klatsch187.github.io` -> a USER page, served from the root.
// So:  site = https://klatsch187.github.io   and   base = '/'
//
// BASE-PATH GOTCHA (read this if you reuse this repo):
//   * USER/ORG page  (repo named `<user>.github.io`)  -> base: '/'
//   * PROJECT page   (any other repo name, e.g. `blog`) -> base: '/blog/'
//
// If you switch to a project page, set `base: '/<repo-name>/'` below. All
// internal links/assets in this project go through `withBase()`
// (see src/lib/paths.js), so changing this one value is all you need.
// ---------------------------------------------------------------------------
export default defineConfig({
  site: 'https://klatsch187.github.io',
  base: '/',
  // Pretty URLs: /games/  instead of /games.html
  trailingSlash: 'ignore',
  build: {
    // Emit `about/index.html` style files so routes work without a server.
    format: 'directory',
  },
});
