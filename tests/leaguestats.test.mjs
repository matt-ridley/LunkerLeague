// Unit tests for the league stats page's numbers. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodCatches, periodRange, anglerDays, headline, bigFish, recordStats, biggestPbJump, averageSizes, heatmap, monthCompare,
  bestDay, busiestWeek, weekendSplit, earlyAndLate, firstAndLast, pace, byMoon, weatherStats, lureBoard, hotLure, pairings,
  techniqueMix, depthProfile, topBoxItem, speciesTable, rarest, debuts, diversity, spotBoard, boatBoard, boatOrShore,
  derbyStats, h2hStats, betStats, crownStats, reactionStats, commentStats, outingStats, skunkStats, badgeStats, goalStats,
  milestone, superlatives,
} from "../js/leaguestats.js";
import { DEFAULTS } from "../js/derby.js";
import { LATE_HOURS } from "../js/h2h.js";

const H = 3600e3, DAY = 24 * H;
const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();
let n = 0;
const fish = (uid, species, extra = {}) => ({ id: `c${++n}`, uid, species, caughtAt: at(2026, 5, 6), createdAt: at(2026, 5, 6), released: false, ...extra });

test("periods: this season's league catches, every league catch, or every catch; disqualified ones never", () => {
  const list = [
    fish("amy", "Walleye", { caughtAt: at(2026, 5, 1) }), fish("amy", "Walleye", { caughtAt: at(2025, 5, 1) }),
    fish("amy", "Walleye", { caughtAt: at(2010, 5, 1), past: true }), fish("amy", "Walleye", { caughtAt: at(2026, 5, 2), dq: true }),
  ];
  assert.equal(periodCatches(list, "season", 2026).length, 1);
  assert.equal(periodCatches(list, "career", 2026).length, 2);
  assert.equal(periodCatches(list, "alltime", 2026).length, 3);
  assert.deepEqual(periodRange("career", 2026), { from: 0, to: Infinity });
  assert.equal(periodRange("season", 2026).from, at(2026, 0, 1, 0));
});

test("headline: fish (stringers count their fish), weight and length of single fish, release rate, anglers and days out", () => {
  const pool = [
    fish("amy", "Walleye", { weightOz: 32, lengthIn: 20, released: true, caughtAt: at(2026, 5, 1) }),
    fish("amy", "Perch", { fishCount: 10, weightOz: 99, caughtAt: at(2026, 5, 1, 15) }),
    fish("bo", "Pike", { lengthIn: 30, released: true, caughtAt: at(2026, 5, 2) }),
  ];
  const range = periodRange("season", 2026), now = at(2026, 6, 1);
  const days = anglerDays(["amy", "bo", "cy"], { catches: pool, skunks: [{ uid: "cy", day: "2026-06-03" }], range, now });
  const h = headline(pool, { members: ["amy", "bo", "cy"], days });
  assert.deepEqual([h.fish, h.catches, h.weightOz, h.weighed, h.lengthIn, h.lengthN, h.species], [12, 3, 32, 1, 50, 2, 3]);
  assert.deepEqual([h.released, h.releasedPct, h.active, h.members, h.daysOut], [2, 17, 2, 3, 3]);
});

test("big fish: the biggest, and the top heaviest and longest without stringers", () => {
  const a = fish("amy", "Walleye", { weightOz: 50, lengthIn: 20 }), b = fish("bo", "Pike", { weightOz: 40, lengthIn: 35 });
  const s = fish("cy", "Perch", { fishCount: 5, weightOz: 400 });
  const r = bigFish([a, b, s], 1);
  assert.equal(r.biggest, a);
  assert.deepEqual([r.heaviest, r.longest], [[a], [b]]);
});

