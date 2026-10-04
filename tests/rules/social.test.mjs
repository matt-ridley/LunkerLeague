// Rules for comments, emoji reactions and league chat.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDocs, collection, collectionGroup, query, orderBy, limitToLast, setDoc, deleteDoc } from "firebase/firestore";
import { startEnv, seedLeague, as } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seedLeague(env);
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "catches/c1"), { uid: "member", species: "Walleye", weightOz: 80 }));
});

const comment = (uid, text = "Nice fish!") => ({ uid, text, at: Date.now() });

test("members can comment as themselves on a catch that exists", async () => {
  const db = as(env, "admin2");
  await assertSucceeds(setDoc(doc(db, "catches/c1/comments/k1"), comment("admin2")));
  await assertFails(setDoc(doc(db, "catches/c1/comments/k2"), comment("member")));
  await assertFails(setDoc(doc(db, "catches/nope/comments/k3"), comment("admin2")));
  await assertFails(setDoc(doc(db, "catches/c1/comments/k4"), comment("admin2", "")));
  await assertFails(setDoc(doc(db, "catches/c1/comments/k5"), comment("admin2", "x".repeat(501))));
  await assertFails(setDoc(doc(as(env, "stranger"), "catches/c1/comments/k6"), comment("stranger")));
});

test("comments can't be edited; the author, the catch's angler or an admin can remove them", async () => {
  await setDoc(doc(as(env, "admin2"), "catches/c1/comments/k1"), comment("admin2"));
  await assertFails(setDoc(doc(as(env, "admin2"), "catches/c1/comments/k1"), comment("admin2", "edited")));
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), "members/other"), { displayName: "other", joinedAt: 1, suspended: false });
    await setDoc(doc(ctx.firestore(), "catches/c1/comments/k2"), comment("other"));
    await setDoc(doc(ctx.firestore(), "catches/c1/comments/k3"), comment("other"));
  });
  await assertFails(deleteDoc(doc(as(env, "other"), "catches/c1/comments/k1")));
  await assertSucceeds(deleteDoc(doc(as(env, "member"), "catches/c1/comments/k2"))); // the catch's angler
  await assertSucceeds(deleteDoc(doc(as(env, "other"), "catches/c1/comments/k3")));  // the author
});

test("reactions: one doc per person, only your own", async () => {
  const db = as(env, "admin2");
  await assertSucceeds(setDoc(doc(db, "catches/c1/reactions/admin2"), { uid: "admin2", emojis: ["🔥", "🎣"], at: 1 }));
  await assertFails(setDoc(doc(db, "catches/c1/reactions/member"), { uid: "member", emojis: ["🤥"], at: 1 }));
  await assertFails(setDoc(doc(db, "catches/c1/reactions/admin2"), { uid: "admin2", emojis: Array(9).fill("🔥"), at: 1 }));
  await assertSucceeds(deleteDoc(doc(db, "catches/c1/reactions/admin2")));
});

test("members can read all comments and reactions at once; non-members can't", async () => {
  await assertSucceeds(getDocs(collectionGroup(as(env, "member"), "comments")));
  await assertSucceeds(getDocs(collectionGroup(as(env, "member"), "reactions")));
  await assertFails(getDocs(collectionGroup(as(env, "stranger"), "comments")));
  await assertFails(getDocs(collectionGroup(as(env, "stranger"), "reactions")));
});

test("chat: members post as themselves; only the author or an admin can delete", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "chat/m1"), comment("member", "Who's out Saturday?")));
  await assertFails(setDoc(doc(db, "chat/m2"), comment("admin2", "Fake")));
  await assertFails(setDoc(doc(db, "chat/m3"), comment("member", "x".repeat(1001))));
  await assertFails(setDoc(doc(as(env, "stranger"), "chat/m4"), comment("stranger")));
  await assertSucceeds(getDocs(query(collection(db, "chat"), orderBy("at"), limitToLast(100))));
  await assertFails(getDocs(collection(as(env, "stranger"), "chat")));
});

test("chat messages can be deleted by their author or an admin, but not by others", async () => {
  await setDoc(doc(as(env, "member"), "chat/m1"), comment("member", "hi"));
  await setDoc(doc(as(env, "member"), "chat/m2"), comment("member", "hi again"));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "members/other"), { displayName: "other", joinedAt: 1, suspended: false }));
  await assertFails(deleteDoc(doc(as(env, "other"), "chat/m1")));
  await assertSucceeds(deleteDoc(doc(as(env, "admin2"), "chat/m1")));
  await assertSucceeds(deleteDoc(doc(as(env, "member"), "chat/m2")));
});
