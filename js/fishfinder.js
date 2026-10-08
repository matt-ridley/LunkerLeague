/* Fish Finder: the cards at the top of the feed, worked out from the data every time (nothing is stored).
   fishFinderCards(input, me) -> [{ kind, label, title, detail, href }], most relevant first. A card with nothing to
   say is left out (no derby card when nothing is on). Pure functions on plain data.
   `input` is the ranking input (catches, derbies, entrants, versions, members, crowns, badges, trips, rsvps)
   plus `name(uid)`; `now` and `seasonStart` can be passed for tests. */
import { fishIn, measured, isStringer, speciesBoard, leagueCatches } from "./stats.js";
import { derbyStatus, closesAt, standings } from "./derby.js";
import { rankings, scoringTimeline, currentScoring, TITLES } from "./rank.js";
import { BADGES } from "./badges.js";
import { fmtWeight, fmtLength, fmtClock } from "./ui.js";
import { biteTimes, nextPeriod } from "./solunar.js";
import { goalWatch as goalNear, goalTitle, periodText } from "./goals.js";

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
/* 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd" */
const ORD = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const pts = n => Math.round(n * 10) / 10;
const asMap = x => (x instanceof Map ? x : new Map((x || []).map(d => [d.id, d])));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* "45 min", "3 h", "2 d" */
export function span(ms) {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} h`;
  return `${Math.round(ms / DAY)} d`;
}

/* League catches that count (not past, not disqualified, not in a test derby), like badges and crowns. */
function counted(catches, derbies) {
  return leagueCatches(catches).filter(c => !c.dq && !(c.derbyId && derbies.get(c.derbyId) && derbies.get(c.derbyId).testing));
}

/* ---------- Happening now: a derby on (or about to be), or a trip coming up ---------- */
function happening(x) {
  const { me, now, derbies, entrants, catches, trips, rsvps } = x;
  const live = [...derbies.values()].filter(d => !d.cancelled && ["active", "closing"].includes(derbyStatus(d, now)));
  const joined = d => (entrants.get(d.id) || new Map()).has(me);
  const d = live.find(joined) || live[0];
  if (d) {
    const href = `#/d/${d.id}`;
    if (!joined(d)) return { title: `${d.name} is live`, detail: `Ends in ${span(d.end - now)}. Join and get a fish in.`, href };
    const rows = standings(d, catches, entrants.get(d.id) || new Map()), i = rows.findIndex(r => r.uid === me);
    const place = i >= 0 ? `You're ${ORD(i + 1)} of ${rows.length}.` : "No fish entered yet.";
    return derbyStatus(d, now) === "closing"
      ? { title: `${d.name}: fishing's over`, detail: `Last entries in ${span(closesAt(d) - now)}. ${place}`, href }
      : { title: `${d.name} ends in ${span(d.end - now)}`, detail: place, href };
  }
  // An outing from 12 hours ago to 2 days ahead.
  const t = [...trips.values()].filter(t => t.at > now - 12 * HOUR && t.at < now + 2 * DAY).sort((a, b) => a.at - b.at)[0];
  if (t) {
    const answers = rsvps.get(t.id) || new Map(), mine = (answers.get(me) || {}).answer;
    const ins = [...answers.values()].filter(r => r.answer === "in").length;
    const mineText = t.uid === me ? "Your outing." : mine === "in" ? "You're in." : mine === "maybe" ? "You're a maybe." : mine === "out" ? "You're out." : "Are you in?";
    const when = t.at > now ? `Starts in ${span(t.at - now)}` : "Out now";
    return { title: `🚤 ${t.title}`, detail: [when, t.place, ins ? `${plural(ins, "angler", "anglers")} in` : "No one's in yet"].filter(Boolean).join(" · ") + `. ${mineText}`, href: `#/t/${t.id}` };
  }
  const soon = [...derbies.values()].filter(d => !d.cancelled && derbyStatus(d, now) === "upcoming" && d.start - now < 7 * DAY).sort((a, b) => a.start - b.start)[0];
  if (soon) return { title: `${soon.name} starts in ${span(soon.start - now)}`, detail: joined(soon) ? "You're entered." : "Not entered yet. Tap to join.", href: `#/d/${soon.id}` };
  return null;
}