test("record boards: set, broken, the latest broken, the longest standing and the closest call", () => {
  const w1 = fish("amy", "Walleye", { weightOz: 40, caughtAt: at(2026, 4, 1) });
  const w2 = fish("bo", "Walleye", { weightOz: 40.5, caughtAt: at(2026, 4, 10) });
  const w3 = fish("amy", "Walleye", { weightOz: 60, caughtAt: at(2026, 4, 20) });
  const p1 = fish("cy", "Pike", { lengthIn: 30, caughtAt: at(2026, 1, 1) });
  const old = fish("cy", "Bass", { weightOz: 30, caughtAt: at(2025, 1, 1) });
  const all = [w1, w2, w3, p1, old];
  const r = recordStats(all, "season", 2026, at(2026, 6, 1));
  assert.deepEqual([r.set, r.broken], [4, 2]);
  assert.equal(r.latest.brokenBy, w3);
  assert.equal(r.standing.c, p1);
  assert.equal(r.closest.brokenBy, w2);
  assert.equal(r.closest.margin, 0.5);
  // Career: last season's bass record is on the boards too, and has stood the longest.
  const c = recordStats(all, "career", 2026, at(2026, 6, 1));
  assert.equal(c.set, 5);
  assert.equal(c.standing.c, old);
});

test("PB jump: the biggest improvement, as a share of the old best, counting logbook fish as the old best", () => {
  const old = fish("amy", "Walleye", { weightOz: 20, caughtAt: at(2010, 1, 1), past: true });
  const pb = fish("amy", "Walleye", { weightOz: 40, caughtAt: at(2026, 3, 1) });
  const small = fish("bo", "Pike", { lengthIn: 30, caughtAt: at(2026, 1, 1) }), longer = fish("bo", "Pike", { lengthIn: 33, caughtAt: at(2026, 2, 1) });
  const all = [old, pb, small, longer];
  const j = biggestPbJump(all, periodCatches(all, "season", 2026));
  assert.deepEqual([j.c, j.prev, j.field, j.gain, j.pct], [pb, old, "weightOz", 20, 100]);
  assert.equal(biggestPbJump(all, [small]), null);
});

test("average sizes: species with 2+ weighed or measured fish", () => {
  const r = averageSizes([fish("a", "Walleye", { weightOz: 30 }), fish("b", "Walleye", { weightOz: 41, lengthIn: 20 }), fish("a", "Pike", { lengthIn: 30 })]);
  assert.deepEqual(r, [{ species: "Walleye", fish: 2, avgWeightOz: 35.5, weighed: 2, avgLengthIn: null, measured: 1 }]);
});

test("when the fish bite: heatmap, best day, busiest week, weekends, early and night, first and latest", () => {
  // 2026-Jun-06 is a Saturday.
  const sat5 = fish("amy", "Walleye", { caughtAt: at(2026, 5, 6, 5) }), sat22 = fish("bo", "Walleye", { caughtAt: at(2026, 5, 6, 22), fishCount: 3 });
  const tue = fish("bo", "Pike", { caughtAt: at(2026, 5, 9, 12) }), next = fish("amy", "Pike", { caughtAt: at(2026, 5, 16, 12) });
  const pool = [tue, sat5, sat22, next];
  const hm = heatmap(pool);
  assert.equal(hm.cells[5][0], 1);   // Saturday, early
  assert.equal(hm.cells[5][5], 3);   // Saturday, night
  assert.equal(hm.cells[1][2], 2);   // two Tuesdays, midday
  assert.equal(hm.max, 3);
  const d = bestDay(pool);
  assert.deepEqual([d.day, d.fish, d.anglers], ["2026-06-06", 4, ["amy", "bo"]]);
  assert.deepEqual(busiestWeek(pool), { from: at(2026, 5, 1, 0), fish: 4 });
  assert.deepEqual(weekendSplit(pool), { weekend: 4, weekday: 2 });
  const e = earlyAndLate(pool);
  assert.deepEqual([e.total, e.early, e.earlyTop, e.night, e.nightTop], [6, 1, { uid: "amy", n: 1 }, 3, { uid: "bo", n: 3 }]);
  assert.deepEqual(firstAndLast(pool), { first: sat5, last: next });
});

