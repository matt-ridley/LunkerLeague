/* Social: emoji reactions and comments on catches, league chat, and an emoji picker. */
import { el, avatar, fmtAgo, fmtDay, fmtDate, openSheet, closeSheet, confirmButton, fill, icon } from "./ui.js";
import { store, uid, isAdmin, memberName, addComment, deleteComment, toggleReaction, sendChat, deleteChat, watchDerbyChat } from "./cloud.js";

export const QUICK_REACTIONS = ["🎣", "🔥", "🐟", "😂", "👏", "🤥"];
const EMOJI = [
  "🎣", "🐟", "🐠", "🐡", "🦈", "🐊", "🐋", "🦐", "🪝", "🛶", "🚤", "⛵", "🌊", "🏞️", "🌅", "🌄", "🌧️", "☀️", "⛈️", "🌬️", "🦆", "🦅",
  "🔥", "👏", "🙌", "💪", "👍", "👎", "🤙", "🏆", "🥇", "🥈", "🥉", "👑", "💯", "⭐", "🎉", "📏", "⚖️",
  "😂", "🤣", "😅", "😎", "🤩", "😍", "😮", "😱", "🤯", "🤥", "🙄", "😴", "😬", "🥶", "🥵", "🤔", "😤", "😭",
  "🍺", "🍻", "☕", "🌭", "🍔", "🔦", "🚗", "⛺",
];

const who = id => store.members.get(id) || { id, displayName: memberName(id) };
const names = ids => ids.map(id => who(id).displayName).join(", ");

/* ---------- Emoji picker: a button that drops a grid under a text box ---------- */
export function emojiButton(input) {
  const panel = el("div", { class: "emoji-panel", hidden: true, role: "listbox", "aria-label": "Emoji" },
    ...EMOJI.map(e => el("button", { type: "button", class: "emoji-pick", text: e, onclick: () => insertAt(input, e) })));
  const btn = el("button", { type: "button", class: "emoji-btn", "aria-label": "Add an emoji", "aria-expanded": "false", text: "😀",
    onclick: () => { panel.hidden = !panel.hidden; btn.setAttribute("aria-expanded", String(!panel.hidden)); } });
  return { btn, panel };
}
function insertAt(input, text) {
  const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, s) + text + input.value.slice(e);
  const pos = s + text.length;
  try { input.setSelectionRange(pos, pos); } catch {}
  input.dispatchEvent(new Event("input"));
}

/* ---------- Reactions ---------- */
export function reactionSummary(catchId) {
  const r = store.reactions.get(catchId);
  if (!r) return "";
  const counts = new Map();
  for (const list of r.values()) for (const e of list) counts.set(e, (counts.get(e) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e, n]) => `${e}${n > 1 ? n : ""}`).join(" ");
}

export function reactionBar(catchId) {
  const r = store.reactions.get(catchId) || new Map();
  const byEmoji = new Map();
  for (const [person, list] of r) for (const e of list) { if (!byEmoji.has(e)) byEmoji.set(e, []); byEmoji.get(e).push(person); }
  const shown = [...new Set([...QUICK_REACTIONS, ...byEmoji.keys()])];
  const mine = r.get(uid()) || [];
  const more = el("div", { class: "emoji-panel", hidden: true },
    ...EMOJI.map(e => el("button", { type: "button", class: "emoji-pick", text: e, onclick: () => toggleReaction(catchId, e) })));
  return el("section", { class: "reactions" },
    el("div", { class: "reaction-row" },
      ...shown.map(e => {
        const people = byEmoji.get(e) || [];
        return el("button", { type: "button", class: "reaction", "aria-pressed": String(mine.includes(e)),
          "aria-label": `${e} ${people.length}${people.length ? ": " + names(people) : ""}`, onclick: () => toggleReaction(catchId, e) },
          el("span", { class: "reaction-emoji", text: e }), people.length ? el("span", { class: "reaction-n", text: String(people.length) }) : null);
      }),
      el("button", { type: "button", class: "reaction more", "aria-label": "More emoji", text: "＋",
        onclick: () => { more.hidden = !more.hidden; } })),
    more,
    byEmoji.size ? el("p", { class: "hint reaction-who", text: [...byEmoji.entries()].map(([e, p]) => `${e} ${names(p)}`).join(" · ") }) : null);
}

/* ---------- Comments ---------- */
export function commentsSection(c) {
  const list = store.comments.get(c.id) || [];
  const input = el("textarea", { rows: 1, maxlength: 500, placeholder: "Add a comment…", "aria-label": "Comment", class: "grow-input" });
  input.value = drafts.get(c.id) || "";
  input.addEventListener("input", () => { drafts.set(c.id, input.value); autoGrow(input); });
  const { btn, panel } = emojiButton(input);
  const form = el("form", { class: "compose" }, btn, input,
    el("button", { type: "submit", class: "send-btn", "aria-label": "Post comment", html: SEND }));
  form.addEventListener("submit", e => {
    e.preventDefault();
    if (!input.value.trim()) return;
    addComment(c.id, input.value);
    input.value = ""; drafts.delete(c.id); panel.hidden = true; autoGrow(input);
    input.blur(); // lets the page redraw with the new comment (redraws wait while you're typing)
  });
  return el("section", { class: "card stack comments" },
    el("h3", { text: list.length ? `Comments (${list.length})` : "Comments" }),
    list.length ? el("ul", { class: "comment-list" }, ...list.map(cm => commentItem(c, cm))) : el("p", { class: "muted", text: "No comments yet. Start the trash talk." }),
    form, panel);
}

