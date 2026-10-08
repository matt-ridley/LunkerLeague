/* Tackle on a catch: the bait or lure, the depth and the technique, all optional. Saved in its own doc (tackle/{catch id})
   so it can be kept secret, the same way a private spot is. Pure functions on plain objects: { lure, depthFt, technique }. */

export const TECHNIQUES = [
  ["casting", "Casting"], ["trolling", "Trolling"], ["jigging", "Jigging"], ["livebait", "Live bait"],
  ["fly", "Fly"], ["ice", "Ice"], ["drift", "Drifting"], ["bottom", "Bottom"],
];
const TECHNIQUE_NAMES = new Map(TECHNIQUES);
export const techniqueName = k => TECHNIQUE_NAMES.get(k) || "";

/* Offered as suggestions after the lures you've used before. Anglers can type anything. */
export const COMMON_LURES = [
  "Jig", "Jig and minnow", "Crankbait", "Jerkbait", "Spinnerbait", "Inline spinner", "Spoon", "Soft plastic",
  "Swimbait", "Topwater", "Bucktail", "Tube", "Drop shot", "Ned rig", "Texas rig", "Wacky worm", "Bottom bouncer",
  "Worm harness", "Live minnow", "Nightcrawler", "Leech", "Fly",
];

export const MAX_LURE = 60;
export const MAX_DEPTH_FT = 1000;

/* One spelling of a typed lure: trimmed, single spaces, no longer than the rules allow. */
export const cleanLure = s => String(s || "").replace(/\s+/g, " ").trim().slice(0, MAX_LURE);
/* Lures that differ only in case or punctuation count as the same one ("Jig & Minnow" and "jig and minnow" don't, though). */
export const lureKey = s => cleanLure(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* A typed depth in feet: a number over 0 and up to MAX_DEPTH_FT, to one decimal; blank is null; anything else is NaN. */
export function parseDepth(s) {
  const t = String(s ?? "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return isFinite(n) && n > 0 && n <= MAX_DEPTH_FT ? Math.round(n * 10) / 10 : NaN;
}

export const hasTackle = t => !!t && !!(t.lure || t.depthFt || t.technique);

/* "Chartreuse jig · 12 ft · Jigging" */
export const tackleText = t => !t ? "" : [t.lure, t.depthFt ? `${t.depthFt} ft` : "", techniqueName(t.technique)].filter(Boolean).join(" · ");

/* Suggestions for the lure box: your own lures, most used first, then the common ones you haven't used. */
export function lureSuggestions(mine = []) {
  const counts = new Map();
  for (const t of mine) {
    const k = lureKey(t && t.lure);
    if (!k) continue;
    const e = counts.get(k) || { lure: cleanLure(t.lure), n: 0 };
    e.n++;
    counts.set(k, e);
  }
  const own = [...counts.values()].sort((a, b) => b.n - a.n || a.lure.localeCompare(b.lure)).map(e => e.lure);
  return [...own, ...COMMON_LURES.filter(l => !counts.has(lureKey(l)))];
}
