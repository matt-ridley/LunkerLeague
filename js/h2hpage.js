/* Head-to-head challenges: the list (the Head-to-head tab of the Events page), one challenge's page (the terms, the
   live score, answering), and the form for challenging someone or countering an offer. */
import { el, field, avatar, fill, fmtDate, fmtDay, toast, confirmButton } from "./ui.js";
import { store, uid, isOwner, memberName, sendChallenge, acceptChallenge, declineChallenge, withdrawChallenge, counterChallenge,
  vetoChallenge, subscribe } from "./cloud.js";
import { WIN, MAX_DAYS, LATE_HOURS, challengeStatus, STATUS_LABEL, challengeBoard, stakeRoom, termsProblem, termsShort, winLabel,
  scoreText, stakesText, otherSide, involves, closesAt, changedTerms, h2hResults, h2hRecord, recordText, rematchTerms } from "./h2h.js";
import { scoringTimeline, currentScoring } from "./rank.js";
import { thisSeason } from "./season.js";
import { rankInput } from "./leaders.js";
import { SPECIES, normalizeSpecies } from "./species.js";
import { focusStyle } from "./thumbfocus.js";

const who = id => store.members.get(id) || { id, displayName: memberName(id) };
const allCatches = () => [...store.catches.values()];
const challenges = () => [...store.challenges.values()];
const scoring = () => currentScoring(scoringTimeline(store.scoring));
const PILL = { open: "upcoming", upcoming: "upcoming", live: "active", closing: "closing", expired: "cancelled", declined: "cancelled",
  withdrawn: "cancelled", vetoed: "cancelled", done: "" };

/* Points this angler can stake right now (their points this season, less what's staked elsewhere, up to the league max). */
function roomFor(u, except = null) {
  const row = thisSeason(rankInput()).find(r => r.uid === u);
  return stakeRoom(u, row ? row.points : 0, challenges(), scoring().h2hMaxStake, { except });
}

/* "3 h 20 min", "2 days" */
function span(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.round(h / 24)} days`;
}
function when(ch, now = Date.now()) {
  const st = challengeStatus(ch, now), t = ch.terms;
  if (st === "open") return `Starts ${fmtDate(t.start)} · answer within ${span(t.start - now)}`;
  if (st === "upcoming") return `Starts in ${span(t.start - now)} · ${fmtDate(t.start)}`;
  if (st === "live") return `Ends in ${span(t.end - now)} · ${fmtDate(t.end)}`;
  if (st === "closing") return `Fishing's over. Late catches can sync for ${span(closesAt(ch) - now)}`;
  if (st === "expired") return `Nobody accepted it before ${fmtDate(t.start)}`;
  return `${fmtDay(t.start)} to ${fmtDay(t.end)}`;
}
const vsTitle = ch => `${who(ch.from).displayName} vs ${who(ch.to).displayName}`;

/* ---------- The list ---------- */
function challengeCard(ch) {
  const st = challengeStatus(ch), started = ["live", "closing", "done", "vetoed"].includes(st) && ch.status === "accepted";
  const r = started ? challengeBoard(ch, allCatches()) : null;
  const side = s => el("div", { class: "h2h-side" + (r && st === "done" && r.winner === s.uid ? " won" : "") }, avatar(who(s.uid), "sm"),
    el("span", { class: "name", text: who(s.uid).displayName }),
    r ? el("b", { text: scoreText(ch.terms, r.sides.find(x => x.uid === s.uid).score) }) : null);
  return el("a", { class: "h2h-card", href: `#/h/${ch.id}` },
    el("div", { class: "row spread" }, el("b", { text: termsShort(ch.terms) }),
      el("span", { class: `pill ${PILL[st]}`, text: ch.status === "open" && ch.turn === uid() && st === "open" ? "Your move" : STATUS_LABEL[st] })),
    el("div", { class: "h2h-vs" }, side({ uid: ch.from }), el("span", { class: "h2h-x", text: "⚔️" }), side({ uid: ch.to })),
    el("div", { class: "muted small", text: `${when(ch)} · ${stakesText(ch.terms)}` }));
}

