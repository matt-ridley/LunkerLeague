// Rules for bets: setting one up, changing it before it starts, cancelling, and joining.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { startEnv, seedLeague, as } from "./helpers.mjs";

const H = 3600 * 1000;
let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const bet = (organiserUid, extra = {}) => ({ title: "Biggest pike", organiserUid, kind: "contest",
  rule: { win: "heaviest", species: [], minWeightOz: 0, minLengthIn: 0 }, open: true, invited: [],
  start: Date.now() + 2 * H, end: Date.now() + 26 * H, buyIn: 5, roundTo: 0, prize: "", note: "", createdAt: Date.now(), cancelled: false, ...extra });
const seed = data => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "bets/b1"), data));

test("starting a bet: as yourself, starting later, with sensible settings and never points", async () => {
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "bets/a"), bet("member")));
  await assertFails(setDoc(doc(db, "bets/b"), bet("admin2")));                                   // not as someone else
  await assertFails(setDoc(doc(db, "bets/c"), bet("member", { start: Date.now() - H })));
  await assertFails(setDoc(doc(db, "bets/d"), bet("member", { cancelled: true })));
  await assertFails(setDoc(doc(db, "bets/e"), bet("member", { rule: { win: "luck", species: [], minWeightOz: 0, minLengthIn: 0 } })));
  await assertFails(setDoc(doc(db, "bets/f"), bet("member", { buyIn: -5 })));
  await assertFails(setDoc(doc(db, "bets/g"), bet("member", { roundTo: 2 })));
  await assertFails(setDoc(doc(db, "bets/h"), bet("member", { stake: 10 })));                    // no points field
  await assertFails(setDoc(doc(db, "bets/i"), bet("member", { title: "" })));
  await assertSucceeds(getDoc(doc(as(env, "owner"), "bets/a")));
});

test("changing a bet: the organiser, until it starts; after that only cancelling", async () => {
  await seed(bet("member"));
  await assertFails(updateDoc(doc(as(env, "admin2"), "bets/b1"), { title: "Mine now" }));
  await assertSucceeds(updateDoc(doc(as(env, "member"), "bets/b1"), { title: "Biggest pike by Sunday", buyIn: 10 }));
  await assertFails(updateDoc(doc(as(env, "member"), "bets/b1"), { start: Date.now() - H }));
  await assertFails(updateDoc(doc(as(env, "member"), "bets/b1"), { organiserUid: "admin2" }));
  await seed(bet("member", { start: Date.now() - H }));                                          // started
  await assertFails(updateDoc(doc(as(env, "member"), "bets/b1"), { buyIn: 50 }));
  await assertSucceeds(updateDoc(doc(as(env, "member"), "bets/b1"), { cancelled: true }));
  await assertFails(deleteDoc(doc(as(env, "member"), "bets/b1")));                               // started: only the owner
  await assertSucceeds(deleteDoc(doc(as(env, "owner"), "bets/b1")));
});

test("joining: yourself, before it starts; invite-only bets only for the invited (and the organiser)", async () => {
  await seed(bet("member", { open: false, invited: ["admin2"] }));
  await assertSucceeds(setDoc(doc(as(env, "admin2"), "bets/b1/players/admin2"), { at: Date.now(), in: true }));
  await assertSucceeds(setDoc(doc(as(env, "member"), "bets/b1/players/member"), { at: Date.now(), in: true }));
  await assertFails(setDoc(doc(as(env, "owner"), "bets/b1/players/owner"), { at: Date.now(), in: true }));     // not invited
  await assertFails(setDoc(doc(as(env, "member"), "bets/b1/players/admin2"), { at: Date.now(), in: true }));   // not for someone else
  await assertSucceeds(setDoc(doc(as(env, "admin2"), "bets/b1/players/admin2"), { at: Date.now(), in: false })); // changed their mind
  await assertFails(setDoc(doc(as(env, "admin2"), "bets/b1/players/admin2"), { at: Date.now(), in: true, points: 5 }));
  await assertSucceeds(deleteDoc(doc(as(env, "member"), "bets/b1/players/admin2")));                         // the organiser takes them off
  // Open bets: anyone. After the start, or cancelled: nobody.
  await seed(bet("member"));
  await assertSucceeds(setDoc(doc(as(env, "owner"), "bets/b1/players/owner"), { at: Date.now(), in: true }));
  await seed(bet("member", { cancelled: true }));
  await assertFails(setDoc(doc(as(env, "admin2"), "bets/b1/players/admin2"), { at: Date.now(), in: true }));
  await seed(bet("member", { start: Date.now() - H }));
  await assertFails(setDoc(doc(as(env, "admin2"), "bets/b1/players/admin2"), { at: Date.now(), in: true }));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "bets/b1/players/admin2"), { at: Date.now(), in: true }));
  await assertFails(deleteDoc(doc(as(env, "admin2"), "bets/b1/players/admin2")));                           // no backing out once it starts
  await assertFails(deleteDoc(doc(as(env, "member"), "bets/b1/players/admin2")));
});

