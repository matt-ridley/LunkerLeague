// Rules for derbies: creating and changing them, joining, entering catches, disqualifying, and derby chat.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { startEnv, seedLeague, as, putCatch, THUMB } from "./helpers.mjs";

const H = 3600 * 1000;
let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const derbyData = (organiserUid, extra = {}) => ({
  name: "Walleye Weekend", description: "", organiserUid, start: Date.now() - 2 * H, end: Date.now() + 2 * H, syncGraceHours: 24,
  species: [], scoring: "heaviest", bagSize: 5, minWeightOz: 0, minLengthIn: 0, maxEntries: 0, proof: "scale",
  requireLocation: false, catchRelease: false, requireCrew: false, prizeNote: "", cancelled: false, createdAt: Date.now(), ...extra,
});
const entry = (uid, extra = {}) => ({
  uid, species: "Walleye", weightOz: 80, lengthIn: 22, caughtAt: Date.now() - H, createdAt: Date.now(),
  thumb: THUMB, photoTakenAt: null, notes: "", released: true, hasSpot: false, locShared: false,
  spotName: "", derbyId: "d1", ...extra,
});
const seedDerby = (extra = {}, entrants = ["member"]) => env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, "derbies/d1"), derbyData("admin2", extra));
  for (const u of entrants) await setDoc(doc(db, "derbies/d1/entrants", u), { joinedAt: 1 });
});

test("any member can create a derby as its organiser; it must be sensible", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "derbies/d1"), derbyData("member")));
  await assertFails(setDoc(doc(db, "derbies/d2"), derbyData("admin2")));
  await assertFails(setDoc(doc(db, "derbies/d3"), derbyData("member", { end: 0 })));
  await assertFails(setDoc(doc(db, "derbies/d4"), derbyData("member", { scoring: "luck" })));
  await assertFails(setDoc(doc(as(env, "stranger"), "derbies/d5"), derbyData("stranger")));
});

test("only the organiser or an admin can change a derby; nobody can delete one", async () => {
  await seedDerby();
  await assertFails(updateDoc(doc(as(env, "member"), "derbies/d1"), { name: "Mine" }));
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), "derbies/d1"), { name: "Renamed" }));
  await assertSucceeds(updateDoc(doc(as(env, "owner"), "derbies/d1"), { cancelled: true }));
  await assertFails(updateDoc(doc(as(env, "admin2"), "derbies/d1"), { organiserUid: "member" }));
  await assertFails(deleteDoc(doc(as(env, "admin2"), "derbies/d1")));
});

test("joining: yourself only, and not after the derby ends", async () => {
  await seedDerby({}, []);
  await assertSucceeds(setDoc(doc(as(env, "member"), "derbies/d1/entrants/member"), { joinedAt: Date.now() }));
  await assertFails(setDoc(doc(as(env, "member"), "derbies/d1/entrants/admin2"), { joinedAt: Date.now() }));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "derbies/d2"), derbyData("admin2", { start: Date.now() - 5 * H, end: Date.now() - H })));
  await assertFails(setDoc(doc(as(env, "member"), "derbies/d2/entrants/member"), { joinedAt: Date.now() }));
  await assertSucceeds(deleteDoc(doc(as(env, "member"), "derbies/d1/entrants/member")));
});

test("entering: only anglers who joined, with a catch from during the derby", async () => {
  await seedDerby();
  await assertSucceeds(putCatch(as(env, "member"), "e1", entry("member")));
  await assertFails(putCatch(as(env, "admin2"), "e2", entry("admin2")));  // didn't join
  await assertFails(putCatch(as(env, "member"), "e3", entry("member", { caughtAt: Date.now() - 3 * H })));  // before start
  await assertFails(putCatch(as(env, "member"), "e4", entry("member", { weightOz: null })));  // heaviest needs a weight
  await assertFails(putCatch(as(env, "member"), "e5", entry("member", { dq: true })));
});

