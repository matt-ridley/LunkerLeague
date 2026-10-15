/* The rod holder: each angler's rods and reels (rodHolder/{id}, `kind` "rod" or "reel"). Everyone in the league can see
   everyone's. A combo isn't saved anywhere: it's whichever reel is on a rod now. Each rod keeps every reel it has had
   (`reels`: [{ reelId, at }], oldest first; reelId null when the reel came off), like a boat keeps its captains, so
   a reel can move from rod to rod and a broken rod's reel goes back on the shelf. A catch's tackle saves the rod
   (`rodId`) and the reel on it then (`reelId`), so swapping reels later never changes old catches.
   A rod: { id, uid, kind: "rod", name, type, lengthIn, power, action, notes, thumb, status, endedAt, reels, createdAt }.
   A reel: { id, uid, kind: "reel", name, type, size, line, lineAt, notes, thumb, status, endedAt, createdAt }.
   status: "active", "retired", or "broken" (rods) / "worn" (reels); endedAt is when that happened.
   Pure functions on plain data. */
import { fishIn, measured, better } from "./stats.js";

export const ROD_TYPES = [["spinning", "Spinning"], ["casting", "Casting"], ["spincast", "Spincast"], ["fly", "Fly"], ["ice", "Ice"],
  ["trolling", "Trolling"], ["surf", "Surf"], ["other", "Other"]];
export const REEL_TYPES = [["spinning", "Spinning"], ["baitcaster", "Baitcaster"], ["spincast", "Spincast"], ["fly", "Fly"],
  ["conventional", "Conventional"], ["trolling", "Trolling"], ["ice", "Ice"], ["other", "Other"]];
export const POWERS = [["UL", "Ultralight"], ["L", "Light"], ["ML", "Medium light"], ["M", "Medium"], ["MH", "Medium heavy"], ["H", "Heavy"], ["XH", "Extra heavy"]];
export const ACTIONS = [["slow", "Slow"], ["moderate", "Moderate"], ["modfast", "Moderate fast"], ["fast", "Fast"], ["xfast", "Extra fast"]];
export const MAX_NAME = 60, MAX_NOTES = 200, MAX_SIZE = 12, MAX_LINE = 40, MAX_REELS = 100;
export const MIN_LENGTH_IN = 24, MAX_LENGTH_IN = 240;

const names = list => { const m = new Map(list); return k => m.get(k) || ""; };
export const rodTypeName = names(ROD_TYPES), reelTypeName = names(REEL_TYPES), powerName = names(POWERS), actionName = names(ACTIONS);

export const isRod = g => !!g && g.kind === "rod";
export const isReel = g => !!g && g.kind === "reel";
export const active = g => !!g && (g.status || "active") === "active";

