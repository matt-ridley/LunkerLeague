/* Free plan use: what a full app open costs against Firebase's free (Spark) plan, from what this phone downloaded.
   Firestore charges a read for every document a listener sends. When the app has been closed for more than about 30
   minutes (most opens), every listener sends everything again; within 30 minutes it only sends what changed. So a
   "full open" is the worst case, and the usual one. Downloads are the documents' size; the full photos opened on a
   catch's page come on top. Pure functions. */

export const FREE_READS_DAY = 50000;           // Spark plan: document reads a day
export const FREE_DOWNLOAD_MONTH = 10 * 1024 ** 3; // Spark plan: 10 GiB downloaded a month
export const OPENS_EACH = 5;                   // a busy day: each active angler opens the app this many times
const DOC_OVERHEAD = 100;                      // the document's name and bookkeeping, roughly

/* What each listener holds, by its key in cloud.meta: the label shown. */
export const PART_NAMES = {
  catches: "Catches (with their small photos)", comments: "Comments", reactions: "Reactions", weather: "Weather",
  spotsShared: "Shared spots", spotsMine: "Your spots", tackleShared: "Shared tackle", tackleMine: "Your tackle",
  members: "Members", chat: "League chat (last 100)", derbies: "Derbies", entrants: "Derby entrants", trips: "Outings",
  rsvps: "Outing answers", boats: "Outing boats", noShows: "No-shows", skunks: "Skunks", tackleBox: "Tackle boxes",
  fleet: "Boats", goals: "Goals", challenges: "Head-to-heads", bets: "Bets", betPlayers: "Bet players",
  series: "Derby series", seasons: "Saved seasons", scoring: "Scoring settings", league: "League settings", me: "Your profile",
  invite: "Invite code",
};

/* The size of one listener's documents: { docs, bytes }. `docs` are the documents' data objects. */
export function measure(docs) {
  let bytes = 0;
  for (const d of docs) bytes += JSON.stringify(d).length + DOC_OVERHEAD;
  return { docs: docs.length, bytes };
}

/* A full open: { docs, bytes, parts: [{ key, label, docs, bytes }] } with the biggest parts first. parts: Map(key -> { docs, bytes }). */
export function openCost(parts) {
  const list = [...parts].map(([key, p]) => ({ key, label: PART_NAMES[key] || key, docs: p.docs, bytes: p.bytes }))
    .sort((a, b) => b.bytes - a.bytes || b.docs - a.docs);
  return { docs: list.reduce((n, p) => n + p.docs, 0), bytes: list.reduce((n, p) => n + p.bytes, 0), parts: list };
}

/* How far the free plan goes: { byReads, byDownloads (full opens a day each allows), opensPerDay (the smaller),
   limit ("reads" | "downloads"), busyDay (opens on a busy day), pct (a busy day's share of the limit), level }. */
export function freePlan({ docs, bytes }, { anglers = 1, opensEach = OPENS_EACH, days = 30 } = {}) {
  const byReads = docs ? Math.floor(FREE_READS_DAY / docs) : Infinity;
  const byDownloads = bytes ? Math.floor(FREE_DOWNLOAD_MONTH / days / bytes) : Infinity;
  const opensPerDay = Math.min(byReads, byDownloads);
  const busyDay = Math.max(1, anglers) * opensEach;
  const pct = isFinite(opensPerDay) ? (opensPerDay ? Math.round((busyDay / opensPerDay) * 100) : Infinity) : 0;
  return { byReads, byDownloads, opensPerDay, limit: byDownloads < byReads ? "downloads" : "reads", busyDay, pct,
    level: pct >= 100 ? "bad" : pct >= 60 ? "warn" : "ok" };
}
