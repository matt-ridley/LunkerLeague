// Unit tests for badges. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { BADGES, badgeTimeline, badgesFor } from "../js/badges.js";
import { rankings, DEFAULT_SCORING } from "../js/rank.js";
import { crownStandings } from "../js/crowns.js";
import { DEFAULTS } from "../js/derby.js";

const H = 3600e3, DAY = 24 * H;
const at = (m, d, h = 10) => new Date(2026, m, d, h).getTime();
let n = 0;
const fish = (uid, species, t, extra = {}) => ({ id: "c" + ++n, uid, species, weightOz: null, lengthIn: null, caughtAt: t, ...extra });
const NOW = at(11, 31, 23);
const ids = (uid, input) => badgesFor(uid, { derbies: [], entrants: new Map(), now: NOW, ...input }).map(b => b.id);
const has = (uid, input, id) => ids(uid, input).includes(id);
const whenEarned = (uid, input, id) => (badgeTimeline({ derbies: [], entrants: new Map(), now: NOW, ...input }).find(b => b.uid === uid && b.badge.id === id) || {}).at;

test("56 badges with unique ids, the six originals kept", () => {
  assert.equal(BADGES.length, 56);
  assert.equal(new Set(BADGES.map(b => b.id)).size, 56);
  for (const id of ["first", "ten", "champ", "release", "owl", "net"]) assert.ok(BADGES.some(b => b.id === id));
});

test("catch totals count every fish on a stringer; a big day is 10 fish in one day", () => {
  const catches = [fish("amy", "Perch", at(5, 1), { fishCount: 48, limit: true }), fish("amy", "Perch", at(5, 2), { fishCount: 2, limit: false })];
  assert.ok(has("amy", { catches }, "fish50"));
  assert.equal(whenEarned("amy", { catches }, "fish50"), at(5, 2));
  assert.ok(has("amy", { catches }, "bigDay"));
  assert.ok(!has("amy", { catches }, "fish100"));
});

test("species: five, grand slam in a day, trophy case needs measured fish", () => {
  const sp = ["Walleye", "Pike", "Bass", "Perch", "Crappie"];
  const catches = sp.map((s, i) => fish("amy", s, at(5, 1, 6 + i)));
  assert.ok(has("amy", { catches }, "species5"));
  assert.ok(has("amy", { catches }, "grandSlam"));
  assert.ok(!has("amy", { catches }, "trophyCase"));
  const measured = Array.from({ length: 10 }, (_, i) => fish("bo", "Sp" + i, at(5, 1 + i), { lengthIn: 10 }));
  assert.ok(has("bo", { catches: measured }, "trophyCase"));
  assert.ok(!has("bo", { catches: measured }, "grandSlam")); // one species a day
});

test("size badges ignore stringers; tiny terror; PB machine counts beating your own best", () => {
  const catches = [fish("amy", "Pike", at(5, 1), { weightOz: 330, lengthIn: 37 }), fish("amy", "Perch", at(5, 2), { weightOz: 999, fishCount: 40, limit: true }),
    fish("amy", "Minnow", at(5, 3), { lengthIn: 3.5 })];
  for (const id of ["lb5", "lb10", "lb20", "in20", "in36", "tiny"]) assert.ok(has("amy", { catches }, id), id);
  const pbs = [10, 11, 12, 13, 14, 15].map((w, i) => fish("bo", "Bass", at(5, 1 + i), { weightOz: w }));
  assert.equal(whenEarned("bo", { catches: pbs }, "pbMachine"), at(5, 6)); // the 5th time it was beaten
});

test("records: setter, breaker, untouchable after 30 days, double record", () => {
  const catches = [fish("amy", "Walleye", at(0, 1), { weightOz: 80, lengthIn: 20 }), fish("bo", "Walleye", at(0, 10), { weightOz: 90 })];
  assert.ok(has("amy", { catches }, "recordSet"));
  assert.ok(has("amy", { catches }, "doubleRecord")); // both records Jan 1 to Jan 10
  assert.ok(!has("amy", { catches }, "recordBreak"));
  assert.ok(has("bo", { catches }, "recordBreak"));
  assert.equal(whenEarned("amy", { catches }, "untouchable"), at(0, 1) + 30 * DAY); // amy keeps the length record
  assert.equal(whenEarned("bo", { catches }, "untouchable"), at(0, 10) + 30 * DAY);
});

test("limits: first, back-to-back, full stringer", () => {
  const catches = [fish("amy", "Perch", at(5, 1), { fishCount: 50, limit: true }), fish("amy", "Perch", at(5, 2), { fishCount: 30, limit: true })];
  for (const id of ["limit1", "backToBack", "fullStringer"]) assert.ok(has("amy", { catches }, id), id);
  assert.ok(!has("amy", { catches }, "limit10"));
});

test("time and season badges, and streaks", () => {
  const catches = [fish("amy", "Perch", at(0, 1, 5)), fish("amy", "Perch", at(3, 1, 12)), fish("amy", "Perch", at(6, 1)), fish("amy", "Perch", at(9, 1)),
    fish("amy", "Perch", at(9, 2)), fish("amy", "Perch", at(9, 3))];
  for (const id of ["sunrise", "lunch", "hardWater", "newYear", "seasons", "streak3"]) assert.ok(has("amy", { catches }, id), id);
  assert.equal(whenEarned("amy", { catches }, "streak3"), at(9, 3));
  assert.ok(!has("amy", { catches }, "streak7"));
  assert.ok(!has("amy", { catches }, "months"));
});

