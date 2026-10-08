// Rules for catches, their photos and their (private or shared) GPS spots.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { startEnv, seedLeague, as, THUMB } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const catchData = (uid, extra = {}) => ({
  uid, species: "Walleye", weightOz: 88, lengthIn: 22.5, caughtAt: Date.now() - 60000, createdAt: Date.now(),
  thumb: THUMB, photoTakenAt: null, notes: "", released: true,
  hasSpot: false, locShared: false, spotName: "", ...extra,
});
const spotData = (uid, shared) => ({ uid, lat: 44.5, lng: -79.4, acc: 12, name: shared ? "North bay" : "", shared });

function saveAll(db, id, uid, { extra = {}, spot = null, photo = "data:image/jpeg;base64,BBBB" } = {}) {
  const b = writeBatch(db);
  b.set(doc(db, "catches", id), catchData(uid, extra));
  if (photo) b.set(doc(db, "photos", id), { uid, src: photo });
  if (spot) b.set(doc(db, "spots", id), spot);
  return b.commit();
}

test("a member can log a catch with its photo", async () => {
  await assertSucceeds(saveAll(as(env, "member"), "c1", "member"));
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "catches/c1")));
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "photos/c1")));
});

test("non-members can't read or log catches", async () => {
  await saveAll(as(env, "member"), "c1", "member");
  await assertFails(getDoc(doc(as(env, "stranger"), "catches/c1")));
  await assertFails(saveAll(as(env, "stranger"), "c2", "stranger"));
});

test("you can't log a catch as someone else or in the future; weight and length are optional", async () => {
  const db = as(env, "member");
  await assertFails(saveAll(db, "c1", "admin2"));
  await assertFails(saveAll(db, "c2", "member", { extra: { caughtAt: Date.now() + 3 * 3600 * 1000 } }));
  await assertSucceeds(saveAll(db, "c3", "member", { extra: { weightOz: null, lengthIn: null } }));
  await assertFails(saveAll(db, "c4", "member", { extra: { weightOz: -5 } }));
  await assertSucceeds(saveAll(db, "c5", "member", { extra: { weightOz: null } }));
});

test("a private spot's name can't leak into the catch", async () => {
  const db = as(env, "member");
  await assertFails(saveAll(db, "c1", "member", { extra: { hasSpot: true, locShared: false, spotName: "Secret hole" }, spot: spotData("member", false) }));
});

test("private spots are readable only by their owner; shared spots by everyone", async () => {
  const owner = as(env, "member");
  await assertSucceeds(saveAll(owner, "priv", "member", { extra: { hasSpot: true }, spot: spotData("member", false) }));
  await assertSucceeds(saveAll(owner, "pub", "member", { extra: { hasSpot: true, locShared: true, spotName: "North bay" }, spot: spotData("member", true) }));
  const other = as(env, "admin2");
  await assertFails(getDoc(doc(other, "spots/priv")));
  await assertSucceeds(getDoc(doc(other, "spots/pub")));
  await assertSucceeds(getDoc(doc(owner, "spots/priv")));
  await assertSucceeds(getDocs(query(collection(other, "spots"), where("shared", "==", true))));
  await assertSucceeds(getDocs(query(collection(owner, "spots"), where("uid", "==", "member"))));
  await assertFails(getDocs(collection(other, "spots")));
});

test("a spot must agree with its catch about being shared", async () => {
  const db = as(env, "member");
  await assertFails(saveAll(db, "c1", "member", { extra: { hasSpot: true, locShared: false }, spot: spotData("member", true) }));
});

test("only the angler can edit a catch; the angler or an admin can delete it", async () => {
  await saveAll(as(env, "member"), "c1", "member");
  await assertFails(updateDoc(doc(as(env, "admin2"), "catches/c1"), { weightOz: 999 }));
  await assertSucceeds(updateDoc(doc(as(env, "member"), "catches/c1"), { weightOz: 90 }));
  await assertFails(updateDoc(doc(as(env, "member"), "catches/c1"), { uid: "admin2" }));
  await assertFails(deleteDoc(doc(as(env, "stranger"), "catches/c1")));
  await assertSucceeds(deleteDoc(doc(as(env, "admin2"), "catches/c1")));
});

test("photos can only be attached to your own catch and must be a sensible size", async () => {
  await saveAll(as(env, "member"), "c1", "member");
  const other = as(env, "admin2");
  const b = writeBatch(other);
  b.set(doc(other, "photos", "c1"), { uid: "admin2", src: "x" });
  await assertFails(b.commit());
  await assertFails(saveAll(as(env, "member"), "c2", "member", { photo: "x".repeat(800000) }));
});

