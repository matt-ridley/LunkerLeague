/* The final whistle: when a season locks (it's over and the late-logging days have passed), the first admin's phone
   to open the app with fresh data saves it for good (seasons/{year}). Nobody has to remember to do it. */
import { store, isAdmin, uid, freshData, lockSeason } from "./cloud.js";
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