/* The Head-to-head tab of the Events page. */
export function challengesSection() {
  const now = Date.now(), me = uid(), all = challenges();
  const by = sts => all.filter(ch => sts.includes(challengeStatus(ch, now)));
  const yourMove = by(["open"]).filter(ch => ch.turn === me).sort((a, b) => a.terms.start - b.terms.start);
  const waiting = by(["open"]).filter(ch => ch.turn !== me).sort((a, b) => a.terms.start - b.terms.start);
  const live = by(["live", "closing"]).sort((a, b) => a.terms.end - b.terms.end);
  const upcoming = by(["upcoming"]).sort((a, b) => a.terms.start - b.terms.start);
  const done = by(["done", "vetoed"]).sort((a, b) => b.terms.end - a.terms.end).slice(0, 15);
  const group = (title, list) => list.length ? el("section", { class: "stack" }, el("h3", { text: title }), el("div", { class: "card-list" }, ...list.map(challengeCard))) : null;
  return el("section", { class: "stack" },
    el("div", { class: "row spread" }, el("h3", { text: "⚔️ Head-to-head" }),
      el("a", { class: "btn small lime", href: "#/hnew", text: "Challenge someone" })),
    !all.length ? el("div", { class: "card empty" },
      el("p", { text: "Think you can outfish someone? Challenge them: pick the fish, the time and what's at stake, and let the catches settle it." })) : null,
    group("Your move", yourMove), group("Live now", live), group("Coming up", upcoming), group("Waiting for an answer", waiting), group("Finished", done),
    recordsBoard());
}

/* Everyone's head-to-head record, most wins first. */
function recordsBoard() {
  const results = h2hResults(challenges(), allCatches());
  const rows = [...new Set(results.flatMap(r => [r.ch.from, r.ch.to]))].map(u => ({ uid: u, rec: h2hRecord(u, results) }))
    .sort((a, b) => b.rec.w - a.rec.w || a.rec.l - b.rec.l || who(a.uid).displayName.localeCompare(who(b.uid).displayName));
  if (!rows.length) return null;
  return el("section", { class: "stack" }, el("h3", { text: "Records" }),
    el("ul", { class: "member-list card" }, ...rows.map(({ uid: u, rec }) => el("li", { class: "member-row" },
      avatar(who(u), "sm"),
      el("a", { class: "grow name", href: `#/u/${u}`, text: who(u).displayName }),
      rec.streak >= 2 ? el("span", { class: "muted small", text: `🔥 ${rec.streak} in a row` }) : null,
      el("b", { text: recordText(rec) })))),
    el("p", { class: "hint", text: "Wins–losses(–ties) in finished challenges. Vetoed ones don't count." }));
}

/* A profile's head-to-head line: their record, and yours against them. Null until they've finished one. */
export function profileRecord(u) {
  const results = h2hResults(challenges(), allCatches()), rec = h2hRecord(u, results);
  if (!rec.played) return null;
  const me = uid(), mine = u !== me ? rec.vs.get(me) : null;
  return el("a", { class: "h2h-record", href: "#/derbies", onclick: () => { try { sessionStorage.setItem("lunker-events-tab", "h2h"); } catch {} } },
    el("span", { class: "eyebrow", text: "⚔️ Head-to-head" }),
    el("b", { text: `${recordText(rec)}` }),
    el("span", { class: "muted small", text: [`${rec.w} won · ${rec.l} lost${rec.t ? ` · ${rec.t} tied` : ""}`,
      rec.streak >= 2 ? `🔥 ${rec.streak} wins in a row` : "",
      mine ? `vs you: ${recordText({ w: mine.l, l: mine.w, t: mine.t })}` : ""].filter(Boolean).join(" · ") }));
}