test("late entries sync during the grace period, but not after it", async () => {
  await seedDerby({ start: Date.now() - 10 * H, end: Date.now() - 5 * H, syncGraceHours: 24 });
  await assertSucceeds(putCatch(as(env, "member"), "e1", entry("member", { caughtAt: Date.now() - 6 * H })));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), "derbies/d1"), { syncGraceHours: 2 }));
  await assertFails(putCatch(as(env, "member"), "e2", entry("member", { caughtAt: Date.now() - 6 * H })));
  await assertFails(updateDoc(doc(as(env, "member"), "catches/e1"), { weightOz: 200 }));  // locked once closed
  // Moving the thumbnail is still fine: it isn't part of the entry.
  await assertSucceeds(updateDoc(doc(as(env, "member"), "catches/e1"), { focus: { x: 10, y: 50 } }));
  await assertFails(updateDoc(doc(as(env, "member"), "catches/e1"), { focus: { x: 10, y: 50 }, weightOz: 200 }));
});

test("derby rules are enforced: species, minimums, release, spot and crew", async () => {
  await seedDerby({ species: ["Walleye"], minWeightOz: 32, minLengthIn: 15, catchRelease: true, requireLocation: true, requireCrew: true });
  const db = as(env, "member");
  const crew = { captain: { uid: "admin2" }, netman: { guest: "Sam" }, hasSpot: true, locShared: true };
  await assertFails(putCatch(db, "a", entry("member", { ...crew, species: "Northern Pike" })));
  await assertFails(putCatch(db, "b", entry("member", { ...crew, weightOz: 20 })));
  await assertFails(putCatch(db, "c", entry("member", { ...crew, lengthIn: 12 })));
  await assertFails(putCatch(db, "d", entry("member", { ...crew, released: false })));
  await assertFails(putCatch(db, "e", entry("member", { ...crew, locShared: false })));
  await assertFails(putCatch(db, "f", entry("member", { ...crew, netman: null })));
  await assertFails(putCatch(db, "g", entry("member", { ...crew, captain: { uid: "x", guest: "y" } })));
});

test("the organiser can disqualify an entry (and nothing else); the angler can't undo it", async () => {
  await seedDerby();
  await putCatch(as(env, "member"), "e1", entry("member"));
  await assertFails(updateDoc(doc(as(env, "admin2"), "catches/e1"), { dq: true, dqReason: "No scale", weightOz: 1 }));
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), "catches/e1"), { dq: true, dqReason: "No scale in the photo" }));
  await assertFails(updateDoc(doc(as(env, "member"), "catches/e1"), { dq: false }));
  await assertSucceeds(updateDoc(doc(as(env, "member"), "catches/e1"), { notes: "It was on the scale, honest" }));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "members/other"), { displayName: "o", joinedAt: 1, suspended: false }));
  await assertFails(updateDoc(doc(as(env, "other"), "catches/e1"), { dq: false }));
});

test("derby chat: members post as themselves", async () => {
  await seedDerby();
  await assertSucceeds(setDoc(doc(as(env, "member"), "derbies/d1/chat/m1"), { uid: "member", text: "Game on", at: Date.now() }));
  await assertFails(setDoc(doc(as(env, "member"), "derbies/d1/chat/m2"), { uid: "admin2", text: "Fake", at: Date.now() }));
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "derbies/d1/chat/m1")));
  await assertFails(getDoc(doc(as(env, "stranger"), "derbies/d1/chat/m1")));
});

test("money settings: sensible values only; old derbies without them still work", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "derbies/m1"), derbyData("member", { entryFee: 20, addedMoney: 50, payoutPcts: [70, 30],
    unpaidCanWin: false, captainPct: 10, netmanPct: 5, roundTo: 1, sidePotFee: 5 })));
  await assertFails(setDoc(doc(db, "derbies/m2"), derbyData("member", { entryFee: -5 })));
  await assertFails(setDoc(doc(db, "derbies/m3"), derbyData("member", { captainPct: 80 })));
  await assertFails(setDoc(doc(db, "derbies/m4"), derbyData("member", { roundTo: 3 })));
  await seedDerby();
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), "derbies/d1"), { name: "Still fine without money fields" }));
});

