// Rules for claiming the league, joining with an invite code, and admin powers.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch, deleteField, arrayUnion } from "firebase/firestore";
import { startEnv, seedLeague, as } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

function claimBatch(db, uid) {
  const b = writeBatch(db);
  b.set(doc(db, "config/league"), { name: "L", ownerUid: uid, admins: [uid], createdAt: 1 });
  b.set(doc(db, "config/invite"), { code: "PIKE-1000" });
  b.set(doc(db, "members", uid), { displayName: "Owner", joinedAt: 1, suspended: false });
  return b.commit();
}

test("the first user can claim an empty league", async () => {
  await assertSucceeds(claimBatch(as(env, "alice"), "alice"));
});

test("nobody can claim a league that already exists", async () => {
  await claimBatch(as(env, "alice"), "alice");
  await assertFails(claimBatch(as(env, "bob"), "bob"));
});

test("you can't claim a league in someone else's name", async () => {
  await assertFails(claimBatch(as(env, "bob"), "alice"));
});

test("signed-out visitors can't read anything", async () => {
  await seedLeague(env);
  const db = as(env, null);
  await assertFails(getDoc(doc(db, "config/league")));
  await assertFails(getDocs(collection(db, "members")));
});

test("a signed-in non-member can see the league exists but not the members or invite code", async () => {
  await seedLeague(env);
  const db = as(env, "stranger");
  await assertSucceeds(getDoc(doc(db, "config/league")));
  await assertFails(getDocs(collection(db, "members")));
  await assertFails(getDoc(doc(db, "config/invite")));
});

test("joining needs the right invite code", async () => {
  await seedLeague(env);
  const db = as(env, "newbie");
  const me = doc(db, "members/newbie");
  await assertFails(setDoc(me, { displayName: "New", joinedAt: 2, suspended: false, invite: "WRONG" }));
  await assertFails(setDoc(me, { displayName: "New", joinedAt: 2, suspended: false }));
  await assertSucceeds(setDoc(me, { displayName: "New", joinedAt: 2, suspended: false, invite: "WALLEYE-1234" }));
  await assertSucceeds(updateDoc(me, { invite: deleteField() }));
  await assertSucceeds(getDocs(collection(db, "members")));
});

test("you can't join as someone else or with odd account flags", async () => {
  await seedLeague(env);
  const db = as(env, "newbie");
  await assertFails(setDoc(doc(db, "members/other"), { displayName: "X", joinedAt: 2, suspended: false, invite: "WALLEYE-1234" }));
  await assertFails(setDoc(doc(db, "members/newbie"), { displayName: "X", joinedAt: 2, suspended: true, invite: "WALLEYE-1234" }));
});

test("members can edit their own profile but not pause flags or other people", async () => {
  await seedLeague(env);
  const db = as(env, "member");
  await assertSucceeds(updateDoc(doc(db, "members/member"), { displayName: "Renamed", homeWater: "Lake" }));
  await assertFails(updateDoc(doc(db, "members/member"), { suspended: true }));
  await assertFails(updateDoc(doc(db, "members/admin2"), { displayName: "Hacked" }));
});

test("members can't read the invite code or make themselves admin", async () => {
  await seedLeague(env);
  const db = as(env, "member");
  await assertFails(getDoc(doc(db, "config/invite")));
  await assertFails(updateDoc(doc(db, "config/league"), { admins: arrayUnion("member") }));
  await assertFails(updateDoc(doc(db, "config/league"), { name: "Mine now" }));
});

test("admins can change the invite code, rename, and pause or remove ordinary members", async () => {
  await seedLeague(env);
  const db = as(env, "admin2");
  await assertSucceeds(getDoc(doc(db, "config/invite")));
  await assertSucceeds(setDoc(doc(db, "config/invite"), { code: "BASS-2222" }));
  await assertSucceeds(updateDoc(doc(db, "config/league"), { name: "Renamed League" }));
  await assertSucceeds(updateDoc(doc(db, "members/member"), { suspended: true }));
  await assertSucceeds(deleteDoc(doc(db, "members/member")));
});

test("a non-owner admin can't change admins or touch the owner", async () => {
  await seedLeague(env);
  const db = as(env, "admin2");
  await assertFails(updateDoc(doc(db, "config/league"), { admins: arrayUnion("member") }));
  await assertFails(updateDoc(doc(db, "members/owner"), { suspended: true }));
  await assertFails(deleteDoc(doc(db, "members/owner")));
  await assertFails(updateDoc(doc(db, "config/league"), { ownerUid: "admin2" }));
});

test("the owner can promote and demote admins and pause another admin, but must stay an admin", async () => {
  await seedLeague(env);
  const db = as(env, "owner");
  await assertSucceeds(updateDoc(doc(db, "config/league"), { admins: ["owner", "admin2", "member"] }));
  await assertSucceeds(updateDoc(doc(db, "members/admin2"), { suspended: true }));
  await assertFails(updateDoc(doc(db, "config/league"), { admins: ["admin2"] }));
});

test("a paused member can't read anything", async () => {
  await seedLeague(env);
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), "members/member"), { suspended: true }));
  const db = as(env, "member");
  await assertFails(getDocs(collection(db, "members")));
  await assertSucceeds(getDoc(doc(db, "members/member"))); // so the app can show "Account paused"
});
