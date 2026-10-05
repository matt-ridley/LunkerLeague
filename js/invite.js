/* The invite email the league owner sends to friends: what the app is, how to install it on iPhone and Android,
   how to sign up, and the invite code. It opens in the owner's own email app, ready to send (a mailto: link), so
   it comes from their address and needs no email service. Pure functions. */

/* Splits "a@x.com, b@y.com" into valid addresses; returns { emails, bad }. */
export function parseEmails(text) {
  const parts = String(text || "").split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
  const ok = s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
  return { emails: parts.filter(ok), bad: parts.filter(s => !ok(s)) };
}

export function inviteEmail({ league, code, url, from }) {
  const subject = `You're invited to join ${league} on Lunker League`;
  const body = [
    "Hi!",
    "",
    `You're invited to join ${league} on Lunker League, our fishing league app.`,
    "",
    "Lunker League is where we log our catches with a photo, track personal bests and league records, run derbies, plan trips, and settle who's the best angler. It works on the water with no signal.",
    "",
    `YOUR INVITE CODE: ${code}`,
    "",
    "1. INSTALL THE APP",
    `Open this link on your phone: ${url}`,
    "- iPhone: open the link in Safari, tap the Share button, then \"Add to Home Screen\".",
    "- Android: open the link in Chrome, tap the menu (three dots), then \"Install app\" or \"Add to home screen\".",
    "Then always open Lunker League from the new icon on your home screen.",
    "",
    "2. SIGN UP",
    "- Tap \"Join the league\".",
    "- Enter your email and pick a password (at least 6 characters).",
    "- Enter your name for the league. A nickname is fine; everyone in the league sees it.",
    `- Enter the invite code: ${code}`,
    "- Tap \"Create account\".",
    "The first sign-in needs signal. After that the app works with no signal.",
    "",
    "See you on the water!",
    from || "",
  ].join("\n").trim();
  return { subject, body };
}

/* A mailto: link that opens the email app with the invite written. Line breaks are sent as CRLF, which every
   email app understands. */
export function mailtoLink(emails, { subject, body }) {
  const enc = s => encodeURIComponent(s).replace(/%0A/g, "%0D%0A");
  return `mailto:${emails.join(",")}?subject=${enc(subject)}&body=${enc(body)}`;
}
