/* Web view and phone view on a computer. Wide screens get the web layout (css: min-width 1024px). "Phone view" shows
   the app in a phone-sized frame instead: the frame runs the real app at phone width, so it looks exactly like a phone
   (handy for screenshots). The choice is remembered in this browser. Phones never see the switch. */
const KEY = "lunker-view";
export const WIDE = "(min-width: 1024px)";
const PHONE = { w: 390, h: 844 };

export const inFrame = () => { try { return window.self !== window.top; } catch { return true; } };
const wantPhone = () => { try { return localStorage.getItem(KEY) === "phone"; } catch { return false; } };
const setView = v => { try { if (v === "phone") localStorage.setItem(KEY, "phone"); else localStorage.removeItem(KEY); } catch {} };

/* True when this page should only hold the phone frame (and not run the app itself). */
export const phoneHost = () => !inFrame() && wantPhone() && matchMedia(WIDE).matches;

/* Web view → phone view, keeping the page you're on. */
export function switchToPhone() { setView("phone"); location.reload(); }

/* Builds the phone frame page: a bar with the way back, and the app at phone size. */
export function showPhoneFrame() {
  document.body.className = "phone-host";
  const bar = document.createElement("div");
  bar.className = "phone-bar";
  bar.innerHTML = `<span>📱 Phone view <small>${PHONE.w} × ${PHONE.h}</small></span>`;
  const back = document.createElement("button");
  back.type = "button"; back.className = "btn small"; back.textContent = "🖥️ Web view";
  const frame = document.createElement("iframe");
  frame.className = "phone-frame"; frame.title = "Lunker League at phone size";
  frame.style.width = PHONE.w + "px"; frame.style.height = PHONE.h + "px";
  frame.src = location.href;
  // Keep this page's address on the page shown in the frame, so a reload or switching back stays there.
  const follow = () => { try { history.replaceState(null, "", frame.contentWindow.location.hash || location.pathname + location.search); } catch {} };
  frame.addEventListener("load", () => { follow(); try { frame.contentWindow.addEventListener("hashchange", follow); } catch {} });
  back.addEventListener("click", () => { follow(); setView("web"); location.reload(); });
  bar.append(back);
  document.body.replaceChildren(bar, frame);
}
