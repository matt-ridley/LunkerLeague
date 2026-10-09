// Unit tests for boat profiles. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { myBoats, boatStats, outingBoat, defaultBoat, boatOutings, motorText, MOTOR_BRANDS, listBoats, specText } from "../js/fleet.js";

const fleet = new Map([
  ["b1", { id: "b1", uid: "amy", name: "Lund", crew: ["bo"] }],
  ["b2", { id: "b2", uid: "bo", name: "Alumacraft", crew: [] }],
  ["b3", { id: "b3", uid: "amy", name: "Old tin", crew: [], retired: true }],
  ["b4", { id: "b4", uid: "cy", name: "Bass boat", crew: ["amy"] }],
]);
const c = (id, uid, boatId, extra = {}) => ({ id, uid, boatId, species: "Walleye", caughtAt: 1, createdAt: 1, ...extra });

test("the boats an angler can pick: their own first, then ones they crew on, never retired ones", () => {
  assert.deepEqual(myBoats("amy", fleet).map(b => b.id), ["b1", "b4"]);
  assert.deepEqual(myBoats("bo", fleet).map(b => b.id), ["b2", "b1"]);
  assert.deepEqual(myBoats("dee", fleet), []);
});

test("a boat's stats: fish (stringers count theirs), species, biggest fish and who caught them", () => {
  const catches = [c("a", "amy", "b1", { weightOz: 60 }), c("b", "bo", "b1", { weightOz: 90 }), c("d", "bo", "b1", { species: "Perch", fishCount: 12, limit: true }),
    c("e", "amy", "b1", { dq: true, weightOz: 300 }), c("f", "amy", "b2")];
  const s = boatStats("b1", catches);
  assert.deepEqual([s.fish, s.catches, s.species, s.biggest.id], [14, 3, 2, "b"]);
  assert.deepEqual(s.anglers, [{ uid: "bo", fish: 13 }, { uid: "amy", fish: 1 }]);
  assert.equal(boatStats("b9", catches).biggest, null);
});

test("the outing boat you're on now: the one you brought, or your seat's boat", () => {
  const now = 10 * 3600000;
  const trips = new Map([["t1", { id: "t1", at: now - 3600000, endAt: now + 3600000 }], ["t2", { id: "t2", at: now + 5 * 3600000 }]]);
  const rsvps = new Map([["t1", new Map([["amy", { answer: "in" }], ["bo", { answer: "in", boat: "amy" }], ["cy", { answer: "maybe", boat: "amy" }]])]]);
  const tripBoats = new Map([["t1", new Map([["amy", { seats: 2, name: "Lund", boatId: "b1" }]])]]);
  assert.equal(outingBoat("amy", { trips, rsvps, tripBoats, now }), "b1");
  assert.equal(outingBoat("bo", { trips, rsvps, tripBoats, now }), "b1");
  assert.equal(outingBoat("cy", { trips, rsvps, tripBoats, now }), null);           // only a maybe
  assert.equal(outingBoat("amy", { trips, rsvps, tripBoats, now: now + 3 * 3600000 }), null); // the outing's over
  assert.deepEqual(boatOutings("b1", trips, tripBoats).map(t => t.id), ["t1"]);
});

test("a new catch starts with the outing boat, else the last boat you used (if you can still pick it)", () => {
  const catches = [c("a", "amy", "b4", { createdAt: 5 }), c("b", "amy", "b3", { createdAt: 9 })];
  assert.equal(defaultBoat("amy", { fleet, catches }), null);          // last used is retired
  assert.equal(defaultBoat("amy", { fleet, catches: catches.slice(0, 1) }), "b4");
  const now = 10 * 3600000;
  const outing = { trips: new Map([["t1", { id: "t1", at: now - 60000 }]]), rsvps: new Map([["t1", new Map([["amy", { answer: "in" }]])]]),
    tripBoats: new Map([["t1", new Map([["amy", { boatId: "b1" }]])]]), now };
  assert.equal(defaultBoat("amy", { fleet, catches, ...outing }), "b1");
});

test("motor text: horsepower and brand, either, or nothing", () => {
  assert.equal(motorText({ hp: 150, motor: "Mercury" }), "150 hp Mercury");
  assert.equal(motorText({ motor: "Yamaha" }), "Yamaha");
  assert.equal(motorText({ hp: 40 }), "40 hp");
  assert.equal(motorText({}), "");
  assert.ok(MOTOR_BRANDS.includes("Mercury") && MOTOR_BRANDS.at(-1) === "Other");
});

test("the Boats page: sort by fish, name, horsepower or newest; filter to your boats or a motor brand", () => {
  const rows = [
    { b: { id: "a", uid: "amy", name: "Lund", hp: 90, motor: "Yamaha", lengthFt: 17.5, createdAt: 1, crew: [] }, s: { fish: 3 } },
    { b: { id: "b", uid: "bo", name: "Crestliner", hp: 150, motor: "Mercury", createdAt: 3, crew: ["amy"] }, s: { fish: 3 } },
    { b: { id: "c", uid: "cy", name: "Alumacraft", lengthFt: 18, createdAt: 2, crew: [] }, s: { fish: 9 } },
  ];
  const ids = (f, me = "amy") => listBoats(rows.slice(), f, me).map(r => r.b.id).join("");
  assert.equal(ids({ sort: "fish" }), "cba");
  assert.equal(ids({ sort: "name" }), "cba");
  assert.equal(ids({ sort: "hp" }), "bac");
  assert.equal(ids({ sort: "length" }), "cab");
  assert.equal(ids({ sort: "new" }), "bca");
  assert.equal(ids({ sort: "name", whose: "mine" }), "ba");
  assert.equal(ids({ sort: "name", motor: "Mercury" }), "b");
  assert.equal(ids({ sort: "fish", whose: "mine", motor: "Honda" }), "");
});

test("boat specs: length, seats and capacity, whichever are set", () => {
  assert.equal(specText({ lengthFt: 17.5, seats: 4, capacityLb: 1200 }), "17.5 ft · 4 seats · 1,200 lb capacity");
  assert.equal(specText({ seats: 1 }), "1 seat");
  assert.equal(specText({}), "");
});
