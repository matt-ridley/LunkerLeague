// Unit tests for the archive: building it, reading it back and putting it together with live data. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveYear, yearStart, buildArchive, readArchive, combine, lateCatches } from "../js/archive.js";

const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();
const T = at(2027, 0, 20);
const c = (id, caughtAt, extra = {}) => ({ id, uid: "amy", species: "Walleye", caughtAt, createdAt: caughtAt, thumbAt: 1, ...extra });
const none = () => ({ catches: new Map(), weather: new Map(), tackle: new Map(), spots: new Map(), comments: new Map(), reactions: new Map(), gone: new Map() });

test("the first year not locked yet: last year until its late-logging days are over", () => {
  assert.equal(archiveYear(at(2027, 0, 5), 7), 2026);
  assert.equal(archiveYear(at(2027, 0, 9), 7), 2027);
  assert.equal(archiveYear(at(2026, 9, 10), 7), 2026);
  assert.equal(yearStart(2026), at(2026, 0, 1, 0));
});

test("building: older catches with their weather and shared tackle and spot only; comments and reactions made before it", () => {
  const old = c("a", at(2025, 5, 1), { tackleShared: true, locShared: false, pastStored: true, past: true });
  const preseason = c("b", at(2026, 5, 1), { tackleShared: false, locShared: true, past: false, pastStored: false, thumb: "x" });
  const live = c("n", at(2027, 0, 10));
  const parts = buildArchive({
    catches: [old, preseason, live], y0: 2027, at: T, by: "owner",
    weather: new Map([["a", { tempC: 5 }], ["n", { tempC: 9 }]]),
    tackle: new Map([["a", { lure: "Jig", shared: true }], ["b", { lure: "Secret", shared: false }]]),
    spots: new Map([["a", { lat: 1, shared: true }], ["b", { lat: 2, shared: true }]]),
    comments: new Map([["a", [{ id: "m1", uid: "bo", text: "Nice", at: T - 5 }, { id: "m2", uid: "bo", text: "Later", at: T + 5 }]],
      ["n", [{ id: "m3", uid: "cy", text: "Wow", at: T - 1 }]]]),
    reactions: new Map([["n", new Map([["bo", { emojis: ["🔥"], at: T - 1 }], ["cy", { emojis: ["😮"], at: T + 1 }]])]]),
  });
  assert.equal(parts.length, 1);
  assert.deepEqual([parts[0].set, parts[0].y0, parts[0].i, parts[0].of, parts[0].by], [T, 2027, 0, 1, "owner"]);
  const r = readArchive(parts);
  assert.equal(r.complete, true);
  assert.deepEqual([...r.catches.keys()], ["a", "b"]);
  // The saved past flag is kept as `past`; the app's own fields and moved-out small photos aren't.
  assert.deepEqual([r.catches.get("a").past, "pastStored" in r.catches.get("a"), r.catches.get("b").past, "thumb" in r.catches.get("b")], [true, false, undefined, false]);
  assert.deepEqual([...r.weather.keys()], ["a"]);
  assert.deepEqual([...r.tackle.keys()], ["a"]);            // b's tackle is secret
  assert.deepEqual([...r.spots.keys()], ["b"]);             // a's catch says its spot is private; b's is shared
  assert.deepEqual([...r.comments.get("a").map(m => m.id), ...r.comments.get("n").map(m => m.id)], ["m1", "m3"]);
  assert.deepEqual([...r.reactions.get("n").keys()], ["bo"]);
});

test("a shared spot goes in when its catch says so", () => {
  const b = c("b", at(2026, 5, 1), { locShared: true });
  const r = readArchive(buildArchive({ catches: [b], spots: new Map([["b", { lat: 2, shared: true }]]), y0: 2027, at: T }));
  assert.deepEqual([...r.spots.keys()], ["b"]);
});

