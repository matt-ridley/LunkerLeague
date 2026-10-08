/* Goals on a profile (with progress bars), and the sheet to set one. */
import { el, field, fmtDay, openSheet, closeSheet, toast, confirmButton } from "./ui.js";
import { store, uid, saveGoal, deleteGoal } from "./cloud.js";
import { KINDS, COUNT_KINDS, goalTitle, goalProgress, periodText, yearPeriod } from "./goals.js";
import { SPECIES, normalizeSpecies } from "./species.js";

const DAY = 86400000;
const data = () => ({ catches: [...store.catches.values()], skunks: [...store.skunks.values()], trips: store.trips, rsvps: store.rsvps });

/* The goals card on a profile: goals on now (and ones reached or ended in the last 30 days), newest first. */
export function goalsSection(memberId, mine) {
  const now = Date.now(), d = data();
  const all = [...store.goals.values()].filter(g => g.uid === memberId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const rows = all.map(g => ({ g, p: goalProgress(g, d) }));
  const current = rows.filter(({ g, p }) => g.to >= now - 30 * DAY || (p.done && p.doneAt >= now - 30 * DAY));
  const older = rows.length - current.length;
  if (!rows.length && !mine) return null;
  return el("section", { class: "card stack" },
    el("div", { class: "row spread" }, el("h3", { text: "🎯 Goals" }),
      mine ? el("button", { class: "btn small", type: "button", text: "+ Add goal", onclick: () => goalSheet() }) : null),
    current.length ? el("ul", { class: "goal-list" }, ...current.map(({ g, p }) => goalRow(g, p, mine, now)))
      : el("p", { class: "muted", text: mine ? "Set yourself a goal, like 10 species this year or a 40-inch muskie. The league sees it, and the feed cheers when you get there." : "No goals on right now." }),
    older ? el("p", { class: "hint", text: `Plus ${older} older goal${older === 1 ? "" : "s"}.` }) : null);
}

function goalRow(g, p, mine, now) {
  const ended = !p.done && now > g.to;
  const counting = COUNT_KINDS.includes(g.kind);
  return el("li", { class: "goal" + (p.done ? " done" : ended ? " ended" : "") },
    el("div", { class: "row spread" },
      el("b", { text: `${p.done ? "✅ " : ""}${goalTitle(g)}` }),
      mine ? el("button", { class: "btn small quiet", type: "button", text: "Edit", onclick: () => goalSheet(g) }) : null),
    el("div", { class: "muted small", text: `${periodText(g)} · ${p.done ? `reached ${fmtDay(p.doneAt)}` : ended ? "ended" : p.text}` }),
    counting || p.done ? el("div", { class: "meter", role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(p.done ? 100 : p.pct),
      "aria-label": `${goalTitle(g)}: ${p.done ? "reached" : p.text}` },
      el("span", { class: `meter-fill ${p.done ? "ok" : "goal"}`, style: `width:${Math.max(2, p.done ? 100 : p.pct)}%` })) : null);
}

const toDateInput = ms => { const d = new Date(ms), z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
const fromDateInput = (v, end) => { const [y, m, d] = v.split("-").map(Number); return y ? (end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d)).getTime() : NaN; };

/* Add or edit a goal. */
export function goalSheet(g = null) {
  openSheet(box => {
    const yr = yearPeriod();
    const isYear = !g || (yearPeriod(g.from).from === g.from && yearPeriod(g.from).to === g.to);
    const st = { kind: g ? g.kind : "species", year: isYear, field: g && g.field === "lengthIn" ? "lengthIn" : "weightOz" };
    const target = el("input", { type: "text", inputmode: "numeric", placeholder: "e.g. 10", value: g && g.target ? String(g.target) : "" });
    const species = el("input", { type: "text", list: "goal-species", autocapitalize: "words", autocomplete: "off", maxlength: 40,
      placeholder: "e.g. Muskie", value: g ? g.species || "" : "" });
    const speciesList = el("datalist", { id: "goal-species" }, ...SPECIES.map(s => el("option", { value: s })));
    const v = g && g.kind === "size" ? g.value : 0;
    const lb = el("input", { type: "text", inputmode: "numeric", placeholder: "0", "aria-label": "Pounds", value: v && st.field === "weightOz" ? String(Math.floor(v / 16)) : "" });
    const oz = el("input", { type: "text", inputmode: "decimal", placeholder: "0", "aria-label": "Ounces", value: v && st.field === "weightOz" ? String(Math.round((v % 16) * 10) / 10) : "" });
    const inches = el("input", { type: "text", inputmode: "decimal", placeholder: "0", "aria-label": "Inches", value: v && st.field === "lengthIn" ? String(v) : "" });
    const from = el("input", { type: "date", value: toDateInput(g ? g.from : Date.now()) });
    const to = el("input", { type: "date", value: toDateInput(g ? g.to : yr.to) });
    const kind = el("select", { "aria-label": "Kind of goal" }, ...KINDS.map(([k, t]) => el("option", { value: k, text: t })));
    kind.value = st.kind;
    const body = el("div", { class: "stack" });
    const msg = el("p", { class: "msg", role: "status" });
    const seg = (key, options) => el("div", { class: "seg" }, ...options.map(([k, label]) =>
      el("button", { type: "button", "aria-pressed": String(st[key] === k), text: label, onclick: () => { st[key] = k; draw(); } })));
    const draw = () => {
      body.replaceChildren(...[
        COUNT_KINDS.includes(st.kind) ? field(st.kind === "species" ? "How many species?" : st.kind === "fish" ? "How many fish?" : "How many days out?", target) : null,
        st.kind === "days" ? el("p", { class: "hint", text: "Days out: days with a fish, plus skunks you log and outings you were In for." }) : null,
        !COUNT_KINDS.includes(st.kind) ? field("Species", species) : null,
        !COUNT_KINDS.includes(st.kind) ? speciesList : null,
        !COUNT_KINDS.includes(st.kind) ? seg("field", [["weightOz", "By weight"], ["lengthIn", "By length"]]) : null,
        st.kind === "size" && st.field === "weightOz" ? el("div", { class: "field" }, el("span", { class: "field-label", text: "At least" }),
          el("div", { class: "unit-row" }, lb, el("span", { text: "lb" }), oz, el("span", { text: "oz" }))) : null,
        st.kind === "size" && st.field === "lengthIn" ? el("div", { class: "field" }, el("span", { class: "field-label", text: "At least" }),
          el("div", { class: "unit-row" }, inches, el("span", { text: "inches" }))) : null,
        st.kind === "pb" ? el("p", { class: "hint", text: "Beat your best from before the goal starts. With no PB yet, the first one you measure counts." }) : null,
        el("span", { class: "field-label", text: "When" }),
        seg("year", [[true, `This year (${new Date().getFullYear()})`], [false, "Between dates"]]),
        st.year ? null : el("div", { class: "row" }, field("From", from), field("To", to)),
      ].filter(Boolean));
    };
    kind.addEventListener("change", () => { st.kind = kind.value; draw(); });
    draw();
    const num = s => { const n = parseFloat(String(s).replace(",", ".")); return isFinite(n) ? n : 0; };
    const form = el("form", { class: "stack" },
      el("h2", { text: g ? "Edit goal" : "New goal" }),
      field("Goal", kind), body, msg,
      el("p", { class: "hint", text: "Everyone in the league can see your goals. Reaching one is news in the feed. Goals don't earn points." }),
      el("div", { class: "row" },
        g ? confirmButton("Delete", "Tap again to delete", () => { deleteGoal(g.id); closeSheet(); toast("Goal deleted."); }, "btn quiet") : null,
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        el("button", { class: "btn primary", type: "submit", text: "Save" })));
    form.addEventListener("submit", e => {
      e.preventDefault();
      const fail = t => { msg.className = "msg err"; msg.textContent = t; };
      const period = st.year ? yearPeriod() : { from: fromDateInput(from.value, false), to: fromDateInput(to.value, true) };
      if (!isFinite(period.from) || !isFinite(period.to) || period.to <= period.from) return fail("Pick a start date before the end date.");
      const d = { kind: st.kind, from: period.from, to: period.to };
      if (COUNT_KINDS.includes(st.kind)) {
        const n = Number(target.value.trim());
        if (!Number.isInteger(n) || n < 1 || n > 100000) return fail("Enter how many, as a whole number.");
        d.target = n;
      } else {
        const sp = normalizeSpecies(species.value);
        if (!sp) return fail("Enter the species.");
        Object.assign(d, { species: sp, field: st.field });
        if (st.kind === "size") {
          const value = st.field === "weightOz" ? Math.round((num(lb.value) * 16 + num(oz.value)) * 10) / 10 : Math.round(num(inches.value) * 4) / 4;
          if (!(value > 0)) return fail(st.field === "weightOz" ? "Enter the weight." : "Enter the length.");
          if (st.field === "weightOz" && num(oz.value) >= 16) return fail("Ounces should be under 16.");
          d.value = value;
        }
      }
      saveGoal(g ? g.id : null, d);
      closeSheet();
      toast(g ? "Goal saved." : "Goal set. Good luck!");
    });
    box.append(form);
  });
}