/* ---------- One challenge ---------- */
export function renderChallenge(main, id) {
  try { sessionStorage.setItem("lunker-events-tab", "h2h"); } catch {} // "← Events" comes back here
  const ch = store.challenges.get(id);
  if (!ch) return fill(main, el("div", { class: "card empty" }, el("p", { text: store.catchesLoaded ? "This challenge doesn't exist." : "Loading…" })));
  const st = challengeStatus(ch), me = uid(), t = ch.terms, mine = involves(ch, me), v = scoring();
  const started = ch.status === "accepted" && ["live", "closing", "done", "vetoed"].includes(st);

  const head = el("section", { class: "derby-head h2h-head" },
    el("span", { class: "pills" }, el("span", { class: `pill ${PILL[st]}`, text: STATUS_LABEL[st] })),
    el("h2", { text: `⚔️ ${vsTitle(ch)}` }),
    el("p", { class: "derby-when", text: when(ch) }),
    t.note ? el("p", { text: `“${t.note}”` }) : null,
    el("p", { class: "prize", text: `🏆 ${stakesText(t)}` }));

  let board = null;
  if (started) {
    const r = challengeBoard(ch, allCatches());
    const final = st === "done";
    board = el("section", { class: "card stack" },
      el("h3", { text: st === "vetoed" ? "🚫 Vetoed" : final ? (r.tie ? "🤝 A tie" : `🏆 ${who(r.winner).displayName} wins`) : "Score" }),
      el("div", { class: "h2h-board" }, ...r.sides.map(s => {
        const lead = !r.tie && r.winner === s.uid;
        return el("div", { class: "h2h-col" + (lead && st !== "vetoed" ? " lead" : "") },
          avatar(who(s.uid), "lg"), el("b", { class: "name", text: who(s.uid).displayName }),
          el("div", { class: "h2h-score", text: scoreText(t, s.score) }),
          el("div", { class: "muted small", text: s.count ? `${s.count} fish logged` : "No fish yet" }),
          lead && (st === "live" || st === "closing") ? el("span", { class: "badge pb", text: "Leading" }) : null,
          s.fish.length ? el("div", { class: "h2h-fish" }, ...s.fish.slice(0, 6).map(c => el("a", { href: `#/c/${c.id}` },
            el("img", { class: "thumb sm", src: c.thumb, alt: c.species, loading: "lazy", style: focusStyle(c) })))) : null);
      })),
      st === "closing" ? el("p", { class: "hint", text: `Fishing time is over. Catches made during it can still sync until ${fmtDate(closesAt(ch))}, so this can change.` }) : null,
      st === "vetoed" ? el("p", { class: "entry-problem", text: "🚫 The league owner vetoed this challenge, so no points move." }) : null,
      final && !r.tie && t.stake ? el("p", { class: "hint", text: `${who(r.winner).displayName} takes ${t.stake} points from ${who(r.loser).displayName}.` }) : null);
  }

  const facts = el("dl", { class: "facts card" },
    fact("How it's won", winLabel(t)),
    fact("Species", t.species && t.species.length ? t.species.join(", ") : "Any species"),
    fact("Starts", fmtDate(t.start)), fact("Ends", fmtDate(t.end)),
    fact("Points staked", t.stake ? `${t.stake} each: the winner takes the loser's` : "None"),
    t.money ? fact("Bet", t.money) : null,
    fact("Points for everyone", `${v.h2hPts} for fishing it (at least one fish), ${v.h2hWinPts} more for the winner. A tie: no winner, nothing moves`),
    fact("What counts", `Catches made during it, with their photo, sent within ${LATE_HOURS} h of the end. A stringer counts as its number of fish for most fish only`),
    ch.counters ? fact("Offers", `Countered ${ch.counters} ${ch.counters === 1 ? "time" : "times"}. Last offer by ${who(otherSide(ch, ch.turn)).displayName}`) : null,
    fact("Challenged", `${who(ch.from).displayName} challenged ${who(ch.to).displayName} ${fmtDate(ch.createdAt)}`));

  // Answering: whoever's turn it is accepts, counters or declines; the other one can withdraw.
  let actions = null;
  if (st === "open" && mine && ch.turn === me) {
    const room = roomFor(me, ch.id), short = t.stake > room;
    actions = el("section", { class: "card stack" },
      el("h3", { text: ch.counters ? `${who(otherSide(ch, me)).displayName} countered. Your move` : `${who(ch.from).displayName} challenged you` }),
      short ? el("p", { class: "entry-problem", text: `You can only stake ${room} ${room === 1 ? "point" : "points"} right now, so counter with a smaller stake.` }) : null,
      el("div", { class: "row" },
        el("button", { class: "btn lime", type: "button", text: "🤝 Accept", disabled: short, onclick: () => { acceptChallenge(ch.id); toast("Challenge accepted. Game on!"); } }),
        el("a", { class: "btn", href: `#/hcounter/${ch.id}`, text: "Counter" }),
        confirmButton("Decline", "Tap again to decline", () => { declineChallenge(ch.id); toast("Challenge declined."); }, "btn quiet")),
      el("p", { class: "hint", text: `Answer before it starts, ${fmtDate(t.start)}, or it expires.` }));
  } else if (st === "open" && mine) {
    actions = el("section", { class: "card stack" },
      el("p", { text: `Waiting for ${who(ch.turn).displayName} to answer. It expires if nobody accepts it by ${fmtDate(t.start)}.` }),
      confirmButton("Take back the challenge", "Tap again to take it back", () => { withdrawChallenge(ch.id); toast("Challenge taken back."); }, "btn quiet block"));
  }

  // Run it back: same terms, new times. "Challenge again" when it never got going.
  if (mine && (st === "done" || st === "vetoed")) actions = el("a", { class: "btn lime block", href: `#/hrematch/${ch.id}`, text: "🔁 Rematch" });
  else if (mine && ["expired", "declined", "withdrawn"].includes(st)) actions = el("a", { class: "btn block", href: `#/hrematch/${ch.id}`, text: "⚔️ Challenge again" });

  const owner = isOwner() && ch.status === "accepted" ? el("section", { class: "card stack" },
    el("h3", { text: "League owner" }),
    ch.vetoed
      ? el("button", { class: "btn", type: "button", text: "Undo the veto", onclick: () => { vetoChallenge(ch.id, false); toast("Veto taken back."); } })
      : confirmButton("Veto this challenge", "Tap again to veto", () => { vetoChallenge(ch.id, true); toast("Vetoed. No points move."); }),
    el("p", { class: "hint", text: "A veto voids the challenge: no points for taking part or winning, and any staked points go back." })) : null;

  fill(main, head, board, actions, facts, owner);
}
const fact = (k, val) => el("div", { class: "fact" }, el("dt", { text: k }), el("dd", { text: val }));

