/* Crowns: a crown sits with whoever has the most of something right now. Another angler only takes it by passing the
   holder (a tie isn't enough), and the feed announces it was stolen. Worked out from the data every time, like the
   rankings: each crown is a stream of score changes in time order, replayed to see who held it when.
   Pure functions on plain data. */
import { fishIn } from "./stats.js";
import { derbyStatus, closesAt, standings } from "./derby.js";

export const CROWNS = [
  { id: "derbyKing", icon: "🏁", name: "Derby King", desc: "Most derby wins", unit: ["win", "wins"] },
  { id: "goldenNet", icon: "🥅", name: "Golden Net", desc: "Most fish netted for other anglers", unit: ["fish", "fish"] },
  { id: "bestCaptain", icon: "⚓", name: "Best Captain", desc: "Most derby podiums from fish caught on your boat", unit: ["podium", "podiums"] },
  { id: "conservationist", icon: "🔄", name: "Conservationist", desc: "Most fish released", unit: ["fish", "fish"] },
  { id: "meatEater", icon: "🍳", name: "Meat Eater", desc: "Most fish kept (every fish on a stringer counts)", unit: ["fish", "fish"] },
  { id: "stringerFiller", icon: "🪝", name: "Stringer Filler", desc: "Most limits (stringers marked as a limit)", unit: ["limit", "limits"] },
  { id: "speciesHunter", icon: "🌈", name: "Species Hunter", desc: "Most different species", unit: ["species", "species"] },
  { id: "grinder", icon: "⚙️", name: "Grinder", desc: "Most catches logged (a stringer counts as one)", unit: ["catch", "catches"] },
  { id: "recordHolder", icon: "👑", name: "Record Holder", desc: "Most species records held right now (weight or length)", unit: ["record", "records"] },
  { id: "earlyBird", icon: "🌅", name: "Early Bird", desc: "Most fish caught at dawn (4 to 8 AM)", unit: ["fish", "fish"] },
  { id: "nightStalker", icon: "🌙", name: "Night Stalker", desc: "Most fish caught at night (9 PM to 4 AM)", unit: ["fish", "fish"] },
  { id: "ironAngler", icon: "💪", name: "Iron Angler", desc: "Most days fished (days with a catch logged)", unit: ["day", "days"] },
  { id: "explorer", icon: "🧭", name: "Explorer", desc: "Most different spots shared with the league", unit: ["spot", "spots"] },
  { id: "fishStory", icon: "🤥", name: "Fish Story King", desc: "Most 🤥 reactions received", unit: ["🤥", "🤥"] },
  { id: "hypeMan", icon: "📣", name: "Hype Man", desc: "Most reactions and comments given on other people's catches", unit: ["hype", "hype"] },
  { id: "skunkMaster", icon: "🦨", name: "Skunk Master", desc: "Most derbies finished without a fish", unit: ["skunk", "skunks"] },
];
export const crownById = id => CROWNS.find(c => c.id === id);
export const crownScore = (crown, n) => `${n} ${crown.unit[n === 1 ? 0 : 1]}`;

