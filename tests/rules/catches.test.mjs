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
