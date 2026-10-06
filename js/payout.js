/* Derby money: the pot, who gets paid what, and crew cuts. The app only keeps track; nobody pays through it.
   Pure functions on plain data, so every phone shows the same numbers. Amounts are in dollars. */

import { categoryBoards, categoriesOf, derbyEntries, mysteryBoard } from "./derby.js";

export const PAYOUT_PRESETS = {
  "100": [100],
  "70,30": [70, 30],
  "60,30,10": [60, 30, 10],
  "50,30,20": [50, 30, 20],
};

export const hasMoney = d => (d.entryFee || 0) > 0 || (d.addedMoney || 0) > 0 || (d.sidePotFee || 0) > 0;

export function fmtMoney(n) {
  const v = Math.round((n || 0) * 100) / 100;
  return "$" + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

/* Round to the nearest roundTo dollars (0 = to the cent). */
export const roundAmt = (n, to) => to > 0 ? Math.round(n / to) * to : Math.round(n * 100) / 100;

/* Who gets the money from one winning: the angler, minus captain and net-man cuts for the crew of their fish.
   No cut when the crew member is the angler or isn't named. */
function split(amount, angler, fish, d) {
  const lines = [];
  let net = amount;
  for (const [role, pct, label] of [["captain", d.captainPct || 0, "captain"], ["netman", d.netmanPct || 0, "net man"]]) {
    const who = fish && fish[role];
    if (!who || !(pct > 0) || (who.uid && who.uid === angler)) continue;
    const cut = amount * pct / 100;
    net -= cut;
    lines.push({ payee: who.uid ? { uid: who.uid } : { guest: who.guest }, amount: cut, role: label });
  }
  return { net, lines };
}

/* The fish whose crew gets the cut: the angler's single counted fish, or the biggest of several. */
function crewFish(row) {
  return [...row.fish].sort((a, b) => (b.weightOz || 0) - (a.weightOz || 0) || (b.lengthIn || 0) - (a.lengthIn || 0))[0];
}

export const payeeKey = p => p.uid ? "u:" + p.uid : "g:" + String(p.guest || "").trim().toLowerCase();

/* rows: derby standings (best first). entrants: Map(uid -> { paid, sidePotPaid }).
   sideEntries: counted entries (for the big-fish side pot). Returns everything the Money tab shows.
   For one category of several: `share` is its part of the pot (0–1), `label` goes in front of each line, and
   `sidePot: false` leaves the side pot to be counted once, elsewhere. */
export function payouts(d, rows, entrants, sideEntries = [], { share = 1, label = "", sidePot = true } = {}) {
  const ent = entrants || new Map();
  const isPaid = uid => !!(ent.get(uid) || {}).paid;
  const paidCount = [...ent.values()].filter(e => e.paid).length;
  const pot = ((d.entryFee || 0) * paidCount + (d.addedMoney || 0)) * share;
  const tag = t => (label ? `${label}: ${t}` : t);
  const pcts = (d.payoutPcts && d.payoutPcts.length ? d.payoutPcts : [100]).filter(p => p > 0);
  const eligible = d.unpaidCanWin ? rows : rows.filter(r => isPaid(r.uid));

  // Places nobody qualifies for: their share goes to 1st place.
  const placed = pcts.slice(0, eligible.length);
  const unplacedPct = pcts.slice(eligible.length).reduce((s, p) => s + p, 0);
  if (placed.length) placed[0] += unplacedPct;

  const items = []; // { payee, amount, why }
  const places = placed.map((pct, i) => {
    const r = eligible[i], gross = pot * pct / 100, fish = crewFish(r);
    const { net, lines } = split(gross, r.uid, fish, d);
    items.push({ payee: { uid: r.uid }, amount: net, why: tag(`${ordinal(i + 1)} place`), winner: i === 0 });
    for (const l of lines) items.push({ payee: l.payee, amount: l.amount, why: tag(`${l.role} for ${ordinal(i + 1)}`) });
    return { place: i + 1, uid: r.uid, pct, gross, net, cuts: lines };
  });

  // Big-fish side pot: everyone who paid into it; the heaviest single fish among them takes it all.
  let side = null;
  if (sidePot && (d.sidePotFee || 0) > 0) {
    const inPot = new Set([...ent.entries()].filter(([, e]) => e.sidePotPaid).map(([u]) => u));
    const amount = (d.sidePotFee || 0) * inPot.size;
    const best = sideEntries.filter(e => inPot.has(e.uid) && e.weightOz > 0)
      .sort((a, b) => b.weightOz - a.weightOz || a.caughtAt - b.caughtAt)[0] || null;
    side = { amount, players: inPot.size, fish: best };
    if (best && amount > 0) {
      const { net, lines } = split(amount, best.uid, best, d);
      items.push({ payee: { uid: best.uid }, amount: net, why: "big-fish side pot" });
      for (const l of lines) items.push({ payee: l.payee, amount: l.amount, why: `${l.role} for the side pot` });
    }
  }

  // One line per person, rounded; whatever rounding leaves over goes to the winner.
  const by = new Map();
  for (const it of items) {
    const k = payeeKey(it.payee);
    if (!by.has(k)) by.set(k, { key: k, payee: it.payee, raw: 0, why: [], winner: false });
    const p = by.get(k);
    p.raw += it.amount; p.why.push(`${fmtMoney(it.amount)} ${it.why}`); p.winner = p.winner || !!it.winner;
  }
  const payees = [...by.values()].map(p => ({ ...p, amount: roundAmt(p.raw, d.roundTo || 0) }));
  const total = pot + (side && side.fish ? side.amount : 0);
  const paidOut = payees.reduce((s, p) => s + p.amount, 0);
  const remainder = Math.round((total - paidOut) * 100) / 100;
  const winner = payees.find(p => p.winner);
  let unclaimed = 0;
  if (winner && remainder) { winner.amount = Math.round((winner.amount + remainder) * 100) / 100; winner.why.push(`${fmtMoney(remainder)} rounding`); }
  else if (remainder > 0) unclaimed = remainder; // nobody qualifies yet (e.g. no paid entrant has a counting fish)
  payees.sort((a, b) => b.amount - a.amount);
  return { pot, paidCount, places, side, payees, total, unclaimed };
}

const ordinal = n => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || "th");
export { ordinal };

