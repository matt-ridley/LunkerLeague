// Rules for no-shows on outings, and "In" answers locking once an outing starts.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { startEnv, seedLeague, as } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedLeague(env);
  await env.withSecurityRulesDisabled(async ctx => {
    for (const id of ["cap", "rider", "other"]) await setDoc(doc(ctx.firestore(), "members", id), { displayName: id, joinedAt: 1, suspended: false });
  });
});

const H = 3600000, DAY = 24 * H;
const trip = (extra = {}) => ({ uid: "member", title: "Saturday walleye", at: Date.now() - H, endAt: Date.now() + 2 * H, place: "", notes: "", createdAt: 1, kind: "boat", ...extra });
// Seeds an outing with answers: rider sits in cap's boat; other is In with no seat; owner said Maybe.
async function seed(t = trip()) {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "trips/t1"), t);
    await setDoc(doc(db, "trips/t1/rsvps/cap"), { answer: "in", at: 1 });
    await setDoc(doc(db, "trips/t1/rsvps/rider"), { answer: "in", at: 1, boat: "cap", seatAt: 1 });
    await setDoc(doc(db, "trips/t1/rsvps/other"), { answer: "in", at: 1 });
    await setDoc(doc(db, "trips/t1/rsvps/owner"), { answer: "maybe", at: 1 });
  });
}
const mark = (uid, who, extra = {}) => setDoc(doc(as(env, uid), `trips/t1/noShows/${who}`), { by: uid, at: Date.now(), ...extra });

test("the planner, an admin or a rider's captain marks a no-show; nobody else can", async () => {
  await seed();
  await assertSucceeds(mark("member", "other"));                     // planner
  await assertSucceeds(mark("admin2", "cap"));                       // admin
  await assertSucceeds(mark("cap", "rider"));                        // the rider's captain
  await assertFails(mark("rider", "cap"));                           // a rider can't mark their captain
  await assertFails(mark("other", "rider"));                         // just another angler
  await assertFails(mark("member", "owner"));                        // only someone who said In
  await assertFails(mark("admin2", "admin2"));                       // not yourself (no answer anyway)
  await assertFails(mark("member", "rider", { by: "cap" }));         // signed as yourself
  await assertFails(mark("member", "rider", { reason: "late" }));    // nothing else on it
});

test("a captain only marks on a boat outing; nobody marks before it starts or more than a week after", async () => {
  await seed(trip({ kind: "shore" }));
  await assertFails(mark("cap", "rider"));
  await seed(trip({ at: Date.now() + H, endAt: Date.now() + 3 * H }));
  await assertFails(mark("member", "other"));
  await seed(trip({ at: Date.now() - 9 * DAY, endAt: Date.now() - 8 * DAY }));
  await assertFails(mark("member", "other"));
  await seed(trip({ at: Date.now() - 7 * DAY, endAt: Date.now() - 6 * DAY }));
  await assertSucceeds(mark("member", "other"));
});

test("a mark can be undone by the same people; the planner or an admin can clear them out with the outing", async () => {
  await seed();
  await mark("cap", "rider");
  await assertFails(deleteDoc(doc(as(env, "rider"), "trips/t1/noShows/rider")));   // not by the no-show
  await assertSucceeds(deleteDoc(doc(as(env, "cap"), "trips/t1/noShows/rider")));
  await mark("member", "other");
  const db = as(env, "member"), b = writeBatch(db);
  for (const who of ["cap", "rider", "other", "owner"]) b.delete(doc(db, `trips/t1/rsvps/${who}`));
  b.delete(doc(db, "trips/t1/noShows/other"));
  b.delete(doc(db, "trips/t1"));
  await assertSucceeds(b.commit());
});

test("once an outing starts, an In stays In; before then, answers change freely", async () => {
  await seed();
  await assertFails(setDoc(doc(as(env, "other"), "trips/t1/rsvps/other"), { answer: "out", at: Date.now() }));
  await assertFails(deleteDoc(doc(as(env, "other"), "trips/t1/rsvps/other")));
  await assertSucceeds(setDoc(doc(as(env, "other"), "trips/t1/rsvps/other"), { answer: "in", at: Date.now(), boat: "cap", seatAt: Date.now() })); // can still change seats
  await assertSucceeds(setDoc(doc(as(env, "owner"), "trips/t1/rsvps/owner"), { answer: "in", at: Date.now() }));  // a late Maybe can come
  await seed(trip({ at: Date.now() + H, endAt: Date.now() + 3 * H }));
  await assertSucceeds(setDoc(doc(as(env, "other"), "trips/t1/rsvps/other"), { answer: "out", at: Date.now() }));
  await assertSucceeds(deleteDoc(doc(as(env, "rider"), "trips/t1/rsvps/rider")));
});
