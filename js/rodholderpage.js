/* The rod holder pages: an angler's rods and reels (#/rods/{uid}), one rod (#/rod/{id}), one reel (#/reel/{id}), and
   the add/edit sheets (also used by "+ New" on the log form). */
import { el, fill, field, icon, avatar, fmtDay, fmtWeight, fmtLength, toast, confirmButton, openSheet, closeSheet } from "./ui.js";
import { store, uid, memberName, isAdmin, newGearId, saveGear, updateGear, deleteGear, loadGearPhoto, cachedGearPhoto } from "./cloud.js";
import { pickImage, tacklePhoto } from "./photos.js";
import { isStringer } from "./stats.js";
import { catchCard } from "./catches.js";
import { rodHolders } from "./dock.js";
import { ROD_TYPES, REEL_TYPES, POWERS, ACTIONS, MAX_NAME, MAX_NOTES, MAX_SIZE, MAX_LINE, isRod, isReel, active, parseLength,
  fmtLength as rodLength, rodLine, reelLine, reelTypeName, currentReel, rodSpells, reelSpells, rodOf, mountChanges, endRod, endReelChanges,
  gearCatches, gearStats, luckyCombo, daysInService, lineDays } from "./rodholder.js";

let showEnded = false;
const sizeOf = c => (isStringer(c) ? `stringer of ${c.fishCount}` : [fmtWeight(c.weightOz), fmtLength(c.lengthIn)].filter(Boolean).join(" · "));
const fishWord = n => `${n} fish`;
const href = g => `#/${isRod(g) ? "rod" : "reel"}/${g.id}`;
const reelSpecs = r => [reelTypeName(r.type), r.size || ""].filter(Boolean).join(" · ");
const serviceText = d => (d === 0 ? "on its first day" : `after ${d} day${d === 1 ? "" : "s"} of service`);
const endedWord = g => (g.status === "broken" ? "broke" : g.status === "worn" ? "worn out" : "retired");

/* A thumbnail, or a placeholder when it has no photo. */
export const gearThumb = (g, cls = "box-thumb") => g && g.thumb
  ? el("img", { class: cls, src: g.thumb, alt: "", loading: "lazy" })
  : el("span", { class: `${cls} empty`, text: g && isReel(g) ? "⚙️" : "🎣" });

/* "Ugly Stik + Stradic 2500", or the rod alone. */
export const comboName = (rod, reel) => (reel ? `${rod.name} + ${reel.name}` : rod.name);

/* The rod and reel a catch was caught on, for the catch page (null when it had none, or they've been deleted). */
export function gearView(t) {
  const rod = t && t.rodId && store.gear.get(t.rodId), reel = t && t.reelId && store.gear.get(t.reelId);
  if (!rod && !reel) return null;
  return el("span", { class: "stack-tight" },
    rod ? el("a", { href: href(rod), class: "tackle-link" }, gearThumb(rod, "box-thumb tiny"), `Rod: ${rod.name}`, rod.status === "broken" ? " 💔" : "") : null,
    reel ? el("a", { href: href(reel), class: "tackle-link" }, gearThumb(reel, "box-thumb tiny"), `Reel: ${reel.name}`) : null);
}

/* Everyone's rod holder (#/rodholders), with their lucky combo. */
export function renderRodHolders(main) {
  const me = uid();
  const members = [...store.members.values()].filter(m => !m.suspended);
  fill(main,
    el("h2", { class: "page-title", text: "🎣 Rod holders" }),
    el("div", { class: "card-list" }, ...rodHolders({ members, gear: store.gear, me }).map(({ member: m, rods, reels }) => {
      const lucky = rods ? luckyCombo(m.id, store.gear, store.catches, store.tackle) : null;
      return el("a", { class: "list-row" + (m.id === me ? " me" : ""), href: `#/rods/${m.id}` },
        avatar(m.id === me ? { ...m, ...store.me } : m),
        el("div", { class: "grow stack-tight" },
          el("b", { text: m.id === me ? "Your rod holder" : `${m.displayName}'s rod holder` }),
          lucky ? el("span", { class: "small lucky-line" }, "🍀 ", gearThumb(lucky.rod, "box-thumb tiny"), comboName(lucky.rod, lucky.reel))
            : el("span", { class: "muted small", text: rods || reels ? `${reels} reel${reels === 1 ? "" : "s"}` : "Empty" })),
        el("span", { class: "list-row-n" }, el("b", { text: String(rods) }), el("small", { text: rods === 1 ? "rod" : "rods" })));
    })));
}

