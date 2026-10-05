// Unit tests for the owner's invite email. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEmails, inviteEmail, mailtoLink } from "../js/invite.js";

test("reads one or several email addresses and flags typos", () => {
  assert.deepEqual(parseEmails("bo@example.com"), { emails: ["bo@example.com"], bad: [] });
  assert.deepEqual(parseEmails(" bo@example.com, cy@example.org;di@x.ca "), { emails: ["bo@example.com", "cy@example.org", "di@x.ca"], bad: [] });
  assert.deepEqual(parseEmails("bo@example, cy@example.org"), { emails: ["cy@example.org"], bad: ["bo@example"] });
  assert.deepEqual(parseEmails(""), { emails: [], bad: [] });
});

test("the invite has the league, code, link, install steps for both phones and sign-up steps", () => {
  const { subject, body } = inviteEmail({ league: "Walleye Gang", code: "PERCH-42", url: "https://example.test/app/", from: "Matt" });
  assert.equal(subject, "You're invited to join Walleye Gang on Lunker League");
  for (const bit of ["Walleye Gang", "YOUR INVITE CODE: PERCH-42", "https://example.test/app/", "iPhone", "Safari", "Add to Home Screen",
    "Android", "Chrome", "Install app", "Join the league", "Create account", "Enter the invite code: PERCH-42", "Matt"]) {
    assert.ok(body.includes(bit), `missing: ${bit}`);
  }
});

test("the mailto link encodes everything and uses CRLF line breaks", () => {
  const link = mailtoLink(["bo@example.com", "cy@example.org"], { subject: "Hi & welcome", body: "Line 1\nLine 2" });
  assert.equal(link, "mailto:bo@example.com,cy@example.org?subject=Hi%20%26%20welcome&body=Line%201%0D%0ALine%202");
});
