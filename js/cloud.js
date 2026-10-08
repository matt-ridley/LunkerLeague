/* Firebase: sign-in, live listeners and writes.
   Everything is mirrored into `store`, and every change calls the subscribers so the screen re-renders.
   Firestore's persistent cache keeps a copy on the phone, so the app opens and accepts changes with no signal;
   queued writes are sent when the phone is back online. Times are stored as epoch milliseconds from the phone clock. */
import { FIREBASE_CONFIG, FIREBASE_SDK } from "./config.js";
import { outboxPut, outboxRemove, outboxAll } from "./outbox.js";
import { leagueStartOf } from "./stats.js";

/* Add ?emulator to a localhost address to use the local Firebase emulator (npm run emulators) instead of the real project. */
export const USE_EMULATOR = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has("emulator");

export const cloud = {
  on: !!FIREBASE_CONFIG, api: null, db: null, auth: null,
  user: null, authKnown: false, failed: false, loadError: false,
  meta: {}, unsubs: [], memberUnsubs: [], retry: null,
};

export const store = {
  league: undefined,      // undefined = not loaded yet, null = no league yet (confirmed by the server)
  leagueFromCache: true,
  me: undefined,          // this user's member doc; null = not a member
  meFromCache: true,
  members: new Map(),     // uid -> member
  invite: undefined,      // current invite code (admins only)
  catches: new Map(),     // id -> catch (with a small thumbnail)
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
  series: new Map(),      // id -> season series (Angler of the Year)
  rsvps: new Map(),       // trip id -> Map(uid -> { answer: "in" | "maybe" | "out", at, boat, seatAt })
  boats: new Map(),       // trip id -> Map(owner uid -> { seats, name, at })
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
  if (!cloud.on || !cloud.user) return { kind: "off", label: "" };
  if (cloud.failed) return { kind: "bad", label: "Sync problem" };
  const m = Object.values(cloud.meta);
  const pending = m.some(x => x.hasPendingWrites);
  if (!navigator.onLine || m.some(x => x.fromCache)) return { kind: "offline", label: pending ? "Offline · changes waiting" : "Offline" };
  if (pending) return { kind: "busy", label: "Syncing" };
  return { kind: "live", label: "Live" };
}
window.addEventListener("online", emit);
window.addEventListener("offline", emit);

/* ---------- Listeners ---------- */
/* Ids of comments and chat messages still waiting to reach the server, per listener. */
let pendingOf = {};
function syncPending() { store.pendingIds = new Set(Object.values(pendingOf).flatMap(set => [...set])); }
const OPTS = { includeMetadataChanges: true };
const seen = (key, snap) => { cloud.meta[key] = snap.metadata; cloud.failed = false; };

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

