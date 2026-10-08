// Unit tests for bets: status, what counts, winners, pot splits and the feed/bell. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { betStatus, betBoard, betResult, splitPot, betCatches, finalAt, betProblem, playersIn, canJoin, ruleText, LATE_HOURS } from "../js/bets.js";
import { leagueEvents, alertsFor } from "../js/events.js";

const H = 3600e3;
const T0 = new Date(2026, 5, 6, 8).getTime();
const bet = (extra = {}, rule = {}) => ({ id: "b1", title: "Biggest pike", organiserUid: "amy", kind: "contest",
  rule: { win: "heaviest", species: [], minWeightOz: 0, minLengthIn: 0, ...rule }, open: true, invited: [],
  start: T0, end: T0 + 24 * H, buyIn: 5, roundTo: 0, prize: "", note: "", createdAt: T0 - 24 * H, cancelled: false, ...extra });
const players = (...uids) => new Map(uids.map(u => [u, { at: T0 - H, in: true }]));
let n = 0;
const fish = (uid, species, weightOz, hour, extra = {}) =>
  ({ id: `c${++n}`, uid, species, weightOz, lengthIn: null, caughtAt: T0 + hour * H, createdAt: T0 + hour * H, ...extra });
const DONE = T0 + 24 * H + LATE_HOURS * H + 1;
const name = u => u.toUpperCase();

test("status: open to join, live, final catches, finished; called off with fewer than 2; cancelled", () => {
  const p = players("amy", "bo");
  assert.equal(betStatus(bet(), [], p, T0 - H), "open");
  assert.equal(betStatus(bet(), [], p, T0 + H), "live");
  assert.equal(betStatus(bet(), [], p, T0 + 25 * H), "closing");
  assert.equal(betStatus(bet(), [], p, DONE), "done");
  assert.equal(betStatus(bet(), [], players("amy"), T0 + H), "off");
  assert.equal(betStatus(bet({ cancelled: true }), [], p, T0 + H), "cancelled");
  // An invite turned down isn't a player.
  assert.deepEqual(playersIn(new Map([["amy", { in: true }], ["bo", { in: false }]])), ["amy"]);
});

test("what counts: players' catches during it, the right species, sent in time, not disqualified or past", () => {
  const b = bet({}, { species: ["Northern Pike"] }), p = players("amy", "bo");
  const list = [fish("amy", "Northern Pike", 100, 2), fish("amy", "Northern Pike", 300, -1), fish("amy", "Walleye", 300, 2),
    fish("amy", "Northern Pike", 300, 3, { dq: true }), fish("amy", "Northern Pike", 300, 3, { past: true }),
    fish("amy", "Northern Pike", 300, 3, { createdAt: T0 + 24 * H + LATE_HOURS * H + 1 }), fish("cy", "Northern Pike", 900, 3)];
  assert.deepEqual(betCatches(b, list, p).map(c => c.weightOz), [100]);
});

test("winners: biggest, longest, most (stringers count), and ties share; nobody scoring is a wash", () => {
  const p = players("amy", "bo", "cy");
  const list = [fish("amy", "Pike", 100, 1), fish("bo", "Pike", 120, 2), fish("cy", "Perch", null, 3, { fishCount: 30, limit: true })];
  let r = betResult(bet(), list, p);
  assert.deepEqual(r.winners, ["bo"]); assert.equal(r.pot, 15); assert.equal(r.shares.get("bo"), 15);
  r = betResult(bet({}, { win: "most" }), list, p);
  assert.deepEqual(r.winners, ["cy"]);
  r = betResult(bet({}, { win: "longest" }), [fish("amy", "Pike", null, 1, { lengthIn: 30 }), fish("bo", "Pike", 500, 1)], p);
  assert.deepEqual(r.winners, ["amy"]);
  r = betResult(bet(), [fish("amy", "Pike", 100, 1), fish("bo", "Pike", 100, 2)], p);
  assert.deepEqual(r.winners, ["amy", "bo"]); assert.equal(r.shares.get("amy"), 7.5); assert.equal(r.shares.get("bo"), 7.5);
  r = betResult(bet(), [], p);
  assert.equal(r.wash, true); assert.equal(r.shares.size, 0);
  // The board breaks ties by who got there first.
  assert.deepEqual(betBoard(bet(), [fish("bo", "Pike", 100, 5), fish("amy", "Pike", 100, 2)], p).map(x => x.uid).slice(0, 2), ["amy", "bo"]);
});

test("first to catch: the first qualifying fish wins, final 12 hours after it; none is a wash", () => {
  const b = bet({}, { win: "first", species: ["Walleye"], minWeightOz: 80 }), p = players("amy", "bo");
  const list = [fish("amy", "Walleye", 60, 1), fish("bo", "Walleye", 90, 3), fish("amy", "Walleye", 95, 4)];
  assert.equal(betStatus(b, list, p, T0 + 3.5 * H), "closing");        // someone has one: not live any more
  assert.equal(finalAt(b, list, p), T0 + 3 * H + LATE_HOURS * H);
  assert.equal(betStatus(b, list, p, T0 + 3 * H + LATE_HOURS * H), "done");
  assert.deepEqual(betResult(b, list, p).winners, ["bo"]);
  assert.equal(betResult(b, [fish("amy", "Walleye", 60, 1)], p).wash, true);
  assert.equal(ruleText(b.rule), "First to catch a 5 lb+ Walleye");
});