/* ---------- Best bite: what's on now or next at the home water (only once an admin has set it) ---------- */
function bestBite(x) {
  const home = x.input.home;
  if (!home || typeof home.lat !== "number") return null;
  const today = biteTimes(x.now, home);
  let at = nextPeriod(today, x.now), day = today, when = "";
  if (!at) { day = biteTimes(x.now + DAY, home); at = day.periods.length ? { period: day.periods[0], now: false } : null; when = "Tomorrow "; }
  if (!at) return null;
  const p = at.period, kind = p.kind === "major" ? "Major" : "Minor";
  const rated = `${when ? "Tomorrow" : "Today"} looks ${day.ratingText.toLowerCase()} (${day.moon.emoji} ${day.moon.name.toLowerCase()}).`;
  return at.now
    ? { title: `🎣 ${kind} bite on now`, detail: `${p.why} until ${fmtClock(p.end)}. ${rated}`, href: "#/bite" }
    : { title: `🎣 Next bite: ${when}${fmtClock(p.start)}`, detail: `${kind}: ${p.why.toLowerCase()}, ${fmtClock(p.start)} to ${fmtClock(p.end)}. ${rated}`, href: "#/bite" };
}

/* ---------- Your standing: this season's place, and the next title ---------- */
function standing(x) {
  const { me, input, name, seasonStart } = x;
  const rows = rankings(input, { since: seasonStart }), i = rows.findIndex(r => r.uid === me);
  if (i < 0) return null;
  const r = rows[i], parts = [];
  if (!r.points) parts.push("No points yet this season.");
  else if (i > 0) parts.push(`${pts(rows[i - 1].points - r.points)} pts behind ${name(rows[i - 1].uid)}.`);
  else if (rows[1]) parts.push(`${pts(r.points - rows[1].points)} pts ahead of ${name(rows[1].uid)}.`);
  // Titles go by all-time points.
  const all = rankings(input).find(a => a.uid === me), steps = currentScoring(scoringTimeline(input.versions)).titles;
  const k = steps.findIndex(s => s > all.points);
  if (k > 0 && k < TITLES.length) parts.push(`${Math.ceil(steps[k] - all.points)} pts to ${TITLES[k]}.`);
  return { title: `#${i + 1} of ${rows.length} this season · ${plural(r.points, "pt", "pts")}`, detail: parts.join(" "), href: "#/leaders" };
}

/* ---------- Within reach: the league record you're closest to ---------- */
function withinReach(x) {
  const { me, name, league } = x;
  let best = null;
  for (const species of new Set(league.filter(c => c.uid === me && measured(c)).map(c => c.species))) {
    for (const by of ["weight", "length"]) {
      const board = speciesBoard(league, species, by), field = by === "weight" ? "weightOz" : "lengthIn";
      const top = board[0], mine = board.find(c => c.uid === me);
      if (!top || !mine || top.uid === me) continue;
      const ratio = mine[field] / top[field];
      if (!best || ratio > best.ratio) best = { ratio, species, by, field, top, mine };
    }
  }
  if (!best) {
    const held = new Set(league.filter(c => c.uid === me && measured(c)).map(c => c.species));
    const mineHeld = [...held].filter(sp => ["weight", "length"].some(by => (speciesBoard(league, sp, by)[0] || {}).uid === me));
    return mineHeld.length ? { title: `You hold every record you've fished for`, detail: `${plural(mineHeld.length, "species", "species")}: ${mineHeld.join(", ")}. Try a new species.`, href: "#/leaders" } : null;
  }
  const fmt = best.by === "weight" ? fmtWeight : fmtLength;
  return {
    title: `${best.species}: ${fmt(best.top[best.field] - best.mine[best.field])} short of the record`,
    detail: `Yours: ${fmt(best.mine[best.field])}. ${name(best.top.uid)}'s record: ${fmt(best.top[best.field])}.`,
    href: `#/leaders/${encodeURIComponent(best.species)}/${best.by}`,
  };
}

