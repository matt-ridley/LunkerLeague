/* League admin: name, invite code, members and (owner only) admins. */
import { el, field, avatar, fmtDay, openSheet, closeSheet, toast, copyText, confirmButton, fill } from "./ui.js";
import { store, uid, isAdmin, isOwner, setLeagueName, setInviteCode, setSuspended, removeMember, setAdmin, randomCode, cleanCode, photoStorage, setGraceDays, setLeagueStart, setLeagueHome } from "./cloud.js";
import { pickOnMap } from "./mappick.js";
import { leagueStartOf } from "./stats.js";
import { estimateStorage, docsBytes, fmtBytes, FREE_BYTES } from "./storage.js";
import { parseEmails, inviteEmail, mailtoLink } from "./invite.js";

const appUrl = () => location.href.split("#")[0];
const publicUrl = () => location.origin + location.pathname; // without ?emulator or anything else

export function renderAdmin(main) {
  if (!isAdmin()) return fill(main, el("div", { class: "card" }, el("p", { text: "Only league admins can open this page." })));
  const L = store.league;
  const code = store.invite;

  const invite = el("section", { class: "card stack" },
    el("h3", { text: "Invite friends" }),
    el("p", { text: "Friends open the app, tap Join the league, and enter this code." }),
    el("div", { class: "invite-code", text: code === undefined ? "…" : code || "(none set)" }),
    el("div", { class: "row" },
      el("button", { class: "btn primary", type: "button", text: "Copy invite", onclick: async () => {
        const text = `Join ${L.name} on Lunker League! Open ${appUrl()} , tap "Join the league" and use invite code ${code}`;
        toast(await copyText(text) ? "Invite copied. Paste it into a text." : text);
      } }),
      el("button", { class: "btn", type: "button", text: "Change code", onclick: () => codeSheet(code) })),
    el("p", { class: "hint", text: "Changing the code stops new sign-ups with the old one. People already in the league stay in." }));

  const league = el("section", { class: "card stack" },
    el("h3", { text: "League" }),
    el("div", { class: "row spread" }, el("strong", { text: L.name }),
      el("button", { class: "btn small", type: "button", text: "Rename", onclick: renameSheet })),
    el("div", { class: "row spread" },
      el("span", {}, el("strong", { text: "League start: " }), fmtDay(leagueStartOf(L))),
      el("button", { class: "btn small", type: "button", text: "Change", onclick: startSheet })),
    el("div", { class: "row spread" },
      el("span", {}, el("strong", { text: "Late logging: " }), `${L.graceDays ?? 7} days`),
      el("button", { class: "btn small", type: "button", text: "Change", onclick: graceSheet })),
    el("p", { class: "hint", text: `Catches caught before the league start, or logged more than ${L.graceDays ?? 7} days after they were caught, are 📜 past catches: they count for PBs and the all-time records, not points, badges or crowns. Moving the start re-sorts every catch straight away. Changing the late-logging days only affects catches logged from now on.` }),
    el("div", { class: "row spread" },
      el("span", {}, el("strong", { text: "Home water: " }), L.home ? L.home.name || "Set on the map" : "Not set"),
      el("button", { class: "btn small", type: "button", text: L.home ? "Change" : "Set", onclick: homeSheet })),
    el("p", { class: "hint", text: "Where the league usually fishes. Catches without a tagged spot get their weather from here." }));

  const members = [...store.members.values()].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const list = el("section", { class: "card stack" },
    el("h3", { text: `Members (${members.length})` }),
    el("ul", { class: "member-list" }, ...members.map(m => {
      const owner = L.ownerUid === m.id, admin = (L.admins || []).includes(m.id);
      return el("li", { class: "member-row" + (m.suspended ? " paused" : "") },
        avatar(m),
        el("div", { class: "grow" },
          el("div", { class: "name", text: m.displayName + (m.id === uid() ? " (you)" : "") }),
          el("div", { class: "muted small", text: [owner ? "Owner" : admin ? "Admin" : "Member", `joined ${fmtDay(m.joinedAt || 0)}`, m.suspended ? "paused" : ""].filter(Boolean).join(" · ") })),
        owner || m.id === uid() ? null : el("button", { class: "btn small", type: "button", text: "Manage", onclick: () => memberSheet(m.id) }));
    })));

  const points = el("section", { class: "card stack" },
    el("h3", { text: "Ranking points" }),
    el("p", { text: "Change how many points catches, species, records and derbies are worth, with a preview before saving." }),
    el("a", { class: "btn block", href: "#/scoring", text: "Change points" }));
  fill(main, el("h2", { class: "page-title", text: "League admin" }), invite, isOwner() ? emailInvite(L, code) : null, league, storageMeter(), points, list);
}

