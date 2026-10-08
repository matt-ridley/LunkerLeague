/* "Adjust thumbnail": the photo with the square the feed shows drawn on it. Tap or drag to move the square; the
   preview shows the thumbnail as it will look. Used by the log form and the catch page. */
import { el, openSheet, closeSheet } from "./ui.js";
import { focusAt, frameRect, isCentred } from "./thumbfocus.js";

/* src: the thumbnail (the whole photo, small). done(focus) gets { x, y }, or null for the middle. */
export function pickFocus(src, current, done) {
  let focus = current && !isCentred(current) ? { ...current } : null;
  openSheet(box => {
    const photo = el("img", { src, alt: "Your catch photo", draggable: "false" });
    const frame = el("div", { class: "focus-frame", "aria-hidden": "true" });
    const area = el("div", { class: "focus-area" }, photo, frame);
    const preview = el("img", { class: "thumb", src, alt: "Thumbnail preview" });
    const aspect = () => (photo.naturalWidth && photo.naturalHeight ? photo.naturalWidth / photo.naturalHeight : 1);
    const draw = () => {
      const r = frameRect(focus, aspect());
      frame.style.cssText = `left:${r.left * 100}%;top:${r.top * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
      preview.style.objectPosition = focus ? `${focus.x}% ${focus.y}%` : "";
    };
    const move = e => {
      const b = photo.getBoundingClientRect();
      const f = focusAt((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height, aspect());
      focus = isCentred(f) ? null : f;
      draw();
    };
    let dragging = false;
    area.addEventListener("pointerdown", e => { dragging = true; area.setPointerCapture(e.pointerId); move(e); });
    area.addEventListener("pointermove", e => { if (dragging) move(e); });
    area.addEventListener("pointerup", () => { dragging = false; });
    area.addEventListener("pointercancel", () => { dragging = false; });
    photo.addEventListener("load", draw);
    box.append(el("div", { class: "stack" },
      el("h2", { text: "Adjust thumbnail" }),
      el("p", { class: "hint", text: "Tap or drag on the fish. The square is what shows in the feed and on the boards." }),
      area,
      el("div", { class: "row focus-preview" }, preview, el("span", { class: "muted small", text: "How it looks in the feed" })),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", text: "Middle", onclick: () => { focus = null; draw(); } }),
        el("button", { class: "btn primary", type: "button", text: "Done", onclick: () => { closeSheet(); done(focus); } }))));
    if (photo.complete) draw();
  });
}
