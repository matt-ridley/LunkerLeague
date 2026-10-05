/* Profile: your own (with edit, theme and sign out) or another member's. */
import { el, field, avatar, fmtDay, openSheet, closeSheet, toast, icon, fill } from "./ui.js";
import { store, uid, isAdmin, updateMe, signOut, syncStatus } from "./cloud.js";
import { squareAvatar, pickImage } from "./photos.js";
import { VERSION } from "./config.js";
import { getTheme, setTheme } from "./theme.js";
import { pbWall } from "./catches.js";
import { rankings, badgesFor } from "./rank.js";
import { rankInput, howPointsSheet } from "./leaders.js";
import { crownScore } from "./crowns.js";
import { BADGES } from "./badges.js";

/* Every badge: the ones earned (with when), then the rest with how to get them. */
function badgeSheet(m, input) {
  const earned = new Map(input.badges.filter(b => b.uid === m.id).map(b => [b.badge.id, b.at]));
  const row = b => el("li", { class: "badge-line" + (earned.has(b.id) ? " got" : "") },
    el("span", { class: "badge-line-icon", text: b.icon }),
    el("span", { class: "grow" }, el("b", { text: b.name }), el("span", { class: "muted small", text: b.desc })),
    earned.has(b.id) ? el("span", { class: "muted small", text: fmtDay(earned.get(b.id)) }) : null);
  const got = BADGES.filter(b => earned.has(b.id)).sort((a, b) => earned.get(b.id) - earned.get(a.id)), todo = BADGES.filter(b => !earned.has(b.id));
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: `🏅 ${m.displayName}'s badges` }),
    el("p", { class: "muted", text: `${got.length} of ${BADGES.length}. Badges are kept for good, and each one is worth points.` }),
    got.length ? el("ul", { class: "badge-list" }, ...got.map(row)) : null,
    todo.length ? el("h3", { text: "Still to earn" }) : null,
    todo.length ? el("ul", { class: "badge-list" }, ...todo.map(row)) : null,
    el("button", { class: "btn quiet block", type: "button", text: "Close", onclick: closeSheet }))));
}

