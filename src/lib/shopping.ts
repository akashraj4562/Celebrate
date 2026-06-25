// ── src/lib/shopping.ts ─────────────────────────────────────────────────────
// Shoppable links for the clothing module (spec §10) + procurement-mode gating.
//
// THE HARD URL RULE (spec §10): the LLM must NEVER invent or recall a product /
// SKU URL — they 404. Shoppable links are produced in exactly two reliable ways:
//   (a) ALWAYS — deterministic *search-query* deep-links built IN CODE from a
//       plain query string (this file). 100% reliable: they're constructed, not
//       recalled, and land the user on real, current, in-stock results.
//   (b) ENHANCED — real results from server-side web search, labelled "live"
//       (kind 'live'). Built separately; never fabricated.
// This module owns (a). It is the only place clothing URLs come from in code, so
// it is structurally impossible for a model-authored SKU URL to reach the UI.

import type { ShoppableLink } from '../types';

// Strip any URL/scheme a model might have leaked into the "query" so we only ever
// build links from plain search words — never echo a recalled link.
function cleanQuery(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/gi, ' ') // drop any pasted URL
    .replace(/[^\p{L}\p{N}\s&'-]/gu, ' ') // keep letters/digits/spaces/basic punct
    .replace(/\s+/g, ' ')
    .trim();
}

const slug = (q: string) =>
  q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Build deterministic platform search deep-links from an outfit search query.
 * e.g. "emerald green bandhgala men" →
 *   Myntra   https://www.myntra.com/emerald-green-bandhgala-men
 *   Ajio     https://www.ajio.com/search/?text=emerald%20green%20bandhgala%20men
 *   Flipkart https://www.flipkart.com/search?q=emerald%20green%20bandhgala%20men
 * Returns [] for an empty query.
 */
export function buildSearchLinks(query: string): ShoppableLink[] {
  const q = cleanQuery(query);
  if (!q) return [];
  const e = encodeURIComponent(q);
  return [
    { label: `Myntra · ${q}`, url: `https://www.myntra.com/${slug(q)}`, kind: 'search' },
    { label: `Ajio · ${q}`, url: `https://www.ajio.com/search/?text=${e}`, kind: 'search' },
    { label: `Flipkart · ${q}`, url: `https://www.flipkart.com/search?q=${e}`, kind: 'search' },
  ];
}

export type ProcurementMode = 'tailored' | 'online' | 'in-store';

/**
 * Days-left gates the procurement MODE (spec §7b / §10): the card states the mode
 * and the reason, so the user knows what's actually achievable in the window.
 */
export function procurementMode(daysLeft: number): { mode: ProcurementMode; note: string } {
  if (daysLeft >= 10)
    return {
      mode: 'tailored',
      note: `${daysLeft} days out: a custom-stitched / tailored outfit is realistic — online or in-store both work.`,
    };
  if (daysLeft >= 5)
    return {
      mode: 'online',
      note: `${daysLeft} days out: online-only, and watch sizing — a size swap may not clear the delivery window, so order true-to-size.`,
    };
  return {
    mode: 'in-store',
    note:
      daysLeft >= 0
        ? `${daysLeft} days out: in-store / mall pickup is the only safe path — online delivery plus a size exchange won't make it in time.`
        : `This date has passed — links are kept for reference only.`,
  };
}
