/* Weather and moon on each catch. The weather comes from Open-Meteo (free, no account or key): the hour of the catch at
   its spot (rounded to about 1 km before it's sent), or at the league's home water when the catch has no spot. It's
   filled in by the angler's own phone once it has signal, and saved as weather/{catch id} (metric; shown in °F, mph and
   inHg). The moon is worked out on the phone, so it needs nothing saved. */

/* ---------- Pure ---------- */
const DAY = 86400000;
/* Open-Meteo's forecast service covers about the last 3 months; the archive covers everything older (back to 1940). */
export const RECENT_DAYS = 80;

/* Two decimals: about 1 km. */
export const roundLoc = ({ lat, lng }) => ({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 });

const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
export const HOURLY = "temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover,weather_code";

export function weatherUrl(loc, caughtAt, now = Date.now()) {
  const { lat, lng } = roundLoc(loc), day = isoDay(caughtAt);
  const host = now - caughtAt < RECENT_DAYS * DAY ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive";
  return `${host}?latitude=${lat}&longitude=${lng}&start_date=${day}&end_date=${day}&hourly=${HOURLY}&timezone=GMT`;
}

const num = (v, digits = 1) => (typeof v === "number" && isFinite(v) ? Math.round(v * 10 ** digits) / 10 ** digits : null);

/* The hour nearest the catch, from Open-Meteo's answer (times in GMT), as the doc to save (without uid/src). */
export function pickHour(json, caughtAt) {
  const h = json && json.hourly;
  if (!h || !Array.isArray(h.time)) return null;
  const want = new Date(Math.round(caughtAt / 3600000) * 3600000).toISOString().slice(0, 13) + ":00";
  let i = h.time.indexOf(want);
  if (i < 0) i = new Date(caughtAt).getUTCHours(); // rounded into the next day: the day's last hour is close enough
  if (i >= h.time.length) i = h.time.length - 1;
  const tempC = num(h.temperature_2m?.[i]);
  if (tempC == null) return null;
  const code = h.weather_code?.[i];
  return {
    forAt: caughtAt, tempC,
    windKph: num(h.wind_speed_10m?.[i]), windDir: num(h.wind_direction_10m?.[i], 0), gustKph: num(h.wind_gusts_10m?.[i]),
    pressureHpa: num(h.pressure_msl?.[i]), cloud: num(h.cloud_cover?.[i], 0),
    code: Number.isInteger(code) ? code : null,
  };
}

/* WMO weather codes, as Open-Meteo sends them. */
const SKY = [
  [[0], "☀️", "Clear"], [[1], "🌤️", "Mainly clear"], [[2], "⛅", "Partly cloudy"], [[3], "☁️", "Overcast"],
  [[45, 48], "🌫️", "Fog"], [[51, 53, 55], "🌦️", "Drizzle"], [[56, 57], "🌧️", "Freezing drizzle"],
  [[61, 63, 65], "🌧️", "Rain"], [[66, 67], "🌧️", "Freezing rain"], [[71, 73, 75, 77], "🌨️", "Snow"],
  [[80, 81, 82], "🌦️", "Showers"], [[85, 86], "🌨️", "Snow showers"], [[95, 96, 99], "⛈️", "Thunderstorm"],
];
export function sky(code) {
  const s = SKY.find(([codes]) => codes.includes(code));
  return s ? { emoji: s[1], text: s[2] } : null;
}
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const compass = deg => (deg == null ? "" : COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]);
export const toF = c => Math.round(c * 9 / 5 + 32);
export const toMph = kph => Math.round(kph / 1.609344);
export const toInHg = hpa => (Math.round(hpa * 0.0295299830714 * 100) / 100).toFixed(2);

/* "⛅ Partly cloudy · 72°F · wind 9 mph SW, gusts 15 · 30.02 inHg" */
export function weatherText(w) {
  if (!w || w.tempC == null) return "";
  const s = sky(w.code);
  const wind = w.windKph == null ? "" : w.windKph < 1 ? "calm"
    : `wind ${toMph(w.windKph)} mph ${compass(w.windDir)}${w.gustKph > w.windKph + 8 ? `, gusts ${toMph(w.gustKph)}` : ""}`.trim();
  return [s ? `${s.emoji} ${s.text}` : "", `${toF(w.tempC)}°F`, wind, w.pressureHpa ? `${toInHg(w.pressureHpa)} inHg` : ""].filter(Boolean).join(" · ");
}