test("by month against last season, and the pace by the same date", () => {
  const all = [fish("a", "W", { caughtAt: at(2026, 2, 1) }), fish("a", "W", { caughtAt: at(2025, 2, 1), fishCount: 4 }),
    fish("a", "W", { caughtAt: at(2025, 8, 1) }), fish("a", "W", { caughtAt: at(2026, 3, 1), dq: true })];
  const pool = periodCatches(all, "season", 2026), m = monthCompare(all, pool, "season", 2026);
  assert.equal(m.current[2], 1);
  assert.equal(m.last[2], 4);
  assert.equal(monthCompare(all, pool, "career", 2026).last, null);
  assert.deepEqual(pace(all, at(2026, 5, 1)), { year: 2026, fish: 1, last: 4, diff: -3 });
});

test("the moon and the weather on catches", () => {
  const full = fish("a", "W", { caughtAt: Date.UTC(2026, 0, 3, 12) }); // a full moon
  assert.equal(byMoon([full]).find(p => p.label === "Full moon").n, 1);
  const cold = fish("a", "W"), hot = fish("b", "W"), none = fish("c", "W");
  const weather = new Map([[cold.id, { tempC: -5, windKph: 40, pressureHpa: 1000, code: 71 }], [hot.id, { tempC: 30, windKph: 3, pressureHpa: 1030, code: 0 }]]);
  const w = weatherStats([cold, hot, none], weather);
  assert.equal(w.covered, 2);
  assert.deepEqual(w.pressure.map(b => b.n), [1, 0, 1]);
  assert.deepEqual(w.temp.map(b => b.n), [1, 0, 0, 0, 0, 1]);
  assert.deepEqual(w.wind.map(b => b.n), [1, 0, 0, 0, 1]);
  assert.deepEqual(w.sky.map(s => s.label), ["Clear", "Snow"]);
  assert.deepEqual([w.coldest.c, w.hottest.c, w.windiest.c], [cold, hot, cold]);
});

test("tackle: lures by fish and weight, hot lure, pairs, techniques, depth and the top tackle box item", () => {
  const now = at(2026, 5, 30);
  const a = fish("amy", "Walleye", { weightOz: 30, caughtAt: at(2026, 5, 20) }), b = fish("bo", "Walleye", { fishCount: 4, caughtAt: at(2026, 5, 21) });
  const c = fish("amy", "Pike", { weightOz: 100, caughtAt: at(2026, 1, 1) });
  const tackle = new Map([[a.id, { lure: "Jig ", technique: "jigging", depthFt: 12, itemId: "i1" }], [b.id, { lure: "jig", depthFt: 3, itemId: "i1" }],
    [c.id, { lure: "Spoon", technique: "trolling", depthFt: 60 }]]);
  const lures = lureBoard([a, b, c], tackle);
  assert.deepEqual(lures.map(l => [l.label, l.fish, l.weightOz, l.anglers]), [["Jig", 5, 30, 2], ["Spoon", 1, 100, 1]]);
  assert.equal(hotLure([a, b, c], tackle, now).label, "Jig");
  assert.deepEqual(pairings([a, b, c], tackle).map(p => [p.lure, p.species, p.fish]), [["Jig", "Walleye", 5], ["Spoon", "Pike", 1]]);
  // A tie goes to the one caught first: the February trolling fish.
  assert.deepEqual(techniqueMix([a, b, c], tackle), [{ label: "Trolling", n: 1 }, { label: "Jigging", n: 1 }]);
  assert.deepEqual(depthProfile([a, b, c], tackle).map(d => d.n), [4, 0, 1, 0, 0, 0, 1]);
  const box = new Map([["i1", { id: "i1", name: "Pink jig", uid: "amy" }]]);
  assert.deepEqual(topBoxItem([a, b, c], tackle, box), { item: box.get("i1"), fish: 5 });
});

