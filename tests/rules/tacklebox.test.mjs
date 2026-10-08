// Rules for the tackle box: everyone in the league reads it; only its angler changes it.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { startEnv, seedLeague, as, THUMB } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const item = (uid, extra = {}) => ({ uid, name: "Chartreuse jig", type: "jig", technique: "jigging", depthFt: 18, notes: "",
  thumb: null, retired: false, createdAt: 5, ...extra });
const photo = uid => ({ uid, src: "data:image/jpeg;base64," + "A".repeat(500), bytes: 524 });

test("an angler adds to their own box; everyone in the league can see it", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "tackleBox/i1"), item("member")));
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "tackleBox/i1")));
  await assertFails(getDoc(doc(as(env, "stranger"), "tackleBox/i1")));
  await assertFails(setDoc(doc(db, "tackleBox/i2"), item("admin2")));            // not as someone else
  await assertFails(updateDoc(doc(as(env, "admin2"), "tackleBox/i1"), { name: "Mine now" }));
  await assertSucceeds(updateDoc(doc(db, "tackleBox/i1"), { name: "Chartreuse jig, 1/4 oz", retired: true }));
  await assertFails(updateDoc(doc(db, "tackleBox/i1"), { createdAt: 6 }));
});

test("an item is a name, a known type and technique, a sensible depth, short notes and a small thumbnail", async () => {
  const db = as(env, "member");
  await assertFails(setDoc(doc(db, "tackleBox/a"), item("member", { name: "" })));
  await assertFails(setDoc(doc(db, "tackleBox/b"), item("member", { name: "x".repeat(61) })));
  await assertFails(setDoc(doc(db, "tackleBox/c"), item("member", { type: "dynamite" })));
  await assertFails(setDoc(doc(db, "tackleBox/d"), item("member", { technique: "netting" })));
  await assertFails(setDoc(doc(db, "tackleBox/e"), item("member", { depthFt: 0 })));
  await assertFails(setDoc(doc(db, "tackleBox/f"), item("member", { notes: "x".repeat(201) })));
  await assertFails(setDoc(doc(db, "tackleBox/g"), item("member", { thumb: "x".repeat(20000) })));
  await assertFails(setDoc(doc(db, "tackleBox/h"), item("member", { price: 12 })));
  await assertSucceeds(setDoc(doc(db, "tackleBox/i"), item("member", { type: "", technique: "", depthFt: null, thumb: THUMB })));
});

test("an item's photo: only its angler, a sensible size, readable by the league", async () => {
  const db = as(env, "member");
  const b = writeBatch(db);
  b.set(doc(db, "tackleBox/i1"), item("member", { thumb: THUMB }));
  b.set(doc(db, "tackleBoxPhotos/i1"), photo("member"));
  await assertSucceeds(b.commit());
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "tackleBoxPhotos/i1")));
  await assertFails(setDoc(doc(as(env, "admin2"), "tackleBoxPhotos/i1"), photo("admin2")));
  await assertFails(setDoc(doc(db, "tackleBoxPhotos/none"), photo("member")));     // no item
  await assertFails(setDoc(doc(db, "tackleBoxPhotos/i1"), { ...photo("member"), src: "x".repeat(100000) }));
  await assertSucceeds(deleteDoc(doc(as(env, "admin2"), "tackleBoxPhotos/i1")));    // admins can clear things out
  await assertSucceeds(deleteDoc(doc(db, "tackleBox/i1")));
});

test("a catch's tackle can say which box item it came from", async () => {
  const db = as(env, "member");
  const catchData = { uid: "member", species: "Walleye", weightOz: 88, lengthIn: 22.5, caughtAt: Date.now() - 60000, createdAt: Date.now(),
    thumb: THUMB, photoTakenAt: null, notes: "", released: true, hasSpot: false, locShared: false, spotName: "", hasTackle: true, tackleShared: true };
  const b = writeBatch(db);
  b.set(doc(db, "catches/c1"), catchData);
  b.set(doc(db, "photos/c1"), { uid: "member", src: "data:image/jpeg;base64,BBBB" });
  b.set(doc(db, "tackle/c1"), { uid: "member", lure: "Chartreuse jig", depthFt: 18, technique: "jigging", shared: true, itemId: "i1" });
  await assertSucceeds(b.commit());
  await assertSucceeds(setDoc(doc(db, "tackle/c1"), { itemId: "i2" }, { merge: true }));
  await assertFails(setDoc(doc(db, "tackle/c1"), { itemId: 7 }, { merge: true }));
  await assertFails(setDoc(doc(db, "tackle/c1"), { itemId: "x".repeat(41) }, { merge: true }));
});
