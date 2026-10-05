// Rules for the versioned ranking points.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDocs, collection } from "firebase/firestore";
import { startEnv, seedLeague, as } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const values = (extra = {}) => ({ catchPts: 1, dailyCap: 3, speciesPts: 3, recordPts: [5, 3, 1], derbyPts: [25, 15, 10],
  participationPts: 2, beatPts: 0, titles: [0, 10, 25, 50, 100, 175, 275], ...extra });
const version = (by, extra = {}) => ({ mode: "forward", effectiveFrom: Date.now(), createdAt: Date.now(), createdBy: by, note: "", values: values(), ...extra });

test("admins add scoring versions; members can read them but not add any", async () => {
  await assertSucceeds(setDoc(doc(as(env, "admin2"), "scoring/v1"), version("admin2")));
  await assertSucceeds(setDoc(doc(as(env, "owner"), "scoring/v2"), version("owner", { mode: "retro" })));
  await assertFails(setDoc(doc(as(env, "member"), "scoring/v3"), version("member")));
  await assertSucceeds(getDocs(collection(as(env, "member"), "scoring")));
  await assertFails(getDocs(collection(as(env, "stranger"), "scoring")));
});

test("versions must be sensible, and can never be edited or deleted", async () => {
  const db = as(env, "admin2");
  await assertFails(setDoc(doc(db, "scoring/a"), version("admin2", { mode: "sometimes" })));
  await assertFails(setDoc(doc(db, "scoring/b"), version("admin2", { values: values({ catchPts: -1 }) })));
  await assertFails(setDoc(doc(db, "scoring/c"), version("admin2", { values: values({ recordPts: [5, 3] }) })));
  await assertFails(setDoc(doc(db, "scoring/d"), version("owner")));
  await setDoc(doc(db, "scoring/v1"), version("admin2"));
  await assertFails(updateDoc(doc(db, "scoring/v1"), { note: "rewrite history" }));
  await assertFails(deleteDoc(doc(as(env, "owner"), "scoring/v1")));
});

test("the limit bonus is optional (older versions don't have it) and must be sensible", async () => {
  const db = as(env, "admin2");
  await assertSucceeds(setDoc(doc(db, "scoring/l1"), version("admin2", { values: values({ limitPts: 10 }) })));
  await assertFails(setDoc(doc(db, "scoring/l2"), version("admin2", { values: values({ limitPts: -1 }) })));
});
