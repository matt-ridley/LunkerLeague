/* Boat profiles: all the league's boats (#/boats), one boat (#/boat/{id}), and the add/edit sheet. */
import { el, fill, field, icon, avatar, fmtDay, fmtWeight, fmtLength, toast, confirmButton, openSheet, closeSheet } from "./ui.js";
import { store, uid, memberName, isAdmin, newFleetId, saveFleetBoat, deleteFleetBoat, loadFleetPhoto, cachedFleetPhoto } from "./cloud.js";
import { pickImage, tacklePhoto } from "./photos.js";
import { boatStats, boatCatches, boatOutings, MOTOR_BRANDS, MAX_HP, motorText, BOAT_SORTS, NO_BOAT_FILTERS, listBoats } from "./fleet.js";
import { isStringer } from "./stats.js";
import { catchCard } from "./catches.js";

const who = u => store.members.get(u) || { id: u, displayName: memberName(u) };
export const boatThumb = (b, cls = "box-thumb") => b.thumb ? el("img", { class: cls, src: b.thumb, alt: "", loading: "lazy" }) : el("span", { class: `${cls} empty`, text: "🚤" });
const sizeOf = c => (isStringer(c) ? `stringer of ${c.fishCount}` : [fmtWeight(c.weightOz), fmtLength(c.lengthIn)].filter(Boolean).join(" · "));
let showRetired = false;
// The sort and filters, remembered for this visit.
const BOATS_KEY = "lunker-boats";
let boatFilters = { ...NO_BOAT_FILTERS };
try { boatFilters = { ...NO_BOAT_FILTERS, ...JSON.parse(sessionStorage.getItem(BOATS_KEY) || "{}") }; } catch {}

export function renderFleet(main) {
  const catches = [...store.catches.values()];
  const all = [...store.fleet.values()];
  const setF = changes => {
    boatFilters = { ...boatFilters, ...changes };
    try { sessionStorage.setItem(BOATS_KEY, JSON.stringify(boatFilters)); } catch {}
    renderFleet(main);
  };
  // Only the brands someone has; a brand that's gone from the fleet drops out of the filter.
  const brands = MOTOR_BRANDS.filter(m => all.some(b => b.motor === m));
  if (boatFilters.motor && !brands.includes(boatFilters.motor)) boatFilters.motor = "";
  const rows = all.filter(b => showRetired || !b.retired).map(b => ({ b, s: boatStats(b.id, catches) }));
  const boats = listBoats(rows, boatFilters, uid());
  const retiredN = all.filter(b => b.retired).length;
  const select = (key, pairs, label) => {
    const sel = el("select", { "aria-label": label, onchange: () => setF({ [key]: sel.value }) },
      ...pairs.map(([v, t]) => el("option", { value: v, text: t })));
    sel.value = boatFilters[key];
    return sel;
  };
  const filtered = boatFilters.whose !== "all" || boatFilters.motor;
  fill(main,
    el("h2", { class: "page-title", text: "🚤 Boats" }),
    el("button", { class: "btn primary", type: "button", text: "+ Add my boat", onclick: () => boatSheet() }),
    all.length ? el("div", { class: "stack-tight" },
      el("div", { class: "seg" }, ...[["all", "All boats"], ["mine", "My boats"]].map(([k, t]) =>
        el("button", { type: "button", "aria-pressed": String(boatFilters.whose === k), text: t, onclick: () => setF({ whose: k }) }))),
      el("div", { class: "boat-tools" },
        field("Sort", select("sort", BOAT_SORTS, "Sort boats")),
        field("Motor", select("motor", [["", "Any motor"], ...brands.map(m => [m, m])], "Motor brand")))) : null,
    boats.length ? el("div", { class: "card-list" }, ...boats.map(({ b, s }) => el("a", { class: "list-row" + (b.retired ? " retired" : ""), href: `#/boat/${b.id}` },
      boatThumb(b, "box-thumb small"),
      el("div", { class: "grow stack-tight" },
        el("b", { text: b.name }),
        el("span", { class: "muted small", text: [`${who(b.uid).displayName}'s`, motorText(b), b.retired ? "retired" : ""].filter(Boolean).join(" · ") })),
      el("span", { class: "list-row-n" }, el("b", { text: String(s.fish) }), el("small", { text: "fish" })))))
      : all.length && filtered ? el("div", { class: "card empty" }, el("p", { text: "No boats match." }),
          el("button", { class: "btn block", type: "button", text: "Show all boats", onclick: () => setF({ whose: "all", motor: "" }) }))
      : el("p", { class: "card empty", text: "No boats yet. Add yours, then pick it when you log a catch from it." }),
    retiredN ? el("button", { class: "btn quiet block", type: "button", text: showRetired ? "Hide retired boats" : `Show retired boats (${retiredN})`,
      onclick: () => { showRetired = !showRetired; renderFleet(main); } }) : null);
}

