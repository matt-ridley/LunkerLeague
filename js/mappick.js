/* Pick a catch's spot by tapping a map, as well as (or instead of) using the phone's GPS.
   Leaflet is loaded only when the map is first opened, and the service worker keeps a copy so it opens without
   signal next time. Map tiles do need signal. */
import { el, toast } from "./ui.js";
import { store, uid } from "./cloud.js";

const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
const LAYERS = {
  map: { label: "Map", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap contributors", maxZoom: 19 },
  sat: { label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri", maxZoom: 19 },
};
let layerChoice = "sat";

let leaflet = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leaflet) return leaflet;
  leaflet = new Promise((resolve, reject) => {
    document.head.append(el("link", { rel: "stylesheet", href: `${LEAFLET}leaflet.min.css` }));
    const s = el("script", { src: `${LEAFLET}leaflet.min.js` });
    s.onload = () => resolve(window.L);
    s.onerror = () => { leaflet = null; s.remove(); reject(new Error("Leaflet didn't load")); };
    document.head.append(s);
  });
  return leaflet;
}

/* Where to centre the map: the spot already picked, else this angler's latest spot, else roughly the Great Lakes. */
function startView(current) {
  if (current) return { at: [current.lat, current.lng], zoom: 16 };
  let latest = null;
  for (const [id, s] of store.spots) {
    const c = store.catches.get(id);
    if (s.uid === uid() && c && (!latest || c.caughtAt > latest.t)) latest = { s, t: c.caughtAt };
  }
  if (latest) return { at: [latest.s.lat, latest.s.lng], zoom: 13 };
  return { at: [45, -82], zoom: 5 };
}

/* Opens the full-screen map. Resolves with { lat, lng } when the angler confirms a spot, or null if they cancel. */
export async function pickOnMap(current, title = "Tap where you caught it") {
  let L;
  try { L = await loadLeaflet(); }
  catch { toast("The map needs signal. Use your location (GPS) instead, or pick the spot later by editing the catch."); return null; }

  return new Promise(resolve => {
    let pin = null, layer = null;
    const done = v => { map.remove(); box.remove(); resolve(v); };
    const mapNode = el("div", { class: "map-pick-map" });
    const use = el("button", { class: "btn lime", type: "button", text: "Use this spot", disabled: !current,
      onclick: () => { const p = pin.getLatLng(); done({ lat: p.lat, lng: p.lng }); } });
    const seg = el("div", { class: "seg" });
    const drawSeg = () => {
      seg.replaceChildren(...Object.entries(LAYERS).map(([k, v]) => el("button", { type: "button", "aria-pressed": String(layerChoice === k), text: v.label,
        onclick: () => { layerChoice = k; setLayer(); drawSeg(); } })));
    };
    const box = el("div", { class: "map-pick", role: "dialog", "aria-label": "Pick the spot on the map" },
      el("div", { class: "map-pick-top" }, el("b", { text: title }), seg),
      mapNode,
      el("div", { class: "map-pick-bar" },
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: () => done(null) }), use));
    document.body.append(box);

    const view = startView(current);
    const map = L.map(mapNode, { zoomControl: true }).setView(view.at, view.zoom);
    const setLayer = () => {
      if (layer) layer.remove();
      const v = LAYERS[layerChoice];
      layer = L.tileLayer(v.url, { maxZoom: v.maxZoom, attribution: v.attribution }).addTo(map);
    };
    setLayer(); drawSeg();
    // An emoji pin, so Leaflet's marker images don't have to load.
    const icon = L.divIcon({ className: "map-pin", html: "📍", iconSize: [36, 36], iconAnchor: [18, 34] });
    const place = latlng => {
      if (pin) pin.setLatLng(latlng);
      else pin = L.marker(latlng, { icon, draggable: true }).addTo(map);
      use.disabled = false;
    };
    if (current) place([current.lat, current.lng]);
    map.on("click", e => place(e.latlng));
    if (!navigator.onLine) toast("No signal: the map may stay blank until you have some.");
  });
}
