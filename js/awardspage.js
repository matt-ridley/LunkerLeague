/* End-of-season awards (#/awards/{year}): the podium, superlatives, records set and crowns held, with a recap picture
   to share. */
import { el, fill, avatar, fmtDay, fmtWeight, fmtLength, toast } from "./ui.js";
import { store, memberName } from "./cloud.js";
import { rankInput } from "./leaders.js";
import { seasonYears, seasonAwards } from "./awards.js";
import { isStringer } from "./stats.js";

const who = u => store.members.get(u) || { id: u, displayName: memberName(u) };
const sizeOf = c => (isStringer(c) ? `stringer of ${c.fishCount}` : [fmtWeight(c.weightOz), fmtLength(c.lengthIn)].filter(Boolean).join(" · "));
const MEDALS = ["🥇", "🥈", "🥉"];
const awardText = a => (a.c ? `${a.c.species}, ${sizeOf(a.c)}` : a.text);

export function renderAwards(main, yearArg) {
  const now = Date.now();
  const years = seasonYears([...store.catches.values()], now);
  const year = years.includes(Number(yearArg)) ? Number(yearArg) : years[0];
  const s = seasonAwards(year, { ...rankInput(), fleet: store.fleet, tackle: store.tackle, now }, now);
  const podiumOrder = [s.podium[1], s.podium[0], s.podium[2]];
  fill(main,
    el("h2", { class: "page-title", text: `🏆 ${year} season${s.ongoing ? " (so far)" : ""}` }),
    years.length > 1 ? el("div", { class: "seg" }, ...years.map(y => el("button", { type: "button", "aria-pressed": String(y === year), text: String(y), onclick: () => { location.hash = `#/awards/${y}`; } }))) : null,
    !store.catchesLoaded ? el("p", { class: "loading", text: "Loading…" }) : null,
    s.podium.length ? el("section", { class: "card podium" }, ...podiumOrder.map((r, i) => r ? el("a", { class: `podium-step p${[2, 1, 3][i]}`, href: `#/u/${r.uid}` },
      el("span", { class: "podium-medal", text: MEDALS[[1, 0, 2][i]] }), avatar(who(r.uid), [2, 1, 3][i] === 1 ? "lg" : ""),
      el("b", { text: who(r.uid).displayName }), el("span", { class: "muted small", text: `${r.points} pts` })) : el("span", {})))
      : el("p", { class: "card empty", text: "No points yet this season." }),
    s.ongoing ? null : el("p", { class: "hint", text: "Points earned during the season. Record and crown points only count while they're held, so they're not in a finished season." }),
    s.awards.length ? el("div", { class: "award-grid" }, ...s.awards.map(a => el("a", { class: "award-card", href: a.boatId ? `#/boat/${a.boatId}` : a.c ? `#/c/${a.c.id}` : a.uid ? `#/u/${a.uid}` : "#/leaders" },
      el("span", { class: "award-icon", text: a.icon }), el("span", { class: "eyebrow", text: a.title }),
      a.uid && !a.boatId ? el("b", { text: who(a.uid).displayName }) : null,
      el("span", { class: a.uid && !a.boatId ? "muted small" : "", text: awardText(a) })))) : null,
    s.records.length ? el("section", { class: "card stack" },
      el("div", { class: "row spread" }, el("h3", { text: `👑 ${s.records.length} record${s.records.length === 1 ? "" : "s"} set` }), el("a", { class: "small", href: "#/hof", text: "Hall of Fame" })),
      el("ul", { class: "hof-reigns" }, ...[...s.records].reverse().slice(0, 10).map(r => el("li", {},
        el("b", { text: `${r.species} ${r.field === "weightOz" ? "weight" : "length"}` }), ` · ${who(r.c.uid).displayName} · `,
        el("a", { href: `#/c/${r.c.id}`, text: r.field === "weightOz" ? fmtWeight(r.c.weightOz) : fmtLength(r.c.lengthIn) }),
        el("span", { class: "muted small", text: ` · ${fmtDay(r.from)}` }))))) : null,
    s.crowns.length ? el("section", { class: "card stack" },
      el("h3", { text: s.ongoing ? "👑 Crowns held now" : "👑 Crowns held at the end" }),
      el("div", { class: "flair-row" }, ...s.crowns.map(x => el("a", { class: "chip", href: `#/u/${x.uid}` }, `${x.crown.icon} ${x.crown.name}: ${who(x.uid).displayName}`)))) : null,
    s.podium.length || s.awards.length ? el("button", { class: "btn primary block", type: "button", text: "📤 Share recap", onclick: () => shareRecap(s) }) : null);
}

/* ---------- The recap picture (made on the phone) ---------- */
function drawRecap(s) {
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const font = (size, weight = 800) => `${weight} ${size}px "Baloo 2", "Segoe UI", system-ui, sans-serif`;
  g.fillStyle = "#0B4F5C"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#C5F23A"; g.fillRect(0, 0, W, 18); g.fillRect(0, H - 18, W, 18);
  g.textAlign = "center"; g.fillStyle = "#FFFFFF";
  g.font = font(40, 700); g.fillText((store.league && store.league.name) || "Lunker League", W / 2, 110);
  g.font = font(84); g.fillText(`🏆 ${s.year} season${s.ongoing ? " so far" : ""}`, W / 2, 210);
  // Podium
  // [podium place, x, y]: 1st in the middle and highest, 2nd on the left, 3rd on the right.
  for (const [i, x, y] of [[0, W / 2, 330], [1, W / 2 - 330, 390], [2, W / 2 + 330, 420]]) {
    const r = s.podium[i];
    if (!r) continue;
    g.font = font(i === 0 ? 110 : 90, 400); g.fillText(MEDALS[i], x, y);
    g.font = font(i === 0 ? 54 : 44); g.fillText(clip(g, who(r.uid).displayName, 320), x, y + 80);
    g.font = font(36, 600); g.fillStyle = "#C5F23A"; g.fillText(`${r.points} pts`, x, y + 130); g.fillStyle = "#FFFFFF";
  }
  // Awards
  g.textAlign = "left";
  let y = 650;
  for (const a of s.awards.slice(0, 7)) {
    g.font = font(44, 400); g.fillText(a.icon, 90, y);
    g.font = font(36, 700); g.fillStyle = "#C5F23A"; g.fillText(a.title, 170, y - 8); g.fillStyle = "#FFFFFF";
    const line = [a.uid && !a.boatId ? who(a.uid).displayName : "", awardText(a)].filter(Boolean).join(" · ");
    g.font = font(34, 500); g.fillText(clip(g, line, 820), 170, y + 36);
    y += 92;
  }
  g.textAlign = "center"; g.font = font(30, 600); g.fillStyle = "#D7ECEF";
  g.fillText("Track your bests. Settle the bet.", W / 2, H - 50);
  return c;
}
function clip(g, text, max) {
  let t = String(text);
  while (g.measureText(t).width > max && t.length > 2) t = t.slice(0, -2) + "…";
  return t;
}

async function shareRecap(s) {
  try {
    const blob = await new Promise(r => drawRecap(s).toBlob(r, "image/png"));
    const file = new File([blob], `lunker-league-${s.year}-season.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `${s.year} season` });
      return;
    }
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast("Recap picture saved.");
  } catch (e) {
    if (e && e.name === "AbortError") return; // closed the share menu
    toast("Couldn't make the recap picture.");
  }
}
export { drawRecap };