test("big archives split into parts that each stay under the size limit, and read back only when all are there", () => {
  const catches = Array.from({ length: 60 }, (_, i) => c(`c${i}`, at(2025, 1, 1) + i, { notes: "x".repeat(200) }));
  const parts = buildArchive({ catches, y0: 2027, at: T, partChars: 3000 });
  assert.ok(parts.length > 4);
  for (const p of parts) assert.ok(p.items.length <= 3000, p.items.length);
  assert.ok(parts.every(p => p.of === parts.length));
  assert.equal(readArchive(parts).catches.size, 60);
  assert.equal(readArchive(parts.slice(1)).complete, false);
});

test("combine: live wins, tombstones remove what was archived before them, secret-since tackle and spots drop out", () => {
  const arch = readArchive(buildArchive({
    catches: [c("a", at(2025, 1, 1), { notes: "old", tackleShared: true, locShared: true }), c("b", at(2025, 1, 2)), c("k", at(2025, 1, 3))],
    tackle: new Map([["a", { lure: "Jig", shared: true }]]), spots: new Map([["a", { lat: 1, shared: true }]]),
    weather: new Map([["a", { tempC: 1 }]]),
    comments: new Map([["a", [{ id: "m1", uid: "bo", at: T - 9 }, { id: "m2", uid: "cy", at: T - 8 }]]]),
    reactions: new Map([["a", new Map([["bo", { emojis: ["🔥"], at: T - 9 }], ["cy", { emojis: ["😮"], at: T - 9 }]])]]),
    y0: 2027, at: T,
  }));
  const live = none();
  live.catches.set("a", c("a", at(2025, 1, 1), { notes: "edited", tackleShared: false, locShared: true, editedAt: T + 1 }));
  live.catches.set("n", c("n", at(2027, 0, 25)));
  live.weather.set("n", { tempC: 3 });
  live.comments.set("a", [{ id: "m2", uid: "cy", at: T - 8 }, { id: "m3", uid: "di", at: T + 2 }]); // m2 again (the margin)
  live.reactions.set("a", new Map([["cy", { emojis: ["👏"], at: T + 3 }]]));
  live.gone.set("b", { kind: "catch", at: T + 1 });
  live.gone.set("m1", { kind: "comment", cid: "a", at: T + 1 });
  live.gone.set("a_bo", { kind: "reaction", cid: "a", who: "bo", at: T + 1 });
  const out = combine(arch, live);
  assert.deepEqual([...out.catches.keys()].sort(), ["a", "k", "n"]);
  assert.equal(out.catches.get("a").notes, "edited");
  assert.deepEqual([...out.tackle.keys()], []);             // made secret since
  assert.deepEqual([...out.spots.keys()], ["a"]);
  assert.deepEqual([...out.weather.keys()].sort(), ["a", "n"]);
  assert.deepEqual(out.comments.get("a").map(m => m.id), ["m2", "m3"]);
  assert.deepEqual([...out.reactions.get("a")].map(([u, r]) => [u, r.emojis[0]]), [["cy", "👏"]]);
});

test("a reaction put back after its tombstone counts again", () => {
  const arch = readArchive(buildArchive({ catches: [], reactions: new Map([["a", new Map([["bo", { emojis: ["🔥"], at: T - 9 }]])]]), y0: 2027, at: T }));
  const live = none();
  live.gone.set("a_bo", { kind: "reaction", cid: "a", who: "bo", at: T + 1 });
  live.reactions.set("a", new Map([["bo", { emojis: ["😂"], at: T + 2 }]]));
  assert.deepEqual(combine(arch, live).reactions.get("a").get("bo").emojis, ["😂"]);
});

test("late catches: live ones caught before the archive's first year and saved after it was built", () => {
  const live = new Map([["a", c("a", at(2026, 3, 1), { editedAt: T + 5 })], ["m", c("m", at(2026, 3, 2), { editedAt: T - 5 })],
    ["n", c("n", at(2027, 0, 25), { editedAt: T + 5 })]]);
  assert.equal(lateCatches(live, 2027, T), 1); // m only loads live because of the margin before the build
});
