/* Screens shown before someone is in the league: setup, sign in / sign up, claim, join, suspended. */
import { el, field, toast } from "./ui.js";
import { gate, signIn, signUp, resetPassword, signOut, authMessage, claimLeague, joinLeague, store, cloud, cleanCode } from "./cloud.js";

const brand = () => el("div", { class: "gate-brand" },
  el("img", { src: "icons/icon-192.png", alt: "", class: "gate-logo", width: 88, height: 88 }),
  el("h1", { text: "Lunker League" }),
  el("p", { class: "tagline", text: "Track your bests. Settle the bet." }));

const input = (attrs) => el("input", { autocapitalize: "off", autocorrect: "off", spellcheck: "false", ...attrs });
const msgBox = () => el("p", { class: "msg", role: "status", "aria-live": "polite" });
const say = (box, text, kind = "err") => { box.className = "msg " + kind; box.textContent = text; };

/* Sign-up details are kept here between creating the account and joining, so nothing is typed twice. */
let pending = null;
/* The join result outlives a redraw of the screen (the first, automatic try can finish after one). */
let joinNote = null;
const showJoin = (text, kind = "err") => {
  joinNote = text ? { text, kind } : null;
  const box = document.querySelector(".gate .msg");
  if (box) say(box, text || "", kind);
};

export function renderGate(main) {
  const g = gate();
  const wrap = el("div", { class: "gate" }, brand());
  main.replaceChildren(wrap);
  if (g === "setup") return setupScreen(wrap);
  if (g === "load-error") return wrap.append(el("div", { class: "card" },
    el("h2", { text: "Can't start the app" }),
    el("p", { text: "The app couldn't load its sign-in tools. The very first time you open Lunker League it needs an internet connection. Connect and try again." }),
    el("button", { class: "btn primary block", text: "Try again", onclick: () => location.reload() })));
  if (g === "loading") return wrap.append(el("p", { class: "loading", text: "Loading…" }));
  if (g === "offline-unknown") return wrap.append(el("div", { class: "card" },
    el("h2", { text: "Waiting for signal" }),
    el("p", { text: "This phone hasn't finished joining the league yet, and that part needs an internet connection. It will carry on by itself once you have signal." }),
    el("button", { class: "btn quiet block", text: "Sign out", onclick: signOut })));
  if (g === "signed-out") return authScreen(wrap);
  if (g === "claim") return claimScreen(wrap);
  if (g === "join") return joinScreen(wrap);
  if (g === "suspended") return wrap.append(el("div", { class: "card" },
    el("h2", { text: "Account paused" }),
    el("p", { text: "A league admin has paused your account. Ask them to switch it back on." }),
    el("button", { class: "btn block", text: "Sign out", onclick: signOut })));
}

function setupScreen(wrap) {
  wrap.append(el("div", { class: "card" },
    el("h2", { text: "Almost ready" }),
    el("p", { text: "This copy of the app isn't connected to a Firebase project yet. Follow the setup steps in the README, then put the project's config into js/config.js." })));
}

function authScreen(wrap) {
  let mode = pending ? "up" : "in";
  const card = el("div", { class: "card stack" });
  wrap.append(card);
  const draw = () => {
    card.replaceChildren();
    const tabs = el("div", { class: "seg", role: "tablist" },
      el("button", { type: "button", role: "tab", "aria-selected": String(mode === "in"), text: "Sign in", onclick: () => { mode = "in"; draw(); } }),
      el("button", { type: "button", role: "tab", "aria-selected": String(mode === "up"), text: "Join the league", onclick: () => { mode = "up"; draw(); } }));
    const email = input({ type: "email", autocomplete: "username", inputmode: "email", required: true, "data-focus": "" });
    const pass = input({ type: "password", autocomplete: mode === "in" ? "current-password" : "new-password", required: true, minlength: 6 });
    const name = input({ type: "text", autocomplete: "nickname", autocapitalize: "words", maxlength: 40, required: true });
    const code = input({ type: "text", autocapitalize: "characters", maxlength: 30 });
    const msg = msgBox();
    if (pending) { email.value = pending.email || ""; name.value = pending.displayName || ""; code.value = pending.inviteCode || ""; }

    const form = el("form", { class: "stack", novalidate: true },
      field("Email", email),
      field("Password", pass, mode === "up" ? "At least 6 characters." : null),
      mode === "up" ? field("Your name in the league", name, "Use a nickname if you like. Everyone in the league sees it.") : null,
      mode === "up" ? field("Invite code", code, "Ask whoever invited you. Leave blank if you're setting up a brand-new league.") : null,
      msg,
      el("button", { class: "btn primary block", type: "submit", text: mode === "in" ? "Sign in" : "Create account" }),
      mode === "in" ? el("button", { class: "btn quiet block", type: "button", text: "Forgot password?", onclick: async () => {
        if (!email.value.trim()) return say(msg, "Enter your email first, then tap Forgot password.");
        try { await resetPassword(email.value.trim()); say(msg, "Check your email for a link to set a new password.", "ok"); }
        catch (e) { say(msg, authMessage(e)); }
      } }) : null);

    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (!email.value.trim() || !pass.value) return say(msg, "Enter your email and password.");
      if (mode === "up" && !name.value.trim()) return say(msg, "Enter the name you want to use in the league.");
      say(msg, mode === "in" ? "Signing in…" : "Creating your account…", "ok");
      form.querySelectorAll("button").forEach(b => b.disabled = true);
      try {
        if (mode === "up") pending = { email: email.value.trim(), displayName: name.value, inviteCode: code.value };
        await (mode === "in" ? signIn : signUp)(email.value.trim(), pass.value);
      } catch (err) {
        say(msg, authMessage(err));
        form.querySelectorAll("button").forEach(b => b.disabled = false);
      }
    });
    card.append(tabs, form,
      el("p", { class: "hint center", text: "The first sign-in on each phone needs signal. After that the app works on the water with no signal." }));
  };
  draw();
}