/* Collections only members can read, started once this user is a member (and stopped if that changes). */
let memberKey = "";
function refreshMemberListeners() {
  const member = !!(store.me && !store.me.suspended);
  const key = member ? (isAdmin() ? "admin" : "member") : "";
  if (key === memberKey) return;
  memberKey = key;
  cloud.memberUnsubs.forEach(u => u());
  cloud.memberUnsubs = [];
  for (const k of Object.keys(cloud.meta)) if (k !== "league" && k !== "me") delete cloud.meta[k];
  derbyChatUnsubs.forEach(u => u()); derbyChatUnsubs.clear();
  store.members = new Map(); store.invite = undefined;
  store.catches = new Map(); store.catchesLoaded = false; store.pending = new Set(); store.spots = new Map(); store.tackle = new Map();
  resetSocial();
  if (!member) return;
  const { onSnapshot, collection, collectionGroup, doc, query, where, orderBy, limitToLast } = cloud.api;
  // Comments and reactions of every catch, kept under the catch they belong to.
  cloud.memberUnsubs.push(onSnapshot(collectionGroup(cloud.db, "comments"), OPTS, snap => {
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
    for (const list of by.values()) list.sort((a, b) => (a.at || 0) - (b.at || 0));
    store.comments = by; syncPending();
    emit();
  }, syncError));
  cloud.memberUnsubs.push(onSnapshot(collectionGroup(cloud.db, "reactions"), OPTS, snap => {
    seen("reactions", snap);
    const by = new Map(), times = new Map();
    for (const d of snap.docs) {
      const catchId = d.ref.parent.parent && d.ref.parent.parent.id;
      if (!catchId) continue;
      const emojis = Array.isArray(d.data().emojis) ? d.data().emojis : [];
      if (!emojis.length) continue;
      if (!by.has(catchId)) { by.set(catchId, new Map()); times.set(catchId, new Map()); }
      by.get(catchId).set(d.id, emojis);
      times.get(catchId).set(d.id, d.data().at || 0);
    }
    store.reactions = by; store.reactionTimes = times;
    emit();
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
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "weather"), OPTS, snap => {
    seen("weather", snap);
    store.weather = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    emit();
  }, syncError));
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
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "catches"), OPTS, snap => {
    seen("catches", snap);
    const pending = new Set();
    store.catches = withPast(snap.docs.map(d => {
      if (d.metadata.hasPendingWrites) pending.add(d.id);
      return { id: d.id, ...d.data() };
    }));
    store.pending = pending;
    store.catchesLoaded = true;
    if (!snap.metadata.fromCache) checkOutbox();
    emit();
  }, syncError));
  // Spots: everyone's shared ones, and all of your own. Other people's private spots never reach this phone.
  const spotSets = { spotsShared: new Map(), spotsMine: new Map() };
  const spotListener = (key, q) => onSnapshot(q, OPTS, snap => {
    seen(key, snap);
    spotSets[key] = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    store.spots = new Map([...spotSets.spotsShared, ...spotSets.spotsMine]);
    emit();
  }, syncError);
  cloud.memberUnsubs.push(
    spotListener("spotsShared", query(collection(cloud.db, "spots"), where("shared", "==", true))),
    spotListener("spotsMine", query(collection(cloud.db, "spots"), where("uid", "==", uid()))));
  // Tackle, the same way: everyone's shared tackle, and all of your own (secret tackle never reaches anyone else).
  const tackleSets = { tackleShared: new Map(), tackleMine: new Map() };
  const tackleListener = (key, q) => onSnapshot(q, OPTS, snap => {
    seen(key, snap);
    tackleSets[key] = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    store.tackle = new Map([...tackleSets.tackleShared, ...tackleSets.tackleMine]);
    emit();
  }, syncError);
  cloud.memberUnsubs.push(
    tackleListener("tackleShared", query(collection(cloud.db, "tackle"), where("shared", "==", true))),
    tackleListener("tackleMine", query(collection(cloud.db, "tackle"), where("uid", "==", uid()))));
  cloud.memberUnsubs.push(onSnapshot(collection(cloud.db, "members"), OPTS, snap => {
    seen("members", snap);
    if (snap.docChanges().length || !store.members.size) {
      store.members = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    }
    emit();
  }, syncError));
  if (key === "admin") {
    cloud.memberUnsubs.push(onSnapshot(doc(cloud.db, "config", "invite"), OPTS, snap => {
      seen("invite", snap);
      store.invite = snap.exists() ? String(snap.data().code || "") : "";
      emit();
    }, syncError));
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
  cloud.meta = {};
  store.league = undefined; store.me = undefined; store.members = new Map(); store.invite = undefined;
  store.catches = new Map(); store.catchesLoaded = false; store.pending = new Set(); store.spots = new Map(); store.tackle = new Map(); store.rejected = [];
  resetSocial();
}

