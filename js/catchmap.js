/* The map of catches: which spots to show and what was caught at each. Pure functions on plain data.
   Spots come as a Map of catch id -> { lat, lng, name, shared, uid }, holding only what this phone may see (shared
   spots, plus all of this angler's own). */

/* Catches this close together (4 decimals, about 10 m) share one marker. */
const spotKey = s => `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;

/* Markers for the map. view "mine": all of my spots, private ones too; "league": everyone's shared spots.
   [{ key, lat, lng, name, shared, catches (newest first) }], most catches first. Disqualified catches are left out. */
export function mapSpots({ catches = [], spots = new Map(), me, view = "mine", species = "" }) {
  const groups = new Map();
  for (const c of catches) {
    const s = spots.get(c.id);
    if (!s || typeof s.lat !== "number" || c.dq) continue;
    if (view === "mine" ? c.uid !== me : !s.shared) continue;
    if (species && c.species !== species) continue;
    const key = `${spotKey(s)}|${s.shared ? "s" : "p"}`;
    const g = groups.get(key) || { key, lat: s.lat, lng: s.lng, name: "", shared: !!s.shared, catches: [] };
    if (!g.name && s.name) g.name = s.name;
    g.catches.push(c);
    groups.set(key, g);
  }
  const out = [...groups.values()];
  for (const g of out) g.catches.sort((a, b) => b.caughtAt - a.caughtAt);
  return out.sort((a, b) => b.catches.length - a.catches.length || a.key.localeCompare(b.key));
}

/* The species with a spot in a view, for the filter (most caught first). */
export function mapSpecies(opts) {
  const n = new Map();
  for (const g of mapSpots({ ...opts, species: "" })) for (const c of g.catches) n.set(c.species, (n.get(c.species) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
}