/* ---------- Storage meter ---------- */
/* Photo totals come from the server (once per app session, or on Refresh); the rest is measured on this phone. */
let photoTotals = null, photoErr = "";
function storageMeter() {
  const box = el("section", { class: "card stack" }, el("h3", { text: "💾 Storage" }));
  const load = () => {
    photoErr = "";
    photoStorage().then(p => { photoTotals = p; draw(); })
      .catch(() => { photoErr = navigator.onLine ? "Couldn't check right now. Try again." : "Needs signal to check."; draw(); });
  };
  const draw = () => {
    const kids = [el("h3", { text: "💾 Storage" })];
    if (!photoTotals) {
      kids.push(el("p", { class: photoErr ? "msg err" : "muted", text: photoErr || "Checking…" }));
    } else {
      const docs = docsBytes(everyDoc()), e = estimateStorage({ photos: photoTotals, docs, catches: store.catches.size });
      const level = e.pct >= 90 ? "bad" : e.pct >= 75 ? "warn" : "ok";
      kids.push(
        el("div", { class: "meter", role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(e.pct), "aria-label": "Storage used" },
          el("span", { class: `meter-fill ${level}`, style: `width:${Math.max(1, e.pct)}%` })),
        el("p", {}, el("b", { text: `About ${fmtBytes(e.used)} of ${fmtBytes(FREE_BYTES)} used (${e.pct}%)` })),
        el("p", { text: e.catchesLeft ? `Room for about ${e.catchesLeft.toLocaleString()} more catches at about ${fmtBytes(e.perCatch)} each (photo included).` : "Full. New catches will be refused until space is freed." }),
        level !== "ok" ? el("p", { class: "msg err", text: "Getting full. Options: delete old test catches, or move to Firebase's Blaze plan (pennies a month at this size)." }) : null,
        el("p", { class: "hint", text: `${photoTotals.total.toLocaleString()} catch photos${photoTotals.tackleBytes ? `, tackle box and boat photos (${fmtBytes(photoTotals.tackleBytes)})` : ""}${photoTotals.coverN ? `, ${photoTotals.coverN.toLocaleString()} profile covers (${fmtBytes(photoTotals.coverBytes)})` : ""}. Firebase's free plan holds 1 GB. This is an estimate; the exact figure is in the Firebase console under Firestore → Usage.` }));
    }
    kids.push(el("button", { class: "btn small", type: "button", text: "Refresh", onclick: () => { photoTotals = null; draw(); load(); } }));
    fill(box, ...kids);
  };
  if (!photoTotals) load();
  draw();
  return box;
}

/* Everything else the league stores, from the copy on this phone (chat beyond the last 100 messages isn't on the
   phone, so it's slightly under-counted). */
function everyDoc() {
  const out = [...store.catches.values(), ...store.members.values(), ...store.derbies.values(), ...store.trips.values(),
    ...store.spots.values(), ...store.scoring, ...store.chat, ...store.box.values(), ...store.tackle.values(), ...store.weather.values()];
  for (const list of store.comments.values()) out.push(...list);
  for (const m of store.reactions.values()) for (const emojis of m.values()) out.push({ emojis, at: 0, uid: "" });
  for (const m of store.entrants.values()) for (const e of m.values()) out.push(e);
  for (const m of store.rsvps.values()) for (const r of m.values()) out.push(r);
  return out;
}