export function renderRods(main, id = uid()) {
  const mine = id === uid();
  const m = mine ? { ...store.me, id } : store.members.get(id);
  if (!m) return fill(main, el("div", { class: "card" }, el("p", { text: "That member isn't in the league any more." })));
  const all = [...store.gear.values()].filter(g => g.uid === id).sort((a, b) => a.name.localeCompare(b.name));
  const rods = all.filter(g => isRod(g) && active(g));
  const spares = all.filter(g => isReel(g) && active(g) && !rodOf(g.id, store.gear));
  const done = all.filter(g => !active(g));
  const lucky = luckyCombo(id, store.gear, store.catches, store.tackle);
  const fishOn = g => gearStats(gearCatches(isRod(g) ? "rodId" : "reelId", g.id, store.catches, store.tackle)).fish;
  const card = (g, sub) => {
    const n = fishOn(g);
    return el("a", { class: "box-item" + (active(g) ? "" : " retired"), href: href(g) },
      gearThumb(g),
      el("b", { text: `${g.status === "broken" ? "💔 " : ""}${g.name}` }),
      el("span", { class: "muted small", text: [sub, n ? fishWord(n) : ""].filter(Boolean).join(" · ") }));
  };
  fill(main,
    el("h2", { class: "page-title", text: mine ? "🎣 Your rod holder" : `🎣 ${m.displayName}'s rod holder` }),
    mine ? el("div", { class: "row" },
      el("button", { class: "btn primary", type: "button", text: "+ Add rod", onclick: () => gearSheet("rod") }),
      el("button", { class: "btn", type: "button", text: "+ Add reel", onclick: () => gearSheet("reel") })) : null,
    lucky ? el("p", { class: "card" }, "🍀 Lucky combo: ", el("a", { href: href(lucky.rod), text: comboName(lucky.rod, lucky.reel) }), ` (${fishWord(lucky.fish)})`) : null,
    el("h3", { text: "Rods" }),
    rods.length
      ? el("div", { class: "box-grid" }, ...rods.map(r => { const reel = store.gear.get(currentReel(r)); return card(r, reel ? `+ ${reel.name}` : "No reel"); }))
      : el("p", { class: "card empty", text: all.some(isRod) ? "No rods in use right now." : mine ? "No rods yet. Add your rods and reels, put a reel on each rod, and pick the combo when you log a catch." : "No rods yet." }),
    spares.length ? el("h3", { text: "Spare reels" }) : null,
    spares.length ? el("div", { class: "box-grid" }, ...spares.map(r => card(r, reelLine(r) || "Not on a rod"))) : null,
    done.length ? el("button", { class: "btn quiet block", type: "button", text: showEnded ? "Hide broken and retired" : `Show broken and retired (${done.length})`,
      onclick: () => { showEnded = !showEnded; renderRods(main, id); } }) : null,
    done.length && showEnded ? el("div", { class: "box-grid" }, ...done.map(g => card(g, `${endedWord(g)}${g.endedAt ? ` ${fmtDay(g.endedAt)}` : ""}`))) : null);
}

/* The facts both pages show about what it has caught. */
function caughtFacts(s) {
  return [
    el("div", { class: "fact" }, el("dt", { text: "Caught" }), el("dd", { text: s.fish
      ? `${fishWord(s.fish)}: ${s.species.map(([sp, n]) => `${sp} (${n})`).join(", ")}` : "Nothing yet" })),
    s.best ? el("div", { class: "fact" }, el("dt", { text: "Best fish" }), el("dd", {}, el("a", { href: `#/c/${s.best.id}`, text: `${s.best.species}, ${sizeOf(s.best)}` }))) : null,
  ];
}