function claimScreen(wrap) {
  const leagueName = input({ type: "text", autocapitalize: "words", maxlength: 40, value: "Lunker League", "data-focus": "" });
  const code = input({ type: "text", autocapitalize: "characters", maxlength: 30, value: (pending && pending.inviteCode) || "" });
  const name = input({ type: "text", autocapitalize: "words", maxlength: 40, value: (pending && pending.displayName) || "" });
  const msg = msgBox();
  const form = el("form", { class: "stack", novalidate: true },
    el("h2", { text: "Start your league" }),
    el("p", { text: "There's no league here yet. Set it up now and you'll be its owner and admin. Friends join with the invite code you choose." }),
    field("League name", leagueName),
    field("Invite code", code, "Something you'll text to friends, e.g. WALLEYE-2026. You can change it later."),
    field("Your name in the league", name),
    msg,
    el("button", { class: "btn primary block", type: "submit", text: "Create the league" }),
    el("button", { class: "btn quiet block", type: "button", text: "Sign out", onclick: () => { pending = null; signOut(); } }));
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (cleanCode(code.value).length < 4) return say(msg, "Pick an invite code of at least 4 characters.");
    if (!name.value.trim()) return say(msg, "Enter your name.");
    if (!navigator.onLine) return say(msg, "Creating the league needs an internet connection.");
    say(msg, "Creating the league…", "ok");
    try {
      await claimLeague({ leagueName: leagueName.value, inviteCode: code.value, displayName: name.value });
      pending = null;
      toast("Your league is ready. Share the invite code from Admin.");
    } catch (err) {
      console.warn(err);
      say(msg, err && err.code === "permission-denied"
        ? "Someone has already set up this league. Ask them for the invite code." : "That didn't work. Check your signal and try again.");
    }
  });
  wrap.append(el("div", { class: "card" }, form));
}

function joinScreen(wrap) {
  const code = input({ type: "text", autocapitalize: "characters", maxlength: 30, value: (pending && pending.inviteCode) || "", "data-focus": "" });
  const name = input({ type: "text", autocapitalize: "words", maxlength: 40, value: (pending && pending.displayName) || "" });
  const msg = msgBox();
  const form = el("form", { class: "stack", novalidate: true },
    el("h2", { text: `Join ${(store.league && store.league.name) || "the league"}` }),
    el("p", { text: "Enter the invite code from the league admin." }),
    field("Invite code", code),
    field("Your name in the league", name),
    msg,
    el("button", { class: "btn primary block", type: "submit", text: "Join" }),
    el("button", { class: "btn quiet block", type: "button", text: `Sign out (${(cloud.user && cloud.user.email) || ""})`, onclick: () => { pending = null; joinNote = null; signOut(); } }));
  const go = async () => {
    if (!cleanCode(code.value)) return showJoin("Enter the invite code.");
    if (!name.value.trim()) return showJoin("Enter your name.");
    if (!navigator.onLine) return showJoin("Joining needs an internet connection.");
    showJoin("Joining…", "ok");
    try {
      await joinLeague({ inviteCode: code.value, displayName: name.value });
      pending = null; joinNote = null;
      toast("Welcome to the league!");
    } catch (err) {
      console.warn(err);
      showJoin(err && err.code === "permission-denied" ? "That invite code isn't right. Check it with the league admin." : "That didn't work. Check your signal and try again.");
    }
  };
  form.addEventListener("submit", e => { e.preventDefault(); go(); });
  wrap.append(el("div", { class: "card" }, form));
  if (joinNote) say(msg, joinNote.text, joinNote.kind);
  // Coming straight from sign-up with a code already typed: try it once automatically.
  if (pending && cleanCode(pending.inviteCode) && !pending.tried) { pending.tried = true; go(); }
}
