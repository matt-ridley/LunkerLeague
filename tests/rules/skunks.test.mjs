// Rules for skunks: a day out with no fish, one per angler per day.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { startEnv, seedLeague, as } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const skunk = (uid, day, extra = {}) => ({ uid, day, notes: "", createdAt: Date.now(), ...extra });

test("an angler logs their own skunk, one per day, readable by the league", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "skunks/member_2026-06-02"), skunk("member", "2026-06-02")));
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "skunks/member_2026-06-02")));
  await assertFails(getDoc(doc(as(env, "stranger"), "skunks/member_2026-06-02")));
  // The id has to be the angler and the day.
  await assertFails(setDoc(doc(db, "skunks/member_2026-06-03"), skunk("member", "2026-06-02")));
  await assertFails(setDoc(doc(db, "skunks/whatever"), skunk("member", "2026-06-02")));
  await assertFails(setDoc(doc(db, "skunks/admin2_2026-06-02"), skunk("admin2", "2026-06-02")));
  await assertFails(setDoc(doc(as(env, "stranger"), "skunks/stranger_2026-06-02"), skunk("stranger", "2026-06-02")));
});

test("a skunk is a day, short notes, and nothing else", async () => {
  const db = as(env, "member");
  await assertFails(setDoc(doc(db, "skunks/member_June 2"), skunk("member", "June 2")));
  await assertFails(setDoc(doc(db, "skunks/member_2026-06-04"), skunk("member", "2026-06-04", { notes: "x".repeat(201) })));
  await assertFails(setDoc(doc(db, "skunks/member_2026-06-05"), skunk("member", "2026-06-05", { fish: 3 })));
  await assertSucceeds(setDoc(doc(db, "skunks/member_2026-06-06"), skunk("member", "2026-06-06", { notes: "Tried everything" })));
});

test("only the angler edits their skunk; the angler or an admin removes it", async () => {
  const db = as(env, "member");
  await setDoc(doc(db, "skunks/member_2026-06-02"), skunk("member", "2026-06-02", { createdAt: 5 }));
  await assertSucceeds(updateDoc(doc(db, "skunks/member_2026-06-02"), { notes: "Wind from the east" }));
  await assertFails(updateDoc(doc(db, "skunks/member_2026-06-02"), { createdAt: 6 }));
  await assertFails(updateDoc(doc(as(env, "admin2"), "skunks/member_2026-06-02"), { notes: "ha" }));
  await setDoc(doc(db, "skunks/member_2026-06-03"), skunk("member", "2026-06-03"));
  await assertSucceeds(deleteDoc(doc(db, "skunks/member_2026-06-02")));
  await assertSucceeds(deleteDoc(doc(as(env, "admin2"), "skunks/member_2026-06-03")));
});
