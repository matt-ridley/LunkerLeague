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