function resetSocial() {
  pendingOf = { comments: new Set(), chat: new Set() };
  store.comments = new Map(); store.reactions = new Map(); store.reactionTimes = new Map(); store.chat = []; store.chatLoaded = false; store.pendingIds = new Set();
  store.derbies = new Map(); store.derbiesFromServer = false; store.entrants = new Map(); store.derbyChat = new Map(); store.settlements = new Map(); store.mystery = new Map(); store.scoring = [];
  store.skunks = new Map(); store.weather = new Map(); store.box = new Map(); store.goals = new Map(); store.fleet = new Map();
  store.trips = new Map(); store.rsvps = new Map(); store.boats = new Map(); store.series = new Map(); store.challenges = new Map(); store.bets = new Map(); store.betPlayers = new Map(); store.proofs = new Map();
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

/* Saves a catch, its full photo and (optionally) its GPS spot and tackle in one go. Works offline: the batch waits on
   the phone until there is signal. New catches also go in the outbox until the server confirms them.
   spot, tackle: an object to save, null to remove an existing one, undefined to leave it alone. */
export function saveCatch({ id, data, photo, spot, tackle, isNew }) {
  const { writeBatch, doc } = cloud.api;
  const b = writeBatch(cloud.db);
  const me = uid();
  b.set(doc(cloud.db, "catches", id), data, isNew ? {} : { merge: true });
  if (photo) b.set(doc(cloud.db, "photos", id), { uid: me, src: photo, bytes: photo.length }); // size, for the storage meter
  if (spot) b.set(doc(cloud.db, "spots", id), { ...spot, uid: me });
  else if (spot === null) b.delete(doc(cloud.db, "spots", id));
  if (tackle) b.set(doc(cloud.db, "tackle", id), { ...tackle, uid: me });
  else if (tackle === null) b.delete(doc(cloud.db, "tackle", id));
  if (isNew) outboxPut({ id, uid: me, catchData: data, photo, spot: spot || null, tackle: tackle || null, savedAt: Date.now() });
  b.commit().catch(e => console.warn("Catch not saved", e)); // a refusal is picked up by checkOutbox()
}

export function deleteCatch(c) {
  const { writeBatch, doc } = cloud.api;
  const b = writeBatch(cloud.db);
  b.delete(doc(cloud.db, "catches", c.id));
  b.delete(doc(cloud.db, "photos", c.id));
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
  const b = writeBatch(cloud.db), me = uid(), old = store.fleet.get(id);
  b.set(doc(cloud.db, "fleet", id), { ...data, uid: me, createdAt: old ? old.createdAt : Date.now(),
    thumb: photo ? photo.thumb : photo === null ? null : old ? old.thumb ?? null : null });
  if (photo) { b.set(doc(cloud.db, "fleetPhotos", id), { uid: me, src: photo.full, bytes: photo.full.length }); fleetPhotos.set(id, photo.full); }
  else if (photo === null && old && old.thumb) { b.delete(doc(cloud.db, "fleetPhotos", id)); fleetPhotos.delete(id); }
  b.commit().catch(syncError);
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
      if (store.catches.has(e.id)) { if (!store.pending.has(e.id)) outboxRemove(e.id); }
      else rejected.push(e);
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
  saveCatch({ id: newCatchId(), data: { ...entry.catchData, ...changes }, photo: entry.photo, spot: entry.spot || undefined,
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
  const [box, covers, boats] = await Promise.all([
    getAggregateFromServer(collection(cloud.db, "tackleBoxPhotos"), { n: count(), bytes: sum("bytes") }),
    getAggregateFromServer(collection(cloud.db, "covers"), { n: count(), bytes: sum("bytes") }),
    getAggregateFromServer(collection(cloud.db, "fleetPhotos"), { n: count(), bytes: sum("bytes") }),
  ]);
  return { total: all.data().n, sized: sized.data().n, sizedBytes: sized.data().bytes || 0,
    tackleN: box.data().n, tackleBytes: (box.data().bytes || 0) + (boats.data().bytes || 0), coverN: covers.data().n, coverBytes: covers.data().bytes || 0 };
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
export const deleteComment = (catchId, id) => write(cloud.api.deleteDoc(cloud.api.doc(cloud.db, "catches", catchId, "comments", id)));

/* Turns one emoji on or off for this user on a catch. Each person has one small doc per catch. */
export function toggleReaction(catchId, emoji) {
  const mine = ((store.reactions.get(catchId) || new Map()).get(uid())) || [];
  const next = mine.includes(emoji) ? mine.filter(e => e !== emoji) : [...mine, emoji].slice(-8);
  const ref = cloud.api.doc(cloud.db, "catches", catchId, "reactions", uid());
  write(next.length ? cloud.api.setDoc(ref, { uid: uid(), emojis: next, at: Date.now() }) : cloud.api.deleteDoc(ref));
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

/* ---------- Season series ---------- */
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
/* Deletes a trip, its boats and everyone's answers in one go. */
export function deleteTrip(id) {
  const { writeBatch, doc } = cloud.api;
  const b = writeBatch(cloud.db);
  for (const who of (store.rsvps.get(id) || new Map()).keys()) b.delete(doc(cloud.db, "trips", id, "rsvps", who));
  for (const owner of (store.boats.get(id) || new Map()).keys()) b.delete(doc(cloud.db, "trips", id, "boats", owner));
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
  write(cloud.api.updateDoc(cloud.api.doc(cloud.db, "catches", catchId), on ? { approved: true, approvedAt: Date.now() } : { approved: false }));
}
export function setDisqualified(catchId, dq, reason = "") {
  write(cloud.api.updateDoc(cloud.api.doc(cloud.db, "catches", catchId), dq ? { dq: true, dqReason: cleanText(reason, 200) } : { dq: false, dqReason: "" }));
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