test("only the organiser or an admin can tick who has paid", async () => {
  await seedDerby({}, ["member", "admin2"]);
  const paid = by => ({ paid: true, paidAt: Date.now(), paidMarkedBy: by, sidePotPaid: true });
  await assertFails(updateDoc(doc(as(env, "member"), "derbies/d1/entrants/member"), paid("member")));
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), "derbies/d1/entrants/member"), paid("admin2")));
  await assertFails(updateDoc(doc(as(env, "admin2"), "derbies/d1/entrants/member"), { joinedAt: 5 }));
  await assertFails(updateDoc(doc(as(env, "owner"), "derbies/d1/entrants/admin2"), paid("someone-else")));
  await assertFails(setDoc(doc(as(env, "member"), "derbies/d1/entrants/member"), { joinedAt: 1, paid: true }));
});

test("settled ticks: the organiser or an admin records them; everyone can see them", async () => {
  await seedDerby();
  await assertSucceeds(setDoc(doc(as(env, "admin2"), "derbies/d1/settlements/u:member"), { amount: 72, settledAt: Date.now(), by: "admin2" }));
  await assertFails(setDoc(doc(as(env, "member"), "derbies/d1/settlements/u:member"), { amount: 999, settledAt: Date.now(), by: "member" }));
  await assertSucceeds(getDoc(doc(as(env, "member"), "derbies/d1/settlements/u:member")));
  await assertSucceeds(deleteDoc(doc(as(env, "owner"), "derbies/d1/settlements/u:member")));
});

test("deleting: the organiser only a testing derby; the league owner any derby; nobody can sneak the flag on", async () => {
  await seedDerby();                                                    // organised by admin2, not testing
  await assertFails(deleteDoc(doc(as(env, "admin2"), "derbies/d1")));
  await assertFails(updateDoc(doc(as(env, "admin2"), "derbies/d1"), { testing: true }));
  await assertSucceeds(deleteDoc(doc(as(env, "owner"), "derbies/d1")));
  await assertSucceeds(setDoc(doc(as(env, "member"), "derbies/t1"), derbyData("member", { testing: true })));
  await assertSucceeds(deleteDoc(doc(as(env, "member"), "derbies/t1")));
});

test("ending early: the organiser moves the end time to now", async () => {
  await seedDerby();
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), "derbies/d1"), { end: Date.now() }));
  await assertFails(updateDoc(doc(as(env, "member"), "derbies/d1"), { end: Date.now() }));
});

test("the organiser can enter a catch for an angler who joined, and edit or delete it", async () => {
  await seedDerby();                                                    // member has joined; admin2 organises
  const db = as(env, "admin2");
  await assertSucceeds(putCatch(db, "ob1", entry("member", { enteredBy: "admin2" })));
  await assertFails(putCatch(db, "ob2", entry("owner", { enteredBy: "admin2" })));         // owner didn't join
  await assertFails(putCatch(db, "ob3", entry("member", { enteredBy: "admin2", derbyId: null })));  // only for a derby
  await assertFails(putCatch(as(env, "owner"), "ob4", entry("member", { enteredBy: "owner" })));  // not the organiser
  await assertFails(putCatch(as(env, "member"), "ob5", entry("member", { enteredBy: "admin2" }))); // can't fake enteredBy
  await assertSucceeds(updateDoc(doc(db, "catches/ob1"), { weightOz: 90 }));
  await assertSucceeds(updateDoc(doc(as(env, "member"), "catches/ob1"), { notes: "Thanks for entering it" }));
  await assertFails(updateDoc(doc(as(env, "member"), "catches/ob1"), { enteredBy: null }));
  // a spot the organiser tags for someone else must be shared
  const b = (await import("firebase/firestore")).writeBatch(db);
  b.set(doc(db, "catches/ob6"), entry("member", { enteredBy: "admin2", hasSpot: true, locShared: false }));
  b.set(doc(db, "spots/ob6"), { uid: "admin2", lat: 1, lng: 1, acc: 5, name: "", shared: false });
  await assertFails(b.commit());
  // and so must tackle; the angler can still delete the catch and the tackle the organiser added
  const t1 = (await import("firebase/firestore")).writeBatch(db);
  t1.set(doc(db, "catches/ob7"), entry("member", { enteredBy: "admin2", hasTackle: true, tackleShared: false }));
  t1.set(doc(db, "tackle/ob7"), { uid: "admin2", lure: "Jig", depthFt: null, technique: "", shared: false });
  await assertFails(t1.commit());
  const t2 = (await import("firebase/firestore")).writeBatch(db);
  t2.set(doc(db, "catches/ob8"), entry("member", { enteredBy: "admin2", hasTackle: true, tackleShared: true }));
  t2.set(doc(db, "tackle/ob8"), { uid: "admin2", lure: "Jig", depthFt: null, technique: "", shared: true });
  t2.set(doc(db, "photos/ob8"), { uid: "admin2", src: "data:image/jpeg;base64,BBBB" });
  await assertSucceeds(t2.commit());
  const angler = as(env, "member");
  const t3 = (await import("firebase/firestore")).writeBatch(angler);
  t3.delete(doc(angler, "catches/ob8"));
  t3.delete(doc(angler, "tackle/ob8"));
  await assertSucceeds(t3.commit());
  await assertSucceeds(deleteDoc(doc(db, "catches/ob1")));
});

