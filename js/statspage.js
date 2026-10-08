/* An angler's stats page (#/stats/{uid}): days out and skunks, catches by month, time of day, species and lure, and
   what's working. Also the "Got skunked" sheet. */
import { el, fill, field, fmtDay, openSheet, closeSheet, toast, confirmButton } from "./ui.js";
import { store, uid, logSkunk, removeSkunk } from "./cloud.js";
import { dayKey, dayAt, daysOut } from "./skunks.js";
import { PERIODS, MONTHS, periodRange, inPeriod, summary, byMonth, byDaypart, bySpecies, byLure, byTechnique, whatsWorking } from "./mystats.js";

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
  const out_ = daysOut(m.id, { catches: everyone, skunks: [...store.skunks.values()], trips: store.trips, rsvps: store.rsvps,
    ...periodRange(st.period) });
  const pastN = theirs.filter(c => c.past).length;
  const seg = (key, options, value) => el("div", { class: "seg" }, ...options.map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(value === k), text: label,
      onclick: () => { st[key] = k; remember(`lunker-stats-${key}`, k); draw(); } })));

  const out = [
    seg("period", PERIODS, st.period),
    el("div", { class: "hero-stats plain four" },
      tile(sum.fish, "fish"), tile(sum.catches, "catches"), tile(sum.species, "species"), tile(out_.daysOut, out_.daysOut === 1 ? "day out" : "days out")),
    pastN ? el("p", { class: "hint", text: `Includes ${pastN} past catch${pastN === 1 ? "" : "es"} from the 📜 logbook. A stringer counts as its number of fish.` })
      : el("p", { class: "hint", text: "A stringer counts as its number of fish." }),
    skunkCard(m, mine, out_),
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

/* Days out: fish per day, and the skunks (logged, or from outings with no fish). */
function skunkCard(m, mine, d) {
  const logged = d.days.filter(x => x.logged && x.skunk).reverse().slice(0, 5);
  const line = (k, v) => el("div", { class: "fact" }, el("dt", { text: k }), el("dd", { text: v }));
  return el("section", { class: "card stack" },
    el("h3", { text: "🦨 Days out and skunks" }),
    d.daysOut ? el("dl", { class: "facts" },
      line("Days out", `${d.daysOut} (${d.daysOut - d.skunkDays} with fish, ${d.skunkDays} skunked)`),
      line("Fish per day out", String(d.fishPerDay)),
      line("Longest skunk streak", d.longestStreak ? `${d.longestStreak} day${d.longestStreak === 1 ? "" : "s"} out in a row` : "None yet"),
      d.currentStreak ? line("Skunked lately", `The last ${d.currentStreak} day${d.currentStreak === 1 ? "" : "s"} out`) : null)
      : el("p", { class: "muted", text: "No days out in this period." }),
    el("p", { class: "hint", text: "A day out is a day with a fish, a skunk you logged, or an outing you were In for that ended with no fish. A day with a fish is never a skunk." }),
    mine && logged.length ? el("ul", { class: "skunk-list" }, ...logged.map(x => el("li", { class: "row spread" },
      el("span", { text: `🦨 ${fmtDay(dayAt(x.day))}` }),
      confirmButton("Remove", "Tap again to remove", () => { removeSkunk(x.day); toast("Skunk removed."); }, "btn small quiet")))) : null,
    mine ? el("button", { class: "btn block", type: "button", text: "🦨 Log a skunk", onclick: skunkSheet }) : null);
}

/* "Got skunked": a day out with no fish (today by default; not a day you logged a fish). */
export function skunkSheet() {
  openSheet(box => {
    const today = dayKey(Date.now());
    const day = el("input", { type: "date", value: today, max: today });
    const notes = el("textarea", { rows: 2, maxlength: 200, placeholder: "Where you went, what you tried…" });
    const msg = el("p", { class: "msg", role: "status" });
    const existing = () => store.skunks.get(`${uid()}_${day.value}`);
    const sync = () => { const s = existing(); notes.value = s ? s.notes || "" : notes.value; };
    day.addEventListener("change", sync);
    const form = el("form", { class: "stack" },
      el("h2", { text: "🦨 Got skunked" }),
      el("p", { class: "hint", text: "Log a day on the water with no fish. It counts toward your days out and fish per day, on your stats page." }),
      field("Day", day), field("Notes (optional)", notes), msg,
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        el("button", { class: "btn primary", type: "submit", text: "Save" })));
    form.addEventListener("submit", e => {
      e.preventDefault();
      const fail = t => { msg.className = "msg err"; msg.textContent = t; };
      if (!day.value || day.value > today) return fail("Pick today or a day before.");
      const fished = [...store.catches.values()].some(c => c.uid === uid() && !c.dq && dayKey(c.caughtAt) === day.value);
      if (fished) return fail("You logged a fish that day, so it wasn't a skunk.");
      logSkunk(day.value, notes.value);
      closeSheet();
      toast("Skunk logged. Better luck next time! 🦨");
    });
    sync();
    box.append(form);
  });
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