test("every new catch needs its photo as proof", async () => {
  const db = as(env, "member");
  await assertFails(saveAll(db, "np1", "member", { photo: null }));
  await assertFails(saveAll(db, "np2", "member", { extra: { thumb: "" } }));
  await assertSucceeds(saveAll(db, "np3", "member"));
  await assertSucceeds(updateDoc(doc(db, "catches/np3"), { notes: "edits don't need a new photo" }));
});

test("a stringer has 2 to 500 fish, says whether it's a limit, and is never measured or released", async () => {
  const db = as(env, "member");
  const str = (extra = {}) => ({ extra: { weightOz: null, lengthIn: null, released: false, fishCount: 50, limit: true, ...extra } });
  await assertSucceeds(saveAll(db, "s1", "member", str()));
  await assertSucceeds(saveAll(db, "s2", "member", str({ fishCount: 2, limit: false })));
  await assertFails(saveAll(db, "s3", "member", str({ fishCount: 1 })));
  await assertFails(saveAll(db, "s4", "member", str({ fishCount: 501 })));
  await assertFails(saveAll(db, "s5", "member", str({ fishCount: 2.5 })));
  await assertFails(saveAll(db, "s6", "member", str({ limit: null })));
  await assertFails(saveAll(db, "s7", "member", str({ weightOz: 400 })));
  await assertFails(saveAll(db, "s8", "member", str({ released: true })));
  await assertFails(saveAll(db, "s9", "member", { extra: { limit: true } })); // a limit with no stringer
  // A stringer can be turned back into a single fish by clearing its count.
  await assertSucceeds(updateDoc(doc(db, "catches/s1"), { fishCount: null, limit: null, weightOz: 40 }));
});

test("a photo can carry its size for the storage meter, but only its real size", async () => {
  const db = as(env, "member");
  const src = "data:image/jpeg;base64,BBBB";
  await assertSucceeds(saveAll(db, "sz1", "member", { photo: src }));
  const ok = writeBatch(db);
  ok.set(doc(db, "catches", "sz2"), catchData("member")); ok.set(doc(db, "photos", "sz2"), { uid: "member", src, bytes: src.length });
  await assertSucceeds(ok.commit());
  const lie = writeBatch(db);
  lie.set(doc(db, "catches", "sz3"), catchData("member")); lie.set(doc(db, "photos", "sz3"), { uid: "member", src, bytes: 1 });
  await assertFails(lie.commit());
});

test("past catches: the flag must be right when saved, and can never be taken off", async () => {
  const db = as(env, "member");
  const late = { caughtAt: Date.now() - 10 * 86400000, createdAt: Date.now() }; // logged 10 days late (grace is 7)
  await assertFails(saveAll(db, "p1", "member", { extra: late }));                       // must say it's past
  await assertSucceeds(saveAll(db, "p2", "member", { extra: { ...late, past: true } }));
  await assertFails(saveAll(db, "p3", "member", { extra: { past: true } }));             // a fresh catch isn't past
  await assertFails(updateDoc(doc(db, "catches/p2"), { past: false }));
  await assertFails(updateDoc(doc(db, "catches/p2"), { past: false, caughtAt: Date.now() - 60000 })); // moving the date doesn't undo it
  await assertSucceeds(updateDoc(doc(db, "catches/p2"), { notes: "my 2015 musky" }));
  // Editing a league catch's date far back makes it past.
  await saveAll(db, "p4", "member");
  await assertFails(updateDoc(doc(db, "catches/p4"), { caughtAt: Date.now() - 30 * 86400000 }));
  await assertSucceeds(updateDoc(doc(db, "catches/p4"), { caughtAt: Date.now() - 30 * 86400000, past: true }));
});

test("admins set how many days late a catch can be logged (0 to 60)", async () => {
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), "config/league"), { graceDays: 3 }));
  await assertFails(updateDoc(doc(as(env, "admin2"), "config/league"), { graceDays: 90 }));
  await assertFails(updateDoc(doc(as(env, "member"), "config/league"), { graceDays: 30 }));
  // With 3 days, a catch logged 5 days late is past.
  await assertFails(saveAll(as(env, "member"), "g1", "member", { extra: { caughtAt: Date.now() - 5 * 86400000 } }));
});

