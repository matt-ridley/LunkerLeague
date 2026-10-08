/* The tackle box: each angler's library of tackle (tackleBox/{item id}), picked when logging a catch. Everyone in the
   league can see everyone's box; which catches an item has caught follows the catch's tackle, so secret tackle stays
   secret. A catch keeps the item's name as it was (the tackle doc's `lure`), so renaming or deleting an item never
   changes old catches. Pure functions on plain data.
   An item: { id, uid, name, type, technique, depthFt, notes, thumb, retired, createdAt }. */
import { cleanLure, lureKey, techniqueName } from "./tackle.js";
import { usualDepth } from "./mystats.js";

export const TYPES = [
  ["jig", "Jig"], ["crankbait", "Crankbait"], ["jerkbait", "Jerkbait"], ["spinnerbait", "Spinnerbait"],
  ["spinner", "Inline spinner"], ["spoon", "Spoon"], ["plastic", "Soft plastic"], ["swimbait", "Swimbait"],
  ["topwater", "Topwater"], ["bucktail", "Bucktail"], ["fly", "Fly"], ["livebait", "Live bait"], ["rig", "Rig"], ["other", "Other"],
];
const TYPE_NAMES = new Map(TYPES);
export const typeName = k => TYPE_NAMES.get(k) || "";
export const MAX_NAME = 60, MAX_NOTES = 200;

/* "Jig · Jigging · usually 18 ft" */
export const itemLine = i => [typeName(i.type), techniqueName(i.technique), i.depthFt ? `usually ${i.depthFt} ft` : ""].filter(Boolean).join(" · ");

/* The catches that used an item, newest first, from the tackle this phone can see (so another angler's secret tackle
   never shows). catches: Map or array; tackle: Map of catch id -> tackle doc. */
export function itemCatches(itemId, catches, tackle) {
  const list = [];
  for (const [id, t] of tackle) {
    if (t.itemId !== itemId) continue;
    const c = catches instanceof Map ? catches.get(id) : catches.find(x => x.id === id);
    if (c && !c.dq) list.push(c);
  }
  return list.sort((a, b) => b.caughtAt - a.caughtAt);
}

/* An angler's items for the picker: not retired, most recently used first (then newest added). */
export function pickerItems(items, me, catches, tackle) {
  const lastUsed = new Map();
  for (const [id, t] of tackle) {
    if (!t.itemId || t.uid !== me) continue;
    const c = catches.get(id);
    if (c) lastUsed.set(t.itemId, Math.max(lastUsed.get(t.itemId) || 0, c.createdAt || c.caughtAt || 0));
  }
  return [...items.values()].filter(i => i.uid === me && !i.retired)
    .sort((a, b) => (lastUsed.get(b.id) || 0) - (lastUsed.get(a.id) || 0) || (b.createdAt || 0) - (a.createdAt || 0));
}

/* An angler's lucky lure: the item they pinned (if it's still in their box), else the item that's caught them the most
   fish (from the catches this phone can see). { item, fish, pinned } or null. */
export function luckyLure(owner, pinnedId, items, catches, tackle) {
  const fishBy = new Map();
  for (const [id, t] of tackle) {
    const c = catches.get(id);
    if (!t.itemId || !c || c.dq || c.uid !== owner) continue;
    fishBy.set(t.itemId, (fishBy.get(t.itemId) || 0) + (Number.isInteger(c.fishCount) && c.fishCount > 1 ? c.fishCount : 1));
  }
  const pinned = pinnedId && items.get(pinnedId);
  if (pinned && pinned.uid === owner) return { item: pinned, fish: fishBy.get(pinned.id) || 0, pinned: true };
  let best = null;
  for (const i of items.values()) {
    const n = fishBy.get(i.id) || 0;
    if (i.uid !== owner || !n) continue;
    if (!best || n > best.fish || (n === best.fish && (i.createdAt || 0) < (best.item.createdAt || 0))) best = { item: i, fish: n, pinned: false };
  }
  return best;
}

/* The tackle on this angler's last-logged catch that had some (for "Same tackle as your last catch?"), or null. */
export function lastTackle(me, catches, tackle) {
  let best = null;
  for (const [id, t] of tackle) {
    const c = catches.get(id);
    if (!c || c.uid !== me || t.uid !== me) continue;
    if (!best || (c.createdAt || 0) > (best.c.createdAt || 0)) best = { c, t };
  }
  return best ? { lure: best.t.lure || "", depthFt: best.t.depthFt || null, technique: best.t.technique || "", itemId: best.t.itemId || null } : null;
}

/* Filling a box from the lures already typed on catches: one new item per lure (spellings that differ only in case or
   punctuation go together, under the most used spelling), with its most used technique and usual depth. Lures that
   match an item already in the box aren't added again, but their catches are linked to it.
   Returns { add: [{ name, technique, depthFt, catchIds }], link: [{ itemId, catchIds }] }. */
export function fillFromCatches(me, items, catches, tackle) {
  const have = new Map([...items.values()].filter(i => i.uid === me).map(i => [lureKey(i.name), i.id]));
  const groups = new Map();
  for (const [id, t] of tackle) {
    const c = catches.get(id), k = lureKey(t.lure);
    if (!c || c.uid !== me || t.uid !== me || !k || t.itemId) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ c, t });
  }
  const add = [], link = [];
  // The most used value; a tie goes to the one used first (usually how the angler first wrote it).
  const most = values => { const n = new Map(); for (const v of values) if (v) n.set(v, (n.get(v) || 0) + 1); return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || ""; };
  for (const [k, list] of groups) {
    list.sort((a, b) => a.c.caughtAt - b.c.caughtAt);
    const catchIds = list.map(x => x.c.id);
    if (have.has(k)) { link.push({ itemId: have.get(k), catchIds }); continue; }
    add.push({
      name: cleanLure(most(list.map(x => cleanLure(x.t.lure)))).slice(0, MAX_NAME),
      technique: most(list.map(x => x.t.technique)),
      depthFt: usualDepth(list.map(x => x.c), tackle),
      catchIds,
    });
  }
  add.sort((a, b) => b.catchIds.length - a.catchIds.length || a.name.localeCompare(b.name));
  return { add, link };
}
