// Unit tests for crowns (holder badges). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { replayCrown, crownStandings, crownSteals, CROWNS } from "../js/crowns.js";
import { DEFAULTS } from "../js/derby.js";

const H = 3600e3, DAY = 24 * H;
const T0 = new Date(2026, 4, 1, 12).getTime(); // noon, so not dawn or night
let n = 0;
const fish = (uid, species, t, extra = {}) => ({ id: "c" + ++n, uid, species, weightOz: null, lengthIn: null, caughtAt: t, ...extra });
const holderOf = (st, id) => st.find(s => s.crown.id === id).holder;
const scoreOf = (st, id) => st.find(s => s.crown.id === id).score;
const input = (extra = {}) => ({ catches: [], derbies: [], entrants: new Map(), now: T0 + 30 * DAY, ...extra });

test("a crown only moves when someone passes the holder; a tie isn't enough", () => {
  const r = replayCrown([
    { at: 1, uid: "amy", delta: 1 }, { at: 2, uid: "bo", delta: 1 },   // tie: amy keeps it
    { at: 3, uid: "bo", delta: 1 },                                    // bo passes: stolen
    { at: 4, uid: "amy", delta: 1 },                                   // tie again: bo keeps it
  ]);
  assert.equal(r.holder, "bo");
  assert.deepEqual(r.history, [{ at: 1, uid: "amy", from: null }, { at: 3, uid: "bo", from: "amy" }]);
  assert.deepEqual(r.board.map(b => [b.uid, b.score]), [["bo", 2], ["amy", 2]]);
});

test("if the holder drops (records can be lost), the crown goes to whoever is ahead, or to nobody", () => {
  const r = replayCrown([{ at: 1, uid: "amy", delta: 1 }, { at: 2, uid: "bo", delta: 1 }, { at: 3, uid: "amy", delta: -1 }]);
  assert.equal(r.holder, "bo");
  assert.equal(replayCrown([{ at: 1, uid: "amy", delta: 1 }, { at: 2, uid: "amy", delta: -1 }]).holder, null);
});

test("catch crowns: grinder counts entries, meat eater counts every fish kept, stringer filler counts limits", () => {
  const catches = [
    fish("amy", "Walleye", T0), fish("amy", "Walleye", T0 + H), fish("amy", "Walleye", T0 + 2 * H, { released: true }),
    fish("bo", "Yellow Perch", T0 + 3 * H, { fishCount: 50, limit: true }),
    fish("cy", "Bass", T0 + 4 * H, { released: true }), fish("cy", "Bass", T0 + 5 * H, { released: true }),
  ];
  const st = crownStandings(input({ catches }));
  assert.equal(holderOf(st, "grinder"), "amy"); assert.equal(scoreOf(st, "grinder"), 3);
  assert.equal(holderOf(st, "meatEater"), "bo"); assert.equal(scoreOf(st, "meatEater"), 50);
  assert.equal(holderOf(st, "stringerFiller"), "bo");
  assert.equal(holderOf(st, "conservationist"), "cy");
  assert.equal(holderOf(st, "ironAngler"), "amy"); // everyone fished one day; amy was first
});

test("time of day, species, days and disqualified catches", () => {
  const dawn = new Date(2026, 4, 2, 5).getTime(), night = new Date(2026, 4, 2, 23).getTime();
  const catches = [
    fish("amy", "Walleye", dawn), fish("amy", "Pike", dawn + 60e3), fish("bo", "Walleye", night), fish("bo", "Bass", night, { dq: true }),
    fish("bo", "Perch", T0), fish("bo", "Perch", T0 + 3 * DAY),
  ];
  const st = crownStandings(input({ catches }));
  assert.equal(holderOf(st, "earlyBird"), "amy");
  assert.equal(holderOf(st, "nightStalker"), "bo"); assert.equal(scoreOf(st, "nightStalker"), 1); // the DQ'd one doesn't count
  assert.equal(holderOf(st, "ironAngler"), "bo"); assert.equal(scoreOf(st, "ironAngler"), 3);
  assert.equal(holderOf(st, "speciesHunter"), "amy"); // 2 each; amy got there first
});

