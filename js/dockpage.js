/* The Dock (#/dock): the way in to the league's people, gear and water. Also its own pages: the anglers list
   (#/anglers) and everyone's tackle boxes (#/tackle). Boats, the map, best bite and stats have their own pages. */
import { el, fill, avatar, fmtDay } from "./ui.js";
import { store, uid } from "./cloud.js";
import { luckyLure } from "./tacklebox.js";
import { itemThumb } from "./tackleboxpage.js";
import { anglerRoster, tackleBoxes } from "./dock.js";

const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const active = () => [...store.members.values()].filter(m => !m.suspended);
// The map opens on whichever view it last showed; the Dock's tile always opens the league's.
const mapView = view => () => { try { sessionStorage.setItem("lunker-map-view", view); } catch {} };

export function renderDock(main) {
  const boats = [...store.fleet.values()].filter(b => !b.retired).length;
  const items = [...store.box.values()].filter(i => !i.retired).length;
  const tile = (href, emoji, title, sub, onclick = null) => el("a", { class: "dock-tile", href, onclick },
    el("span", { class: "dock-icon", "aria-hidden": "true", text: emoji }),
    el("b", { text: title }), el("span", { class: "muted small", text: sub }));
  fill(main,
    el("h2", { class: "page-title", text: "The Dock" }),
    el("h3", { class: "dock-head", text: "People and gear" }),
    el("div", { class: "dock-grid" },
      tile("#/anglers", "👥", "Anglers", plural(active().length, "angler")),
      tile("#/boats", "🚤", "Boats", boats ? plural(boats, "boat") : "Add yours"),
      tile("#/tackle", "🧰", "Tackle boxes", items ? `${plural(items, "item")} of tackle` : "Fill yours")),
    el("h3", { class: "dock-head", text: "On the water" }),
    el("div", { class: "dock-grid" },
      tile("#/map", "🗺️", "Map", "The league's shared spots", mapView("league")),
      tile("#/bite", "🎣", "Best bite", "The best times this week")),
    el("h3", { class: "dock-head", text: "You" }),
    el("div", { class: "dock-grid" },
      tile(`#/stats/${uid()}`, "📊", "Your stats", "What's working for you")));
}

export function renderAnglers(main) {
  if (!store.catchesLoaded) return fill(main, el("h2", { class: "page-title", text: "👥 Anglers" }), el("p", { class: "loading", text: "Loading…" }));
  const me = uid();
  const list = anglerRoster({ members: active(), catches: [...store.catches.values()] });
  fill(main,
    el("h2", { class: "page-title", text: "👥 Anglers" }),
    el("div", { class: "card-list" }, ...list.map(r => el("a", { class: "list-row" + (r.member.id === me ? " me" : ""), href: `#/u/${r.member.id}` },
      avatar(r.member.id === me ? { ...r.member, ...store.me } : r.member),
      el("div", { class: "grow stack-tight" },
        el("b", { text: r.member.id === me ? `${r.member.displayName} (you)` : r.member.displayName }),
        el("span", { class: "muted small", text: r.lastAt ? `Last fish ${fmtDay(r.lastAt)}` : "No fish yet" })),
      el("span", { class: "list-row-n" }, el("b", { text: String(r.ytdFish) }), el("small", { text: "fish this year" }))))));
}

export function renderTackleBoxes(main) {
  const me = uid();
  fill(main,
    el("h2", { class: "page-title", text: "🧰 Tackle boxes" }),
    el("div", { class: "card-list" }, ...tackleBoxes({ members: active(), items: store.box, me }).map(({ member: m, items }) => {
      const lucky = items ? luckyLure(m.id, m.luckyLure, store.box, store.catches, store.tackle) : null;
      return el("a", { class: "list-row" + (m.id === me ? " me" : ""), href: `#/box/${m.id}` },
        avatar(m.id === me ? { ...m, ...store.me } : m),
        el("div", { class: "grow stack-tight" },
          el("b", { text: m.id === me ? "Your tackle box" : `${m.displayName}'s tackle box` }),
          lucky ? el("span", { class: "small lucky-line" }, "🍀 ", itemThumb(lucky.item, "box-thumb tiny"), lucky.item.name)
            : el("span", { class: "muted small", text: items ? "No lucky lure yet" : "Empty" })),
        el("span", { class: "list-row-n" }, el("b", { text: String(items) }), el("small", { text: items === 1 ? "item" : "items" })));
    })));
}
