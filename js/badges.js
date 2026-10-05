/* Badges: earned once and kept for good (unlike crowns). Each badge works out when an angler earned it, from the
   league's data, so the feed and the bell can date it and season points count it in the right season.
   Pure functions on plain data. */
import { fishIn, measured, better } from "./stats.js";
import { derbyStatus, closesAt, standings, derbyEntries } from "./derby.js";
import { newSpots } from "./crowns.js";
import { payouts, hasMoney } from "./payout.js";

const DAY = 24 * 3600 * 1000;
const lb = n => n * 16;

/* id, icon, name, how it's earned, and `at(ctx)`: when this angler earned it, or null. */
export const BADGES = [
  // The originals
  { id: "first", icon: "🐟", name: "First Fish", desc: "Log your first catch", at: x => nth(x.mine, 1) },
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
  { id: "recordSet", icon: "👑", name: "Record Setter", desc: "Hold your first league record", at: x => x.recordTakes[0] ?? null },
  { id: "recordBreak", icon: "🥷", name: "Record Breaker", desc: "Take a record from someone else", at: x => x.recordSteals[0] ?? null },
  { id: "untouchable", icon: "🏰", name: "Untouchable", desc: "Hold a league record for 30 days", at: x => heldFor(x.recordPeriods, 30 * DAY, x.now) },
  { id: "doubleRecord", icon: "💎", name: "Double Record", desc: "Hold the weight and length record for the same species", at: x => x.doubleRecordAt },
  // Stringers and limits
  { id: "limit1", icon: "🪝", name: "First Limit", desc: "Your first limit stringer", at: x => nth(x.limits, 1) },
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
  { id: "derby1", icon: "🏁", name: "First Derby", desc: "Finish your first derby", at: x => x.fished[0] ?? null },
  { id: "podium", icon: "🥉", name: "Podium", desc: "A top-3 derby finish", at: x => x.podiums[0] ?? null },
  { id: "hatTrick", icon: "🎩", name: "Hat Trick", desc: "3 derby wins", at: x => x.wins[2] ?? null },
  { id: "derby10", icon: "🚤", name: "Derby Regular", desc: "Fish 10 derbies", at: x => x.fished[9] ?? null },
  { id: "captain", icon: "⚓", name: "Winning Captain", desc: "Captain the boat of someone else's derby win", at: x => x.captainWins[0] ?? null },
  { id: "money", icon: "💵", name: "In the Money", desc: "Win money in a derby", at: x => x.moneyAt[0] ?? null },
  { id: "organiser", icon: "📋", name: "Organiser", desc: "Run a derby that finishes with 4 or more anglers", at: x => x.organised[0] ?? null },
  { id: "skunked", icon: "🦨", name: "Skunked", desc: "Finish a derby without a fish", at: x => x.skunks[0] ?? null },
  // Social
  { id: "trashTalker", icon: "🗣️", name: "Trash Talker", desc: "50 comments on other people's catches", at: x => nth(x.commentsGiven, 50) },
  { id: "hypeSquad", icon: "🙌", name: "Hype Squad", desc: "100 reactions given", at: x => nth(x.reactionsGiven, 100, r => r.n) },
  { id: "crowdFav", icon: "⭐", name: "Crowd Favourite", desc: "A catch with 10 or more reactions", at: x => x.crowdFavAt },
  { id: "tallTale", icon: "🤥", name: "Tall Tale", desc: "A catch with 5 or more 🤥 reactions", at: x => x.tallTaleAt },
  { id: "tripPlanner", icon: "🧭", name: "Trip Planner", desc: "Plan a trip that gets 4 or more \"In\"s", at: x => x.tripPlannerAt },
  { id: "alwaysIn", icon: "✅", name: "Always In", desc: "Answer \"In\" to 10 trips", at: x => nth(x.insGiven, 10) },
  // Crowns and places
  { id: "crownThief", icon: "🦹", name: "Crown Thief", desc: "Steal a crown from someone", at: x => x.crownSteals[0] ?? null },
  { id: "royalty", icon: "🫅", name: "Royalty", desc: "Hold 5 crowns at once (once 3 anglers are fishing)", at: x => x.royaltyAt },
  { id: "longReign", icon: "🕰️", name: "Long Reign", desc: "Hold a crown for 30 days (once 3 anglers are fishing)", at: x => heldFor(x.crownPeriods, 30 * DAY, x.now) },
  { id: "wanderer", icon: "📍", name: "Wanderer", desc: "Catches at 5 different spots shared with the league", at: x => nth(x.spots, 5) },
];
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
      const p = { species: c.species, field, uid: c.uid, from: c.caughtAt, to: null, stolen: !!cur };
      open.set(c.species, p); out.push(p);
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