test("league start: admins move it (not into the future); catches before it needn't be flagged, but may be", async () => {
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), "config/league"), { startAt: Date.now() - 86400000 }));
  await assertFails(updateDoc(doc(as(env, "admin2"), "config/league"), { startAt: Date.now() + 3 * 86400000 }));
  await assertFails(updateDoc(doc(as(env, "member"), "config/league"), { startAt: 0 }));
  await assertFails(updateDoc(doc(as(env, "admin2"), "config/league"), { startAt: "yesterday" }));
  const db = as(env, "member");
  const before = { caughtAt: Date.now() - 2 * 86400000, createdAt: Date.now() - 2 * 86400000 + 3600000 }; // before the start, logged on time
  await assertSucceeds(saveAll(db, "s1", "member", { extra: before }));                  // this version of the app
  await assertSucceeds(saveAll(db, "s2", "member", { extra: { ...before, past: true } })); // older versions flagged it
  await assertFails(saveAll(db, "s3", "member", { extra: { past: true } }));              // a catch after the start isn't past
});

// Tackle: in its own doc, like a spot, so it can be kept secret.
const tackleData = (uid, shared, extra = {}) => ({ uid, lure: "Chartreuse jig", depthFt: 12, technique: "jigging", shared, ...extra });
function saveWithTackle(db, id, uid, tackle, extra = {}) {
  const b = writeBatch(db);
  b.set(doc(db, "catches", id), catchData(uid, { hasTackle: true, tackleShared: tackle.shared, ...extra }));
  b.set(doc(db, "photos", id), { uid, src: "data:image/jpeg;base64,BBBB" });
  b.set(doc(db, "tackle", id), tackle);
  return b.commit();
}

test("secret tackle is readable only by its angler; shared tackle by everyone", async () => {
  const owner = as(env, "member");
  await assertSucceeds(saveWithTackle(owner, "tsec", "member", tackleData("member", false)));
  await assertSucceeds(saveWithTackle(owner, "tpub", "member", tackleData("member", true)));
  const other = as(env, "admin2");
  await assertFails(getDoc(doc(other, "tackle/tsec")));
  await assertSucceeds(getDoc(doc(other, "tackle/tpub")));
  await assertSucceeds(getDoc(doc(owner, "tackle/tsec")));
  await assertSucceeds(getDocs(query(collection(other, "tackle"), where("shared", "==", true))));
  await assertSucceeds(getDocs(query(collection(owner, "tackle"), where("uid", "==", "member"))));
  await assertFails(getDocs(collection(other, "tackle")));
});

test("tackle must agree with its catch and be sensible", async () => {
  const db = as(env, "member");
  // Shared or secret has to match the catch, and the catch has to say it has tackle.
  await assertFails(saveWithTackle(db, "t1", "member", tackleData("member", true), { tackleShared: false }));
  await assertFails(saveWithTackle(db, "t2", "member", tackleData("member", false), { hasTackle: false }));
  await assertFails(saveAll(db, "t3", "member", { extra: { hasTackle: false, tackleShared: true } }));
  await assertFails(saveWithTackle(db, "t4", "member", tackleData("member", true, { technique: "dynamite" })));
  await assertFails(saveWithTackle(db, "t5", "member", tackleData("member", true, { depthFt: 0 })));
  await assertFails(saveWithTackle(db, "t6", "member", tackleData("member", true, { depthFt: 1001 })));
  await assertFails(saveWithTackle(db, "t7", "member", tackleData("member", true, { lure: "x".repeat(61) })));
  await assertFails(saveWithTackle(db, "t8", "member", tackleData("member", true, { weather: "sunny" })));
  await assertSucceeds(saveWithTackle(db, "t9", "member", tackleData("member", true, { lure: "", depthFt: null, technique: "fly" })));
  // Nobody else can add tackle to your catch.
  await saveAll(db, "t10", "member");
  const other = as(env, "admin2");
  await assertFails(writeBatch(other).set(doc(other, "tackle", "t10"), tackleData("admin2", true)).commit());
});

test("tackle can be changed or removed with its catch, and goes when the catch is deleted", async () => {
  const db = as(env, "member");
  await saveWithTackle(db, "t1", "member", tackleData("member", false));
  // Make it shared.
  let b = writeBatch(db);
  b.update(doc(db, "catches/t1"), { tackleShared: true });
  b.set(doc(db, "tackle/t1"), tackleData("member", true));
  await assertSucceeds(b.commit());
  // Remove it.
  b = writeBatch(db);
  b.update(doc(db, "catches/t1"), { hasTackle: false, tackleShared: false });
  b.delete(doc(db, "tackle/t1"));
  await assertSucceeds(b.commit());
  // An admin deleting a catch can remove its secret tackle too; nobody else can.
  await saveWithTackle(db, "t2", "member", tackleData("member", false));
  await assertFails(deleteDoc(doc(as(env, "stranger"), "tackle/t2")));
  const admin = as(env, "admin2");
  b = writeBatch(admin);
  b.delete(doc(admin, "catches/t2"));
  b.delete(doc(admin, "tackle/t2"));
  await assertSucceeds(b.commit());
});
