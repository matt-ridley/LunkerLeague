// Rules for personal goals: everyone in the league reads them; only their angler sets them.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { startEnv, seedLeague, as } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const goal = (uid, extra = {}) => ({ uid, kind: "species", target: 10, from: 1, to: 2, createdAt: 5, ...extra });

test("an angler sets their own goals; the league can see them", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "goals/g1"), goal("member")));
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "goals/g1")));
  await assertFails(getDoc(doc(as(env, "stranger"), "goals/g1")));
  await assertFails(setDoc(doc(db, "goals/g2"), goal("admin2")));
  await assertFails(updateDoc(doc(as(env, "admin2"), "goals/g1"), { target: 1 }));
  await assertSucceeds(updateDoc(doc(db, "goals/g1"), { target: 12 }));
  await assertFails(updateDoc(doc(db, "goals/g1"), { createdAt: 6 }));
  await assertSucceeds(deleteDoc(doc(as(env, "admin2"), "goals/g1")));
});

test("goals have to make sense", async () => {
  const db = as(env, "member");
  await assertFails(setDoc(doc(db, "goals/a"), goal("member", { kind: "vibes" })));
  await assertFails(setDoc(doc(db, "goals/b"), goal("member", { target: 0 })));
  await assertFails(setDoc(doc(db, "goals/c"), goal("member", { target: 2.5 })));
  await assertFails(setDoc(doc(db, "goals/d"), goal("member", { to: 1 })));
  await assertFails(setDoc(doc(db, "goals/e"), goal("member", { points: 5 })));
  await assertFails(setDoc(doc(db, "goals/f"), goal("member", { kind: "size", target: null, species: "Muskie", field: "lengthIn" }))); // no size
  await assertFails(setDoc(doc(db, "goals/g"), goal("member", { kind: "pb", target: null, species: "Muskie", field: "girth" })));
  await assertSucceeds(setDoc(doc(db, "goals/h"), goal("member", { kind: "size", target: null, species: "Muskie", field: "lengthIn", value: 40 })));
  await assertSucceeds(setDoc(doc(db, "goals/i"), { uid: "member", kind: "pb", species: "Walleye", field: "weightOz", from: 1, to: 2, createdAt: 5 }));
});
