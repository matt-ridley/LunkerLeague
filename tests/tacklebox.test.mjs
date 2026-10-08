// Unit tests for the tackle box. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { itemLine, itemCatches, pickerItems, lastTackle, fillFromCatches, typeName } from "../js/tacklebox.js";

const c = (id, uid, caughtAt, createdAt = caughtAt, extra = {}) => [id, { id, uid, species: "Walleye", caughtAt, createdAt, ...extra }];
const t = (id, uid, lure, extra = {}) => [id, { uid, lure, depthFt: null, technique: "", shared: true, ...extra }];

test("an item reads as one line", () => {
  assert.equal(itemLine({ type: "jig", technique: "jigging", depthFt: 18 }), "Jig · Jigging · usually 18 ft");
  assert.equal(itemLine({ type: "", technique: "", depthFt: null }), "");
  assert.equal(typeName("nope"), "");
});

test("an item's catches are the ones this phone can see, newest first, without disqualified ones", () => {
  const catches = new Map([c("a", "me", 1), c("b", "me", 3), c("d", "me", 2, 2, { dq: true }), c("e", "me", 4)]);
  const tackle = new Map([t("a", "me", "Jig", { itemId: "i1" }), t("b", "me", "Jig", { itemId: "i1" }), t("d", "me", "Jig", { itemId: "i1" }), t("e", "me", "Spoon", { itemId: "i2" })]);
  assert.deepEqual(itemCatches("i1", catches, tackle).map(x => x.id), ["b", "a"]);
  assert.deepEqual(itemCatches("i1", [...catches.values()], tackle).map(x => x.id), ["b", "a"]);
});

test("the picker shows my items that aren't retired, most recently used first", () => {
  const items = new Map([
    ["i1", { id: "i1", uid: "me", name: "Jig", createdAt: 1 }], ["i2", { id: "i2", uid: "me", name: "Spoon", createdAt: 2 }],
    ["i3", { id: "i3", uid: "me", name: "Old", createdAt: 3, retired: true }], ["i4", { id: "i4", uid: "you", name: "Theirs", createdAt: 4 }],
    ["i5", { id: "i5", uid: "me", name: "New", createdAt: 5 }],
  ]);
  const catches = new Map([c("a", "me", 10, 10), c("b", "me", 20, 30)]);
  const tackle = new Map([t("a", "me", "Spoon", { itemId: "i2" }), t("b", "me", "Jig", { itemId: "i1" })]);
  assert.deepEqual(pickerItems(items, "me", catches, tackle).map(i => i.id), ["i1", "i2", "i5"]);
});

test("the last tackle is from the catch logged most recently", () => {
  const catches = new Map([c("a", "me", 50, 50), c("b", "me", 10, 90), c("d", "you", 99, 99)]);
  const tackle = new Map([t("a", "me", "Spoon", { technique: "trolling" }), t("b", "me", "Jig", { depthFt: 18, technique: "jigging", itemId: "i1" }), t("d", "you", "Theirs")]);
  assert.deepEqual(lastTackle("me", catches, tackle), { lure: "Jig", depthFt: 18, technique: "jigging", itemId: "i1" });
  assert.equal(lastTackle("nobody", catches, tackle), null);
});

test("filling the box from catches: one item per lure, the usual technique and depth, linking ones already there", () => {
  const items = new Map([["i1", { id: "i1", uid: "me", name: "Crankbait" }]]);
  const catches = new Map([c("a", "me", 1), c("b", "me", 2), c("d", "me", 3), c("e", "me", 4), c("f", "me", 5), c("g", "you", 6), c("h", "me", 7)]);
  const tackle = new Map([
    t("a", "me", "Jig and minnow", { technique: "jigging", depthFt: 18 }),
    t("b", "me", "jig and minnow", { technique: "jigging", depthFt: 22 }),
    t("d", "me", "Jig and minnow!", { technique: "drift" }),
    t("e", "me", "crankbait", { technique: "trolling" }),
    t("f", "me", "", { technique: "fly" }),          // no lure: nothing to add
    t("g", "you", "Spoon"),                          // someone else's
    t("h", "me", "Spoon", { itemId: "i9" }),         // already linked to an item
  ]);
  const { add, link } = fillFromCatches("me", items, catches, tackle);
  assert.deepEqual(add, [{ name: "Jig and minnow", technique: "jigging", depthFt: 20, catchIds: ["a", "b", "d"] }]);
  assert.deepEqual(link, [{ itemId: "i1", catchIds: ["e"] }]);
});

test("the lucky lure: a pinned item, else the one with the most fish", async () => {
  const { luckyLure } = await import("../js/tacklebox.js");
  const items = new Map([
    ["i1", { id: "i1", uid: "me", name: "Jig", createdAt: 1 }], ["i2", { id: "i2", uid: "me", name: "Spoon", createdAt: 2 }],
    ["i3", { id: "i3", uid: "me", name: "Never used", createdAt: 3 }], ["i9", { id: "i9", uid: "you", name: "Theirs", createdAt: 0 }],
  ]);
  const catches = new Map([c("a", "me", 1), c("b", "me", 2), c("d", "me", 3, 3, { fishCount: 12 }), c("e", "me", 4, 4, { dq: true })]);
  const tackle = new Map([t("a", "me", "Jig", { itemId: "i1" }), t("b", "me", "Jig", { itemId: "i1" }), t("d", "me", "Spoon", { itemId: "i2" }), t("e", "me", "Jig", { itemId: "i1" })]);
  assert.deepEqual(luckyLure("me", null, items, catches, tackle), { item: items.get("i2"), fish: 12, pinned: false }); // a stringer counts its fish
  assert.deepEqual(luckyLure("me", "i3", items, catches, tackle), { item: items.get("i3"), fish: 0, pinned: true });
  assert.equal(luckyLure("me", "i9", items, catches, tackle).item.id, "i2"); // someone else's item can't be pinned
  assert.equal(luckyLure("me", "gone", items, catches, tackle).item.id, "i2");
  assert.equal(luckyLure("nobody", null, items, catches, tackle), null);
});
