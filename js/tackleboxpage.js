/* The tackle box pages: an angler's box (#/box/{uid}), one item (#/ti/{id}), and the add/edit sheet (also used by
   "+ New" on the log form). */
import { el, fill, field, icon, toast, confirmButton, openSheet, closeSheet } from "./ui.js";
import { store, uid, memberName, isAdmin, newBoxItemId, saveBoxItem, deleteBoxItem, loadBoxPhoto, cachedBoxPhoto, fillBox } from "./cloud.js";
import { pickImage, tacklePhoto } from "./photos.js";
import { TECHNIQUES, parseDepth } from "./tackle.js";
import { TYPES, MAX_NAME, MAX_NOTES, itemLine, itemCatches, fillFromCatches } from "./tacklebox.js";
import { fishIn } from "./stats.js";
import { catchCard } from "./catches.js";

const fishWord = n => `${n} fish`;
let showRetired = false;

/* A thumbnail, or a placeholder when the item has no photo. */
export const itemThumb = (item, cls = "box-thumb") => item.thumb
  ? el("img", { class: cls, src: item.thumb, alt: "", loading: "lazy" })
  : el("span", { class: `${cls} empty`, text: "🎣" });

export function renderBox(main, id = uid()) {
  const mine = id === uid();
  const m = mine ? { ...store.me, id } : store.members.get(id);
  if (!m) return fill(main, el("div", { class: "card" }, el("p", { text: "That member isn't in the league any more." })));
  const all = [...store.box.values()].filter(i => i.uid === id);
  const items = all.filter(i => showRetired || !i.retired).sort((a, b) => !!a.retired - !!b.retired || a.name.localeCompare(b.name));
  const retiredN = all.filter(i => i.retired).length;
  const fill_ = mine ? fillFromCatches(id, store.box, store.catches, store.tackle) : { add: [], link: [] };
  const linkN = fill_.add.reduce((n, a) => n + a.catchIds.length, 0) + fill_.link.reduce((n, l) => n + l.catchIds.length, 0);
  fill(main,
    el("h2", { class: "page-title", text: mine ? "🧰 Your tackle box" : `🧰 ${m.displayName}'s tackle box` }),
    mine ? el("div", { class: "row" },
      el("button", { class: "btn primary", type: "button", text: "+ Add tackle", onclick: () => itemSheet() })) : null,
    mine && linkN ? el("section", { class: "card stack" },
      el("p", { text: fill_.add.length
        ? `You've typed ${fill_.add.length} lure${fill_.add.length === 1 ? "" : "s"} on your catches that aren't in your box yet.`
        : `${linkN} of your catches use tackle that's in your box but aren't linked to it.` }),
      el("button", { class: "btn block", type: "button", text: fill_.add.length ? `Fill my box from my catches (${fill_.add.length})` : "Link my catches",
        onclick: async e => {
          e.target.disabled = true;
          try { await fillBox(fill_); toast(fill_.add.length ? "Tackle box filled. Add photos when you like." : "Catches linked."); }
          catch { e.target.disabled = false; toast(navigator.onLine ? "That didn't work. Try again." : "Needs signal."); }
        } }),
      el("p", { class: "hint", text: "Each lure becomes an item, with the technique and depth you use most. Spellings that only differ in capitals or punctuation go together." })) : null,
    items.length
      ? el("div", { class: "box-grid" }, ...items.map(i => {
          const n = itemCatches(i.id, store.catches, store.tackle).reduce((a, c) => a + fishIn(c), 0);
          return el("a", { class: "box-item" + (i.retired ? " retired" : ""), href: `#/ti/${i.id}` },
            itemThumb(i),
            el("b", { text: i.name }),
            el("span", { class: "muted small", text: [itemLine(i), n ? fishWord(n) : "", i.retired ? "retired" : ""].filter(Boolean).join(" · ") }));
        }))
      : el("p", { class: "card empty", text: mine ? "Your box is empty. Add the tackle you use, with a photo, and pick it when you log a catch." : "Nothing in this box yet." }),
    retiredN ? el("button", { class: "btn quiet block", type: "button", text: showRetired ? "Hide retired tackle" : `Show retired tackle (${retiredN})`,
      onclick: () => { showRetired = !showRetired; renderBox(main, id); } }) : null);
}

