/* Dead zones: the phone says it's online, but nothing comes back. When the app opens, Firebase checks the saved account
   with Google before it says who's signed in, and with no answer it waits its full 30 seconds, showing "Loading…".
   If that check fails with a network error, Firebase keeps the account signed in and carries on, so the app cuts the
   check off after a few seconds instead and opens from what's saved on the phone. */

export const ACCOUNT_CHECK_MS = 4000;

/* The account check Firebase makes at start-up (also through the emulator). */
export const isAccountCheck = url => /identitytoolkit\.googleapis\.com\/v1\/accounts:lookup/.test(url);

/* A fetch that gives up on matching requests after `ms` (an abort, which Firebase treats as a network error). */
export function timeBoxFetch(fetchImpl, match, ms) {
  return (input, init = {}) => {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    if (!match(url)) return fetchImpl(input, init);
    const ctl = new AbortController();
    if (init.signal) init.signal.addEventListener("abort", () => ctl.abort(), { once: true });
    const timer = setTimeout(() => ctl.abort(), ms);
    return fetchImpl(input, { ...init, signal: ctl.signal }).finally(() => clearTimeout(timer));
  };
}

/* Time-boxes the account check until `done` resolves (the first answer about who's signed in), then puts fetch back. */
export function timeBoxAccountCheck(done, ms = ACCOUNT_CHECK_MS) {
  if (typeof self === "undefined" || typeof self.fetch !== "function") return;
  const original = self.fetch;
  const wrapped = timeBoxFetch(original.bind(self), isAccountCheck, ms);
  self.fetch = wrapped;
  done.finally(() => { if (self.fetch === wrapped) self.fetch = original; });
}
