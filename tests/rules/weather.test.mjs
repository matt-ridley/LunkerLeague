// Rules for weather on catches and the league's home water.
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { startEnv, seedLeague, as, THUMB, putCatch } from "./helpers.mjs";

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedLeague(env); });

const catchData = uid => ({ uid, species: "Walleye", weightOz: 88, lengthIn: 22.5, caughtAt: Date.now() - 60000, createdAt: Date.now(),
  thumb: THUMB, photoTakenAt: null, notes: "", released: true, hasSpot: false, locShared: false, spotName: "" });
const wx = (uid, extra = {}) => ({ uid, forAt: Date.now() - 60000, tempC: 21.4, windKph: 14.5, windDir: 225, gustKph: 30,
  pressureHpa: 1016.8, cloud: 40, code: 2, src: "spot", fetchedAt: Date.now(), ...extra });

test("only the catch's angler saves its weather; everyone in the league can read it", async () => {
  await putCatch(as(env, "member"), "c1", catchData("member"));
  const db = as(env, "member");
  await assertSucceeds(setDoc(doc(db, "weather/c1"), wx("member")));
  await assertSucceeds(getDoc(doc(as(env, "admin2"), "weather/c1")));
  await assertFails(getDoc(doc(as(env, "stranger"), "weather/c1")));
  await assertFails(setDoc(doc(as(env, "admin2"), "weather/c1"), wx("admin2")));
  await assertFails(setDoc(doc(db, "weather/nocatch"), wx("member")));
  await assertSucceeds(updateDoc(doc(db, "weather/c1"), { tempC: 18, forAt: Date.now() }));
});

test("weather is sensible numbers, says where it's from, and holds no location", async () => {
  await putCatch(as(env, "member"), "c1", catchData("member"));
  const db = as(env, "member");
  await assertFails(setDoc(doc(db, "weather/c1"), wx("member", { lat: 44.5, lng: -79.4 })));
  await assertFails(setDoc(doc(db, "weather/c1"), wx("member", { tempC: 120 })));
  await assertFails(setDoc(doc(db, "weather/c1"), wx("member", { windDir: 400 })));
  await assertFails(setDoc(doc(db, "weather/c1"), wx("member", { code: 2.5 })));
  await assertFails(setDoc(doc(db, "weather/c1"), wx("member", { src: "guess" })));
  await assertSucceeds(setDoc(doc(db, "weather/c1"), wx("member", { windKph: null, gustKph: null, code: null, src: "home" })));
});

test("weather goes with its catch: the angler or an admin removes it", async () => {
  await putCatch(as(env, "member"), "c1", catchData("member"));
  await setDoc(doc(as(env, "member"), "weather/c1"), wx("member"));
  const admin = as(env, "admin2");
  const b = writeBatch(admin);
  b.delete(doc(admin, "catches/c1"));
  b.delete(doc(admin, "weather/c1"));
  await assertSucceeds(b.commit());
  await putCatch(as(env, "member"), "c2", catchData("member"));
  await setDoc(doc(as(env, "member"), "weather/c2"), wx("member"));
  await assertSucceeds(deleteDoc(doc(as(env, "member"), "weather/c2")));
});

test("admins set the league's home water: a point and a name", async () => {
  const admin = as(env, "admin2");
  await assertSucceeds(updateDoc(doc(admin, "config/league"), { home: { lat: 44.4, lng: -79.4, name: "Lake Simcoe" } }));
  await assertFails(updateDoc(doc(as(env, "member"), "config/league"), { home: { lat: 1, lng: 1, name: "" } }));
  await assertFails(updateDoc(doc(admin, "config/league"), { home: { lat: 95, lng: 1, name: "" } }));
  await assertFails(updateDoc(doc(admin, "config/league"), { home: { lat: 1, lng: 1, name: "x", zoom: 9 } }));
  await assertFails(updateDoc(doc(admin, "config/league"), { home: "Lake Simcoe" }));
  await assertSucceeds(updateDoc(doc(admin, "config/league"), { home: null }));
});