/* ---------- Challenge or counter ---------- */
const pad = n => String(n).padStart(2, "0");
const toLocalInput = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/* The form doesn't redraw with live data, so a reload straight onto it waits for the data first. */
let stopWaiting = () => {};
function waitFor(main, ready, draw) {
  stopWaiting();
  const hash = location.hash;
  fill(main, el("div", { class: "card empty" }, el("p", { text: "Loading…" })));
  const off = subscribe(() => {
    if (location.hash !== hash) return stopWaiting();
    if (ready()) { stopWaiting(); draw(); }
  });
  stopWaiting = () => { off(); stopWaiting = () => {}; };
}

/* `opponent`: a member to challenge (new). `counterId`: the challenge being countered. `rematchId`: a challenge to run
   again (same terms, new times). */
export function renderChallengeForm(main, opponent, counterId, rematchId) {
  // Ready once the challenge (when countering or rematching) and the angler being challenged have loaded.
  const rivalId = () => { const ch = store.challenges.get(counterId || rematchId); return ch ? otherSide(ch, uid()) : opponent; };
  const loaded = () => store.catchesLoaded && store.members.size > 0 && (!counterId || store.challenges.has(counterId))
    && (!rematchId || store.challenges.has(rematchId)) && (!rivalId() || store.members.has(rivalId()));
  if (!loaded()) return waitFor(main, loaded, () => renderChallengeForm(main, opponent, counterId, rematchId));
  const source = rematchId ? store.challenges.get(rematchId) : null;
  if (source) opponent = otherSide(source, uid());
  const me = uid(), countering = counterId ? store.challenges.get(counterId) : null;
  if (countering && !(challengeStatus(countering) === "open" && countering.turn === me)) {
    return fill(main, el("div", { class: "card" }, el("p", { text: "You can only counter a challenge when it's your move." })));
  }
  const start0 = new Date(); start0.setMinutes(0, 0, 0); start0.setHours(start0.getHours() + 1);
  const t = countering ? { ...countering.terms } : source ? rematchTerms(source.terms) : { win: "heaviest", bagSize: 5, species: [], start: start0.getTime(), end: start0.getTime() + 48 * 3600e3, stake: 0, money: "", note: "" };
  const room = roomFor(me, countering ? countering.id : null), maxStake = scoring().h2hMaxStake;

  const others = [...store.members.values()].filter(m => m.id !== me && !m.suspended).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const rival = el("select", { "aria-label": "Who" }, el("option", { value: "", text: "Pick an angler" }), ...others.map(m => el("option", { value: m.id, text: m.displayName })));
  rival.value = countering ? otherSide(countering, me) : (others.some(m => m.id === opponent) ? opponent : "");
  rival.disabled = !!countering;

  const win = el("select", {}, ...Object.entries(WIN).map(([k, w]) => el("option", { value: k, text: w.label })));
  win.value = t.win;
  const bag = el("input", { type: "text", inputmode: "numeric", value: String(t.win === "bag" ? t.bagSize : 3) });
  const bagField = field("How many top fish", bag, "Each angler's heaviest this many fish are added up.");
  const syncWin = () => { bagField.hidden = win.value !== "bag"; };
  win.addEventListener("change", syncWin); syncWin();

  let species = [...(t.species || [])];
  const chips = el("div", { class: "chips" });
  const drawChips = () => fill(chips, species.length ? species.map(sp => el("button", { type: "button", class: "chip removable", text: `${sp} ✕`,
    onclick: () => { species = species.filter(x => x !== sp); drawChips(); } })) : el("span", { class: "muted small", text: "Any species counts" }));
  drawChips();
  const spInput = el("input", { type: "text", list: "h2h-species", placeholder: "Add a species", autocapitalize: "words" });
  const addSp = () => { const v = normalizeSpecies(spInput.value); if (v && !species.includes(v) && species.length < 10) species.push(v); spInput.value = ""; drawChips(); };
  spInput.addEventListener("change", addSp);
  spInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addSp(); } });

  const start = el("input", { type: "datetime-local", value: toLocalInput(t.start) });
  const end = el("input", { type: "datetime-local", value: toLocalInput(t.end) });
  const stake = el("input", { type: "text", inputmode: "numeric", value: t.stake ? String(t.stake) : "", placeholder: "0", disabled: !maxStake });
  const money = el("input", { type: "text", maxlength: 100, value: t.money || "", placeholder: "e.g. Loser buys the coffee" });
  const note = el("input", { type: "text", maxlength: 200, value: t.note || "", placeholder: "e.g. Bring your A game" });
  const msg = el("p", { class: "msg" });
  const was = countering ? countering.terms : null;

  const form = el("form", { class: "stack", novalidate: true },
    el("h2", { class: "page-title", text: countering ? "Counter the challenge" : source ? (challengeStatus(source) === "done" || source.vetoed ? "Rematch" : "Challenge again") : "Challenge someone" }),
    source ? el("p", { class: "hint", text: `Same terms as last time, starting ${fmtDate(t.start)}. Change anything before you send it.` }) : null,
    countering ? el("p", { class: "hint", text: `${who(otherSide(countering, me)).displayName} offered: ${termsShort(was)}, ${fmtDate(was.start)} to ${fmtDate(was.end)}, ${stakesText(was)}. Change anything, and it's their move.` }) : null,
    el("section", { class: "card stack" }, field("Who", rival)),
    el("section", { class: "card stack" }, el("h3", { text: "How it's won" }), field("Winner", win), bagField,
      el("div", { class: "field" }, el("span", { class: "field-label", text: "Species" }), chips, spInput),
      el("datalist", { id: "h2h-species" }, ...SPECIES.map(s => el("option", { value: s })))),
    el("section", { class: "card stack" }, el("h3", { text: "When" }), field("Starts", start, "They have to accept before it starts, or it expires."), field("Ends", end, `Up to ${MAX_DAYS} days.`)),
    el("section", { class: "card stack" }, el("h3", { text: "What's at stake" }),
      field("Points staked (each)", stake, maxStake
        ? `The winner takes the loser's. You can stake up to ${room} right now (your points, less what's staked in your other challenges, up to the league's ${maxStake}).`
        : "Staking points is turned off by the league admins."),
      field("Bet (optional)", money, "Just written down, so everyone knows. The app doesn't track paying it."),
      field("Trash talk (optional)", note)),
    msg,
    el("button", { class: "btn lime block big", type: "submit", text: countering ? "Send counter" : "Send challenge" }),
    el("a", { class: "btn quiet block", href: countering ? `#/h/${countering.id}` : "#/derbies", text: "Cancel" }));

  form.addEventListener("submit", e => {
    e.preventDefault();
    const fail = x => { msg.className = "msg err"; msg.textContent = x; msg.scrollIntoView({ block: "center", behavior: "smooth" }); };
    if (spInput.value.trim()) addSp();
    if (!rival.value) return fail("Pick who you're challenging.");
    const terms = {
      win: win.value, bagSize: win.value === "bag" ? Math.round(Number(bag.value)) : 5, species,
      start: new Date(start.value).getTime(), end: new Date(end.value).getTime(),
      stake: stake.value.trim() ? Number(stake.value.trim()) : 0, money: money.value.trim().slice(0, 100), note: note.value.trim().slice(0, 200),
    };
    const problem = termsProblem(terms);
    if (problem) return fail(problem);
    if (terms.stake > room) return fail(`You can stake up to ${room} ${room === 1 ? "point" : "points"} right now.`);
    if (countering) {
      if (!changedTerms(was, terms).length) return fail("Change something to counter, or go back and accept it.");
      counterChallenge(countering, terms);
      toast("Counter sent. Their move.");
      location.hash = `#/h/${countering.id}`;
    } else {
      const id = sendChallenge(rival.value, terms);
      toast(`Challenge sent to ${who(rival.value).displayName}.`);
      location.hash = `#/h/${id}`;
    }
  });
  fill(main, form);
}
