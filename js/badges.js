/* Badges. Most are season badges: earned within one season (the calendar year) and earned again every season,
   so each one can be had once a year. A few are career badges (`career: true`): firsts, things you own, and
   lifetime milestones, earned once and kept for good. Each badge works out when an angler earned it, from the
   league's data, so the feed and the bell can date it and season points count it in the right season.
   Pure functions on plain data. */
import { fishIn, measured, better } from "./stats.js";
import { derbyStatus, closesAt, standings } from "./derby.js";
import { newSpots } from "./crowns.js";
import { derbyMoney, hasMoney } from "./payout.js";
import { h2hResults, involves, otherSide } from "./h2h.js";
import { showRecord, boatTrips } from "./noshows.js";
import { FIRST_SEASON } from "./config.js";
import { captainAt, captaincies } from "./fleet.js";

const DAY = 24 * 3600 * 1000;
const lb = n => n * 16;

/* id, icon, name, how it's earned, and `at(ctx)`: when this angler earned it, or null. `noPoints`: a badge of shame,
   worth no points. `career`: earned once and kept for good (the rest are season badges). */
const yearOf = ms => new Date(ms).getFullYear();
export const BADGES = [
  // The originals
  { id: "first", icon: "🐟", name: "First Fish", desc: "Log your first catch", career: true, at: x => nth(x.mine, 1) },
  { id: "ten", icon: "🌈", name: "10 Species", desc: "Catch 10 different species", at: x => x.speciesAt[9] ?? null },
  { id: "champ", icon: "🏆", name: "Derby Champ", desc: "Win a derby", at: x => x.wins[0] ?? null },
  { id: "release", icon: "🔄", name: "Catch & Release Hero", desc: "Release 10 fish", at: x => nth(x.mine.filter(c => c.released), 10) },
  { id: "owl", icon: "🦉", name: "Night Owl", desc: "Catch a fish between 9 PM and 4 AM", at: x => nth(x.mine.filter(c => hour(c) >= 21 || hour(c) < 4), 1) },
  { id: "net", icon: "🥅", name: "Lucky Net", desc: "Net the fish that won someone else a derby", at: x => x.luckyNets[0] ?? null },
  // Catch totals
  { id: "fish10", icon: "🎣", name: "Ten Fish", desc: "10 fish caught", at: x => nth(x.mine, 10, fishIn) },
  { id: "fish50", icon: "🪣", name: "Fifty Fish", desc: "50 fish caught", at: x => nth(x.mine, 50, fishIn) },
  { id: "fish100", icon: "💯", name: "Century", desc: "100 fish caught", at: x => nth(x.mine, 100, fishIn) },
  { id: "fish500", icon: "🏭", name: "500 Club", desc: "500 fish caught", at: x => nth(x.mine, 500, fishIn) },
  { id: "bigDay", icon: "🔟", name: "Double-Digit Day", desc: "10 or more fish in one day", at: x => firstInGroup(x.mine, dayOf, list => nth(list, 10, fishIn)) },
  // Species
  { id: "species5", icon: "🖐️", name: "Five Species", desc: "5 different species", at: x => x.speciesAt[4] ?? null },
  { id: "species20", icon: "🗺️", name: "Twenty Species", desc: "20 different species", at: x => x.speciesAt[19] ?? null },
  { id: "grandSlam", icon: "🎰", name: "Grand Slam", desc: "4 different species in one day", at: x => firstInGroup(x.mine, dayOf, list => distinctAt(list, c => c.species)[3] ?? null) },
  { id: "trophyCase", icon: "🗄️", name: "Trophy Case", desc: "A personal best in 10 species", at: x => distinctAt(x.mine.filter(measured), c => c.species)[9] ?? null },
  // Size
  { id: "lb5", icon: "⚖️", name: "Five Pounder", desc: "A fish of 5 lb or more", at: x => nth(x.mine.filter(c => measured(c) && c.weightOz >= lb(5)), 1) },
  { id: "lb10", icon: "🐋", name: "Ten Pounder", desc: "A fish of 10 lb or more", at: x => nth(x.mine.filter(c => measured(c) && c.weightOz >= lb(10)), 1) },
  { id: "lb20", icon: "🦈", name: "Twenty Pounder", desc: "A fish of 20 lb or more", at: x => nth(x.mine.filter(c => measured(c) && c.weightOz >= lb(20)), 1) },
  { id: "in20", icon: "📏", name: "Twenty-Incher", desc: "A fish of 20 inches or more", at: x => nth(x.mine.filter(c => measured(c) && c.lengthIn >= 20), 1) },
  { id: "in36", icon: "🪵", name: "Yardstick", desc: "A fish of 36 inches or more", at: x => nth(x.mine.filter(c => measured(c) && c.lengthIn >= 36), 1) },
  { id: "tiny", icon: "🐣", name: "Tiny Terror", desc: "A measured fish under 4 inches", at: x => nth(x.mine.filter(c => measured(c) && c.lengthIn > 0 && c.lengthIn < 4), 1) },
  { id: "pbMachine", icon: "📈", name: "PB Machine", desc: "Beat your own personal best 5 times", at: x => x.pbBeats[4] ?? null },
  // Records
  { id: "recordSet", icon: "👑", name: "Record Setter", desc: "Hold a season record", at: x => x.recordTakes[0] ?? null },
  { id: "recordBreak", icon: "🥷", name: "Record Breaker", desc: "Take a season record from someone else", at: x => x.recordSteals[0] ?? null },
  { id: "untouchable", icon: "🏰", name: "Untouchable", desc: "Hold a season record for 30 days", at: x => heldFor(x.recordPeriods, 30 * DAY, x.now) },
  { id: "doubleRecord", icon: "💎", name: "Double Record", desc: "Hold the season weight and length record for the same species", at: x => x.doubleRecordAt },
  // Stringers and limits
  { id: "limit1", icon: "🪝", name: "First Limit", desc: "Your first limit stringer", career: true, at: x => nth(x.limits, 1) },
  { id: "limit10", icon: "🔁", name: "Limit Machine", desc: "10 limits", at: x => nth(x.limits, 10) },
  { id: "backToBack", icon: "📆", name: "Back-to-Back", desc: "Limits on two days in a row", at: x => streakAt(x.limits, 2) },
  { id: "fullStringer", icon: "🐟", name: "Full Stringer", desc: "A stringer of 50 or more fish", at: x => nth(x.mine.filter(c => c.fishCount >= 50), 1) },
  // Time and season
  { id: "sunrise", icon: "🌄", name: "Sunrise Strike", desc: "A fish between 4 and 6 AM", at: x => nth(x.mine.filter(c => hour(c) >= 4 && hour(c) < 6), 1) },
  { id: "lunch", icon: "🥪", name: "Lunch Break", desc: "A fish between noon and 1 PM", at: x => nth(x.mine.filter(c => hour(c) === 12), 1) },
  { id: "hardWater", icon: "🧊", name: "Hard Water", desc: "A fish in December, January, February or March", at: x => nth(x.mine.filter(c => [11, 0, 1, 2].includes(month(c))), 1) },
  { id: "newYear", icon: "🎆", name: "New Year's Fish", desc: "A fish on January 1", at: x => nth(x.mine.filter(c => month(c) === 0 && new Date(c.caughtAt).getDate() === 1), 1) },
  { id: "seasons", icon: "🍂", name: "Four Seasons", desc: "A fish in every season", at: x => distinctAt(x.mine, c => Math.floor(((month(c) + 1) % 12) / 3))[3] ?? null },
  { id: "months", icon: "📅", name: "Every Month", desc: "A fish in all 12 months", at: x => distinctAt(x.mine, month)[11] ?? null },
  { id: "streak3", icon: "🔥", name: "Hot Streak", desc: "Fished 3 days in a row", at: x => streakAt(x.mine, 3) },
  { id: "streak7", icon: "🗓️", name: "Week-Long Bender", desc: "Fished 7 days in a row", at: x => streakAt(x.mine, 7) },
  // Derbies
  { id: "derby1", icon: "🏁", name: "First Derby", desc: "Finish your first derby", career: true, at: x => x.fished[0] ?? null },
  { id: "podium", icon: "🥉", name: "Podium", desc: "A top-3 derby finish", at: x => x.podiums[0] ?? null },
  { id: "hatTrick", icon: "🎩", name: "Hat Trick", desc: "3 derby wins", at: x => x.wins[2] ?? null },
  { id: "derby10", icon: "🚤", name: "Derby Regular", desc: "Fish 10 derbies", at: x => x.fished[9] ?? null },
  { id: "captain", icon: "⚓", name: "Winning Captain", desc: "Captain the boat of someone else's derby win", at: x => x.captainWins[0] ?? null },
  { id: "money", icon: "💵", name: "In the Money", desc: "Win money in a derby", at: x => x.moneyAt[0] ?? null },
  { id: "organiser", icon: "📋", name: "Organiser", desc: "Run a derby that finishes with 4 or more anglers", at: x => x.organised[0] ?? null },
  { id: "skunked", icon: "🦨", name: "Skunked", desc: "Finish a derby without a fish", at: x => x.skunks[0] ?? null },
  // Head-to-head
  { id: "duelist", icon: "⚔️", name: "Duelist", desc: "Finish your first head-to-head challenge", career: true, at: x => x.h2h[0] ? x.h2h[0].at : null },
  { id: "gunslinger", icon: "🤠", name: "Gunslinger", desc: "Win a head-to-head challenge", at: x => x.h2hWins[0] ?? null },
  { id: "sharpshooter", icon: "🎯", name: "Sharpshooter", desc: "Win 5 head-to-head challenges", at: x => x.h2hWins[4] ?? null },
  { id: "onARoll", icon: "🎳", name: "On a Roll", desc: "Win 3 head-to-head challenges in a row", at: x => x.h2hStreak3 },
  { id: "shutout", icon: "🧹", name: "Shutout", desc: "Win a head-to-head challenge where the other angler didn't log a fish", at: x => x.h2hShutouts[0] ?? null },
  { id: "highRoller", icon: "🎲", name: "High Roller", desc: "Win 10 or more staked points in one head-to-head challenge", at: x => x.h2hHighRoll[0] ?? null },
  { id: "rivalry", icon: "🥊", name: "Rivalry", desc: "Finish 5 head-to-head challenges against the same angler", at: x => x.h2hRivalAt },
  // Social
  { id: "trashTalker", icon: "🗣️", name: "Trash Talker", desc: "50 comments on other people's catches", at: x => nth(x.commentsGiven, 50) },
  { id: "hypeSquad", icon: "🙌", name: "Hype Squad", desc: "100 reactions given", at: x => nth(x.reactionsGiven, 100, r => r.n) },
  { id: "crowdFav", icon: "⭐", name: "Crowd Favourite", desc: "A catch with 10 or more reactions", at: x => x.crowdFavAt },
  { id: "tripPlanner", icon: "🧭", name: "Outing Planner", desc: "Plan an outing that gets 4 or more \"In\"s", at: x => x.tripPlannerAt },
  { id: "alwaysIn", icon: "✅", name: "Always In", desc: "Answer \"In\" to 10 outings", at: x => nth(x.insGiven, 10) },
  // Crowns and places
  { id: "crownThief", icon: "🦹", name: "Crown Thief", desc: "Steal a crown from someone", at: x => x.crownSteals[0] ?? null },
  { id: "royalty", icon: "🫅", name: "Royalty", desc: "Hold 5 crowns at once (once 3 anglers are fishing)", at: x => x.royaltyAt },
  { id: "longReign", icon: "🕰️", name: "Long Reign", desc: "Hold a crown for 30 days (once 3 anglers are fishing)", at: x => heldFor(x.crownPeriods, 30 * DAY, x.now) },
  { id: "wanderer", icon: "📍", name: "Wanderer", desc: "Catches at 5 different spots shared with the league", at: x => nth(x.spots, 5) },
  // Turning up (or not)
  { id: "present5", icon: "✋", name: "Present!", desc: "Show up to 5 outings you said you were In for", at: x => x.shows[4] ?? null },
  { id: "reliable10", icon: "🛟", name: "Old Reliable", desc: "Show up to 10 outings you said you were In for", at: x => x.shows[9] ?? null },
  { id: "solid15", icon: "🪨", name: "Rock Solid", desc: "Show up to 15 outings you said you were In for", at: x => x.shows[14] ?? null },
  { id: "noShow1", icon: "🫥", name: "No Show", desc: "Marked a no-show for an outing. Worth no points", noPoints: true, at: x => x.noShows[0] ?? null },
  { id: "noShow3", icon: "⛅", name: "Fair-Weather Fisherman", desc: "Marked a no-show 3 times. Worth no points", noPoints: true, at: x => x.noShows[2] ?? null },
  { id: "noShow5", icon: "🏴‍☠️", name: "Walked the Plank", desc: "Marked a no-show 5 times. Worth no points", noPoints: true, at: x => x.noShows[4] ?? null },
  // Boats
  { id: "skipper", icon: "🧑‍✈️", name: "Skipper", desc: "Captain your first boat: save one, or take one over", career: true, at: x => x.myFleet[0] ? x.myFleet[0].from : null },
  { id: "admiral", icon: "🎖️", name: "Admiral", desc: "Captain 3 saved boats", career: true, at: x => x.myFleet[2] ? x.myFleet[2].from : null },
  { id: "christening", icon: "🍾", name: "Christening", desc: "Catch the first fish ever logged from a boat", career: true, at: x => x.christenings[0] ?? null },
  { id: "waterTaxi", icon: "🚕", name: "Water Taxi", desc: "Give 10 seats on your boats to anglers who showed up for outings", at: x => nth(x.ridesGiven, 10) },
  { id: "hitchhiker", icon: "🎒", name: "Hitchhiker", desc: "Ride in 5 different anglers' boats on outings", at: x => x.hitchhikerAt },
  { id: "fullHouse", icon: "🎟️", name: "Full House", desc: "Bring a boat on an outing with every seat taken and everyone there", at: x => x.fullHouses[0] ?? null },
  { id: "luckyHull", icon: "🛥️", name: "Lucky Hull", desc: "50 fish caught from one of your boats while you're its captain, by everyone aboard", at: x => x.luckyHullAt },
  { id: "recordDeck", icon: "🛳️", name: "Record Deck", desc: "A season record caught from your boat while you're its captain", at: x => x.recordDecks[0] ?? null },
  { id: "littleBoat", icon: "🛶", name: "Little Boat, Big Fish", desc: "Catch a season record from a boat 14 ft or shorter", at: x => x.littleBoats[0] ?? null },
  { id: "bigIron", icon: "🐎", name: "Big Iron", desc: "Captain a boat with 200 hp or more", career: true, at: x => x.bigIronAt },
  { id: "shorePounder", icon: "🏖️", name: "Shore Pounder", desc: "25 catches logged with no boat", at: x => nth(x.mine.filter(c => !c.boatId), 25) },
  // Career: the long haul (official seasons; the 2026 Preseason doesn't count toward these), and the founders
  { id: "bonnet", icon: "👒", name: "Bless Your Bonnet", desc: "Founding member: joined the league in the 2026 Preseason. Nobody can earn this one again", career: true,
    at: x => (x.joinedAt && yearOf(x.joinedAt) < FIRST_SEASON ? x.joinedAt : null) },
  { id: "veteran", icon: "🎗️", name: "Veteran", desc: "Fish 3 official seasons (a catch in each)", career: true, at: x => x.seasonsAt[2] ?? null },
  { id: "lifer", icon: "🧓", name: "Lifer", desc: "Fish 10 official seasons (a catch in each)", career: true, at: x => x.seasonsAt[9] ?? null },
  { id: "thousand", icon: "🏔️", name: "Thousand Club", desc: "1,000 fish over your career", career: true, at: x => nth(x.mine, 1000, fishIn) },
  // Career: champions of official seasons, once the season is locked and saved
  { id: "champion", icon: "🏆", name: "Champion", desc: "Win an official season", career: true, at: x => (x.titles[0] ? x.titles[0].at : null) },
  { id: "repeat", icon: "✌️", name: "Repeat Champion", desc: "Win two official seasons in a row", career: true, at: x => runOf(x.titles, 2) },
  { id: "dynasty", icon: "🏯", name: "Dynasty", desc: "Win three official seasons in a row", career: true, at: x => runOf(x.titles, 3) },
];
export const CAREER_BADGES = BADGES.filter(b => b.career);
export const SEASON_BADGES = BADGES.filter(b => !b.career);
export const badgeById = id => BADGES.find(b => b.id === id);

