// Unit tests for head-to-head challenges: status, scoring, points and stakes. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { challengeStatus, challengeBoard, h2hPointEvents, stakeRoom, termsProblem, sideCatches, closesAt, LATE_HOURS,
  h2hResults, h2hRecord, recordText, rematchTerms } from "../js/h2h.js";
import { crownStandings } from "../js/crowns.js";
import { badgeTimeline } from "../js/badges.js";
import { rankings, DEFAULT_SCORING } from "../js/rank.js";
import { alertsFor, leagueEvents } from "../js/events.js";

const H = 3600e3;
const T0 = new Date(2026, 5, 6, 8).getTime(); // a Saturday morning
const terms = (extra = {}) => ({ win: "heaviest", bagSize: 5, species: [], start: T0, end: T0 + 24 * H, stake: 0, money: "", note: "", ...extra });
const challenge = (extra = {}, t = {}) => ({ id: "h1", from: "amy", to: "bo", terms: terms(t), status: "accepted", turn: "bo", counters: 0,
  createdAt: T0 - 24 * H, updatedAt: T0 - 20 * H, acceptedAt: T0 - 20 * H, vetoed: false, ...extra });
let n = 0;
const fish = (uid, species, weightOz, hour, extra = {}) =>
  ({ id: `c${++n}`, uid, species, weightOz, lengthIn: null, caughtAt: T0 + hour * H, createdAt: T0 + hour * H, ...extra });
const DONE = T0 + 24 * H + LATE_HOURS * H + 1;
const name = u => u.toUpperCase();

test("status: an offer expires at the start; an accepted one goes live, takes late catches, then finishes", () => {
  const open = challenge({ status: "open" });
  assert.equal(challengeStatus(open, T0 - H), "open");
  assert.equal(challengeStatus(open, T0), "expired");
  const ch = challenge();
  assert.equal(challengeStatus(ch, T0 - H), "upcoming");
  assert.equal(challengeStatus(ch, T0 + H), "live");
  assert.equal(challengeStatus(ch, T0 + 25 * H), "closing");
  assert.equal(challengeStatus(ch, DONE), "done");
  assert.equal(closesAt(ch), T0 + 24 * H + LATE_HOURS * H);
  assert.equal(challengeStatus({ ...ch, vetoed: true }, DONE), "vetoed");
  assert.equal(challengeStatus({ ...ch, status: "declined" }, T0 - H), "declined");
  assert.equal(challengeStatus({ ...ch, status: "withdrawn" }, T0 - H), "withdrawn");
});

test("what counts: during it, the right species, sent in time, not disqualified or past", () => {
  const ch = challenge({}, { species: ["Walleye"] });
  const list = [
    fish("amy", "Walleye", 40, 2),                                   // counts
    fish("amy", "Walleye", 99, -1),                                  // before the start
    fish("amy", "Walleye", 99, 25),                                  // after the end
    fish("amy", "Perch", 99, 3),                                     // wrong species
    fish("amy", "Walleye", 99, 3, { dq: true }),
    fish("amy", "Walleye", 99, 3, { past: true }),
    fish("amy", "Walleye", 99, 3, { createdAt: closesAt(ch) + 1 }),  // sent after final catches closed
    fish("bo", "Walleye", 99, 3),                                    // someone else's
  ];
  assert.deepEqual(sideCatches(ch, list, "amy").map(c => c.weightOz), [40]);
});

