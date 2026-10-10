/* System info (#/system): the connection behind the fish icon's colour, the app version, this phone, and league facts.
   Opened by tapping the fish icon at the top, or from your profile. */
import { VERSION, FIREBASE_SDK } from "./config.js";
import { el, fill, fmtDate, fmtAgo, fmtDay, fmtWeight, toast, icon } from "./ui.js";
import { store, cloud, syncStatus, openParts, USE_EMULATOR } from "./cloud.js";
import { outboxAll } from "./outbox.js";
import { fmtBytes } from "./storage.js";
import { storageMeter } from "./storagemeter.js";
import { getTheme } from "./theme.js";
import { statusText, leagueFacts } from "./sysinfo.js";
import { measure, openCost, freePlan, FREE_READS_DAY, FREE_DOWNLOAD_MONTH, OPENS_EACH } from "./usage.js";

const SDK = (FIREBASE_SDK.match(/\/(\d+\.\d+\.\d+)\//) || [])[1] || "?";
const THEME = { auto: "Auto (follows the phone)", day: "Day", dusk: "Dusk" };
const plural = (n, one, many = one + "s") => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const line = (k, v) => v == null ? null : el("div", { class: "fact" }, el("dt", { text: k }), el("dd", {}, v));
const tile = (n, label) => el("div", { class: "stat" }, el("b", { text: String(n) }), el("span", { text: label }));
const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

/* Filled in after the page draws (they're async), so the page never waits on them. */
function later(promise, fmt) {
  const span = el("span", { class: "muted", text: "Checking…" });
  promise.then(v => { span.className = ""; span.textContent = fmt(v); }).catch(() => { span.textContent = "Not available on this phone"; });
  return span;
}

function connection() {
  const s = syncStatus(), t = statusText(s.kind);
  const waiting = store.pending.size;
  return el("section", { class: "card stack" },
    el("div", { class: "row" },
      el("span", { class: `brand-mark status-${s.kind}`, html: icon.fish }),
      el("div", { class: "stack-tight" }, el("h3", { text: t.title }), el("span", { class: "muted small", text: `Since ${fmtAgo(s.since)}` }))),
    el("p", { text: t.text }),
    el("dl", { class: "facts" },
      line("Since", fmtDate(s.since)),
      line("Last synced", cloud.lastServerAt ? `${fmtDate(cloud.lastServerAt)} (${fmtAgo(cloud.lastServerAt)})` : "Not yet this time the app was opened"),
      line("Network", navigator.onLine ? "On" : "Off (no signal or airplane mode)"),
      line("Catches to send", waiting ? plural(waiting, "catch", "catches") : "None"),
      line("Changes to send", s.pending ? "Yes, they send when there's signal" : "None"),
      store.rejected.length ? line("Refused", plural(store.rejected.length, "catch", "catches")) : null,
      line("Outbox", later(outboxAll(), list => list.length ? `${plural(list.length, "catch", "catches")} kept until the league has them` : "Empty: the league has everything"))),
    el("p", { class: "hint", text: "The fish at the top shows this: green = connected, pulsing green = syncing, blue = offline (on the water), red = a sync problem." }));
}

function app() {
  return el("section", { class: "card stack" },
    el("h3", { text: "📱 App" }),
    el("dl", { class: "facts" },
      line("Version", VERSION),
      line("Installed", installed() ? "Yes, on the home screen" : "No, running in the browser"),
      line("Works offline", navigator.serviceWorker && navigator.serviceWorker.controller ? "Yes, ready" : "Not yet (reopen the app once)"),
      line("Firebase", `${SDK}${USE_EMULATOR ? " (test emulator)" : ""}`),
      line("Signed in as", cloud.user && cloud.user.email)),
    el("button", { class: "btn block", type: "button", text: "Check for an update", onclick: checkUpdate }));
}

/* App files are fetched fresh whenever there's signal, so the version on the site is the one a reload would give. */
async function checkUpdate() {
  if (!navigator.onLine) return toast("Needs signal to check.");
  toast("Checking…");
  try {
    const text = await (await fetch(`js/config.js?check=${Date.now()}`, { cache: "no-store" })).text();
    const live = (text.match(/VERSION = "([^"]+)"/) || [])[1];
    if (!live) throw new Error("No version");
    if (live === VERSION) return toast(`You're on the latest version (${VERSION}).`);
    toast(`Version ${live} is ready.`, { label: "Update", run: () => location.reload(), sticky: true });
  } catch { toast("Couldn't check right now. Try again."); }
}

function phone() {
  const est = navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.reject();
  const kept = navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : Promise.reject();
  return el("section", { class: "card stack" },
    el("h3", { text: "🔋 This phone" }),
    el("dl", { class: "facts" },
      line("Space used", later(est, e => fmtBytes(e.usage || 0))),
      line("Data protected", later(kept, p => p ? "Yes, the phone won't clear it when space runs low" : "No, the phone may clear it if space runs very low")),
      line("Screen", THEME[getTheme()] || getTheme())));
}

function league() {
  const f = leagueFacts({ catches: [...store.catches.values()], derbies: [...store.derbies.values()], trips: [...store.trips.values()],
    members: [...store.members.values()].filter(m => !m.suspended).length, league: store.league });
  const first = f.firstCatch;
  return [
    el("section", { class: "card stack" },
      el("h3", { text: `🏆 ${(store.league && store.league.name) || "The league"}` }),
      el("div", { class: "hero-stats plain" }, tile(f.members, "anglers"), tile(f.fish.toLocaleString(), "fish"), tile(f.species, "species")),
      el("dl", { class: "facts" },
        f.ageDays != null ? line("League age", `${plural(f.ageDays, "day")} (since ${fmtDay(store.league.createdAt)})`) : null,
        line("Catches logged", `${f.catches.toLocaleString()}${f.logbook ? ` + ${f.logbook.toLocaleString()} past (logbook)` : ""}`),
        line("Total weighed", f.weighed ? `${fmtWeight(f.weightOz)} across ${plural(f.weighed, "fish", "fish")}` : "Nothing weighed yet"),
        line("Derbies run", String(f.derbies)),
        line("Outings", String(f.outings)))),
    el("section", { class: "card stack" },
      el("h3", { text: "🎣 Fun facts" }),
      el("dl", { class: "facts" },
        line("Fish today", String(f.today)),
        line("Fish this week", String(f.week)),
        line("Most caught", f.topSpecies ? `${f.topSpecies.name} (${plural(f.topSpecies.fish, "fish", "fish")})` : "Nothing yet"),
        line("Busiest day", f.busiestDay || "Nothing yet"),
        line("First catch", first ? el("a", { href: `#/c/${first.id}`, text: `${first.species}, ${fmtDay(first.caughtAt)}` }) : "Nothing yet"))),
    storageMeter(),
    freePlanCard(),
  ];
}

/* "under 1 KB", "640 KB", "1.2 MB", "34 MB" */
const size = b => (b < 1024 ? "under 1 KB" : b < 1024 ** 2 ? `${Math.round(b / 1024)} KB` : b < 10 * 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : fmtBytes(b));

/* What opening the app costs against the free plan's daily reads and monthly downloads. */
function freePlanCard() {
  const cost = openCost(openParts(measure));
  const anglers = [...store.members.values()].filter(m => !m.suspended).length;
  const f = freePlan(cost, { anglers });
  const n = x => (isFinite(x) ? x.toLocaleString() : "lots of");
  const what = f.limit === "downloads" ? "downloads (10 GB a month)" : `reads (${FREE_READS_DAY.toLocaleString()} a day)`;
  return el("section", { class: "card stack" },
    el("h3", { text: "📶 Free plan" }),
    el("div", { class: "hero-stats plain" },
      tile(cost.docs.toLocaleString(), "reads per open"), tile(size(cost.bytes), "per open"), tile(n(f.opensPerDay), "opens a day")),
    el("div", { class: "meter", role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.min(100, f.pct)), "aria-label": "A busy day's share of the free plan" },
      el("span", { class: `meter-fill ${f.level}`, style: `width:${Math.max(1, Math.min(100, f.pct))}%` })),
    el("p", {}, el("b", { text: `A busy day uses about ${isFinite(f.pct) ? f.pct : "over 100"}% of the free plan.` }),
      ` That's ${plural(anglers, "angler")} opening the app ${OPENS_EACH} times each (${f.busyDay.toLocaleString()} opens); the league can open it about ${n(f.opensPerDay)} times a day before the ${what} run out.`),
    f.level !== "ok" ? el("p", { class: "msg err", text: f.level === "bad"
      ? "Over the free plan on a busy day. The app goes offline until the limit resets (reads at midnight Pacific time, downloads monthly); nothing is lost."
      : "Getting close on a busy day. The roadmap's optimizations fix this." }) : null,
    el("dl", { class: "facts" },
      line("Reads allow", `${n(f.byReads)} opens a day`),
      line("Downloads allow", `${n(f.byDownloads)} opens a day (${FREE_DOWNLOAD_MONTH / 1024 ** 3} GB a month)`),
      ...cost.parts.filter(p => p.docs).slice(0, 6).map(p => line(p.label, `${plural(p.docs, "doc")} · ${size(p.bytes)}`))),
    el("p", { class: "hint", text: "An estimate from what this phone downloaded. Opening the app after about 30 minutes away reads everything again (most opens); sooner, only what changed. Small photos load as they come on screen (once per phone) and full photos when a catch is opened, on top of this. The real numbers are in the Firebase console: Firestore Database → Usage." }));
}

export function renderSystem(main) {
  fill(main, el("h2", { class: "page-title", text: "System info" }), connection(), app(), phone(), ...league());
}