test("settling: the organiser (or the league owner) calls a bet they decide, once it has started", async () => {
  const called = { rule: { win: "called", species: [], minWeightOz: 0, minLengthIn: 0 }, note: "First boat to the launch" };
  await seed(bet("member", called));
  const result = by => ({ winners: ["admin2"], wash: false, at: Date.now(), by });
  await assertFails(updateDoc(doc(as(env, "member"), "bets/b1"), { result: result("member") }));               // not started yet
  await seed(bet("member", { ...called, start: Date.now() - H }));
  await assertFails(updateDoc(doc(as(env, "admin2"), "bets/b1"), { result: result("admin2") }));              // not the organiser
  await assertFails(updateDoc(doc(as(env, "member"), "bets/b1"), { result: result("admin2") }));              // as someone else
  await assertFails(updateDoc(doc(as(env, "member"), "bets/b1"), { result: result("member"), buyIn: 100 }));   // nothing else
  await assertSucceeds(updateDoc(doc(as(env, "member"), "bets/b1"), { result: result("member") }));
  await assertSucceeds(updateDoc(doc(as(env, "owner"), "bets/b1"), { result: { winners: [], wash: true, at: Date.now(), by: "owner" } }));
  // A bet the app settles can't be called by hand.
  await seed(bet("member", { start: Date.now() - H }));
  await assertFails(updateDoc(doc(as(env, "member"), "bets/b1"), { result: result("member") }));
  await assertFails(setDoc(doc(as(env, "member"), "bets/x"), bet("member", { ...called, result: result("member") })));     // not when starting one
});

test("proof: one photo each from anglers in the bet, while it's being decided", async () => {
  const called = { rule: { win: "called", species: [], minWeightOz: 0, minLengthIn: 0 }, note: "First boat to the launch", start: Date.now() - H };
  const proof = { photo: "data:image/jpeg;base64," + "P".repeat(500), thumb: "data:image/jpeg;base64," + "T".repeat(200), takenAt: Date.now(), note: "Here first", at: Date.now() };
  await seed(bet("member", called));
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), "bets/b1/players/admin2"), { at: 1, in: true });
    await setDoc(doc(ctx.firestore(), "bets/b1/players/owner"), { at: 1, in: false });
  });
  await assertSucceeds(setDoc(doc(as(env, "admin2"), "bets/b1/proofs/admin2"), proof));
  await assertSucceeds(setDoc(doc(as(env, "admin2"), "bets/b1/proofs/admin2"), { ...proof, note: "Replaced" }));
  await assertFails(setDoc(doc(as(env, "admin2"), "bets/b1/proofs/member"), proof));                           // not for someone else
  await assertFails(setDoc(doc(as(env, "owner"), "bets/b1/proofs/owner"), proof));                             // turned the invite down
  await assertFails(setDoc(doc(as(env, "admin2"), "bets/b1/proofs/admin2"), { ...proof, photo: "x" }));
  await assertSucceeds(getDoc(doc(as(env, "owner"), "bets/b1/proofs/admin2")));
  await assertSucceeds(deleteDoc(doc(as(env, "member"), "bets/b1/proofs/admin2")));                            // the organiser removes it
  // Not before it starts, and not once it's settled.
  await seed(bet("member", { ...called, start: Date.now() + H }));
  await assertFails(setDoc(doc(as(env, "admin2"), "bets/b1/proofs/admin2"), proof));
  await seed(bet("member", { ...called, result: { winners: [], wash: true, at: Date.now(), by: "member" } }));
  await assertFails(setDoc(doc(as(env, "admin2"), "bets/b1/proofs/admin2"), proof));
});
