// Rules for derbies: creating and changing them, joining, entering catches, disqualifying, and derby chat.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { startEnv, seedLeague, as } from "./helpers.mjs";

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
  thumb: "data:image/jpeg;base64,AA", photoTakenAt: null, notes: "", released: true, hasSpot: false, locShared: false,
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
  await assertSucceeds(setDoc(doc(as(env, "member"), "catches/e1"), entry("member")));
  await assertFails(setDoc(doc(as(env, "admin2"), "catches/e2"), entry("admin2")));  // didn't join
  await assertFails(setDoc(doc(as(env, "member"), "catches/e3"), entry("member", { caughtAt: Date.now() - 3 * H })));  // before start
  await assertFails(setDoc(doc(as(env, "member"), "catches/e4"), entry("member", { weightOz: null })));  // heaviest needs a weight
  await assertFails(setDoc(doc(as(env, "member"), "catches/e5"), entry("member", { dq: true })));
});

test("late entries sync during the grace period, but not after it", async () => {
  await seedDerby({ start: Date.now() - 10 * H, end: Date.now() - 5 * H, syncGraceHours: 24 });
  await assertSucceeds(setDoc(doc(as(env, "member"), "catches/e1"), entry("member", { caughtAt: Date.now() - 6 * H })));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), "derbies/d1"), { syncGraceHours: 2 }));
  await assertFails(setDoc(doc(as(env, "member"), "catches/e2"), entry("member", { caughtAt: Date.now() - 6 * H })));
  await assertFails(updateDoc(doc(as(env, "member"), "catches/e1"), { weightOz: 200 }));  // locked once closed
});

test("derby rules are enforced: species, minimums, release, spot and crew", async () => {
  await seedDerby({ species: ["Walleye"], minWeightOz: 32, minLengthIn: 15, catchRelease: true, requireLocation: true, requireCrew: true });
  const db = as(env, "member");
  const crew = { captain: { uid: "admin2" }, netman: { guest: "Sam" }, hasSpot: true, locShared: true };
  await assertFails(setDoc(doc(db, "catches/a"), entry("member", { ...crew, species: "Northern Pike" })));
  await assertFails(setDoc(doc(db, "catches/b"), entry("member", { ...crew, weightOz: 20 })));
  await assertFails(setDoc(doc(db, "catches/c"), entry("member", { ...crew, lengthIn: 12 })));
  await assertFails(setDoc(doc(db, "catches/d"), entry("member", { ...crew, released: false })));
  await assertFails(setDoc(doc(db, "catches/e"), entry("member", { ...crew, locShared: false })));
  await assertFails(setDoc(doc(db, "catches/f"), entry("member", { ...crew, netman: null })));
  await assertFails(setDoc(doc(db, "catches/g"), entry("member", { ...crew, captain: { uid: "x", guest: "y" } })));
});

test("the organiser can disqualify an entry (and nothing else); the angler can't undo it", async () => {
  await seedDerby();
  await setDoc(doc(as(env, "member"), "catches/e1"), entry("member"));
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
