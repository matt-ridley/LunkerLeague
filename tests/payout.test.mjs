// Unit tests for derby payouts. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { payouts, fmtMoney, ordinal, hasMoney, derbyMoney } from "../js/payout.js";
import { DEFAULTS } from "../js/derby.js";

const row = (uid, score, fish) => ({ uid, score, fish: [{ uid, weightOz: score, caughtAt: 1, ...fish }] });
const ent = (paid, unpaid = [], side = []) => new Map([...paid.map(u => [u, { paid: true, sidePotPaid: side.includes(u) }]),
  ...unpaid.map(u => [u, { paid: false, sidePotPaid: side.includes(u) }])]);
const amounts = r => Object.fromEntries(r.payees.map(p => [p.key, p.amount]));

test("the plan's example: $20 x 6 paid, 70/30, 10% captain, 5% net man, guest captain, unpaid skipped", () => {
  const d = { entryFee: 20, payoutPcts: [70, 30], captainPct: 10, netmanPct: 5, roundTo: 1, unpaidCanWin: false };
  const rows = [
    row("unpaid", 200, {}),                                                   // biggest fish, but didn't pay
    row("amy", 150, { captain: { guest: "Captain Ray" }, netman: { uid: "bo" } }),
    row("cy", 120, { captain: { uid: "cy" }, netman: { uid: "cy" } }),         // did it all himself: no cuts
  ];
  const r = payouts(d, rows, ent(["amy", "bo", "cy", "di", "ed", "fy"], ["unpaid"]));
  assert.equal(r.pot, 120);
  assert.equal(r.paidCount, 6);
  assert.deepEqual(r.places.map(p => [p.place, p.uid, p.gross]), [[1, "amy", 84], [2, "cy", 36]]);
  // amy: 84 - 8.40 captain - 4.20 net = 71.40 -> $71; Ray $8; bo $4; cy $36. Rounding left over: 120 - 119 = $1 to amy.
  assert.deepEqual(amounts(r), { "u:amy": 72, "u:cy": 36, "g:captain ray": 8, "u:bo": 4 });
  assert.equal(r.payees.reduce((s, p) => s + p.amount, 0), 120);
  assert.equal(r.unclaimed, 0);
});

test("unpaid anglers can win when the derby allows it", () => {
  const d = { entryFee: 10, payoutPcts: [100], unpaidCanWin: true };
  const r = payouts(d, [row("unpaid", 200, {}), row("amy", 100, {})], ent(["amy"], ["unpaid"]));
  assert.deepEqual(amounts(r), { "u:unpaid": 10 });
});

test("places nobody qualifies for go to 1st; added money joins the pot", () => {
  const d = { entryFee: 10, addedMoney: 50, payoutPcts: [50, 30, 20] };
  const r = payouts(d, [row("amy", 100, {})], ent(["amy", "bo"]));
  assert.equal(r.pot, 70);
  assert.deepEqual(amounts(r), { "u:amy": 70 });
});

test("with nobody qualifying, the money is reported as unclaimed", () => {
  const r = payouts({ entryFee: 10, payoutPcts: [100] }, [], ent(["amy", "bo"]));
  assert.equal(r.unclaimed, 20);
  assert.equal(r.payees.length, 0);
});

test("big-fish side pot: only those who paid into it; heaviest single fish takes it, crew cuts apply", () => {
  const d = { entryFee: 0, sidePotFee: 5, payoutPcts: [100], netmanPct: 10, roundTo: 0 };
  const side = [
    { uid: "amy", weightOz: 300, caughtAt: 2 },                               // not in the side pot
    { uid: "bo", weightOz: 250, caughtAt: 3, netman: { uid: "cy" } },
    { uid: "cy", weightOz: 250, caughtAt: 4 },
  ];
  const r = payouts(d, [], ent(["amy", "bo", "cy"], [], ["bo", "cy"]), side);
  assert.equal(r.side.amount, 10);
  assert.equal(r.side.fish.uid, "bo");                                         // tie goes to the earlier catch
  assert.deepEqual(amounts(r), { "u:bo": 9, "u:cy": 1 });
});

test("rounding to $5 and to the cent", () => {
  const rows = [row("amy", 100, {}), row("bo", 90, {}), row("cy", 80, {})];
  const five = payouts({ entryFee: 15, payoutPcts: [50, 30, 20], roundTo: 5 }, rows, ent(["amy", "bo", "cy"]));
  // 22.50 / 13.50 / 9.00 round to 25 / 15 / 10 ($5 too much), and the rounding difference comes off 1st place.
  assert.deepEqual(amounts(five), { "u:amy": 20, "u:bo": 15, "u:cy": 10 });
  assert.equal(five.payees.reduce((s, p) => s + p.amount, 0), 45);
  const cents = payouts({ entryFee: 10, payoutPcts: [70, 30], captainPct: 7.5, roundTo: 0 }, [row("amy", 100, { captain: { uid: "bo" } }), row("bo", 50, {})], ent(["amy", "bo", "cy"]));
  // $21 - 7.5% captain = $19.425 and $9 + $1.575 = $10.575: half cents, and the total stays exactly $30.
  assert.deepEqual(amounts(cents), { "u:amy": 19.42, "u:bo": 10.58 });
  assert.equal(Math.round(cents.payees.reduce((s, p) => s + p.amount, 0) * 100) / 100, 30);
});

test("helpers", () => {
  assert.equal(fmtMoney(71.4), "$71.40");
  assert.equal(fmtMoney(120), "$120");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  assert.equal(hasMoney({ entryFee: 0, sidePotFee: 0 }), false);
  assert.equal(hasMoney({ sidePotFee: 5 }), true);
});

test("categories split the pot by share, each by its own place split; the mystery share goes to the closest fish", () => {
  const H = 3600e3;
  const d = { ...DEFAULTS, id: "d1", start: 0, end: 10 * H, entryFee: 20, roundTo: 1, mystery: true, mysteryPct: 20, categories: [
    { id: "c1", name: "Big Bass", species: ["Bass"], scoring: "heaviest", pct: 50, payoutPcts: [70, 30] },
    { id: "c2", name: "Big Walleye", species: ["Walleye"], scoring: "heaviest", pct: 30, payoutPcts: [100] },
  ] };
  const f = (uid, species, weightOz) => ({ id: uid + species, uid, species, weightOz, lengthIn: null, caughtAt: H, createdAt: H, derbyId: "d1" });
  const catches = [f("amy", "Bass", 60), f("bo", "Bass", 50), f("cy", "Walleye", 40), f("bo", "Walleye", 35)];
  const entrants = ent(["amy", "bo", "cy", "di", "ed"]); // $100 pot
  const before = derbyMoney(d, catches, entrants);
  assert.equal(before.pot, 100);
  assert.deepEqual(before.parts.map(p => [p.name, p.pot]), [["Big Bass", 50], ["Big Walleye", 30], ["🎯 Mystery weight", 20]]);
  assert.equal(before.mysteryPending, 20); // weight not known yet
  // Bass: amy $35, bo $15. Walleye: cy $30. Mystery (36 oz): bo's 35 oz walleye is closest.
  const after = derbyMoney(d, catches, entrants, { mysteryOz: 36 });
  assert.deepEqual(amounts(after), { "u:amy": 35, "u:bo": 35, "u:cy": 30 });
  assert.equal(after.payees.reduce((s, p) => s + p.amount, 0), 100);
  assert.ok(after.payees.find(p => p.key === "u:bo").why.includes("$15 Big Bass: 2nd place"));
});
