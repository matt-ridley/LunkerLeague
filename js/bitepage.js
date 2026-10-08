/* Best-bite times: the next 7 days at the league's home water (#/bite), and one day's times for an outing. */
import { el, fill, fmtDay, fmtClock } from "./ui.js";
import { store, isAdmin } from "./cloud.js";
import { biteTimes, nextPeriod } from "./solunar.js";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY = 86400000;
export const fishRating = n => "🐟".repeat(n);
const range = p => `${fmtClock(p.start)} – ${fmtClock(p.end)}`;

function noHome() {
  return el("section", { class: "card stack" },
    el("p", { text: "Best-bite times are worked out for the league's home water, and it hasn't been set yet." }),
    isAdmin() ? el("a", { class: "btn block", href: "#/admin", text: "Set the home water on League admin" })
      : el("p", { class: "hint", text: "Ask a league admin to set it on the League admin page." }));
}

/* One day's card. `window` ({ start, end }) highlights the periods during an outing. */
export function biteDay(b, { title, now = Date.now(), window = null } = {}) {
  const on = nextPeriod(b, now);
  const during = p => window && p.end > window.start && p.start < window.end;
  return el("section", { class: "card stack bite-day" },
    el("div", { class: "row spread" }, el("h3", { text: title }),
      el("span", { class: "bite-rating", title: `${b.ratingText} day`, text: `${fishRating(b.rating)} ${b.ratingText}` })),
    el("p", { class: "muted small", text: [b.sunrise && `🌅 Sunrise ${fmtClock(b.sunrise)}`, b.sunset && `🌇 Sunset ${fmtClock(b.sunset)}`,
      `${b.moon.emoji} ${b.moon.name} (${b.moon.lit}% lit)`].filter(Boolean).join(" · ") }),
    b.periods.length
      ? el("ul", { class: "bite-list" }, ...b.periods.map(p => el("li", {
          class: `bite-${p.kind}${on && on.now && on.period === p ? " now" : ""}${during(p) ? " during" : ""}` },
          el("span", { class: "chip", text: p.kind === "major" ? "Major" : "Minor" }),
          el("b", { text: range(p) }),
          el("span", { class: "muted small", text: `${p.why}${on && on.now && on.period === p ? " · on now" : ""}${during(p) ? " · during the outing" : ""}` }))))
      : el("p", { class: "muted", text: "No moon periods this day." }));
}

export function renderBite(main) {
  const home = store.league && store.league.home;
  const head = el("h2", { class: "page-title", text: "🎣 Best-bite times" });
  if (!home) return fill(main, head, noHome());
  const now = Date.now();
  const days = Array.from({ length: 7 }, (_, i) => biteTimes(now + i * DAY, home));
  fill(main, head,
    el("p", { class: "hint", text: `Solunar times for ${home.name || "the home water"}: fish tend to feed most in the major periods (the moon overhead or underfoot) and the minor ones (moonrise and moonset), and best near the new and full moon, especially when a period lines up with sunrise or sunset. Worked out on your phone, so they work with no signal.` }),
    ...days.map((b, i) => biteDay(b, { now, title: i === 0 ? "Today" : i === 1 ? "Tomorrow" : `${WEEKDAY[new Date(b.day).getDay()]} ${fmtDay(b.day)}` })));
}
