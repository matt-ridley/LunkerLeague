// Unit tests for feed news, the bell's alerts and badge timing. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { recordSteals, leagueEvents, alertsFor, unreadCount } from "../js/events.js";
import { badgeTimeline, badgesFor } from "../js/rank.js";
import { DEFAULTS } from "../js/derby.js";

const H = 3600e3, DAY = 24 * H;
const T0 = new Date(2026, 4, 1, 8).getTime();
let n = 0;
const fish = (uid, species, weightOz, t, extra = {}) => ({ id: "c" + ++n, uid, species, weightOz, lengthIn: null, caughtAt: t, createdAt: t, ...extra });
const name = u => u.toUpperCase();
const base = (extra = {}) => ({ catches: [], derbies: [], entrants: new Map(), name, now: T0 + 10 * DAY, ...extra });

test("a record changing hands is news; beating your own record isn't", () => {
  const catches = [fish("amy", "Walleye", 80, T0), fish("amy", "Walleye", 90, T0 + H), fish("bo", "Walleye", 95, T0 + 2 * H), fish("cy", "Walleye", 70, T0 + 3 * H)];
  const s = recordSteals(catches);
  assert.equal(s.length, 1);
  assert.equal(s[0].c.uid, "bo"); assert.equal(s[0].from.uid, "amy");
  const ev = leagueEvents(base({ catches }));
  assert.ok(ev.some(e => e.text === "BO took the season Walleye weight record from AMY"));
});

test("disqualified catches and stringers never take a record", () => {
  const catches = [fish("amy", "Perch", 10, T0), fish("bo", "Perch", 20, T0 + H, { dq: true }), fish("cy", "Perch", 500, T0 + H, { fishCount: 30, limit: true })];
  assert.equal(recordSteals(catches).length, 0);
});

test("badges are dated when they were earned and end up the same as badgesFor", () => {
  const catches = [fish("amy", "Perch", 5, T0), ...Array.from({ length: 10 }, (_, i) => fish("bo", "Bass", 30, T0 + i * H, { released: true }))];
  const tl = badgeTimeline({ catches, derbies: [], entrants: new Map(), now: T0 + DAY });
  const bo = tl.filter(b => b.uid === "bo");
  assert.deepEqual(bo.map(b => b.badge.id), ["first", "recordSet", "lunch", "release", "fish10", "bigDay"]);
  assert.equal(bo.find(b => b.badge.id === "release").at, T0 + 9 * H); // the 10th release
  for (const u of ["amy", "bo"]) {
    assert.deepEqual(tl.filter(b => b.uid === u).map(b => b.badge.id).sort(),
      badgesFor(u, { catches, derbies: [], entrants: new Map(), now: T0 + DAY }).map(b => b.id).sort());
  }
});

test("finished derbies announce the podium; test derbies don't", () => {
  const d = { ...DEFAULTS, id: "d1", name: "Spring Derby", start: T0, end: T0 + 5 * H, syncGraceHours: 0 };
  const t = { ...d, id: "d2", name: "Practice", testing: true };
  const ent = new Map([["d1", new Map([["amy", {}], ["bo", {}]])], ["d2", new Map([["amy", {}]])]]);
  const catches = [fish("amy", "Walleye", 80, T0 + H, { derbyId: "d1" }), fish("bo", "Walleye", 90, T0 + H, { derbyId: "d1" }), fish("amy", "Walleye", 99, T0 + H, { derbyId: "d2" })];
  const ev = leagueEvents(base({ catches, derbies: [d, t], entrants: ent }));
  const derbyNews = ev.filter(e => e.id.startsWith("derby:"));
  assert.equal(derbyNews.length, 1);
  assert.equal(derbyNews[0].text, "Spring Derby is over: 🥇 BO · 🥈 AMY");
  const alerts = alertsFor("amy", base({ catches, derbies: [d, t], entrants: ent }));
  assert.ok(alerts.some(a => a.text === "Spring Derby is over. You finished 2nd."));
  assert.ok(alerts.some(a => a.text === "Spring Derby is live. Go get 'em!"));
});

