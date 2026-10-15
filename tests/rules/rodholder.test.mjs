// Rules for the rod holder: everyone in the league reads it; only its angler changes it.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { startEnv, seedLeague, as, THUMB } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const rod = (uid, extra = {}) => ({ uid, kind: "rod", name: "Ugly Stik 6'6\" ML", type: "spinning", lengthIn: 78, power: "ML", action: "fast",
  notes: "", thumb: null, status: "active", endedAt: null, reels: [], createdAt: 5, ...extra });
const reel = (uid, extra = {}) => ({ uid, kind: "reel", name: "Stradic 2500", type: "spinning", size: "2500", line: "10 lb braid", lineAt: 5,
  notes: "", thumb: null, status: "active", endedAt: null, createdAt: 5, ...extra });
const photo = uid => ({ uid, src: "data:image/jpeg;base64," + "A".repeat(500), bytes: 524 });

test("an angler adds rods and reels to their own holder; everyone in the league can see them", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "rodHolder/r1"), rod("member")));
  await assertSucceeds(setDoc(doc(db, "rodHolder/a"), reel("member")));
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "rodHolder/r1")));
  await assertFails(getDoc(doc(as(env, "stranger"), "rodHolder/r1")));
  await assertFails(setDoc(doc(db, "rodHolder/r2"), rod("admin2")));               // not as someone else
  await assertFails(updateDoc(doc(as(env, "admin2"), "rodHolder/r1"), { name: "Mine now" }));
  await assertSucceeds(updateDoc(doc(db, "rodHolder/r1"), { reels: [{ reelId: "a", at: 6 }] }));
  await assertSucceeds(updateDoc(doc(db, "rodHolder/r1"), { status: "broken", endedAt: 9, reels: [{ reelId: "a", at: 6 }, { reelId: null, at: 9 }] }));
  await assertSucceeds(updateDoc(doc(db, "rodHolder/a"), { status: "worn", endedAt: 9 }));
  await assertFails(updateDoc(doc(db, "rodHolder/r1"), { createdAt: 6 }));
  await assertFails(setDoc(doc(db, "rodHolder/r1"), reel("member")));              // a rod can't turn into a reel
  await assertSucceeds(deleteDoc(doc(as(env, "admin2"), "rodHolder/a")));           // admins can clear things out
});

test("a rod or reel is a name, known kinds, sensible sizes and a small thumbnail", async () => {
  const db = as(env, "member");
  await assertFails(setDoc(doc(db, "rodHolder/a"), rod("member", { name: "" })));
  await assertFails(setDoc(doc(db, "rodHolder/b"), rod("member", { name: "x".repeat(61) })));
  await assertFails(setDoc(doc(db, "rodHolder/c"), rod("member", { type: "baitcaster" })));   // a reel type
  await assertFails(setDoc(doc(db, "rodHolder/d"), rod("member", { power: "XXH" })));
  await assertFails(setDoc(doc(db, "rodHolder/e"), rod("member", { action: "wobbly" })));
  await assertFails(setDoc(doc(db, "rodHolder/f"), rod("member", { lengthIn: 12 })));
  await assertFails(setDoc(doc(db, "rodHolder/g"), rod("member", { status: "worn" })));       // reels wear out; rods break
  await assertFails(setDoc(doc(db, "rodHolder/h"), rod("member", { reels: "a" })));
  await assertFails(setDoc(doc(db, "rodHolder/i"), rod("member", { thumb: "x".repeat(20000) })));
  await assertFails(setDoc(doc(db, "rodHolder/j"), rod("member", { price: 120 })));
  await assertFails(setDoc(doc(db, "rodHolder/k"), rod("member", { kind: "net" })));
  await assertFails(setDoc(doc(db, "rodHolder/l"), reel("member", { status: "broken" })));
  await assertFails(setDoc(doc(db, "rodHolder/m"), reel("member", { line: "x".repeat(41) })));
  await assertFails(setDoc(doc(db, "rodHolder/n"), reel("member", { size: "x".repeat(13) })));
  await assertFails(setDoc(doc(db, "rodHolder/o"), reel("member", { reels: [] })));
  await assertSucceeds(setDoc(doc(db, "rodHolder/p"), rod("member", { type: "", lengthIn: null, power: "", action: "", thumb: THUMB })));
  await assertSucceeds(setDoc(doc(db, "rodHolder/q"), reel("member", { type: "", size: "", line: "", lineAt: null })));
});

test("a rod's photo: only its angler, a sensible size, readable by the league", async () => {
  const db = as(env, "member");
  const b = writeBatch(db);
  b.set(doc(db, "rodHolder/r1"), rod("member", { thumb: THUMB }));
  b.set(doc(db, "rodHolderPhotos/r1"), photo("member"));
  await assertSucceeds(b.commit());
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "rodHolderPhotos/r1")));
  await assertFails(setDoc(doc(as(env, "admin2"), "rodHolderPhotos/r1"), photo("admin2")));
  await assertFails(setDoc(doc(db, "rodHolderPhotos/none"), photo("member")));     // no rod
  await assertFails(setDoc(doc(db, "rodHolderPhotos/r1"), { ...photo("member"), src: "x".repeat(100000) }));
  await assertSucceeds(deleteDoc(doc(db, "rodHolderPhotos/r1")));
});

test("a catch's tackle can say which rod and reel caught it", async () => {
  const db = as(env, "member");
  const catchData = { uid: "member", species: "Walleye", weightOz: 88, lengthIn: 22.5, caughtAt: Date.now() - 60000, createdAt: Date.now(),
    thumb: THUMB, photoTakenAt: null, notes: "", released: true, hasSpot: false, locShared: false, spotName: "", hasTackle: true, tackleShared: true };
  const b = writeBatch(db);
  b.set(doc(db, "catches/c1"), catchData);
  b.set(doc(db, "photos/c1"), { uid: "member", src: "data:image/jpeg;base64,BBBB" });
  b.set(doc(db, "tackle/c1"), { uid: "member", lure: "", depthFt: null, technique: "", shared: true, rodId: "r1", reelId: "a" });
  await assertSucceeds(b.commit());
  await assertSucceeds(setDoc(doc(db, "tackle/c1"), { rodId: "r2", reelId: null }, { merge: true }));
  await assertFails(setDoc(doc(db, "tackle/c1"), { rodId: 7 }, { merge: true }));
  await assertFails(setDoc(doc(db, "tackle/c1"), { reelId: "x".repeat(41) }, { merge: true }));
});
