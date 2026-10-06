// Rules for season series: only league admins set them up; any derby can point at one.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { startEnv, seedLeague, as } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const series = (createdBy, extra = {}) => ({ name: "2026 Walleye Trail", start: 1, end: 2, points: [25, 18, 15], showUpPts: 2, bestOf: 0,
  createdBy, createdAt: Date.now(), ...extra });

test("only admins can create, change or delete a series; every member can read them", async () => {
  await assertFails(setDoc(doc(as(env, "member"), "series/s1"), series("member")));
  await assertSucceeds(setDoc(doc(as(env, "admin2"), "series/s1"), series("admin2")));
  await assertSucceeds(getDoc(doc(as(env, "member"), "series/s1")));
  await assertFails(getDoc(doc(as(env, "stranger"), "series/s1")));
  await assertFails(updateDoc(doc(as(env, "member"), "series/s1"), { name: "Mine" }));
  await assertSucceeds(updateDoc(doc(as(env, "owner"), "series/s1"), { bestOf: 4 }));
  await assertFails(updateDoc(doc(as(env, "owner"), "series/s1"), { createdBy: "owner" }));
  await assertFails(setDoc(doc(as(env, "admin2"), "series/s2"), series("admin2", { end: 0 })));
  await assertFails(setDoc(doc(as(env, "admin2"), "series/s3"), series("admin2", { points: [] })));
  await assertFails(setDoc(doc(as(env, "admin2"), "series/s4"), series("member")));
  await assertFails(deleteDoc(doc(as(env, "member"), "series/s1")));
  await assertSucceeds(deleteDoc(doc(as(env, "admin2"), "series/s1")));
});