test("winning: heaviest, longest, most (stringers count) and top-N total; the same score is a tie", () => {
  const catches = [fish("amy", "Walleye", 40, 1), fish("amy", "Walleye", 30, 2), fish("bo", "Walleye", 50, 3),
    fish("bo", "Perch", null, 4, { fishCount: 20, limit: false })];
  let r = challengeBoard(challenge(), catches);
  assert.equal(r.winner, "bo"); assert.equal(r.loser, "amy"); assert.equal(r.tie, false);
  assert.deepEqual(r.sides.map(s => s.score), [40, 50]);
  r = challengeBoard(challenge({}, { win: "most" }), catches);
  assert.deepEqual(r.sides.map(s => s.score), [2, 21]);                  // a stringer of 20 plus one fish
  r = challengeBoard(challenge({}, { win: "bag", bagSize: 2 }), catches);
  assert.deepEqual(r.sides.map(s => s.score), [70, 50]);                 // stringers have no size, so not in the top fish
  assert.equal(r.winner, "amy");
  r = challengeBoard(challenge({}, { win: "longest" }), [fish("amy", "Pike", null, 1, { lengthIn: 30 }), fish("bo", "Pike", 99, 1)]);
  assert.equal(r.winner, "amy");                                          // bo's fish was only weighed
  r = challengeBoard(challenge(), [fish("amy", "Walleye", 40, 1), fish("bo", "Walleye", 40, 2)]);
  assert.equal(r.tie, true); assert.equal(r.winner, null);
  r = challengeBoard(challenge(), []);
  assert.equal(r.tie, true);                                              // both skunked
});

test("points: taking part needs a fish, the winner gets a bonus and the stake; a tie or veto moves nothing", () => {
  const v = () => ({ ...DEFAULT_SCORING, h2hPts: 1, h2hWinPts: 3 });
  const won = h2hPointEvents([challenge({}, { stake: 5 })], [fish("amy", "Walleye", 40, 1), fish("bo", "Walleye", 50, 2)], v, name, DONE);
  const total = u => won.filter(e => e.uid === u).reduce((s, e) => s + e.pts, 0);
  assert.equal(total("bo"), 1 + 3 + 5);
  assert.equal(total("amy"), 1 - 5);
  assert.ok(won.every(e => e.kind === "h2h" && e.at === T0 + 24 * H));
  // Skunked: no point for taking part, but the stake still goes.
  const skunk = h2hPointEvents([challenge({}, { stake: 2 })], [fish("bo", "Walleye", 50, 2)], v, name, DONE);
  assert.equal(skunk.filter(e => e.uid === "amy").reduce((s, e) => s + e.pts, 0), -2);
  // A tie: both fished, so both get the point, and nothing else.
  const tie = h2hPointEvents([challenge({}, { stake: 5 })], [fish("amy", "Walleye", 40, 1), fish("bo", "Walleye", 40, 2)], v, name, DONE);
  assert.deepEqual(tie.map(e => [e.uid, e.pts]), [["amy", 1], ["bo", 1]]);
  // Vetoed, still live, or never accepted: nothing.
  assert.equal(h2hPointEvents([challenge({ vetoed: true }, { stake: 5 })], [fish("bo", "Walleye", 50, 2)], v, name, DONE).length, 0);
  assert.equal(h2hPointEvents([challenge({}, { stake: 5 })], [fish("bo", "Walleye", 50, 2)], v, name, T0 + 2 * H).length, 0);
  assert.equal(h2hPointEvents([challenge({ status: "declined" })], [fish("bo", "Walleye", 50, 2)], v, name, DONE).length, 0);
});

test("rankings include head-to-head points, staked points can go negative", () => {
  const challenges = new Map([["h1", challenge({}, { stake: 5 })]]);
  const catches = [fish("amy", "Walleye", 40, 1), fish("bo", "Walleye", 50, 2)];
  const rows = rankings({ catches, derbies: [], entrants: new Map(), versions: [], challenges, members: ["amy", "bo"], now: DONE, crowns: [], badges: [] });
  const amy = rows.find(r => r.uid === "amy"), bo = rows.find(r => r.uid === "bo");
  assert.equal(bo.byKind.h2h, 1 + 3 + 5);
  assert.equal(amy.byKind.h2h, 1 - 5);
});

