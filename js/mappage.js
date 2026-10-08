/* The map of catches (#/map): your spots (private ones too) or the league's shared spots, on OpenStreetMap or satellite.
   One marker per spot with how many catches it has; tap it for the list. */
import { el, fill, fmtDay, fmtWeight, fmtLength } from "./ui.js";
import { store, uid, memberName, subscribe } from "./cloud.js";
import { loadLeaflet, layerSwitch } from "./mappick.js";
import { mapSpots, mapSpecies } from "./catchmap.js";
import { isStringer } from "./stats.js";

const remember = (k, v) => { try { sessionStorage.setItem(k, v); } catch {} };
const recall = (k, fallback) => { try { return sessionStorage.getItem(k) ?? fallback; } catch { return fallback; } };
const sizeOf = c => isStringer(c) ? `stringer of ${c.fishCount}` : [fmtWeight(c.weightOz), fmtLength(c.lengthIn)].filter(Boolean).join(" · ");
const POPUP_MAX = 8;

export async function renderMap(main) {
  const st = { view: recall("lunker-map-view", "mine") === "league" ? "league" : "mine", species: recall("lunker-map-species", "") };
  const mapNode = el("div", { class: "catch-map", role: "region", "aria-label": "Map of catches" });
  const controls = el("div", { class: "stack-tight" });
  const legend = el("div", { class: "map-legend" });
  const note = el("p", { class: "hint" });
  fill(main, el("h2", { class: "page-title", text: "🗺️ Map of catches" }), controls, mapNode, legend, note);

  let L;
  try { L = await loadLeaflet(); }
  catch { fill(mapNode, el("p", { class: "card empty", text: "The map needs signal to load. Try again when you have some." })); return; }
  if (!mapNode.isConnected) return; // left the page while it loaded
  // Zoom buttons at the bottom: popups open upwards, so they don't end up under them.
  const map = L.map(mapNode, { zoomControl: false }).setView([45, -82], 5);
  L.control.zoom({ position: "bottomleft" }).addTo(map);
  const markers = L.layerGroup().addTo(map);
  const layers = layerSwitch(L, map);
  const opts = () => ({ catches: [...store.catches.values()], spots: store.spots, me: uid(), view: st.view });

  // Redrawn when the view or filter changes, and when the data does (it may still be loading when the page opens).
  // It zooms to fit whatever's there until you move the map yourself, and when the view or filter changes.
  let shown = null, touched = false;
  for (const ev of ["pointerdown", "wheel"]) mapNode.addEventListener(ev, () => { touched = true; }, { passive: true });
  const draw = (fit = true) => {
    const speciesList = mapSpecies(opts());
    if (st.species && !speciesList.includes(st.species)) st.species = "";
    const groups = mapSpots({ ...opts(), species: st.species });
    const sig = `${st.view}|${st.species}|${speciesList.join()}|${groups.map(g => `${g.key}:${g.catches.map(c => c.id).join()}`).join(";")}`;
    if (sig === shown) return; // nothing changed: keep any open popup
    shown = sig;
    const pick = el("select", { "aria-label": "Species" }, el("option", { value: "", text: "All species" }),
      ...speciesList.map(s => el("option", { value: s, text: s })));
    pick.value = st.species;
    pick.addEventListener("change", () => { st.species = pick.value; remember("lunker-map-species", pick.value); draw(); });
    fill(controls,
      el("div", { class: "seg" }, ...[["mine", "My spots"], ["league", "The league"]].map(([k, label]) =>
        el("button", { type: "button", "aria-pressed": String(st.view === k), text: label,
          onclick: () => { st.view = k; remember("lunker-map-view", k); draw(); } }))),
      el("div", { class: "row spread map-tools" }, pick, layers));

    markers.clearLayers();
    for (const g of groups) {
      const n = g.catches.length;
      const icon = L.divIcon({ className: "", html: `<span class="spot-dot ${g.shared ? "shared" : "private"}${n > 9 ? " big" : ""}">${n}</span>`,
        iconSize: n > 9 ? [36, 36] : [30, 30] });
      L.marker([g.lat, g.lng], { icon, title: `${g.name || (g.shared ? "Shared spot" : "Private spot")}: ${n} catch${n === 1 ? "" : "es"}` })
        .bindPopup(() => popup(g), { maxWidth: Math.min(260, mapNode.clientWidth - 64), autoPanPadding: [16, 16] }).addTo(markers);
    }
    const fish = groups.reduce((a, g) => a + g.catches.length, 0);
    fill(legend, ...(st.view === "mine"
      ? [el("span", {}, el("span", { class: "spot-dot shared" }), " Shared with the league"), el("span", {}, el("span", { class: "spot-dot private" }), " 🔒 Private: only you")]
      : [el("span", {}, el("span", { class: "spot-dot shared" }), " Shared spots")]));
    note.textContent = groups.length
      ? `${fish} catch${fish === 1 ? "" : "es"} at ${groups.length} spot${groups.length === 1 ? "" : "s"}. The number on each marker is how many catches it has; tap it to see them.`
      : st.view === "mine" ? "None of your catches have a spot yet. Tag one with GPS or the map when you log a catch."
      : "Nobody has shared a spot yet.";
    if (!navigator.onLine) note.textContent += " No signal: the map pictures need some.";
    if ((fit || !touched) && groups.length) {
      map.fitBounds(L.latLngBounds(groups.map(g => [g.lat, g.lng])).pad(0.2), { maxZoom: 15, animate: false });
    }
  };
  draw();
  const stop = subscribe(() => { if (!mapNode.isConnected) return stop(); draw(false); });
}

/* The catches at one spot, newest first. */
function popup(g) {
  const shown = g.catches.slice(0, POPUP_MAX), more = g.catches.length - shown.length;
  return el("div", { class: "spot-pop" },
    el("b", { text: g.name || (g.shared ? "📍 Shared spot" : "🔒 Private spot") }),
    el("ul", {}, ...shown.map(c => el("li", {}, el("a", { href: `#/c/${c.id}` },
      el("strong", { text: c.species }), [sizeOf(c), memberName(c.uid), fmtDay(c.caughtAt)].filter(Boolean).map(t => ` · ${t}`).join(""))))),
    more > 0 ? el("p", { class: "muted small", text: `And ${more} more.` }) : null);
}