test("species: table with shares and top anglers, rarest, debuts and diversity", () => {
  const all = [
    fish("amy", "Walleye", { caughtAt: at(2026, 1, 1), fishCount: 3 }), fish("bo", "Walleye", { caughtAt: at(2026, 1, 2) }),
    fish("bo", "Pike", { caughtAt: at(2026, 1, 3) }), fish("cy", "Bass", { caughtAt: at(2025, 1, 3) }),
    fish("cy", "Gar", { caughtAt: at(2010, 1, 3), past: true }),
  ];
  const pool = periodCatches(all, "season", 2026);
  assert.deepEqual(speciesTable(pool).map(r => [r.species, r.fish, r.share, r.top.uid]), [["Walleye", 4, 80, "amy"], ["Pike", 1, 20, "bo"]]);
  assert.deepEqual(rarest(pool).map(r => [r.species, r.c.uid]), [["Pike", "bo"]]);
  assert.deepEqual(debuts(all, "season", 2026).map(c => c.species), ["Pike", "Walleye"]);
  assert.deepEqual(debuts(all, "career", 2026).map(c => c.species), ["Pike", "Walleye", "Bass"]);
  assert.deepEqual(debuts(all, "alltime", 2026).map(c => c.species), ["Pike", "Walleye", "Bass", "Gar"]);
  assert.deepEqual(diversity(pool), [{ uid: "bo", n: 2 }, { uid: "amy", n: 1 }]);
});

test("places: shared spots within 250 m count as one; boats and boat or shore", () => {
  const a = fish("amy", "W", { boatId: "b1", weightOz: 20 }), b = fish("bo", "W", { boatId: "b1", weightOz: 30 }), c = fish("cy", "W"), d = fish("cy", "W");
  const spots = new Map([[a.id, { lat: 45, lng: -80, shared: true, name: "North bay" }], [b.id, { lat: 45.001, lng: -80, shared: true }],
    [c.id, { lat: 46, lng: -80, shared: true }], [d.id, { lat: 45, lng: -80, shared: false }]]);
  const s = spotBoard([a, b, c, d], spots);
  assert.deepEqual(s.map(x => [x.name, x.fish, x.anglers]), [["North bay", 2, 2], ["", 1, 1]]);
  const fleet = new Map([["b1", { id: "b1", name: "Reel Deal" }]]);
  const boats = boatBoard([a, b, c], fleet);
  assert.deepEqual(boats.map(x => [x.boat.name, x.fish, x.crew, x.biggest]), [["Reel Deal", 2, 2, b]]);
  assert.deepEqual(boatOrShore([a, b, c]), { boat: 2, other: 1 });
});

test("derbies: finished ones in the period, wins, podiums, the pot and the biggest payout", () => {
  const start = at(2026, 5, 6, 6), end = at(2026, 5, 6, 18), now = end + 25 * H;
  const d = { ...DEFAULTS, id: "d1", name: "June Classic", start, end, entryFee: 10, payoutPcts: [100], roundTo: 0 };
  const test2 = { ...d, id: "d2", testing: true };
  const catches = [fish("amy", "W", { weightOz: 50, caughtAt: start + H, createdAt: start + H, derbyId: "d1" }),
    fish("bo", "W", { weightOz: 40, caughtAt: start + 2 * H, createdAt: start + 2 * H, derbyId: "d1" })];
  const entrants = new Map([["d1", new Map([["amy", { paid: true }], ["bo", { paid: true }]])]]);
  const r = derbyStats({ derbies: new Map([["d1", d], ["d2", test2]]), entrants, catches, range: periodRange("season", 2026), now });
  assert.deepEqual([r.count, r.entries, r.pot], [1, 2, 20]);
  assert.deepEqual(r.wins, [{ uid: "amy", n: 1 }]);
  assert.deepEqual(r.podiums.map(p => p.uid), ["amy", "bo"]);
  assert.deepEqual([r.biggest.uid, r.biggest.amount], ["amy", 20]);
  assert.equal(derbyStats({ derbies: new Map([["d1", d]]), entrants, catches, range: periodRange("season", 2026), now: end }).count, 0);
});

