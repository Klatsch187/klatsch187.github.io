/**
 * Content collections config (Astro 5 Content Layer).
 *
 * The `reviews` collection is just Markdown files in src/content/reviews/.
 * Front-matter is validated against the schema below, so a typo (e.g. a
 * rating of 9) fails the build with a clear message instead of breaking at
 * runtime. Adding a review = drop in a new .md file.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const reviews = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/reviews' }),
  schema: z.object({
    title: z.string(),
    // Free-form, but reuse existing values to keep the filter list tidy.
    category: z.string(),
    // 0–5, halves allowed (e.g. 4.5).
    rating: z.number().min(0).max(5),
    // Any date string; coerced to a Date for sorting.
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    // Optional root-relative image path, e.g. '/images/reviews/foo.svg'.
    image: z.string().optional(),
    // Optional one-liner shown under the title.
    summary: z.string().optional(),
    // Set true to keep a review out of the published list.
    draft: z.boolean().default(false),
  }),
});

export const collections = { reviews };