test("derby badges: first, podium, captain, money, organiser, skunked; test derbies don't count", () => {
  const d = { ...DEFAULTS, id: "d1", name: "Spring", organiserUid: "amy", start: at(4, 1, 6), end: at(4, 1, 14), syncGraceHours: 0, entryFee: 20 };
  const t = { ...d, id: "d2", testing: true };
  const ent = new Map([["d1", new Map([["amy", { paid: true }], ["bo", { paid: true }], ["cy", { paid: true }], ["di", { paid: true }]])], ["d2", new Map([["eve", {}]])]]);
  const catches = [fish("bo", "Walleye", at(4, 1, 8), { derbyId: "d1", weightOz: 90, captain: { uid: "amy" } }),
    fish("amy", "Walleye", at(4, 1, 9), { derbyId: "d1", weightOz: 80 }), fish("eve", "Walleye", at(4, 1, 9), { derbyId: "d2", weightOz: 99 })];
  const input = { catches, derbies: [d, t], entrants: ent };
  assert.ok(has("bo", input, "champ")); assert.ok(has("bo", input, "money"));
  for (const id of ["derby1", "podium", "captain", "organiser"]) assert.ok(has("amy", input, id), id);
  assert.ok(has("cy", input, "skunked"));
  assert.ok(!has("eve", input, "champ"));
  assert.ok(!has("amy", input, "money")); // winner takes all
});

test("social badges: comments, reactions given and received, trips", () => {
  const amyFish = fish("amy", "Walleye", at(5, 1));
  const comments = new Map([[amyFish.id, Array.from({ length: 50 }, (_, i) => ({ uid: "bo", at: at(5, 2) + i }))]]);
  const reactions = new Map([[amyFish.id, new Map(["bo", "cy", "di", "eve", "fay"].map((u, i) => [u, { emojis: ["🤥", "🔥"], at: at(5, 3) + i }]))]]);
  const trips = new Map([["t1", { id: "t1", uid: "amy", title: "Sat", at: at(5, 10), createdAt: at(5, 4) }]]);
  const rsvps = new Map([["t1", new Map(["bo", "cy", "di", "eve"].map((u, i) => [u, { answer: "in", at: at(5, 5) + i }]))]]);
  const input = { catches: [amyFish], comments, reactions, trips, rsvps };
  assert.ok(has("bo", input, "trashTalker"));
  assert.ok(has("amy", input, "crowdFav"));   // 10 emojis from 5 people
  assert.ok(has("amy", input, "tallTale"));   // 5 🤥
  assert.equal(whenEarned("amy", input, "tripPlanner"), at(5, 5) + 3);
  assert.ok(!has("bo", input, "alwaysIn"));
});

test("crown badges: thief, and wanderer for 5 shared spots", () => {
  const catches = [fish("amy", "Perch", at(5, 1)), fish("bo", "Perch", at(5, 2)), fish("bo", "Bass", at(5, 3))];
  const crowns = crownStandings({ catches, derbies: [], now: NOW });
  assert.ok(has("bo", { catches, crowns }, "crownThief"));
  const spotCatches = Array.from({ length: 5 }, (_, i) => fish("cy", "Perch", at(6, 1 + i), { locShared: true }));
  const spots = new Map(spotCatches.map((c, i) => [c.id, { lat: 44 + i * 0.1, lng: -79, shared: true }]));
  assert.ok(has("cy", { catches: spotCatches, spots }, "wanderer"));
});

test("each badge is worth a point, from when it was earned", () => {
  const catches = [fish("amy", "Perch", at(5, 1, 12))]; // First Fish, Lunch Break
  const rows = rankings({ catches, derbies: [], entrants: new Map(), versions: [], members: ["amy"], now: at(5, 2) });
  assert.equal(rows[0].byKind.badge, 2);
  const off = rankings({ catches, derbies: [], entrants: new Map(), members: ["amy"], now: at(5, 2),
    versions: [{ id: "v", mode: "retro", createdAt: 0, values: { ...DEFAULT_SCORING, badgePts: 0 } }] });
  assert.equal(off[0].byKind.badge, 0);
});

test("royalty and long reign only count once 3 anglers are fishing", () => {
  const solo = [fish("amy", "Perch", at(0, 1, 5), { weightOz: 10, lengthIn: 8 }), fish("amy", "Bass", at(0, 1, 6), { released: true })];
  const crowns1 = crownStandings({ catches: solo, derbies: [], now: NOW });
  assert.ok(!has("amy", { catches: solo, crowns: crowns1 }, "royalty"));
  assert.ok(!has("amy", { catches: solo, crowns: crowns1 }, "longReign"));
  const league = [...solo, fish("bo", "Perch", at(0, 5), { weightOz: 5 }), fish("cy", "Perch", at(0, 6), { weightOz: 5 })];
  const crowns3 = crownStandings({ catches: league, derbies: [], now: NOW });
  assert.equal(whenEarned("amy", { catches: league, crowns: crowns3 }, "royalty"), at(0, 6)); // cy made it 3 anglers
  assert.equal(whenEarned("amy", { catches: league, crowns: crowns3 }, "longReign"), at(0, 6) + 30 * DAY);
});