export function renderBoat(main, id) {
  const b = store.fleet.get(id);
  if (!b) return fill(main, el("div", { class: "card empty" }, el("p", { text: store.catchesLoaded ? "This boat has been deleted." : "Loading…" })));
  const mine = b.uid === uid();
  const catches = [...store.catches.values()];
  const s = boatStats(id, catches), list = boatCatches(id, catches), outings = boatOutings(id, store.trips, store.boats);
  const img = b.thumb ? el("img", { class: "box-photo", src: cachedFleetPhoto(id) || b.thumb, alt: b.name }) : null;
  if (img) loadFleetPhoto(id).then(src => { if (src) img.src = src; }).catch(() => {});
  const chip = u => el("a", { class: "person", href: `#/u/${u}` }, avatar(who(u), "xs"), el("span", { text: who(u).displayName }));
  fill(main,
    el("a", { class: "eyebrow back-link", href: "#/boats", text: "← Boats" }),
    img,
    el("h2", { class: "page-title", text: `🚤 ${b.name}` }),
    el("dl", { class: "facts card" },
      el("div", { class: "fact" }, el("dt", { text: "Captain" }), el("dd", {}, chip(b.uid))),
      motorText(b) ? el("div", { class: "fact" }, el("dt", { text: "Motor" }), el("dd", { text: motorText(b) })) : null,
      (b.crew || []).length ? el("div", { class: "fact" }, el("dt", { text: "Crew" }), el("dd", {}, el("div", { class: "people" }, ...b.crew.map(chip)))) : null,
      b.notes ? el("div", { class: "fact" }, el("dt", { text: "Notes" }), el("dd", { text: b.notes })) : null,
      el("div", { class: "fact" }, el("dt", { text: "Caught" }), el("dd", { text: s.fish ? `${s.fish} fish, ${s.species} species` : "Nothing yet" })),
      s.biggest ? el("div", { class: "fact" }, el("dt", { text: "Biggest" }), el("dd", {},
        el("a", { href: `#/c/${s.biggest.id}`, text: `${s.biggest.species}, ${sizeOf(s.biggest)}` }), ` by ${who(s.biggest.uid).displayName}`)) : null,
      s.anglers.length ? el("div", { class: "fact" }, el("dt", { text: "Top anglers" }), el("dd", { text: s.anglers.slice(0, 5).map(a => `${who(a.uid).displayName} (${a.fish})`).join(", ") })) : null,
      outings.length ? el("div", { class: "fact" }, el("dt", { text: "Outings" }), el("dd", {}, ...outings.slice(0, 5).flatMap((t, i) =>
        [i ? ", " : "", el("a", { href: `#/t/${t.id}`, text: `${t.title} (${fmtDay(t.at)})` })]))) : null,
      b.retired ? el("div", { class: "fact" }, el("dt", { text: "Retired" }), el("dd", { text: "Not offered when logging a catch." })) : null),
    mine ? el("div", { class: "row" },
      el("button", { class: "btn", type: "button", text: "Edit", onclick: () => boatSheet(b) }),
      el("button", { class: "btn", type: "button", text: b.retired ? "Bring back" : "Retire", onclick: () => {
        saveFleetBoat(id, { ...strip(b), retired: !b.retired }); toast(b.retired ? "Back in the fleet." : "Retired: its catches stay.");
      } }),
      confirmButton("Delete", "Tap again to delete", () => { deleteFleetBoat(b); location.hash = "#/boats"; toast("Boat deleted."); }))
      : isAdmin() ? confirmButton("Delete (admin)", "Tap again to delete", () => { deleteFleetBoat(b); location.hash = "#/boats"; }) : null,
    list.length ? el("h3", { text: "Catches from this boat" }) : null,
    list.length ? el("div", { class: "card-list" }, ...list.slice(0, 30).map(c => catchCard(c))) : null);
}

