// Unit tests for feed search, filters and sort. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_FILTERS, filterFeed, activeCount, isFiltered, sinceOf } from "../js/feedfilter.js";

const H = 3600e3, DAY = 24 * H;
const NOW = new Date(2026, 5, 15, 12).getTime();
let n = 0;
const fish = (uid, species, extra = {}) => ({ id: "c" + ++n, uid, species, weightOz: null, lengthIn: null, caughtAt: NOW - H, createdAt: NOW - H, notes: "", ...extra });
const names = { amy: "Amy", bo: "Bo" };
const run = (catches, news, f, more = {}) => filterFeed({ catches, news, f: { ...NO_FILTERS, ...f }, me: "amy", name: u => names[u], derbyName: id => (id === "d1" ? "Spring Derby" : ""), now: NOW, ...more });
const ids = r => r.catches.map(c => c.id);

const walleye = fish("amy", "Walleye", { weightOz: 80, lengthIn: 22, notes: "Caught on a jig at the dam" });
const pike = fish("bo", "Northern Pike", { weightOz: 120, lengthIn: 30, derbyId: "d1" });
const perch = fish("bo", "Yellow Perch", { lengthIn: 9, caughtAt: NOW - 20 * DAY, createdAt: NOW - 20 * DAY });
const old = fish("amy", "Walleye", { weightOz: 60, caughtAt: NOW - 400 * DAY, createdAt: NOW - 2 * H, past: true });
const catches = [walleye, pike, perch, old];
const news = [
  { id: "badge:bo:first", at: NOW - H, uids: ["bo"], cid: pike.id, text: "Bo earned the First Fish badge" },
  { id: "derby:d1", at: NOW - 2 * H, uids: ["bo", "amy"], text: "Spring Derby is over: 🥇 Bo · 🥈 Amy" },
  { id: "crown:x:1", at: NOW - 3 * H, uids: ["bo", "amy"], text: "Bo stole the Grinder crown from Amy" },
];

test("no filters: everything, with catch news on its card and the rest on its own", () => {
  const r = run(catches, news, {});
  assert.equal(r.catches.length, 4);
  assert.deepEqual(r.onCard.get(pike.id).map(e => e.id), ["badge:bo:first"]);
  assert.deepEqual(r.loose.map(e => e.id), ["derby:d1", "crown:x:1"]);
  assert.equal(isFiltered(NO_FILTERS), false);
});

test("search matches species, angler, notes and derby name, every word", () => {
  assert.deepEqual(ids(run(catches, news, { q: "jig" })), [walleye.id]);
  assert.deepEqual(ids(run(catches, news, { q: "bo perch" })), [perch.id]);
  assert.deepEqual(ids(run(catches, news, { q: "spring" })), [pike.id]);
  assert.deepEqual(run(catches, news, { q: "grinder" }).loose.map(e => e.id), ["crown:x:1"]);
  assert.equal(run(catches, news, { q: "muskie" }).catches.length, 0);
});

test("angler, Mine, species and when", () => {
  assert.deepEqual(ids(run(catches, news, { angler: "bo" })), [pike.id, perch.id]);
  assert.deepEqual(ids(run(catches, news, { angler: "bo" }, { mine: true })), [walleye.id, old.id]); // Mine wins
  const sp = run(catches, news, { species: "Walleye" });
  assert.deepEqual(ids(sp), [walleye.id, old.id]);
  assert.equal(sp.loose.length, 0); // news isn't about a species
  assert.deepEqual(ids(run(catches, news, { when: "7d" })), [walleye.id, pike.id]);
  assert.equal(sinceOf("today", NOW), new Date(2026, 5, 15).getTime());
});

test("show: catches only, news only, records and PBs, throwbacks", () => {
  assert.equal(run(catches, news, { show: "catches" }).loose.length, 0);
  const onlyNews = run(catches, news, { show: "news" });
  assert.equal(onlyNews.catches.length, 0);
  assert.equal(onlyNews.loose.length, 3); // catch news gets its own card when its catch isn't shown
  assert.deepEqual(ids(run(catches, news, { show: "past" })), [old.id]);
  assert.ok(!ids(run(catches, news, { show: "records" })).includes(old.id)); // a smaller walleye than Amy's PB
});

test("derby filter keeps that derby's catches and its result", () => {
  const r = run(catches, news, { derby: "d1" });
  assert.deepEqual(ids(r), [pike.id]);
  assert.deepEqual(r.loose.map(e => e.id), ["derby:d1"]);
});

test("sorting by size lists measured fish only, biggest first, with no news cards", () => {
  const heavy = run(catches, news, { sort: "heavy" });
  assert.deepEqual(ids(heavy), [pike.id, walleye.id, old.id]);
  assert.equal(heavy.loose.length, 0);
  assert.deepEqual(ids(run(catches, news, { sort: "long" })), [pike.id, walleye.id, perch.id]);
});

test("filters in use are counted; search is not", () => {
  assert.equal(activeCount({ ...NO_FILTERS, q: "pike" }), 0);
  assert.equal(isFiltered({ ...NO_FILTERS, q: "pike" }), true);
  assert.equal(activeCount({ ...NO_FILTERS, species: "Walleye", sort: "long" }), 2);
});
