// Rules for the archive (archive/{set}_{i} and config/league.archive), tombstones (gone/{id}), and the times added to
// catches (editedAt) and to tackle and spots (at) so they can load by year.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { startEnv, seedLeague, as, THUMB } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const SET = 1800000000000;
const part = (extra = {}) => ({ set: SET, y0: 2027, i: 0, of: 1, by: "admin2", items: "{\"catches\":[]}", ...extra });
const catchData = (uid, extra = {}) => ({
  uid, species: "Walleye", weightOz: 88, lengthIn: 22.5, caughtAt: Date.now() - 60000, createdAt: Date.now(),
  thumb: THUMB, photoTakenAt: null, notes: "", released: true, hasSpot: true, locShared: true, spotName: "Bay",
  hasTackle: true, tackleShared: true, ...extra,
});
function saveAll(db, id, uid, { extra = {}, at } = {}) {
  const b = writeBatch(db);
  b.set(doc(db, "catches", id), catchData(uid, extra));
  b.set(doc(db, "photos", id), { uid, src: "data:image/jpeg;base64,BBBB" });
  b.set(doc(db, "spots", id), { uid, lat: 44.5, lng: -79.4, acc: 0, name: "Bay", shared: true, ...(at != null ? { at } : {}) });
  b.set(doc(db, "tackle", id), { uid, lure: "Jig", depthFt: 10, technique: "jigging", shared: true, ...(at != null ? { at } : {}) });
  return b.commit();
}

test("admins save archive parts named by their set; members read them; nobody changes one", async () => {
  await assertFails(setDoc(doc(as(env, "member"), "archive", `${SET}_0`), part({ by: "member" })));
  await assertFails(setDoc(doc(as(env, "admin2"), "archive", `${SET}_1`), part()));          // the wrong name
  await assertFails(setDoc(doc(as(env, "admin2"), "archive", `${SET}_0`), part({ by: "owner" })));
  await assertFails(setDoc(doc(as(env, "admin2"), "archive", `${SET}_0`), part({ items: [] })));
  await assertSucceeds(setDoc(doc(as(env, "admin2"), "archive", `${SET}_0`), part()));
  await assertSucceeds(getDoc(doc(as(env, "member"), "archive", `${SET}_0`)));
  await assertFails(getDoc(doc(as(env, "stranger"), "archive", `${SET}_0`)));
  await assertFails(updateDoc(doc(as(env, "admin2"), "archive", `${SET}_0`), { items: "{}" }));
  await assertFails(deleteDoc(doc(as(env, "member"), "archive", `${SET}_0`)));
  await assertSucceeds(deleteDoc(doc(as(env, "admin2"), "archive", `${SET}_0`)));
});

test("admins point the league at an archive set; it must be sensible", async () => {
  const ref = db => doc(db, "config", "league");
  const ptr = { at: SET, since: SET - 1000, y0: 2027, of: 2, by: "admin2" };
  await assertFails(updateDoc(ref(as(env, "member")), { archive: ptr }));
  await assertFails(updateDoc(ref(as(env, "admin2")), { archive: { ...ptr, since: SET + 1 } }));
  await assertFails(updateDoc(ref(as(env, "admin2")), { archive: { ...ptr, extra: 1 } }));
  await assertSucceeds(updateDoc(ref(as(env, "admin2")), { archive: ptr }));
});

test("catches carry when they were saved; the angler can stamp it moving the thumbnail too", async () => {
  const db = as(env, "member");
  await assertSucceeds(saveAll(db, "c1", "member", { extra: { editedAt: Date.now() } }));
  await assertSucceeds(updateDoc(doc(db, "catches", "c1"), { focus: { x: 10, y: 20 }, editedAt: Date.now() }));
});

test("tackle and spots carry their catch's time; an admin can add it to shared ones, and nothing else", async () => {
  await assertSucceeds(saveAll(as(env, "member"), "c1", "member", { at: Date.now() - 60000 }));
  await assertSucceeds(saveAll(as(env, "member"), "c2", "member"));
  await assertFails(saveAll(as(env, "member"), "c3", "member", { at: "soon" }));
  // An admin can add `at` only; a member can't add it to someone else's.
  await assertFails(updateDoc(doc(as(env, "owner"), "tackle", "c2"), { at: 5, lure: "Spoon" }));
  await saveAll(as(env, "admin2"), "c4", "admin2");
  await assertFails(updateDoc(doc(as(env, "member"), "spots", "c4"), { at: 5 }));       // someone else's, not an admin
  await assertFails(updateDoc(doc(as(env, "member"), "tackle", "c4"), { at: 5 }));
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), "tackle", "c2"), { at: 5 }));
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), "spots", "c2"), { at: 5 }));
});

test("tombstones: only for a catch, comment or reaction that's really gone", async () => {
  const db = as(env, "member");
  await saveAll(db, "c1", "member");
  await setDoc(doc(as(env, "admin2"), "catches", "c1", "comments", "m1"), { uid: "admin2", text: "Nice", at: Date.now() });
  await setDoc(doc(as(env, "admin2"), "catches", "c1", "reactions", "admin2"), { uid: "admin2", emojis: ["🔥"], at: Date.now() });
  const tomb = (d, id, data) => setDoc(doc(d, "gone", id), { uid: "member", at: Date.now(), ...data });
  await assertFails(tomb(db, "c1", { kind: "catch" }));                                   // still there
  await assertFails(tomb(db, "m1", { kind: "comment", cid: "c1" }));
  await assertFails(tomb(db, "c1_admin2", { kind: "reaction", cid: "c1", who: "admin2" }));
  await assertFails(tomb(db, "zz", { kind: "catch", uid: "admin2" }));                    // as someone else
  // The comment's author deletes it with its tombstone in one batch.
  const a2 = as(env, "admin2"), b = writeBatch(a2);
  b.delete(doc(a2, "catches", "c1", "comments", "m1"));
  b.set(doc(a2, "gone", "m1"), { kind: "comment", cid: "c1", uid: "admin2", at: Date.now() });
  await assertSucceeds(b.commit());
  const b2 = writeBatch(a2);
  b2.delete(doc(a2, "catches", "c1", "reactions", "admin2"));
  b2.set(doc(a2, "gone", "c1_admin2"), { kind: "reaction", cid: "c1", who: "admin2", uid: "admin2", at: Date.now() });
  await assertSucceeds(b2.commit());
  await assertFails(tomb(db, "c1_wrong", { kind: "reaction", cid: "c1", who: "admin2" })); // the name must match
  // A catch that's gone (deleted earlier).
  await assertSucceeds(tomb(db, "never-was", { kind: "catch" }));
  await assertSucceeds(getDoc(doc(as(env, "owner"), "gone", "m1")));
});