export function renderProfile(main, id) {
  const mine = !id || id === uid();
  const m = mine ? { ...store.me, id: uid() } : store.members.get(id);
  if (!m) return fill(main, el("div", { class: "card" }, el("p", { text: "That member isn't in the league any more." })));

  const head = el("section", { class: "profile-head" },
    avatar(m, "xl"),
    el("div", {},
      el("h2", { text: m.displayName }),
      m.homeWater ? el("p", { class: "muted", text: `Home water: ${m.homeWater}` }) : null,
      el("p", { class: "muted small", text: `Joined ${fmtDay(m.joinedAt || Date.now())}` }),
      store.league && (store.league.admins || []).includes(m.id) ? el("span", { class: "chip gold", text: store.league.ownerUid === m.id ? "League owner" : "Admin" }) : null));

  const input = rankInput(), rows = rankings(input);
  const place = rows.findIndex(r => r.uid === m.id), me = rows[place];
  const badges = badgesFor(m.id, input);
  const rankCard = me ? el("button", { type: "button", class: "rank-card", onclick: howPointsSheet },
    el("div", {}, el("div", { class: "eyebrow", text: "Angler rank" }), el("div", { class: "rank-card-title", text: me.title })),
    el("div", { class: "rank-card-pts" }, el("b", { text: String(me.points) }), el("span", { text: `pts · #${place + 1} of ${rows.length}` }))) : null;
  const badgeRow = el("button", { type: "button", class: "badge-row badge-btn", "aria-label": `Badges: ${badges.length} of ${BADGES.length}. Show all`,
    onclick: () => badgeSheet(m, input) },
    el("span", { class: "eyebrow badge-count", text: `🏅 ${badges.length} of ${BADGES.length} badges · see all` }),
    ...(badges.length
      ? badges.map(b => el("span", { class: "trophy", title: b.name }, el("span", { text: b.icon }), el("small", { text: b.name })))
      : [el("span", { class: "muted small", text: "No badges yet. First Fish is one catch away!" })]));
  // Crowns held right now (they can be stolen, unlike badges).
  const held = input.crowns.filter(s => s.holder === m.id);
  const crownRow = held.length ? el("a", { class: "crown-row", href: "#/leaders", onclick: () => { try { sessionStorage.setItem("lunker-leaders-tab", "crowns"); } catch {} } },
    el("span", { class: "eyebrow", text: `👑 ${held.length} crown${held.length === 1 ? "" : "s"}` }),
    el("span", { class: "badge-row" }, ...held.map(s => el("span", { class: "trophy crown", title: `${s.crown.name}: ${crownScore(s.crown, s.score)}` },
      el("span", { text: s.crown.icon }), el("small", { text: s.crown.name }))))) : null;
  const parts = [head, rankCard, crownRow, badgeRow, ...pbWall(m.id)];

  if (mine) {
    parts.push(el("section", { class: "card stack" },
      el("h3", { text: "Your profile" }),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", html: icon.camera, onclick: () => changePhoto(true) }, "Camera"),
        el("button", { class: "btn", type: "button", html: icon.image, onclick: () => changePhoto(false) }, "Gallery")),
      m.avatar ? el("button", { class: "btn quiet", type: "button", text: "Remove photo", onclick: () => updateMe({ avatar: null }) }) : null,
      el("button", { class: "btn", type: "button", text: "Edit name and home water", onclick: editSheet })));

    const theme = getTheme();
    parts.push(el("section", { class: "card stack" },
      el("h3", { text: "Screen" }),
      el("div", { class: "seg wide" }, ...[["auto", "Auto"], ["day", "Day"], ["dusk", "Dusk"]].map(([k, label]) =>
        el("button", { type: "button", "aria-pressed": String(theme === k), text: label, onclick: () => { setTheme(k); renderProfile(main, id); } }))),
      el("p", { class: "hint", text: "Day is high contrast for bright sun. Dusk is darker and easy on the eyes at dawn and dusk. Auto follows the phone." })));

    parts.push(el("section", { class: "stack" },
      isAdmin() ? el("a", { class: "btn block", href: "#/admin", html: icon.shield }, "League admin") : null,
      el("button", { class: "btn quiet block", type: "button", text: "Sign out", onclick: confirmSignOut })));
  }

  parts.push(el("footer", { class: "credit" },
    el("span", { text: `Lunker League v${VERSION}${VERSION.startsWith("0.") ? " (beta)" : ""}` }),
    el("span", { text: "Built by Matt Ridley" })));
  fill(main, ...parts);
}

async function changePhoto(camera) {
  const file = await pickImage({ camera, facing: "user" });
  if (!file) return;
  try { updateMe({ avatar: await squareAvatar(file) }); toast("Photo updated."); }
  catch { toast("That file couldn't be opened as a photo."); }
}

function editSheet() {
  openSheet(box => {
    const name = el("input", { type: "text", maxlength: 40, autocapitalize: "words", value: store.me.displayName || "", "data-focus": "" });
    const water = el("input", { type: "text", maxlength: 60, autocapitalize: "words", value: store.me.homeWater || "", placeholder: "e.g. Lake Simcoe" });
    const form = el("form", { class: "stack" },
      el("h2", { text: "Edit profile" }),
      field("Name in the league", name),
      field("Home water (optional)", water, "Shown on your profile. Keep it vague if you like."),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        el("button", { class: "btn primary", type: "submit", text: "Save" })));
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (!name.value.trim()) return name.focus();
      updateMe({ displayName: name.value, homeWater: water.value });
      closeSheet();
    });
    box.append(form);
  });
}

function confirmSignOut() {
  const s = syncStatus();
  const waiting = s.label.includes("waiting") || s.kind === "busy";
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: "Sign out?" }),
    el("p", { text: waiting
      ? "Some changes on this phone haven't reached the league yet. Signing out now could lose them. Wait until you have signal and the status shows Live."
      : "You'll need your email, password and signal to sign back in." }),
    el("div", { class: "row" },
      el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
      el("button", { class: "btn danger", type: "button", text: "Sign out", onclick: () => { closeSheet(); signOut(); } })))));
}
