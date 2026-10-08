/* System info: what the fish icon's colour means, and fun facts about the league for the System info page (#/system).
   Pure functions on plain objects. */
import { fishIn, isStringer } from "./stats.js";

const DAY = 86400000;
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* The fish icon's state, in words: { title, text }. `kind` comes from syncStatus(). */
export const STATUS_TEXT = {
  live: { title: "Connected", text: "Everything on this phone matches the league." },
  busy: { title: "Syncing", text: "Your changes are on their way to the league." },
  offline: { title: "Offline (on the water)", text: "No signal. You can keep logging; changes send when signal comes back." },
  bad: { title: "Sync problem", text: "The league refused a change or the connection keeps failing. It retries on its own." },
  off: { title: "Not signed in", text: "" },
};
export const statusText = kind => STATUS_TEXT[kind] || STATUS_TEXT.off;

/* Midnight at the start of `t`'s day, and of its week (weeks start Monday). */
const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const weekStart = t => { const d = new Date(dayStart(t)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };

/* catches: [catch]; derbies: [derby]; trips: [trip]; members: count; league: config/league doc.
   League numbers count league catches only (not past/logbook ones), except `logbook`. */
export function leagueFacts({ catches = [], derbies = [], trips = [], members = 0, league = null, now = Date.now() }) {
  const live = catches.filter(c => !c.past);
  const species = new Map(), weekdays = Array(7).fill(0);
  let fish = 0, weightOz = 0, weighed = 0, today = 0, week = 0, first = null;
  const t0 = dayStart(now), w0 = weekStart(now);
  for (const c of live) {
    const n = fishIn(c);
    fish += n;
    species.set(c.species, (species.get(c.species) || 0) + n);
    weekdays[new Date(c.caughtAt).getDay()] += n;
    if (!isStringer(c) && c.weightOz > 0) { weightOz += c.weightOz; weighed++; }
    if (c.caughtAt >= t0 && c.caughtAt <= now) today += n;
    if (c.caughtAt >= w0 && c.caughtAt <= now) week += n;
    if (!first || c.caughtAt < first.caughtAt) first = c;
  }
  const top = [...species].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
  const busiest = fish ? weekdays.indexOf(Math.max(...weekdays)) : -1;
  const created = league && league.createdAt;
  return {
    ageDays: created ? Math.max(0, Math.floor((now - created) / DAY)) : null,
    members,
    catches: live.length,
    logbook: catches.length - live.length,
    fish,
    species: species.size,
    weightOz, weighed,
    derbies: derbies.filter(d => !d.cancelled && !d.testing && d.start <= now).length,
    outings: trips.filter(t => t.at <= now).length,
    today, week,
    topSpecies: top && { name: top[0], fish: top[1] },
    busiestDay: busiest >= 0 ? WEEKDAY[busiest] : null,
    firstCatch: first,
  };
}