test("the bell: mentions, comments and reactions on my catches, records taken from me, trips, and new catches", () => {
  const mine = fish("amy", "Walleye", 80, T0), theirs = fish("bo", "Walleye", 90, T0 + H);
  const comments = new Map([
    [mine.id, [{ id: "k1", uid: "bo", text: "Nice fish", at: T0 + 2 * H }, { id: "k2", uid: "amy", text: "Thanks", at: T0 + 3 * H }]],
    [theirs.id, [{ id: "k3", uid: "cy", text: "@Amy look", at: T0 + 4 * H, mentions: ["amy"] }, { id: "k4", uid: "cy", text: "wow", at: T0 + 4 * H }]],
  ]);
  const reactions = new Map([[mine.id, new Map([["bo", { emojis: ["🔥", "🤥"], at: T0 + 5 * H }], ["amy", { emojis: ["🎣"], at: T0 + 5 * H }]])]]);
  const chat = [{ id: "m1", uid: "bo", text: "@Amy you coming?", at: T0 + 6 * H, mentions: ["amy"] }, { id: "m2", uid: "bo", text: "hi all", at: T0 + 6 * H }];
  const trips = new Map([["t1", { id: "t1", uid: "bo", title: "Saturday walleye", at: T0 + 3 * DAY, createdAt: T0 + 7 * H }],
    ["t2", { id: "t2", uid: "amy", title: "Perch run", at: T0 + 4 * DAY, createdAt: T0 + 7 * H }]]);
  const rsvps = new Map([["t2", new Map([["bo", { answer: "in", at: T0 + 8 * H }], ["amy", { answer: "in", at: T0 + 7 * H }]])]]);
  const a = alertsFor("amy", base({ catches: [mine, theirs], comments, reactions, chat, trips, rsvps }), { seen: T0 + 30 * 60e3 });
  const texts = a.map(x => x.text);
  assert.deepEqual(texts, [
    "BO is in for Perch run",
    "BO is heading out: Saturday walleye. Are you in?",
    "BO mentioned you in chat: “@Amy you coming?”",
    "BO reacted 🔥🤥 to your Walleye",
    "CY mentioned you on BO's Walleye: “@Amy look”",
    "BO commented on your Walleye: “Nice fish”",
    "BO took your season Walleye weight record",
    "BO logged a Walleye",
    "You earned the First Fish badge",
    "You earned the Five Pounder badge",
    "You earned the Record Setter badge",
  ]);
  assert.equal(unreadCount(a, T0 + 5.5 * H), 3);
});

test("new catches since the bell was last opened are summed up in one line", () => {
  const catches = [fish("bo", "Perch", 5, T0), fish("cy", "Perch", 5, T0 + H, { fishCount: 40, limit: true }), fish("amy", "Perch", 5, T0 + 2 * H)];
  const a = alertsFor("amy", base({ catches }), { seen: T0 - 1 }).find(x => x.id.startsWith("catches"));
  assert.equal(a.text, "2 new catches (41 fish) since you last looked");
  assert.equal(alertsFor("amy", base({ catches }), { seen: T0 + 2 * H }).find(x => x.id.startsWith("catches")), undefined);
});

test("alert ids stay the same when news only moves in time, and change when the news itself changes", () => {
  const later = fish("amy", "Walleye", 80, T0 + 5 * H);
  const before = alertsFor("amy", base({ catches: [later] })).find(a => a.text === "You earned the First Fish badge");
  const earlier = fish("amy", "Pike", 50, T0); // logged afterwards, caught earlier
  const after = alertsFor("amy", base({ catches: [later, earlier] })).find(a => a.text === "You earned the First Fish badge");
  assert.notEqual(before.at, after.at);
  assert.equal(before.id, after.id); // cleared once, stays cleared
  const r = emojis => alertsFor("amy", base({ catches: [later], reactions: new Map([[later.id, new Map([["bo", { emojis, at: T0 + 6 * H }]])]]) })).find(a => a.id.startsWith("re:")).id;
  assert.notEqual(r(["🔥"]), r(["🔥", "🤥"])); // a changed reaction is new
});

test("a catch logged late dates its news, and the bell, by when it was posted", () => {
  // Bo logs a pike 2 days after catching it (within the grace days): his badges and the record show up now, not 2 days back.
  const catches = [fish("amy", "Pike", 80, T0), fish("amy", "Perch", 5, T0 + 3 * DAY), fish("bo", "Pike", 90, T0 + DAY, { createdAt: T0 + 3 * DAY + H })];
  const ev = leagueEvents(base({ catches }));
  assert.equal(ev.find(e => e.id === `rec:${catches[2].id}:weightOz`).at, T0 + 3 * DAY + H);
  assert.equal(ev.find(e => e.id === "badge:bo:first").at, T0 + 3 * DAY + H);
  assert.equal(ev.find(e => e.id === "badge:amy:first").at, T0); // on time: unchanged
  assert.equal(ev[0].uids[0], "bo"); // newest news is Bo's, above Amy's perch day
  const amy = alertsFor("amy", base({ catches }), { seen: T0 + 3 * DAY });
  assert.ok(amy.some(a => a.text === "BO took your season Pike weight record" && a.at > T0 + 3 * DAY));
});

test("news a catch caused names that catch, so the feed can show it on the card", () => {
  const catches = [fish("amy", "Pike", 80, T0), fish("bo", "Pike", 90, T0 + DAY, { createdAt: T0 + 2 * DAY })];
  const ev = leagueEvents(base({ catches }));
  const rec = ev.find(e => e.id.startsWith("rec:"));
  assert.equal(rec.cid, catches[1].id);
  assert.equal(rec.short, "Took the season weight record from AMY");
  const first = ev.find(e => e.id === "badge:bo:first");
  assert.equal(first.cid, catches[1].id);
  assert.equal(first.short, "Earned the First Fish badge");
  assert.equal(ev.find(e => e.id === "badge:amy:first").cid, catches[0].id);
});

