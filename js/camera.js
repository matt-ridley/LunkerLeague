/* In-app camera: a live viewfinder inside Lunker League.
   Opening the phone's own camera app from a web page can fail on phones with big camera apps (for example a
   Galaxy S24): Android closes the browser to free memory while the camera is open, and the photo is lost.
   Taking the picture inside the page avoids leaving the browser at all.
   Resolves with a JPEG File, null if cancelled, or "unavailable" if the camera can't be used here. */
import { el } from "./ui.js";

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export function openCamera({ facing = "environment" } = {}) {
  if (!cameraSupported()) return Promise.resolve("unavailable");
  return new Promise(resolve => {
    let stream = null, track = null, torchOn = false, done = false;
    const video = el("video", { class: "cam-video", autoplay: true, playsinline: true, muted: true });
    video.muted = true;
    const still = el("img", { class: "cam-video", alt: "", hidden: true });
    const msg = el("p", { class: "cam-msg", role: "status" });
    const torchBtn = el("button", { class: "cam-btn", type: "button", "aria-label": "Flash", text: "⚡ Off", hidden: true });
    const flipBtn = el("button", { class: "cam-btn", type: "button", "aria-label": "Switch camera", text: "🔄" });
    const shutter = el("button", { class: "cam-shutter", type: "button", "aria-label": "Take photo" });
    const retake = el("button", { class: "cam-btn wide", type: "button", text: "Retake", hidden: true });
    const use = el("button", { class: "cam-btn wide use", type: "button", text: "Use photo", hidden: true });
    const close = el("button", { class: "cam-btn", type: "button", "aria-label": "Close camera", text: "✕" });
    const box = el("div", { class: "cam", role: "dialog", "aria-label": "Camera" },
      video, still, msg,
      el("div", { class: "cam-top" }, close, torchBtn),
      el("div", { class: "cam-bar" }, flipBtn, shutter, retake, use, el("span", { class: "cam-spacer" })));
    document.body.append(box);
    document.body.classList.add("locked");

    let blob = null;
    const stop = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; track = null; };
    const finish = result => {
      if (done) return;
      done = true;
      stop();
      if (still.src) URL.revokeObjectURL(still.src);
      box.remove();
      document.body.classList.remove("locked");
      resolve(result);
    };
    const showLive = live => {
      video.hidden = !live; still.hidden = live;
      shutter.hidden = !live; flipBtn.hidden = !live;
      retake.hidden = live; use.hidden = live;
      torchBtn.hidden = !live || !canTorch();
    };
    const canTorch = () => {
      try { return !!(track && track.getCapabilities && track.getCapabilities().torch); } catch { return false; }
    };

    async function start() {
      stop();
      msg.textContent = "Starting camera…";
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
      } catch (e) {
        if (done) return;
        if (e && e.name === "NotAllowedError") {
          msg.textContent = "Camera access is blocked. Allow the camera for this app in your phone's settings, or close this and use Gallery.";
          shutter.disabled = true;
          return;
        }
        return finish("unavailable");
      }
      if (done) return stop();
      track = stream.getVideoTracks()[0];
      torchOn = false; torchBtn.textContent = "⚡ Off";
      video.srcObject = stream;
      try { await video.play(); } catch {}
      msg.textContent = "";
      shutter.disabled = false;
      showLive(true);
    }

    shutter.addEventListener("click", () => {
      if (!video.videoWidth) return;
      const c = document.createElement("canvas");
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext("2d").drawImage(video, 0, 0);
      c.toBlob(b => {
        c.width = 0; c.height = 0;
        if (!b) return;
        blob = b;
        if (still.src) URL.revokeObjectURL(still.src);
        still.src = URL.createObjectURL(b);
        showLive(false);
        // Pause the live feed while reviewing, to save battery.
        if (track) track.enabled = false;
      }, "image/jpeg", 0.9);
    });
    retake.addEventListener("click", () => { blob = null; if (track) track.enabled = true; showLive(true); });
    use.addEventListener("click", () => {
      const file = new File([blob], `catch-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
      file.inAppCamera = true;
      finish(file);
    });
    flipBtn.addEventListener("click", () => { facing = facing === "environment" ? "user" : "environment"; start(); });
    torchBtn.addEventListener("click", async () => {
      try {
        torchOn = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: torchOn }] });
        torchBtn.textContent = torchOn ? "⚡ On" : "⚡ Off";
      } catch { torchBtn.hidden = true; }
    });
    close.addEventListener("click", () => finish(null));
    start();
  });
}
