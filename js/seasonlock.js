/* The final whistle: when a season locks (it's over and the late-logging days have passed), the first admin's phone
   to open the app with fresh data saves it for good (seasons/{year}). Nobody has to remember to do it. */
import { store, cloud, isAdmin, uid, freshData, lockSeason, archiveInfo, archiveLate, saveArchive } from "./cloud.js";
import { archiveYear } from "./archive.js";
import { rankInput } from "./leaders.js";
import { seasonYears, seasonState } from "./season.js";
import { seasonSnapshot } from "./awards.js";

const tried = new Set();
export function checkSeasonLocks(now = Date.now()) {
  if (!store.catchesLoaded || !isAdmin() || !navigator.onLine || !freshData()) return;
  const grace = (store.league && store.league.graceDays) ?? 7;
  for (const year of seasonYears([...store.catches.values()], now)) {
    if (store.seasons.has(year) || tried.has(year) || seasonState(year, now, grace) !== "locked") continue;
    tried.add(year);
    lockSeason(year, seasonSnapshot({ ...rankInput(), fleet: store.fleet, tackle: store.tackle }, year, { now, by: uid() }));
  }
}

/* The archive keeps up by itself once the league owner has built it: when another season locks (its catches move into
   the archive), or when many catches have been saved for archived years since it was built (new logbook catches), the
   first admin's phone online with fresh data builds it again. Once per app session. */
export const LATE_LIMIT = 200;
let archiveTried = false;
export function checkArchive(now = Date.now()) {
  const arc = archiveInfo();
  if (archiveTried || !arc || !store.catchesLoaded || !isAdmin() || !navigator.onLine || !freshData()
    || !cloud.meta.archive || cloud.meta.archive.fromCache) return;
  const grace = (store.league && store.league.graceDays) ?? 7;
  if (archiveYear(now, grace) <= arc.y0 && archiveLate() < LATE_LIMIT) return;
  archiveTried = true;
  saveArchive().catch(e => console.warn("Archive not saved", e));
}
