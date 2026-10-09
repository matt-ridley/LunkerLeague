// Rules for saved seasons (seasons/{year}) and for catches in a locked season.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { startEnv, seedLeague, as, THUMB } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

// Seasons run on the real clock here: last year is locked (its final whistle has gone); this year isn't over.
const lastYear = new Date().getFullYear() - 1, thisYear = lastYear + 1;
const season = (year, by, extra = {}) => ({ year, lockedAt: Date.now(), lockedBy: by, champion: "member",
  standings: [{ uid: "member", place: 1, points: 12, title: "Minnow Wrangler", byKind: { catch: 12 } }], crowns: [], records: [], awards: [], ...extra });

test("an admin saves a locked season once; members read it; only the owner saves it again or removes it", async () => {
  await assertFails(setDoc(doc(as(env, "member"), `seasons/${lastYear}`), season(lastYear, "member")));
  await assertFails(setDoc(doc(as(env, "admin2"), `seasons/${lastYear}`), season(lastYear, "owner")));      // as someone else
  await assertFails(setDoc(doc(as(env, "admin2"), `seasons/${lastYear}`), season(lastYear - 1, "admin2"))); // wrong year
  await assertFails(setDoc(doc(as(env, "admin2"), `seasons/${lastYear}`), season(lastYear, "admin2", { extra: 1 })));
  await assertSucceeds(setDoc(doc(as(env, "admin2"), `seasons/${lastYear}`), season(lastYear, "admin2")));
  await assertSucceeds(getDoc(doc(as(env, "member"), `seasons/${lastYear}`)));
  await assertFails(getDoc(doc(as(env, "stranger"), `seasons/${lastYear}`)));
  await assertFails(setDoc(doc(as(env, "admin2"), `seasons/${lastYear}`), season(lastYear, "admin2", { champion: "admin2" })));
  await assertSucceeds(setDoc(doc(as(env, "owner"), `seasons/${lastYear}`), season(lastYear, "owner", { champion: null })));
  await assertFails(deleteDoc(doc(as(env, "admin2"), `seasons/${lastYear}`)));
  await assertSucceeds(deleteDoc(doc(as(env, "owner"), `seasons/${lastYear}`)));
});

test("a season can't be saved before its final whistle", async () => {
  await assertFails(setDoc(doc(as(env, "owner"), `seasons/${thisYear}`), season(thisYear, "owner")));
  await assertFails(setDoc(doc(as(env, "owner"), "seasons/next"), season(thisYear, "owner")));
});

const catchData = (uid, caughtAt, extra = {}) => ({
  uid, species: "Walleye", weightOz: 88, lengthIn: 22.5, caughtAt, createdAt: caughtAt + 60000,
  thumb: THUMB, photoTakenAt: null, notes: "", released: true, hasSpot: false, locShared: false, spotName: "", ...extra,
});
async function seedCatch(id, data) {
  await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), "catches", id), data); });
}

test("a locked season's catches keep their fish; the thumbnail and an open season's catches can still change", async () => {
  await seedCatch("old", catchData("member", new Date(lastYear, 5, 1).getTime()));
  await seedCatch("now", catchData("member", Date.now() - 3600e3));
  await seedCatch("log", catchData("member", new Date(lastYear, 5, 1).getTime(), { past: true }));
  const db = as(env, "member");
  await assertFails(updateDoc(doc(db, "catches/old"), { weightOz: 120 }));
  await assertFails(updateDoc(doc(db, "catches/old"), { species: "Sauger" }));
  await assertSucceeds(updateDoc(doc(db, "catches/old"), { notes: "Still a good one" }));
  await assertSucceeds(updateDoc(doc(db, "catches/old"), { focus: { x: 40, y: 60 } }));
  await assertSucceeds(updateDoc(doc(db, "catches/now"), { weightOz: 120 }));
  await assertSucceeds(updateDoc(doc(db, "catches/log"), { weightOz: 120 }));   // the logbook stays editable
});