const photoOf = g => {
  const img = g.thumb ? el("img", { class: "box-photo", src: cachedGearPhoto(g.id) || g.thumb, alt: g.name }) : null;
  if (img) loadGearPhoto(g.id).then(src => { if (src) img.src = src; }).catch(() => {});
  return img;
};
const missing = () => el("div", { class: "card empty" }, el("p", { text: store.catchesLoaded ? "This has been deleted." : "Loading…" }));
const backLink = g => el("a", { class: "eyebrow back-link", href: `#/rods/${g.uid}`, text: `← ${g.uid === uid() ? "Your" : `${memberName(g.uid)}'s`} rod holder` });
const spellText = s => (s.to == null ? `since ${fmtDay(s.from)}` : `${fmtDay(s.from)} to ${fmtDay(s.to)}`);

export function renderRod(main, id) {
  const r = store.gear.get(id);
  if (!isRod(r)) return fill(main, missing());
  const mine = r.uid === uid();
  const list = gearCatches("rodId", id, store.catches, store.tackle), s = gearStats(list);
  const reel = store.gear.get(currentReel(r));
  const spells = rodSpells(r).reverse();
  const now = Date.now();
  fill(main,
    backLink(r),
    photoOf(r),
    el("h2", { class: "page-title", text: `${r.status === "broken" ? "💔" : "🎣"} ${r.name}` }),
    r.status === "broken" ? el("section", { class: "card stack memorial" },
      el("h3", { text: "In memoriam" }),
      el("p", { text: `Broke on ${fmtDay(r.endedAt)}, ${serviceText(daysInService(r, list))}, with ${fishWord(s.fish)} to its name.` }),
      s.best ? el("p", {}, "Its best: ", el("a", { href: `#/c/${s.best.id}`, text: `${s.best.species}, ${sizeOf(s.best)}` }), ".") : null,
      el("p", { class: "muted small", text: "Tight lines, old friend." })) : null,
    el("dl", { class: "facts card" },
      rodLine(r) ? el("div", { class: "fact" }, el("dt", { text: "Specs" }), el("dd", { text: rodLine(r) })) : null,
      active(r) ? el("div", { class: "fact" }, el("dt", { text: "Reel" }), el("dd", {},
        reel ? el("a", { href: href(reel), class: "tackle-link" }, gearThumb(reel, "box-thumb tiny"), reel.name) : "No reel on it")) : null,
      spells.length ? el("div", { class: "fact" }, el("dt", { text: "Reels it's had" }), el("dd", {}, el("div", { class: "stack-tight" },
        ...spells.map(sp => { const g = store.gear.get(sp.reelId);
          return el("div", {}, g ? el("a", { href: href(g), text: g.name }) : "A deleted reel", el("span", { class: "muted small", text: ` ${spellText(sp)}` })); })))) : null,
      r.notes ? el("div", { class: "fact" }, el("dt", { text: "Notes" }), el("dd", { text: r.notes })) : null,
      ...caughtFacts(s),
      r.status === "retired" ? el("div", { class: "fact" }, el("dt", { text: "Retired" }), el("dd", { text: `${fmtDay(r.endedAt)}. Not offered when logging a catch.` })) : null),
    mine ? el("div", { class: "row wrap" },
      active(r) ? el("button", { class: "btn primary", type: "button", text: reel ? "Swap reel" : "Put on a reel", onclick: () => reelPicker(r) }) : null,
      el("button", { class: "btn", type: "button", text: "Edit", onclick: () => gearSheet("rod", r) }),
      active(r) ? confirmButton("💔 It broke", "Tap again: it broke", () => {
        updateGear(new Map([[id, endRod(r, "broken", now)]]));
        toast(reel ? `Sorry for your loss. ${reel.name} is back on the shelf for another rod.` : "Sorry for your loss.");
      }, "btn") : null,
      el("button", { class: "btn", type: "button", text: active(r) ? "Retire" : "Bring back", onclick: () => {
        updateGear(new Map([[id, endRod(r, active(r) ? "retired" : "active", now)]]));
        toast(active(r) ? "Retired: its catches stay, and its reel is back on the shelf." : "Back in your rod holder. Put a reel on it.");
      } }),
      confirmButton("Delete", "Tap again to delete", () => { deleteGear(r); location.hash = `#/rods/${r.uid}`; toast("Deleted."); }))
      : isAdmin() ? confirmButton("Delete (admin)", "Tap again to delete", () => { deleteGear(r); location.hash = `#/rods/${r.uid}`; }) : null,
    el("p", { class: "hint", text: mine ? "Catches made on this rod (secret tackle is only counted on your phone)." : "Catches made on this rod that were shared with the league." }),
    list.length ? el("div", { class: "card-list" }, ...list.slice(0, 30).map(c => catchCard(c))) : null);
}

export function renderReel(main, id) {
  const r = store.gear.get(id);
  if (!isReel(r)) return fill(main, missing());
  const mine = r.uid === uid();
  const list = gearCatches("reelId", id, store.catches, store.tackle), s = gearStats(list);
  const on = rodOf(id, store.gear), spells = reelSpells(id, store.gear).reverse();
  const days = lineDays(r), now = Date.now();
  fill(main,
    backLink(r),
    photoOf(r),
    el("h2", { class: "page-title", text: `⚙️ ${r.name}` }),
    el("dl", { class: "facts card" },
      reelSpecs(r) ? el("div", { class: "fact" }, el("dt", { text: "Specs" }), el("dd", { text: reelSpecs(r) })) : null,
      r.line ? el("div", { class: "fact" }, el("dt", { text: "Line" }), el("dd", { text: `${r.line}${r.lineAt ? `, spooled ${fmtDay(r.lineAt)} (${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`})` : ""}` })) : null,
      active(r) ? el("div", { class: "fact" }, el("dt", { text: "On" }), el("dd", {},
        on ? el("a", { href: href(on), class: "tackle-link" }, gearThumb(on, "box-thumb tiny"), on.name) : "Nothing: it's a spare")) : null,
      spells.length ? el("div", { class: "fact" }, el("dt", { text: "Rods it's been on" }), el("dd", {}, el("div", { class: "stack-tight" },
        ...spells.map(sp => el("div", {}, el("a", { href: href(sp.rod), text: `${sp.rod.status === "broken" ? "💔 " : ""}${sp.rod.name}` }),
          el("span", { class: "muted small", text: ` ${spellText(sp)}` })))))) : null,
      r.notes ? el("div", { class: "fact" }, el("dt", { text: "Notes" }), el("dd", { text: r.notes })) : null,
      ...caughtFacts(s),
      !active(r) ? el("div", { class: "fact" }, el("dt", { text: r.status === "worn" ? "Worn out" : "Retired" }),
        el("dd", { text: `${fmtDay(r.endedAt)}. Not offered when logging a catch.` })) : null),
    mine ? el("div", { class: "row wrap" },
      active(r) ? el("button", { class: "btn primary", type: "button", text: on ? "Move to another rod" : "Put on a rod", onclick: () => rodPicker(r) }) : null,
      active(r) ? el("button", { class: "btn", type: "button", text: "Respooled", onclick: () => lineSheet(r) }) : null,
      el("button", { class: "btn", type: "button", text: "Edit", onclick: () => gearSheet("reel", r) }),
      active(r) ? confirmButton("🪫 Worn out", "Tap again: worn out", () => endReel(r, "worn", now), "btn") : null,
      el("button", { class: "btn", type: "button", text: active(r) ? "Retire" : "Bring back", onclick: () => {
        if (active(r)) return endReel(r, "retired", now);
        updateGear(new Map([[id, { status: "active", endedAt: null }]]));
        toast("Back in your rod holder.");
      } }),
      confirmButton("Delete", "Tap again to delete", () => { deleteGear(r, endReelChanges(id, store.gear, now)); location.hash = `#/rods/${r.uid}`; toast("Deleted."); }))
      : isAdmin() ? confirmButton("Delete (admin)", "Tap again to delete", () => { deleteGear(r); location.hash = `#/rods/${r.uid}`; }) : null,
    el("p", { class: "hint", text: mine ? "Catches made with this reel (secret tackle is only counted on your phone)." : "Catches made with this reel that were shared with the league." }),
    list.length ? el("div", { class: "card-list" }, ...list.slice(0, 30).map(c => catchCard(c))) : null);
}

/* A reel wearing out or being retired: it comes off its rod. */
function endReel(r, status, now) {
  const changes = new Map([...endReelChanges(r.id, store.gear, now)].map(([rid, reels]) => [rid, { reels }]));
  changes.set(r.id, { status, endedAt: now });
  updateGear(changes);
  toast(status === "worn" ? "Worn out: its catches stay, and its rod is free for a new reel." : "Retired: its catches stay.");
}
/* Saves rods' new reels lists (from mountChanges). */
const mount = (rodId, reelId) => {
  const ch = mountChanges(rodId, reelId, store.gear, Date.now());
  if (ch.size) updateGear(new Map([...ch].map(([rid, reels]) => [rid, { reels }])));
};

/* Picks the reel for a rod: one of your reels in use (a reel on another rod moves over), a new one, or none. */
function reelPicker(rod) {
  const now = currentReel(rod);
  const reels = [...store.gear.values()].filter(g => isReel(g) && g.uid === uid() && active(g)).sort((a, b) => a.name.localeCompare(b.name));
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: `Reel for ${rod.name}` }),
    reels.length ? el("div", { class: "card-list" }, ...reels.map(r => {
      const on = rodOf(r.id, store.gear);
      return el("button", { class: "list-row", type: "button", "aria-pressed": String(r.id === now), onclick: () => {
        closeSheet(); if (r.id === now) return;
        mount(rod.id, r.id); toast(on ? `${r.name} moved over from ${on.name}.` : `${r.name} is on ${rod.name}.`);
      } }, gearThumb(r, "box-thumb small"), el("div", { class: "grow stack-tight" }, el("b", { text: r.name }),
        el("span", { class: "muted small", text: r.id === now ? "On it now" : on ? `On ${on.name}` : "Spare" })));
    })) : el("p", { class: "muted", text: "You haven't added any reels yet." }),
    el("div", { class: "row" },
      el("button", { class: "btn", type: "button", text: "+ New reel", onclick: async () => {
        closeSheet();
        const r = await gearSheet("reel");
        if (r) mount(rod.id, r.id);
      } }),
      now ? el("button", { class: "btn quiet", type: "button", text: "Take the reel off", onclick: () => { closeSheet(); mount(rod.id, null); toast("Reel's back on the shelf."); } }) : null,
      el("button", { class: "btn quiet", type: "button", text: "Cancel", onclick: closeSheet })))));
}

/* Picks the rod for a reel. */
function rodPicker(reel) {
  const on = rodOf(reel.id, store.gear);
  const rods = [...store.gear.values()].filter(g => isRod(g) && g.uid === uid() && active(g)).sort((a, b) => a.name.localeCompare(b.name));
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: `Put ${reel.name} on…` }),
    rods.length ? el("div", { class: "card-list" }, ...rods.map(r => {
      const has = store.gear.get(currentReel(r));
      return el("button", { class: "list-row", type: "button", "aria-pressed": String(on && on.id === r.id), onclick: () => {
        closeSheet(); if (on && on.id === r.id) return;
        mount(r.id, reel.id); toast(has ? `${reel.name} is on ${r.name}. ${has.name} is back on the shelf.` : `${reel.name} is on ${r.name}.`);
      } }, gearThumb(r, "box-thumb small"), el("div", { class: "grow stack-tight" }, el("b", { text: r.name }),
        el("span", { class: "muted small", text: has ? (has.id === reel.id ? "On it now" : `Has ${has.name}`) : "No reel" })));
    })) : el("p", { class: "muted", text: "You haven't added any rods yet." }),
    el("div", { class: "row" },
      on ? el("button", { class: "btn quiet", type: "button", text: "Take it off", onclick: () => { closeSheet(); mount(on.id, null); toast("Reel's back on the shelf."); } }) : null,
      el("button", { class: "btn quiet", type: "button", text: "Cancel", onclick: closeSheet })))));
}