/* The moon: days since the new moon, how much is lit (0-100) and the phase's name. A known new moon and the average
   month are close enough for this (within about half a day). */
const SYNODIC = 29.530588853;
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
const PHASES = [
  [1.84566, "🌑", "New moon"], [5.53699, "🌒", "Waxing crescent"], [9.22831, "🌓", "First quarter"],
  [12.91963, "🌔", "Waxing gibbous"], [16.61096, "🌕", "Full moon"], [20.30228, "🌖", "Waning gibbous"],
  [23.99361, "🌗", "Last quarter"], [27.68493, "🌘", "Waning crescent"], [Infinity, "🌑", "New moon"],
];
export function moonPhase(ms) {
  const age = ((((ms - NEW_MOON) / DAY) % SYNODIC) + SYNODIC) % SYNODIC;
  const lit = Math.round(((1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2) * 100);
  const [, emoji, name] = PHASES.find(([upTo]) => age < upTo);
  return { age: Math.round(age * 10) / 10, lit, emoji, name };
}
export const moonText = ms => { const m = moonPhase(ms); return `${m.emoji} ${m.name} (${m.lit}% lit)`; };

/* Where to get a catch's weather: its spot (this phone has it: it's the angler's own), or the league's home water. */
export function weatherSpot(c, spots, league) {
  const s = c.hasSpot && spots.get(c.id);
  if (s && typeof s.lat === "number") return { lat: s.lat, lng: s.lng, src: "spot" };
  const h = league && league.home;
  if (h && typeof h.lat === "number") return { lat: h.lat, lng: h.lng, src: "home" };
  return null;
}

/* The catches to fill in: this angler's, confirmed by the server, with somewhere to look, and no weather yet (or weather
   for a different time, after the catch time was edited). Newest first. */
export function needsWeather(catches, { me, weather, spots, league, pending = new Set(), now = Date.now() }) {
  return catches
    .filter(c => c.uid === me && !pending.has(c.id) && c.caughtAt <= now && weatherSpot(c, spots, league))
    .filter(c => { const w = weather.get(c.id); return !w || Math.abs((w.forAt || 0) - c.caughtAt) > 30 * 60000; })
    .sort((a, b) => b.caughtAt - a.caughtAt);
}

/* ---------- Filling it in (browser) ---------- */
const MAX_PER_RUN = 20;
const tried = new Map(); // catch id -> when a lookup last failed this session (not retried for an hour)
let running = false, timer = null;

export async function fillWeather(cloudMod) {
  const { store, uid, saveWeather, cloud } = cloudMod;
  // Wait for everything it looks at, so a catch's spot isn't missed (and the home water used instead).
  if (running || !navigator.onLine || !uid() || !store.catchesLoaded || !store.league
    || !cloud.meta.weather || !cloud.meta.spotsMine || !cloud.meta.spotsShared) return;
  running = true;
  try {
    const list = needsWeather([...store.catches.values()], {
      me: uid(), weather: store.weather, spots: store.spots, league: store.league, pending: store.pending,
    }).filter(c => !(Date.now() - (tried.get(c.id) || 0) < 3600000)).slice(0, MAX_PER_RUN);
    for (const c of list) {
      tried.set(c.id, Date.now());
      const where = weatherSpot(c, store.spots, store.league);
      try {
        const res = await fetch(weatherUrl(where, c.caughtAt));
        if (!res.ok) continue;
        const w = pickHour(await res.json(), c.caughtAt);
        if (w && store.catches.has(c.id)) { saveWeather(c.id, { ...w, src: where.src }); tried.delete(c.id); }
      } catch { tried.delete(c.id); break; } // lost signal: try again when it's back
      await new Promise(r => setTimeout(r, 300));
    }
  } finally { running = false; }
}

/* Runs a few seconds after the data settles, and when signal comes back. */
export function startWeather(cloudMod) {
  const later = () => { clearTimeout(timer); timer = setTimeout(() => fillWeather(cloudMod), 4000); };
  cloudMod.subscribe(later);
  addEventListener("online", later);
}
