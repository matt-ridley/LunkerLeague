/* Export your catches as a spreadsheet (CSV) file, made on the phone: no server, works with no signal.
   Pure functions on plain data, plus download() for the browser. */
import { fmtDate, fmtWeight } from "./ui.js";
import { isStringer } from "./stats.js";
import { techniqueName } from "./tackle.js";
import { estimatedWeight } from "./estimate.js";

/* One cell: quoted when it has a comma, quote or line break. A cell that starts like a formula (= + - @) gets a
   leading apostrophe so a spreadsheet shows it as text instead of running it. Numbers are left as they are. */
export function cell(v) {
  if (v == null) return "";
  if (typeof v === "number") return isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = rows => rows.map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";

export const HEADERS = ["Caught", "Season", "Species", "Weight", "Weight (lb)", "Length (in)", "Estimated weight (lb)", "Fish", "Limit",
  "Released", "Past catch", "Derby", "Disqualified", "Bait or lure", "Depth (ft)", "Technique", "Tackle secret",
  "Spot name", "Latitude", "Longitude", "Spot shared", "Notes", "Logged", "Catch ID"];

const lb = oz => (oz > 0 ? Math.round((oz / 16) * 100) / 100 : null);

/* The rows (headers first) for some catches, oldest first. tackle and spots: Maps of catch id -> doc (what this phone
   can see); derbies: Map of id -> derby. */
export function catchRows(catches, { tackle = new Map(), spots = new Map(), derbies = new Map() } = {}) {
  const rows = [HEADERS];
  for (const c of [...catches].sort((a, b) => a.caughtAt - b.caughtAt)) {
    const str = isStringer(c), t = tackle.get(c.id), s = spots.get(c.id), d = c.derbyId && derbies.get(c.derbyId);
    rows.push([
      fmtDate(c.caughtAt), new Date(c.caughtAt).getFullYear(), c.species,
      fmtWeight(c.weightOz), lb(c.weightOz), c.lengthIn > 0 ? c.lengthIn : null, lb(estimatedWeight(c)),
      str ? c.fishCount : 1, str ? !!c.limit : null, str ? null : !!c.released, !!c.past,
      d ? d.name : c.derbyId ? "(deleted derby)" : "", c.derbyId ? !!c.dq : null,
      t ? t.lure : "", t && t.depthFt ? t.depthFt : null, t ? techniqueName(t.technique) : "", t ? !t.shared : null,
      s ? s.name || "" : c.spotName || "", s ? Math.round(s.lat * 1e6) / 1e6 : null, s ? Math.round(s.lng * 1e6) / 1e6 : null,
      c.hasSpot ? !!c.locShared : null,
      c.notes || "", c.createdAt ? fmtDate(c.createdAt) : "", c.id,
    ]);
  }
  return rows;
}

/* "lunker-league-catches-2026-10-08.csv" */
export function fileName(now = Date.now()) {
  const d = new Date(now), p = n => String(n).padStart(2, "0");
  return `lunker-league-catches-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.csv`;
}

/* Saves the file on the phone. A byte-order mark first, so Excel reads accents and emoji correctly. */
export function download(csv, name) {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
