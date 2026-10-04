/* Service worker: lets the app open with no signal.
   - App files (this site): network first, so a new version shows up as soon as there is signal,
     falling back to the saved copy after a few seconds or when offline.
   - Firebase SDK and fonts: saved copy first. Their URLs include a version, so they never change.
   League data itself is not handled here; Firestore keeps its own offline copy. */
const SHELL = "lunker-shell-v1";
const STATIC = "lunker-static-v1";
const SDK = "https://www.gstatic.com/firebasejs/12.19.0/";
const APP_FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/main.js", "js/config.js", "js/ui.js", "js/cloud.js", "js/gate.js", "js/profile.js", "js/admin.js",
  "js/theme.js", "js/photos.js", "js/catches.js", "js/leaders.js", "js/stats.js", "js/species.js", "js/exif.js", "js/outbox.js", "js/camera.js", "js/social.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];
const SDK_FILES = ["app", "auth", "firestore"].map(m => `${SDK}firebase-${m}.js`);
const NETWORK_WAIT_MS = 3500;

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await Promise.allSettled(APP_FILES.map(u => shell.add(new Request(u, { cache: "reload" }))));
    const stat = await caches.open(STATIC);
    await Promise.allSettled(SDK_FILES.map(u => stat.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![SHELL, STATIC].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isStatic = url => url.href.startsWith(SDK) || url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (isStatic(url)) e.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  const key = req.mode === "navigate" ? "index.html" : req;
  // "no-cache" makes the browser check with the server every time (a quick "not modified" when nothing changed),
  // so a new deploy never mixes fresh and stale files from the browser's own HTTP cache.
  const fromNet = fetch(new Request(req.url, { cache: "no-cache", credentials: "same-origin" })).then(res => {
    if (res.ok && res.type === "basic") cache.put(key, res.clone());
    return res;
  });
  fromNet.catch(() => {}); // offline: handled below, so don't report it as unhandled
  const saved = () => cache.match(key, { ignoreSearch: true });
  try {
    // Weak signal: give the network a few seconds, then use the saved copy (the download still finishes and is saved).
    const res = await Promise.race([fromNet, new Promise((_, no) => setTimeout(() => no(new Error("slow")), NETWORK_WAIT_MS))]);
    return res;
  } catch {
    const hit = await saved();
    if (hit) return hit;
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
