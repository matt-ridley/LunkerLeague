/* Angler of the Month (#/months): this month's race, months waiting on late catches, and every saved month with its
   winner and board. Also the race card on Leaders. */
import { el, fill, avatar, fmtDay } from "./ui.js";
import { store, uid, memberName } from "./cloud.js";
import { rankInput } from "./leaders.js";
import { rankEvents } from "./rank.js";
import { monthKey, monthKeys, monthName, monthShort, monthState, monthLockAt, daysLeft, yearOfMonth, MIN_ANGLERS, FIRST_MONTH } from "./months.js";
import { monthBoard } from "./monthrace.js";
import { isPreseason } from "./season.js";

const MEDALS = ["🥇", "🥈", "🥉"];
const who = id => store.members.get(id) || { id, displayName: memberName(id) };
const grace = () => (store.league && store.league.graceDays) ?? 7;
const pts = n => `${Math.round(n * 10) / 10} pt${n === 1 ? "" : "s"}`;
const fishText = n => `${n} fish`;

/* Where a month stands, in a line. */
function stateText(key, doc, board, now) {
  if (doc) return doc.winner ? `🔒 Decided ${fmtDay(doc.lockedAt)}` : `🔒 Too quiet for a winner: ${doc.anglers} angler${doc.anglers === 1 ? "" : "s"} fished (it needs ${MIN_ANGLERS})`;
  const st = monthState(key, now, grace());
  const short = board && board.anglers < MIN_ANGLERS ? ` Needs ${MIN_ANGLERS} anglers fishing for a winner (${board.anglers} so far).` : "";
  if (st === "live") { const d = daysLeft(key, now); return `🎣 ${d} day${d === 1 ? "" : "s"} left.${short}`; }
  if (st === "provisional") return `⏳ Over. Late catches can still change it until ${fmtDay(monthLockAt(key, grace()))}.${short}`;
  return `🔒 Over. An admin's phone saves the winner next time it's online.${short}`;
}

/* A board's rows: place, angler, points and fish. */
const boardList = (rows, limit) => el("ol", { class: "board" }, ...rows.slice(0, limit).map((r, i) =>
  el("li", {}, el("a", { class: "board-row rank-row" + (i < 3 && r.points > 0 ? ` top${i + 1}` : "") + (r.uid === uid() ? " me" : ""), href: `#/u/${r.uid}` },
    el("span", { class: "rank", text: r.points > 0 && MEDALS[i] ? MEDALS[i] : String(i + 1) }),
    avatar(who(r.uid)),
    el("div", { class: "grow" }, el("div", { class: "name", text: who(r.uid).displayName }), el("div", { class: "rank-title", text: fishText(r.fish) })),
    el("b", { class: "board-size", text: pts(r.points) })))));

export function renderMonths(main) {
  const now = Date.now(), keys = monthKeys(now);
  const input = rankInput(), events = rankEvents(input);
  fill(main,
    el("a", { class: "eyebrow back-link", href: "#/leaders", text: "← Leaders" }),
    el("h2", { class: "page-title", text: "🗓️ Angler of the Month" }),
    el("p", { class: "muted small", text: `The most season points earned in a calendar month wins: catches, limits, new species, badges, derbies and head-to-heads (records and crowns count for the season, not the month). Ties go to the most fish, then the biggest fish. A month needs at least ${MIN_ANGLERS} anglers fishing to have a winner, and it's decided ${grace()} days after it ends, so late catches still count. The winner gets bonus points, the 🗓️ Angler of the Month badge, and a shot at the Monthly Master crown.` }),
    keys.length ? null : el("p", { class: "card empty", text: `The first race is ${monthName(FIRST_MONTH)}.` }),
    ...keys.map(key => {
      const doc = store.months.get(key);
      const board = doc ? null : monthBoard(input, key, events);
      const rows = doc ? doc.board || [] : board.rows;
      const winner = doc && doc.winner;
      return el("section", { class: "card stack" },
        el("div", { class: "row spread" }, el("h3", { text: monthName(key) }),
          isPreseason(yearOfMonth(key)) ? el("span", { class: "chip small", text: "🧪 Preseason trial" }) : null),
        winner ? el("p", { class: "month-winner" }, avatar(who(winner), "sm"), el("b", { text: ` 🗓️ ${who(winner).displayName}` }),
          ` · ${pts(doc.points)} · ${fishText(doc.fish)}`) : null,
        el("p", { class: "muted small", text: stateText(key, doc, board, now) }),
        rows.length ? boardList(rows, doc ? 10 : 10) : el("p", { class: "muted", text: "No points yet this month." }));
    }));
}

/* The race card on Leaders: this month's top 3 and last month's winner. */
export function monthRaceCard(now = Date.now()) {
  const key = monthKey(now);
  if (key < FIRST_MONTH) return null;
  const board = monthBoard(rankInput(), key);
  const last = [...store.months.values()].filter(d => d.key < key).sort((a, b) => (a.key < b.key ? 1 : -1))[0];
  return el("a", { class: "card stack month-card", href: "#/months" },
    el("div", { class: "row spread" }, el("b", { text: `🗓️ ${monthShort(key)} race` }), el("span", { class: "muted small", text: `${daysLeft(key, now)} days left` })),
    board.rows.length
      ? el("div", { class: "stack-tight" }, ...board.rows.slice(0, 3).map((r, i) => el("div", { class: "row spread" },
          el("span", { text: `${r.points > 0 ? MEDALS[i] : i + 1} ${who(r.uid).displayName}${r.uid === uid() ? " (you)" : ""}` }), el("b", { text: pts(r.points) }))))
      : el("span", { class: "muted small", text: "No points yet this month." }),
    last ? el("span", { class: "muted small", text: last.winner ? `Last: ${monthShort(last.key)} went to ${who(last.winner).displayName} (${pts(last.points)})` : `${monthShort(last.key)} was too quiet for a winner` } ) : null);
}
