/* The storage meter: how much of the free plan the league uses. Shown on League admin and System info. */
import { el, fill } from "./ui.js";
import { store, photoStorage } from "./cloud.js";
import { estimateStorage, docsBytes, fmtBytes, FREE_BYTES } from "./storage.js";

/* Photo totals come from the server (once per app session, or on Refresh); the rest is measured on this phone. */
let photoTotals = null, photoErr = "";
export function storageMeter() {
  const box = el("section", { class: "card stack" }, el("h3", { text: "💾 Storage" }));
  const load = () => {
    photoErr = "";
    photoStorage().then(p => { photoTotals = p; draw(); })
      .catch(() => { photoErr = navigator.onLine ? "Couldn't check right now. Try again." : "Needs signal to check."; draw(); });
  };
  const draw = () => {
    const kids = [el("h3", { text: "💾 Storage" })];
    if (!photoTotals) {
      kids.push(el("p", { class: photoErr ? "msg err" : "muted", text: photoErr || "Checking…" }));
    } else {
      const docs = docsBytes(everyDoc()), e = estimateStorage({ photos: photoTotals, docs, catches: store.catches.size });
      const level = e.pct >= 90 ? "bad" : e.pct >= 75 ? "warn" : "ok";
      kids.push(
        el("div", { class: "meter", role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(e.pct), "aria-label": "Storage used" },
          el("span", { class: `meter-fill ${level}`, style: `width:${Math.max(1, e.pct)}%` })),
        el("p", {}, el("b", { text: `About ${fmtBytes(e.used)} of ${fmtBytes(FREE_BYTES)} used (${e.pct}%)` })),
        el("p", { text: e.catchesLeft ? `Room for about ${e.catchesLeft.toLocaleString()} more catches at about ${fmtBytes(e.perCatch)} each (photo included).` : "Full. New catches will be refused until space is freed." }),
        level !== "ok" ? el("p", { class: "msg err", text: "Getting full. Options: delete old test catches, or move to Firebase's Blaze plan (pennies a month at this size)." }) : null,
        el("p", { class: "hint", text: `${photoTotals.total.toLocaleString()} catch photos${photoTotals.tackleBytes ? `, tackle box and boat photos (${fmtBytes(photoTotals.tackleBytes)})` : ""}${photoTotals.coverN ? `, ${photoTotals.coverN.toLocaleString()} profile covers (${fmtBytes(photoTotals.coverBytes)})` : ""}. Firebase's free plan holds 1 GB. This is an estimate; the exact figure is in the Firebase console under Firestore → Usage.` }));
    }
    kids.push(el("button", { class: "btn small", type: "button", text: "Refresh", onclick: () => { photoTotals = null; draw(); load(); } }));
    fill(box, ...kids);
  };
  if (!photoTotals) load();
  draw();
  return box;
}

/* Everything else the league stores, from the copy on this phone (chat beyond the last 100 messages isn't on the
   phone, so it's slightly under-counted). */
function everyDoc() {
  const out = [...store.catches.values(), ...store.members.values(), ...store.derbies.values(), ...store.trips.values(),
    ...store.spots.values(), ...store.scoring, ...store.chat, ...store.box.values(), ...store.tackle.values(), ...store.weather.values()];
  for (const list of store.comments.values()) out.push(...list);
  for (const m of store.reactions.values()) for (const emojis of m.values()) out.push({ emojis, at: 0, uid: "" });
  for (const m of store.entrants.values()) for (const e of m.values()) out.push(e);
  for (const m of store.rsvps.values()) for (const r of m.values()) out.push(r);
  return out;
}