test("records held: taking a record moves it between anglers", () => {
  const catches = [fish("amy", "Walleye", T0, { weightOz: 80 }), fish("amy", "Pike", T0 + H, { weightOz: 90 }),
    fish("bo", "Walleye", T0 + 2 * H, { weightOz: 99 }), fish("bo", "Pike", T0 + 3 * H, { weightOz: 99 })];
  const st = crownStandings(input({ catches }));
  assert.equal(holderOf(st, "recordHolder"), "bo"); assert.equal(scoreOf(st, "recordHolder"), 2);
  const steals = crownSteals(st).filter(s => s.crown.id === "recordHolder");
  assert.deepEqual(steals.map(s => [s.uid, s.from]), [["bo", "amy"]]);
});

test("explorer counts different shared spots only (250 m apart)", () => {
  const a = fish("amy", "Walleye", T0, { locShared: true }), b = fish("amy", "Walleye", T0 + H, { locShared: true }),
    c = fish("amy", "Walleye", T0 + 2 * H, { locShared: true }), d = fish("bo", "Walleye", T0 + 3 * H, { locShared: false });
  const spots = new Map([[a.id, { lat: 44.5, lng: -79.4, shared: true }], [b.id, { lat: 44.5005, lng: -79.4, shared: true }], // ~55 m away
    [c.id, { lat: 44.6, lng: -79.4, shared: true }], [d.id, { lat: 45, lng: -80, shared: false }]]);
  const st = crownStandings(input({ catches: [a, b, c, d], spots }));
  assert.equal(holderOf(st, "explorer"), "amy"); assert.equal(scoreOf(st, "explorer"), 2);
  assert.equal(st.find(s => s.crown.id === "explorer").board.length, 1);
});

test("social crowns: fish stories received, hype given (not on your own catches)", () => {
  const amyFish = fish("amy", "Walleye", T0);
  const reactions = new Map([[amyFish.id, new Map([["bo", { emojis: ["🤥", "😂"], at: T0 + H }], ["cy", { emojis: ["🤥"], at: T0 + 2 * H }], ["amy", { emojis: ["🔥"], at: T0 + H }]])]]);
  const comments = new Map([[amyFish.id, [{ uid: "cy", at: T0 + 3 * H }, { uid: "cy", at: T0 + 4 * H }, { uid: "amy", at: T0 + 5 * H }]]]);
  const st = crownStandings(input({ catches: [amyFish], reactions, comments }));
  assert.equal(holderOf(st, "fishStory"), "amy"); assert.equal(scoreOf(st, "fishStory"), 2);
  assert.equal(holderOf(st, "hypeMan"), "cy"); assert.equal(scoreOf(st, "hypeMan"), 3); // bo 2 (two emoji), cy 1 + 2 comments
});

test("derby crowns: king, captain, golden net and skunk; test derbies don't count", () => {
  const d = { ...DEFAULTS, id: "d1", name: "Spring", start: T0, end: T0 + 5 * H, syncGraceHours: 0 };
  const t = { ...d, id: "d2", testing: true };
  const ent = new Map([["d1", new Map([["amy", {}], ["bo", {}], ["cy", {}]])], ["d2", new Map([["cy", {}]])]]);
  const catches = [
    fish("amy", "Walleye", T0 + H, { derbyId: "d1", weightOz: 90, captain: { uid: "bo" }, netman: { uid: "bo" } }),
    fish("bo", "Walleye", T0 + H, { derbyId: "d1", weightOz: 80, captain: { uid: "bo" } }),
    fish("cy", "Walleye", T0 + H, { derbyId: "d2", weightOz: 99 }),
  ];
  const st = crownStandings(input({ catches, derbies: [d, t], entrants: ent }));
  assert.equal(holderOf(st, "derbyKing"), "amy");
  assert.equal(holderOf(st, "bestCaptain"), "bo"); assert.equal(scoreOf(st, "bestCaptain"), 2);
  assert.equal(holderOf(st, "goldenNet"), "bo");
  assert.equal(holderOf(st, "skunkMaster"), "cy");
});

test("there are 16 crowns with unique ids", () => {
  assert.equal(CROWNS.length, 16);
  assert.equal(new Set(CROWNS.map(c => c.id)).size, 16);
});
