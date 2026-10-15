// Unit tests for the dead-zone account check. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAccountCheck, timeBoxFetch } from "../js/deadzone.js";

// A fetch that never answers (a dead zone) until it's aborted.
const hanging = (input, init = {}) => new Promise((resolve, reject) => {
  init.signal && init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
});

test("only the account check is time-boxed", () => {
  assert.ok(isAccountCheck("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=abc"));
  assert.ok(isAccountCheck("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=abc"));
  assert.ok(!isAccountCheck("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=abc"));
  assert.ok(!isAccountCheck("https://securetoken.googleapis.com/v1/token"));
});

test("a hanging account check gives up after the time box", async () => {
  const f = timeBoxFetch(hanging, isAccountCheck, 50);
  const t0 = Date.now();
  await assert.rejects(f("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=k", { method: "POST" }), /Abort/);
  assert.ok(Date.now() - t0 < 1000);
});

test("other requests and quick answers pass straight through", async () => {
  const calls = [];
  const quick = async (input, init) => { calls.push([input, !!(init && init.signal)]); return "ok"; };
  const f = timeBoxFetch(quick, isAccountCheck, 50);
  assert.equal(await f("https://example.test/x"), "ok");
  assert.equal(await f({ url: "https://identitytoolkit.googleapis.com/v1/accounts:lookup" }), "ok");
  assert.deepEqual(calls.map(c => c[1]), [false, true]);
});

test("the caller can still cancel it", async () => {
  const f = timeBoxFetch(hanging, isAccountCheck, 10000);
  const ctl = new AbortController();
  const p = f("https://identitytoolkit.googleapis.com/v1/accounts:lookup", { signal: ctl.signal });
  ctl.abort();
  await assert.rejects(p, /Abort/);
});
