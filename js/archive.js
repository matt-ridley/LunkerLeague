/* The archive: older catches packed into a few documents, so opening the app reads a handful of documents instead of
   about four for every old catch (the catch, its weather, tackle and spot). Pure functions on plain data.

   An archive "set" is built at one time T (its `set`) and covers:
   - every catch caught before January 1 of `y0`, the first year that isn't locked yet (logbook catches included), each
     with its weather and its shared tackle and spot (secret tackle and private spots are never archived);
   - every comment and reaction made before T, on any catch.
   Saved as archive/{set}_{i} ({ set, y0, i, of, by, items }), each under about 700 KB, and named in config/league.archive
   ({ at: set, since, y0, of, by }). `items` is the part's catches, comments and reactions as one JSON string: a document
   can't have more than 20,000 indexed fields, and one string is a single field. Only admins write it.

   The app then loads the set plus what it doesn't hold: catches caught from y0 on, catches saved or edited since T
   (`editedAt`), weather from y0 on or looked up since T, shared tackle and spots from y0 on (`at` is the catch's time),
   comments and reactions made since T, and tombstones (gone/{id}) for archived things deleted since T. combine() puts
   them together, newest first. */
import { lockAt } from "./season.js";

export const PART_CHARS = 700000; // a Firestore document holds up to 1 MiB

/* The first year that isn't locked yet (its season is live or provisional): archives hold everything caught before it. */
export function archiveYear(now = Date.now(), graceDays = 7) {
  const y = new Date(now).getFullYear();
  return now >= lockAt(y - 1, graceDays) ? y : y - 1;
}
export const yearStart = y => new Date(y, 0, 1).getTime();

/* A catch as stored (not as the app shows it): the saved past flag only, and no small photo once it has moved out. */
function rawCatch(c) {
  const out = { ...c };
  delete out.pastStored;
  if (c.pastStored === true) out.past = true; else delete out.past;
  if (out.thumbAt) delete out.thumb;
  return out;
}
/* Drops undefined (Firestore refuses it). */
const clean = o => JSON.parse(JSON.stringify(o));

/* The parts of a new set. catches: [catch]; weather, tackle, spots: Map(catch id -> doc) (tackle and spots shared only);
   comments: Map(catch id -> [comment]); reactions: Map(catch id -> Map(uid -> { emojis, at })). */
export function buildArchive({ catches = [], weather = new Map(), tackle = new Map(), spots = new Map(), comments = new Map(),
  reactions = new Map(), y0, at, by = null, partChars = PART_CHARS }) {
  const before = yearStart(y0), items = [];
  for (const c of catches) {
    if (!(c.caughtAt < before)) continue;
    const e = rawCatch(c);
    const w = weather.get(c.id), t = tackle.get(c.id), s = spots.get(c.id);
    if (w) e.$w = w;
    if (t && t.shared && c.tackleShared) e.$t = t;
    if (s && s.shared && c.locShared) e.$s = s;
    items.push(["catches", clean(e)]);
  }
  for (const [cid, list] of comments) for (const m of list) if (m.at < at) items.push(["comments", clean({ ...m, catchId: cid })]);
  for (const [cid, by2] of reactions) for (const [uid, r] of by2) if (r.at < at) items.push(["reactions", clean({ cid, uid, emojis: r.emojis, at: r.at })]);
  const groups = [];
  let cur = null, size = 0;
  const fresh = () => { cur = { catches: [], comments: [], reactions: [] }; groups.push(cur); size = 50; };
  fresh();
  for (const [kind, v] of items) {
    const n = JSON.stringify(v).length + 1;
    if (size + n > partChars && (cur.catches.length || cur.comments.length || cur.reactions.length)) fresh();
    cur[kind].push(v);
    size += n;
  }
  return groups.map((g, i) => ({ set: at, y0, i, of: groups.length, by, items: JSON.stringify(g) }));
}

/* A set's parts read back: { complete, set, y0, catches: Map, weather: Map, tackle: Map, spots: Map,
   comments: Map(catch id -> [comment]), reactions: Map(catch id -> Map(uid -> { emojis, at })) }. `complete` is false
   until every part has arrived. */