/* Owner only: email an invite. It opens in your own email app, written and ready to send. */
function emailInvite(L, code) {
  const to = el("input", { type: "email", inputmode: "email", autocapitalize: "off", autocomplete: "off", multiple: true,
    placeholder: "friend@example.com", "aria-label": "Friend's email address" });
  const msg = el("p", { class: "msg", role: "status" });
  const letter = () => inviteEmail({ league: L.name, code, url: publicUrl(), from: store.me && store.me.displayName });
  const send = el("button", { class: "btn primary block", type: "submit", text: "✉️ Write the invite email", disabled: !code });
  const form = el("form", { class: "stack", novalidate: true },
    field("Friend's email", to, "Add several separated by commas to invite a few at once."),
    msg, send,
    el("button", { class: "btn quiet block", type: "button", text: "No email app? Copy the whole invite", disabled: !code,
      onclick: async () => { const l = letter(); toast(await copyText(`${l.subject}\n\n${l.body}`) ? "Invite copied. Paste it into an email or text." : "Couldn't copy on this phone."); } }));
  form.addEventListener("submit", e => {
    e.preventDefault();
    const { emails, bad } = parseEmails(to.value);
    msg.className = "msg err";
    if (bad.length) { msg.textContent = `Check this address: ${bad.join(", ")}`; return; }
    if (!emails.length) { msg.textContent = "Enter your friend's email address."; return; }
    msg.className = "msg ok"; msg.textContent = "Opening your email app. Check it over, then tap Send.";
    location.href = mailtoLink(emails, letter());
  });
  return el("section", { class: "card stack" },
    el("h3", { text: "Email an invite" }),
    el("p", { text: "Writes an email for you: what Lunker League is, how to install it on iPhone and Android, how to sign up, and the invite code. It opens in your email app and comes from your address." }),
    code ? form : el("p", { class: "hint", text: "Set an invite code first." }));
}

function codeSheet(current) {
  openSheet(box => {
    const input = el("input", { type: "text", maxlength: 30, autocapitalize: "characters", value: current || "", "data-focus": "" });
    const form = el("form", { class: "stack" },
      el("h2", { text: "Invite code" }),
      field("New code", input, "At least 4 characters. Not case sensitive."),
      el("button", { class: "btn block", type: "button", text: "Make a random one", onclick: () => { input.value = randomCode(); } }),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        el("button", { class: "btn primary", type: "submit", text: "Save" })));
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (cleanCode(input.value).length < 4) return input.focus();
      setInviteCode(input.value); closeSheet(); toast("Invite code changed.");
    });
    box.append(form);
  });
}

/* Moving the league start: catches (and derbies) before it stop counting for points, badges and crowns; moving it
   earlier brings them back (unless they were logged too late). Shows how many catches change before saving. */
function startSheet() {
  const pad = n => String(n).padStart(2, "0");
  const toDate = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const current = leagueStartOf(store.league);
  openSheet(box => {
    const input = el("input", { type: "date", value: toDate(current), max: toDate(Date.now()), "data-focus": "" });
    const preview = el("p", { class: "msg" });
    const chosen = () => { const [y, m, d] = input.value.split("-").map(Number); return y ? new Date(y, m - 1, d).getTime() : NaN; };
    const draw = () => {
      const t = chosen();
      if (!isFinite(t)) { preview.textContent = ""; return; }
      const all = [...store.catches.values()].filter(c => !c.pastStored && !c.dq);
      const toPast = all.filter(c => c.caughtAt >= current && c.caughtAt < t).length;
      const toLeague = all.filter(c => c.caughtAt < current && c.caughtAt >= t).length;
      preview.className = "msg " + (toPast ? "err" : "ok");
      preview.textContent = toPast ? `${toPast === 1 ? "1 catch will become a 📜 past catch" : `${toPast} catches will become 📜 past catches`} and stop earning points, badges and crowns.`
        : toLeague ? `${toLeague === 1 ? "1 past catch will become a league catch" : `${toLeague} past catches will become league catches`} and start earning points, badges and crowns.`
        : "No catches change.";
    };
    input.addEventListener("input", draw); input.addEventListener("change", draw);
    const form = el("form", { class: "stack" },
      el("h2", { text: "League start" }),
      field("The league counts from", input, "Catches and derbies before this day count for PBs and the all-time records only."),
      preview,
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        el("button", { class: "btn primary", type: "submit", text: "Save" })));
    form.addEventListener("submit", e => {
      e.preventDefault();
      const t = chosen();
      if (!isFinite(t) || t > Date.now()) return input.focus();
      setLeagueStart(t); closeSheet(); toast(`The league now counts from ${fmtDay(t)}.`);
    });
    box.append(form);
    draw();
  });
}

