// Rules for catches' small photos in their own docs (thumbs/{id}) and moving older ones out of the catches.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteField, writeBatch } from "firebase/firestore";
import { startEnv, seedLeague, as, THUMB } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const T2 = "data:image/jpeg;base64," + "B".repeat(300);
const catchData = (uid, extra = {}) => ({
  uid, species: "Walleye", weightOz: 88, lengthIn: 22.5, caughtAt: Date.now() - 60000, createdAt: Date.now(),
  photoTakenAt: null, notes: "", released: true, hasSpot: false, locShared: false, spotName: "", ...extra,
});
const thumbDoc = (uid, at, src = THUMB) => ({ uid, src, at, bytes: src.length });

/* A new catch the new way: the catch with thumbAt, its full photo and its thumbs doc in one batch. */
function saveNew(db, id, uid, { at = 1000, thumb = thumbDoc(uid, at), extra = {} } = {}) {
  const b = writeBatch(db);
  b.set(doc(db, "catches", id), catchData(uid, { thumbAt: at, ...extra }));
  b.set(doc(db, "photos", id), { uid, src: "data:image/jpeg;base64,BBBB" });
  if (thumb) b.set(doc(db, "thumbs", id), thumb);
  return b.commit();
}

/* An older catch, written with the rules off: its small photo is inside it. */
async function seedOld(id, uid, extra = {}) {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "catches", id), catchData(uid, { thumb: THUMB, ...extra }));
    await setDoc(doc(db, "photos", id), { uid, src: "data:image/jpeg;base64,BBBB" });
  });
}

function moveOut(db, id, me, { at = 5, src = THUMB } = {}) {
  const b = writeBatch(db);
  b.set(doc(db, "thumbs", id), thumbDoc(me, at, src));
  b.update(doc(db, "catches", id), { thumb: deleteField(), thumbAt: at });
  return b.commit();
}

test("a new catch saves its small photo in thumbs/, and members can read it", async () => {
  await assertSucceeds(saveNew(as(env, "member"), "c1", "member"));
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "thumbs/c1")));
  await assertFails(getDoc(doc(as(env, "stranger"), "thumbs/c1")));
});

test("a catch needs its small photo: in the catch (older ones) or a thumbs doc of the same version", async () => {
  const db = as(env, "member");
  await assertFails(saveNew(db, "c1", "member", { thumb: null }));                       // no thumbs doc
  await assertFails(saveNew(db, "c2", "member", { thumb: thumbDoc("member", 999) }));    // a different version
  const b = writeBatch(db);                                                                // neither thumb nor thumbAt
  b.set(doc(db, "catches", "c3"), catchData("member"));
  b.set(doc(db, "photos", "c3"), { uid: "member", src: "data:image/jpeg;base64,BBBB" });
  await assertFails(b.commit());
  await assertSucceeds(saveNew(db, "c4", "member"));
});

test("a thumbs doc is the writer's, a sensible size with its real size, and for their own catch", async () => {
  const db = as(env, "member");
  await assertFails(saveNew(db, "c1", "member", { thumb: thumbDoc("admin2", 1000) }));
  await assertFails(saveNew(db, "c2", "member", { thumb: { ...thumbDoc("member", 1000), bytes: 5 } }));
  await assertFails(saveNew(db, "c3", "member", { thumb: thumbDoc("member", 1000, "x") }));
  await saveNew(as(env, "admin2"), "theirs", "admin2");
  // Writing a thumbs doc for someone else's catch.
  await assertFails(setDoc(doc(db, "thumbs", "theirs"), thumbDoc("member", 1000)));
});