function commentItem(c, cm) {
  const m = who(cm.uid);
  const canDelete = cm.uid === uid() || isAdmin() || c.uid === uid();
  return el("li", { class: "comment" },
    el("a", { href: `#/u/${cm.uid}` }, avatar(m, "sm")),
    el("div", { class: "grow" },
      el("div", { class: "comment-head" }, el("b", { text: m.displayName }),
        el("span", { class: "muted small", text: store.pendingIds.has(cm.id) ? "⏳ waiting for signal" : fmtAgo(cm.at) }),
        canDelete ? el("button", { type: "button", class: "link-btn", text: "Delete", onclick: () => confirmDelete("comment", () => deleteComment(c.id, cm.id)) }) : null),
      el("p", { class: "comment-text", text: cm.text })));
}

const drafts = new Map();
const SEND = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 20.5 21 12 3 3.5l2.5 7.2L14 12l-8.5 1.3z"/></svg>';
function autoGrow(t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }

function confirmDelete(what, run) {
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: `Delete this ${what}?` }),
    el("div", { class: "row" },
      el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
      el("button", { class: "btn danger", type: "button", text: "Delete", onclick: () => { run(); closeSheet(); } })))));
}

/* ---------- Chat ---------- */
const SEEN_KEY = "lunker-chat-seen";
const getSeen = () => { try { return +localStorage.getItem(SEEN_KEY) || 0; } catch { return 0; } };
const setSeen = t => { try { localStorage.setItem(SEEN_KEY, String(t)); } catch {} };

/* New chat messages from others since this phone last opened Chat. */
export function chatUnread() {
  const seen = getSeen();
  return store.chat.filter(m => m.uid !== uid() && (m.at || 0) > seen).length;
}

/* The chat screen is built once and then only its message list is refreshed, so typing is never interrupted.
   With a derbyId it is that derby's own chat. */
let chatInput = null;
export function renderChat(main, derbyId) {
  if (derbyId) watchDerbyChat(derbyId);
  const draftKey = derbyId ? "chat:" + derbyId : "chat";
  let shell = main.querySelector(":scope > .chat");
  if (!shell) {
    const derby = derbyId && store.derbies.get(derbyId);
    const list = el("div", { class: "chat-list", role: "log", "aria-live": "polite" });
    chatInput = el("textarea", { rows: 1, maxlength: 1000, placeholder: "Message the league…", "aria-label": "Message", class: "grow-input" });
    chatInput.value = drafts.get(draftKey) || "";
    chatInput.addEventListener("input", () => { drafts.set(draftKey, chatInput.value); autoGrow(chatInput); });
    chatInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer: coarse)").matches) { e.preventDefault(); form.requestSubmit(); } });
    const { btn, panel } = emojiButton(chatInput);
    const form = el("form", { class: "compose chat-compose" }, btn, chatInput,
      el("button", { type: "submit", class: "send-btn", "aria-label": "Send", html: SEND }));
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (!chatInput.value.trim()) return;
      sendChat(chatInput.value, derbyId);
      chatInput.value = ""; drafts.delete(draftKey); autoGrow(chatInput); panel.hidden = true;
      chatInput.focus();
    });
    shell = el("div", { class: "chat" },
      derbyId ? el("a", { class: "eyebrow back-link", href: `#/d/${derbyId}`, text: "← Back to the derby" }) : null,
      el("h2", { class: "page-title", text: derbyId ? `${derby ? derby.name : "Derby"} chat` : "Chat" }),
      list, el("div", { class: "chat-bottom" }, panel, form));
    fill(main, shell);
  }
  const list = shell.querySelector(".chat-list");
  const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
  const first = !list.childElementCount;
  const messages = derbyId ? store.derbyChat.get(derbyId) : (store.chatLoaded ? store.chat : null);
  fill(list, chatMessages(messages, derbyId));
  if (first || nearBottom) requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
  const last = store.chat[store.chat.length - 1];
  if (!derbyId && last && !document.hidden) setSeen(Math.max(getSeen(), last.at || 0));
}

function chatMessages(messages, derbyId) {
  if (!messages) return [el("p", { class: "loading", text: "Loading…" })];
  if (!messages.length) return [el("div", { class: "card empty" }, el("div", { class: "empty-art", html: icon.chat }),
    el("p", { text: derbyId ? "No trash talk yet. Get it started." : "No messages yet. Plan a trip, post a brag, or start some trouble." }))];
  const out = [];
  let lastDay = "", lastUid = "", lastAt = 0;
  for (const m of messages) {
    const day = fmtDay(m.at || 0);
    if (day !== lastDay) { out.push(el("div", { class: "chat-day", text: day })); lastUid = ""; }
    const mine = m.uid === uid(), cont = m.uid === lastUid && (m.at - lastAt) < 5 * 60000;
    const p = who(m.uid);
    out.push(el("div", { class: "msg-row" + (mine ? " mine" : "") + (cont ? " cont" : "") },
      !mine ? (cont ? el("span", { class: "avatar-gap" }) : avatar(p, "sm")) : null,
      el("button", { type: "button", class: "bubble", title: fmtDate(m.at || 0),
        onclick: () => (mine || isAdmin()) && confirmDelete("message", () => deleteChat(m.id, derbyId)) },
        !mine && !cont ? el("span", { class: "bubble-name", text: p.displayName }) : null,
        el("span", { class: "bubble-text", text: m.text }),
        el("span", { class: "bubble-time", text: store.pendingIds.has(m.id) ? "⏳" : time(m.at) }))));
    lastDay = day; lastUid = m.uid; lastAt = m.at || 0;
  }
  return out;
}
const time = ms => { const d = new Date(ms); const h = d.getHours() % 12 || 12; return `${h}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "AM" : "PM"}`; };