test("clearing out a testing derby: its organiser can delete everyone's entries in it; not in a real one", async () => {
  // "member" is an ordinary member (not an admin) organising a testing derby that "other" entered.
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "members/other"), { displayName: "other", joinedAt: 1, suspended: false });
    await setDoc(doc(db, "derbies/t1"), derbyData("member", { testing: true }));
    await setDoc(doc(db, "derbies/t1/entrants/other"), { joinedAt: 1 });
    await putCatch(db, "te1", entry("other", { derbyId: "t1" }));
    await setDoc(doc(db, "photos/te1"), { uid: "other", src: "x" });
    await setDoc(doc(db, "catches/te1/comments/k1"), { uid: "owner", text: "fake!", at: 1 });
    await setDoc(doc(db, "catches/te1/reactions/owner"), { uid: "owner", emojis: ["🤥"], at: 1 });
    await setDoc(doc(db, "derbies/r1"), derbyData("member"));            // a real derby by the same organiser
    await setDoc(doc(db, "derbies/r1/entrants/other"), { joinedAt: 1 });
    await putCatch(db, "re1", entry("other", { derbyId: "r1" }));
  });
  const db = as(env, "member");
  const { writeBatch } = await import("firebase/firestore");
  const b = writeBatch(db);
  for (const p of ["catches/te1/comments/k1", "catches/te1/reactions/owner", "photos/te1", "catches/te1", "derbies/t1/entrants/other", "derbies/t1"]) b.delete(doc(db, p));
  await assertSucceeds(b.commit());
  await assertFails(deleteDoc(doc(db, "catches/re1")));
  await assertFails(deleteDoc(doc(db, "derbies/r1")));
});

test("after the owner deletes a real derby, its old entries become ordinary catches the angler can edit", async () => {
  await seedDerby();
  await putCatch(as(env, "member"), "e1", entry("member"));
  await deleteDoc(doc(as(env, "owner"), "derbies/d1"));
  await assertSucceeds(updateDoc(doc(as(env, "member"), "catches/e1"), { derbyId: null, notes: "now just a catch" }));
});

test("a stringer can't be entered in a derby, even a most-fish one", async () => {
  await seedDerby({ scoring: "most" });
  const str = { weightOz: null, lengthIn: null, released: false, fishCount: 20, limit: true };
  await assertFails(putCatch(as(env, "member"), "s1", entry("member", str)));
  await assertSucceeds(putCatch(as(env, "member"), "s2", entry("member", { ...str, derbyId: null })));
});

test("a past catch can't be a derby entry", async () => {
  await seedDerby();
  await assertFails(putCatch(as(env, "member"), "pe1", entry("member", { past: true })));
});

