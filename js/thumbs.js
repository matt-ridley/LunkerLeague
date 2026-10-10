/* A catch's small photo on screen. It shows straight away when this phone has it; otherwise the image starts empty
   (a placeholder) and loads when it scrolls near the screen (cloud.js loadThumb: the phone's saved copy first, then the
   server once). */
import { el } from "./ui.js";
import { thumbSrc, loadThumb } from "./cloud.js";

const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const waiting = new WeakMap(); // img -> catch
let seen = null;

function watch(img, c) {
  if (!("IntersectionObserver" in window)) return void fillIn(img, c);
  seen = seen || new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      seen.unobserve(e.target);
      const c2 = waiting.get(e.target);
      if (c2) fillIn(e.target, c2);
    }
  }, { rootMargin: "400px 0px" });
  waiting.set(img, c);
  seen.observe(img);
}

function fillIn(img, c) {
  loadThumb(c).then(src => {
    if (!src) return; // no signal and never seen on this phone: the placeholder stays
    img.src = src;
    img.classList.remove("thumb-wait");
  });
}

/* <img> for a catch's small photo. attrs: the img's own (class, alt, style…). */
export function thumbImg(c, attrs = {}) {
  const src = thumbSrc(c);
  const img = el("img", { loading: "lazy", ...attrs, src: src || BLANK });
  if (!src) { img.classList.add("thumb-wait"); watch(img, c); }
  return img;
}