/* ---------- Helpers (lists are sorted by time; items have `at` or `caughtAt`) ---------- */
const when = c => (c.caughtAt ?? c.at);
const hour = c => new Date(c.caughtAt).getHours();
const month = c => new Date(c.caughtAt).getMonth();
const dayOf = c => { const d = new Date(when(c)); return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY); };
/* When the running total (by `weight`) first reaches n. */
function nth(list, n, weight = () => 1) {
  let sum = 0;
  for (const x of list) { sum += weight(x); if (sum >= n) return when(x); }
  return null;
}
/* Times at which each new distinct key first appeared: [at of 1st, at of 2nd, …]. */
function distinctAt(list, key) {
  const seen = new Set(), out = [];
  for (const x of list) { const k = key(x); if (!seen.has(k)) { seen.add(k); out.push(when(x)); } }
  return out;
}
/* Earliest result of `fn` over groups (e.g. days), or null. */
function firstInGroup(list, key, fn) {
  const groups = new Map();
  for (const x of list) { const k = key(x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  let best = null;
  for (const g of groups.values()) { const t = fn(g); if (t != null && (best == null || t < best)) best = t; }
  return best;
}
/* When `len` days in a row was first reached (time of the first catch on the day that completed it). */
function streakAt(list, len) {
  const first = new Map();
  for (const x of list) { const d = dayOf(x); if (!first.has(d)) first.set(d, when(x)); }
  const days = [...first.keys()].sort((a, b) => a - b);
  let run = 0, prev = null;
  for (const d of days) {
    run = prev !== null && d === prev + 1 ? run + 1 : 1;
    prev = d;
    if (run >= len) return first.get(d);
  }
  return null;
}
/* Seasons won ([{ year, at }], oldest first): when `len` in a row was first reached. */
function runOf(titles, len) {
  let run = 0, prev = null;
  for (const t of titles) {
    run = prev !== null && t.year === prev + 1 ? run + 1 : 1;
    prev = t.year;
    if (run >= len) return t.at;
  }
  return null;
}
/* Periods [{ from, to }] (to = null while still held): when one of them first lasted `ms`. */
function heldFor(periods, ms, now) {
  let best = null;
  for (const p of periods) {
    const end = p.to ?? now;
    if (end - p.from >= ms && (best == null || p.from + ms < best)) best = p.from + ms;
  }
  return best;
}

/* ---------- Working out the data each badge needs ---------- */
const asMap = x => (x instanceof Map ? x : new Map((x || []).map(d => [d.id, d])));

/* Who held each species record (weight and length) and when, from the catches: [{ species, field, uid, from, to }]. */
function recordPeriods(counted) {
  const out = [];
  for (const field of ["weightOz", "lengthIn"]) {
    const best = new Map(), open = new Map();
    for (const c of counted) {
      if (!measured(c) || !(c[field] > 0)) continue;
      const cur = best.get(c.species);
      if (cur && c[field] <= cur[field]) continue;
      best.set(c.species, c);
      if (cur && cur.uid === c.uid) continue;
      const prev = open.get(c.species);
      if (prev) prev.to = c.caughtAt;
      const p = { species: c.species, field, uid: c.uid, from: c.caughtAt, to: null, stolen: !!cur, boatId: c.boatId || null };
      open.set(c.species, p); out.push(p);
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

/* Everything shared by all anglers, worked out once. */
function leagueContext(input) {
  const { catches, derbies, entrants = new Map(), comments = new Map(), reactions = new Map(), spots = new Map(),
    trips = new Map(), rsvps = new Map(), crowns = [], challenges = new Map(), leagueStart = 0, now = Date.now(),
    fleet = new Map(), noShows = new Map(), tripBoats = new Map() } = input;
  // `rsvps` leave out the no-shows (who was there); `allRsvps` are everyone's answers, for seats and the no-show record.
  const allRsvps = input.allRsvps || rsvps;
  const derbyMap = asMap(derbies);
  // Past catches (logbook) never earn badges; records here are of league catches only.
  const valid = catches.filter(c => !c.dq && !(c.derbyId && derbyMap.get(c.derbyId) && derbyMap.get(c.derbyId).testing))
    .sort((a, b) => a.caughtAt - b.caughtAt);
  const counted = valid.filter(c => !c.past);
  const byId = new Map(catches.map(c => [c.id, c]));
  const finished = [...derbyMap.values()].filter(d => !d.testing && derbyStatus(d, now) === "ended" && d.end >= leagueStart) // pre-season derbies don't count
    .map(d => {
      const ent = entrants.get(d.id) || new Map();
      return { d, ent, at: closesAt(d), rows: standings(d, catches, ent) };
    }).sort((a, b) => a.at - b.at);
  // Reactions on other people's catches, each person's latest (timed when they last changed it).
  const reactionList = [];
  for (const [cid, byUser] of reactions) {
    const c = byId.get(cid);
    if (!c) continue;
    for (const [u, r] of byUser) if (u !== c.uid) reactionList.push({ cid, owner: c.uid, uid: u, emojis: r.emojis, at: r.at || 0, n: r.emojis.length });
  }
  reactionList.sort((a, b) => a.at - b.at);
  const commentList = [];
  for (const [cid, list] of comments) {
    const c = byId.get(cid);
    if (c) for (const cm of list) if (cm.uid !== c.uid) commentList.push({ uid: cm.uid, at: cm.at || 0 });
  }
  commentList.sort((a, b) => a.at - b.at);
  const crownsAll = crownPeriodsFrom(input.crownHistory || crowns, counted);
  const fleetMap = asMap(fleet);
  return { counted, valid, finished, reactionList, commentList, records: recordPeriods(counted), crownPeriods: crownsAll.periods, crownSteals: crownsAll.steals,
    spots, spotsList: newSpots(counted, spots), trips, rsvps, allRsvps, noShows, now, catches, h2h: h2hResults([...asMap(challenges).values()], catches, now),
    fleet: fleetMap, ...boatCounts(counted, fleetMap), boatTrips: boatTrips({ trips, rsvps: allRsvps, tripBoats, noShows, now }),
    joins: input.joins || new Map(), seasonDocs: input.seasonDocs || new Map() };
}

/* Crowns: holding periods and steals, from each crown's history (a season's last holder stops holding it when the
   season ends). Crowns only count for Royalty and Long Reign once 3 anglers have logged a catch: the first angler in
   a new league (or season) claims a pile of crowns just by being first. */
function crownPeriodsFrom(crowns, counted) {
  const periods = [], steals = [];
  for (const s of crowns) {
    let open = null;
    for (const h of s.history) {
      if (open) open.to = h.at;
      open = h.uid ? { uid: h.uid, from: h.at, to: null } : null;
      if (open) periods.push(open);
      if (h.uid && h.from) steals.push({ uid: h.uid, at: h.at });
    }
  }
  const firsts = [...new Map([...counted].reverse().map(c => [c.uid, c.caughtAt]))].map(([, t]) => t).sort((a, b) => a - b);
  const contested = firsts.length >= 3 ? firsts[2] : Infinity;
  for (const p of periods) {
    p.from = Math.max(p.from, contested);
    if (p.to != null && p.to <= p.from) p.gone = true;
  }
  return { periods: periods.filter(p => !p.gone && p.from !== Infinity), steals };
}

/* Boats: the first fish from each saved boat, and each boat's running fish count under each captain
   (keyed "boatId|captain uid": a boat that changes hands starts counting again for its new captain). */
function boatCounts(counted, fleetMap) {
  const firstFrom = new Map(), boatFish = new Map();
  for (const c of counted) {
    if (!c.boatId || !fleetMap.has(c.boatId)) continue;
    if (!firstFrom.has(c.boatId)) firstFrom.set(c.boatId, c);
    const key = `${c.boatId}|${captainAt(fleetMap.get(c.boatId), c.caughtAt)}`;
    const n = (boatFish.get(key) || { n: 0, at50: null });
    n.n += fishIn(c);
    if (n.n >= 50 && n.at50 == null) n.at50 = c.caughtAt;
    boatFish.set(key, n);
  }
  return { firstFrom, boatFish };
}

/* The league's data for one season: everything that happened between January 1 and December 31 of `year`, with
   that season's records and crowns. Season badges are worked out from this, so they start again every year.
   (Christening and the personal-best bar still look back through every season.) */
function seasonContext(L, input, year) {
  const from = new Date(year, 0, 1).getTime(), to = new Date(year, 11, 31, 23, 59, 59, 999).getTime(), inY = t => t >= from && t <= to;
  const counted = L.counted.filter(c => inY(c.caughtAt));
  const crowns = crownPeriodsFrom((input.crownHistory || input.crowns || []).filter(s => s.year == null || s.year === year), counted);
  return { ...L, from, to, now: Math.min(L.now, to), counted, finished: L.finished.filter(f => inY(f.at)),
    reactionList: L.reactionList.filter(r => inY(r.at)), commentList: L.commentList.filter(c => inY(c.at)),
    records: recordPeriods(counted), crownPeriods: crowns.periods, crownSteals: crowns.steals, spotsList: newSpots(counted, L.spots),
    trips: new Map([...L.trips].filter(([, t]) => inY(t.at || 0))), h2h: L.h2h.filter(r => inY(r.at)),
    boatFish: boatCounts(counted, L.fleet).boatFish, boatTrips: L.boatTrips.filter(b => inY(b.at)) };
}

/* Per-angler data for the badge rules. */
function anglerContext(u, L) {
  const mine = L.counted.filter(c => c.uid === u);
  const wins = [], podiums = [], fished = [], skunks = [], luckyNets = [], captainWins = [], organised = [], moneyAt = [];
  for (const { d, ent, at, rows } of L.finished) {
    const i = rows.findIndex(r => r.uid === u);
    if (ent.has(u)) { fished.push(at); if (i < 0) skunks.push(at); }
    if (i === 0) wins.push(at);
    if (i >= 0 && i < 3) podiums.push(at);
    const top = rows[0];
    if (top && top.uid !== u) {
      if (top.fish.some(f => f.netman && f.netman.uid === u)) luckyNets.push(at);
      if (top.fish.some(f => f.captain && f.captain.uid === u)) captainWins.push(at);
    }
    if (d.organiserUid === u && ent.size >= 4) organised.push(at);
    if (hasMoney(d) && rows.length) {
      if (derbyMoney(d, L.catches, ent).payees.some(p => p.payee.uid === u && p.amount > 0)) moneyAt.push(at);
    }
  }
  // Personal bests beaten (not the first catch of a species). A past catch sets the bar to beat, but only a league
  // catch beating it counts.
  const pbBeats = [], pb = new Map();
  for (const c of L.valid.filter(c => c.uid === u)) {
    if (!measured(c)) continue;
    const cur = pb.get(c.species);
    if (cur && better(cur, c) === c && !c.past && (L.from == null || (c.caughtAt >= L.from && c.caughtAt <= L.to))) pbBeats.push(c.caughtAt);
    if (!cur || better(cur, c) === c) pb.set(c.species, c);
  }
  // Records: taken, stolen, held, and both records of one species at the same time.
  const myRecords = L.records.filter(p => p.uid === u);
  let doubleRecordAt = null;
  for (const p of myRecords) {
    const other = myRecords.find(q => q.species === p.species && q.field !== p.field);
    if (!other) continue;
    const from = Math.max(p.from, other.from), to = Math.min(p.to ?? Infinity, other.to ?? Infinity);
    if (from < to && (doubleRecordAt == null || from < doubleRecordAt)) doubleRecordAt = from;
  }
  // Social: reactions on my catches (per catch), what I gave.
  const onMine = L.reactionList.filter(r => r.owner === u);
  const perCatch = (pred, n) => {
    let best = null;
    const byCatch = new Map();
    for (const r of onMine) {
      const add = pred(r);
      if (!add) continue;
      const t = (byCatch.get(r.cid) || 0) + add;
      byCatch.set(r.cid, t);
      if (t >= n && (best == null || r.at < best)) best = r.at;
    }
    return best;
  };
  // Trips: my trips with 4 "In"s from others, and my own "In"s.
  let tripPlannerAt = null;
  const insGiven = [];
  for (const t of L.trips.values()) {
    const ans = [...(L.rsvps.get(t.id) || new Map())];
    if (t.uid === u) {
      const ins = ans.filter(([who, r]) => who !== u && r.answer === "in").map(([, r]) => r.at || 0).sort((a, b) => a - b);
      if (ins.length >= 4 && (tripPlannerAt == null || ins[3] < tripPlannerAt)) tripPlannerAt = ins[3];
    }
    const mineAns = ans.find(([who]) => who === u);
    if (mineAns && mineAns[1].answer === "in") insGiven.push({ at: mineAns[1].at || 0 });
  }
  insGiven.sort((a, b) => a.at - b.at);
  // Royalty: 5 crowns at once.
  let royaltyAt = null;
  const myCrowns = L.crownPeriods.filter(p => p.uid === u);
  for (const p of myCrowns) {
    const held = myCrowns.filter(q => q.from <= p.from && (q.to ?? Infinity) > p.from).length;
    if (held >= 5 && (royaltyAt == null || p.from < royaltyAt)) royaltyAt = p.from;
  }
  // Head-to-head: finished challenges (oldest first), wins, streaks, shutouts, big stakes and rivals.
  const h2h = L.h2h.filter(r => involves(r.ch, u)), h2hWins = [], h2hShutouts = [], h2hHighRoll = [];
  let run = 0, h2hStreak3 = null, h2hRivalAt = null;
  const perRival = new Map();
  for (const r of h2h) {
    const won = !r.tie && r.winner === u;
    run = won ? run + 1 : 0;
    if (run === 3 && h2hStreak3 == null) h2hStreak3 = r.at;
    if (won) {
      h2hWins.push(r.at);
      if (!r.sides.find(s => s.uid !== u).fished) h2hShutouts.push(r.at);
      if ((r.ch.terms.stake || 0) >= 10) h2hHighRoll.push(r.at);
    }
    const opp = otherSide(r.ch, u), n = (perRival.get(opp) || 0) + 1;
    perRival.set(opp, n);
    if (n === 5 && h2hRivalAt == null) h2hRivalAt = r.at;
  }
  // Turning up, and boats.
  const { shows, noShows } = showRecord(u, { trips: L.trips, rsvps: L.allRsvps, noShows: L.noShows, now: L.now });
  // Boats you've captained (saved or taken over), each once, by when you first took the helm.
  const myFleet = [...new Map(captaincies(u, L.fleet).reverse().map(s => [s.b.id, s])).values()].sort((a, b) => a.from - b.from);
  const christenings = [...L.firstFrom.values()].filter(c => c.uid === u).map(c => c.caughtAt).sort((a, b) => a - b);
  const ridesGiven = L.boatTrips.filter(b => b.owner === u).flatMap(b => b.riders.map(() => ({ at: b.at })));
  const fullHouses = L.boatTrips.filter(b => b.owner === u && b.full).map(b => b.at);
  const rodeWith = distinctAt(L.boatTrips.filter(b => b.riders.includes(u)), b => b.owner);
  const hulls = myFleet.map(s => (L.boatFish.get(`${s.b.id}|${u}`) || {}).at50).filter(t => t != null).sort((a, b) => a - b);
  const recordDecks = L.records.filter(p => p.boatId && L.fleet.has(p.boatId) && captainAt(L.fleet.get(p.boatId), p.from) === u).map(p => p.from);
  const littleBoats = L.records.filter(p => p.uid === u && p.boatId && L.fleet.has(p.boatId) && L.fleet.get(p.boatId).lengthFt > 0
    && L.fleet.get(p.boatId).lengthFt <= 14).map(p => p.from);
  const big = myFleet.filter(s => s.b.hp >= 200);
  return {
    shows, noShows, myFleet, christenings, ridesGiven, fullHouses, hitchhikerAt: rodeWith[4] ?? null, luckyHullAt: hulls[0] ?? null,
    recordDecks, littleBoats, bigIronAt: big.length ? big[0].from : null,
    mine, now: L.now, wins, h2h, h2hWins, h2hShutouts, h2hHighRoll, h2hStreak3, h2hRivalAt, podiums, fished, skunks, luckyNets, captainWins, organised, moneyAt, pbBeats,
    speciesAt: distinctAt(mine, c => c.species),
    seasonsAt: distinctAt(mine.filter(c => yearOf(c.caughtAt) >= FIRST_SEASON), c => yearOf(c.caughtAt)),
    joinedAt: L.joins.get(u) || null,
    // Official seasons won, from the saved seasons (dated when each was locked).
    titles: [...L.seasonDocs.values()].filter(d => d.champion === u && d.year >= FIRST_SEASON)
      .map(d => ({ year: d.year, at: d.lockedAt || new Date(d.year + 1, 0, 1).getTime() })).sort((a, b) => a.year - b.year),
    limits: mine.filter(c => c.fishCount > 1 && c.limit),
    recordTakes: myRecords.map(p => p.from), recordSteals: myRecords.filter(p => p.stolen).map(p => p.from),
    recordPeriods: myRecords, doubleRecordAt,
    commentsGiven: L.commentList.filter(c => c.uid === u), reactionsGiven: L.reactionList.filter(r => r.uid === u),
    crowdFavAt: perCatch(r => r.n, 10),
    tripPlannerAt, insGiven,
    crownSteals: L.crownSteals.filter(s => s.uid === u).map(s => s.at), crownPeriods: myCrowns, royaltyAt,
    spots: L.spotsList.filter(s => s.uid === u),
  };
}

/* Every badge every angler has earned: [{ uid, badge, at, season? }], oldest first. A season badge has one entry
   for each season it was earned in (`season` is the year); a career badge has one entry and no `season`. */
export function badgeTimeline(input) {
  const L = leagueContext(input);
  const people = new Set([...L.counted.map(c => c.uid), ...L.finished.flatMap(f => [...f.ent.keys(), f.d.organiserUid]),
    ...L.commentList.map(c => c.uid), ...L.reactionList.map(r => r.uid), ...[...L.trips.values()].map(t => t.uid),
    ...[...L.allRsvps.values()].flatMap(m => [...m.keys()]), ...[...L.fleet.values()].flatMap(b => (b.captains || [b]).map(c => c.uid)), ...L.crownPeriods.map(p => p.uid), ...L.crownSteals.map(s => s.uid), ...L.h2h.flatMap(r => [r.ch.from, r.ch.to]),
    ...L.joins.keys(), ...[...L.seasonDocs.values()].map(d => d.champion)]);
  for (const bad of [undefined, null, ""]) people.delete(bad);
  const out = [];
  for (const u of people) {
    const x = anglerContext(u, L);
    for (const badge of CAREER_BADGES) {
      const at = badge.at(x);
      if (at != null && at <= L.now) out.push({ uid: u, badge, at });
    }
  }
  // Season badges, season by season: from the first year anything happened to this one.
  const times = [...L.counted.map(c => c.caughtAt), ...L.finished.map(f => f.at), ...L.h2h.map(r => r.at), ...L.reactionList.map(r => r.at),
    ...L.commentList.map(c => c.at), ...[...L.trips.values()].map(t => t.at || 0)].filter(t => t > 0);
  const thisYear = yearOf(L.now);
  const first = times.length ? Math.min(thisYear, yearOf(times.reduce((a, b) => Math.min(a, b)))) : thisYear;
  for (let y = first; y <= thisYear; y++) {
    const S = seasonContext(L, input, y);
    for (const u of people) {
      const x = anglerContext(u, S);
      for (const badge of SEASON_BADGES) {
        const at = badge.at(x);
        if (at != null && at >= S.from && at <= S.now) out.push({ uid: u, badge, at, season: y });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at || BADGES.indexOf(a.badge) - BADGES.indexOf(b.badge));
}

/* The badges one angler has in a season (default: this one), career badges included, in the order they were earned. */
export function badgesFor(uid, input, year = yearOf(input.now ?? Date.now())) {
  return (input.badges || badgeTimeline(input)).filter(b => b.uid === uid && (b.season == null || b.season === year)).map(b => b.badge);
}

/* The seasons an angler earned each badge in: Map(badgeId -> { at (latest), years: [year…] }) (career badges: years []). */
export function badgeYears(uid, timeline) {
  const out = new Map();
  for (const b of timeline) {
    if (b.uid !== uid) continue;
    const e = out.get(b.badge.id) || { at: 0, years: [] };
    e.at = Math.max(e.at, b.at);
    if (b.season != null) e.years.push(b.season);
    out.set(b.badge.id, e);
  }
  return out;
}