test("mystery weight: hidden from everyone but the organiser and admins until final entries close", async () => {
  await seedDerby({ start: Date.now() + H, end: Date.now() + 5 * H, mystery: true }); // organiser: admin2; starts in an hour
  const secret = db => doc(db, "derbies/d1/secret/mystery");
  const w = (who, oz) => setDoc(secret(as(env, who)), { weightOz: oz, setBy: who, setAt: Date.now() });
  await assertFails(w("member", 52));                       // not the organiser
  await assertSucceeds(w("admin2", 52));
  await assertSucceeds(w("admin2", 54));                    // can change it before the start
  await assertFails(w("admin2", -1));
  await assertFails(getDoc(secret(as(env, "member"))));     // members can't peek
  await assertSucceeds(getDoc(secret(as(env, "admin2"))));
  await assertSucceeds(getDoc(secret(as(env, "owner"))));   // admins can
  // Once the derby has started it's locked.
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), "derbies/d1"), { start: Date.now() - H }));
  await assertFails(w("admin2", 60));
  await assertFails(deleteDoc(secret(as(env, "admin2"))));
  // After final entries close, everyone can see it.
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), "derbies/d1"), { start: Date.now() - 30 * H, end: Date.now() - 26 * H }));
  await assertSucceeds(getDoc(secret(as(env, "member"))));
  // A derby saved with a mystery note must keep it short.
  await assertFails(updateDoc(doc(as(env, "admin2"), "derbies/d1"), { mysteryNote: "x".repeat(101) }));
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), "derbies/d1"), { mysteryNote: "$20 card" }));
});

test("mystery weight: revealed right after the end when there's no late-entry window", async () => {
  await seedDerby({ start: Date.now() - 2 * H, end: Date.now() - 60000, syncGraceHours: 0, mystery: true, mysteryNote: "" });
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "derbies/d1/secret/mystery"), { weightOz: 52, setBy: "admin2", setAt: 1 }));
  await assertSucceeds(getDoc(doc(as(env, "member"), "derbies/d1/secret/mystery")));
});

test("categories: a derby can have up to 6; a fish only needs what one category needs", async () => {
  const cats = [{ id: "c1", name: "Big Bass", species: ["Walleye"], scoring: "heaviest", bagSize: 5, pct: 50, payoutPcts: [100] },
    { id: "c2", name: "Long Pike", species: ["Northern Pike"], scoring: "longest", bagSize: 5, pct: 50, payoutPcts: [100] }];
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "derbies/d9"), derbyData("member", { categories: cats, species: ["Walleye", "Northern Pike"], mysteryPct: 0 })));
  await assertFails(setDoc(doc(db, "derbies/d8"), derbyData("member", { categories: Array(7).fill(cats[0]) })));
  await assertFails(setDoc(doc(db, "derbies/d7"), derbyData("member", { mysteryPct: 150 })));
  await seedDerby({ scoring: "heaviest", categories: cats, species: ["Walleye", "Northern Pike"] });
  // An unweighed pike can still go on the longest board.
  await assertSucceeds(putCatch(as(env, "member"), "e1", entry("member", { species: "Northern Pike", weightOz: null, lengthIn: 30 })));
  await assertFails(putCatch(as(env, "member"), "e2", entry("member", { species: "Perch" })));
});

test("teams: pick one when joining; switch only before the start; the organiser moves anyone", async () => {
  await seedDerby({ start: Date.now() + H, end: Date.now() + 5 * H, teams: [{ id: "t1", name: "Red" }, { id: "t2", name: "Blue" }] }, []);
  const me = as(env, "member"), path = "derbies/d1/entrants/member";
  await assertSucceeds(setDoc(doc(me, path), { joinedAt: Date.now(), team: "t1" }));
  await assertFails(setDoc(doc(me, "derbies/d1/entrants/admin2"), { joinedAt: Date.now(), team: "t1" }));
  await assertSucceeds(updateDoc(doc(me, path), { team: "t2" }));                 // before the start
  await assertFails(updateDoc(doc(me, path), { team: "t1", paid: true }));        // can't tick yourself paid
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), "derbies/d1"), { start: Date.now() - H }));
  await assertFails(updateDoc(doc(me, path), { team: "t1" }));                    // started: no switching
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), path), { team: "t1" }));  // the organiser can move you
  // Someone with no team yet can still pick one after the start.
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "derbies/d1/entrants/owner"), { joinedAt: 1 }));
  await assertSucceeds(updateDoc(doc(as(env, "owner"), "derbies/d1/entrants/owner"), { team: "t2" }));
  await assertFails(setDoc(doc(me, "derbies/d9"), derbyData("member", { teams: Array(13).fill({ id: "x", name: "x" }) })));
});

