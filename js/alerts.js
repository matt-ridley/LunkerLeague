/* The bell: what's new for you (mentions, comments and reactions on your catches, records taken from you, badges,
   your derbies, trips, new catches), worked out from the league's data. This phone remembers when you last
   opened it, like the Chat badge. There are no push notifications: you see these when you open the app. */
import { el, fill, fmtAgo, icon } from "./ui.js";
import { store, uid, memberName, watchDerbyChat } from "./cloud.js";
import { alertsFor, unreadCount } from "./events.js";
import { derbyStatus } from "./derby.js";

const SEEN_KEY = "lunker-alerts-seen";
const WEEK = 7 * 24 * 3600 * 1000;
function getSeen() {
  try {
    const v = +localStorage.getItem(SEEN_KEY);
    if (v) return v;
    const start = Date.now() - WEEK; // first time on this phone: just the last week, not the whole history
    localStorage.setItem(SEEN_KEY, String(start));
    return start;
  } catch { return Date.now() - WEEK; }
}
const setSeen = t => { try { localStorage.setItem(SEEN_KEY, String(t)); } catch {} };

/* Mentions in a derby's chat only reach this phone when that chat is being listened to, so listen to the chats of
   derbies you're in while they're on. */
function watchMyDerbyChats() {
  for (const d of store.derbies.values()) {
    if ((store.entrants.get(d.id) || new Map()).has(uid()) && ["active", "closing"].includes(derbyStatus(d))) watchDerbyChat(d.id);
  }
}

function myAlerts(seen) {
  if (!store.catchesLoaded) return [];
  watchMyDerbyChats();
  const reactions = new Map([...store.reactions].map(([cid, byUser]) => [cid, new Map([...byUser].map(([u, emojis]) =>
    [u, { emojis, at: ((store.reactionTimes.get(cid) || new Map()).get(u)) || 0 }]))]));
  return alertsFor(uid(), {
    catches: [...store.catches.values()], derbies: store.derbies, entrants: store.entrants, comments: store.comments, reactions,
    chat: store.chat, derbyChat: store.derbyChat, trips: store.trips, rsvps: store.rsvps, name: memberName,
  }, { seen });
}

/* Cached per redraw: the header asks for the count on every render. */
let cache = { key: null, list: [] };
function cachedAlerts(seen) {
  const key = [store.catches, store.comments, store.reactions, store.chat, store.derbyChat.size, store.derbies, store.entrants, store.trips, store.rsvps, seen];
  if (!cache.key || key.some((k, i) => k !== cache.key[i])) cache = { key, list: myAlerts(seen) };
  return cache.list;
}

export const bellCount = () => unreadCount(cachedAlerts(getSeen()), getSeen());

/* What was "new" is fixed when the screen opens, so live redraws don't clear the highlights while you read. */
let visitSeen = 0;
export function renderAlerts(main) {
  const opening = !main.querySelector(".alerts-title");
  if (opening) visitSeen = getSeen();
  const seen = visitSeen, list = cachedAlerts(seen);
  fill(main,
    el("h2", { class: "page-title alerts-title", text: "What's new" }),
    !store.catchesLoaded ? el("p", { class: "loading", text: "Loading…" })
      : list.length ? el("ul", { class: "alert-list card" }, ...list.map(a => el("li", {},
          el("a", { class: "alert-row" + (a.at > seen ? " new" : ""), href: a.href },
            el("span", { class: "alert-icon", text: a.icon }),
            el("span", { class: "grow" }, el("span", { class: "alert-text", text: a.text }), el("span", { class: "muted small", text: fmtAgo(a.at) })),
            a.at > seen ? el("span", { class: "dot", "aria-label": "New" }) : null))))
      : el("div", { class: "card empty" }, el("div", { class: "empty-art", html: icon.bell }),
          el("p", { text: "Nothing new. When someone mentions you, comments on your catch, takes your record or plans a trip, it shows up here." })),
    el("p", { class: "hint", text: "There are no phone notifications: check here when you open the app." }));
  // Opening the bell marks everything as seen (still highlighted until you leave this screen). Later live redraws
  // only do so while the app is on screen, so alerts arriving while it sits in the background stay new.
  const newest = Math.max(Date.now(), ...list.map(a => a.at));
  if (store.catchesLoaded && (opening || !document.hidden)) setSeen(Math.max(getSeen(), newest));
}
