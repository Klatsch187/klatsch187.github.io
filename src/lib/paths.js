/**
 * Prefix an internal path with the configured base path.
 *
 * Astro does NOT automatically rewrite `href`/`src` values for the `base`
 * option, so every internal link and public asset must go through this helper.
 * That way switching between a user page (base `/`) and a project page
 * (base `/repo/`) only requires changing `base` in astro.config.mjs.
 *
 * @example withBase('/games/')          -> '/games/'      (user page)
 * @example withBase('/games/')          -> '/repo/games/' (project page)
 * @param {string} path Root-relative path, e.g. '/images/x.svg'
 * @returns {string}
 */
export function withBase(path = '/') {
  const base = import.meta.env.BASE_URL || '/';
  const baseSlash = base.endsWith('/') ? base : base + '/';
  const clean = String(path).replace(/^\/+/, '');
  return baseSlash + clean;
}
