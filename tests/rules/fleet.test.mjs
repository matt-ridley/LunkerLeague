// Rules for saved boats (the fleet), and the boat on a catch and an outing.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
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

test("a boat's motor: optional horsepower (a whole number) and brand", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "fleet/b1"), boat("member", { hp: 150, motor: "Mercury" })));
  await assertSucceeds(setDoc(doc(db, "fleet/b2"), boat("member", { hp: null, motor: null })));
  await assertSucceeds(updateDoc(doc(db, "fleet/b1"), { hp: 200 }));
  await assertFails(setDoc(doc(db, "fleet/b3"), boat("member", { hp: 0 })));
  await assertFails(setDoc(doc(db, "fleet/b4"), boat("member", { hp: 90.5 })));
  await assertFails(setDoc(doc(db, "fleet/b5"), boat("member", { hp: 2001 })));
  await assertFails(setDoc(doc(db, "fleet/b6"), boat("member", { hp: "150" })));
  await assertFails(setDoc(doc(db, "fleet/b7"), boat("member", { motor: "" })));
  await assertFails(setDoc(doc(db, "fleet/b8"), boat("member", { motor: "M".repeat(31) })));
});

test("a boat's specs: optional length (feet), seats and capacity (lb)", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "fleet/b1"), boat("member", { lengthFt: 17.5, seats: 4, capacityLb: 1200 })));
  await assertSucceeds(setDoc(doc(db, "fleet/b2"), boat("member", { lengthFt: null, seats: null, capacityLb: null })));
  await assertFails(setDoc(doc(db, "fleet/b3"), boat("member", { lengthFt: 0 })));
  await assertFails(setDoc(doc(db, "fleet/b4"), boat("member", { lengthFt: 101 })));
  await assertFails(setDoc(doc(db, "fleet/b5"), boat("member", { seats: 2.5 })));
  await assertFails(setDoc(doc(db, "fleet/b6"), boat("member", { seats: 31 })));
  await assertFails(setDoc(doc(db, "fleet/b7"), boat("member", { capacityLb: 20001 })));
  await assertFails(setDoc(doc(db, "fleet/b8"), boat("member", { capacityLb: "1200" })));
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

test("handing a boat over: the captain offers it, only that member accepts and sets the crew, history only grows", async () => {
  const db = as(env, "member"), them = as(env, "admin2"), other = as(env, "owner");
  await assertSucceeds(setDoc(doc(db, "fleet/b1"), boat("member", { captains: [{ uid: "member", at: 5 }] })));
  await assertFails(setDoc(doc(db, "fleet/b2"), boat("member", { captains: [{ uid: "admin2", at: 5 }] })));   // can't start someone else's history
  await assertFails(setDoc(doc(db, "fleet/b3"), boat("member", { offerTo: "admin2", offerAt: 6 })));          // no offer on a new boat
  await assertFails(updateDoc(doc(db, "fleet/b1"), { offerTo: "nobody", offerAt: 6 }));                       // only to a member
  await assertFails(updateDoc(doc(db, "fleet/b1"), { offerTo: "member", offerAt: 6 }));                       // not to yourself
  await assertFails(updateDoc(doc(db, "fleet/b1"), { captains: [{ uid: "member", at: 1 }] }));                // the captain can't rewrite history
  await assertSucceeds(updateDoc(doc(db, "fleet/b1"), { offerTo: "admin2", offerAt: 6 }));
  await assertSucceeds(updateDoc(doc(db, "fleet/b1"), { name: "Still mine" }));                                // still the captain's until accepted
  const takeOver = (uid, extra = {}) => ({ uid, crew: ["member"], captains: [{ uid: "member", at: 5 }, { uid, at: Date.now() }], offerTo: null, offerAt: null, ...extra });
  await assertFails(updateDoc(doc(other, "fleet/b1"), takeOver("owner")));                                    // not offered to them
  await assertFails(updateDoc(doc(them, "fleet/b1"), takeOver("admin2", { name: "Renamed" })));                // only the crew and the history
  await assertFails(updateDoc(doc(them, "fleet/b1"), takeOver("admin2", { captains: [{ uid: "admin2", at: Date.now() }] })));
  await assertFails(updateDoc(doc(them, "fleet/b1"), takeOver("admin2", { offerTo: "owner" })));
  await assertSucceeds(updateDoc(doc(them, "fleet/b1"), takeOver("admin2")));
  const after = (await getDoc(doc(them, "fleet/b1"))).data();
  assert.equal(after.uid, "admin2");
  assert.equal(after.captains.length, 2);
  await assertFails(updateDoc(doc(db, "fleet/b1"), { name: "Mine again" }));                                 // the old captain is just crew now
  await assertSucceeds(updateDoc(doc(them, "fleet/b1"), { name: "Bo's Lund" }));
});

test("an old boat with no history can be handed over; a member can turn an offer down", async () => {
  const db = as(env, "member"), them = as(env, "admin2");
  await assertSucceeds(setDoc(doc(db, "fleet/b1"), boat("member")));
  await assertSucceeds(updateDoc(doc(db, "fleet/b1"), { offerTo: "admin2", offerAt: 6 }));
  await assertFails(updateDoc(doc(them, "fleet/b1"), { offerTo: "owner", offerAt: 7 }));                      // can't pass it on
  await assertSucceeds(updateDoc(doc(them, "fleet/b1"), { offerTo: null, offerAt: null }));
  await assertFails(updateDoc(doc(them, "fleet/b1"), { uid: "admin2", captains: [{ uid: "member", at: 5 }, { uid: "admin2", at: 9 }], offerTo: null, offerAt: null }));
  await assertSucceeds(updateDoc(doc(db, "fleet/b1"), { offerTo: "admin2", offerAt: 8 }));
  await assertFails(updateDoc(doc(them, "fleet/b1"), { uid: "admin2", captains: [{ uid: "member", at: 4 }, { uid: "admin2", at: 9 }], offerTo: null, offerAt: null }));
  await assertSucceeds(updateDoc(doc(them, "fleet/b1"), { uid: "admin2", crew: [], captains: [{ uid: "member", at: 5 }, { uid: "admin2", at: 9 }], offerTo: null, offerAt: null }));
});

test("a handed-over boat's photo: the new captain changes or removes it", async () => {
  const db = as(env, "member"), them = as(env, "admin2");
  const b = writeBatch(db);
  b.set(doc(db, "fleet/b1"), boat("member", { thumb: THUMB, offerTo: null }));
  b.set(doc(db, "fleetPhotos/b1"), { uid: "member", src: THUMB + "A".repeat(400), bytes: 600 });
  await assertSucceeds(b.commit());
  await assertSucceeds(updateDoc(doc(db, "fleet/b1"), { offerTo: "admin2", offerAt: 6 }));
  await assertSucceeds(updateDoc(doc(them, "fleet/b1"), { uid: "admin2", crew: [], captains: [{ uid: "member", at: 5 }, { uid: "admin2", at: 9 }], offerTo: null, offerAt: null }));
  await assertFails(deleteDoc(doc(db, "fleetPhotos/b1")));
  await assertSucceeds(setDoc(doc(them, "fleetPhotos/b1"), { uid: "admin2", src: THUMB + "B".repeat(400), bytes: 600 }));
  await assertSucceeds(deleteDoc(doc(them, "fleetPhotos/b1")));
});
