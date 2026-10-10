/* Firebase: sign-in, live listeners and writes.
   Everything is mirrored into `store`, and every change calls the subscribers so the screen re-renders.
   Firestore's persistent cache keeps a copy on the phone, so the app opens and accepts changes with no signal;
   queued writes are sent when the phone is back online. Times are stored as epoch milliseconds from the phone clock. */
import { FIREBASE_CONFIG, FIREBASE_SDK } from "./config.js";
import { outboxPut, outboxRemove, outboxAll } from "./outbox.js";
import { leagueStartOf } from "./stats.js";
import { attended } from "./noshows.js";
import { acceptedCaptains } from "./fleet.js";
import { readArchive, combine, yearStart, buildArchive, archiveYear, lateCatches } from "./archive.js";

/* Add ?emulator to a localhost address to use the local Firebase emulator (npm run emulators) instead of the real project. */
export const USE_EMULATOR = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has("emulator");

export const cloud = {
  on: !!FIREBASE_CONFIG, api: null, db: null, auth: null,
  user: null, authKnown: false, failed: false, loadError: false,
  meta: {}, snaps: {}, unsubs: [], memberUnsubs: [], retry: null,
  statusKind: "", statusSince: Date.now(), // the fish icon's current state and when it last changed
  lastServerAt: 0,                         // when the server last sent fresh data (not the phone's cached copy)
};

export const store = {
  league: undefined,      // undefined = not loaded yet, null = no league yet (confirmed by the server)
  leagueFromCache: true,
  me: undefined,          // this user's member doc; null = not a member
  meFromCache: true,
  members: new Map(),     // uid -> member
  invite: undefined,      // current invite code (admins only)
  catches: new Map(),     // id -> catch (its small photo is in thumbs/{id}, or on older catches `thumb`)
  catchesLoaded: false,
  pending: new Set(),     // ids of catches still waiting to reach the server
  spots: new Map(),       // catch id -> GPS spot (shared ones, plus all of this user's own)
  tackle: new Map(),      // catch id -> { lure, depthFt, technique } (shared ones, plus all of this user's own)
  skunks: new Map(),      // "{uid}_{day}" -> { uid, day, notes, createdAt }: days out with no fish
  fleet: new Map(),       // saved boat id -> { uid (owner), name, crew, notes, thumb, retired, createdAt }
  goals: new Map(),       // goal id -> { uid, kind, target, species, field, value, from, to, createdAt }
  box: new Map(),         // tackle box item id -> { uid, name, type, technique, depthFt, notes, thumb, retired, createdAt }
  weather: new Map(),     // catch id -> { tempC, windKph, windDir, gustKph, pressureHpa, cloud, code, forAt, src }
  rejected: [],           // outbox entries the server refused
  comments: new Map(),    // catch id -> [comment], oldest first
  reactions: new Map(),   // catch id -> Map(uid -> [emoji])
  reactionTimes: new Map(), // catch id -> Map(uid -> when they last changed their reactions)
  chat: [],               // last 100 league chat messages, oldest first
  chatLoaded: false,
  pendingIds: new Set(),  // comment / chat ids still waiting to reach the server
  derbies: new Map(),     // id -> derby
  derbiesFromServer: false, // true once the derby list has come from the server (not just the phone's cache)
  entrants: new Map(),    // derby id -> Map(uid -> { joinedAt })
  derbyChat: new Map(),   // derby id -> [message] (loaded when a derby's chat is opened)
  settlements: new Map(), // derby id -> Map(payee key -> { amount, settledAt, by }) (loaded when its Money tab is opened)
  mystery: new Map(),     // derby id -> { weightOz, setBy, setAt } or null (loaded once the rules let this angler see it)
  scoring: [],            // ranking point versions, oldest first
  trips: new Map(),       // id -> trip ("who's out Saturday?")
  challenges: new Map(),  // id -> head-to-head challenge
  bets: new Map(),        // id -> bet
  betPlayers: new Map(),  // bet id -> Map(uid -> { at, in })
  proofs: new Map(),      // bet id -> Map(uid -> { photo, thumb, takenAt, note, at }), loaded when the bet is opened
  series: new Map(),      // id -> derby series (derbies with points by place)
  seasons: new Map(),     // year (number) -> the saved season (seasons/{year}), written when it locks
  rsvps: new Map(),       // trip id -> Map(uid -> { answer: "in" | "maybe" | "out", at, boat, seatAt })
  boats: new Map(),       // trip id -> Map(owner uid -> { seats, name, at })
  noShows: new Map(),     // trip id -> Map(uid -> { by, at }): said "In" and didn't show up
};

const subs = new Set();
export const subscribe = fn => { subs.add(fn); return () => subs.delete(fn); };
let emitQueued = false;
export function emit() {
  if (emitQueued) return;
  emitQueued = true;
  queueMicrotask(() => { emitQueued = false; subs.forEach(fn => fn()); });
}

export const uid = () => cloud.user && cloud.user.uid;
export const isAdmin = () => !!(store.league && uid() && (store.league.admins || []).includes(uid()));
export const isOwner = () => !!(store.league && uid() && store.league.ownerUid === uid());
export const memberName = id => (store.members.get(id) || {}).displayName || "Former member";

/* Which screen the app should show before the main tabs. */
export function gate() {
  if (!cloud.on) return "setup";
  if (cloud.loadError) return "load-error";
  if (!cloud.authKnown) return "loading";
  if (!cloud.user) return "signed-out";
  if (store.league === undefined || store.me === undefined) return navigator.onLine ? "loading" : "offline-unknown";
  if (store.league === null) return "claim";
  if (store.me === null) return "join";
  if (store.me.suspended) return "suspended";
  return "in";
}

/* ---------- Sync status ---------- */
export function syncStatus() {
  const s = currentStatus();
  if (s.kind !== cloud.statusKind) { cloud.statusKind = s.kind; cloud.statusSince = Date.now(); }
  return { ...s, since: cloud.statusSince };
}
function currentStatus() {
  if (!cloud.on || !cloud.user) return { kind: "off", label: "" };
  if (cloud.failed) return { kind: "bad", label: "Sync problem" };
  const m = Object.values(cloud.meta);
  const pending = m.some(x => x.hasPendingWrites);
  if (!navigator.onLine || m.some(x => x.fromCache)) return { kind: "offline", label: pending ? "Offline · changes waiting" : "Offline", pending };
  if (pending) return { kind: "busy", label: "Syncing", pending };
  return { kind: "live", label: "Connected" };
}
window.addEventListener("online", emit);
window.addEventListener("offline", emit);

/* ---------- Listeners ---------- */
/* Ids of comments and chat messages still waiting to reach the server, per listener. */
let pendingOf = {};
function syncPending() { store.pendingIds = new Set(Object.values(pendingOf).flatMap(set => [...set])); }
const OPTS = { includeMetadataChanges: true };
const seen = (key, snap) => {
  cloud.meta[key] = snap.metadata; cloud.snaps[key] = snap; cloud.failed = false;
  if (!snap.metadata.fromCache) cloud.lastServerAt = Date.now();
};

function startListeners() {
  const { onSnapshot, doc } = cloud.api;
  stopListeners();
  store.league = undefined; store.me = undefined;
  cloud.unsubs = [
    onSnapshot(doc(cloud.db, "config", "league"), OPTS, snap => {
      seen("league", snap);
      // A missing doc read from the phone's cache doesn't prove there is no league yet; wait for the server.
      if (!snap.exists() && snap.metadata.fromCache) { if (store.league === undefined) emit(); return; }
      const before = leagueStartOf(store.league);
      store.league = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      store.leagueFromCache = snap.metadata.fromCache;
      if (leagueStartOf(store.league) !== before && store.catches.size) store.catches = withPast(store.catches.values());
      refreshMemberListeners();
      emit();
    }, syncError),
    onSnapshot(doc(cloud.db, "members", uid()), OPTS, snap => {
      seen("me", snap);
      if (!snap.exists() && snap.metadata.fromCache) { if (store.me === undefined) emit(); return; }
      // A join this phone just sent isn't real until the server accepts the invite code.
      if (snap.exists() && snap.metadata.hasPendingWrites && !store.me) return;
      store.me = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      store.meFromCache = snap.metadata.fromCache;
      refreshMemberListeners();
      emit();
    }, syncError),
  ];
}

/* Collections only members can read, started once this user is a member (and stopped if that changes, or when a new
   archive set is built: config/league.archive). */
let memberKey = "";
/* The catches and what hangs off them come from several listeners (and the archive), put together by compose(). */
let L = null;
const freshLive = arc => ({ arc, arch: null, catchSets: {}, weatherSets: {}, spotSets: {}, tackleSets: {}, comments: new Map(), reactions: new Map(),
  gone: new Map(), extras: { tackle: new Map(), spots: new Map() }, extrasTried: new Set(), archParts: [] });
const archiveOf = () => { const a = store.league && store.league.archive; return a && a.at && a.y0 && a.since ? a : null; };

