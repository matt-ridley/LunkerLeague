// Rules for profile flair: a cover photo, favourite species and lucky lure.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { startEnv, seedLeague, as } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const cover = uid => ({ uid, src: "data:image/jpeg;base64," + "A".repeat(500), bytes: 524 });

test("a member sets their own favourite species and lucky lure, sensibly", async () => {
  const db = as(env, "member");
  await assertSucceeds(updateDoc(doc(db, "members/member"), { favSpecies: "Muskie", luckyLure: "i1" }));
  await assertSucceeds(updateDoc(doc(db, "members/member"), { luckyLure: null }));
  await assertFails(updateDoc(doc(db, "members/member"), { favSpecies: "x".repeat(41) }));
  await assertFails(updateDoc(doc(db, "members/member"), { luckyLure: 5 }));
  await assertFails(updateDoc(doc(db, "members/member"), { hasCover: "yes" }));
  await assertFails(updateDoc(doc(as(env, "admin2"), "members/member"), { favSpecies: "Carp" }));
});

test("a cover photo is your own, a sensible size, and readable by the league", async () => {
  const db = as(env, "member");
  const b = writeBatch(db);
  b.set(doc(db, "covers/member"), cover("member"));
  b.update(doc(db, "members/member"), { hasCover: true });
  await assertSucceeds(b.commit());
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "covers/member")));
  await assertFails(getDoc(doc(as(env, "stranger"), "covers/member")));
  await assertFails(setDoc(doc(as(env, "admin2"), "covers/member"), cover("admin2")));
  await assertFails(setDoc(doc(db, "covers/admin2"), cover("member")));
  await assertFails(setDoc(doc(db, "covers/member"), { ...cover("member"), src: "x".repeat(100000) }));
  await assertSucceeds(deleteDoc(doc(as(env, "admin2"), "covers/member"))); // admins can clear one out
  await assertSucceeds(setDoc(doc(db, "covers/member"), cover("member")));
  await assertSucceeds(deleteDoc(doc(db, "covers/member")));
});