/* ---------- Crown watch: a crown you could lose, or one you could take ---------- */
function crownWatch(x) {
  const { me, name, crowns } = x;
  const unit = (c, n) => `${n} ${c.unit[n === 1 ? 0 : 1]}`;
  const mine = crowns.filter(s => s.holder === me);
  if (mine.length) {
    // Holding: the closest challenger (a tie keeps the crown with the holder).
    const threats = mine.map(s => ({ s, next: s.board.find(b => b.uid !== me) })).filter(t => t.next)
      .sort((a, b) => (a.s.score - a.next.score) - (b.s.score - b.next.score));
    const held = `You hold ${plural(mine.length, "crown", "crowns")}.`;
    const icons = mine.slice(0, 5).map(s => s.crown.icon).join(" ") + (mine.length > 5 ? ` +${mine.length - 5}` : "");
    if (!threats.length) return { title: `You hold ${icons}`, detail: `${held} Nobody's chasing yet.`, href: "#/leaders", crowns: true };
    const { s, next } = threats[0], gap = s.score - next.score;
    return { title: `${s.crown.icon} ${s.crown.name}: ${name(next.uid)} ${gap ? `is ${unit(s.crown, gap)} behind you` : "has tied you"}`, detail: held, href: "#/leaders", crowns: true };
  }
  // Not holding any: the one you're nearest to taking (you need more than the holder).
  const chase = crowns.filter(s => s.holder).map(s => ({ s, gap: s.score - ((s.board.find(b => b.uid === me) || {}).score || 0) }))
    .sort((a, b) => a.gap - b.gap)[0];
  if (!chase) return null;
  return { title: `${chase.s.crown.icon} ${chase.s.crown.name}: ${unit(chase.s.crown, chase.gap + 1)} to take it`,
    detail: `${name(chase.s.holder)} holds it with ${unit(chase.s.crown, chase.s.score)}. ${chase.s.crown.desc}.`, href: "#/leaders", crowns: true };
}

/* ---------- Badge watch: the counting badge you're closest to ---------- */
const COUNTS = [
  ["first", x => x.fish, 1, "fish", "fish"], ["fish10", x => x.fish, 10, "fish", "fish"], ["fish50", x => x.fish, 50, "fish", "fish"],
  ["fish100", x => x.fish, 100, "fish", "fish"], ["fish500", x => x.fish, 500, "fish", "fish"],
  ["species5", x => x.species, 5, "species", "species"], ["ten", x => x.species, 10, "species", "species"], ["species20", x => x.species, 20, "species", "species"],
  ["release", x => x.released, 10, "release", "releases"], ["limit10", x => x.limits, 10, "limit", "limits"],
];
function badgeWatch(x) {
  const { me, mineCounted, badges } = x;
  const got = new Set(badges.filter(b => b.uid === me).map(b => b.badge.id));
  const have = {
    fish: mineCounted.reduce((n, c) => n + fishIn(c), 0), species: new Set(mineCounted.map(c => c.species)).size,
    released: mineCounted.filter(c => c.released && !isStringer(c)).length, limits: mineCounted.filter(c => isStringer(c) && c.limit).length,
  };
  const options = COUNTS.map(([id, of, need, one, many]) => ({ b: BADGES.find(b => b.id === id), n: of(have), need, one, many }))
    .filter(o => o.b && !got.has(o.b.id) && o.n < o.need)
    .sort((a, b) => b.n / b.need - a.n / a.need || a.need - b.need);
  const o = options[0];
  if (!o) return null;
  const left = o.need - o.n;
  return { title: `${left} more ${left === 1 ? o.one : o.many} for ${o.b.icon} ${o.b.name}`, detail: `${o.b.desc}. You have ${o.n} of ${o.need}.`, href: "#/me" };
}

