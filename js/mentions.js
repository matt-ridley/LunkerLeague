/* @mentions in chat and comments. A mention is written as "@Display Name" in the text, and the message also saves
   the mentioned user ids (`mentions`), so the right person is alerted even if two names look alike.
   Pure functions on plain data: members are [{ id, displayName }]. */

const lower = s => String(s || "").toLowerCase();

/* The ids of members mentioned in the text, longest names first so "@Big Jim" beats "@Big". */
export function findMentions(text, members) {
  const t = lower(text), out = [];
  let rest = t;
  for (const m of [...members].filter(m => m.displayName).sort((a, b) => b.displayName.length - a.displayName.length)) {
    const tag = "@" + lower(m.displayName);
    if (!rest.includes(tag)) continue;
    out.push(m.id);
    rest = rest.split(tag).join(" "); // so a shorter name inside this one doesn't match too
  }
  return out.slice(0, 20);
}

/* Splits text into plain and mention parts for display: [{ text, uid? }]. */
export function mentionParts(text, mentions, members) {
  const names = (mentions || []).map(id => members.find(m => m.id === id)).filter(m => m && m.displayName)
    .sort((a, b) => b.displayName.length - a.displayName.length);
  const parts = [];
  let s = String(text || ""), plain = "";
  while (s) {
    const m = s[0] === "@" && names.find(n => lower(s.slice(1, 1 + n.displayName.length)) === lower(n.displayName));
    if (m) {
      if (plain) parts.push({ text: plain }), plain = "";
      parts.push({ text: s.slice(0, 1 + m.displayName.length), uid: m.id });
      s = s.slice(1 + m.displayName.length);
    } else { plain += s[0]; s = s.slice(1); }
  }
  if (plain) parts.push({ text: plain });
  return parts;
}

/* The "@word" being typed just before the cursor, or null: { start, query }. */
export function mentionQuery(text, cursor) {
  const before = String(text || "").slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at < 0 || (at > 0 && !/\s/.test(before[at - 1]))) return null;
  const query = before.slice(at + 1);
  if (query.length > 30 || /\n/.test(query) || /\s\s/.test(query)) return null;
  return { start: at, query };
}
