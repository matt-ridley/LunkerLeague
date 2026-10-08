// Unit tests for weather and moon on catches. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { roundLoc, weatherUrl, pickHour, sky, compass, toF, toMph, toInHg, weatherText, moonPhase, weatherSpot, needsWeather } from "../js/weather.js";

const DAY = 86400000;

test("the location is rounded to about 1 km before it's sent", () => {
  assert.deepEqual(roundLoc({ lat: 44.123456, lng: -79.987654 }), { lat: 44.12, lng: -79.99 });
  const url = weatherUrl({ lat: 44.123456, lng: -79.987654 }, Date.UTC(2026, 8, 1, 14), Date.UTC(2026, 9, 8));
  assert.ok(url.includes("latitude=44.12&longitude=-79.99"));
  assert.ok(!url.includes("44.1234"));
});

test("recent catches use the forecast service, older ones the archive, for the catch's day in GMT", () => {
  const now = Date.UTC(2026, 9, 8);
  const recent = weatherUrl({ lat: 1, lng: 2 }, Date.UTC(2026, 8, 1, 23, 30), now);
  assert.ok(recent.startsWith("https://api.open-meteo.com/v1/forecast?"));
  assert.ok(recent.includes("start_date=2026-09-01&end_date=2026-09-01"));
  assert.ok(recent.includes("timezone=GMT"));
  assert.ok(weatherUrl({ lat: 1, lng: 2 }, Date.UTC(2019, 5, 1), now).startsWith("https://archive-api.open-meteo.com/v1/archive?"));
});

const day = (date, fill) => ({ hourly: {
  time: Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, "0")}:00`),
  temperature_2m: Array.from({ length: 24 }, (_, h) => (fill !== undefined ? fill : 10 + h)),
  wind_speed_10m: Array(24).fill(14.5), wind_direction_10m: Array(24).fill(225), wind_gusts_10m: Array(24).fill(30),
  pressure_msl: Array(24).fill(1016.8), cloud_cover: Array(24).fill(40), weather_code: Array(24).fill(2),
} });

test("the hour nearest the catch is picked", () => {
  const w = pickHour(day("2026-09-01"), Date.UTC(2026, 8, 1, 14, 20));
  assert.deepEqual(w, { forAt: Date.UTC(2026, 8, 1, 14, 20), tempC: 24, windKph: 14.5, windDir: 225, gustKph: 30, pressureHpa: 1016.8, cloud: 40, code: 2 });
  assert.equal(pickHour(day("2026-09-01"), Date.UTC(2026, 8, 1, 14, 40)).tempC, 25);
  assert.equal(pickHour(day("2026-09-01"), Date.UTC(2026, 8, 1, 23, 50)).tempC, 33); // rounds into tomorrow: last hour
  assert.equal(pickHour(day("2026-09-01", null), Date.UTC(2026, 8, 1, 14)), null);   // no data (yet)
  assert.equal(pickHour({ error: true }, 0), null);
});

test("weather reads in °F, mph and inHg", () => {
  assert.equal(toF(0), 32); assert.equal(toF(22.2), 72);
  assert.equal(toMph(16.1), 10);
  assert.equal(toInHg(1016.8), "30.03");
  assert.equal(compass(225), "SW"); assert.equal(compass(359), "N"); assert.equal(compass(null), "");
  assert.deepEqual(sky(2), { emoji: "⛅", text: "Partly cloudy" });
  assert.equal(sky(42), null);
  const w = pickHour(day("2026-09-01"), Date.UTC(2026, 8, 1, 12));
  assert.equal(weatherText(w), "⛅ Partly cloudy · 72°F · wind 9 mph SW, gusts 19 · 30.03 inHg");
  assert.equal(weatherText({ ...w, windKph: 0.4, gustKph: 2 }), "⛅ Partly cloudy · 72°F · calm · 30.03 inHg");
  assert.equal(weatherText({ ...w, gustKph: 16 }), "⛅ Partly cloudy · 72°F · wind 9 mph SW · 30.03 inHg"); // gusts barely above: left off
  assert.equal(weatherText(null), "");
});

test("moon phases line up with known new and full moons", () => {
  const full = moonPhase(Date.UTC(2024, 0, 25, 17, 54));      // full moon, 2024-Jan-25
  assert.equal(full.name, "Full moon"); assert.ok(full.lit >= 99);
  const nu = moonPhase(Date.UTC(2025, 0, 29, 12, 36));        // new moon, 2025-Jan-29
  assert.equal(nu.name, "New moon"); assert.ok(nu.lit <= 1);
  assert.equal(moonPhase(Date.UTC(2025, 1, 5, 8, 2)).name, "First quarter"); // 2025-Feb-05
  assert.equal(moonPhase(Date.UTC(2025, 1, 20, 17, 33)).name, "Last quarter"); // 2025-Feb-20
  assert.equal(moonPhase(Date.UTC(1999, 0, 1)).name.length > 0, true); // before the reference date works too
});

test("weather is looked up at the catch's spot, else the league's home water, else not at all", () => {
  const spots = new Map([["c1", { lat: 44.5, lng: -79.4 }]]);
  const league = { home: { lat: 45, lng: -80, name: "Lake X" } };
  assert.deepEqual(weatherSpot({ id: "c1", hasSpot: true }, spots, league), { lat: 44.5, lng: -79.4, src: "spot" });
  assert.deepEqual(weatherSpot({ id: "c2", hasSpot: false }, spots, league), { lat: 45, lng: -80, src: "home" });
  assert.deepEqual(weatherSpot({ id: "c3", hasSpot: true }, spots, league), { lat: 45, lng: -80, src: "home" }); // someone else's private spot
  assert.equal(weatherSpot({ id: "c2", hasSpot: false }, spots, {}), null);
});

test("only your own confirmed catches without weather (or with weather for another time) are filled in, newest first", () => {
  const now = Date.UTC(2026, 9, 8);
  const catches = [
    { id: "a", uid: "me", caughtAt: now - 3 * DAY },
    { id: "b", uid: "me", caughtAt: now - DAY },
    { id: "c", uid: "you", caughtAt: now - DAY },
    { id: "d", uid: "me", caughtAt: now - 2 * DAY },
    { id: "e", uid: "me", caughtAt: now - 4 * DAY },
    { id: "f", uid: "me", caughtAt: now - 5 * DAY },
  ];
  const weather = new Map([["d", { forAt: now - 2 * DAY }], ["e", { forAt: now - 4 * DAY - 3 * 3600000 }]]);
  const out = needsWeather(catches, { me: "me", weather, spots: new Map(), league: { home: { lat: 1, lng: 2 } }, pending: new Set(["f"]), now });
  assert.deepEqual(out.map(c => c.id), ["b", "a", "e"]);
  assert.equal(needsWeather(catches, { me: "me", weather, spots: new Map(), league: {}, now }).length, 0); // nowhere to look
});