test("a new photo is a new version saved with the catch; a thumbs doc can't be swapped on its own", async () => {
  const db = as(env, "member");
  await saveNew(db, "c1", "member", { at: 1000 });
  // The same version with a different picture, without touching the catch.
  await assertFails(setDoc(doc(db, "thumbs", "c1"), thumbDoc("member", 1000, T2)));
  // A new version without changing the catch's thumbAt.
  await assertFails(setDoc(doc(db, "thumbs", "c1"), thumbDoc("member", 2000, T2)));
  // A new photo: catch and thumbs doc together.
  const b = writeBatch(db);
  b.set(doc(db, "catches", "c1"), { thumbAt: 2000 }, { merge: true });
  b.set(doc(db, "thumbs", "c1"), thumbDoc("member", 2000, T2));
  await assertSucceeds(b.commit());
  // The catch can't point at a version that isn't saved.
  await assertFails(setDoc(doc(db, "catches", "c1"), { thumbAt: 3000 }, { merge: true }));
});

test("editing an older catch's photo moves it out: the catch drops `thumb` and points at the new thumbs doc", async () => {
  await seedOld("old", "member");
  const db = as(env, "member");
  const b = writeBatch(db);
  b.set(doc(db, "catches", "old"), { thumb: deleteField(), thumbAt: 2000 }, { merge: true });
  b.set(doc(db, "thumbs", "old"), thumbDoc("member", 2000, T2));
  await assertSucceeds(b.commit());
});

test("the league owner can move any older catch's small photo out, as an exact copy only", async () => {
  await seedOld("a", "member");
  await seedOld("b", "admin2", { approved: false });
  await assertFails(moveOut(as(env, "admin2"), "a", "admin2"));                  // an admin who isn't the owner
  await assertFails(moveOut(as(env, "member"), "b", "member"));                  // someone else's catch
  await assertFails(moveOut(as(env, "owner"), "a", "owner", { src: T2 }));       // not the same picture
  await assertSucceeds(moveOut(as(env, "owner"), "a", "owner"));
  await assertSucceeds(moveOut(as(env, "owner"), "b", "owner"));
  // Only the photo moves: the owner can't change anything else that way.
  await seedOld("c", "member");
  const db = as(env, "owner"), b = writeBatch(db);
  b.set(doc(db, "thumbs", "c"), thumbDoc("owner", 5));
  b.update(doc(db, "catches", "c"), { thumb: deleteField(), thumbAt: 5, weightOz: 999 });
  await assertFails(b.commit());
});

test("moving out works even on a catch whose fish is locked (a closed derby entry)", async () => {
  const now = Date.now();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "derbies", "d1"), { name: "Old", organiserUid: "admin2", start: now - 10 * 86400000, end: now - 9 * 86400000,
      syncGraceHours: 1, species: [], scoring: "heaviest", minWeightOz: 0, minLengthIn: 0, catchRelease: false, requireLocation: false, requireCrew: false });
  });
  await seedOld("e", "member", { derbyId: "d1", caughtAt: now - 9.5 * 86400000 });
  // The angler can't change the photo of a closed entry…
  const db = as(env, "member"), b = writeBatch(db);
  b.set(doc(db, "catches", "e"), { thumb: deleteField(), thumbAt: 2000 }, { merge: true });
  b.set(doc(db, "thumbs", "e"), thumbDoc("member", 2000, T2));
  await assertFails(b.commit());
  // …but the owner can move the same picture out.
  await assertSucceeds(moveOut(as(env, "owner"), "e", "owner"));
});

test("a thumbs doc goes with its catch, or an admin removes it", async () => {
  const db = as(env, "member");
  await saveNew(db, "c1", "member");
  await saveNew(db, "c2", "member");
  await assertFails(writeBatch(db).delete(doc(db, "thumbs", "c1")).commit());
  const b = writeBatch(db);
  b.delete(doc(db, "catches", "c1"));
  b.delete(doc(db, "photos", "c1"));
  b.delete(doc(db, "thumbs", "c1"));
  await assertSucceeds(b.commit());
  const admin = as(env, "admin2");
  await assertSucceeds(writeBatch(admin).delete(doc(admin, "thumbs", "c2")).commit());
});