test("a derby can count toward a season series", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "derbies/d9"), derbyData("member", { seriesId: "s1" })));
  await assertFails(setDoc(doc(db, "derbies/d8"), derbyData("member", { seriesId: 7 })));
});

test("team scoring is either added up or as one boat", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "derbies/d9"), derbyData("member", { teamScoring: "boat" })));
  await assertFails(setDoc(doc(db, "derbies/d8"), derbyData("member", { teamScoring: "best" })));
});

test("fair play settings: a short photo code word and an approval switch", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "derbies/f1"), derbyData("member", { codeWord: "PIKE 47", approval: true })));
  await assertSucceeds(setDoc(doc(db, "derbies/f2"), derbyData("member", { codeWord: "", approval: false })));
  await assertFails(setDoc(doc(db, "derbies/f3"), derbyData("member", { codeWord: "X".repeat(21) })));
  await assertFails(setDoc(doc(db, "derbies/f4"), derbyData("member", { codeWord: 47 })));
  await assertFails(setDoc(doc(db, "derbies/f5"), derbyData("member", { approval: "yes" })));
});

test("approval: only the organiser (or an admin) approves; changing an approved fish takes the approval away", async () => {
  await seedDerby({ approval: true }, ["member", "admin2"]);             // admin2 organises
  const me = as(env, "member"), org = as(env, "admin2");
  await assertFails(putCatch(me, "a0", entry("member", { approved: true, approvedAt: Date.now() })));  // can't approve your own
  await assertSucceeds(putCatch(me, "a1", entry("member")));
  await assertFails(updateDoc(doc(me, "catches/a1"), { approved: true, approvedAt: Date.now() }));
  await assertFails(updateDoc(doc(org, "catches/a1"), { approved: true, approvedAt: Date.now(), weightOz: 200 })); // nothing else
  await assertFails(updateDoc(doc(org, "catches/a1"), { approved: "yes" }));
  await assertSucceeds(updateDoc(doc(org, "catches/a1"), { approved: true, approvedAt: Date.now() }));
  // The angler can still fix the notes or crew without losing the approval...
  await assertSucceeds(updateDoc(doc(me, "catches/a1"), { notes: "Caught on a jig" }));
  await assertFails(updateDoc(doc(me, "catches/a1"), { approvedAt: Date.now() + 1 }));
  // ...but a new weight, photo, time or species needs approving again.
  await assertFails(updateDoc(doc(me, "catches/a1"), { weightOz: 120 }));
  await assertFails(updateDoc(doc(me, "catches/a1"), { thumb: THUMB + "B" }));
  await assertFails(updateDoc(doc(me, "catches/a1"), { caughtAt: Date.now() - 2 * H + 60000 }));
  await assertSucceeds(updateDoc(doc(me, "catches/a1"), { weightOz: 120, approved: false }));
  await assertFails(updateDoc(doc(me, "catches/a1"), { approved: true }));
  // An admin who isn't the organiser can approve too.
  await assertSucceeds(updateDoc(doc(as(env, "owner"), "catches/a1"), { approved: true, approvedAt: Date.now() }));
  // The organiser's own saves are approved: their own entry, and one they enter for an angler.
  await assertSucceeds(putCatch(org, "a2", entry("admin2", { approved: true, approvedAt: Date.now() })));
  await assertSucceeds(putCatch(org, "a3", entry("member", { enteredBy: "admin2", approved: true, approvedAt: Date.now() })));
  await assertSucceeds(updateDoc(doc(org, "catches/a3"), { weightOz: 95 }));
});
