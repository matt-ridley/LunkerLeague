// Rules for saved months (Angler of the Month: months/{YYYY-MM}).
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, deleteDoc, getDoc } from "firebase/firestore";
import { startEnv, seedLeague, as } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

// Months run on the real clock here: two months ago is locked (over, and its late-logging days have passed); this one isn't.
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const now = new Date(), old = key(new Date(now.getFullYear(), now.getMonth() - 2, 15)), live = key(now);
const month = (k, by, extra = {}) => ({ key: k, winner: "member", points: 31, fish: 12, anglers: 4,
  board: [{ uid: "member", place: 1, points: 31, fish: 12 }], lockedAt: Date.now(), lockedBy: by, ...extra });

test("an admin saves a locked month once; members read it; only the owner saves it again or removes it", async () => {
  await assertFails(setDoc(doc(as(env, "member"), `months/${old}`), month(old, "member")));
  await assertFails(setDoc(doc(as(env, "admin2"), `months/${old}`), month(old, "owner")));        // as someone else
  await assertFails(setDoc(doc(as(env, "admin2"), `months/${old}`), month(live, "admin2")));      // wrong key
  await assertFails(setDoc(doc(as(env, "admin2"), `months/${old}`), month(old, "admin2", { extra: 1 })));
  await assertSucceeds(setDoc(doc(as(env, "admin2"), `months/${old}`), month(old, "admin2")));
  await assertSucceeds(getDoc(doc(as(env, "member"), `months/${old}`)));
  await assertFails(getDoc(doc(as(env, "stranger"), `months/${old}`)));
  await assertFails(setDoc(doc(as(env, "admin2"), `months/${old}`), month(old, "admin2", { winner: "admin2" })));
  await assertSucceeds(setDoc(doc(as(env, "owner"), `months/${old}`), month(old, "owner", { winner: null })));
  await assertFails(deleteDoc(doc(as(env, "admin2"), `months/${old}`)));
  await assertSucceeds(deleteDoc(doc(as(env, "owner"), `months/${old}`)));
});

test("a month can't be saved before it locks, and its id must be a month", async () => {
  await assertFails(setDoc(doc(as(env, "admin2"), `months/${live}`), month(live, "admin2")));
  await assertFails(setDoc(doc(as(env, "admin2"), "months/2026-13"), month("2026-13", "admin2")));
  await assertFails(setDoc(doc(as(env, "admin2"), "months/november"), month("november", "admin2")));
  await assertFails(setDoc(doc(as(env, "admin2"), `months/${old}`), month(old, "admin2", { board: Array(11).fill({ uid: "x" }) })));
  await assertFails(setDoc(doc(as(env, "admin2"), `months/${old}`), month(old, "admin2", { fish: 1.5 })));
  await assertSucceeds(setDoc(doc(as(env, "admin2"), `months/${old}`), month(old, "admin2", { winner: null, points: 0, fish: 0, board: [] })));
});

test("the scoring settings can carry the Angler of the Month bonus", async () => {
  const values = { catchPts: 1, dailyCap: 3, limitPts: 5, speciesPts: 3, recordPts: [5, 3, 1], crownPts: 2, badgePts: 1, derbyPts: [25, 15, 10],
    participationPts: 2, beatPts: 0, titles: [0, 10, 25, 50, 100, 175, 275] };
  const v = extra => ({ mode: "forward", effectiveFrom: Date.now(), createdAt: Date.now(), createdBy: "admin2", note: "", values: { ...values, ...extra } });
  await assertSucceeds(setDoc(doc(as(env, "admin2"), "scoring/v1"), v({ monthPts: 8 })));
  await assertFails(setDoc(doc(as(env, "admin2"), "scoring/v2"), v({ monthPts: -1 })));
});