export function readArchive(parts) {
  const out = { complete: false, set: null, y0: null, catches: new Map(), weather: new Map(), tackle: new Map(), spots: new Map(),
    comments: new Map(), reactions: new Map() };
  if (!parts.length) return out;
  out.set = parts[0].set; out.y0 = parts[0].y0;
  out.complete = new Set(parts.map(p => p.i)).size === parts[0].of;
  for (const part of parts) {
    let p;
    try { p = JSON.parse(part.items || "{}"); } catch { out.complete = false; continue; }
    for (const e of p.catches || []) {
      const { $w, $t, $s, ...c } = e;
      out.catches.set(c.id, c);
      if ($w) out.weather.set(c.id, $w);
      if ($t) out.tackle.set(c.id, $t);
      if ($s) out.spots.set(c.id, $s);
    }
    for (const m of p.comments || []) {
      if (!out.comments.has(m.catchId)) out.comments.set(m.catchId, []);
      out.comments.get(m.catchId).push(m);
    }
    for (const r of p.reactions || []) {
      if (!out.reactions.has(r.cid)) out.reactions.set(r.cid, new Map());
      out.reactions.get(r.cid).set(r.uid, { emojis: r.emojis, at: r.at });
    }
  }
  return out;
}

/* The archive and the live data together. live: { catches, weather, tackle, spots: Map(catch id -> doc) (tackle and spots:
   shared plus this angler's own), comments: Map(catch id -> [comment]), reactions: Map(catch id -> Map(uid -> { emojis, at })),
   gone: Map(id -> { kind, cid, who, at }) }. Live wins over the archive; a tombstone removes an archived thing it's newer
   than. An archived catch's tackle or spot only shows while the catch still says it's shared (it may have been made secret
   since). Returns the same shape as live. */
export function combine(arch, live) {
  const gone = live.gone || new Map();
  const catches = new Map(arch.catches);
  for (const [id, g] of gone) if (g.kind === "catch" && catches.has(id) && !live.catches.has(id)) catches.delete(id);
  for (const [id, c] of live.catches) catches.set(id, c);
  const keep = (m, flag) => new Map([...m].filter(([id]) => catches.has(id) && catches.get(id)[flag]));
  const tackle = new Map([...keep(arch.tackle, "tackleShared"), ...live.tackle]);
  const spots = new Map([...keep(arch.spots, "locShared"), ...live.spots]);
  const weather = new Map([...arch.weather, ...live.weather]);
  const comments = new Map();
  for (const src of [arch.comments, live.comments]) for (const [cid, list] of src) {
    const m = comments.get(cid) || new Map();
    for (const x of list) if (!(gone.get(x.id) && gone.get(x.id).kind === "comment" && gone.get(x.id).at >= (x.at || 0))) m.set(x.id, x);
    comments.set(cid, m);
  }
  const commentsOut = new Map();
  for (const [cid, m] of comments) if (m.size) commentsOut.set(cid, [...m.values()].sort((a, b) => (a.at || 0) - (b.at || 0)));
  const reactions = new Map();
  for (const [cid, by] of arch.reactions) for (const [uid, r] of by) {
    const g = gone.get(`${cid}_${uid}`);
    if (g && g.kind === "reaction" && g.at >= r.at) continue;
    if (!reactions.has(cid)) reactions.set(cid, new Map());
    reactions.get(cid).set(uid, r);
  }
  for (const [cid, by] of live.reactions) for (const [uid, r] of by) {
    if (!reactions.has(cid)) reactions.set(cid, new Map());
    reactions.get(cid).set(uid, r);
  }
  return { catches, weather, tackle, spots, comments: commentsOut, reactions };
}

/* Live catches the archive should hold but doesn't yet (caught before y0, saved since it was built at `set`): when there
   are many, it's time to build it again. */
export const lateCatches = (liveCatches, y0, set) => [...liveCatches.values()].filter(c => c.caughtAt < yearStart(y0) && (c.editedAt || 0) >= set).length;
