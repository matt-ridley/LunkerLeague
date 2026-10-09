/* The Dock: the lists behind its pages (anglers and everyone's tackle boxes), kept pure so they can be tested. */
import { fishIn } from "./stats.js";

const byName = (a, b) => (a.displayName || "").localeCompare(b.displayName || "");

/* Every active angler, A to Z, with the fish they've caught this season (the calendar year) (a stringer counts its fish) and when they
   caught their latest fish (null if they haven't logged one). Disqualified catches don't count. */
export function anglerRoster({ members, catches = [], yearStart = new Date(new Date().getFullYear(), 0, 1).getTime() }) {
  return members.filter(m => !m.suspended).slice().sort(byName).map(m => {
    const mine = catches.filter(c => c.uid === m.id && !c.dq);
    return {
      member: m,
      ytdFish: mine.filter(c => c.caughtAt >= yearStart).reduce((n, c) => n + fishIn(c), 0),
      lastAt: mine.reduce((t, c) => Math.max(t, c.caughtAt || 0), 0) || null,
    };
  });
}

/* Everyone's tackle box: yours first, then the fullest boxes, then A to Z. Retired tackle isn't counted. */
export function tackleBoxes({ members, items = new Map(), me }) {
  const count = new Map();
  for (const i of items.values()) if (!i.retired) count.set(i.uid, (count.get(i.uid) || 0) + 1);
  return members.filter(m => !m.suspended).map(m => ({ member: m, items: count.get(m.id) || 0 }))
    .sort((a, b) => (b.member.id === me) - (a.member.id === me) || b.items - a.items || byName(a.member, b.member));
}
