// Unit tests for badges. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { BADGES, CAREER_BADGES, badgeTimeline, badgesFor, badgeYears } from "../js/badges.js";
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

test("86 badges with unique ids, the six originals kept", () => {
  assert.equal(BADGES.length, 86);
  assert.equal(new Set(BADGES.map(b => b.id)).size, 86);
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

test("turning up: Present!, Old Reliable and Rock Solid at 5, 10 and 15 outings shown up to; no-shows don't count", () => {
  const trips = new Map(), rsvps = new Map(), noShows = new Map();
  for (let i = 0; i < 16; i++) {
    const id = "t" + i;
    trips.set(id, { id, uid: "plan", title: id, at: at(2, 1 + i, 6), endAt: at(2, 1 + i, 12), kind: "shore" });
    rsvps.set(id, new Map([["amy", { answer: "in", at: 1 }]]));
  }
  noShows.set("t0", new Map([["amy", { by: "plan", at: at(2, 2) }]]));
  const input = { catches: [], trips, rsvps, allRsvps: rsvps, noShows };
  assert.equal(whenEarned("amy", input, "present5"), at(2, 6, 12));   // t1..t5 (t0 was a no-show)
  assert.equal(whenEarned("amy", input, "reliable10"), at(2, 11, 12));
  assert.equal(whenEarned("amy", input, "solid15"), at(2, 16, 12));
  assert.equal(whenEarned("amy", input, "noShow1"), at(2, 2));
  assert.ok(!has("amy", input, "noShow3"));
});

test("no-show badges at 1, 3 and 5 marks, and they're worth no points", () => {
  const trips = new Map(), rsvps = new Map(), noShows = new Map();
  for (let i = 0; i < 5; i++) {
    const id = "t" + i;
    trips.set(id, { id, uid: "plan", title: id, at: at(3, 1 + i, 6), endAt: at(3, 1 + i, 12), kind: "shore" });
    rsvps.set(id, new Map([["bo", { answer: "in", at: 1 }]]));
    noShows.set(id, new Map([["bo", { by: "plan", at: at(3, 1 + i, 13) }]]));
  }
  const input = { catches: [], trips, rsvps, allRsvps: rsvps, noShows };
  assert.deepEqual(["noShow1", "noShow3", "noShow5"].map(id => whenEarned("bo", input, id)), [at(3, 1, 13), at(3, 3, 13), at(3, 5, 13)]);
  for (const id of ["noShow1", "noShow3", "noShow5"]) assert.equal(BADGES.find(b => b.id === id).noPoints, true);
  const row = rankings({ ...input, derbies: [], entrants: new Map(), members: ["bo"], now: NOW }).find(r => r.uid === "bo");
  assert.equal(row.byKind.badge, 0);
  assert.equal(row.byKind.noshow, -5 * DEFAULT_SCORING.noShowPts);
});

test("boat badges: Skipper, Admiral, Big Iron, Christening, Lucky Hull and Shore Pounder", () => {
  const fleet = new Map([
    ["b1", { id: "b1", uid: "amy", name: "Lund", createdAt: at(1, 1), lengthFt: 14 }],
    ["b2", { id: "b2", uid: "amy", name: "Bass boat", createdAt: at(1, 5), hp: 225 }],
    ["b3", { id: "b3", uid: "amy", name: "Canoe", createdAt: at(1, 9), retired: true }],
  ]);
  const catches = [
    fish("bo", "Walleye", at(2, 1), { boatId: "b1", fishCount: 30 }),
    fish("amy", "Perch", at(2, 2), { boatId: "b1", fishCount: 25 }),
    ...Array.from({ length: 25 }, (_, i) => fish("cy", "Bluegill", at(4, 1, 6 + (i % 12)) + i * 60000)),
  ];
  const input = { catches, fleet };
  assert.equal(whenEarned("amy", input, "skipper"), at(1, 1));
  assert.equal(whenEarned("amy", input, "admiral"), at(1, 9));         // retired boats still count
  assert.equal(whenEarned("amy", input, "bigIron"), at(1, 5));
  assert.equal(whenEarned("bo", input, "christening"), at(2, 1));      // first fish ever from b1
  assert.ok(!has("amy", input, "christening"));
  assert.equal(whenEarned("amy", input, "luckyHull"), at(2, 2));       // 30 + 25 fish from b1, by everyone aboard
  assert.ok(has("cy", input, "shorePounder"));
  assert.ok(!has("bo", input, "shorePounder"));
});

test("record badges from boats: Record Deck for the owner, Little Boat, Big Fish for a record from a boat 14 ft or shorter", () => {
  const fleet = new Map([["b1", { id: "b1", uid: "amy", name: "Tin", createdAt: 1, lengthFt: 14 }], ["b2", { id: "b2", uid: "amy", name: "Big", createdAt: 2, lengthFt: 20 }]]);
  const catches = [
    fish("bo", "Pike", at(2, 1), { boatId: "b1", weightOz: 160 }),
    fish("cy", "Bass", at(2, 2), { boatId: "b2", weightOz: 64 }),
  ];
  const input = { catches, fleet };
  assert.equal(whenEarned("amy", input, "recordDeck"), at(2, 1));
  assert.equal(whenEarned("bo", input, "littleBoat"), at(2, 1));
  assert.ok(!has("cy", input, "littleBoat"));
});

test("outing boat badges: Water Taxi, Hitchhiker and Full House", () => {
  const trips = new Map(), rsvps = new Map(), tripBoats = new Map();
  const owners = ["o1", "o2", "o3", "o4", "o5"];
  for (let i = 0; i < 5; i++) {
    const id = "t" + i, owner = owners[i];
    trips.set(id, { id, uid: owner, title: id, at: at(5, 1 + i, 6), endAt: at(5, 1 + i, 12), kind: "boat" });
    rsvps.set(id, new Map([[owner, { answer: "in", at: 1 }], ["hiker", { answer: "in", at: 1, boat: owner, seatAt: 1 }],
      ["x" + i, { answer: "in", at: 1, boat: owner, seatAt: 2 }]]));
    tripBoats.set(id, new Map([[owner, { seats: 2, at: 1 }]]));
  }
  // o1 takes 2 riders on 5 more outings: 2 + 10 seats given
  for (let i = 0; i < 4; i++) {
    const id = "u" + i;
    trips.set(id, { id, uid: "o1", title: id, at: at(6, 1 + i, 6), endAt: at(6, 1 + i, 12), kind: "boat" });
    rsvps.set(id, new Map([["o1", { answer: "in", at: 1 }], ["p", { answer: "in", at: 1, boat: "o1", seatAt: 1 }], ["q", { answer: "in", at: 1, boat: "o1", seatAt: 2 }]]));
    tripBoats.set(id, new Map([["o1", { seats: 3, at: 1 }]]));
  }
  const input = { catches: [], trips, rsvps, allRsvps: rsvps, tripBoats };
  assert.equal(whenEarned("hiker", input, "hitchhiker"), at(5, 5, 12));
  assert.equal(whenEarned("o1", input, "fullHouse"), at(5, 1, 12));
  assert.equal(whenEarned("o1", input, "waterTaxi"), at(6, 4, 12));     // 2 + 2 + 2 + 2 + 2 = 10th seat on u3
  assert.ok(!has("o1", input, "hitchhiker"));
});

test("season badges start again every season and can be earned again; career badges are earned once", () => {
  const y = (yr, m, d) => new Date(yr, m, d, 10).getTime();
  const ten = (uid, yr) => Array.from({ length: 10 }, (_, i) => fish(uid, "Perch", y(yr, 5, 1 + i)));
  const catches = [...ten("amy", 2026), ...ten("amy", 2027).slice(0, 9), fish("amy", "Perch", y(2027, 7, 1))];
  const now = y(2027, 11, 1), tl = badgeTimeline({ catches, derbies: [], entrants: new Map(), now });
  const of = id => tl.filter(b => b.uid === "amy" && b.badge.id === id);
  assert.deepEqual(of("fish10").map(b => b.season), [2026, 2027]);        // Ten Fish, once a season
  assert.equal(of("fish10")[1].at, y(2027, 7, 1));                          // the 10th fish of 2027
  assert.deepEqual(of("first").map(b => b.season), [undefined]);            // First Fish: career, once
  assert.equal(of("fish50").length, 0);                                     // 20 fish over two seasons isn't 50 in one
  assert.deepEqual(badgeYears("amy", tl).get("fish10").years, [2026, 2027]);
  const input = { catches, derbies: [], entrants: new Map(), now };
  assert.ok(badgesFor("amy", input).some(b => b.id === "first"));
  assert.ok(badgesFor("amy", input, 2027).some(b => b.id === "fish10"));
  assert.ok(!badgesFor("amy", { ...input, catches: catches.slice(0, 10) }, 2027).some(b => b.id === "fish10"));
});

test("a season badge earned again is worth points again; a career badge only once", () => {
  const y = (yr, m, d) => new Date(yr, m, d, 12, 30).getTime();   // 12:30: Lunch Break
  const catches = [fish("amy", "Perch", y(2026, 5, 1)), fish("amy", "Perch", y(2027, 5, 1))];
  const rows = rankings({ catches, derbies: [], entrants: new Map(), versions: [], members: ["amy"], now: y(2027, 6, 1) });
  const labels = rows[0].events.filter(e => e.kind === "badge").map(e => e.label);
  assert.equal(labels.filter(l => l.includes("Lunch Break")).length, 2);
  assert.equal(labels.filter(l => l.includes("First Fish")).length, 1);
});

test("Bless Your Bonnet: everyone who joined in the 2026 Preseason, fish or not; Veteran after 3 official seasons", () => {
  const y = (yr, m, d) => new Date(yr, m, d, 10).getTime();
  const joins = new Map([["amy", y(2026, 9, 3)], ["bo", y(2026, 11, 30)], ["cy", y(2027, 0, 2)]]);
  const catches = [2027, 2028, 2029].map(yr => fish("cy", "Perch", y(yr, 5, 1)));
  const tl = badgeTimeline({ catches, derbies: [], entrants: new Map(), joins, now: y(2029, 11, 1) });
  const bonnet = tl.filter(b => b.badge.id === "bonnet").map(b => b.uid).sort();
  assert.deepEqual(bonnet, ["amy", "bo"]);
  assert.equal(tl.find(b => b.badge.id === "bonnet" && b.uid === "amy").at, y(2026, 9, 3));
  assert.equal(tl.find(b => b.badge.id === "veteran" && b.uid === "cy").at, y(2029, 5, 1));
  assert.ok(CAREER_BADGES.some(b => b.id === "bonnet") && CAREER_BADGES.length === 15);
});

test("Champion, Repeat Champion and Dynasty come from locked official seasons", () => {
  const doc = (year, champion) => [year, { year, champion, lockedAt: new Date(year + 1, 0, 8).getTime(), standings: [] }];
  const seasonDocs = new Map([doc(2026, "amy"), doc(2027, "amy"), doc(2028, "amy"), doc(2029, "bo"), doc(2030, "amy")]);
  const tl = badgeTimeline({ catches: [], derbies: [], entrants: new Map(), seasonDocs, now: new Date(2031, 5, 1).getTime() });
  const at = (u, id) => (tl.find(b => b.uid === u && b.badge.id === id) || {}).at;
  assert.equal(at("amy", "champion"), new Date(2028, 0, 8).getTime());  // 2026 was the Preseason: unofficial
  assert.equal(at("amy", "repeat"), new Date(2029, 0, 8).getTime());
  assert.equal(at("amy", "dynasty"), undefined);                      // 2027, 2028, then bo won 2029
  assert.equal(at("bo", "champion"), new Date(2030, 0, 8).getTime());
});
