// Rules for saved boats (the fleet), and the boat on a catch and an outing.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { startEnv, seedLeague, as, THUMB, putCatch } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const boat = (uid, extra = {}) => ({ uid, name: "The Lund", crew: ["admin2"], notes: "", thumb: null, retired: false, createdAt: 5, ...extra });
const catchData = (uid, extra = {}) => ({ uid, species: "Walleye", weightOz: 88, lengthIn: 22.5, caughtAt: Date.now() - 60000, createdAt: Date.now(),
  thumb: THUMB, photoTakenAt: null, notes: "", released: true, hasSpot: false, locShared: false, spotName: "", ...extra });

test("an owner saves their boat; the league can see it; only the owner changes it", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "fleet/b1"), boat("member")));
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "fleet/b1")));
  await assertFails(getDoc(doc(as(env, "stranger"), "fleet/b1")));
  await assertFails(setDoc(doc(db, "fleet/b2"), boat("admin2")));
  await assertFails(updateDoc(doc(as(env, "admin2"), "fleet/b1"), { name: "Mine now" }));   // crew can't edit it
  await assertSucceeds(updateDoc(doc(db, "fleet/b1"), { name: "The Big Lund", retired: true }));
  await assertFails(updateDoc(doc(db, "fleet/b1"), { createdAt: 6 }));
  await assertFails(setDoc(doc(db, "fleet/b3"), boat("member", { name: "" })));
  await assertFails(setDoc(doc(db, "fleet/b4"), boat("member", { crew: "admin2" })));
  await assertFails(setDoc(doc(db, "fleet/b5"), boat("member", { horsepower: 150 })));
  await assertSucceeds(deleteDoc(doc(as(env, "admin2"), "fleet/b1")));                     // admins can clear one out
});

test("a boat's photo: only its owner, a sensible size", async () => {
  const db = as(env, "member");
  const b = writeBatch(db);
  b.set(doc(db, "fleet/b1"), boat("member", { thumb: THUMB }));
  b.set(doc(db, "fleetPhotos/b1"), { uid: "member", src: THUMB + "A".repeat(400), bytes: 600 });
  await assertSucceeds(b.commit());
  await assertFails(setDoc(doc(as(env, "admin2"), "fleetPhotos/b1"), { uid: "admin2", src: THUMB, bytes: 220 }));
  await assertFails(setDoc(doc(db, "fleetPhotos/none"), { uid: "member", src: THUMB, bytes: 220 }));
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "fleetPhotos/b1")));
});

test("a catch and an outing's boat can name a saved boat", async () => {
  const db = as(env, "member");
  await assertSucceeds(putCatch(db, "c1", catchData("member", { boatId: "b1" })));
  await assertSucceeds(updateDoc(doc(db, "catches/c1"), { boatId: null }));
  await assertFails(updateDoc(doc(db, "catches/c1"), { boatId: 7 }));
  await assertSucceeds(setDoc(doc(db, "trips/t1"), { uid: "member", title: "Saturday", at: Date.now() + 86400000, place: "", notes: "", createdAt: Date.now(), kind: "boat" }));
  await assertSucceeds(setDoc(doc(db, "trips/t1/boats/member"), { seats: 2, name: "The Lund", at: 1, boatId: "b1" }));
  await assertFails(setDoc(doc(db, "trips/t1/boats/member"), { seats: 2, name: "The Lund", at: 1, boatId: "x".repeat(41) }));
});
