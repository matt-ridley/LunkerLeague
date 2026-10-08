/* Profile: your own (with edit, theme and sign out) or another member's. */
import { el, field, avatar, fmtDay, openSheet, closeSheet, toast, icon, fill } from "./ui.js";
import { store, uid, isAdmin, updateMe, signOut, syncStatus, saveCover, removeCover, loadCover, cachedCover } from "./cloud.js";
import { squareAvatar, pickImage, coverPhoto } from "./photos.js";
import { luckyLure } from "./tacklebox.js";
import { goalsSection } from "./goalspage.js";
import { itemThumb } from "./tackleboxpage.js";
import { SPECIES, normalizeSpecies } from "./species.js";
import { VERSION } from "./config.js";
import { getTheme, setTheme } from "./theme.js";
import { pbWall } from "./catches.js";
import { rankings, badgesFor } from "./rank.js";
import { rankInput, howPointsSheet } from "./leaders.js";
import { crownScore } from "./crowns.js";
import { BADGES } from "./badges.js";
import { profileRecord } from "./h2hpage.js";

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

  // A cover photo across the top, loaded when the profile is opened.
  let cover = null;
  if (m.hasCover) {
    cover = el("div", { class: "profile-cover" });
    const show = src => { if (src) fill(cover, el("img", { src, alt: "" })); };
    show(cachedCover(m.id));
    if (!cachedCover(m.id)) loadCover(m.id).then(show).catch(() => {});
  }
  const lucky = luckyLure(m.id, m.luckyLure, store.box, store.catches, store.tackle);
  const flair = m.favSpecies || lucky ? el("div", { class: "flair-row" },
    m.favSpecies ? el("span", { class: "chip" }, `⭐ Favourite: ${m.favSpecies}`) : null,
    lucky ? el("a", { class: "chip lucky", href: `#/ti/${lucky.item.id}` }, "🍀 Lucky lure: ", itemThumb(lucky.item, "box-thumb tiny"),
      lucky.item.name, lucky.fish ? ` (${lucky.fish} fish)` : "") : null) : null;
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
  // Someone else's profile: challenge them head-to-head.
  const challenge = !mine && !m.suspended ? el("a", { class: "btn block", href: `#/hnew/${m.id}`, text: `⚔️ Challenge ${m.displayName}` }) : null;
  const statsLink = el("a", { class: "btn block", href: `#/stats/${m.id}`, text: mine ? "📊 Your stats and what's working" : `📊 ${m.displayName}'s stats` });
  const parts = [cover, head, flair, challenge, rankCard, goalsSection(m.id, mine), profileRecord(m.id), crownRow, badgeRow, ...pbWall(m.id), statsLink,
    el("a", { class: "btn block", href: `#/box/${m.id}`, text: mine ? "🧰 Your tackle box" : `🧰 ${m.displayName}'s tackle box` }),
    mine ? el("a", { class: "btn block", href: "#/map", text: "🗺️ Map of catches" }) : null];

  if (mine) {
    parts.push(el("section", { class: "card stack" },
      el("h3", { text: "Your profile" }),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", html: icon.camera, onclick: () => changePhoto(true) }, "Camera"),
        el("button", { class: "btn", type: "button", html: icon.image, onclick: () => changePhoto(false) }, "Gallery")),
      m.avatar ? el("button", { class: "btn quiet", type: "button", text: "Remove photo", onclick: () => updateMe({ avatar: null }) }) : null,
      el("span", { class: "field-label", text: "Cover photo" }),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", html: icon.camera, onclick: () => changeCover(true) }, "Camera"),
        el("button", { class: "btn", type: "button", html: icon.image, onclick: () => changeCover(false) }, "Gallery"),
        m.hasCover ? el("button", { class: "btn quiet", type: "button", text: "Remove", onclick: () => { removeCover(); toast("Cover photo removed."); } }) : null),
      el("button", { class: "btn", type: "button", text: "Edit name, home water and flair", onclick: editSheet })));

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

async function changeCover(camera) {
  const file = await pickImage({ camera });
  if (!file) return;
  try { saveCover(await coverPhoto(file)); toast("Cover photo updated."); }
  catch { toast("That file couldn't be opened as a photo."); }
}

function editSheet() {
  openSheet(box => {
    const name = el("input", { type: "text", maxlength: 40, autocapitalize: "words", value: store.me.displayName || "", "data-focus": "" });
    const water = el("input", { type: "text", maxlength: 60, autocapitalize: "words", value: store.me.homeWater || "", placeholder: "e.g. Lake Simcoe" });
    const fav = el("input", { type: "text", list: "fav-species", maxlength: 40, autocapitalize: "words", autocomplete: "off",
      value: store.me.favSpecies || "", placeholder: "e.g. Muskie" });
    const favList = el("datalist", { id: "fav-species" }, ...SPECIES.map(s => el("option", { value: s })));
    // The lucky lure: automatic (the item with the most fish) or one picked from the box.
    const auto = luckyLure(uid(), null, store.box, store.catches, store.tackle);
    const items = [...store.box.values()].filter(i => i.uid === uid()).sort((a, b) => a.name.localeCompare(b.name));
    const lure = el("select", { "aria-label": "Lucky lure" },
      el("option", { value: "", text: auto ? `Automatic: ${auto.item.name} (most fish)` : "Automatic (the tackle that catches you the most)" }),
      ...items.map(i => el("option", { value: i.id, text: i.name + (i.retired ? " (retired)" : "") })));
    lure.value = store.me.luckyLure && store.box.has(store.me.luckyLure) ? store.me.luckyLure : "";
    const form = el("form", { class: "stack" },
      el("h2", { text: "Edit profile" }),
      field("Name in the league", name),
      field("Home water (optional)", water, "Shown on your profile. Keep it vague if you like."),
      field("Favourite species (optional)", fav), favList,
      field("Lucky lure", lure, items.length ? "From your tackle box." : "Add tackle to your tackle box to pick one."),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        el("button", { class: "btn primary", type: "submit", text: "Save" })));
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (!name.value.trim()) return name.focus();
      updateMe({ displayName: name.value, homeWater: water.value, favSpecies: normalizeSpecies(fav.value) || fav.value, luckyLure: lure.value || null });
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