/* All of a derby's money: with categories, each pays its share of the pot by its own place split, and the mystery
   weight (when it has a share) goes to the closest fish once the weight is known (mysteryOz). Same shape as
   payouts(), with one line per person across all of it, plus `parts`: each category's (and the mystery's) share. */
export function derbyMoney(d, catches, entrants, { mysteryOz = null } = {}) {
  const ent = entrants || new Map();
  const counted = derbyEntries(d, catches, ent).filter(e => !e.problem);
  const boards = categoryBoards(d, catches, ent);
  if (!categoriesOf(d)) return { ...payouts(d, boards[0].rows, ent, counted), parts: [] };
  const all = boards.map((b, i) => ({ name: b.cat.name, pct: b.cat.pct || 0, m: payouts(b.d, b.rows, ent, counted, { share: (b.cat.pct || 0) / 100, label: b.cat.name, sidePot: i === 0 }) }));
  const paidCount = all[0].m.paidCount, fullPot = (d.entryFee || 0) * paidCount + (d.addedMoney || 0);
  const by = new Map(), add = (key, payee, amount, why, winner) => {
    if (!by.has(key)) by.set(key, { key, payee, amount: 0, raw: 0, why: [], winner: false });
    const p = by.get(key);
    p.amount = Math.round((p.amount + amount) * 100) / 100; p.raw += amount; p.why.push(...why); p.winner = p.winner || winner;
  };
  for (const { m } of all) for (const p of m.payees) add(p.key, p.payee, p.amount, p.why, p.winner);
  let unclaimed = all.reduce((n, { m }) => n + m.unclaimed, 0), mysteryPending = 0;
  const parts = all.map(({ name, pct, m }) => ({ name, pct, pot: m.pot, places: m.places, unclaimed: m.unclaimed }));
  if (d.mystery && d.mysteryPct > 0) {
    const amount = Math.round(fullPot * d.mysteryPct) / 100;
    const eligible = d.unpaidCanWin ? counted : counted.filter(e => (ent.get(e.uid) || {}).paid);
    const top = mysteryOz ? mysteryBoard(d, eligible, null, mysteryOz)[0] : null;
    if (top && amount > 0) add("u:" + top.uid, { uid: top.uid }, amount, [`${fmtMoney(amount)} mystery weight`], false);
    else if (mysteryOz) unclaimed += amount;
    else mysteryPending = amount;
    parts.push({ name: "🎯 Mystery weight", pct: d.mysteryPct, pot: amount, places: top ? [{ place: 1, uid: top.uid, net: amount }] : [], unclaimed: top ? 0 : amount });
  }
  const payees = [...by.values()].sort((a, b) => b.amount - a.amount);
  const side = all[0].m.side;
  return { pot: fullPot, paidCount, places: all[0].m.places, side, payees, total: fullPot + (side && side.fish ? side.amount : 0),
    unclaimed: Math.round(unclaimed * 100) / 100, mysteryPending, parts };
}