test("pot splits: exact, or rounded with the difference to the first winner", () => {
  assert.deepEqual([...splitPot(25, ["a", "b", "c"], 0)], [["a", 8.34], ["b", 8.33], ["c", 8.33]]);
  assert.deepEqual([...splitPot(25, ["a", "b", "c"], 1)], [["a", 9], ["b", 8], ["c", 8]]);
  assert.deepEqual([...splitPot(25, ["a", "b", "c"], 5)], [["a", 5], ["b", 10], ["c", 10]]);
  assert.equal(splitPot(0, ["a"]).size, 0);
});

test("who can join, and sensible settings", () => {
  assert.equal(canJoin(bet(), "zed"), true);
  const inv = bet({ open: false, invited: ["bo"] });
  assert.equal(canJoin(inv, "bo"), true); assert.equal(canJoin(inv, "amy"), true); assert.equal(canJoin(inv, "cy"), false);
  const now = T0 - 2 * H;
  assert.equal(betProblem(bet(), now), "");
  assert.match(betProblem(bet({ title: " " }), now), /name/);
  assert.match(betProblem(bet({ start: now - 1 }), now), /future/);
  assert.match(betProblem(bet({ end: T0 }), now), /end after/);
  assert.match(betProblem(bet({ open: false, invited: [] }), now), /Invite/);
});

test("feed and bell: started, invites, joins and results", () => {
  const list = [fish("amy", "Pike", 100, 1), fish("bo", "Pike", 120, 2)];
  const base = { catches: list, derbies: [], entrants: new Map(), name, now: DONE, crowns: [], badges: [] };
  const bets = new Map([["b1", bet()], ["b2", bet({ id: "b2", title: "First walleye", open: false, invited: ["cy"], start: DONE + H, end: DONE + 5 * H, createdAt: DONE - H })]]);
  const betPlayers = new Map([["b1", players("amy", "bo")], ["b2", players("amy")]]);
  const news = leagueEvents({ ...base, bets, betPlayers });
  assert.ok(news.some(e => e.id === "bet:b1" && /AMY started a bet: Biggest pike/.test(e.text)));
  assert.ok(news.some(e => e.id === "betend:b1" && /BO won the bet “Biggest pike” \(\$10\)/.test(e.text)));
  const cy = alertsFor("cy", { ...base, bets, betPlayers });
  assert.ok(cy.some(a => a.id === "betinv:b2" && /AMY invited you to a bet: First walleye/.test(a.text)));
  const bo = alertsFor("bo", { ...base, bets, betPlayers });
  assert.ok(bo.some(a => a.id === "betend:b1" && /You won the bet “Biggest pike” \(\$10\)!/.test(a.text)));
  assert.ok(!bo.some(a => a.id === "betinv:b2"));                       // not invited
  const amy = alertsFor("amy", { ...base, bets, betPlayers });
  assert.ok(amy.some(a => a.id === "betjoin:b1:bo" && /BO is in on your bet/.test(a.text)));
  assert.ok(amy.some(a => a.id === "betend:b1" && /BO won the bet/.test(a.text)));
});

test("organiser-settled bets: live, waiting for the call, then the organiser's winners split the pot", () => {
  const b = bet({ buyIn: 5, roundTo: 0, note: "First boat to the launch" }, { win: "called" }), p = players("amy", "bo", "cy");
  assert.equal(betStatus(b, [], p, T0 + H), "live");
  assert.equal(betStatus(b, [], p, T0 + 25 * H), "deciding");
  const won = { ...b, result: { winners: ["bo", "cy"], wash: false, at: T0 + 26 * H, by: "amy" } };
  assert.equal(betStatus(won, [], p, T0 + 26 * H), "done");
  assert.equal(finalAt(won, [], p), T0 + 26 * H);
  const r = betResult(won, [], p);
  assert.deepEqual(r.winners, ["bo", "cy"]); assert.equal(r.shares.get("bo"), 7.5); assert.equal(r.shares.get("cy"), 7.5);
  // Settled early (it's already decided): done straight away.
  assert.equal(betStatus({ ...b, result: { winners: ["amy"], wash: false, at: T0 + 2 * H, by: "amy" } }, [], p, T0 + 2 * H), "done");
  // A wash, and a winner who isn't in the bet doesn't count.
  assert.equal(betResult({ ...b, result: { winners: [], wash: true, at: T0, by: "amy" } }, [], p).wash, true);
  assert.equal(betResult({ ...b, result: { winners: ["zed"], wash: false, at: T0, by: "amy" } }, [], p).wash, true);
  // It has to say what wins.
  assert.match(betProblem({ ...b, note: "" }, T0 - 2 * H), /what wins/);
  assert.equal(ruleText(b.rule), "The organiser decides, from proof photos");
});

test("bell: the organiser is told to settle a bet that's over", () => {
  const b = bet({ note: "First to the launch" }, { win: "called" });
  const data = { catches: [], derbies: [], entrants: new Map(), name, now: T0 + 25 * H, crowns: [], badges: [],
    bets: new Map([["b1", b]]), betPlayers: new Map([["b1", players("amy", "bo")]]) };
  assert.ok(alertsFor("amy", data).some(a => a.id === "betcall:b1"));
  assert.ok(!alertsFor("bo", data).some(a => a.id === "betcall:b1"));
});
