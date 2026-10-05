/* League admin: name, invite code, members and (owner only) admins. */
import { el, field, avatar, fmtDay, openSheet, closeSheet, toast, copyText, confirmButton, fill } from "./ui.js";
import { store, uid, isAdmin, isOwner, setLeagueName, setInviteCode, setSuspended, removeMember, setAdmin, randomCode, cleanCode } from "./cloud.js";
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
      el("button", { class: "btn small", type: "button", text: "Rename", onclick: renameSheet })));

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
  fill(main, el("h2", { class: "page-title", text: "League admin" }), invite, isOwner() ? emailInvite(L, code) : null, league, points, list);
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
