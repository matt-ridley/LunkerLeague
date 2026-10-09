// Unit tests for the Fish Finder cards. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { fishFinderCards, span } from "../js/fishfinder.js";
import { DEFAULTS } from "../js/derby.js";
import { crownStandings } from "../js/crowns.js";
import { badgeTimeline } from "../js/badges.js";

const H = 3600e3, DAY = 24 * H;
const NOW = new Date(2026, 5, 15, 12).getTime();
let n = 0;
const fish = (uid, species, extra = {}) => ({ id: "c" + ++n, uid, species, weightOz: null, lengthIn: null, caughtAt: NOW - DAY, createdAt: NOW - DAY, ...extra });
const names = { amy: "Amy", bo: "Bo", cy: "Cy" };
const input = (catches, extra = {}) => {
  const base = { catches, derbies: [], entrants: new Map(), versions: [], members: ["amy", "bo", "cy"], trips: new Map(), rsvps: new Map(), now: NOW, name: u => names[u], ...extra };
  return { ...base, crowns: extra.crowns || crownStandings(base), badges: extra.badges || badgeTimeline(base) };
};
const cards = (catches, extra, me = "amy") => fishFinderCards(input(catches, extra), me, { now: NOW });
const byKind = (list, k) => list.find(c => c.kind === k);

test("spans read like people talk", () => {
  assert.equal(span(10 * 60e3), "10 min");
  assert.equal(span(3 * H), "3 h");
  assert.equal(span(2 * DAY), "2 d");
});

test("happening now: a live derby you joined shows your place; nothing on means no card", () => {
  const d = { ...DEFAULTS, id: "d1", name: "Spring Derby", start: NOW - 2 * H, end: NOW + 3 * H, syncGraceHours: 1, scoring: "heaviest" };
  const ent = new Map([["d1", new Map([["amy", {}], ["bo", {}]])]]);
  const catches = [fish("amy", "Walleye", { weightOz: 80, caughtAt: NOW - H, derbyId: "d1" }), fish("bo", "Walleye", { weightOz: 90, caughtAt: NOW - H, derbyId: "d1" })];
  const now = byKind(cards(catches, { derbies: [d], entrants: ent }), "now");
  assert.equal(now.title, "Spring Derby ends in 3 h");
  assert.equal(now.detail, "You're 2nd of 2.");
  assert.equal(now.href, "#/d/d1");
  assert.equal(byKind(cards(catches), "now"), undefined);
});

test("happening now: a trip tomorrow asks if you're in", () => {
  const trips = new Map([["t1", { id: "t1", uid: "bo", title: "Lake run", at: NOW + DAY }]]);
  const rsvps = new Map([["t1", new Map([["bo", { answer: "in" }]])]]);
  const now = byKind(cards([], { trips, rsvps }), "now");
  assert.equal(now.title, "🚤 Lake run");
  assert.equal(now.detail, "Starts in 1 d · 1 angler in. Are you in?");
});

test("your standing: place this season and the gap to the angler above", () => {
  const catches = [fish("bo", "Walleye", { weightOz: 90 }), fish("bo", "Perch", { weightOz: 9 }), fish("amy", "Walleye", { weightOz: 80 })];
  const st = byKind(cards(catches), "standing");
  assert.match(st.title, /^#2 of 3 in the Preseason/);
  assert.match(st.detail, /pts behind Bo\./);
});

test("within reach: the record you're closest to, by how close", () => {
  const catches = [
    fish("bo", "Pike", { lengthIn: 29 }), fish("amy", "Pike", { lengthIn: 25 }),
    fish("cy", "Walleye", { weightOz: 100 }), fish("amy", "Walleye", { weightOz: 50 }),
  ];
  const r = byKind(cards(catches), "reach");
  assert.equal(r.title, 'Pike: 4" short of the season record');
  assert.equal(r.detail, 'Yours: 25". Bo\'s season record: 29".');
  assert.equal(r.href, "#/leaders/Pike/length");
});

test("crown watch: the closest challenger to a crown you hold", () => {
  const crowns = [{ crown: { id: "g", icon: "⚙️", name: "Grinder", unit: ["catch", "catches"], desc: "Most catches" }, holder: "amy", score: 5, board: [{ uid: "amy", score: 5 }, { uid: "bo", score: 4 }], history: [] }];
  const c = byKind(cards([fish("amy", "Perch")], { crowns }), "crowns");
  assert.equal(c.title, "⚙️ Grinder: Bo is 1 catch behind you");
  const steal = byKind(cards([fish("bo", "Perch")], { crowns }, "bo"), "crowns");
  assert.equal(steal.title, "⚙️ Grinder: 2 catches to take it");
});

test("badge watch: the counting badge you're nearest", () => {
  const catches = Array.from({ length: 8 }, (_, i) => fish("amy", i < 3 ? `Sp${i}` : "Perch", { caughtAt: NOW - (i + 1) * H }));
  const b = byKind(cards(catches), "badges");
  assert.equal(b.title, "1 more species for 🖐️ Five Species"); // 4 of 5 species beats 8 of 10 fish
});

test("this week and the nudge: last 7 days for the league; overdue moves the nudge up", () => {
  const catches = [fish("bo", "Pike", { lengthIn: 29, caughtAt: NOW - 2 * DAY }), fish("amy", "Perch", { caughtAt: NOW - 20 * DAY })];
  const list = cards(catches);
  assert.equal(byKind(list, "week").title, "1 fish · 1 species · 1 angler");
  assert.equal(byKind(list, "week").detail, 'Biggest: Bo\'s 29" Pike.');
  assert.equal(list[0].kind, "out");
  assert.equal(list[0].title, "Your last catch was 20 days ago");
  const fresh = cards([fish("amy", "Perch", { caughtAt: NOW - H })]);
  assert.equal(fresh[fresh.length - 1].label, "Keep it going");
});

test("past and disqualified catches don't count", () => {
  const catches = [fish("amy", "Perch", { past: true, caughtAt: NOW - H }), fish("amy", "Bass", { dq: true, caughtAt: NOW - H })];
  const list = cards(catches);
  assert.equal(byKind(list, "out").title, "No catches logged yet");
  assert.equal(byKind(list, "week").title, "Quiet week on the water");
});

test("no best-bite card, even once the league has a home water", () => {
  const cards = fishFinderCards({ catches: [], home: { lat: 44.4, lng: -79.4, name: "Lake Simcoe" } }, "amy", { now: NOW });
  assert.equal(cards.some(c => c.kind === "bite"), false);
});