/* Rod length: "6'6", "6' 6\"", "6 6", "7'", "6.5" (feet) or "78" (inches) -> inches; "" -> null; NaN when it isn't one. */
export function parseLength(s) {
  const t = String(s || "").trim().replace(/[″”]/g, '"').replace(/[′’]/g, "'");
  if (!t) return null;
  let m = t.match(/^(\d+)\s*(?:'|ft|\s)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in)?)?$/i), n;
  if (m) n = Number(m[1]) * 12 + (m[2] ? Number(m[2]) : 0);
  else if ((m = t.match(/^(\d+(?:\.\d+)?)\s*(in|")?$/i))) n = m[2] || Number(m[1]) > 15 ? Number(m[1]) : Number(m[1]) * 12;
  else return NaN;
  n = Math.round(n * 2) / 2;
  return n >= MIN_LENGTH_IN && n <= MAX_LENGTH_IN ? n : NaN;
}
/* 78 -> 6'6"; 84 -> 7'0" */
export const fmtLength = n => (n ? `${Math.floor(n / 12)}'${n % 12}"` : "");

/* "Spinning · 6'6\" · Medium light · Fast" and "Spinning · 2500 · 10 lb braid" */
export const rodLine = r => [rodTypeName(r.type), fmtLength(r.lengthIn), powerName(r.power), actionName(r.action)].filter(Boolean).join(" · ");
export const reelLine = r => [reelTypeName(r.type), r.size || "", r.line || ""].filter(Boolean).join(" · ");
export const gearLine = g => (isRod(g) ? rodLine(g) : reelLine(g));

/* ---------- Which reel is on which rod ---------- */

/* A rod's history, oldest first (a rod with none has never had a reel). */
const historyOf = rod => (rod && Array.isArray(rod.reels) ? rod.reels : []);

/* The reel on a rod now (null when it has none, or the rod is broken or retired). */
export function currentReel(rod) {
  if (!active(rod)) return null;
  const h = historyOf(rod);
  return h.length ? h[h.length - 1].reelId || null : null;
}

/* The reel that was on a rod at time t. A catch logged from before the rod's first reel was put on gets that first
   reel (the rod was probably saved after the catch). */
export function reelAt(rod, t) {
  const h = historyOf(rod);
  if (!h.length) return null;
  let r = h[0].reelId || null;
  for (const e of h) if (e.at <= t) r = e.reelId || null;
  return r;
}

/* A rod's spells with each reel: [{ reelId, from, to }] oldest first; `to` is null while it's still on. */
export function rodSpells(rod) {
  const h = historyOf(rod), out = [];
  h.forEach((e, i) => { if (e.reelId) out.push({ reelId: e.reelId, from: e.at, to: i + 1 < h.length ? h[i + 1].at : null }); });
  return out;
}

/* A reel's spells across all rods: [{ rod, from, to }] oldest first. */
export function reelSpells(reelId, gear) {
  const out = [];
  for (const g of gear.values()) if (isRod(g)) for (const s of rodSpells(g)) if (s.reelId === reelId) out.push({ rod: g, from: s.from, to: s.to });
  return out.sort((a, b) => a.from - b.from);
}

/* The rod a reel is on now, or null when it's a spare. */
export function rodOf(reelId, gear) {
  let best = null;
  for (const g of gear.values()) {
    if (!isRod(g) || currentReel(g) !== reelId) continue;
    const at = historyOf(g)[historyOf(g).length - 1].at;
    if (!best || at > best.at) best = { rod: g, at };
  }
  return best ? best.rod : null;
}

/* The history with one more entry (nothing changes when it already says that). */
const pushed = (rod, reelId, at) => (currentReelRaw(rod) === reelId ? null : [...historyOf(rod), { reelId, at }].slice(-MAX_REELS));
const currentReelRaw = rod => { const h = historyOf(rod); return h.length ? h[h.length - 1].reelId || null : null; };

/* Putting a reel on a rod (reelId null: taking the rod's reel off). The changes to save: Map(rod id -> new reels list).
   The reel comes off any other rod it was on, and the rod's old reel goes back on the shelf. */
export function mountChanges(rodId, reelId, gear, at) {
  const out = new Map(), rod = gear.get(rodId);
  if (!isRod(rod)) return out;
  if (reelId) for (const g of gear.values()) {
    if (isRod(g) && g.id !== rodId && currentReelRaw(g) === reelId) out.set(g.id, pushed(g, null, at));
  }
  const mine = pushed(rod, reelId || null, at);
  if (mine) out.set(rodId, mine);
  return out;
}

/* A rod breaking (or being retired): its status, when, and its reel comes off. Bringing it back changes the status
   only (it comes back with no reel). Returns the fields to save. */
export function endRod(rod, status, at) {
  const reels = pushed(rod, null, at);
  return { status, endedAt: status === "active" ? null : at, ...(reels ? { reels } : {}) };
}

/* A reel wearing out (or being retired): the rods to change (it comes off whatever rod it's on). */
export const endReelChanges = (reelId, gear, at) => {
  const out = new Map();
  for (const g of gear.values()) if (isRod(g) && currentReelRaw(g) === reelId) out.set(g.id, pushed(g, null, at));
  return out;
};

/* ---------- Catches ---------- */

const visible = (catches, id) => (catches instanceof Map ? catches.get(id) : catches.find(x => x.id === id));

/* The catches made with a rod or a reel (field "rodId" or "reelId"), newest first, from the tackle this phone can see
   (another angler's secret tackle never shows). */
export function gearCatches(field, id, catches, tackle) {
  const list = [];
  for (const [cid, t] of tackle) {
    if (t[field] !== id) continue;
    const c = visible(catches, cid);
    if (c && !c.dq) list.push(c);
  }
  return list.sort((a, b) => b.caughtAt - a.caughtAt);
}

/* What a rod or reel has done: { fish, catches, species: [[species, fish]] most first, best (heaviest/longest), first, last }. */
export function gearStats(list) {
  const species = new Map();
  let fish = 0, best = null;
  for (const c of list) {
    fish += fishIn(c);
    species.set(c.species, (species.get(c.species) || 0) + fishIn(c));
    if (measured(c)) best = better(best, c);
  }
  const times = list.map(c => c.caughtAt);
  return { fish, catches: list.length, species: [...species].sort((a, b) => b[1] - a[1]), best,
    first: times.length ? Math.min(...times) : null, last: times.length ? Math.max(...times) : null };
}

/* The rods an angler can pick when logging: their own active ones, most recently used first (then newest added).
   [{ rod, reel }] with the reel on it now (or null). */
export function pickerCombos(gear, me, catches, tackle) {
  const lastUsed = new Map();
  for (const [id, t] of tackle) {
    if (!t.rodId || t.uid !== me) continue;
    const c = catches.get(id);
    if (c) lastUsed.set(t.rodId, Math.max(lastUsed.get(t.rodId) || 0, c.createdAt || c.caughtAt || 0));
  }
  return [...gear.values()].filter(g => isRod(g) && g.uid === me && active(g))
    .sort((a, b) => (lastUsed.get(b.id) || 0) - (lastUsed.get(a.id) || 0) || (b.createdAt || 0) - (a.createdAt || 0))
    .map(rod => ({ rod, reel: gear.get(currentReel(rod)) || null }));
}

/* The rod to start a new catch with: the one on this angler's last-logged catch with a rod, if it's still in use;
   otherwise their only rod in use, when they have just one. */
export function startRod(me, gear, catches, tackle) {
  let best = null;
  for (const [id, t] of tackle) {
    const c = catches.get(id);
    if (!t.rodId || t.uid !== me || !c || c.uid !== me) continue;
    if (!best || (c.createdAt || 0) > (best.c.createdAt || 0)) best = { c, rodId: t.rodId };
  }
  if (best && active(gear.get(best.rodId))) return best.rodId;
  const mine = [...gear.values()].filter(g => isRod(g) && g.uid === me && active(g));
  return mine.length === 1 ? mine[0].id : null;
}

/* An angler's lucky combo: the rod and reel together that have caught them the most fish (from the catches this
   phone can see). { rod, reel, fish } or null. */
export function luckyCombo(owner, gear, catches, tackle) {
  const fishBy = new Map();
  for (const [id, t] of tackle) {
    const c = catches.get(id);
    if (!t.rodId || !t.reelId || !c || c.dq || c.uid !== owner) continue;
    const k = `${t.rodId}|${t.reelId}`;
    fishBy.set(k, (fishBy.get(k) || 0) + fishIn(c));
  }
  let best = null;
  for (const [k, fish] of fishBy) {
    const [rodId, reelId] = k.split("|"), rod = gear.get(rodId), reel = gear.get(reelId);
    if (!isRod(rod) || !isReel(reel) || rod.uid !== owner) continue;
    if (!best || fish > best.fish || (fish === best.fish && (rod.createdAt || 0) < (best.rod.createdAt || 0))) best = { rod, reel, fish };
  }
  return best;
}

/* How long a rod lasted, in whole days (from when it was saved, or its first catch if that was earlier). */
export function daysInService(rod, list) {
  const from = Math.min(rod.createdAt || Infinity, ...list.map(c => c.caughtAt));
  const to = rod.endedAt || Date.now();
  return Number.isFinite(from) ? Math.max(0, Math.floor((to - from) / 86400000)) : 0;
}

/* How old a reel's line is: whole days since it was spooled, or null. */
export const lineDays = (reel, now = Date.now()) => (reel && reel.lineAt ? Math.max(0, Math.floor((now - reel.lineAt) / 86400000)) : null);

/* ---------- League-wide (badges and news) ----------
   These use shared tackle only, so every phone works out the same thing. */

const sharedOnly = tackle => [...tackle].filter(([, t]) => t.shared);

/* Rods that broke: [{ rod, at, fish }] oldest first, with the fish they caught (shared tackle). */
export function brokenRods(gear, catches, tackle) {
  const fish = new Map();
  for (const [id, t] of sharedOnly(tackle)) {
    const c = visible(catches, id);
    if (t.rodId && c && !c.dq) fish.set(t.rodId, (fish.get(t.rodId) || 0) + fishIn(c));
  }
  return [...gear.values()].filter(g => isRod(g) && g.status === "broken" && g.endedAt)
    .map(rod => ({ rod, at: rod.endedAt, fish: fish.get(rod.id) || 0 })).sort((a, b) => a.at - b.at);
}

/* When an angler's busiest rod caught its nth fish (shared tackle, league catches), or null. */
export function rodFishAt(u, n, gear, counted, tackle) {
  const per = new Map();
  let at = null;
  for (const c of counted) { // oldest first
    if (c.uid !== u) continue;
    const t = tackle.get(c.id);
    if (!t || !t.shared || !t.rodId || !gear.has(t.rodId)) continue;
    const k = (per.get(t.rodId) || 0) + fishIn(c);
    per.set(t.rodId, k);
    if (k >= n) { at = c.caughtAt; break; }
  }
  return at;
}

/* When one of an angler's reels went on its nth different rod, or null. */
export function reelRodsAt(u, n, gear) {
  let at = null;
  for (const g of gear.values()) {
    if (!isReel(g) || g.uid !== u) continue;
    const rods = new Set();
    for (const s of reelSpells(g.id, gear)) {
      rods.add(s.rod.id);
      if (rods.size === n) { if (at == null || s.from < at) at = s.from; break; }
    }
  }
  return at;
}

/* When things of an angler's happened, oldest first: rods saved, rods broken, reels worn out. */
export const rodsSaved = (u, gear) => [...gear.values()].filter(g => isRod(g) && g.uid === u).map(g => g.createdAt || 0).sort((a, b) => a - b);
export const ended = (u, gear, kind, status) => [...gear.values()].filter(g => g.kind === kind && g.uid === u && g.status === status && g.endedAt)
  .map(g => g.endedAt).sort((a, b) => a - b);
