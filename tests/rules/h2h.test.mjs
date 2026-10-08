// Rules for head-to-head challenges: offering, answering, countering, withdrawing and the owner's veto.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { startEnv, seedLeague, as } from "./helpers.mjs";

const H = 3600 * 1000;
let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const terms = (extra = {}) => ({ win: "heaviest", bagSize: 5, species: [], start: Date.now() + 2 * H, end: Date.now() + 26 * H,
  stake: 5, money: "Loser buys coffee", note: "", ...extra });
const offer = (from, to, extra = {}) => ({ from, to, terms: terms(), status: "open", turn: to, counters: 0,
  createdAt: Date.now(), updatedAt: Date.now(), vetoed: false, ...extra });
const seed = data => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "challenges/h1"), data));

test("offering: as yourself, to another member, starting later, with sensible terms", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "challenges/a"), offer("member", "admin2")));
  await assertFails(setDoc(doc(db, "challenges/b"), offer("admin2", "member")));                 // not as someone else
  await assertFails(setDoc(doc(db, "challenges/c"), offer("member", "member")));                 // not yourself
  await assertFails(setDoc(doc(db, "challenges/d"), offer("member", "stranger")));               // not a member
  await assertFails(setDoc(doc(db, "challenges/e"), offer("member", "admin2", { status: "accepted" })));
  await assertFails(setDoc(doc(db, "challenges/f"), offer("member", "admin2", { turn: "member" })));
  await assertFails(setDoc(doc(db, "challenges/g"), offer("member", "admin2", { terms: terms({ start: Date.now() - H }) })));
  await assertFails(setDoc(doc(db, "challenges/h"), offer("member", "admin2", { terms: terms({ win: "luck" }) })));
  await assertFails(setDoc(doc(db, "challenges/i"), offer("member", "admin2", { terms: terms({ stake: 2.5 }) })));
  await assertFails(setDoc(doc(db, "challenges/j"), offer("member", "admin2", { terms: terms({ end: Date.now() + 40 * 24 * H }) })));
  await assertFails(setDoc(doc(db, "challenges/k"), offer("member", "admin2", { vetoed: true })));
  await assertFails(setDoc(doc(as(env, null), "challenges/l"), offer("member", "admin2")));
  await assertSucceeds(getDoc(doc(as(env, "owner"), "challenges/a")));                           // the league can see it
});

test("answering: only whoever's turn it is accepts or declines, without changing the terms", async () => {
  await seed(offer("member", "admin2"));
  await assertFails(updateDoc(doc(as(env, "member"), "challenges/h1"), { status: "accepted", acceptedAt: Date.now(), updatedAt: Date.now() }));
  await assertFails(updateDoc(doc(as(env, "owner"), "challenges/h1"), { status: "accepted", acceptedAt: Date.now(), updatedAt: Date.now() }));
  await assertFails(updateDoc(doc(as(env, "admin2"), "challenges/h1"), { status: "accepted", acceptedAt: Date.now(), updatedAt: Date.now(), "terms.stake": 0 }));
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), "challenges/h1"), { status: "accepted", acceptedAt: Date.now(), updatedAt: Date.now() }));
  // Accepted: the terms are fixed, and nobody can back out.
  await assertFails(updateDoc(doc(as(env, "admin2"), "challenges/h1"), { status: "declined", updatedAt: Date.now() }));
  await assertFails(updateDoc(doc(as(env, "member"), "challenges/h1"), { status: "withdrawn", updatedAt: Date.now() }));
  await seed(offer("member", "admin2"));
  await assertSucceeds(updateDoc(doc(as(env, "admin2"), "challenges/h1"), { status: "declined", updatedAt: Date.now() }));
});