test("head-to-heads: streaks, the biggest stake won and the top rivalry", () => {
  const T0 = at(2026, 5, 6, 8);
  const ch = (id, from, to, day, stake = 0) => ({ id, from, to, status: "accepted", vetoed: false,
    terms: { win: "heaviest", bagSize: 5, species: [], start: T0 + day * DAY, end: T0 + day * DAY + 10 * H, stake, money: "" } });
  const won = (u, day, w) => fish(u, "W", { weightOz: w, caughtAt: T0 + day * DAY + H, createdAt: T0 + day * DAY + H });
  const challenges = new Map([["h1", ch("h1", "amy", "bo", 0, 3)], ["h2", ch("h2", "bo", "amy", 1)], ["h3", ch("h3", "amy", "cy", 2, 8)]]);
  const catches = [won("amy", 0, 50), won("bo", 0, 40), won("amy", 1, 50), won("bo", 1, 20), won("cy", 2, 60), won("amy", 2, 10)];
  const r = h2hStats({ challenges, catches, range: periodRange("season", 2026), now: T0 + 4 * DAY + LATE_HOURS * H });
  assert.deepEqual([r.count, r.ties], [3, 0]);
  assert.deepEqual(r.streak, { uid: "amy", n: 2 });
  assert.deepEqual([r.stake.uid, r.stake.n], ["cy", 8]);
  assert.deepEqual([r.rivalry.a, r.rivalry.b, r.rivalry.n, r.rivalry.aWins, r.rivalry.bWins], ["amy", "bo", 2, 2, 0]);
});

test("bets: settled bets, the pot, the most-backed side and the biggest upset", () => {
  const T0 = at(2026, 5, 6, 8), now = T0 + 3 * DAY;
  const sides = { id: "b1", title: "Will anyone land a 10 lb pike?", organiserUid: "amy", kind: "sides", sides: ["Yes", "No"],
    rule: { win: "called" }, result: { winners: [], side: 0, at: T0 + 10 * H }, open: true, invited: [], start: T0, end: T0 + 24 * H, buyIn: 5, roundTo: 0 };
  const players = new Map([["b1", new Map([["amy", { in: true, side: 0 }], ["bo", { in: true, side: 1 }], ["cy", { in: true, side: 1 }], ["di", { in: true, side: 1 }]])]]);
  const r = betStats({ bets: new Map([["b1", sides]]), betPlayers: players, catches: [], range: periodRange("season", 2026), now });
  assert.deepEqual([r.count, r.washes, r.pot, r.players], [1, 0, 20, 4]);
  assert.deepEqual([r.mostBacked.label, r.mostBacked.n], ["No", 3]);
  assert.deepEqual([r.upset.label, r.upset.n, r.upset.of], ["Yes", 1, 4]);
});

test("crowns: steals (not first claims or season ends), the most contested and the latest", () => {
  const crown = id => ({ id, name: id, icon: "👑" });
  const seasons = new Map([[2026, [
    { crown: crown("A"), history: [{ at: 1, uid: "amy", from: null }, { at: 5, uid: "bo", from: "amy" }, { at: 9, uid: "amy", from: "bo" }] },
    { crown: crown("B"), history: [{ at: 2, uid: "cy", from: null }, { at: 7, uid: "bo", from: "cy" }] },
  ]], [2025, [{ crown: crown("B"), history: [{ at: 0, uid: "cy", from: null }, { at: 3, uid: null, from: "cy", ended: true }] }]]]);
  const r = crownStats(seasons, "season", 2026);
  assert.deepEqual([r.steals, r.contested.crown.id, r.contested.n, r.latest.at], [3, "A", 2, 9]);
  assert.equal(crownStats(seasons, "career", 2026).steals, 3);
});

