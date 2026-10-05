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
