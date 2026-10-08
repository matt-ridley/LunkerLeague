/* An angler's stats page (#/stats/{uid}): catches by month, time of day, species and lure, and what's working. */
import { el, fill } from "./ui.js";
import { store, uid } from "./cloud.js";
import { PERIODS, MONTHS, inPeriod, summary, byMonth, byDaypart, bySpecies, byLure, byTechnique, whatsWorking } from "./mystats.js";

// Remembered for the session, like the Leaders tab.
const remember = (k, v) => { try { sessionStorage.setItem(k, v); } catch {} };
const recall = (k, fallback, ok) => { try { const v = sessionStorage.getItem(k); return ok.includes(v) ? v : fallback; } catch { return fallback; } };
const fishWord = n => `${n} fish`;

export function renderStats(main, id = uid()) {
  const mine = id === uid();
  const m = mine ? { ...store.me, id } : store.members.get(id);
  if (!m) return fill(main, el("div", { class: "card" }, el("p", { text: "That member isn't in the league any more." })));
  const st = {
    period: recall("lunker-stats-period", "all", PERIODS.map(p => p[0])),
    who: recall("lunker-stats-who", "mine", ["mine", "league"]),
  };
  const box = el("div", { class: "stack" });
  const draw = () => fill(box, ...parts(m, mine, st, draw));
  draw();
  fill(main, el("h2", { class: "page-title", text: mine ? "📊 Your stats" : `📊 ${m.displayName}'s stats` }), box);
}

function parts(m, mine, st, draw) {
  // Disqualified derby entries are left out; past catches (the logbook) are in.
  const everyone = [...store.catches.values()].filter(c => !c.dq);
  const theirs = inPeriod(everyone.filter(c => c.uid === m.id), st.period);
  const sum = summary(theirs);
  const pastN = theirs.filter(c => c.past).length;
  const seg = (key, options, value) => el("div", { class: "seg" }, ...options.map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(value === k), text: label,
      onclick: () => { st[key] = k; remember(`lunker-stats-${key}`, k); draw(); } })));

  const out = [
    seg("period", PERIODS, st.period),
    el("div", { class: "hero-stats plain four" },
      tile(sum.fish, "fish"), tile(sum.catches, "catches"), tile(sum.species, "species"), tile(sum.days, sum.days === 1 ? "day" : "days")),
    pastN ? el("p", { class: "hint", text: `Includes ${pastN} past catch${pastN === 1 ? "" : "es"} from the 📜 logbook. A stringer counts as its number of fish.` })
      : el("p", { class: "hint", text: "A stringer counts as its number of fish. Days are days with a fish." }),
  ];
  if (!theirs.length) {
    out.push(el("p", { class: "card empty", text: st.period === "all" ? "No catches yet." : "No catches in this period." }));
    return out;
  }
  const tackle = store.tackle;
  const lures = byLure(theirs, tackle), techniques = byTechnique(theirs, tackle);
  out.push(
    chartCard("By month", "Every year added together.", monthBars(byMonth(theirs))),
    chartCard("Time of day", null, hbars(byDaypart(theirs), { keepZero: true })),
    chartCard("Species", null, hbars(bySpecies(theirs), { limit: 10 })),
    chartCard("Bait and lures", lures.length ? null : mine ? "Add tackle to your catches to see your lures here." : "No shared tackle yet.",
      lures.length ? hbars(lures, { limit: 8 }) : null),
    techniques.length ? chartCard("Technique", null, hbars(techniques)) : null,
    working(m, mine, st, everyone, seg));
  return out;
}

const tile = (n, label) => el("div", { class: "stat" }, el("b", { text: String(n) }), el("span", { text: label }));

const chartCard = (title, hint, body) => el("section", { class: "card stack" },
  el("h3", { text: title }), hint ? el("p", { class: "hint", text: hint }) : null, body);

/* Horizontal bars, most first: name, bar, count. One series, so one colour and no legend. */
function hbars(rows, { limit = Infinity, keepZero = false } = {}) {
  const list = rows.filter(r => keepZero || r.n > 0);
  const shown = list.slice(0, limit), max = Math.max(1, ...shown.map(r => r.n));
  const rest = list.length - shown.length;
  return el("div", { class: "stack-tight" },
    el("ul", { class: "hbars" }, ...shown.map(r => el("li", { title: `${r.label}${r.range ? ` (${r.range})` : ""}: ${fishWord(r.n)}` },
      el("span", { class: "hbar-label" }, r.label, r.range ? el("small", { text: r.range }) : null),
      el("span", { class: "hbar-track" }, r.n ? el("span", { class: "hbar-fill", style: `width:${(r.n / max) * 100}%` }) : null),
      el("span", { class: "hbar-n", text: String(r.n) })))),
    rest > 0 ? el("p", { class: "hint", text: `And ${rest} more.` }) : null);
}

/* Twelve columns, January first, with the count over each month that has fish. */
function monthBars(counts) {
  const max = Math.max(1, ...counts);
  return el("div", { class: "mbars", role: "img", "aria-label": counts.map((n, i) => `${MONTHS[i]} ${n}`).join(", ") },
    ...counts.map((n, i) => el("div", { class: "mbar", title: `${MONTHS[i]}: ${fishWord(n)}` },
      el("span", { class: "mbar-n", text: n ? String(n) : "" }),
      el("span", { class: "mbar-track" }, n ? el("span", { class: "mbar-fill", style: `height:${(n / max) * 100}%` }) : null),
      el("span", { class: "mbar-label", text: MONTHS[i].slice(0, 1) }))));
}

/* What's working: yours (all your tackle, secret too) or the league's (shared tackle only). */
function working(m, mine, st, everyone, seg) {
  const league = st.who === "league";
  const tackle = league ? new Map([...store.tackle].filter(([, t]) => t.shared)) : store.tackle;
  const list = inPeriod(league ? everyone : everyone.filter(c => c.uid === m.id), st.period);
  const rows = whatsWorking(list, tackle);
  return el("section", { class: "card stack" },
    el("h3", { text: "🎣 What's working" }),
    seg("who", [["mine", mine ? "Yours" : m.displayName], ["league", "The league"]], st.who),
    el("p", { class: "hint", text: league
      ? "What caught the most fish of each species, from everyone's shared tackle (secret tackle stays secret)."
      : "What caught the most fish of each species, from the tackle on the catches." }),
    rows.length
      ? el("div", { class: "stack" }, ...rows.map(w => el("div", { class: "working" },
          el("div", { class: "row spread" }, el("b", { text: w.species }), el("span", { class: "muted small", text: `${fishWord(w.fish)} with tackle noted` })),
          w.lures.length ? el("p", {}, "🎣 ", w.lures.map(l => `${l.label} (${l.n})`).join(" · ")) : null,
          w.techniques.length ? el("p", {}, "🛶 ", w.techniques.map(t => `${t.label} (${t.n})`).join(" · ")) : null,
          w.depth ? el("p", {}, `📏 Usually about ${w.depth} ft deep`) : null)))
      : el("p", { class: "muted", text: "Not enough yet: a species shows here once 2 or more fish of it have tackle noted." }));
}