/* ---------- Goal watch: your goal closest to done (at least half way) ---------- */
function goalWatch(x) {
  const w = goalNear(x.me, x.input.goals || [], { ...x.input, now: x.now });
  if (!w) return null;
  return { title: `${w.left} more ${w.unit} for 🎯 ${goalTitle(w.g)}`, detail: `Your goal ${periodText(w.g)}: ${w.p.text}.`, href: "#/me" };
}

/* ---------- This week: the league's last 7 days ---------- */
function thisWeek(x) {
  const { now, name, leagueCounted } = x;
  const week = leagueCounted.filter(c => c.caughtAt >= now - 7 * DAY && c.caughtAt <= now + 10 * MIN);
  if (!week.length) return { title: "Quiet week on the water", detail: "No catches in the last 7 days. Be the first!", href: "#/log" };
  const fish = week.reduce((n, c) => n + fishIn(c), 0), species = new Set(week.map(c => c.species)).size;
  const sized = week.filter(measured);
  const big = sized.filter(c => c.weightOz > 0).sort((a, b) => b.weightOz - a.weightOz)[0]
    || sized.filter(c => c.lengthIn > 0).sort((a, b) => b.lengthIn - a.lengthIn)[0];
  return {
    title: `${plural(fish, "fish", "fish")} · ${plural(species, "species", "species")} · ${plural(new Set(week.map(c => c.uid)).size, "angler", "anglers")}`,
    detail: big ? `Biggest: ${name(big.uid)}'s ${big.weightOz > 0 ? fmtWeight(big.weightOz) : fmtLength(big.lengthIn)} ${big.species}.` : "Nothing measured yet this week.",
    href: big ? `#/c/${big.id}` : "#/feed",
  };
}

/* ---------- Get out there: your last catch ---------- */
function getOutThere(x) {
  const { now, mineCounted } = x;
  if (!mineCounted.length) return { overdue: true, label: "Get out there", title: "No catches logged yet", detail: "Log your first fish and get on the board.", href: "#/log" };
  const last = Math.max(...mineCounted.map(c => c.caughtAt)), days = Math.floor((now - last) / DAY);
  if (days >= 7) return { overdue: true, label: "Get out there", title: `Your last catch was ${days} days ago`, detail: "The fish won't catch themselves.", href: "#/log" };
  const recent = mineCounted.filter(c => c.caughtAt >= now - 7 * DAY).reduce((n, c) => n + fishIn(c), 0);
  return { label: "Keep it going", title: `${plural(recent, "fish", "fish")} for you this week`, detail: `Last catch ${span(Math.max(0, now - last))} ago. Nice!`, href: "#/log" };
}

export function fishFinderCards(input, me, { now = Date.now(), seasonStart = new Date(new Date(now).getFullYear(), 0, 1).getTime() } = {}) {
  const derbies = asMap(input.derbies), catches = input.catches || [];
  const leagueCounted = counted(catches, derbies);
  const x = {
    me, now, seasonStart, input, derbies, catches, name: input.name || (u => u),
    entrants: input.entrants || new Map(), trips: input.trips || new Map(), rsvps: input.rsvps || new Map(),
    crowns: input.crowns || [], badges: input.badges || [],
    league: leagueCatches(catches).filter(c => !c.dq), leagueCounted, mineCounted: leagueCounted.filter(c => c.uid === me),
  };
  const card = (kind, label, c) => (c ? { kind, ...c, label: c.label || label } : null);
  const out = getOutThere(x);
  return [
    card("now", "Happening now", happening(x)),
    card("bite", "Best bite", bestBite(x)),
    out.overdue ? card("out", "Get out there", out) : null,
    card("standing", "Your standing", standing(x)),
    card("reach", "Within reach", withinReach(x)),
    card("crowns", "Crown watch", crownWatch(x)),
    card("goal", "Goal watch", goalWatch(x)),
    card("badges", "Badge watch", badgeWatch(x)),
    card("week", "This week", thisWeek(x)),
    out.overdue ? null : card("out", "Keep it going", out),
  ].filter(Boolean).map(({ overdue, ...c }) => c);
}
