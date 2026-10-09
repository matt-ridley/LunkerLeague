// Unit tests for exporting catches as CSV. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cell, toCsv, catchRows, HEADERS, fileName } from "../js/export.js";

test("cells are quoted when needed, and formulas are shown as text", () => {
  assert.equal(cell("Walleye"), "Walleye");
  assert.equal(cell("Jig, chartreuse"), '"Jig, chartreuse"');
  assert.equal(cell('the "big" one'), '"the ""big"" one"');
  assert.equal(cell("line one\nline two"), '"line one\nline two"');
  assert.equal(cell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
  assert.equal(cell("-5 wind chill"), "'-5 wind chill");
  assert.equal(cell("@everyone"), "'@everyone");
  assert.equal(cell(12.5), "12.5");
  assert.equal(cell(-79.4), "-79.4"); // numbers aren't touched
  assert.equal(cell(null), "");
  assert.equal(cell(true), "Yes");
  assert.equal(toCsv([["a", "b"], [1, null]]), "a,b\r\n1,\r\n");
});

test("a row per catch, oldest first, with tackle, spot and derby filled in", () => {
  const catches = [
    { id: "c2", uid: "amy", species: "Walleye", caughtAt: new Date(2026, 5, 2, 19, 5).getTime(), createdAt: new Date(2026, 5, 2, 20, 0).getTime(),
      weightOz: 88, lengthIn: 22.5, released: true, notes: "Big one", hasSpot: true, locShared: false, spotName: "", derbyId: "d1", dq: false },
    { id: "c1", uid: "amy", species: "Yellow Perch", caughtAt: new Date(2026, 5, 1, 9).getTime(), createdAt: new Date(2026, 5, 1, 9).getTime(),
      fishCount: 30, limit: true, released: false, notes: "", past: true },
    { id: "c3", uid: "amy", species: "Largemouth Bass", caughtAt: new Date(2026, 5, 3, 9).getTime(), lengthIn: 20, released: true },
  ];
  const rows = catchRows(catches, {
    tackle: new Map([["c2", { lure: "Jig", depthFt: 18, technique: "jigging", shared: false }]]),
    spots: new Map([["c2", { lat: 44.1234567, lng: -79.7654321, name: "North bay", shared: false }]]),
    derbies: new Map([["d1", { name: "Spring Fling" }]]),
  });
  assert.deepEqual(rows[0], HEADERS);
  assert.equal(rows.length, 4);
  const col = (r, h) => r[HEADERS.indexOf(h)];
  const [perch, walleye, bass] = rows.slice(1);
  assert.equal(col(perch, "Species"), "Yellow Perch");
  assert.equal(col(perch, "Fish"), 30);
  assert.equal(col(perch, "Limit"), true);
  assert.equal(col(perch, "Past catch"), true);
  assert.equal(col(perch, "Released"), null);
  assert.equal(col(walleye, "Caught"), "2026-Jun-02 07:05:00 PM");
  assert.equal(col(walleye, "Season"), 2026);
  assert.equal(col(walleye, "Weight"), "5 lb 8 oz");
  assert.equal(col(walleye, "Weight (lb)"), 5.5);
  assert.equal(col(walleye, "Derby"), "Spring Fling");
  assert.equal(col(walleye, "Disqualified"), false);
  assert.equal(col(walleye, "Bait or lure"), "Jig");
  assert.equal(col(walleye, "Technique"), "Jigging");
  assert.equal(col(walleye, "Tackle secret"), true);
  assert.equal(col(walleye, "Spot name"), "North bay");
  assert.equal(col(walleye, "Latitude"), 44.123457);
  assert.equal(col(walleye, "Spot shared"), false);
  assert.ok(col(bass, "Estimated weight (lb)") > 4.5);
  assert.equal(col(bass, "Weight (lb)"), null);
  // It all turns into one CSV, a line per row.
  assert.equal(toCsv(rows).trim().split("\r\n").length, 4);
});

test("the file is named for the day", () => {
  assert.equal(fileName(new Date(2026, 9, 8, 15).getTime()), "lunker-league-catches-2026-10-08.csv");
});
