/* Catches: logging and editing, the feed, a catch's own page, and the personal-best wall. */
import { el, field, avatar, fmtDate, fmtAgo, fmtWeight, fmtLength, toast, confirmButton, icon, openSheet, closeSheet, fill } from "./ui.js";
import { store, uid, memberName, isAdmin, newCatchId, saveCatch, deleteCatch, loadPhoto, cachedPhoto, retryRejected, discardRejected } from "./cloud.js";
import { pickImage, catchPhoto } from "./photos.js";
import { photoTakenAt } from "./exif.js";
import { SPECIES, normalizeSpecies } from "./species.js";
import { personalBests, isPersonalBest, checkNewPB, recordKinds, anglerStats } from "./stats.js";

const allCatches = () => [...store.catches.values()];
const byNewest = (a, b) => (b.caughtAt || 0) - (a.caughtAt || 0);
const sizeText = c => [fmtWeight(c.weightOz), fmtLength(c.lengthIn)].filter(Boolean).join(" · ");
const mapsUrl = s => `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(6)},${s.lng.toFixed(6)}`;

/* ---------- Cards ---------- */
export function catchCard(c, all = allCatches()) {
  const pb = isPersonalBest(c, all), rec = recordKinds(c, all);
  const m = store.members.get(c.uid) || { id: c.uid, displayName: memberName(c.uid) };
  return el("a", { class: "catch-card", href: `#/c/${c.id}` },
    el("img", { class: "thumb", src: c.thumb, alt: `${c.species} photo`, loading: "lazy" }),
    el("div", { class: "catch-info" },
      el("div", { class: "catch-species", text: c.species }),
      el("div", { class: "catch-size", text: sizeText(c) }),
      el("div", { class: "catch-who" }, avatar(m, "xs"), el("span", { text: `${m.displayName} · ${fmtAgo(c.caughtAt)}` })),
      el("div", { class: "badges" },
        rec.length ? el("span", { class: "badge record", text: "👑 League record" }) : null,
        pb ? el("span", { class: "badge pb", text: "PB" }) : null,
        c.released ? el("span", { class: "badge", text: "Released" }) : null,
        c.hasSpot ? el("span", { class: "badge", text: c.locShared ? "📍 Spot" : "🔒 Secret spot" }) : null,
        store.pending.has(c.id) ? el("span", { class: "badge wait", text: "⏳ Waiting for signal" }) : null)));
}

/* ---------- Feed ---------- */
let feedFilter = "all", feedLimit = 30;
export function renderFeed(main) {
  const all = allCatches();
  const me = uid(), stats = anglerStats(all, me), pbs = personalBests(all, me).size;
  const list = all.filter(c => feedFilter === "all" || c.uid === me).sort(byNewest);
  const hero = el("section", { class: "hero" },
    el("p", { class: "eyebrow", text: (store.league && store.league.name) || "Lunker League" }),
    el("h2", { text: `${store.me.displayName}, tight lines!` }),
    el("div", { class: "hero-stats" },
      stat(stats.catches, "catches"), stat(stats.species, "species"), stat(pbs, "PBs")),
    stats.catches ? null : el("a", { class: "btn lime block", href: "#/log", html: icon.plus }, "Log your first catch"));
  const seg = el("div", { class: "seg" }, ...[["all", "Everyone"], ["mine", "Mine"]].map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(feedFilter === k), text: label,
      onclick: () => { feedFilter = k; feedLimit = 30; renderFeed(main); } })));
  const cards = list.slice(0, feedLimit).map(c => catchCard(c, all));
  fill(main, hero, seg,
    !store.catchesLoaded ? el("p", { class: "loading", text: "Loading catches…" })
      : cards.length ? el("div", { class: "card-list" }, ...cards)
      : el("div", { class: "card empty" }, el("div", { class: "empty-art", html: icon.fish }),
          el("p", { text: feedFilter === "mine" ? "You haven't logged a catch yet." : "No catches yet. Be the first to put a fish on the board!" })),
    list.length > feedLimit ? el("button", { class: "btn block", type: "button", text: "Show more",
      onclick: () => { feedLimit += 30; renderFeed(main); } }) : null);
}
const stat = (n, label) => el("div", { class: "stat" }, el("b", { text: String(n) }), el("span", { text: label }));

