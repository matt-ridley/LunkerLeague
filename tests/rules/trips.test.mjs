// Rules for trips ("who's out Saturday?") and their In / Maybe / Out answers.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDocs, collectionGroup, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { startEnv, seedLeague, as } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const trip = (uid, extra = {}) => ({ uid, title: "Saturday walleye", at: Date.now() + 86400000, place: "North bay", notes: "", createdAt: Date.now(), ...extra });

test("any member can plan a trip as themselves; it must be sensible", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "trips/t1"), trip("member")));
  await assertFails(setDoc(doc(db, "trips/t2"), trip("admin2")));
  await assertFails(setDoc(doc(db, "trips/t3"), trip("member", { title: "" })));
  await assertFails(setDoc(doc(db, "trips/t4"), trip("member", { boat: "big" })));
  await assertFails(setDoc(doc(as(env, "stranger"), "trips/t5"), trip("stranger")));
});

test("the planner or an admin can change or delete a trip; others can't", async () => {
  await setDoc(doc(as(env, "member"), "trips/t1"), trip("member"));
  await assertSucceeds(updateDoc(doc(as(env, "member"), "trips/t1"), { title: "Sunday walleye" }));
  await assertFails(updateDoc(doc(as(env, "owner"), "trips/t1"), { uid: "owner" }));
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), "trips/t1"), { place: "South shore" }));
  await setDoc(doc(as(env, "admin2"), "trips/t2"), trip("admin2"));
  await assertFails(updateDoc(doc(as(env, "member"), "trips/t2"), { title: "Mine now" }));
  await assertFails(deleteDoc(doc(as(env, "member"), "trips/t2")));
  await assertSucceeds(deleteDoc(doc(as(env, "admin2"), "trips/t2")));
});

test("members answer for themselves only; everyone can read the answers", async () => {
  await setDoc(doc(as(env, "member"), "trips/t1"), trip("member"));
  await assertSucceeds(setDoc(doc(as(env, "admin2"), "trips/t1/rsvps/admin2"), { answer: "in", at: Date.now() }));
  await assertSucceeds(setDoc(doc(as(env, "admin2"), "trips/t1/rsvps/admin2"), { answer: "maybe", at: Date.now() }));
  await assertFails(setDoc(doc(as(env, "admin2"), "trips/t1/rsvps/member"), { answer: "out", at: Date.now() }));
  await assertFails(setDoc(doc(as(env, "admin2"), "trips/t1/rsvps/admin2"), { answer: "probably", at: Date.now() }));
  await assertFails(setDoc(doc(as(env, "admin2"), "trips/nope/rsvps/admin2"), { answer: "in", at: Date.now() }));
  await assertSucceeds(getDocs(collectionGroup(as(env, "owner"), "rsvps")));
  await assertFails(getDocs(collectionGroup(as(env, "stranger"), "rsvps")));
});

test("the planner deletes a trip together with everyone's answers", async () => {
  await setDoc(doc(as(env, "member"), "trips/t1"), trip("member"));
  await setDoc(doc(as(env, "admin2"), "trips/t1/rsvps/admin2"), { answer: "in", at: Date.now() });
  const db = as(env, "member"), b = writeBatch(db);
  b.delete(doc(db, "trips/t1/rsvps/admin2")); b.delete(doc(db, "trips/t1"));
  await assertSucceeds(b.commit());
});

test("outings: boat or shore, and an optional back-by time after the start", async () => {
  const db = as(env, "member"), at = Date.now() + 86400000;
  await assertSucceeds(setDoc(doc(db, "trips/t1"), trip("member", { kind: "boat", endAt: at + 6 * 3600000 })));
  await assertSucceeds(setDoc(doc(db, "trips/t2"), trip("member", { kind: "shore", endAt: null })));
  await assertFails(setDoc(doc(db, "trips/t3"), trip("member", { kind: "canoe" })));
  await assertFails(setDoc(doc(db, "trips/t4"), trip("member", { at, endAt: at - 1 })));
});

test("boats: only the owner offers or changes theirs; seats are spare seats, 1 to 12", async () => {
  await setDoc(doc(as(env, "member"), "trips/t1"), trip("member", { kind: "boat" }));
  const boat = (who, seats = 3) => setDoc(doc(as(env, who), `trips/t1/boats/${who}`), { seats, name: "", at: Date.now() });
  await assertSucceeds(boat("admin2"));
  await assertFails(setDoc(doc(as(env, "member"), "trips/t1/boats/admin2"), { seats: 9, name: "", at: 1 })); // not your boat
  await assertFails(boat("owner", 0));
  await assertFails(boat("owner", 13));
  await assertFails(boat("owner", 2.5));
  await assertFails(setDoc(doc(as(env, "owner"), "trips/t9/boats/owner"), { seats: 2, name: "", at: 1 })); // no such outing
  // The planner (member) can take a boat off; nobody else but the owner or an admin.
  await assertSucceeds(boat("owner"));
  await assertSucceeds(deleteDoc(doc(as(env, "member"), "trips/t1/boats/owner")));
  await assertSucceeds(deleteDoc(doc(as(env, "admin2"), "trips/t1/boats/admin2")));
});

test("seats: you take your own seat, and only when you're In", async () => {
  await setDoc(doc(as(env, "member"), "trips/t1"), trip("member", { kind: "boat" }));
  const r = (who, data) => setDoc(doc(as(env, who), `trips/t1/rsvps/${who}`), data);
  await assertSucceeds(r("member", { answer: "in", at: 1, boat: "admin2", seatAt: Date.now() }));
  await assertFails(r("owner", { answer: "maybe", at: 1, boat: "admin2", seatAt: 1 }));       // a seat means In
  await assertFails(setDoc(doc(as(env, "owner"), "trips/t1/rsvps/member"), { answer: "out", at: 1 })); // someone else's
  await assertFails(r("owner", { answer: "in", at: 1, boat: "admin2", seatAt: 1, vip: true }));
  await assertSucceeds(getDocs(collectionGroup(as(env, "member"), "boats")));
});