test("stake room: your points less what's staked in challenges still to be decided, up to the max", () => {
  const list = [challenge({ id: "a" }, { stake: 4 }), challenge({ id: "b", status: "open" }, { stake: 3 }),
    challenge({ id: "c", status: "declined" }, { stake: 9 }), challenge({ id: "d", from: "cy", to: "bo" }, { stake: 9 })];
  assert.equal(stakeRoom("amy", 20, list, 10, { now: T0 - H }), 10);       // 20 - 7 = 13, capped at 10
  assert.equal(stakeRoom("amy", 10, list, 10, { now: T0 - H }), 3);
  assert.equal(stakeRoom("amy", 10, list, 10, { except: "b", now: T0 - H }), 6);
  assert.equal(stakeRoom("amy", 10, list, 10, { now: DONE }), 10);         // all decided (or expired) by then
  assert.equal(stakeRoom("amy", 2, list, 10, { now: T0 - H }), 0);         // never below 0
  assert.equal(stakeRoom("amy", 50, [], 0), 0);                            // staking turned off
});

test("terms: sensible choices only", () => {
  const now = T0 - 2 * H;
  assert.equal(termsProblem(terms(), now), "");
  assert.match(termsProblem(terms({ win: "nope" }), now), /how it's won/);
  assert.match(termsProblem(terms({ win: "bag", bagSize: 1 }), now), /2 to 10/);
  assert.match(termsProblem(terms({ start: now - 1 }), now), /future/);
  assert.match(termsProblem(terms({ end: T0 }), now), /end after/);
  assert.match(termsProblem(terms({ end: T0 + 32 * 24 * H }), now), /31 days/);
  assert.match(termsProblem(terms({ stake: 1.5 }), now), /whole number/);
});

test("feed and bell: challenges made, answered and decided", () => {
  const base = { catches: [fish("amy", "Walleye", 40, 1), fish("bo", "Walleye", 50, 2)], derbies: [], entrants: new Map(), name, now: DONE, crowns: [], badges: [] };
  const offer = challenge({ id: "h2", status: "open", turn: "bo", acceptedAt: undefined }, { start: DONE + H, end: DONE + 5 * H });
  const challenges = new Map([["h1", challenge({}, { stake: 5 })], ["h2", offer]]);
  const news = leagueEvents({ ...base, challenges });
  assert.ok(news.some(e => e.id === "h2h:h1" && /AMY challenged BO/.test(e.text)));
  assert.ok(news.some(e => e.id === "h2hyes:h1" && /BO accepted AMY's challenge: Heaviest fish · any species/.test(e.text)));
  assert.ok(news.some(e => e.id === "h2hend:h1" && /BO beat AMY \(3 lb 2 oz to 2 lb 8 oz\) and took 5 points/.test(e.text)));
  const bo = alertsFor("bo", { ...base, challenges });
  assert.ok(bo.some(a => a.id === "h2hturn:h2:0" && /AMY challenged you/.test(a.text)));
  assert.ok(bo.some(a => a.id === "h2hend:h1" && /You beat AMY \(5 points\)!/.test(a.text)));
  const amy = alertsFor("amy", { ...base, challenges });
  assert.ok(amy.some(a => a.id === "h2hyes:h1" && /BO accepted your challenge/.test(a.text)));
  assert.ok(amy.some(a => a.id === "h2hend:h1" && /BO beat you/.test(a.text)));
  assert.ok(!amy.some(a => a.id.startsWith("h2hturn")));                      // not amy's move
  // A counter makes it the challenger's move; a decline tells the challenger.
  const countered = new Map([["h2", { ...offer, turn: "amy", counters: 1 }]]);
  assert.ok(alertsFor("amy", { ...base, challenges: countered }).some(a => a.id === "h2hturn:h2:1" && /BO countered/.test(a.text)));
  const declined = new Map([["h2", { ...offer, status: "declined" }]]);
  assert.ok(alertsFor("amy", { ...base, challenges: declined }).some(a => a.id === "h2hno:h2"));
  assert.ok(!alertsFor("bo", { ...base, challenges: declined }).some(a => a.id === "h2hno:h2"));
  // Someone else hears about it too.
  const cy = alertsFor("cy", { ...base, challenges });
  assert.ok(cy.some(a => a.id === "h2h:h1") && cy.some(a => a.id === "h2hend:h1"));
});

/* A run of finished challenges between amy, bo and cy, each a day apart. `who` wins each ("tie" for a tie). */
function season(list) {
  const challenges = [], catches = [];
  list.forEach(([from, to, winner, extra = {}], i) => {
    const day = i * 48;
    const ch = challenge({ id: `s${i}`, from, to }, { start: T0 + day * H, end: T0 + (day + 24) * H, ...extra });
    challenges.push(ch);
    const loser = winner === from ? to : from;
    if (winner === "tie") { catches.push(fish(from, "Walleye", 30, day + 1), fish(to, "Walleye", 30, day + 2)); }
    else { catches.push(fish(winner, "Walleye", 50, day + 1)); if (!extra.shutout) catches.push(fish(loser, "Walleye", 20, day + 2)); }
  });
  return { challenges, catches, now: T0 + list.length * 48 * H + 48 * H };
}

test("records: wins, losses, ties, the current streak and how you've done against each angler", () => {
  const s = season([["amy", "bo", "amy"], ["bo", "amy", "bo"], ["amy", "cy", "amy"], ["cy", "amy", "amy"], ["amy", "bo", "tie"], ["amy", "bo", "amy"]]);
  const results = h2hResults(s.challenges, s.catches, s.now);
  assert.equal(results.length, 6);
  const amy = h2hRecord("amy", results);
  assert.deepEqual([amy.w, amy.l, amy.t, amy.played, amy.streak], [4, 1, 1, 6, 1]);
  assert.deepEqual(amy.vs.get("bo"), { w: 2, l: 1, t: 1 });
  assert.equal(recordText(amy), "4–1–1");
  assert.equal(recordText(h2hRecord("cy", results)), "0–2");
  assert.equal(h2hRecord("cy", results).streak, -2);
  // Vetoed challenges aren't results.
  s.challenges[0].vetoed = true;
  assert.equal(h2hResults(s.challenges, s.catches, s.now).length, 5);
});

test("rematch: same terms, starting at a whole hour at least half an hour away, just as long", () => {
  const t = terms({ species: ["Pike"], stake: 4, start: T0, end: T0 + 6 * H });
  const now = new Date(2026, 6, 1, 21, 10).getTime();
  const r = rematchTerms(t, now);
  assert.equal(new Date(r.start).getHours(), 22); assert.equal(new Date(r.start).getMinutes(), 0);
  assert.equal(r.end - r.start, 6 * H);
  assert.deepEqual([r.win, r.stake, r.species], ["heaviest", 4, ["Pike"]]);
  const late = rematchTerms(t, new Date(2026, 6, 1, 21, 50).getTime());
  assert.equal(new Date(late.start).getHours(), 23);
});

test("the Duel King crown goes to the most head-to-head wins", () => {
  const s = season([["amy", "bo", "bo"], ["amy", "cy", "amy"], ["bo", "cy", "bo"], ["amy", "bo", "tie"]]);
  const king = crownStandings({ catches: s.catches, derbies: [], challenges: new Map(s.challenges.map(c => [c.id, c])), now: s.now })
    .find(x => x.crown.id === "duelKing");
  assert.equal(king.holder, "bo");
  assert.equal(king.score, 2);
});

test("head-to-head badges: first finish, first win, 5 wins, 3 in a row, shutout, high roller and a rivalry", () => {
  const s = season([["amy", "bo", "amy", { stake: 10 }], ["amy", "bo", "amy"], ["bo", "amy", "amy", { shutout: true }], ["amy", "bo", "bo"],
    ["amy", "bo", "amy"], ["amy", "bo", "amy"]]);
  const got = u => new Set(badgeTimeline({ catches: s.catches, derbies: [], challenges: new Map(s.challenges.map(c => [c.id, c])), now: s.now })
    .filter(b => b.uid === u).map(b => b.badge.id));
  const amy = got("amy"), bo = got("bo");
  for (const id of ["duelist", "gunslinger", "sharpshooter", "onARoll", "shutout", "highRoller", "rivalry"]) assert.ok(amy.has(id), id);
  assert.ok(bo.has("duelist") && bo.has("gunslinger") && bo.has("rivalry"));
  assert.ok(!bo.has("sharpshooter") && !bo.has("onARoll") && !bo.has("shutout") && !bo.has("highRoller"));
});