/* ---------- One catch ---------- */
let celebrate = null; // { id, previous } after saving a new personal best

export function renderCatch(main, id) {
  const c = store.catches.get(id);
  if (!c) {
    return fill(main, el("div", { class: "card empty" },
      el("p", { text: store.catchesLoaded ? "This catch has been deleted." : "Loading…" })));
  }
  const all = allCatches(), mine = c.uid === uid();
  const m = store.members.get(c.uid) || { id: c.uid, displayName: memberName(c.uid) };
  const pb = isPersonalBest(c, all), rec = recordKinds(c, all), spot = store.spots.get(c.id);

  const img = el("img", { class: "catch-photo", src: cachedPhoto(c.id) || c.thumb, alt: `${c.species} caught by ${m.displayName}` });
  const note = el("p", { class: "photo-note hint" });
  const photoBox = el("button", { class: "photo-box", type: "button", "aria-label": "View photo full screen", onclick: () => viewer(img.src) }, img);
  loadPhoto(c.id).then(src => { if (src) img.src = src; })
    .catch(() => { note.textContent = "Showing a small copy. The full photo loads when you have signal."; });

  const parts = [];
  // Shown for a minute after saving, so it survives the redraw when the server confirms the catch.
  if (celebrate && celebrate.id === c.id && Date.now() - celebrate.at < 60000) {
    const prev = celebrate.previous;
    parts.push(el("section", { class: "celebrate" },
      el("div", { class: "celebrate-emoji", text: "🎉🐟🎉" }),
      el("h2", { text: prev ? "New personal best!" : `First ${c.species}!` }),
      el("p", { text: prev ? `Beats your old best of ${sizeText(prev)}.` : "That's your PB to beat." })));
  }
  parts.push(photoBox, note,
    el("section", { class: "catch-head" },
      el("h2", { text: c.species }),
      el("div", { class: "catch-size big", text: sizeText(c) }),
      el("div", { class: "badges" },
        rec.includes("weight") ? el("span", { class: "badge record", text: "👑 Heaviest in the league" }) : null,
        rec.includes("length") ? el("span", { class: "badge record", text: "👑 Longest in the league" }) : null,
        pb ? el("span", { class: "badge pb", text: `${mine ? "Your" : "Their"} PB` }) : null,
        store.pending.has(c.id) ? el("span", { class: "badge wait", text: "⏳ Waiting for signal" }) : null)),
    el("a", { class: "member-row card", href: `#/u/${c.uid}` }, avatar(m),
      el("div", { class: "grow" }, el("div", { class: "name", text: m.displayName }), el("div", { class: "muted small", text: "View profile" }))),
    el("dl", { class: "facts card" },
      fact("Caught", fmtDate(c.caughtAt)),
      c.photoTakenAt ? fact("Photo taken", fmtDate(c.photoTakenAt)) : null,
      fact("Weight", fmtWeight(c.weightOz) || "Not weighed"),
      fact("Length", fmtLength(c.lengthIn) || "Not measured"),
      fact("Released", c.released ? "Yes" : "No"),
      c.notes ? fact("Notes", c.notes) : null,
      fact("Spot", spotView(c, spot, mine))));

  if (mine || isAdmin()) {
    parts.push(el("div", { class: "row" },
      mine ? el("a", { class: "btn", href: `#/log/${c.id}`, text: "Edit" }) : null,
      confirmButton("Delete", "Tap again to delete", () => { deleteCatch(c); location.hash = "#/feed"; toast("Catch deleted."); })));
  }
  fill(main, ...parts);
}

const fact = (k, v) => el("div", { class: "fact" }, el("dt", { text: k }), el("dd", {}, v));

function spotView(c, spot, mine) {
  if (!c.hasSpot) return "Not tagged";
  if (!spot) return "🔒 Secret spot";
  const link = el("a", { href: mapsUrl(spot), target: "_blank", rel: "noopener", text: navigator.onLine ? "Open in Maps" : "Open in Maps (needs signal)" });
  return el("span", { class: "stack-tight" },
    el("span", { text: spot.shared ? `📍 ${spot.name || "Shared with the league"}` : `🔒 Private${mine ? ": only you can see it" : ""}${spot.name ? ` (${spot.name})` : ""}` }),
    link);
}