test("approval alerts: the organiser hears about entries to approve; the angler hears when theirs is approved", () => {
  const d = { ...DEFAULTS, id: "d1", name: "Walleye Weekend", organiserUid: "org", start: T0, end: T0 + DAY, approval: true, createdAt: T0 - DAY };
  const waiting = fish("amy", "Walleye", 40, T0 + H, { derbyId: "d1" });
  const ok = fish("amy", "Walleye", 50, T0 + 2 * H, { derbyId: "d1", approved: true, approvedAt: T0 + 3 * H });
  const own = fish("org", "Walleye", 30, T0 + 2 * H, { derbyId: "d1", approved: true, approvedAt: T0 + 2 * H });
  const data = base({ catches: [waiting, ok, own], derbies: [d] });
  const org = alertsFor("org", data).filter(a => a.id.startsWith("approve"));
  assert.deepEqual(org.map(a => a.id), [`approve:${waiting.id}`]);
  assert.match(org[0].text, /AMY entered a .*Walleye.* in Walleye Weekend\. Approve it\?/);
  const amy = alertsFor("amy", data).filter(a => a.id.startsWith("approve"));
  assert.deepEqual(amy.map(a => a.id), [`approved:${ok.id}:${T0 + 3 * H}`]);
  // The organiser approving their own entry isn't news to them.
  assert.equal(alertsFor("org", data).some(a => a.id.startsWith("approved:")), false);
  // Approval off: no alerts either way.
  assert.equal(alertsFor("org", base({ catches: [waiting], derbies: [{ ...d, approval: false }] })).some(a => a.id.startsWith("approve")), false);
});

test("the first record of a new season isn't taken from last season's holder", () => {
  const a = { id: "a", uid: "amy", species: "Walleye", weightOz: 90, lengthIn: null, caughtAt: new Date(2026, 9, 1).getTime() };
  const b = { id: "b", uid: "bo", species: "Walleye", weightOz: 100, lengthIn: null, caughtAt: new Date(2027, 1, 1).getTime() };
  const c = { id: "c", uid: "amy", species: "Walleye", weightOz: 110, lengthIn: null, caughtAt: new Date(2027, 2, 1).getTime() };
  assert.deepEqual(recordSteals([a, b]), []);
  assert.deepEqual(recordSteals([a, b, c]).map(s => [s.c.id, s.from.id]), [["c", "b"]]);
});

test("the final whistle and a new season are news", () => {
  const t26 = new Date(2026, 9, 1).getTime(), now = new Date(2027, 0, 10).getTime();
  const catches = [{ id: "a", uid: "amy", species: "Perch", weightOz: null, lengthIn: null, caughtAt: t26, createdAt: t26 }];
  const seasonDocs = new Map([[2026, { year: 2026, champion: "amy", lockedAt: new Date(2027, 0, 8).getTime(), standings: [] }]]);
  const ev = leagueEvents({ catches, derbies: [], entrants: new Map(), badges: [], crowns: [], seasonDocs, name: u => u.toUpperCase(), now });
  assert.equal(ev.find(e => e.id === "season:2026").text, "Final whistle: the 2026 Preseason is locked. AMY finishes on top (unofficially)!");
  assert.equal(ev.find(e => e.id === "seasonopen:2027").text, "Season 1 (2027) is open: points, titles, crowns, season records and season badges all start again. Tight lines!");
  assert.equal(leagueEvents({ catches, derbies: [], entrants: new Map(), badges: [], crowns: [], name: u => u, now: t26 + 1 }).find(e => e.id.startsWith("seasonopen")), undefined);
});

test("boats changing hands: an offer in the new captain's bell, news for everyone, and a note for the old captain", () => {
  const offered = new Map([["b1", { id: "b1", uid: "amy", name: "Lund", createdAt: T0, offerTo: "bo", offerAt: T0 + H }]]);
  const offer = alertsFor("bo", base({ fleet: offered })).find(a => a.id.startsWith("boatoffer"));
  assert.match(offer.text, /wants to hand Lund over to you/);
  assert.equal(offer.href, "#/boat/b1");
  assert.equal(alertsFor("cy", base({ fleet: offered })).find(a => a.id.startsWith("boatoffer")), undefined);
  const moved = new Map([["b1", { id: "b1", uid: "bo", name: "Lund", createdAt: T0, captains: [{ uid: "amy", at: T0 }, { uid: "bo", at: T0 + 2 * H }] }]]);
  const news = leagueEvents(base({ fleet: moved })).find(e => e.id.startsWith("captain:"));
  assert.equal(news.at, T0 + 2 * H);
  assert.match(news.text, /is the new captain of Lund/);
  assert.ok(alertsFor("amy", base({ fleet: moved })).some(a => a.id.startsWith("captain:") && /took over Lund/.test(a.text)));
  assert.ok(!alertsFor("bo", base({ fleet: moved })).some(a => a.id.startsWith("captain:")));
});
