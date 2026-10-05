// Unit tests for @mentions. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { findMentions, mentionParts, mentionQuery } from "../js/mentions.js";

const members = [{ id: "a", displayName: "Big" }, { id: "b", displayName: "Big Jim" }, { id: "c", displayName: "Sue" }];

test("finds who is mentioned, preferring the longest name", () => {
  assert.deepEqual(findMentions("@Big Jim you in?", members), ["b"]);
  assert.deepEqual(findMentions("@big jim and @sue", members).sort(), ["b", "c"]);
  assert.deepEqual(findMentions("@Big and @Big Jim", members).sort(), ["a", "b"]);
  assert.deepEqual(findMentions("email me at sue@home", members), []);
  assert.deepEqual(findMentions("no one here", members), []);
});

test("splits text so mentions can be highlighted", () => {
  assert.deepEqual(mentionParts("Hey @Big Jim, nice!", ["b"], members), [{ text: "Hey " }, { text: "@Big Jim", uid: "b" }, { text: ", nice!" }]);
  assert.deepEqual(mentionParts("@Sue", ["c"], members), [{ text: "@Sue", uid: "c" }]);
  assert.deepEqual(mentionParts("@Sue hi", [], members), [{ text: "@Sue hi" }]); // not saved as a mention
});

test("spots an @name being typed", () => {
  assert.deepEqual(mentionQuery("hey @Bi", 7), { start: 4, query: "Bi" });
  assert.deepEqual(mentionQuery("@", 1), { start: 0, query: "" });
  assert.equal(mentionQuery("sue@home", 8), null);
  assert.equal(mentionQuery("hey there", 9), null);
});
