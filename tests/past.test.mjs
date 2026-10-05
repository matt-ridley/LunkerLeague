// Unit tests for past catches (logbook): PBs and all-time boards yes; points, badges, crowns and record news no.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pastCatch, personalBests, speciesBoard } from "../js/stats.js";
import { rankings } from "../js/rank.js";
import { crownStandings } from "../js/crowns.js";
import { badgeTimeline } from "../js/badges.js";
import { recordSteals, alertsFor } from "../js/events.js";
import { entryProblem, DEFAULTS } from "../js/derby.js";

const H = 3600e3, DAY = 24 * H;
const START = new Date(2026, 9, 3).getTime(); // league set up
const NOW = START + 30 * DAY;
let n = 0;
const fish = (uid, species, weightOz, t, extra = {}) => ({ id: "c" + ++n, uid, species, weightOz, lengthIn: null, caughtAt: t, createdAt: t + H, ...extra });

test("a catch is past if caught before the league started, or logged more than the grace days late", () => {
  const o = { leagueStart: START, graceDays: 7 };
  assert.equal(pastCatch({ caughtAt: START - DAY, createdAt: START + DAY }, o), true);
  assert.equal(pastCatch({ caughtAt: START + DAY, createdAt: START + 8 * DAY + H }, o), true);  // 7 days and an hour late
  assert.equal(pastCatch({ caughtAt: START + DAY, createdAt: START + 7 * DAY }, o), false);     // 6 days late: fine
  assert.equal(pastCatch({ caughtAt: START + DAY, createdAt: START + 3 * DAY }, { leagueStart: START, graceDays: 1 }), true);
});

test("past catches count for PBs and the all-time board", () => {
  const old = fish("amy", "Musky", 480, START - 400 * DAY, { past: true }), now = fish("amy", "Musky", 200, START + DAY);
  assert.equal(personalBests([old, now], "amy").get("Musky").id, old.id);
  assert.equal(speciesBoard([old, now], "Musky")[0].id, old.id);
});

test("past catches earn no catch, species or record points; record points go to the best league catch", () => {
  const old = fish("amy", "Musky", 480, START - 400 * DAY, { past: true }), bo = fish("bo", "Musky", 200, START + DAY);
  const rows = rankings({ catches: [old, bo], derbies: [], entrants: new Map(), versions: [], members: ["amy", "bo"], now: NOW });
  const amy = rows.find(r => r.uid === "amy"), b = rows.find(r => r.uid === "bo");
  assert.equal(amy.points, 0);
  assert.equal(b.byKind.record, 5);   // the best league musky holds the record points
  assert.equal(b.byKind.catch, 1); assert.equal(b.byKind.species, 3);
});

test("past catches never earn crowns or badges, but a past PB sets the bar for PB Machine", () => {
  const old = Array.from({ length: 12 }, (_, i) => fish("amy", "Sp" + i, 100, START - (i + 10) * DAY, { past: true }));
  const crowns = crownStandings({ catches: old, derbies: [], now: NOW });
  assert.ok(crowns.every(s => !s.holder));
  assert.equal(badgeTimeline({ catches: old, derbies: [], crowns, now: NOW }).length, 0);
  // Past best 100 oz; league catches 90, 101..105: only beats of the past best count (101 is the 1st beat … 105 the 5th).
  const pb = [fish("bo", "Bass", 100, START - DAY, { past: true }), ...[90, 101, 102, 103, 104, 105].map((w, i) => fish("bo", "Bass", w, START + (i + 1) * DAY))];
  const tl = badgeTimeline({ catches: pb, derbies: [], now: NOW });
  assert.equal(tl.find(b => b.uid === "bo" && b.badge.id === "pbMachine").at, START + 6 * DAY);
  assert.ok(!tl.some(b => b.badge.id === "recordSet" && b.at < START)); // a past fish never "sets" a record
});

test("record news and the bell: a past fish never 'takes' a record; throwbacks get their own line", () => {
  const amy = fish("amy", "Pike", 200, START + DAY), old = fish("bo", "Pike", 500, START - 300 * DAY, { past: true, createdAt: START + 2 * DAY });
  assert.equal(recordSteals([amy, old]).length, 0);
  const a = alertsFor("amy", { catches: [amy, old], derbies: [], entrants: new Map(), name: u => u, now: NOW }, { seen: START });
  assert.ok(a.some(x => x.text === "bo added a throwback: Pike from " + new Date(old.caughtAt).getFullYear()));
  assert.ok(!a.some(x => x.id.startsWith("catches")));       // not counted as a new catch
  assert.ok(!a.some(x => x.text.includes("took your")));
});

test("a past catch can't be a derby entry", () => {
  const d = { ...DEFAULTS, start: START, end: START + DAY };
  assert.equal(entryProblem({ uid: "amy", species: "Pike", caughtAt: START + H, weightOz: 90, past: true }, d), "Past catches can't be entered in a derby");
});
