/* Best-bite times (solunar): fish feed most when the moon is overhead or underfoot (major periods, about 2 hours) and
   when it rises or sets (minor periods, about 1 hour). Worked out on the phone for the league's home water, so it
   works with no signal. Pure functions; times are epoch ms, days are the phone's local days.
   Sun and moon positions use the usual low-precision formulas (good to a few minutes, plenty for fishing). */
import { moonPhase } from "./weather.js";

const RAD = Math.PI / 180, DAY = 86400000, MIN = 60000;
const J1970 = 2440588, J2000 = 2451545;
const OBLIQUITY = 23.4397 * RAD;
const toDays = ms => ms / DAY - 0.5 + J1970 - J2000;
const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
const siderealTime = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;

function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b) };
}
function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { ra: rightAscension(L, 0), dec: declination(L, 0) };
}
/* Altitude (radians) and hour angle (-π..π, 0 = due south/overhead) of a body at a time and place. */
function position(coords, ms, lat, lng) {
  const d = toDays(ms), c = coords(d), phi = RAD * lat;
  let H = siderealTime(d, RAD * -lng) - c.ra;
  H = Math.atan2(Math.sin(H), Math.cos(H));
  const alt = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H));
  return { alt, H };
}
export const moonPosition = (ms, lat, lng) => position(moonCoords, ms, lat, lng);
export const sunPosition = (ms, lat, lng) => position(sunCoords, ms, lat, lng);

const STEP = 5 * MIN;
const MOON_H0 = 0.133 * RAD, SUN_H0 = -0.833 * RAD; // the horizon, allowing for refraction and the disc's size

/* Rise/set (altitude crossing h0) and, for the moon, overhead/underfoot (hour angle crossing 0 / ±π) during a local day.
   { rise, set, over, under } in ms, or null when it doesn't happen that day. */
function events(pos, h0, dayStart, lat, lng) {
  const out = { rise: null, set: null, over: null, under: null };
  let prev = pos(dayStart, lat, lng);
  for (let t = dayStart + STEP; t <= dayStart + DAY; t += STEP) {
    const p = pos(t, lat, lng);
    const at = (a, b) => t - STEP + STEP * (a / (a - b)); // straight-line between the two samples
    if (prev.alt < h0 && p.alt >= h0 && out.rise == null) out.rise = at(prev.alt - h0, p.alt - h0);
    if (prev.alt >= h0 && p.alt < h0 && out.set == null) out.set = at(prev.alt - h0, p.alt - h0);
    if (prev.H < 0 && p.H >= 0 && p.H - prev.H < Math.PI && out.over == null) out.over = at(prev.H, p.H);
    if (prev.H > 0 && p.H < 0 && prev.H - p.H > Math.PI && out.under == null) out.under = at(prev.H - Math.PI, p.H + Math.PI);
    prev = p;
  }
  for (const k of Object.keys(out)) if (out[k] != null && out[k] >= dayStart + DAY) out[k] = null;
  return out;
}

export const startOfDay = ms => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

/* The best-bite times for the local day containing `ms`, at { lat, lng }.
   { day, sunrise, sunset, moonrise, moonset, periods: [{ kind: "major" | "minor", why, start, end, peak }] by time,
     moon: { name, emoji, lit }, rating: 1-4, ratingText } */
export function biteTimes(ms, { lat, lng }) {
  const day = startOfDay(ms);
  const sun = events(sunPosition, SUN_H0, day, lat, lng);
  const moon = events(moonPosition, MOON_H0, day, lat, lng);
  const periods = [];
  const add = (kind, why, peak, half) => { if (peak != null) periods.push({ kind, why, peak, start: peak - half, end: peak + half }); };
  add("major", "Moon overhead", moon.over, 60 * MIN);
  add("major", "Moon underfoot", moon.under, 60 * MIN);
  add("minor", "Moonrise", moon.rise, 30 * MIN);
  add("minor", "Moonset", moon.set, 30 * MIN);
  periods.sort((a, b) => a.peak - b.peak);
  const m = moonPhase(day + DAY / 2);
  return { day, sunrise: sun.rise, sunset: sun.set, moonrise: moon.rise, moonset: moon.set, periods,
    moon: { name: m.name, emoji: m.emoji, lit: m.lit }, ...rate(m.age, periods, sun) };
}

/* How good the day is, 1 to 4: best near the new and full moon, plus one when a period lines up with sunrise or sunset
   (within an hour), the classic best bite. */
const SYNODIC = 29.530588853;
export const RATINGS = ["", "Fair", "Good", "Great", "Excellent"];
export function rate(age, periods, sun) {
  const fromNewOrFull = Math.min(age, Math.abs(age - SYNODIC / 2), SYNODIC - age);
  let rating = fromNewOrFull <= 1.5 ? 3 : fromNewOrFull <= 3.5 ? 2 : 1;
  const twilight = [sun.rise, sun.set].filter(t => t != null);
  if (periods.some(p => twilight.some(t => t >= p.start - 60 * MIN && t <= p.end + 60 * MIN))) rating += 1;
  rating = Math.min(4, rating);
  return { rating, ratingText: RATINGS[rating] };
}

/* What's on now or next: { period, now: true } during one, { period, now: false } for the next one today, else null. */
export function nextPeriod(bite, now = Date.now()) {
  const on = bite.periods.find(p => now >= p.start && now <= p.end);
  if (on) return { period: on, now: true };
  const next = bite.periods.find(p => p.start > now);
  return next ? { period: next, now: false } : null;
}
