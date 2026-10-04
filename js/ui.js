/* Small DOM and formatting helpers shared by every screen. */

export const $ = id => document.getElementById(id);

/* el("button", { class: "btn", onclick: fn }, "Label", childNode) */
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "value") n.value = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

/* Replaces a node's contents, skipping empty (null/false) parts. */
export function fill(node, ...kids) {
  node.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
  return node;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = n => String(n).padStart(2, "0");
const toDate = d => d instanceof Date ? d : new Date(d);

/* 2026-Oct-03 07:09:15 PM */
export function fmtDate(d) {
  d = toDate(d);
  const h = d.getHours() % 12 || 12;
  return `${d.getFullYear()}-${MON[d.getMonth()]}-${pad(d.getDate())} ${pad(h)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getHours() < 12 ? "AM" : "PM"}`;
}
/* 2026-Oct-03 */
export function fmtDay(d) {
  d = toDate(d);
  return `${d.getFullYear()}-${MON[d.getMonth()]}-${pad(d.getDate())}`;
}
/* "5 min ago", "3 h ago", or the full date once it is over a week old. */
export function fmtAgo(d) {
  const s = (Date.now() - toDate(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return fmtDay(d);
}

/* Weights are stored in ounces. 86 -> "5 lb 6 oz" */
export function fmtWeight(oz) {
  if (oz == null || !(oz > 0)) return "";
  const r = Math.round(oz * 10) / 10;
  const lb = Math.floor(r / 16), rest = Math.round((r - lb * 16) * 10) / 10;
  if (!lb) return `${rest} oz`;
  return rest ? `${lb} lb ${rest} oz` : `${lb} lb`;
}
/* Lengths are stored in inches, in quarter steps. 18.25 -> 18¼" */
export function fmtLength(inches) {
  if (inches == null || !(inches > 0)) return "";
  const whole = Math.floor(inches), q = Math.round((inches - whole) * 4);
  const frac = ["", "¼", "½", "¾"][q % 4] || "";
  return `${whole + (q === 4 ? 1 : 0)}${frac}"`;
}

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
}

/* A member's photo, or their initials on a colour picked from their id. */
const AVATAR_TINTS = ["#F59E0B", "#10B981", "#3B82F6", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];
export function avatar(member, size = "") {
  const m = member || {};
  if (m.avatar) return el("img", { class: "avatar " + size, src: m.avatar, alt: "" });
  let h = 0;
  for (const c of String(m.id || m.displayName || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return el("span", { class: "avatar " + size, "aria-hidden": "true", style: `--tint:${AVATAR_TINTS[h % AVATAR_TINTS.length]}`,
    text: initials(m.displayName) });
}

/* ---------- Bottom sheet ---------- */
let sheetClose = null;
export function openSheet(build, { onClose } = {}) {
  const box = $("sheet");
  box.replaceChildren();
  build(box);
  box.hidden = false; $("scrim").hidden = false;
  document.body.classList.add("locked");
  sheetClose = onClose || null;
  const first = box.querySelector("[data-focus]");
  if (first) first.focus({ preventScroll: true });
}
export function closeSheet() {
  const box = $("sheet");
  if (box.hidden) return;
  box.hidden = true; $("scrim").hidden = true;
  box.replaceChildren();
  document.body.classList.remove("locked");
  const fn = sheetClose; sheetClose = null;
  if (fn) fn();
}
export const sheetOpen = () => !$("sheet").hidden;

/* ---------- Toast ---------- */
let toastTimer = null, toastAction = null;
export function toast(text, action) {
  clearTimeout(toastTimer);
  toastAction = action || null;
  $("toast-text").textContent = text;
  const b = $("toast-action");
  b.hidden = !toastAction;
  if (toastAction) b.textContent = toastAction.label;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => { $("toast").hidden = true; toastAction = null; }, action && action.sticky ? 60000 : 5000);
}
export function initToast() {
  $("toast-action").addEventListener("click", () => {
    const a = toastAction;
    toastAction = null; clearTimeout(toastTimer); $("toast").hidden = true;
    if (a) a.run();
  });
}

/* A button that needs a second tap to confirm, for anything destructive. */
export function confirmButton(label, armedLabel, run, cls = "btn danger") {
  let armed = false, t = null;
  const b = el("button", { class: cls, type: "button", text: label });
  b.addEventListener("click", () => {
    if (!armed) {
      armed = true; b.classList.add("armed"); b.textContent = armedLabel;
      t = setTimeout(() => { armed = false; b.classList.remove("armed"); b.textContent = label; }, 4000);
      return;
    }
    clearTimeout(t);
    run();
  });
  return b;
}

/* A labelled form field. */
export function field(label, input, hint) {
  return el("label", { class: "field" }, el("span", { class: "field-label", text: label }), input,
    hint ? el("span", { class: "hint", text: hint }) : null);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export const icon = {
  fish: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12c3-5 9-7 14-4l4-3v14l-4-3c-5 3-11 1-14-4z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/></svg>',
  feed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/></svg>',
};
