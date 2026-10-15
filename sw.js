/* Service worker: lets the app open with no signal.
   - App files (this site): network first, so a new version shows up as soon as there is signal,
     falling back to the saved copy after a few seconds or when offline. Once a page has opened from the saved copy,
     the rest of its files come from saved copies straight away (they load in rounds, so the waits would add up).
     Requests with a query string (the update check's js/config.js?check=…) go to the network only and are never saved:
     saved under their own address, an old one could be handed out as the app's config.js with no signal (0.76.4).
   - Firebase SDK, fonts and the map library (Leaflet): saved copy first. Their URLs include a version, so they never change.
   League data itself is not handled here; Firestore keeps its own offline copy. */
const SHELL = "lunker-shell-v2"; // v1 held stale config.js?check=… copies; activating v2 deletes it
const STATIC = "lunker-static-v1";
const SDK = "https://www.gstatic.com/firebasejs/12.19.0/";
const APP_FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/main.js", "js/config.js", "js/dock.js", "js/dockpage.js", "js/fishtank.js", "js/fishtankpage.js", "js/browse.js", "js/noshows.js", "js/ui.js", "js/cloud.js", "js/gate.js", "js/profile.js", "js/admin.js",
  "js/theme.js", "js/photos.js", "js/catches.js", "js/leaders.js", "js/stats.js", "js/species.js", "js/exif.js", "js/outbox.js", "js/camera.js", "js/social.js", "js/derby.js", "js/derbies.js", "js/payout.js", "js/rank.js", "js/season.js", "js/seasonlock.js", "js/scoring.js", "js/mappick.js",
  "js/events.js", "js/mentions.js", "js/alerts.js", "js/trips.js", "js/crowns.js", "js/invite.js", "js/storage.js", "js/badges.js", "js/feedfilter.js", "js/fishfinder.js", "js/series.js", "js/seriespage.js", "js/outings.js", "js/h2h.js", "js/h2hpage.js", "js/bets.js", "js/betspage.js", "js/tackle.js", "js/estimate.js", "js/mystats.js", "js/statspage.js", "js/skunks.js", "js/export.js", "js/weather.js", "js/catchmap.js", "js/mappage.js", "js/tacklebox.js", "js/tackleboxpage.js", "js/rodholder.js", "js/rodholderpage.js", "js/deadzone.js", "js/halloffame.js", "js/hofpage.js", "js/goals.js", "js/goalspage.js", "js/fleet.js", "js/fleetpage.js", "js/awards.js", "js/awardspage.js", "js/sysinfo.js", "js/systempage.js", "js/storagemeter.js", "js/viewmode.js", "js/thumbfocus.js", "js/focuspick.js", "js/leaguestats.js", "js/leaguestatspage.js", "js/usage.js", "js/thumbs.js", "js/archive.js", "js/panel.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];
const SDK_FILES = ["app", "auth", "firestore"].map(m => `${SDK}firebase-${m}.js`);
// Must match the fonts link in index.html. Saved when installing, with its Latin font files, so the first open with no
// signal has them too (otherwise they're only saved on a later open).
const FONTS_CSS = "https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Figtree:wght@400;500;600;700;800&display=swap";
const NETWORK_WAIT_MS = 3500;

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    // All app files or none (then the install is tried again later): a set mixing old and new files can't start.
    const shell = await caches.open(SHELL);
    await shell.addAll(APP_FILES.map(u => new Request(u, { cache: "reload" })));
    const stat = await caches.open(STATIC);
    await Promise.allSettled([...SDK_FILES.map(u => stat.add(u)), saveFonts(stat)]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![SHELL, STATIC].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function saveFonts(stat) {
  const res = await fetch(FONTS_CSS);
  if (!res.ok) return;
  const css = await res.clone().text();
  await stat.put(FONTS_CSS, res);
  // The stylesheet lists each font in several alphabets ("/* latin */", "/* vietnamese */"…); the app only needs Latin.
  const urls = css.split("/* ").filter(b => b.startsWith("latin */")).flatMap(b => [...b.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]));
  await Promise.allSettled([...new Set(urls)].map(u => stat.add(u)));
}

const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
const isStatic = url => url.href.startsWith(SDK) || url.href.startsWith(LEAFLET) || url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.search && req.mode !== "navigate") return; // network only, never saved (see the top)
    e.respondWith(networkFirst(e));
  }
  else if (isStatic(url)) e.respondWith(cacheFirst(req));
});

/* Pages (by client id) that opened from the saved copy. If the worker is stopped and loses this, files just wait as usual. */
const savedPages = new Set();

async function networkFirst(e) {
  const req = e.request, nav = req.mode === "navigate";
  const cache = await caches.open(SHELL);
  const key = nav ? "index.html" : req;
  // "no-cache" makes the browser check with the server every time (a quick "not modified" when nothing changed),
  // so a new deploy never mixes fresh and stale files from the browser's own HTTP cache.
  const fromNet = fetch(new Request(req.url, { cache: "no-cache", credentials: "same-origin" })).then(res => {
    if (res.ok && res.type === "basic") cache.put(key, res.clone());
    return res;
  });
  fromNet.catch(() => {}); // offline: handled below, so don't report it as unhandled
  const saved = () => cache.match(key);
  if (!nav && savedPages.has(e.clientId)) {
    const hit = await saved();
    if (hit) return hit; // the download above still finishes and is saved for next time
  }
  try {
    // Weak signal: give the network a few seconds, then use the saved copy (the download still finishes and is saved).
    const res = await Promise.race([fromNet, new Promise((_, no) => setTimeout(() => no(new Error("slow")), NETWORK_WAIT_MS))]);
    return res;
  } catch {
    const hit = await saved();
    if (hit) {
      if (nav && e.resultingClientId) savedPages.add(e.resultingClientId);
      return hit;
    }
    return fromNet;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}
