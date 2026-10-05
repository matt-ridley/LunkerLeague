/* Admin: change how ranking points work. Every save is a new version (old ones are kept), applied either to all
   history or from now on, with a preview of how the standings would change before saving. */
import { el, field, avatar, fill, fmtDate, toast } from "./ui.js";
import { store, isAdmin, memberName, saveScoring } from "./cloud.js";
import { rankings, scoringTimeline, currentScoring, TITLES, DEFAULT_SCORING } from "./rank.js";
import { rankInput } from "./leaders.js";

let draft = null; // values being edited (kept while the preview redraws)

export function renderScoring(main) {
  if (!isAdmin()) return fill(main, el("div", { class: "card" }, el("p", { text: "Only league admins can change how points work." })));
  const current = currentScoring(scoringTimeline(store.scoring));
  if (!draft) draft = structuredClone(current);

  const num = (get, set, label, hint) => {
    const i = el("input", { type: "text", inputmode: "decimal", value: String(get()) });
    i.addEventListener("input", () => { const n = parseFloat(i.value); if (isFinite(n) && n >= 0) { set(Math.min(1000, n)); drawPreview(); } });
    return field(label, i, hint);
  };
  const triple = (key, label, hint) => el("div", { class: "field" }, el("span", { class: "field-label", text: label }),
    el("div", { class: "unit-row" }, ...[0, 1, 2].flatMap(k => {
      const i = el("input", { type: "text", inputmode: "decimal", value: String(draft[key][k]), "aria-label": `${label} ${k + 1}` });
      i.addEventListener("input", () => { const n = parseFloat(i.value); if (isFinite(n) && n >= 0) { draft[key][k] = n; drawPreview(); } });
      return [i, el("span", { text: ["1st", "2nd", "3rd"][k] })];
    })), hint ? el("span", { class: "hint", text: hint }) : null);

  let mode = "forward";
  const note = el("input", { type: "text", maxlength: 200, placeholder: "Why the change? (optional)" });
  const modeSeg = el("div", { class: "seg" });
  const drawMode = () => fill(modeSeg, ...[["forward", "From now on"], ["retro", "All history"]].map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(mode === k), text: label, onclick: () => { mode = k; drawMode(); drawPreview(); } })));
  drawMode();
  const modeHint = el("p", { class: "hint" });

  const preview = el("section", { class: "card stack" });
  function drawPreview() {
    modeHint.textContent = mode === "retro"
      ? "Every catch and derby so far is rescored with these values."
      : "Points already earned stay as they are; only catches and derbies from now on use these values. Record points always use the latest values.";
    const input = rankInput();
    const before = rankings(input);
    const candidate = { id: "preview", mode, effectiveFrom: mode === "retro" ? 0 : Date.now(), createdAt: Date.now() + 1, values: draft };
    const after = rankings({ ...input, versions: [...store.scoring, candidate] });
    const was = new Map(before.map((r, i) => [r.uid, { pts: r.points, place: i + 1 }]));
    fill(preview, el("h3", { text: "Preview" }),
      el("p", { class: "hint", text: "How the all-time standings would look if you saved now." }),
      el("ol", { class: "board" }, ...after.map((r, i) => {
        const w = was.get(r.uid) || { pts: 0, place: i + 1 }, diff = Math.round((r.points - w.pts) * 10) / 10, move = w.place - (i + 1);
        return el("li", { class: "preview-row" }, el("span", { class: "rank", text: String(i + 1) }), avatar(store.members.get(r.uid) || { id: r.uid, displayName: memberName(r.uid) }, "sm"),
          el("span", { class: "grow", text: memberName(r.uid) }),
          move ? el("span", { class: "muted small", text: move > 0 ? `▲${move}` : `▼${-move}` }) : null,
          el("b", { text: `${r.points}` }),
          el("span", { class: "delta" + (diff > 0 ? " up" : diff < 0 ? " down" : ""), text: diff ? `${diff > 0 ? "+" : ""}${diff}` : "±0" }));
      })));
  }

  const titleInputs = el("div", { class: "stack" }, ...TITLES.map((t, i) => {
    const inp = el("input", { type: "text", inputmode: "numeric", value: String(draft.titles[i]), disabled: i === 0 });
    inp.addEventListener("input", () => { const n = parseFloat(inp.value); if (isFinite(n) && n >= 0) { draft.titles[i] = n; drawPreview(); } });
    return el("div", { class: "title-row" }, el("span", { class: "grow", text: t }), inp, el("span", { class: "muted small", text: "pts" }));
  }));

  const msg = el("p", { class: "msg" });
  const save = el("button", { class: "btn lime block big", type: "button", text: "Save new points" });
  save.addEventListener("click", () => {
    const t = draft.titles;
    for (let i = 1; i < t.length; i++) if (!(t[i] > t[i - 1])) { msg.className = "msg err"; msg.textContent = "Each title needs more points than the one before."; return; }
    saveScoring(structuredClone(draft), mode, note.value);
    draft = null;
    toast(mode === "retro" ? "Points updated for all history." : "New points apply from now on.");
    location.hash = "#/leaders";
  });

  const history = [...store.scoring].reverse();
  fill(main,
    el("h2", { class: "page-title", text: "Ranking points" }),
    el("p", { class: "muted", text: "Points are worked out from the catches and derbies every time, so changes here update everyone's ranking straight away." }),
    el("section", { class: "card stack" }, el("h3", { text: "🎣 Catches" }),
      num(() => draft.catchPts, v => { draft.catchPts = v; }, "Points per catch"),
      num(() => draft.dailyCap, v => { draft.dailyCap = Math.round(v); }, "Catches that count per day", "Stops anyone farming points by logging fish one at a time. A stringer earns the whole day's worth."),
      num(() => draft.limitPts, v => { draft.limitPts = v; }, "Bonus for a limit stringer", "Once per angler per day."),
      num(() => draft.speciesPts, v => { draft.speciesPts = v; }, "Points for a new species")),
    el("section", { class: "card stack" }, el("h3", { text: "👑 Species records" }),
      triple("recordPts", "Holding a spot on a species' weight board", "Goes to whoever holds it right now.")),
    el("section", { class: "card stack" }, el("h3", { text: "🏁 Derbies" }),
      triple("derbyPts", "Finishing places"),
      num(() => draft.participationPts, v => { draft.participationPts = v; }, "Points for fishing a derby"),
      num(() => draft.beatPts, v => { draft.beatPts = v; }, "Points per angler beaten", "Makes winning a big derby worth more than a small one. 0 to turn off.")),
    el("section", { class: "card stack" }, el("h3", { text: "🏅 Titles" }), titleInputs),
    el("section", { class: "card stack" }, el("h3", { text: "Apply to" }), modeSeg, modeHint, field("Note", note)),
    preview, msg, save,
    el("button", { class: "btn quiet block", type: "button", text: "Reset to the current points", onclick: () => { draft = null; renderScoring(main); } }),
    history.length ? el("section", { class: "card stack" }, el("h3", { text: "History" }),
      el("ul", { class: "points-list" }, ...history.map(v => el("li", {},
        el("div", { class: "grow" }, el("b", { text: v.mode === "retro" ? "All history" : "From now on" }),
          el("div", { class: "muted small", text: `${fmtDate(v.createdAt)} · ${memberName(v.createdBy)}${v.note ? ` · "${v.note}"` : ""}` })),
        el("button", { class: "btn small", type: "button", text: "Use these", onclick: () => { draft = structuredClone({ ...DEFAULT_SCORING, ...v.values }); renderScoring(main); toast("Loaded. Choose how to apply them, then save."); } })))),
      el("p", { class: "hint", text: "Old versions are kept for good. \"Use these\" loads one so you can save it again as a new version." })) : null);
  drawPreview();
}