/* New line on a reel: what it is, and today as when it was spooled. */
function lineSheet(reel) {
  openSheet(box => {
    const line = el("input", { type: "text", maxlength: MAX_LINE, "data-focus": "", placeholder: "e.g. 10 lb braid, 8 lb fluoro leader", value: reel.line || "" });
    const form = el("form", { class: "stack" },
      el("h2", { text: "New line" }),
      field("Line", line),
      el("p", { class: "hint", text: "Saves today as when it was spooled." }),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        el("button", { class: "btn primary", type: "submit", text: "Save" })));
    form.addEventListener("submit", e => {
      e.preventDefault();
      updateGear(new Map([[reel.id, { line: line.value.replace(/\s+/g, " ").trim().slice(0, MAX_LINE), lineAt: Date.now() }]]));
      closeSheet(); toast("Fresh line. Tight lines!");
    });
    box.append(form);
  });
}

/* The saved fields of a rod or reel (whatever the sheet doesn't change is kept). */
const strip = (kind, g = {}) => kind === "rod"
  ? { kind, name: g.name, type: g.type || "", lengthIn: g.lengthIn || null, power: g.power || "", action: g.action || "", notes: g.notes || "",
      status: g.status || "active", endedAt: g.endedAt || null, reels: g.reels || [] }
  : { kind, name: g.name, type: g.type || "", size: g.size || "", line: g.line || "", lineAt: g.lineAt || null, notes: g.notes || "",
      status: g.status || "active", endedAt: g.endedAt || null };

