/* The Dock: the lists behind its pages (anglers and everyone's tackle boxes), kept pure so they can be tested. */
import { fishIn } from "./stats.js";

const byName = (a, b) => (a.displayName || "").localeCompare(b.displayName || "");

/* Every active angler, A to Z: rank points and title, crowns held now, fish logged (a stringer counts its fish),
   and the boats they own or crew on. `rows` are rankings(), `crowns` are crown standings ({ holder }). */
export function anglerRoster({ members, rows = [], crowns = [], catches = [], fleet = new Map() }) {
  const rank = new Map(rows.map((r, i) => [r.uid, { ...r, place: i + 1 }]));
  return members.filter(m => !m.suspended).slice().sort(byName).map(m => {
    const mine = catches.filter(c => c.uid === m.id && !c.dq);
    const r = rank.get(m.id);
    return {
      member: m,
      points: r ? r.points : 0, title: r ? r.title : "", place: r ? r.place : null,
      crowns: crowns.filter(s => s.holder === m.id).length,
      fish: mine.reduce((n, c) => n + fishIn(c), 0),
      boats: [...fleet.values()].filter(b => !b.retired && (b.uid === m.id || (b.crew || []).includes(m.id))),
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