/* Everything shared by all anglers, worked out once. */
function leagueContext(input) {
  const { catches, derbies, entrants = new Map(), comments = new Map(), reactions = new Map(), spots = new Map(),
    trips = new Map(), rsvps = new Map(), crowns = [], now = Date.now() } = input;
  const derbyMap = asMap(derbies);
  // Past catches (logbook) never earn badges; records here are of league catches only.
  const valid = catches.filter(c => !c.dq && !(c.derbyId && derbyMap.get(c.derbyId) && derbyMap.get(c.derbyId).testing))
    .sort((a, b) => a.caughtAt - b.caughtAt);
  const counted = valid.filter(c => !c.past);
  const byId = new Map(catches.map(c => [c.id, c]));
  const finished = [...derbyMap.values()].filter(d => !d.testing && derbyStatus(d, now) === "ended")
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
  // Crowns: holding periods and steals, from each crown's history.
  const crownPeriods = [], crownSteals = [];
  for (const s of crowns) {
    let open = null;
    for (const h of s.history) {
      if (open) open.to = h.at;
      open = h.uid ? { uid: h.uid, from: h.at, to: null } : null;
      if (open) crownPeriods.push(open);
      if (h.uid && h.from) crownSteals.push({ uid: h.uid, at: h.at });
    }
  }
  // Crowns only count for Royalty and Long Reign once 3 anglers have logged a catch: the first angler in a new league
  // claims a pile of crowns just by being first.
  const firsts = [...new Map([...counted].reverse().map(c => [c.uid, c.caughtAt]))].map(([, t]) => t).sort((a, b) => a - b);
  const contested = firsts.length >= 3 ? firsts[2] : Infinity;
  for (const p of crownPeriods) {
    p.from = Math.max(p.from, contested);
    if (p.to != null && p.to <= p.from) p.gone = true;
  }
  return { counted, valid, finished, reactionList, commentList, records: recordPeriods(counted), crownPeriods: crownPeriods.filter(p => !p.gone && p.from !== Infinity), crownSteals,
    spotsList: newSpots(counted, spots), trips, rsvps, now, catches };
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
      const entries = derbyEntries(d, L.catches, ent).filter(e => !e.problem);
      if (payouts(d, rows, ent, entries).payees.some(p => p.payee.uid === u && p.amount > 0)) moneyAt.push(at);
    }
  }
  // Personal bests beaten (not the first catch of a species). A past catch sets the bar to beat, but only a league
  // catch beating it counts.
  const pbBeats = [], pb = new Map();
  for (const c of L.valid.filter(c => c.uid === u)) {
    if (!measured(c)) continue;
    const cur = pb.get(c.species);
    if (cur && better(cur, c) === c && !c.past) pbBeats.push(c.caughtAt);
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
  return {
    mine, now: L.now, wins, podiums, fished, skunks, luckyNets, captainWins, organised, moneyAt, pbBeats,
    speciesAt: distinctAt(mine, c => c.species),
    limits: mine.filter(c => c.fishCount > 1 && c.limit),
    recordTakes: myRecords.map(p => p.from), recordSteals: myRecords.filter(p => p.stolen).map(p => p.from),
    recordPeriods: myRecords, doubleRecordAt,
    commentsGiven: L.commentList.filter(c => c.uid === u), reactionsGiven: L.reactionList.filter(r => r.uid === u),
    crowdFavAt: perCatch(r => r.n, 10), tallTaleAt: perCatch(r => (r.emojis.includes("🤥") ? 1 : 0), 5),
    tripPlannerAt, insGiven,
    crownSteals: L.crownSteals.filter(s => s.uid === u).map(s => s.at), crownPeriods: myCrowns, royaltyAt,
    spots: L.spotsList.filter(s => s.uid === u),
  };
}

/* Every badge every angler has earned: [{ uid, badge, at }], oldest first. */
export function badgeTimeline(input) {
  const L = leagueContext(input);
  const people = new Set([...L.counted.map(c => c.uid), ...L.finished.flatMap(f => [...f.ent.keys(), f.d.organiserUid]),
    ...L.commentList.map(c => c.uid), ...L.reactionList.map(r => r.uid), ...[...L.trips.values()].map(t => t.uid),
    ...[...L.rsvps.values()].flatMap(m => [...m.keys()]), ...L.crownPeriods.map(p => p.uid), ...L.crownSteals.map(s => s.uid)]);
  const out = [];
  for (const u of people) {
    if (!u) continue;
    const x = anglerContext(u, L);
    for (const badge of BADGES) {
      const at = badge.at(x);
      if (at != null && at <= L.now) out.push({ uid: u, badge, at });
    }
  }
  return out.sort((a, b) => a.at - b.at || BADGES.indexOf(a.badge) - BADGES.indexOf(b.badge));
}

/* The badges one angler has, in the order they were earned. */
export function badgesFor(uid, input) {
  return (input.badges || badgeTimeline(input)).filter(b => b.uid === uid).map(b => b.badge);
}