test("countering: new terms, and it's the other one's move; not after the start", async () => {
  await seed(offer("member", "admin2"));
  const admin2 = doc(as(env, "admin2"), "challenges/h1"), member = doc(as(env, "member"), "challenges/h1");
  await assertFails(updateDoc(admin2, { terms: terms({ stake: 2 }), turn: "admin2", counters: 1, updatedAt: Date.now() }));  // must hand it over
  await assertFails(updateDoc(admin2, { terms: terms({ stake: 2 }), turn: "member", counters: 5, updatedAt: Date.now() }));  // count goes up by one
  await assertFails(updateDoc(admin2, { terms: terms({ start: Date.now() - H }), turn: "member", counters: 1, updatedAt: Date.now() }));
  await assertSucceeds(updateDoc(admin2, { terms: terms({ stake: 2 }), turn: "member", counters: 1, updatedAt: Date.now() }));
  await assertFails(updateDoc(admin2, { status: "accepted", acceptedAt: Date.now(), updatedAt: Date.now() }));              // now the member's move
  await assertSucceeds(updateDoc(member, { status: "accepted", acceptedAt: Date.now(), updatedAt: Date.now() }));
  // Too late: once the start time passes, an offer can't be accepted or countered.
  await seed(offer("member", "admin2", { terms: terms({ start: Date.now() - 60000 }) }));
  await assertFails(updateDoc(admin2, { status: "accepted", acceptedAt: Date.now(), updatedAt: Date.now() }));
});

test("withdrawing: the one waiting can take back their offer", async () => {
  await seed(offer("member", "admin2"));
  await assertFails(updateDoc(doc(as(env, "admin2"), "challenges/h1"), { status: "withdrawn", updatedAt: Date.now() }));   // it's their move: decline instead
  await assertFails(updateDoc(doc(as(env, "owner"), "challenges/h1"), { status: "withdrawn", updatedAt: Date.now() }));    // not in it
  await assertSucceeds(updateDoc(doc(as(env, "member"), "challenges/h1"), { status: "withdrawn", updatedAt: Date.now() }));
});

test("veto: only the league owner, and nothing else changes; only the owner deletes", async () => {
  await seed(offer("member", "admin2", { status: "accepted", acceptedAt: Date.now() }));
  await assertFails(updateDoc(doc(as(env, "admin2"), "challenges/h1"), { vetoed: true, vetoedAt: Date.now(), vetoedBy: "admin2" }));  // an admin isn't enough
  await assertFails(updateDoc(doc(as(env, "owner"), "challenges/h1"), { vetoed: true, vetoedAt: Date.now(), vetoedBy: "member" }));
  await assertFails(updateDoc(doc(as(env, "owner"), "challenges/h1"), { vetoed: true, vetoedAt: Date.now(), vetoedBy: "owner", "terms.stake": 0 }));
  await assertSucceeds(updateDoc(doc(as(env, "owner"), "challenges/h1"), { vetoed: true, vetoedAt: Date.now(), vetoedBy: "owner" }));
  await assertSucceeds(updateDoc(doc(as(env, "owner"), "challenges/h1"), { vetoed: false, vetoedAt: Date.now(), vetoedBy: "owner" }));
  await assertFails(deleteDoc(doc(as(env, "member"), "challenges/h1")));
  await assertSucceeds(deleteDoc(doc(as(env, "owner"), "challenges/h1")));
});

test("admins can set head-to-head points", async () => {
  const values = { catchPts: 1, dailyCap: 3, speciesPts: 3, recordPts: [5, 3, 1], derbyPts: [25, 15, 10], participationPts: 2, beatPts: 0,
    titles: [0, 10, 25, 50, 100, 175, 275], h2hPts: 1, h2hWinPts: 3, h2hMaxStake: 10 };
  const v = { mode: "forward", effectiveFrom: Date.now(), createdAt: Date.now(), createdBy: "admin2", note: "", values };
  await assertSucceeds(setDoc(doc(as(env, "admin2"), "scoring/v1"), v));
  await assertFails(setDoc(doc(as(env, "admin2"), "scoring/v2"), { ...v, values: { ...values, h2hMaxStake: -1 } }));
});