test("social: reactions, comments, outings and skunks", () => {
  const a = fish("amy", "W", { caughtAt: at(2026, 5, 6, 9) }), b = fish("bo", "W", { caughtAt: at(2026, 5, 6, 10) });
  const reactions = new Map([[a.id, new Map([["bo", ["🔥", "😮"]], ["cy", ["🔥"]], ["amy", ["👍"]]])], [b.id, new Map([["cy", ["😂"]]])]]);
  const r = reactionStats([a, b], reactions);
  assert.deepEqual([r.total, r.top.c, r.top.n, r.byEmoji[0]], [5, a, 4, { emoji: "🔥", n: 2 }]);
  assert.deepEqual(r.givers, [{ uid: "bo", n: 2 }, { uid: "cy", n: 2 }]);
  const cm = commentStats([a, b], new Map([[b.id, [{ uid: "amy" }, { uid: "cy" }, { uid: "amy" }]]]));
  assert.deepEqual([cm.total, cm.top.c, cm.commenters[0]], [3, b, { uid: "amy", n: 2 }]);

  const t = { id: "t1", uid: "amy", title: "Saturday", at: at(2026, 5, 6, 8), endAt: at(2026, 5, 6, 14), kind: "shore" };
  const rsvps = new Map([["t1", new Map([["amy", { answer: "in" }], ["bo", { answer: "in" }], ["cy", { answer: "in" }], ["di", { answer: "maybe" }]])]]);
  const noShows = new Map([["t1", new Map([["cy", { by: "amy", at: 1 }]])]]);
  const o = outingStats({ trips: new Map([["t1", t]]), rsvps, noShows, catches: [a, b], range: periodRange("season", 2026), now: at(2026, 5, 7) });
  assert.deepEqual([o.count, o.said, o.showed, o.rate, o.fish, o.biggest.n, o.reliable.uid], [1, 3, 2, 67, 2, 2, "amy"]);

  const days = new Map([["amy", { daysOut: 4, skunkDays: 2, days: [{ skunk: true }, { skunk: true }, { skunk: false, day: "2026-06-06", fish: 3 }, { skunk: false }] }],
    ["bo", { daysOut: 2, skunkDays: 1, days: [{ skunk: true }, { skunk: false, day: "2026-06-01", fish: 1 }] }]]);
  assert.deepEqual(skunkStats(days), { daysOut: 6, skunkDays: 3, rate: 50, drought: { uid: "amy", n: 2, day: "2026-06-06", fish: 3 } });
});

test("badges, goals and milestones", () => {
  const badge = (id, name) => ({ id, name, icon: "🏅" });
  const list = [
    { uid: "amy", badge: badge("a", "Alpha"), at: at(2026, 1, 1), season: 2026 }, { uid: "bo", badge: badge("a", "Alpha"), at: at(2026, 1, 2), season: 2026 },
    { uid: "amy", badge: badge("z", "Zed"), at: at(2026, 1, 3) }, { uid: "cy", badge: badge("a", "Alpha"), at: at(2025, 1, 1), season: 2025 },
  ];
  const r = badgeStats(list, "season", 2026);
  assert.deepEqual([r.count, r.top, r.rarest.badge.id, r.rarest.owners], [3, { uid: "amy", n: 2 }, "z", ["amy"]]);
  assert.equal(badgeStats(list, "career", 2026).count, 4);

  const goal = { id: "g1", uid: "amy", kind: "fish", target: 2, from: at(2026, 0, 1, 0), to: at(2026, 11, 31, 23), createdAt: at(2026, 0, 2) };
  const g = goalStats([goal], { catches: [fish("amy", "W", { caughtAt: at(2026, 2, 1) }), fish("amy", "W", { caughtAt: at(2026, 2, 2) })], now: at(2026, 5, 1) }, periodRange("season", 2026));
  assert.deepEqual(g, { reached: 1, anglers: 1, set: 1 });

  assert.deepEqual(milestone(870), { fish: 870, next: 1000, prev: 500, pct: 87 });
  assert.deepEqual(milestone(0), { fish: 0, next: 100, prev: 0, pct: 0 });
});

test("superlatives: only anglers who qualify", () => {
  const pool = [
    fish("amy", "W", { weightOz: 90, released: true }), fish("amy", "W", { weightOz: 80, released: true }), fish("amy", "W", { weightOz: 10, released: true }),
    fish("amy", "W", { released: true }), fish("amy", "W", { released: false }), fish("bo", "W", { fishCount: 20 }),
  ];
  const days = new Map([["amy", { daysOut: 5 }], ["bo", { daysOut: 3 }]]);
  const tackle = new Map([[pool[0].id, { lure: "Jig" }], [pool[1].id, { lure: "Spoon" }]]);
  const s = Object.fromEntries(superlatives(pool, { days, tackle }).map(x => [x.id, [x.uid, x.n]]));
  assert.deepEqual(s, { grinder: ["amy", 5], sniper: ["bo", 6.7], heavyweight: ["amy", 60], saint: ["amy", 80], magnet: ["amy", 2], tinkerer: ["amy", 2] });
});