function refreshMemberListeners() {
  const member = !!(store.me && !store.me.suspended);
  const arc = member ? archiveOf() : null;
  const key = member ? `${isAdmin() ? "admin" : "member"}|${arc ? arc.at : ""}` : "";
  if (key === memberKey) return;
  memberKey = key;
  cloud.memberUnsubs.forEach(u => u());
  cloud.memberUnsubs = [];
  for (const k of Object.keys(cloud.meta)) if (k !== "league" && k !== "me") { delete cloud.meta[k]; delete cloud.snaps[k]; }
  derbyChatUnsubs.forEach(u => u()); derbyChatUnsubs.clear();
  store.members = new Map(); store.invite = undefined;
  store.catches = new Map(); store.catchesLoaded = false; store.pending = new Set(); store.spots = new Map(); store.tackle = new Map();
  resetSocial();
  L = freshLive(arc);
  if (!member) return;
  const { onSnapshot, collection, collectionGroup, doc, query, where, orderBy, limitToLast } = cloud.api;
  // With an archive: only what it doesn't hold (caught from y0 on, or saved, made or looked up since it was built). `since`
  // is a little before it was built, so things saved on a phone with no signal and sent later aren't missed (duplicates
  // are merged).
  const from = arc ? new Date(arc.y0, 0, 1).getTime() : 0;
  const since = (q, field, t) => (arc ? query(q, where(field, ">=", t)) : q);
  if (arc) {
    cloud.memberUnsubs.push(onSnapshot(query(collection(cloud.db, "archive"), where("set", "==", arc.at)), OPTS, snap => {
      seen("archive", snap);
      L.archParts = snap.docs.map(d => d.data());
      L.arch = readArchive(L.archParts);
      compose("all");
    }, syncError));
    cloud.memberUnsubs.push(onSnapshot(query(collection(cloud.db, "gone"), where("at", ">=", arc.since)), OPTS, snap => {
      seen("gone", snap);
      L.gone = new Map(snap.docs.map(d => [d.id, d.data()]));
      compose("all");
    }, syncError));
  }
  // Comments and reactions of every catch, kept under the catch they belong to.
  cloud.memberUnsubs.push(onSnapshot(since(collectionGroup(cloud.db, "comments"), "at", arc && arc.since), OPTS, snap => {
    seen("comments", snap);
    const by = new Map();
    pendingOf.comments = new Set();
    for (const d of snap.docs) {
      const catchId = d.ref.parent.parent && d.ref.parent.parent.id;
      if (!catchId || d.ref.parent.parent.parent.id !== "catches") continue;
      if (d.metadata.hasPendingWrites) pendingOf.comments.add(d.id);
      if (!by.has(catchId)) by.set(catchId, []);
      by.get(catchId).push({ id: d.id, catchId, ...d.data() });
    }
    L.comments = by; syncPending();
    compose("comments");
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(since(collectionGroup(cloud.db, "reactions"), "at", arc && arc.since), OPTS, snap => {
    seen("reactions", snap);
    const by = new Map();
    for (const d of snap.docs) {
      const catchId = d.ref.parent.parent && d.ref.parent.parent.id;
      if (!catchId) continue;
      const emojis = Array.isArray(d.data().emojis) ? d.data().emojis : [];
      if (!emojis.length) continue;
      if (!by.has(catchId)) by.set(catchId, new Map());
      by.get(catchId).set(d.id, { emojis, at: d.data().at || 0 });
    }
    L.reactions = by;
    compose("reactions");
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "scoring"), OPTS, snap => {
    seen("scoring", snap);
    store.scoring = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "derbies"), OPTS, snap => {
    seen("derbies", snap);
    store.derbies = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    if (!snap.metadata.fromCache) store.derbiesFromServer = true;
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collectionGroup(cloud.db, "entrants"), OPTS, snap => {
    seen("entrants", snap);
    const by = new Map();
    for (const d of snap.docs) {
      const derbyId = d.ref.parent.parent && d.ref.parent.parent.id;
      if (!derbyId) continue;
      if (!by.has(derbyId)) by.set(derbyId, new Map());
      by.get(derbyId).set(d.id, d.data());
    }
    store.entrants = by;
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "seasons"), OPTS, snap => {
    seen("seasons", snap);
    store.seasons = new Map(snap.docs.map(d => [Number(d.id), d.data()]));
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "series"), OPTS, snap => {
    seen("series", snap);
    store.series = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "challenges"), OPTS, snap => {
    seen("challenges", snap);
    store.challenges = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "bets"), OPTS, snap => {
    seen("bets", snap);
    store.bets = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collectionGroup(cloud.db, "players"), OPTS, snap => {
    seen("betPlayers", snap);
    const by = new Map();
    for (const d of snap.docs) {
      const betId = d.ref.parent.parent && d.ref.parent.parent.id;
      if (!betId) continue;
      if (!by.has(betId)) by.set(betId, new Map());
      by.get(betId).set(d.id, d.data());
    }
    store.betPlayers = by;
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "fleet"), OPTS, snap => {
    seen("fleet", snap);
    store.fleet = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "goals"), OPTS, snap => {
    seen("goals", snap);
    store.goals = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "tackleBox"), OPTS, snap => {
    seen("tackleBox", snap);
    store.box = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    emit();
  }, syncError));
  const weatherListener = (key, q) => onSnapshot(q, OPTS, snap => {
    seen(key, snap);
    L.weatherSets[key] = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    compose("weather");
  }, syncError);
  if (arc) cloud.memberUnsubs.push(
    weatherListener("weather", query(collection(cloud.db, "weather"), where("forAt", ">=", from))),
    weatherListener("weatherNew", query(collection(cloud.db, "weather"), where("fetchedAt", ">=", arc.since))));
  else cloud.memberUnsubs.push(weatherListener("weather", collection(cloud.db, "weather")));
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "skunks"), OPTS, snap => {
    seen("skunks", snap);
    store.skunks = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "trips"), OPTS, snap => {
    seen("trips", snap);
    store.trips = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collectionGroup(cloud.db, "boats"), OPTS, snap => {
    seen("boats", snap);
    const by = new Map();
    for (const d of snap.docs) {
      const tripId = d.ref.parent.parent && d.ref.parent.parent.id;
      if (!tripId) continue;
      if (!by.has(tripId)) by.set(tripId, new Map());
      by.get(tripId).set(d.id, d.data());
    }
    store.boats = by;
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collectionGroup(cloud.db, "noShows"), OPTS, snap => {
    seen("noShows", snap);
    const by = new Map();
    for (const d of snap.docs) {
      const tripId = d.ref.parent.parent && d.ref.parent.parent.id;
      if (!tripId) continue;
      if (!by.has(tripId)) by.set(tripId, new Map());
      by.get(tripId).set(d.id, d.data());
    }
    store.noShows = by;
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collectionGroup(cloud.db, "rsvps"), OPTS, snap => {
    seen("rsvps", snap);
    const by = new Map();
    for (const d of snap.docs) {
      const tripId = d.ref.parent.parent && d.ref.parent.parent.id;
      if (!tripId) continue;
      if (!by.has(tripId)) by.set(tripId, new Map());
      by.get(tripId).set(d.id, d.data());
    }
    store.rsvps = by;
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(query(collection(cloud.db, "chat"), orderBy("at"), limitToLast(100)), OPTS, snap => {
    seen("chat", snap);
    pendingOf.chat = new Set(snap.docs.filter(d => d.metadata.hasPendingWrites).map(d => d.id));
    store.chat = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    store.chatLoaded = true; syncPending();
    emit();
  }, syncError));
  const catchListener = (key, q) => onSnapshot(q, OPTS, snap => {
    seen(key, snap);
    const pending = new Set();
    const docs = new Map(snap.docs.map(d => {
      if (d.metadata.hasPendingWrites) pending.add(d.id);
      return [d.id, { id: d.id, ...d.data() }];
    }));
    L.catchSets[key] = { docs, pending };
    compose("catches");
    if (!snap.metadata.fromCache) checkOutbox();
  }, syncError);
  if (arc) cloud.memberUnsubs.push(
    catchListener("catches", query(collection(cloud.db, "catches"), where("caughtAt", ">=", from))),
    catchListener("catchesEdited", query(collection(cloud.db, "catches"), where("editedAt", ">=", arc.since))));
  else cloud.memberUnsubs.push(catchListener("catches", collection(cloud.db, "catches")));
  // Spots: everyone's shared ones (yours included), and your own private ones. Other people's private spots never reach
  // this phone.
  const sideListener = (sets, key, q) => onSnapshot(q, OPTS, snap => {
    seen(key, snap);
    sets[key] = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    compose("side");
  }, syncError);
  const shared = name => arc ? query(collection(cloud.db, name), where("shared", "==", true), where("at", ">=", from))
    : query(collection(cloud.db, name), where("shared", "==", true));
  cloud.memberUnsubs.push(
    sideListener(L.spotSets, "spotsShared", shared("spots")),
    sideListener(L.spotSets, "spotsMine", query(collection(cloud.db, "spots"), where("uid", "==", uid()), where("shared", "==", false))));
  // Tackle, the same way: everyone's shared tackle, and your own secret tackle (which never reaches anyone else).
  cloud.memberUnsubs.push(
    sideListener(L.tackleSets, "tackleShared", shared("tackle")),
    sideListener(L.tackleSets, "tackleMine", query(collection(cloud.db, "tackle"), where("uid", "==", uid()), where("shared", "==", false))));
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "members"), OPTS, snap => {
    seen("members", snap);
    if (snap.docChanges().length || !store.members.size) {
      store.members = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    }
    emit();
  }, syncError));
  if (isAdmin()) {
    cloud.memberUnsubs.push(onSnapshot(doc(cloud.db, "config", "invite"), OPTS, snap => {
      seen("invite", snap);
      store.invite = snap.exists() ? String(snap.data().code || "") : "";
      emit();
    }, syncError));
  }
}

/* What a full app open downloads, per listener: Map(key -> { docs, bytes }), measured from each listener's latest
   data (each snapshot measured once). Listeners opened on demand (a derby's chat, full photos) aren't included. */
const measured = new WeakMap();
export function openParts(measure) {
  const out = new Map();
  for (const [key, snap] of Object.entries(cloud.snaps)) {
    if (!measured.has(snap)) measured.set(snap, measure(snap.docs ? snap.docs.map(d => d.data()) : snap.exists() ? [snap.data()] : []));
    out.set(key, measured.get(snap));
  }
  return out;
}

/* Puts the catches together from their listeners and the archive (when there is one), with their weather, tackle,
   spots, comments and reactions, into the store. Only the parts that changed get new maps, so work cached on the
   others (rankings, crowns, badges) isn't redone. changed: "catches", "weather", "side", "comments", "reactions" or "all". */
function compose(changed = "all") {
  if (!L) return;
  const catches = new Map(), pending = new Set();
  for (const set of Object.values(L.catchSets)) {
    for (const [id, c] of set.docs) catches.set(id, c);
    for (const id of set.pending) pending.add(id);
  }
  const merge = sets => new Map(Object.values(sets).flatMap(m => [...m]));
  const live = {
    catches, weather: merge(L.weatherSets),
    tackle: new Map([...L.extras.tackle, ...(L.tackleSets.tackleShared || []), ...(L.tackleSets.tackleMine || [])]),
    spots: new Map([...L.extras.spots, ...(L.spotSets.spotsShared || []), ...(L.spotSets.spotsMine || [])]),
    comments: L.comments, reactions: L.reactions, gone: L.gone,
  };
  const useArch = !!(L.arc && L.arch && L.arch.complete && L.arch.set === L.arc.at);
  const out = useArch ? combine(L.arch, live) : live;
  if (!useArch) for (const list of out.comments.values()) list.sort((a, b) => (a.at || 0) - (b.at || 0));
  const all = changed === "all";
  if (all || changed === "catches") { store.catches = withPast(out.catches.values()); store.pending = pending; }
  if (all || changed === "weather") store.weather = out.weather;
  // An archived catch's tackle and spot show only while the catch says they're shared, so catches count here too.
  if (all || changed === "side" || (useArch && changed === "catches")) { store.tackle = out.tackle; store.spots = out.spots; }
  if (all || changed === "comments") store.comments = out.comments;
  if (all || changed === "reactions") {
    store.reactions = new Map([...out.reactions].map(([cid, by]) => [cid, new Map([...by].map(([u, r]) => [u, r.emojis]))]));
    store.reactionTimes = new Map([...out.reactions].map(([cid, by]) => [cid, new Map([...by].map(([u, r]) => [u, r.at]))]));
  }
  const want = L.arc ? ["catches", "catchesEdited"] : ["catches"];
  store.catchesLoaded = want.every(k => L.catchSets[k]) && (!L.arc || useArch);
  if (L.arc && useArch) fetchExtras(out.catches);
  emit();
}

/* Catches saved since the archive was built but caught before y0 (a new logbook catch, say) aren't in the archive or in
   the shared tackle and spot listeners (those start at y0): fetch their shared tackle and spot one by one, once. */
function fetchExtras(catches) {
  const before = yearStart(L.arc.y0), { doc, getDoc } = cloud.api, run = L;
  for (const c of catches.values()) {
    if (c.caughtAt >= before || L.extrasTried.has(c.id)) continue;
    const wants = [c.tackleShared && !store.tackle.has(c.id) ? "tackle" : null, c.locShared && !store.spots.has(c.id) ? "spots" : null].filter(Boolean);
    if (!wants.length) continue;
    L.extrasTried.add(c.id);
    for (const name of wants) getDoc(doc(cloud.db, name, c.id)).then(snap => {
      if (run !== L || !snap.exists()) return;
      L.extras[name === "tackle" ? "tackle" : "spots"].set(c.id, { id: c.id, ...snap.data() });
      compose("side");
    }).catch(() => L && L.extrasTried.delete(c.id));
  }
}

/* Past catches: `pastStored` is the flag saved on the catch (logged too late; locked). `past` also covers catches
   from before the league start, worked out here so an admin moving the start date re-sorts every catch. A new Map,
   so everything worked out from the catches (rankings, crowns, badges) is worked out again. */
function withPast(catches) {
  const start = leagueStartOf(store.league);
  return new Map([...catches].map(c => {
    const pastStored = c.pastStored ?? c.past === true;
    return [c.id, { ...c, pastStored, past: pastStored || c.caughtAt < start }];
  }));
}

function stopListeners() {
  derbyChatUnsubs.forEach(u => u()); derbyChatUnsubs.clear();
  cloud.unsubs.forEach(u => u());
  cloud.memberUnsubs.forEach(u => u());
  cloud.unsubs = []; cloud.memberUnsubs = []; memberKey = "";
  cloud.meta = {}; cloud.snaps = {};
  store.league = undefined; store.me = undefined; store.members = new Map(); store.invite = undefined;
  store.catches = new Map(); store.catchesLoaded = false; store.pending = new Set(); store.spots = new Map(); store.tackle = new Map(); store.rejected = [];
  resetSocial();
}

function resetSocial() {
  pendingOf = { comments: new Set(), chat: new Set() };
  store.comments = new Map(); store.reactions = new Map(); store.reactionTimes = new Map(); store.chat = []; store.chatLoaded = false; store.pendingIds = new Set();
  store.derbies = new Map(); store.derbiesFromServer = false; store.entrants = new Map(); store.derbyChat = new Map(); store.settlements = new Map(); store.mystery = new Map(); store.scoring = [];
  store.skunks = new Map(); store.weather = new Map(); store.box = new Map(); store.goals = new Map(); store.fleet = new Map();
  store.trips = new Map(); store.rsvps = new Map(); store.boats = new Map(); store.noShows = new Map(); store.series = new Map(); store.seasons = new Map(); store.challenges = new Map(); store.bets = new Map(); store.betPlayers = new Map(); store.proofs = new Map();
}

function syncError(e) {
  console.warn("Sync error", e);
  cloud.failed = true;
  emit();
  // A refused listener stops for good, so reconnect shortly.
  clearTimeout(cloud.retry);
  cloud.retry = setTimeout(() => { if (cloud.user) startListeners(); }, 10000);
}

/* ---------- Start up ---------- */
export async function initCloud() {
  if (!cloud.on) return emit();
  try {
    const [app, auth, fs] = await Promise.all(["app", "auth", "firestore"].map(m => import(`${FIREBASE_SDK}firebase-${m}.js`)));
    cloud.api = { ...auth, ...fs };
    // ?emulator uses the "demo-lunker" project; ?emulator=name uses "demo-name", so two test setups can share one emulator.
    const emuProject = "demo-" + (new URLSearchParams(location.search).get("emulator") || "lunker").replace(/[^a-z0-9-]/gi, "").slice(0, 20);
    const fbApp = app.initializeApp(USE_EMULATOR ? { ...FIREBASE_CONFIG, projectId: emuProject } : FIREBASE_CONFIG);
    cloud.auth = auth.getAuth(fbApp);
    if (USE_EMULATOR) {
      // Local testing only: pretend accounts and data in the Firebase emulator, never the real league.
      cloud.db = fs.initializeFirestore(fbApp, { localCache: fs.memoryLocalCache() });
      auth.connectAuthEmulator(cloud.auth, "http://127.0.0.1:9099", { disableWarnings: true });
      fs.connectFirestoreEmulator(cloud.db, "127.0.0.1", 8080);
    } else {
      cloud.db = fs.initializeFirestore(fbApp, {
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager(), cacheSizeBytes: 200 * 1024 * 1024 }),
      });
    }
  } catch (e) {
    console.warn("Firebase didn't load", e);
    cloud.loadError = true;
    return emit();
  }
  cloud.api.onAuthStateChanged(cloud.auth, user => {
    cloud.user = user; cloud.authKnown = true;
    if (user) startListeners(); else stopListeners();
    emit();
  });
}

/* ---------- Accounts ---------- */
const AUTH_MSG = {
  "auth/network-request-failed": "No internet connection. Signing in needs signal the first time.",
  "auth/too-many-requests": "Too many tries. Wait a few minutes and try again.",
  "auth/invalid-credential": "That email or password isn't right.",
  "auth/wrong-password": "That email or password isn't right.",
  "auth/user-not-found": "That email or password isn't right.",
  "auth/invalid-email": "That doesn't look like an email address.",
  "auth/email-already-in-use": "There is already an account with that email. Sign in instead.",
  "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/missing-password": "Enter a password.",
};
export const authMessage = e => AUTH_MSG[e && e.code] || "Something went wrong. Try again.";

export const signIn = (email, pass) => cloud.api.signInWithEmailAndPassword(cloud.auth, email, pass);
export const signUp = (email, pass) => cloud.api.createUserWithEmailAndPassword(cloud.auth, email, pass);
export const resetPassword = email => cloud.api.sendPasswordResetEmail(cloud.auth, email);
export const signOut = () => cloud.api.signOut(cloud.auth);

const ref = (...path) => cloud.api.doc(cloud.db, ...path);
const cleanName = s => String(s || "").trim().replace(/\s+/g, " ").slice(0, 40);
export const cleanCode = s => String(s || "").trim().toUpperCase().replace(/\s+/g, "");

/* First run: whoever creates the league owns it. The rules only allow this while config/league doesn't exist. */
export async function claimLeague({ leagueName, inviteCode, displayName }) {
  const me = uid(), now = Date.now();
  const b = cloud.api.writeBatch(cloud.db);
  b.set(ref("config", "league"), { name: cleanName(leagueName) || "Lunker League", ownerUid: me, admins: [me], createdAt: now });
  b.set(ref("config", "invite"), { code: cleanCode(inviteCode) });
  b.set(ref("members", me), { displayName: cleanName(displayName), joinedAt: now, suspended: false });
  await b.commit();
}

/* Joining: the rules check the code against config/invite. The code is then removed from the member doc. */
export async function joinLeague({ inviteCode, displayName }) {
  const r = ref("members", uid());
  await cloud.api.setDoc(r, { displayName: cleanName(displayName), joinedAt: Date.now(), suspended: false, invite: cleanCode(inviteCode) });
  await cloud.api.updateDoc(r, { invite: cloud.api.deleteField() });
}

/* Ordinary edits don't wait for the server, so they work offline; errors surface through the sync status. */
function write(p) { p.catch(syncError); }

export function updateMe(fields) {
  const f = { ...fields };
  if ("displayName" in f) f.displayName = cleanName(f.displayName);
  if ("homeWater" in f) f.homeWater = String(f.homeWater || "").trim().slice(0, 60);
  if ("favSpecies" in f) f.favSpecies = String(f.favSpecies || "").trim().slice(0, 40);
  write(cloud.api.updateDoc(ref("members", uid()), f));
}

/* ---------- Admin ---------- */
/* Where the square thumbnail sits on a catch photo ({ x, y } 0–100, or null for the middle). */
export const setCatchFocus = (id, focus) => write(cloud.api.updateDoc(ref("catches", id), { focus: focus || null, editedAt: Date.now() }));
export const setLeagueName = name => write(cloud.api.updateDoc(ref("config", "league"), { name: cleanName(name) || "Lunker League" }));
export const setLeagueStart = ms => write(cloud.api.updateDoc(ref("config", "league"), { startAt: Math.round(ms) }));
/* The home water ({ lat, lng, name }), or null to clear it. */
export const setLeagueHome = home => write(cloud.api.updateDoc(ref("config", "league"), { home: home || null }));
/* Weather for a catch (from Open-Meteo), or clear it so it's looked up again (its spot moved). */
export const saveWeather = (catchId, w) => write(cloud.api.setDoc(cloud.api.doc(cloud.db, "weather", catchId), { ...w, uid: uid(), fetchedAt: Date.now() }));
export const clearWeather = catchId => write(cloud.api.deleteDoc(cloud.api.doc(cloud.db, "weather", catchId)));
export const setGraceDays = days => write(cloud.api.updateDoc(ref("config", "league"), { graceDays: Math.max(0, Math.min(60, Math.round(days))) }));
export const setInviteCode = code => write(cloud.api.setDoc(ref("config", "invite"), { code: cleanCode(code) }));
export const setSuspended = (id, suspended) => write(cloud.api.updateDoc(ref("members", id), { suspended }));
export const removeMember = id => write(cloud.api.deleteDoc(ref("members", id)));
export function setAdmin(id, on) {
  const { arrayUnion, arrayRemove } = cloud.api;
  write(cloud.api.updateDoc(ref("config", "league"), { admins: on ? arrayUnion(id) : arrayRemove(id) }));
}

/* A readable random code like WALLEYE-4821. */
const CODE_WORDS = ["WALLEYE", "MUSKIE", "PIKE", "BASS", "PERCH", "CRAPPIE", "TROUT", "SALMON", "CATFISH", "STURGEON", "LUNKER", "HAWG"];
export function randomCode() {
  const n = crypto.getRandomValues(new Uint32Array(2));
  return `${CODE_WORDS[n[0] % CODE_WORDS.length]}-${1000 + (n[1] % 9000)}`;
}

/* ---------- Catches ---------- */
export const newCatchId = () => cloud.api.doc(cloud.api.collection(cloud.db, "catches")).id;

/* Saves a catch, its full photo, its small photo (thumbs/{id}) and (optionally) its GPS spot and tackle in one go.
   Works offline: the batch waits on the phone until there is signal. New catches also go in the outbox until the
   server confirms them. thumb: the small photo when the photo is new (the catch's `thumbAt` says which version it is).
   spot, tackle: an object to save, null to remove an existing one, undefined to leave it alone. */
export function saveCatch({ id, data, photo, thumb, spot, tackle, isNew }) {
  const { writeBatch, doc, deleteField } = cloud.api;
  const b = writeBatch(cloud.db);
  const me = uid();
  // Saved by an older version of the app (an outbox entry): the small photo was in the catch.
  if (data.thumb) { thumb = thumb || data.thumb; data = { ...data, thumbAt: data.thumbAt || Date.now() }; delete data.thumb; }
  if (thumb) {
    b.set(doc(cloud.db, "thumbs", id), { uid: me, src: thumb, at: data.thumbAt, bytes: thumb.length });
    thumbCache.set(id, { at: data.thumbAt, src: thumb });
    if (!isNew && (store.catches.get(id) || {}).thumb) data = { ...data, thumb: deleteField() }; // moved out of the catch
  }
  // When it was saved (the archive loads catches saved since it was built), and the catch's time on its tackle and spot
  // (they load from the archive's first year on).
  data = { ...data, editedAt: Date.now() };
  const at = data.caughtAt ?? (store.catches.get(id) || {}).caughtAt;
  const when = typeof at === "number" ? { at } : {};
  b.set(doc(cloud.db, "catches", id), data, isNew ? {} : { merge: true });
  if (photo) b.set(doc(cloud.db, "photos", id), { uid: me, src: photo, bytes: photo.length }); // size, for the storage meter
  if (spot) b.set(doc(cloud.db, "spots", id), { ...spot, uid: me, ...when });
  else if (spot === null) b.delete(doc(cloud.db, "spots", id));
  if (tackle) b.set(doc(cloud.db, "tackle", id), { ...tackle, uid: me, ...when });
  else if (tackle === null) b.delete(doc(cloud.db, "tackle", id));
  if (isNew) outboxPut({ id, uid: me, catchData: data, photo, thumb: thumb || null, spot: spot || null, tackle: tackle || null, savedAt: Date.now() });
  b.commit().catch(e => console.warn("Catch not saved", e)); // a refusal is picked up by checkOutbox()
}

/* A tombstone (gone/{id}) for something the archive may hold, so it doesn't come back from there. Only once there's an
   archive; the rules only allow one for something that no longer exists. */
function tomb(b, id, data) {
  if (!archiveOf()) return;
  b.set(cloud.api.doc(cloud.db, "gone", id), { ...data, uid: uid(), at: Date.now() });
}

export function deleteCatch(c) {
  const { writeBatch, doc } = cloud.api;
  const b = writeBatch(cloud.db);
  b.delete(doc(cloud.db, "catches", c.id));
  tomb(b, c.id, { kind: "catch" });
  b.delete(doc(cloud.db, "photos", c.id));
  if (c.thumbAt) b.delete(doc(cloud.db, "thumbs", c.id));
  if (c.hasSpot && store.spots.has(c.id)) b.delete(doc(cloud.db, "spots", c.id));
  if (c.hasTackle) b.delete(doc(cloud.db, "tackle", c.id));
  if (store.weather.has(c.id)) b.delete(doc(cloud.db, "weather", c.id));
  // Its comments and reactions go with it (the rules let a catch's angler or an admin remove them).
  for (const cm of store.comments.get(c.id) || []) b.delete(doc(cloud.db, "catches", c.id, "comments", cm.id));
  for (const who of (store.reactions.get(c.id) || new Map()).keys()) b.delete(doc(cloud.db, "catches", c.id, "reactions", who));
  outboxRemove(c.id);
  b.commit().catch(syncError);
}

/* ---------- Saved boats (the fleet) ---------- */
export const newFleetId = () => cloud.api.doc(cloud.api.collection(cloud.db, "fleet")).id;
/* photo: { full, thumb } for a new photo, null to remove it, undefined to leave it alone. */
export function saveFleetBoat(id, data, photo) {
  const { writeBatch, doc } = cloud.api;
  const b = writeBatch(cloud.db), me = uid(), old = store.fleet.get(id), createdAt = old ? old.createdAt : Date.now();
  // The captain history and any hand-over waiting to be accepted are kept as they are. A boat starts with no history
  // (its first captain is its owner from createdAt), so new boats save the same as before.
  const keep = old ? Object.fromEntries(["captains", "offerTo", "offerAt"].filter(k => k in old).map(k => [k, old[k]])) : {};
  b.set(doc(cloud.db, "fleet", id), { ...data, ...keep, uid: me, createdAt,
    thumb: photo ? photo.thumb : photo === null ? null : old ? old.thumb ?? null : null });
  if (photo) { b.set(doc(cloud.db, "fleetPhotos", id), { uid: me, src: photo.full, bytes: photo.full.length }); fleetPhotos.set(id, photo.full); }
  else if (photo === null && old && old.thumb) { b.delete(doc(cloud.db, "fleetPhotos", id)); fleetPhotos.delete(id); }
  b.commit().catch(syncError);
}
/* Handing a boat over: the captain offers it (to = a member's uid) or takes the offer back (to = null). */
export function offerFleetBoat(boat, to) {
  const { doc, updateDoc } = cloud.api;
  updateDoc(doc(cloud.db, "fleet", boat.id), { offerTo: to, offerAt: to ? Date.now() : null }).catch(syncError);
}
/* The angler it was offered to takes the helm with their crew, or turns it down. The boat keeps its catches. */
export function acceptFleetBoat(boat, crew) {
  const { doc, updateDoc } = cloud.api, me = uid();
  updateDoc(doc(cloud.db, "fleet", boat.id), { uid: me, crew: crew.filter(u => u !== me).slice(0, 20),
    captains: acceptedCaptains(boat, me, Date.now()), offerTo: null, offerAt: null }).catch(syncError);
}
export function declineFleetBoat(boat) {
  const { doc, updateDoc } = cloud.api;
  updateDoc(doc(cloud.db, "fleet", boat.id), { offerTo: null, offerAt: null }).catch(syncError);
}
export function deleteFleetBoat(boat) {
  const { writeBatch, doc } = cloud.api;
  const b = writeBatch(cloud.db);
  b.delete(doc(cloud.db, "fleet", boat.id));
  if (boat.thumb) b.delete(doc(cloud.db, "fleetPhotos", boat.id));
  fleetPhotos.delete(boat.id);
  b.commit().catch(syncError);
}
const fleetPhotos = new Map();
export const cachedFleetPhoto = id => fleetPhotos.get(id) || "";
export async function loadFleetPhoto(id) {
  if (fleetPhotos.has(id)) return fleetPhotos.get(id);
  const snap = await cloud.api.getDoc(cloud.api.doc(cloud.db, "fleetPhotos", id));
  const src = snap.exists() ? String(snap.data().src || "") : "";
  if (src) fleetPhotos.set(id, src);
  return src;
}

/* ---------- Personal goals ---------- */
export function saveGoal(id, data) {
  const { doc, collection, setDoc } = cloud.api;
  const ref = id ? doc(cloud.db, "goals", id) : doc(collection(cloud.db, "goals"));
  const old = id && store.goals.get(id);
  write(setDoc(ref, { ...data, uid: uid(), createdAt: old ? old.createdAt : Date.now() }));
  return ref.id;
}
export const deleteGoal = id => write(cloud.api.deleteDoc(cloud.api.doc(cloud.db, "goals", id)));

/* ---------- Profile cover photo (covers/{uid}, loaded when a profile is opened) ---------- */
export function saveCover(src) {
  const { writeBatch, doc } = cloud.api;
  const b = writeBatch(cloud.db);
  b.set(doc(cloud.db, "covers", uid()), { uid: uid(), src, bytes: src.length });
  b.update(doc(cloud.db, "members", uid()), { hasCover: true });
  coverCache.set(uid(), src);
  b.commit().catch(syncError);
}
export function removeCover() {
  const { writeBatch, doc } = cloud.api;
  const b = writeBatch(cloud.db);
  b.delete(doc(cloud.db, "covers", uid()));
  b.update(doc(cloud.db, "members", uid()), { hasCover: false });
  coverCache.delete(uid());
  b.commit().catch(syncError);
}
const coverCache = new Map();
export const cachedCover = id => coverCache.get(id) || "";
export async function loadCover(id) {
  if (coverCache.has(id)) return coverCache.get(id);
  const snap = await cloud.api.getDoc(cloud.api.doc(cloud.db, "covers", id));
  const src = snap.exists() ? String(snap.data().src || "") : "";
  if (src) coverCache.set(id, src);
  return src;
}

/* ---------- Tackle box ---------- */
export const newBoxItemId = () => cloud.api.doc(cloud.api.collection(cloud.db, "tackleBox")).id;
/* Saves an item. photo: { full, thumb } for a new photo, null to remove it, undefined to leave it alone. */
export function saveBoxItem(id, data, photo) {
  const { writeBatch, doc } = cloud.api;
  const b = writeBatch(cloud.db), me = uid();
  const old = store.box.get(id);
  const item = { ...data, uid: me, createdAt: old ? old.createdAt : Date.now(), retired: !!data.retired,
    thumb: photo ? photo.thumb : photo === null ? null : old ? old.thumb ?? null : null };
  b.set(doc(cloud.db, "tackleBox", id), item);
  if (photo) { b.set(doc(cloud.db, "tackleBoxPhotos", id), { uid: me, src: photo.full, bytes: photo.full.length }); boxPhotos.set(id, photo.full); }
  else if (photo === null && old && old.thumb) { b.delete(doc(cloud.db, "tackleBoxPhotos", id)); boxPhotos.delete(id); }
  b.commit().catch(syncError);
}
/* Deletes an item (catches keep its name). */
export function deleteBoxItem(item) {
  const { writeBatch, doc } = cloud.api;
  const b = writeBatch(cloud.db);
  b.delete(doc(cloud.db, "tackleBox", item.id));
  if (item.thumb) b.delete(doc(cloud.db, "tackleBoxPhotos", item.id));
  boxPhotos.delete(item.id);
  b.commit().catch(syncError);
}
const boxPhotos = new Map();
export const cachedBoxPhoto = id => boxPhotos.get(id) || "";
export async function loadBoxPhoto(id) {
  if (boxPhotos.has(id)) return boxPhotos.get(id);
  const snap = await cloud.api.getDoc(cloud.api.doc(cloud.db, "tackleBoxPhotos", id));
  const src = snap.exists() ? String(snap.data().src || "") : "";
  if (src) boxPhotos.set(id, src);
  return src;
}
/* Fills the box from lures typed on catches (tacklebox.js fillFromCatches works out what): new items, and each
   catch's tackle linked to its item. In batches of up to 450 writes. */
export async function fillBox({ add, link }) {
  const { writeBatch, doc } = cloud.api;
  const writes = [], me = uid(), now = Date.now();
  for (const a of add) {
    const id = newBoxItemId();
    writes.push(b => b.set(doc(cloud.db, "tackleBox", id), { uid: me, name: a.name, type: "", technique: a.technique || "",
      depthFt: a.depthFt || null, notes: "", thumb: null, retired: false, createdAt: now }));
    for (const cid of a.catchIds) writes.push(b => b.set(doc(cloud.db, "tackle", cid), { itemId: id }, { merge: true }));
  }
  for (const l of link) for (const cid of l.catchIds) writes.push(b => b.set(doc(cloud.db, "tackle", cid), { itemId: l.itemId }, { merge: true }));
  for (let i = 0; i < writes.length; i += 450) {
    const b = writeBatch(cloud.db);
    writes.slice(i, i + 450).forEach(w => w(b));
    await b.commit();
  }
}

/* Full-size photos load only when a catch is opened. Ones opened before are kept for offline use. */
const photoCache = new Map();
export const cachedPhoto = id => photoCache.get(id) || "";
export async function loadPhoto(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const snap = await cloud.api.getDoc(cloud.api.doc(cloud.db, "photos", id));
  const src = snap.exists() ? String(snap.data().src || "") : "";
  if (src) photoCache.set(id, src);
  return src;
}

/* Small photos (thumbs/{id}) load when they come on screen, once per phone: the phone's saved copy first (free), and
   from the server only when it isn't there or is an older version (the catch's `thumbAt`). Older catches still hold
   theirs (`thumb`) until the league owner moves them out. */
const thumbCache = new Map(); // catch id -> { at, src }
const thumbLoads = new Map(); // catch id -> the load in progress
export function thumbSrc(c) {
  if (!c) return "";
  if (c.thumb) return c.thumb;
  const t = thumbCache.get(c.id);
  return t && t.at === c.thumbAt ? t.src : "";
}
export function loadThumb(c) {
  const have = thumbSrc(c);
  if (have || !c || !c.thumbAt) return Promise.resolve(have);
  const key = `${c.id}@${c.thumbAt}`;
  if (thumbLoads.has(key)) return thumbLoads.get(key);
  const { doc, getDoc, getDocFromCache } = cloud.api;
  const ref = doc(cloud.db, "thumbs", c.id);
  const fresh = snap => snap.exists() && snap.data().at === c.thumbAt ? String(snap.data().src || "") : "";
  const p = getDocFromCache(ref).then(fresh, () => "")
    .then(src => src || (navigator.onLine ? getDoc(ref).then(fresh) : ""))
    .then(src => { if (src) thumbCache.set(c.id, { at: c.thumbAt, src }); return src; })
    .catch(() => "")
    .finally(() => thumbLoads.delete(key));
  thumbLoads.set(key, p);
  return p;
}

/* The league owner moves older catches' small photos out of the catch documents, a few at a time. Each catch is one
   small batch (its thumbs doc plus the catch without `thumb`), so a refusal only stops that one. onStep(done, total). */
export async function moveThumbs(onStep = () => {}) {
  const { writeBatch, doc, deleteField } = cloud.api;
  const list = [...store.catches.values()].filter(c => c.thumb && !store.pending.has(c.id));
  let done = 0, failed = 0;
  const one = async c => {
    const at = c.createdAt || Date.now();
    const b = writeBatch(cloud.db);
    b.set(doc(cloud.db, "thumbs", c.id), { uid: uid(), src: c.thumb, at, bytes: c.thumb.length });
    b.update(doc(cloud.db, "catches", c.id), { thumb: deleteField(), thumbAt: at });
    try { await b.commit(); thumbCache.set(c.id, { at, src: c.thumb }); done++; } catch (e) { console.warn("Thumbnail not moved", c.id, e); failed++; }
    onStep(done, list.length, failed);
  };
  for (let i = 0; i < list.length; i += 5) await Promise.all(list.slice(i, i + 5).map(one));
  return { done, failed, total: list.length };
}

/* ---------- The archive (admins) ---------- */
export const archiveInfo = archiveOf;
/* Catches the archive should hold but doesn't (caught before its first year, saved since it was built). */
export function archiveLate() {
  const arc = archiveOf();
  if (!arc || !L) return 0;
  const live = new Map(Object.values(L.catchSets).flatMap(set => [...set.docs]));
  return lateCatches(live, arc.y0, arc.at);
}
const SINCE_MARGIN = 14 * 24 * 3600 * 1000; // see refreshMemberListeners
/* Builds a new archive set from everything on this phone and switches the league to it. Needs signal and fresh data.
   1. Shared tackle and spots get their catch's time (`at`), so they can load from the archive's first year on.
   2. The parts are saved (archive/{set}_{i}).
   3. config/league.archive points to the new set, unless another admin's phone switched it meanwhile (then this set is
      removed again). The old set is removed. onStep(text). Returns { parts, catches } or { skipped }. */
export async function saveArchive(onStep = () => {}) {
  const { doc, writeBatch, setDoc, runTransaction, deleteDoc } = cloud.api;
  const old = archiveOf(), now = Date.now();
  const y0 = archiveYear(now, (store.league && store.league.graceDays) ?? 7);
  const need = [];
  for (const [name, m] of [["tackle", store.tackle], ["spots", store.spots]]) for (const [id, t] of m) {
    const c = store.catches.get(id);
    if (t.shared && c && typeof c.caughtAt === "number" && t.at !== c.caughtAt) need.push([name, id, c.caughtAt]);
  }
  for (let i = 0; i < need.length; i += 10) {
    const b = writeBatch(cloud.db);
    need.slice(i, i + 10).forEach(([name, id, at]) => b.update(doc(cloud.db, name, id), { at }));
    await b.commit();
    onStep(`Preparing tackle and spots: ${Math.min(i + 10, need.length)} of ${need.length}`);
  }
  const reactions = new Map([...store.reactions].map(([cid, by]) => [cid, new Map([...by].map(([u, emojis]) =>
    [u, { emojis, at: (store.reactionTimes.get(cid) || new Map()).get(u) || 0 }]))]));
  const parts = buildArchive({ catches: [...store.catches.values()], weather: store.weather, tackle: store.tackle, spots: store.spots,
    comments: store.comments, reactions, y0, at: now, by: uid() });
  for (const p of parts) {
    await setDoc(doc(cloud.db, "archive", `${now}_${p.i}`), p);
    onStep(`Saving the archive: part ${p.i + 1} of ${parts.length}`);
  }
  const leagueRef = doc(cloud.db, "config", "league");
  const switched = await runTransaction(cloud.db, async tx => {
    const cur = ((await tx.get(leagueRef)).data() || {}).archive;
    if (((cur && cur.at) || null) !== ((old && old.at) || null)) return false;
    tx.update(leagueRef, { archive: { at: now, since: now - SINCE_MARGIN, y0, of: parts.length, by: uid() } });
    return true;
  });
  const drop = (set, n) => Promise.all(Array.from({ length: n }, (_, i) => deleteDoc(doc(cloud.db, "archive", `${set}_${i}`)).catch(() => {})));
  if (!switched) { await drop(now, parts.length); return { skipped: true }; }
  if (old) await drop(old.at, old.of || 0);
  const before = yearStart(y0);
  return { parts: parts.length, catches: [...store.catches.values()].filter(c => c.caughtAt < before).length, y0 };
}

/* Compares the outbox with what the server has: confirmed catches leave the outbox; a catch that is neither on the
   server nor waiting to be sent was refused, so the app asks what to do with it. */
let checking = false;
async function checkOutbox() {
  if (checking) return;
  checking = true;
  try {
    const rejected = [];
    for (const e of await outboxAll()) {
      if (e.uid !== uid()) continue;
      if (store.catches.has(e.id)) { if (!store.pending.has(e.id)) outboxRemove(e.id); continue; }
      // With an archive, a catch saved with no signal long ago and sent since may be on the server but outside what
      // loads: look it up before calling it refused.
      if (archiveOf() && L) {
        const snap = await cloud.api.getDoc(cloud.api.doc(cloud.db, "catches", e.id)).catch(() => null);
        if (snap && snap.exists()) {
          const extra = L.catchSets.extra || { docs: new Map(), pending: new Set() };
          extra.docs.set(e.id, { id: e.id, ...snap.data() });
          L.catchSets.extra = extra;
          outboxRemove(e.id);
          compose("catches");
          continue;
        }
      }
      rejected.push(e);
    }
    const before = store.rejected.map(e => e.id).join();
    store.rejected = rejected;
    if (rejected.map(e => e.id).join() !== before) emit();
  } finally { checking = false; }
}

/* A refused catch: send it again (without anything that made it invalid), or let it go. */
export function retryRejected(entry, changes = {}) {
  store.rejected = store.rejected.filter(e => e.id !== entry.id);
  outboxRemove(entry.id);
  saveCatch({ id: newCatchId(), data: { ...entry.catchData, ...changes }, photo: entry.photo, thumb: entry.thumb || undefined, spot: entry.spot || undefined,
    tackle: entry.tackle || undefined, isNew: true });
  emit();
}
export function discardRejected(entry) {
  store.rejected = store.rejected.filter(e => e.id !== entry.id);
  outboxRemove(entry.id);
  emit();
}

/* ---------- Storage meter (admins) ---------- */
/* Photo totals from the server: { total, sized, sizedBytes }. Firestore adds up the saved sizes itself, so no photo
   is downloaded (it costs about one read per 1,000 photos). Needs signal. */
export async function photoStorage() {
  const { collection, query, where, getAggregateFromServer, count, sum } = cloud.api;
  const photos = collection(cloud.db, "photos");
  const [all, sized] = await Promise.all([
    getAggregateFromServer(photos, { n: count() }),
    getAggregateFromServer(query(photos, where("bytes", ">", 0)), { n: count(), bytes: sum("bytes") }),
  ]);
  // Tackle box photos (each saves its size too) are counted on top.
  const [box, covers, boats, thumbs] = await Promise.all([
    getAggregateFromServer(collection(cloud.db, "tackleBoxPhotos"), { n: count(), bytes: sum("bytes") }),
    getAggregateFromServer(collection(cloud.db, "covers"), { n: count(), bytes: sum("bytes") }),
    getAggregateFromServer(collection(cloud.db, "fleetPhotos"), { n: count(), bytes: sum("bytes") }),
    getAggregateFromServer(collection(cloud.db, "thumbs"), { n: count(), bytes: sum("bytes") }),
  ]);
  return { total: all.data().n, sized: sized.data().n, sizedBytes: sized.data().bytes || 0,
    tackleN: box.data().n, tackleBytes: (box.data().bytes || 0) + (boats.data().bytes || 0), coverN: covers.data().n, coverBytes: covers.data().bytes || 0,
    thumbN: thumbs.data().n, thumbBytes: thumbs.data().bytes || 0 };
}

/* ---------- Comments, reactions and chat ---------- */
const cleanText = (t, max) => String(t || "").replace(/\s+$/g, "").replace(/^\s+/g, "").slice(0, max);

/* `mentions`: ids of members @mentioned in the text (only saved when there are some). */
const withMentions = (data, mentions) => (mentions && mentions.length ? { ...data, mentions: mentions.slice(0, 20) } : data);
export function addComment(catchId, text, mentions) {
  const t = cleanText(text, 500);
  if (!t) return;
  const { doc, collection, setDoc } = cloud.api;
  write(setDoc(doc(collection(cloud.db, "catches", catchId, "comments")), withMentions({ uid: uid(), text: t, at: Date.now() }, mentions)));
}
export function deleteComment(catchId, id) {
  const b = cloud.api.writeBatch(cloud.db);
  b.delete(cloud.api.doc(cloud.db, "catches", catchId, "comments", id));
  tomb(b, id, { kind: "comment", cid: catchId });
  write(b.commit());
}

/* Turns one emoji on or off for this user on a catch. Each person has one small doc per catch. */
export function toggleReaction(catchId, emoji) {
  const mine = ((store.reactions.get(catchId) || new Map()).get(uid())) || [];
  const next = mine.includes(emoji) ? mine.filter(e => e !== emoji) : [...mine, emoji].slice(-8);
  const ref = cloud.api.doc(cloud.db, "catches", catchId, "reactions", uid());
  if (next.length) return write(cloud.api.setDoc(ref, { uid: uid(), emojis: next, at: Date.now() }));
  const b = cloud.api.writeBatch(cloud.db);
  b.delete(ref);
  tomb(b, `${catchId}_${uid()}`, { kind: "reaction", cid: catchId, who: uid() });
  write(b.commit());
}

/* League chat, or a derby's own chat when derbyId is given. */
const chatPath = derbyId => derbyId ? ["derbies", derbyId, "chat"] : ["chat"];
export function sendChat(text, derbyId, mentions) {
  const t = cleanText(text, 1000);
  if (!t) return;
  const { doc, collection, setDoc } = cloud.api;
  write(setDoc(doc(collection(cloud.db, ...chatPath(derbyId))), withMentions({ uid: uid(), text: t, at: Date.now() }, mentions)));
}
export const deleteChat = (id, derbyId) => write(cloud.api.deleteDoc(cloud.api.doc(cloud.db, ...chatPath(derbyId), id)));

/* A derby's chat is only listened to once someone opens it, then kept live. */
const derbyChatUnsubs = new Map();
export function watchDerbyChat(derbyId) {
  if (derbyChatUnsubs.has(derbyId) || !cloud.db) return;
  const { onSnapshot, collection, query, orderBy, limitToLast } = cloud.api;
  derbyChatUnsubs.set(derbyId, onSnapshot(query(collection(cloud.db, "derbies", derbyId, "chat"), orderBy("at"), limitToLast(100)), OPTS, snap => {
    seen("derbyChat:" + derbyId, snap);
    pendingOf["derbyChat:" + derbyId] = new Set(snap.docs.filter(d => d.metadata.hasPendingWrites).map(d => d.id));
    store.derbyChat.set(derbyId, snap.docs.map(d => ({ id: d.id, ...d.data() })));
    syncPending();
    emit();
  }, syncError));
}

/* ---------- Saved seasons ---------- */
/* Has every listener heard from the server (not just the phone's cache)? A season is only saved from fresh data. */
const SEASON_KEYS = ["league", "members", "catches", "derbies", "entrants", "scoring", "challenges", "seasons", "trips", "rsvps", "noShows",
  "reactions", "comments", "spotsShared", "fleet", "boats", "skunks"];
export const freshData = () => SEASON_KEYS.every(k => cloud.meta[k] && !cloud.meta[k].fromCache);
/* Saves a locked season, only if nobody has yet (two admins' phones may try at once). Needs signal. */
export function lockSeason(year, data) {
  const { runTransaction, doc } = cloud.api, ref = doc(cloud.db, "seasons", String(year));
  return runTransaction(cloud.db, async tx => { if (!(await tx.get(ref)).exists()) tx.set(ref, data); })
    .catch(e => console.warn("Season not saved", e));
}
/* The league owner can save a locked season again (after fixing a mistake). */
export const resaveSeason = (year, data) => write(cloud.api.setDoc(cloud.api.doc(cloud.db, "seasons", String(year)), data));

/* ---------- Derby series ---------- */
/* Admins only (the rules check). Returns the id. */
export function saveSeries(id, data) {
  const { doc, collection, setDoc } = cloud.api;
  const ref = id ? doc(cloud.db, "series", id) : doc(collection(cloud.db, "series"));
  write(setDoc(ref, data));
  return ref.id;
}
export const deleteSeries = id => write(cloud.api.deleteDoc(cloud.api.doc(cloud.db, "series", id)));

/* ---------- Trips (Outings in the app) ---------- */
export function saveTrip(id, data) {
  const { doc, collection, setDoc } = cloud.api;
  const ref = id ? doc(cloud.db, "trips", id) : doc(collection(cloud.db, "trips"));
  write(setDoc(ref, data));
  return ref.id;
}
/* Skunks: log a day out with no fish ("YYYY-MM-DD", one per day), or take one back. */
export function logSkunk(day, notes = "") {
  const id = `${uid()}_${day}`, old = store.skunks.get(id);
  write(cloud.api.setDoc(cloud.api.doc(cloud.db, "skunks", id),
    { uid: uid(), day, notes: String(notes).trim().slice(0, 200), createdAt: old ? old.createdAt : Date.now() }));
}
export function removeSkunk(day) {
  write(cloud.api.deleteDoc(cloud.api.doc(cloud.db, "skunks", `${uid()}_${day}`)));
}
/* Answers In / Maybe / Out. Staying In keeps your seat; anything else gives it up, and takes your own boat off. */
export function setRsvp(tripId, answer) {
  const { setDoc, deleteDoc, doc } = cloud.api;
  const prev = (store.rsvps.get(tripId) || new Map()).get(uid()) || {};
  const keep = answer === "in" && prev.answer === "in" && prev.boat ? { boat: prev.boat, seatAt: prev.seatAt || 0 } : {};
  write(setDoc(doc(cloud.db, "trips", tripId, "rsvps", uid()), { answer, at: Date.now(), ...keep }));
  if (answer !== "in" && (store.boats.get(tripId) || new Map()).has(uid())) write(deleteDoc(doc(cloud.db, "trips", tripId, "boats", uid())));
}
/* Takes a seat on a boat (its owner's uid), or gives it up (null). Taking a seat means you're In. */
export function setSeat(tripId, boatOwner) {
  write(cloud.api.setDoc(cloud.api.doc(cloud.db, "trips", tripId, "rsvps", uid()),
    boatOwner ? { answer: "in", at: Date.now(), boat: boatOwner, seatAt: Date.now() } : { answer: "in", at: Date.now() }));
}
/* Offers your boat (spare seats, not counting you) and puts you In, on it; or takes it off (seats 0). */
export function setBoat(tripId, seats, name = "", boatId = null) {
  const { setDoc, deleteDoc, doc } = cloud.api;
  const ref = doc(cloud.db, "trips", tripId, "boats", uid());
  if (!seats) return write(deleteDoc(ref));
  const prev = (store.boats.get(tripId) || new Map()).get(uid());
  write(setDoc(ref, { seats, name: String(name).trim().slice(0, 40), at: prev ? prev.at : Date.now(), boatId: boatId || null }));
  setSeat(tripId, null); // In, and not in anyone else's seat
}
/* Marks someone who said "In" as a no-show for an outing, or takes it back. */
export function setNoShow(tripId, who, on) {
  const { setDoc, deleteDoc, doc } = cloud.api;
  const ref = doc(cloud.db, "trips", tripId, "noShows", who);
  write(on ? setDoc(ref, { by: uid(), at: Date.now() }) : deleteDoc(ref));
}
/* The answers without the no-shows: who was really there (worked out once per change). */
let presentCache = { rsvps: null, noShows: null, value: null };
export function presentRsvps() {
  if (presentCache.rsvps !== store.rsvps || presentCache.noShows !== store.noShows)
    presentCache = { rsvps: store.rsvps, noShows: store.noShows, value: attended(store.rsvps, store.noShows) };
  return presentCache.value;
}
/* Deletes a trip, its boats and everyone's answers in one go. */
export function deleteTrip(id) {
  const { writeBatch, doc } = cloud.api;
  const b = writeBatch(cloud.db);
  for (const who of (store.rsvps.get(id) || new Map()).keys()) b.delete(doc(cloud.db, "trips", id, "rsvps", who));
  for (const owner of (store.boats.get(id) || new Map()).keys()) b.delete(doc(cloud.db, "trips", id, "boats", owner));
  for (const who of (store.noShows.get(id) || new Map()).keys()) b.delete(doc(cloud.db, "trips", id, "noShows", who));
  b.delete(doc(cloud.db, "trips", id));
  write(b.commit());
}

/* ---------- Derbies ---------- */
export function saveDerby(id, data) {
  const { doc, collection, setDoc } = cloud.api;
  const ref = id ? doc(cloud.db, "derbies", id) : doc(collection(cloud.db, "derbies"));
  write(setDoc(ref, data));
  return ref.id;
}
export const setDerbyCancelled = (id, cancelled) => write(cloud.api.updateDoc(cloud.api.doc(cloud.db, "derbies", id), { cancelled }));
/* Joins a derby (with a team, in a team derby). */
export const joinDerby = (id, team) => write(cloud.api.setDoc(cloud.api.doc(cloud.db, "derbies", id, "entrants", uid()),
  team ? { joinedAt: Date.now(), team } : { joinedAt: Date.now() }));
/* Puts an angler on a team: yourself before the derby starts, or anyone if you organise it. */
export const setTeam = (id, who, team) => write(cloud.api.updateDoc(cloud.api.doc(cloud.db, "derbies", id, "entrants", who), { team }));
export const leaveDerby = (id, who = uid()) => write(cloud.api.deleteDoc(cloud.api.doc(cloud.db, "derbies", id, "entrants", who)));
/* Entry fees: the organiser ticks who has paid (and who paid into the side pot). */
export function setPaid(derbyId, who, fields) {
  const f = { ...fields, paidMarkedBy: uid() };
  if ("paid" in fields) f.paidAt = fields.paid ? Date.now() : null;
  write(cloud.api.updateDoc(cloud.api.doc(cloud.db, "derbies", derbyId, "entrants", who), f));
}
/* Payouts: a tick per payee once they've been paid out. */
export function setSettled(derbyId, key, amount) {
  const ref = cloud.api.doc(cloud.db, "derbies", derbyId, "settlements", key);
  write(amount == null ? cloud.api.deleteDoc(ref) : cloud.api.setDoc(ref, { amount, settledAt: Date.now(), by: uid() }));
}
export function watchSettlements(derbyId) {
  if (derbyChatUnsubs.has("s:" + derbyId) || !cloud.db) return;
  const { onSnapshot, collection } = cloud.api;
  derbyChatUnsubs.set("s:" + derbyId, onSnapshot(collection(cloud.db, "derbies", derbyId, "settlements"), OPTS, snap => {
    seen("settlements:" + derbyId, snap);
    store.settlements.set(derbyId, new Map(snap.docs.map(d => [d.id, d.data()])));
    emit();
  }, syncError));
}

/* The mystery weight. The rules let the organiser (or an admin) read it any time, so they get it live. Everyone else
   can read it once final entries close: that's checked against the time of the request, and reads over the app's
   live connection can carry the time the connection opened, so they ask with a one-off transaction read instead
   (at most once a minute), and keep the answer on the phone for offline. */
const MYSTERY_KEY = id => "lunker-mystery-" + id;
const mysteryTried = new Map(); // derby id -> when last asked
export function watchMystery(derbyId, { live = false } = {}) {
  if (!cloud.db) return;
  if (!store.mystery.has(derbyId)) {
    try { const v = JSON.parse(localStorage.getItem(MYSTERY_KEY(derbyId)) || "null"); if (v) store.mystery.set(derbyId, v); } catch {}
  }
  if (live) {
    const key = "m:" + derbyId;
    if (derbyChatUnsubs.has(key)) return;
    const { onSnapshot, doc } = cloud.api;
    derbyChatUnsubs.set(key, onSnapshot(doc(cloud.db, "derbies", derbyId, "secret", "mystery"), OPTS, snap => {
      store.mystery.set(derbyId, snap.exists() ? snap.data() : null);
      emit();
    }, () => { const u = derbyChatUnsubs.get(key); derbyChatUnsubs.delete(key); if (u) u(); }));
    return;
  }
  if (store.mystery.has(derbyId) || Date.now() - (mysteryTried.get(derbyId) || 0) < 60000) return;
  mysteryTried.set(derbyId, Date.now());
  const { runTransaction, doc } = cloud.api;
  runTransaction(cloud.db, tx => tx.get(doc(cloud.db, "derbies", derbyId, "secret", "mystery"))).then(snap => {
    const v = snap.exists() ? snap.data() : null;
    store.mystery.set(derbyId, v);
    try { localStorage.setItem(MYSTERY_KEY(derbyId), JSON.stringify(v)); } catch {}
    emit();
  }).catch(() => {}); // no signal yet, or not closed yet: tried again on a later redraw
}
/* Sets (weight in ounces) or removes (null) the mystery weight. */
export function setMystery(derbyId, weightOz) {
  const { doc, setDoc, deleteDoc } = cloud.api;
  const ref = doc(cloud.db, "derbies", derbyId, "secret", "mystery");
  write(weightOz ? setDoc(ref, { weightOz, setBy: uid(), setAt: Date.now() }) : deleteDoc(ref));
}

/* Ends a running derby now (fishing over; the late-entry window still applies). */
export function endDerbyNow(id) {
  write(cloud.api.updateDoc(cloud.api.doc(cloud.db, "derbies", id), { end: Date.now() }));
}

/* Deletes a derby and everything that belongs to it: who joined, its chat, its payout ticks and, if asked,
   the catches entered in it (with their photos, spots, comments and reactions). Needs signal. */
export async function deleteDerby(d, { withEntries }) {
  const { doc, collection, getDocs, writeBatch } = cloud.api;
  const refs = [];
  if (withEntries) {
    for (const c of [...store.catches.values()].filter(x => x.derbyId === d.id)) {
      for (const cm of store.comments.get(c.id) || []) refs.push(doc(cloud.db, "catches", c.id, "comments", cm.id));
      for (const who of (store.reactions.get(c.id) || new Map()).keys()) refs.push(doc(cloud.db, "catches", c.id, "reactions", who));
      refs.push(doc(cloud.db, "photos", c.id));
      if (c.thumbAt) refs.push(doc(cloud.db, "thumbs", c.id));
      if (c.hasSpot) refs.push(doc(cloud.db, "spots", c.id));
      if (c.hasTackle) refs.push(doc(cloud.db, "tackle", c.id));
      if (store.weather.has(c.id)) refs.push(doc(cloud.db, "weather", c.id));
      refs.push(doc(cloud.db, "catches", c.id));
    }
  }
  for (const sub of ["chat", "settlements", "entrants", "secret"]) {
    for (const x of (await getDocs(collection(cloud.db, "derbies", d.id, sub))).docs) refs.push(x.ref);
  }
  refs.push(doc(cloud.db, "derbies", d.id)); // last, so the rules can still see the derby while clearing its parts
  // A batch holds up to 500 writes; the derby itself goes in the final one.
  for (let i = 0; i < refs.length; i += 450) {
    const b = writeBatch(cloud.db);
    refs.slice(i, i + 450).forEach(r => b.delete(r));
    await b.commit();
  }
  // Tombstones for its catches, once they're gone, so they don't come back from the archive.
  const gone = withEntries && archiveOf() ? refs.filter(r => r.parent.id === "catches") : [];
  for (let i = 0; i < gone.length; i += 400) {
    const b = writeBatch(cloud.db);
    gone.slice(i, i + 400).forEach(r => tomb(b, r.id, { kind: "catch" }));
    await b.commit();
  }
}

/* Bets: the organiser sets one up (and is in it unless they say not); players join or turn an invite down. */
export function saveBet(id, data, { join = false } = {}) {
  const ref = id ? cloud.api.doc(cloud.db, "bets", id) : cloud.api.doc(cloud.api.collection(cloud.db, "bets"));
  write(cloud.api.setDoc(ref, data));
  if (join) joinBet(ref.id, true);
  return ref.id;
}
export const setBetCancelled = (id, cancelled) => write(cloud.api.updateDoc(cloud.api.doc(cloud.db, "bets", id), { cancelled }));
export const joinBet = (id, on = true, side = null) =>
  write(cloud.api.setDoc(cloud.api.doc(cloud.db, "bets", id, "players", uid()), { at: Date.now(), in: on, ...(on && side != null ? { side } : {}) }));
export const leaveBet = (id, who = uid()) => write(cloud.api.deleteDoc(cloud.api.doc(cloud.db, "bets", id, "players", who)));
export function deleteBet(id) {
  const { writeBatch, doc } = cloud.api, b = writeBatch(cloud.db);
  for (const who of (store.betPlayers.get(id) || new Map()).keys()) b.delete(doc(cloud.db, "bets", id, "players", who));
  for (const who of (store.proofs.get(id) || new Map()).keys()) b.delete(doc(cloud.db, "bets", id, "proofs", who));
  b.delete(doc(cloud.db, "bets", id));
  b.commit().catch(syncError);
}

/* Proof photos for a bet the organiser settles: listened to only while that bet is open on screen (they're big). */
const proofUnsubs = new Map();
export function watchProofs(betId) {
  if (!cloud.db || proofUnsubs.has(betId)) return;
  const { onSnapshot, collection } = cloud.api;
  proofUnsubs.set(betId, onSnapshot(collection(cloud.db, "bets", betId, "proofs"), OPTS, snap => {
    store.proofs.set(betId, new Map(snap.docs.map(d => [d.id, d.data()])));
    emit();
  }, () => { const u = proofUnsubs.get(betId); proofUnsubs.delete(betId); if (u) u(); }));
}
export const sendProof = (betId, proof) => write(cloud.api.setDoc(cloud.api.doc(cloud.db, "bets", betId, "proofs", uid()), { ...proof, at: Date.now() }));
export const removeProof = (betId, who = uid()) => write(cloud.api.deleteDoc(cloud.api.doc(cloud.db, "bets", betId, "proofs", who)));
/* The organiser's call: who won (several split it), or a wash (no winners). null takes the call back. */
export function settleBet(betId, winners, side = null) {
  const { updateDoc, doc, deleteField } = cloud.api;
  write(updateDoc(doc(cloud.db, "bets", betId), { result: winners
    ? { winners, wash: side == null && !winners.length, at: Date.now(), by: uid(), ...(side != null ? { side } : {}) } : deleteField() }));
}

/* Head-to-head challenges. Offering one makes it the other angler's turn; they accept, decline or counter. */
export function sendChallenge(to, terms) {
  const ref = cloud.api.doc(cloud.api.collection(cloud.db, "challenges"));
  const now = Date.now();
  write(cloud.api.setDoc(ref, { from: uid(), to, terms, status: "open", turn: to, counters: 0, createdAt: now, updatedAt: now, vetoed: false }));
  return ref.id;
}
const challengeRef = id => cloud.api.doc(cloud.db, "challenges", id);
export const acceptChallenge = id => write(cloud.api.updateDoc(challengeRef(id), { status: "accepted", acceptedAt: Date.now(), updatedAt: Date.now() }));
export const declineChallenge = id => write(cloud.api.updateDoc(challengeRef(id), { status: "declined", updatedAt: Date.now() }));
export const withdrawChallenge = id => write(cloud.api.updateDoc(challengeRef(id), { status: "withdrawn", updatedAt: Date.now() }));
export function counterChallenge(ch, terms) {
  write(cloud.api.updateDoc(challengeRef(ch.id), { terms, turn: ch.from === uid() ? ch.to : ch.from, counters: (ch.counters || 0) + 1, updatedAt: Date.now() }));
}
export const vetoChallenge = (id, on) => write(cloud.api.updateDoc(challengeRef(id), { vetoed: on, vetoedAt: Date.now(), vetoedBy: uid() }));

/* Derbies with approval on: the organiser (or an admin) approves an entry, or takes the approval back. */
export function setApproved(catchId, on) {
  write(cloud.api.updateDoc(cloud.api.doc(cloud.db, "catches", catchId), on ? { approved: true, approvedAt: Date.now(), editedAt: Date.now() } : { approved: false, editedAt: Date.now() }));
}
export function setDisqualified(catchId, dq, reason = "") {
  write(cloud.api.updateDoc(cloud.api.doc(cloud.db, "catches", catchId), dq ? { dq: true, dqReason: cleanText(reason, 200), editedAt: Date.now() } : { dq: false, dqReason: "", editedAt: Date.now() }));
}

/* ---------- Ranking points ---------- */
/* mode "retro": the new values apply to all history. mode "forward": from now on; earlier events keep their values. */
export function saveScoring(values, mode, note) {
  const now = Date.now();
  const { doc, collection, setDoc } = cloud.api;
  write(setDoc(doc(collection(cloud.db, "scoring")), {
    mode, effectiveFrom: mode === "retro" ? 0 : now, createdAt: now, createdBy: uid(), note: String(note || "").trim().slice(0, 200), values,
  }));
}