export function renderItem(main, id) {
  const i = store.box.get(id);
  if (!i) return fill(main, el("div", { class: "card empty" }, el("p", { text: store.catchesLoaded ? "This tackle has been deleted." : "Loading…" })));
  const mine = i.uid === uid();
  const catches = itemCatches(id, store.catches, store.tackle);
  const fish = catches.reduce((n, c) => n + fishIn(c), 0);
  const species = new Map();
  for (const c of catches) species.set(c.species, (species.get(c.species) || 0) + fishIn(c));
  const img = i.thumb ? el("img", { class: "box-photo", src: cachedBoxPhoto(id) || i.thumb, alt: i.name }) : null;
  if (img) loadBoxPhoto(id).then(src => { if (src) img.src = src; }).catch(() => {});
  fill(main,
    el("a", { class: "eyebrow back-link", href: `#/box/${i.uid}`, text: `← ${mine ? "Your" : `${memberName(i.uid)}'s`} tackle box` }),
    img,
    el("h2", { class: "page-title", text: i.name }),
    el("dl", { class: "facts card" },
      itemLine(i) ? el("div", { class: "fact" }, el("dt", { text: "Use" }), el("dd", { text: itemLine(i) })) : null,
      i.notes ? el("div", { class: "fact" }, el("dt", { text: "Notes" }), el("dd", { text: i.notes })) : null,
      el("div", { class: "fact" }, el("dt", { text: "Caught" }), el("dd", { text: fish
        ? `${fishWord(fish)}: ${[...species].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} (${n})`).join(", ")}` : "Nothing yet" })),
      i.retired ? el("div", { class: "fact" }, el("dt", { text: "Retired" }), el("dd", { text: "Not offered when logging a catch." })) : null),
    mine ? el("div", { class: "row" },
      el("button", { class: "btn", type: "button", text: "Edit", onclick: () => itemSheet(i) }),
      el("button", { class: "btn", type: "button", text: i.retired ? "Bring back" : "Retire", onclick: () => {
        saveBoxItem(id, strip(i, { retired: !i.retired }));
        toast(i.retired ? "Back in your box." : "Retired: it won't be offered when logging, and its catches stay.");
      } }),
      confirmButton("Delete", "Tap again to delete", () => { deleteBoxItem(i); location.hash = `#/box/${i.uid}`; toast("Deleted. Its catches keep the name."); }))
      : isAdmin() ? confirmButton("Delete (admin)", "Tap again to delete", () => { deleteBoxItem(i); location.hash = `#/box/${i.uid}`; }) : null,
    el("p", { class: "hint", text: mine ? "Catches made with this tackle (secret tackle is only counted on your phone)." : "Catches made with this tackle that were shared with the league." }),
    catches.length ? el("div", { class: "card-list" }, ...catches.slice(0, 30).map(c => catchCard(c))) : null);
}

/* The saved fields of an item, with changes. */
const strip = (i, changes = {}) => ({ name: i.name, type: i.type || "", technique: i.technique || "", depthFt: i.depthFt || null,
  notes: i.notes || "", retired: !!i.retired, ...changes });

/* Add or edit an item. Resolves with the saved item ({ id, name, … }) once saved, or null if cancelled. */
export function itemSheet(item = null, { name: startName = "" } = {}) {
  return new Promise(resolve => {
    let saved = null;
    openSheet(box => {
      const st = { photo: undefined }; // undefined: unchanged; null: removed; { full, thumb }: new
      const name = el("input", { type: "text", maxlength: MAX_NAME, autocapitalize: "sentences", "data-focus": "",
        placeholder: "e.g. Chartreuse jig, 1/4 oz", value: item ? item.name : startName });
      const type = el("select", { "aria-label": "Type" }, el("option", { value: "", text: "—" }), ...TYPES.map(([v, t]) => el("option", { value: v, text: t })));
      type.value = item ? item.type || "" : "";
      const technique = el("select", { "aria-label": "Usual technique" }, el("option", { value: "", text: "—" }), ...TECHNIQUES.map(([v, t]) => el("option", { value: v, text: t })));
      technique.value = item ? item.technique || "" : "";
      const depth = el("input", { type: "text", inputmode: "decimal", placeholder: "0", "aria-label": "Usual depth in feet", value: item && item.depthFt ? String(item.depthFt) : "" });
      const notes = el("textarea", { rows: 2, maxlength: MAX_NOTES, placeholder: "Colour, size, where you got it…" });
      notes.value = item ? item.notes || "" : "";
      const photoBox = el("div", { class: "stack-tight" });
      const msg = el("p", { class: "msg", role: "status" });
      const drawPhoto = () => {
        const src = st.photo ? st.photo.thumb : st.photo === null ? null : item && item.thumb;
        fill(photoBox,
          src ? el("img", { class: "box-thumb big", src, alt: "Tackle photo" }) : null,
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
        el("h2", { text: item ? "Edit tackle" : "Add tackle" }),
        field("Name", name),
        field("Type", type),
        field("Usual technique", technique),
        el("div", { class: "field" }, el("span", { class: "field-label", text: "Usual depth" }), el("div", { class: "unit-row" }, depth, el("span", { text: "ft" }))),
        field("Notes (optional)", notes),
        el("div", { class: "field" }, el("span", { class: "field-label", text: "Photo (optional)" }), photoBox),
        el("p", { class: "hint", text: "Everyone in the league can see your tackle box. Picking an item when you log a catch fills in its technique and depth." }),
        msg,
        el("div", { class: "row" },
          el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
          el("button", { class: "btn primary", type: "submit", text: "Save" })));
      form.addEventListener("submit", e => {
        e.preventDefault();
        const fail = t => { msg.className = "msg err"; msg.textContent = t; };
        const n = name.value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
        if (!n) return fail("Give it a name.");
        const d = parseDepth(depth.value);
        if (Number.isNaN(d)) return fail("Enter the depth in feet (up to 1000), or leave it blank.");
        const id = item ? item.id : newBoxItemId();
        const data = strip(item || {}, { name: n, type: type.value, technique: technique.value, depthFt: d, notes: notes.value.trim().slice(0, MAX_NOTES) });
        saveBoxItem(id, data, st.photo);
        saved = { id, uid: uid(), ...data, thumb: st.photo ? st.photo.thumb : st.photo === null ? null : item ? item.thumb ?? null : null, createdAt: item ? item.createdAt : Date.now() };
        closeSheet();
        toast(item ? "Tackle saved." : "Added to your tackle box.");
      });
      box.append(form);
    }, { onClose: () => resolve(saved) });
  });
}