const SAME_SPOT_M = 250;
function metres(a, b) {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/* Each time an angler logs a catch at a new spot shared with the league (spots within 250 m count as one):
   [{ uid, at }], in time order. `counted` must be sorted by time caught. */
export function newSpots(counted, spots) {
  const places = new Map(), out = [];
  for (const c of counted) {
    const s = spots.get(c.id);
    if (!s || !s.shared || !c.locShared) continue;
    const mine = places.get(c.uid) || []; places.set(c.uid, mine);
    if (!mine.some(p => metres(p, s) < SAME_SPOT_M)) { mine.push(s); out.push({ uid: c.uid, at: c.caughtAt }); }
  }
  return out;
}
const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const asMap = x => (x instanceof Map ? x : new Map((x || []).map(d => [d.id, d])));

/* Every score change, per crown: Map(crownId -> [{ at, uid, delta }]). */
export function crownChanges({ catches, derbies, entrants = new Map(), comments = new Map(), reactions = new Map(), spots = new Map(), leagueStart = 0, now = Date.now() }) {
  const derbyMap = asMap(derbies);
  const ch = new Map(CROWNS.map(c => [c.id, []]));
  const add = (id, at, uid, delta = 1) => { if (uid && delta) ch.get(id).push({ at, uid, delta }); };
  // Past catches (logbook) never count for crowns, including Record Holder (league catches only).
  const counts = c => !c.dq && !c.past && !(c.derbyId && derbyMap.get(c.derbyId) && derbyMap.get(c.derbyId).testing);
  const counted = catches.filter(counts).sort((a, b) => a.caughtAt - b.caughtAt);
  const byId = new Map(catches.map(c => [c.id, c]));

  const species = new Map(), days = new Map();
  for (const c of counted) {
    const at = c.caughtAt, h = new Date(at).getHours(), n = fishIn(c);
    add("grinder", at, c.uid);
    if (c.released) add("conservationist", at, c.uid, n); else add("meatEater", at, c.uid, n);
    if (c.fishCount > 1 && c.limit) add("stringerFiller", at, c.uid);
    if (h >= 4 && h < 8) add("earlyBird", at, c.uid, n);
    if (h >= 21 || h < 4) add("nightStalker", at, c.uid, n);
    if (c.netman && c.netman.uid && c.netman.uid !== c.uid) add("goldenNet", at, c.netman.uid);
    const sp = species.get(c.uid) || new Set(); species.set(c.uid, sp);
    if (!sp.has(c.species)) { sp.add(c.species); add("speciesHunter", at, c.uid); }
    const dy = days.get(c.uid) || new Set(); days.set(c.uid, dy);
    const k = dayKey(at);
    if (!dy.has(k)) { dy.add(k); add("ironAngler", at, c.uid); }
  }
  for (const s of newSpots(counted, spots)) add("explorer", s.at, s.uid);

  // Records held: +1 when an angler takes a species' weight or length record, -1 for the angler who loses it.
  for (const field of ["weightOz", "lengthIn"]) {
    const best = new Map();
    for (const c of counted) {
      if (!(c[field] > 0) || c.fishCount > 1) continue;
      const cur = best.get(c.species);
      if (cur && c[field] <= cur[field]) continue;
      best.set(c.species, c);
      if (cur && cur.uid === c.uid) continue;
      add("recordHolder", c.caughtAt, c.uid, 1);
      if (cur) add("recordHolder", c.caughtAt, cur.uid, -1);
    }
  }

  // Finished derbies (not tests): the winner, the captains of podium boats, and anglers who never got a fish.
  for (const d of derbyMap.values()) {
    if (d.testing || derbyStatus(d, now) !== "ended" || d.end < leagueStart) continue; // pre-season derbies don't count
    const ent = entrants.get(d.id) || new Map(), rows = standings(d, catches, ent), at = closesAt(d);
    if (rows[0]) add("derbyKing", at, rows[0].uid);
    for (const r of rows.slice(0, 3)) {
      for (const cap of new Set(r.fish.map(f => f.captain && f.captain.uid).filter(Boolean))) add("bestCaptain", at, cap);
    }
    const scored = new Set(rows.map(r => r.uid));
    for (const u of ent.keys()) if (!scored.has(u)) add("skunkMaster", at, u);
  }

  // Reactions (each person's latest, timed when they last changed it) and comments on other people's catches.
  for (const [cid, byUser] of reactions) {
    const c = byId.get(cid);
    if (!c) continue;
    for (const [u, r] of byUser) {
      if (u === c.uid) continue;
      add("hypeMan", r.at || 0, u, r.emojis.length);
      if (r.emojis.includes("🤥")) add("fishStory", r.at || 0, c.uid);
    }
  }
  for (const [cid, list] of comments) {
    const c = byId.get(cid);
    if (!c) continue;
    for (const cm of list) if (cm.uid !== c.uid) add("hypeMan", cm.at || 0, cm.uid);
  }
  for (const list of ch.values()) list.sort((a, b) => a.at - b.at);
  return ch;
}

/* Replays one crown's changes: { holder, score, board: [{ uid, score }], history: [{ at, uid, from }] }.
   The crown goes to the first angler to score; after that only someone with strictly more takes it. If the holder
   drops (records can be lost), the crown moves to whoever is now ahead. Ties among challengers go to whoever got
   there first. */
export function replayCrown(changes) {
  const score = new Map(), reached = new Map(), history = [];
  let holder = null;
  for (const { at, uid, delta } of changes) {
    score.set(uid, (score.get(uid) || 0) + delta);
    reached.set(uid, at);
    let best = null;
    for (const [u, s] of score) {
      if (s <= 0) continue;
      if (!best || s > score.get(best) || (s === score.get(best) && reached.get(u) < reached.get(best))) best = u;
    }
    const hs = holder ? score.get(holder) : 0;
    const next = !best ? null : (holder && hs > 0 && hs >= score.get(best) ? holder : best);
    if (next !== holder) { history.push({ at, uid: next, from: holder }); holder = next; }
  }
  const board = [...score].filter(([, s]) => s > 0).map(([uid, s]) => ({ uid, score: s }))
    .sort((a, b) => (a.uid === holder ? -1 : b.uid === holder ? 1 : 0) || b.score - a.score || reached.get(a.uid) - reached.get(b.uid));
  return { holder, score: holder ? score.get(holder) : 0, board, history };
}

/* Every crown, now: [{ crown, holder, score, board, history }]. */
export function crownStandings(input) {
  const ch = crownChanges(input);
  return CROWNS.map(crown => ({ crown, ...replayCrown(ch.get(crown.id)) }));
}

/* Crowns changing hands (not the first claim), newest first: [{ at, crown, uid, from }]. */
export function crownSteals(standingsNow) {
  return standingsNow.flatMap(s => s.history.filter(h => h.from && h.uid).map(h => ({ ...h, crown: s.crown })))
    .sort((a, b) => b.at - a.at);
}