function graceSheet() {
  openSheet(box => {
    const input = el("input", { type: "text", inputmode: "numeric", value: String(store.league.graceDays ?? 7), "data-focus": "" });
    const form = el("form", { class: "stack" },
      el("h2", { text: "Late logging" }),
      field("Days a catch can be logged late", input, "0 to 60. A catch logged later than this after it was caught is a past catch."),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        el("button", { class: "btn primary", type: "submit", text: "Save" })));
    form.addEventListener("submit", e => {
      e.preventDefault();
      const n = parseInt(input.value, 10);
      if (!(n >= 0 && n <= 60)) return input.focus();
      setGraceDays(n); closeSheet(); toast(`Catches can now be logged up to ${n} days late.`);
    });
    box.append(form);
  });
}

/* The home water: a name and a point on the map. */
function homeSheet() {
  const old = store.league.home || null;
  let at = old ? { lat: old.lat, lng: old.lng } : null;
  openSheet(box => {
    const name = el("input", { type: "text", maxlength: 60, autocapitalize: "words", placeholder: "e.g. Lake Simcoe", value: old ? old.name || "" : "" });
    const where = el("p", { class: "msg" });
    const drawWhere = () => { where.className = "msg " + (at ? "ok" : ""); where.textContent = at ? "📍 Picked on the map." : "Not picked yet."; };
    const form = el("form", { class: "stack" },
      el("h2", { text: "Home water" }),
      field("Name", name),
      el("button", { class: "btn", type: "button", text: "🗺️ Pick it on the map", onclick: async () => {
        const p = await pickOnMap(at, "Tap the middle of your home water");
        if (p) { at = { lat: p.lat, lng: p.lng }; drawWhere(); }
      } }),
      where,
      el("p", { class: "hint", text: "Weather for catches without a spot comes from here (Open-Meteo is sent the position rounded to about 1 km). Everyone in the league can see the name." }),
      el("div", { class: "row" },
        old ? el("button", { class: "btn", type: "button", text: "Clear", onclick: () => { setLeagueHome(null); closeSheet(); toast("Home water cleared."); } }) : null,
        el("button", { class: "btn primary", type: "submit", text: "Save" })));
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (!at) { where.className = "msg err"; where.textContent = "Pick it on the map first."; return; }
      setLeagueHome({ lat: Math.round(at.lat * 1e5) / 1e5, lng: Math.round(at.lng * 1e5) / 1e5, name: name.value.trim().slice(0, 60) });
      closeSheet(); toast("Home water saved.");
    });
    drawWhere();
    box.append(form);
  });
}

function renameSheet() {
  openSheet(box => {
    const input = el("input", { type: "text", maxlength: 40, autocapitalize: "words", value: store.league.name, "data-focus": "" });
    const form = el("form", { class: "stack" },
      el("h2", { text: "Rename league" }), field("League name", input),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        el("button", { class: "btn primary", type: "submit", text: "Save" })));
    form.addEventListener("submit", e => { e.preventDefault(); setLeagueName(input.value); closeSheet(); });
    box.append(form);
  });
}

function memberSheet(id) {
  const m = store.members.get(id);
  if (!m) return;
  const admin = (store.league.admins || []).includes(id);
  // Only the owner can pause or remove another admin.
  if (admin && !isOwner()) return openSheet(box => box.append(el("div", { class: "stack" },
    el("div", { class: "row" }, avatar(m, "lg"), el("h2", { text: m.displayName })),
    el("p", { text: `${m.displayName} is an admin. Only the league owner can change their account.` }),
    el("button", { class: "btn block", type: "button", text: "Close", onclick: closeSheet }))));
  openSheet(box => box.append(el("div", { class: "stack" },
    el("div", { class: "row" }, avatar(m, "lg"), el("h2", { text: m.displayName })),
    isOwner() ? el("button", { class: "btn block", type: "button", text: admin ? "Remove admin rights" : "Make admin",
      onclick: () => { setAdmin(id, !admin); closeSheet(); toast(admin ? `${m.displayName} is no longer an admin.` : `${m.displayName} is now an admin.`); } }) : null,
    el("button", { class: "btn block", type: "button", text: m.suspended ? "Switch account back on" : "Pause account",
      onclick: () => { setSuspended(id, !m.suspended); closeSheet(); } }),
    el("p", { class: "hint", text: "A paused member can't see or post anything until switched back on. Their catches stay." }),
    confirmButton("Remove from league", "Tap again to remove", () => {
      if (admin) setAdmin(id, false);
      removeMember(id); closeSheet(); toast(`${m.displayName} was removed. Change the invite code so they can't rejoin.`);
    }, "btn danger block"),
    el("button", { class: "btn quiet block", type: "button", text: "Close", onclick: closeSheet }))));
}