/* Full-screen photo; pinch to zoom in on the scale or measuring board. */
function viewer(src) {
  const box = el("div", { class: "viewer", role: "dialog", "aria-label": "Photo" },
    el("img", { src, alt: "" }),
    el("button", { class: "viewer-close", type: "button", text: "Close", onclick: () => box.remove() }));
  document.body.append(box);
}

/* ---------- Personal-best wall (profile) ---------- */
export function pbWall(memberId) {
  const all = allCatches();
  const pbs = [...personalBests(all, memberId).values()].sort((a, b) => a.species.localeCompare(b.species));
  const st = anglerStats(all, memberId);
  const recent = all.filter(c => c.uid === memberId).sort(byNewest).slice(0, 10);
  return [
    el("div", { class: "hero-stats plain" }, stat(st.catches, "catches"), stat(st.species, "species"),
      stat(all.filter(c => c.uid === memberId && recordKinds(c, all).length).length, "records")),
    el("section", { class: "stack" },
      el("h3", { text: "Personal bests" }),
      pbs.length ? el("div", { class: "pb-wall" }, ...pbs.map(c => el("a", { class: "pb-tile", href: `#/c/${c.id}` },
        el("img", { src: c.thumb, alt: "", loading: "lazy" }),
        el("div", { class: "pb-text" }, el("b", { text: c.species }), el("span", { text: sizeText(c) })))))
        : el("p", { class: "muted", text: "No catches yet." })),
    recent.length ? el("section", { class: "stack" }, el("h3", { text: "Recent catches" }),
      el("div", { class: "card-list" }, ...recent.map(c => catchCard(c, all)))) : null,
  ];
}

/* ---------- Log or edit a catch ---------- */
const pad = n => String(n).padStart(2, "0");
const toLocalInput = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const num = s => { const n = parseFloat(String(s).replace(",", ".")); return isFinite(n) ? n : 0; };