const select = (label, list, value) => {
  const s = el("select", { "aria-label": label }, el("option", { value: "", text: "—" }), ...list.map(([v, t]) => el("option", { value: v, text: t })));
  s.value = value || "";
  return s;
};

/* Add or edit a rod or reel. Resolves with the saved one ({ id, kind, name, … }) once saved, or null if cancelled.
   A rod can have its reel picked here too. */
export function gearSheet(kind, g = null, { name: startName = "" } = {}) {
  const rod = kind === "rod";
  return new Promise(resolve => {
    let saved = null;
    openSheet(box => {
      const st = { photo: undefined }; // undefined: unchanged; null: removed; { full, thumb }: new
      const name = el("input", { type: "text", maxlength: MAX_NAME, autocapitalize: "words", "data-focus": "",
        placeholder: rod ? "e.g. Ugly Stik GX2 6'6\" ML" : "e.g. Shimano Stradic 2500", value: g ? g.name : startName });
      const type = select("Type", rod ? ROD_TYPES : REEL_TYPES, g && g.type);
      const length = el("input", { type: "text", placeholder: "e.g. 6'6", "aria-label": "Length", value: g && g.lengthIn ? rodLength(g.lengthIn) : "" });
      const power = select("Power", POWERS, g && g.power), action = select("Action", ACTIONS, g && g.action);
      const myReels = [...store.gear.values()].filter(x => isReel(x) && x.uid === uid() && active(x)).sort((a, b) => a.name.localeCompare(b.name));
      const reelSel = el("select", { "aria-label": "Reel on it" }, el("option", { value: "", text: "No reel" }),
        ...myReels.map(r => { const on = rodOf(r.id, store.gear); return el("option", { value: r.id, text: on && (!g || on.id !== g.id) ? `${r.name} (now on ${on.name})` : r.name }); }));
      reelSel.value = g ? currentReel(g) || "" : "";
      const size = el("input", { type: "text", maxlength: MAX_SIZE, placeholder: "e.g. 2500", value: g ? g.size || "" : "" });
      const line = el("input", { type: "text", maxlength: MAX_LINE, placeholder: "e.g. 10 lb braid", value: g ? g.line || "" : "" });
      const notes = el("textarea", { rows: 2, maxlength: MAX_NOTES, placeholder: rod ? "Where you got it, what it's for…" : "Drag, bearings, what it's for…" });
      notes.value = g ? g.notes || "" : "";
      const photoBox = el("div", { class: "stack-tight" });
      const msg = el("p", { class: "msg", role: "status" });
      const drawPhoto = () => {
        const src = st.photo ? st.photo.thumb : st.photo === null ? null : g && g.thumb;
        fill(photoBox,
          src ? el("img", { class: "box-thumb big", src, alt: "Photo" }) : null,
          el("div", { class: "row" },
            el("button", { class: "btn small", type: "button", html: icon.camera, onclick: () => takePhoto(true) }, src ? "Retake" : "Camera"),
            el("button", { class: "btn small", type: "button", html: icon.image, onclick: () => takePhoto(false) }, "Gallery"),
            src ? el("button", { class: "btn small quiet", type: "button", text: "Remove", onclick: () => { st.photo = null; drawPhoto(); } }) : null));
      };
      const takePhoto = async camera => {
        const file = await pickImage({ camera });
        if (!file) return;
        msg.className = "msg ok"; msg.textContent = "Preparing photo…";
        try { st.photo = await tacklePhoto(file); msg.textContent = ""; drawPhoto(); }
        catch { msg.className = "msg err"; msg.textContent = "That file couldn't be opened as a photo. Try another."; }
      };
      drawPhoto();
      const form = el("form", { class: "stack" },
        el("h2", { text: `${g ? "Edit" : "Add"} ${rod ? "rod" : "reel"}` }),
        field("Name", name),
        field("Type", type),
        ...(rod ? [field("Length", length), field("Power", power), field("Action", action), active(g || {}) ? field("Reel on it", reelSel) : null]
          : [field("Size (optional)", size), field("Line (optional)", line)]),
        field("Notes (optional)", notes),
        el("div", { class: "field" }, el("span", { class: "field-label", text: "Photo (optional)" }), photoBox),
        el("p", { class: "hint", text: rod ? "Everyone in the league can see your rod holder. Pick the rod when you log a catch and its reel comes with it."
          : "Everyone in the league can see your rod holder. Put the reel on a rod to make a combo." }),
        msg,
        el("div", { class: "row" },
          el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
          el("button", { class: "btn primary", type: "submit", text: "Save" })));
      form.addEventListener("submit", e => {
        e.preventDefault();
        const fail = t => { msg.className = "msg err"; msg.textContent = t; };
        const n = name.value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
        if (!n) return fail("Give it a name.");
        const id = g ? g.id : newGearId(), now = Date.now();
        const data = strip(kind, g || {});
        Object.assign(data, { name: n, type: type.value, notes: notes.value.trim().slice(0, MAX_NOTES) });
        let rods = new Map();
        if (rod) {
          const len = parseLength(length.value);
          if (Number.isNaN(len)) return fail("Enter the length like 6'6 or 7 (feet), or leave it blank.");
          Object.assign(data, { lengthIn: len, power: power.value, action: action.value });
          if (active(data)) {
            const tmp = new Map(store.gear).set(id, { id, uid: uid(), ...data });
            rods = mountChanges(id, reelSel.value || null, tmp, now);
            if (rods.has(id)) data.reels = rods.get(id);
          }
        } else {
          const l = line.value.replace(/\s+/g, " ").trim().slice(0, MAX_LINE);
          // New line text counts as being respooled today.
          Object.assign(data, { size: size.value.trim().slice(0, MAX_SIZE), line: l, lineAt: l && l !== (g ? g.line || "" : "") ? now : l ? data.lineAt : null });
        }
        saveGear(id, data, st.photo, rods);
        saved = { id, uid: uid(), ...data, thumb: st.photo ? st.photo.thumb : st.photo === null ? null : g ? g.thumb ?? null : null, createdAt: g ? g.createdAt : now };
        closeSheet();
        toast(g ? "Saved." : `Added to your rod holder.`);
      });
      box.append(form);
    }, { onClose: () => resolve(saved) });
  });
}

