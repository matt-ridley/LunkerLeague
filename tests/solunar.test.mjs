// Unit tests for best-bite (solunar) times. Run with: npm test
// Times are checked in Toronto's time zone, so the test gives the same answer on any computer.
process.env.TZ = "America/Toronto";
import { test } from "node:test";
import assert from "node:assert/strict";
const { biteTimes, nextPeriod, rate, startOfDay } = await import("../js/solunar.js");

const SIMCOE = { lat: 44.4, lng: -79.4 };
const hm = t => new Date(t).toTimeString().slice(0, 5);
const near = (t, want, tol = 4) => {
  const [h, m] = want.split(":").map(Number), d = new Date(t);
  assert.ok(Math.abs(d.getHours() * 60 + d.getMinutes() - (h * 60 + m)) <= tol, `${hm(t)} not within ${tol} min of ${want}`);
};

test("sun and moon times for a day at Lake Simcoe (checked against the suncalc library)", () => {
  const b = biteTimes(new Date(2026, 9, 8, 15).getTime(), SIMCOE);
  assert.equal(b.day, new Date(2026, 9, 8).getTime());
  near(b.sunrise, "07:22"); near(b.sunset, "18:45");
  near(b.moonrise, "05:11"); near(b.moonset, "17:51");
  near(b.periods.find(p => p.why === "Moon overhead").peak, "11:39");
  assert.equal(b.moon.name, "Waning crescent");
});

test("major periods are 2 hours, minor ones 1 hour, in time order", () => {
  const b = biteTimes(new Date(2026, 5, 21).getTime(), SIMCOE);
  assert.ok(b.periods.length >= 3);
  for (const p of b.periods) assert.equal(p.end - p.start, (p.kind === "major" ? 120 : 60) * 60000);
  for (let i = 1; i < b.periods.length; i++) assert.ok(b.periods[i].peak >= b.periods[i - 1].peak);
  assert.ok(b.periods.every(p => p.peak >= b.day && p.peak < b.day + 86400000));
});

test("days are rated by the moon, plus one when a period lines up with sunrise or sunset", () => {
  const sun = { rise: 7 * 3600000, set: 19 * 3600000 };
  const far = [{ start: 12 * 3600000, end: 13 * 3600000 }], dawn = [{ start: 7.5 * 3600000, end: 8.5 * 3600000 }];
  assert.equal(rate(0.5, far, sun).rating, 3);    // new moon
  assert.equal(rate(14.9, far, sun).rating, 3);   // full moon
  assert.equal(rate(29.2, far, sun).rating, 3);   // just before the new moon
  assert.equal(rate(12, far, sun).rating, 2);
  assert.equal(rate(7.4, far, sun).rating, 1);    // first quarter
  assert.equal(rate(7.4, dawn, sun).rating, 2);
  assert.deepEqual(rate(0.5, dawn, sun), { rating: 4, ratingText: "Excellent" });
});

test("what's on now, or next today", () => {
  const b = biteTimes(new Date(2026, 9, 8).getTime(), SIMCOE);
  const first = b.periods[0];
  assert.deepEqual(nextPeriod(b, first.start - 60000), { period: first, now: false });
  assert.deepEqual(nextPeriod(b, first.peak), { period: first, now: true });
  assert.equal(nextPeriod(b, b.day + 86400000 - 1000), null);
});

test("far north, where the moon may not rise or set, still works", () => {
  for (let d = 0; d < 30; d++) {
    const b = biteTimes(new Date(2026, 11, 1 + d).getTime(), { lat: 78.2, lng: 15.6 });
    assert.ok(Array.isArray(b.periods));
    assert.ok(b.rating >= 1 && b.rating <= 4);
  }
  assert.equal(startOfDay(new Date(2026, 9, 8, 23, 59).getTime()), new Date(2026, 9, 8).getTime());
});