export function renderLog(main, editId) {
  const editing = editId ? store.catches.get(editId) : null;
  if (editId && (!editing || editing.uid !== uid())) {
    return fill(main, el("div", { class: "card" }, el("p", { text: "You can only edit your own catches." })));
  }
  const oldSpot = editing && store.spots.get(editing.id);
  const st = {
    full: null, thumb: editing ? editing.thumb : null, takenAt: editing ? editing.photoTakenAt || null : null,
    spot: oldSpot ? { lat: oldSpot.lat, lng: oldSpot.lng, acc: oldSpot.acc } : null,
    share: editing ? !!editing.locShared : false,
  };

  // Photo
  const preview = el("div", { class: "photo-pick" });
  const photoMsg = el("p", { class: "msg" });
  const drawPreview = () => fill(preview, st.thumb
    ? el("img", { src: st.thumb, alt: "Catch photo" })
    : el("div", { class: "photo-empty" }, el("span", { html: icon.camera }), el("span", { text: "Add a photo of your catch" })));
  const takePhoto = async camera => {
    const file = await pickImage({ camera });
    if (!file) return;
    photoMsg.className = "msg ok"; photoMsg.textContent = "Preparing photo…";
    try {
      const [p, t] = await Promise.all([catchPhoto(file), photoTakenAt(file)]);
      st.full = p.full; st.thumb = p.thumb; st.takenAt = t;
      photoMsg.textContent = "";
      drawPreview(); drawTimeHint();
    } catch {
      photoMsg.className = "msg err"; photoMsg.textContent = "That file couldn't be opened as a photo. Try another.";
    }
  };
  drawPreview();

  // Fields
  const species = el("input", { type: "text", list: "species-list", autocapitalize: "words", autocomplete: "off", maxlength: 40,
    placeholder: "e.g. Walleye", value: editing ? editing.species : "" });
  const datalist = el("datalist", { id: "species-list" }, ...SPECIES.map(s => el("option", { value: s })));
  const w = editing && editing.weightOz ? editing.weightOz : 0;
  const lb = el("input", { type: "text", inputmode: "numeric", placeholder: "0", "aria-label": "Pounds", value: w ? String(Math.floor(w / 16)) : "" });
  const oz = el("input", { type: "text", inputmode: "decimal", placeholder: "0", "aria-label": "Ounces", value: w ? String(Math.round((w % 16) * 10) / 10) : "" });
  const L = editing && editing.lengthIn ? editing.lengthIn : 0;
  const inches = el("input", { type: "text", inputmode: "numeric", placeholder: "0", "aria-label": "Inches", value: L ? String(Math.floor(L)) : "" });
  const frac = el("select", { "aria-label": "Fraction of an inch" },
    ...[["0", "—"], ["0.25", "¼"], ["0.5", "½"], ["0.75", "¾"]].map(([v, t]) => el("option", { value: v, text: t })));
  frac.value = L ? String(Math.round((L % 1) * 4) / 4) : "0";
  const when = el("input", { type: "datetime-local", value: toLocalInput(editing ? editing.caughtAt : Date.now()), max: toLocalInput(Date.now() + 600000) });
  const timeHint = el("div");
  const drawTimeHint = () => fill(timeHint, st.takenAt
    ? el("button", { class: "btn small quiet", type: "button", text: `Use photo time: ${fmtDate(st.takenAt)}`, onclick: () => { when.value = toLocalInput(st.takenAt); } })
    : "");
  drawTimeHint();
  const released = el("input", { type: "checkbox", checked: editing ? !!editing.released : false });
  const notes = el("textarea", { rows: 3, maxlength: 500, placeholder: "Lure, depth, weather, the one that got away…" });
  notes.value = editing ? editing.notes || "" : "";

  // Spot
  const spotName = el("input", { type: "text", maxlength: 60, autocapitalize: "words", placeholder: "e.g. North bay, by the reeds",
    value: editing ? editing.spotName || (oldSpot && oldSpot.name) || "" : "" });
  const spotBox = el("div", { class: "stack" });
  const drawSpot = () => {
    fill(spotBox, 
      st.spot
        ? el("div", { class: "row spread" },
            el("span", { class: "spot-ok", text: `📍 Spot tagged (±${Math.round(st.spot.acc)} m)` }),
            el("button", { class: "btn small quiet", type: "button", text: "Remove", onclick: () => { st.spot = null; drawSpot(); } }))
        : el("button", { class: "btn block", type: "button", text: "📍 Tag my spot (GPS)", onclick: tagSpot }),
      gpsMsg,
      st.spot ? field("Spot name (optional)", spotName) : null,
      st.spot ? el("div", { class: "seg" }, ...[[false, "🔒 Private"], [true, "📍 Share with league"]].map(([v, label]) =>
        el("button", { type: "button", "aria-pressed": String(st.share === v), text: label, onclick: () => { st.share = v; drawSpot(); } }))) : null,
      st.spot ? el("p", { class: "hint", text: st.share
        ? "Everyone in the league can see this spot on a map."
        : "Only you can see this spot. Others see \"Secret spot\"." }) : null);
  };
  const gpsMsg = el("p", { class: "msg" });
  const tagSpot = () => {
    if (!navigator.geolocation) { gpsMsg.className = "msg err"; gpsMsg.textContent = "This phone can't share its location with the app."; return; }
    gpsMsg.className = "msg ok"; gpsMsg.textContent = "Finding your spot… GPS works without signal but can take a minute.";
    navigator.geolocation.getCurrentPosition(pos => {
      st.spot = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy || 0 };
      gpsMsg.textContent = ""; drawSpot();
    }, err => {
      gpsMsg.className = "msg err";
      gpsMsg.textContent = err.code === 1 ? "Location is blocked. Allow location for this app in the phone's settings, then try again."
        : "Couldn't get a GPS fix. Try again with a clear view of the sky.";
    }, { enableHighAccuracy: true, timeout: 45000, maximumAge: 60000 });
  };
  drawSpot();

  const msg = el("p", { class: "msg", role: "status" });
  const form = el("form", { class: "stack", novalidate: true },
    el("h2", { class: "page-title", text: editing ? "Edit catch" : "Log a catch" }),
    el("section", { class: "card stack" }, preview,
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", html: icon.camera, onclick: () => takePhoto(true) }, "Camera"),
        el("button", { class: "btn", type: "button", html: icon.image, onclick: () => takePhoto(false) }, "Gallery")),
      photoMsg,
      el("p", { class: "hint", text: "Show the fish on a scale or measuring board if you can. It settles arguments." })),
    el("section", { class: "card stack" },
      field("Species", species), datalist,
      el("div", { class: "field" }, el("span", { class: "field-label", text: "Weight" }),
        el("div", { class: "unit-row" }, lb, el("span", { text: "lb" }), oz, el("span", { text: "oz" }))),
      el("div", { class: "field" }, el("span", { class: "field-label", text: "Length" }),
        el("div", { class: "unit-row" }, inches, frac, el("span", { text: "inches" }))),
      el("p", { class: "hint", text: "Enter the weight, the length, or both." }),
      field("Caught", when), timeHint,
      el("label", { class: "check" }, released, el("span", { text: "Released" })),
      field("Notes (optional)", notes)),
    el("section", { class: "card stack" }, el("h3", { text: "Where" }), spotBox),
    msg,
    el("button", { class: "btn lime block big", type: "submit", text: editing ? "Save changes" : "Save catch" }),
    el("a", { class: "btn quiet block", href: editing ? `#/c/${editing.id}` : "#/feed", text: "Cancel" }));

  form.addEventListener("submit", e => {
    e.preventDefault();
    const fail = t => { msg.className = "msg err"; msg.textContent = t; msg.scrollIntoView({ block: "center", behavior: "smooth" }); };
    const sp = normalizeSpecies(species.value);
    const weightOz = Math.round((num(lb.value) * 16 + num(oz.value)) * 10) / 10;
    const lengthIn = Math.round((num(inches.value) + num(frac.value)) * 4) / 4;
    const caughtAt = new Date(when.value).getTime();
    if (!st.thumb) return fail("Add a photo of your catch.");
    if (!sp) return fail("Enter the species.");
    if (num(oz.value) >= 16) return fail("Ounces should be under 16. Put whole pounds in the lb box.");
    if (!(weightOz > 0) && !(lengthIn > 0)) return fail("Enter the weight, the length, or both.");
    if (!isFinite(caughtAt)) return fail("Enter when you caught it.");
    if (caughtAt > Date.now() + 600000) return fail("The catch time is in the future.");

    const id = editing ? editing.id : newCatchId();
    const data = {
      uid: uid(), species: sp, weightOz: weightOz > 0 ? weightOz : null, lengthIn: lengthIn > 0 ? lengthIn : null,
      caughtAt, createdAt: editing ? editing.createdAt : Date.now(), thumb: st.thumb, photoTakenAt: st.takenAt || null,
      notes: notes.value.trim().slice(0, 500), released: released.checked,
      hasSpot: !!st.spot, locShared: !!st.spot && st.share, spotName: st.spot && st.share ? spotName.value.trim().slice(0, 60) : "",
    };
    const spot = st.spot ? { ...st.spot, name: spotName.value.trim().slice(0, 60), shared: st.share } : (oldSpot ? null : undefined);
    const check = checkNewPB({ id, ...data }, allCatches());
    saveCatch({ id, data, photo: st.full, spot, isNew: !editing });
    if (check.pb && (!editing || check.previous)) celebrate = { id, previous: check.previous, at: Date.now() };
    toast(navigator.onLine ? "Catch saved." : "Saved on this phone. It will be shared when you have signal.");
    location.hash = `#/c/${id}`;
  });

  fill(main, form);
}

/* ---------- Catches the server refused ---------- */
const shownRejected = new Set();
export function maybeShowRejected() {
  const e = store.rejected.find(x => !shownRejected.has(x.id));
  if (!e) return;
  shownRejected.add(e.id);
  const d = e.catchData || {};
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: "A catch wasn't saved" }),
    el("p", { text: `Your ${d.species || "catch"} (${sizeText(d)}) from ${fmtDate(d.caughtAt || e.savedAt)} didn't reach the league. The server refused it, for example because your account was paused when it was sent.` }),
    el("p", { text: "This phone still has it, photo included." }),
    el("button", { class: "btn primary block", type: "button", text: "Try again", onclick: () => { retryRejected(e); closeSheet(); toast("Sending it again."); } }),
    confirmButton("Discard it", "Tap again to discard", () => { discardRejected(e); closeSheet(); }, "btn danger block"))));
}