// The motor is only sent when it's set, so boats without one save the same as before.
const motorFields = (hp, motor) => ({ ...(hp ? { hp } : {}), ...(motor ? { motor } : {}) });
const strip = b => ({ name: b.name, crew: b.crew || [], notes: b.notes || "", retired: !!b.retired, ...motorFields(b.hp, b.motor) });

/* Add or edit a boat. */
export function boatSheet(b = null) {
  openSheet(box => {
    const st = { photo: undefined, crew: new Set(b ? b.crew || [] : []) };
    const name = el("input", { type: "text", maxlength: 40, autocapitalize: "words", "data-focus": "", placeholder: `e.g. ${who(uid()).displayName}'s Lund`, value: b ? b.name : "" });
    const notes = el("textarea", { rows: 2, maxlength: 200, placeholder: "Make, model, where it launches…" });
    const hp = el("input", { type: "number", inputmode: "numeric", min: 1, max: MAX_HP, step: 1, placeholder: "e.g. 150", value: b && b.hp ? b.hp : "" });
    const motor = el("select", {}, el("option", { value: "", text: "Pick a brand" }), ...MOTOR_BRANDS.map(m => el("option", { value: m, text: m })));
    motor.value = b && b.motor && MOTOR_BRANDS.includes(b.motor) ? b.motor : "";
    notes.value = b ? b.notes || "" : "";
    const others = [...store.members.values()].filter(m => m.id !== uid() && !m.suspended).sort((x, y) => x.displayName.localeCompare(y.displayName));
    const crew = el("div", { class: "stack-tight" }, ...others.map(m => {
      const box_ = el("input", { type: "checkbox", checked: st.crew.has(m.id), onchange: e => { e.target.checked ? st.crew.add(m.id) : st.crew.delete(m.id); } });
      return el("label", { class: "check" }, box_, avatar(m, "xs"), el("span", { text: m.displayName }));
    }));
    const photoBox = el("div", { class: "stack-tight" });
    const msg = el("p", { class: "msg", role: "status" });
    const drawPhoto = () => {
      const src = st.photo ? st.photo.thumb : st.photo === null ? null : b && b.thumb;
      fill(photoBox, src ? el("img", { class: "box-thumb big", src, alt: "Boat photo" }) : null,
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
      el("h2", { text: b ? "Edit boat" : "Add my boat" }),
      field("Boat name", name),
      el("div", { class: "field" }, el("span", { class: "field-label", text: "Photo (optional)" }), photoBox),
      el("div", { class: "field" }, el("span", { class: "field-label", text: "Regular crew" }), others.length ? crew : el("p", { class: "muted small", text: "Nobody else in the league yet." }),
        el("span", { class: "hint", text: "Crew can pick this boat when they log a catch. Anyone with a seat on it for an outing gets it filled in." })),
      el("div", { class: "boat-tools" }, field("Motor (optional)", motor), field("Horsepower", hp)),
      field("Notes (optional)", notes),
      msg,
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        el("button", { class: "btn primary", type: "submit", text: "Save" })));
    form.addEventListener("submit", e => {
      e.preventDefault();
      const n = name.value.replace(/\s+/g, " ").trim().slice(0, 40);
      if (!n) { msg.className = "msg err"; msg.textContent = "Give your boat a name."; return; }
      const h = hp.value.trim() ? Number(hp.value) : null;
      if (h !== null && !(Number.isInteger(h) && h > 0 && h <= MAX_HP)) { msg.className = "msg err"; msg.textContent = `Horsepower is a whole number from 1 to ${MAX_HP}.`; return; }
      const id = b ? b.id : newFleetId();
      saveFleetBoat(id, { name: n, crew: [...st.crew].slice(0, 20), notes: notes.value.trim().slice(0, 200), retired: b ? !!b.retired : false,
        ...motorFields(h, motor.value) }, st.photo);
      closeSheet(); toast(b ? "Boat saved." : "Boat added.");
      if (!b) location.hash = `#/boat/${id}`;
    });
    box.append(form);
  });
}
