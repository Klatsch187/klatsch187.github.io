/**
 * GAMES REGISTRY
 * ------------------------------------------------------------------
 * One entry per game. This is the ONLY file you edit to list a new game
 * (plus dropping its module folder in place — see src/games/README.md).
 *
 * Schema per entry:
 *   id          {string}  unique slug; MUST match the folder name in
 *                         src/games/<id>/ and becomes the URL /games/<id>/
 *   title       {string}  display name
 *   description {string}  one-line pitch shown on the card
 *   thumbnail   {string}  root-relative image path (wrapped with base at render)
 *   tags        {string[]} optional, shown as chips
 *   accent      {string}  optional CSS color for the card hover glow
 *
 * The route is derived as /games/<id>/ — no need to store it.
 */
export const games = [
  {
    id: 'reaction-time',
    title: 'Reaction Time',
    description: 'Wait for green, then click as fast as you can. Measures your reflexes in milliseconds.',
    thumbnail: '/images/games/reaction-time.svg',
    tags: ['reflex', 'timing', 'solo'],
    accent: '#0ea5e9',
  },
  // 👉 Add more games here. Example:
  // {
  //   id: 'memory-match',
  //   title: 'Memory Match',
  //   description: 'Flip tiles and find the pairs.',
  //   thumbnail: '/images/games/memory-match.svg',
  //   tags: ['memory'],
  // },
];

/** Convenience lookup by id. */
export function getGame(id) {
  return games.find((g) => g.id === id);
}
