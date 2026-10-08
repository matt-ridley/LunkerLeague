/* Bets: the list (with head-to-head challenges on the Events page's Bets tab), one bet's page (who's in, the live
   board, the result and the pot) and the form for setting one up. */
import { el, field, avatar, fill, fmtDate, fmtDay, fmtWeight, fmtLength, toast, confirmButton, openSheet, closeSheet, icon } from "./ui.js";
import { store, uid, isOwner, memberName, saveBet, setBetCancelled, joinBet, leaveBet, deleteBet, subscribe,
  watchProofs, sendProof, removeProof, settleBet } from "./cloud.js";
import { RULES, MAX_DAYS, LATE_HOURS, betStatus, STATUS_LABEL, betBoard, betResult, finalAt, playersIn, canJoin, betProblem,
  ruleText, betScoreText, isCalled, isSides, MEASURES, overUnderSides, overText, overValue, sideTeams } from "./bets.js";
import { pickImage, catchPhoto } from "./photos.js";
import { photoTakenAt } from "./exif.js";
import { fmtMoney } from "./payout.js";
import { SPECIES, normalizeSpecies } from "./species.js";

const who = id => store.members.get(id) || { id, displayName: memberName(id) };
const allCatches = () => [...store.catches.values()];
const playersOf = id => store.betPlayers.get(id) || new Map();
const PILL = { open: "upcoming", live: "active", closing: "closing", deciding: "closing", done: "", cancelled: "cancelled", off: "cancelled" };

/* "3 h 20 min", "2 days" */
function span(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.round(h / 24)} days`;
}
function when(b, st, now = Date.now()) {
  if (st === "open") return `Starts in ${span(b.start - now)} · ${fmtDate(b.start)}. Join before then`;
  if (st === "live") return `Ends in ${span(b.end - now)} · ${fmtDate(b.end)}`;
  if (st === "closing") return `Catches from no-signal spots can still sync until ${fmtDate(finalAt(b, allCatches(), playersOf(b.id)))}`;
  if (st === "deciding") return `Ended ${fmtDate(b.end)}. Waiting for ${who(b.organiserUid).displayName} to pick the winner`;
  if (st === "off") return "Called off: fewer than 2 anglers joined";
  if (st === "cancelled") return "Cancelled by the organiser";
  return `${fmtDay(b.start)} to ${fmtDay(b.end)}`;
}
export const stakesText = b => [b.buyIn ? `${fmtMoney(b.buyIn)} each` : "", b.prize || ""].filter(Boolean).join(" + ") || "Bragging rights";

/* ---------- The list ---------- */
function betCard(b) {
  const players = playersOf(b.id), st = betStatus(b, allCatches(), players), n = playersIn(players).length, me = uid();
  const r = st === "done" ? betResult(b, allCatches(), players) : null;
  const leader = ["live", "closing"].includes(st) ? betBoard(b, allCatches(), players)[0] : null;
  const pill = st === "open" && !players.has(me) && canJoin(b, me) ? "Join?" : STATUS_LABEL[st];
  return el("a", { class: "h2h-card", href: `#/b/${b.id}` },
    el("div", { class: "row spread" }, el("b", { text: `🎲 ${b.title}` }), el("span", { class: `pill ${PILL[st]}`, text: pill })),
    el("div", { class: "muted small", text: isSides(b) && !isCalled(b) ? overText(b.rule, u => who(u).displayName) : isSides(b) ? `Sides: ${b.sides.join(" / ")}` : ruleText(b.rule) }),
    el("div", { class: "trip-meta" }, el("span", { text: `👥 ${n} in${b.open ? "" : " · invite only"}` }), el("span", { text: stakesText(b) })),
    r ? el("div", { class: "trip-recap-line", text: r.wash ? "🫧 A wash: nobody won" : isSides(b) ? `🏆 “${b.sides[r.side]}” wins` : `🏆 ${r.winners.map(u => who(u).displayName).join(" and ")}` }) : null,
    leader && leader.score && !isSides(b) ? el("div", { class: "trip-recap-line", text: `👑 ${who(leader.uid).displayName} · ${betScoreText(b.rule, leader.score)}` }) : null,
    isSides(b) ? el("div", { class: "muted small", text: sideTeams(b, players).map((t, i) => `${b.sides[i]}: ${t.length}`).join(" · ") }) : null,
    el("div", { class: "muted small", text: when(b, st) }));
}

/* The bets half of the Events page's Bets tab. */
export function betsSection() {
  const now = Date.now(), me = uid(), all = [...store.bets.values()].map(b => ({ b, st: betStatus(b, allCatches(), playersOf(b.id), now) }));
  const pick = (sts, f = () => true) => all.filter(x => sts.includes(x.st) && f(x.b)).map(x => x.b);
  const invites = pick(["open"], b => !playersOf(b.id).has(me) && canJoin(b, me) && b.organiserUid !== me).sort((a, b) => a.start - b.start);
  const live = pick(["live", "closing"]).sort((a, b) => a.end - b.end);
  const upcoming = pick(["open"], b => !invites.includes(b)).sort((a, b) => a.start - b.start);
  const done = pick(["done", "off", "cancelled"]).sort((a, b) => b.end - a.end).slice(0, 15);
  const group = (title, list) => list.length ? el("section", { class: "stack" }, el("h3", { text: title }), el("div", { class: "card-list" }, ...list.map(betCard))) : null;
  return el("section", { class: "stack" },
    el("div", { class: "row spread" }, el("h3", { text: "🎲 Bets" }), el("a", { class: "btn small lime", href: "#/bnew", text: "Start a bet" })),
    !all.length ? el("div", { class: "card empty" },
      el("p", { text: "Biggest pike by Sunday? First walleye over 5 lb? Start a bet, invite the crew, and the catches settle it." })) : null,
    group("Want in?", invites), group("Live now", live), group("Coming up", upcoming), group("Finished", done));
}

/* ---------- One bet ---------- */
export function renderBet(main, id) {
  try { sessionStorage.setItem("lunker-events-tab", "h2h"); } catch {} // "← Events" comes back to Bets
  const b = store.bets.get(id);
  if (!b) return fill(main, el("div", { class: "card empty" }, el("p", { text: store.catchesLoaded ? "This bet doesn't exist." : "Loading…" })));
  const me = uid(), players = playersOf(id), st = betStatus(b, allCatches(), players), ins = playersIn(players);
  const mineP = players.get(me), inIt = !!mineP && mineP.in !== false, org = b.organiserUid === me;
  const pot = Math.round((b.buyIn || 0) * ins.length * 100) / 100;

  const head = el("section", { class: "derby-head h2h-head" },
    el("span", { class: "pills" }, el("span", { class: `pill ${PILL[st]}`, text: STATUS_LABEL[st] }),
      b.open ? null : el("span", { class: "pill", text: "Invite only" })),
    el("h2", { text: `🎲 ${b.title}` }),
    el("p", { class: "derby-when", text: when(b, st) }),
    isSides(b) && !isCalled(b) ? el("p", { class: "bet-question", text: overText(b.rule, u => who(u).displayName) }) : null,
    b.note ? el("p", { text: b.note }) : null,
    el("p", { class: "prize", text: `🏆 ${stakesText(b)}${pot ? ` · pot ${fmtMoney(pot)}` : ""}` }),
    el("p", { class: "small", text: `Organised by ${who(b.organiserUid).displayName} · ${ins.length} in` }));

  // Joining (until it starts): in, out, or turning an invite down.
  let join = null;
  if (st === "open" && canJoin(b, me) && isSides(b)) {
    const mySide = inIt ? mineP.side : null;
    join = el("section", { class: "card stack" },
      el("p", { text: inIt ? `✅ You're on “${b.sides[mySide]}”. Tap another side to switch until it starts.` : "Pick your side. You can switch until it starts." }),
      el("div", { class: "side-pick" }, ...b.sides.map((label, i) => el("button", { type: "button", class: "btn" + (mySide === i ? " lime" : ""),
        "aria-pressed": String(mySide === i), text: label, onclick: () => { joinBet(id, true, i); toast(`You're on “${label}”.`); } }))),
      el("div", { class: "row" },
        inIt ? confirmButton("Leave the bet", "Tap again to leave", () => { leaveBet(id); toast("You left the bet."); }, "btn quiet") : null,
        !inIt && !b.open && !mineP && !org ? el("button", { class: "btn quiet", type: "button", text: "No thanks", onclick: () => { joinBet(id, false); toast("Maybe next time."); } }) : null),
      b.buyIn ? el("p", { class: "hint", text: `Buy-in ${fmtMoney(b.buyIn)}. Everyone on the winning side splits the pot.` }) : null);
  } else if (st === "open" && canJoin(b, me)) {
    join = el("section", { class: "card stack" },
      inIt ? el("p", { text: `✅ You're in.${b.buyIn ? ` Your buy-in is ${fmtMoney(b.buyIn)}.` : ""}` })
        : el("p", { text: b.open ? "Anyone in the league can join until it starts." : `${who(b.organiserUid).displayName} invited you.` }),
      el("div", { class: "row" },
        inIt ? confirmButton("Leave the bet", "Tap again to leave", () => { leaveBet(id); toast("You left the bet."); }, "btn quiet")
          : el("button", { class: "btn lime", type: "button", text: "🤝 I'm in", onclick: () => { joinBet(id, true); toast("You're in. Good luck!"); } }),
        !inIt && !b.open && !mineP && !org ? el("button", { class: "btn quiet", type: "button", text: "No thanks", onclick: () => { joinBet(id, false); toast("Maybe next time."); } }) : null));
  }

  // The board: live scores, then the result and the pot.
  let board = null;
  if (isSides(b)) board = ["live", "closing", "deciding", "done"].includes(st) || st === "open" ? sidesView(b, st, players) : null;
  else if (["live", "closing", "done"].includes(st) && !(isCalled(b) && st !== "done")) {
    const r = st === "done" ? betResult(b, allCatches(), players) : null, rows = r ? r.rows : betBoard(b, allCatches(), players);
    board = el("section", { class: "card stack" },
      el("h3", { text: r ? (r.wash ? "🫧 A wash" : `🏆 ${r.winners.map(u => who(u).displayName).join(" and ")} ${r.winners.length > 1 ? "split it" : "won"}`) : "Standings" }),
      r && r.wash ? el("p", { class: "hint", text: "Nobody won, so nobody owes anything." }) : null,
      el("ol", { class: "board" }, ...rows.map((row, i) => el("li", { class: "member-row" },
        el("span", { class: "rank", text: row.score ? String(i + 1) : "·" }), avatar(who(row.uid), "sm"),
        el("div", { class: "grow" }, el("div", { class: "name", text: who(row.uid).displayName }),
          isCalled(b) ? null : el("div", { class: "muted small", text: row.count ? `${row.count} fish that count` : "Nothing that counts yet" })),
        row.fish[0] ? el("a", { href: `#/c/${row.fish[0].id}` }, el("img", { class: "thumb sm", src: row.fish[0].thumb, alt: row.fish[0].species, loading: "lazy" })) : null,
        el("div", { class: "board-right" }, el("b", { text: isCalled(b) ? (row.score ? "🏆" : "") : betScoreText(b.rule, row.score) }),
          r && r.shares.get(row.uid) ? el("span", { class: "money-chip", text: `💵 ${fmtMoney(r.shares.get(row.uid))}` }) : null)))),
      st === "closing" ? el("p", { class: "hint", text: "Fishing's over (or someone got there first), but catches from no-signal spots can still sync, so this can change." }) : null,
      r && !r.wash && pot ? el("p", { class: "hint", text: `Pot ${fmtMoney(pot)} (${ins.length} × ${fmtMoney(b.buyIn)}). The app only keeps track: settle up by e-transfer or cash.` }) : null);
  }

  const people = el("section", { class: "card stack" }, el("h3", { text: `Who's in (${ins.length})` }),
    ins.length ? el("ul", { class: "member-list" }, ...ins.map(u => el("li", { class: "member-row" }, avatar(who(u), "sm"),
      el("span", { class: "grow name", text: who(u).displayName }),
      isSides(b) && b.sides[players.get(u).side] != null ? el("span", { class: "muted small", text: b.sides[players.get(u).side] }) : null,
      org && st === "open" && u !== me ? confirmButton("Remove", "Sure?", () => leaveBet(id, u), "btn small quiet") : null)))
      : el("p", { class: "muted", text: "Nobody yet." }),
    !b.open ? el("p", { class: "muted small", text: `Invited: ${(b.invited || []).map(u => who(u).displayName + (players.get(u) && players.get(u).in === false ? " (no thanks)" : "")).join(", ")}` }) : null);

  const facts = el("dl", { class: "facts card" },
    fact("How it's won", isSides(b) ? `Sides: ${b.sides.join(" / ")}. ${isCalled(b) ? "The organiser picks the winning side" : "The catches settle it"}; everyone on it splits the pot`
      : ruleText(b.rule)),
    fact("Starts", fmtDate(b.start)), fact("Ends", fmtDate(b.end)),
    fact("Stakes", `${stakesText(b)}. Never league points`),
    b.buyIn ? fact("The pot", `The winner takes it; a tie splits it${b.roundTo ? `, rounded to the nearest $${b.roundTo}` : ""}`) : null,
    isSides(b) && !isCalled(b) ? fact("What counts", `${b.rule.subject === "league" ? "Every league member's" : `${who(b.rule.subject).displayName}'s`} catches made during it, sent within ${LATE_HOURS} h of the end`)
      : isSides(b) ? fact("Who decides", `${who(b.organiserUid).displayName} picks the winning side, with proof photos if needed. Nobody on the winning side: a wash`)
      : isCalled(b) ? fact("Who decides", `${who(b.organiserUid).displayName} picks the winner from the proof photos (several can split it). Nobody: a wash`)
      : fact("What counts", `Catches made during it by the anglers in it, sent within ${LATE_HOURS} h${b.rule.win === "first" ? " of the first one" : " of the end"}. Nobody scoring is a wash`),
    fact("Fewer than 2", isSides(b) ? "If fewer than 2 sides have someone on them when it starts, it's called off" : "If fewer than 2 anglers are in when it starts, it's called off"));

  const canDelete = isOwner() || (org && st === "open");
  const organiser = org || isOwner() ? el("section", { class: "card stack" }, el("h3", { text: "Organiser" }),
    el("div", { class: "row" },
      org && st === "open" ? el("a", { class: "btn", href: `#/bedit/${id}`, text: "Edit bet" }) : null,
      org ? (b.cancelled
        ? el("button", { class: "btn", type: "button", text: "Un-cancel", onclick: () => setBetCancelled(id, false) })
        : st !== "done" ? confirmButton("Cancel bet", "Tap again to cancel", () => { setBetCancelled(id, true); toast("Bet cancelled."); }) : null) : null,
      canDelete ? confirmButton("Delete", "Tap again to delete", () => { deleteBet(id); location.hash = "#/derbies"; toast("Bet deleted."); }) : null),
    el("p", { class: "hint", text: "You can change the bet until it starts. After that, only cancel it." })) : null;

  fill(main, head, join, board, isCalled(b) ? proofSection(b, st, ins) : null, isCalled(b) ? settleSection(b, st, ins) : null, people, facts, organiser);
}

/* ---------- Sides ---------- */
function sidesView(b, st, players) {
  const teams = sideTeams(b, players), r = st === "done" ? betResult(b, allCatches(), players) : null;
  const value = !isCalled(b) && st !== "open" ? overValue(b, allCatches()) : null;
  const shown = v => b.rule.measure === "weight" ? (fmtWeight(v) || "0 oz") : b.rule.measure === "length" ? (fmtLength(v) || '0"') : `${v} fish`;
  const leading = value == null ? -1 : value >= b.rule.line ? 0 : 1;
  return el("section", { class: "card stack" },
    el("h3", { text: r ? (r.wash ? "🫧 A wash" : `🏆 “${b.sides[r.side]}” wins`) : st === "open" ? "Sides so far" : "Sides" }),
    value != null ? el("p", { class: "bet-question", text: `${st === "done" ? "Final" : "So far"}: ${shown(value)} (the line is ${shown(b.rule.line)})` }) : null,
    r && r.wash ? el("p", { class: "hint", text: teams[r.side] && !teams[r.side].length ? "Nobody was on the winning side, so nobody owes anything." : "Nobody won, so nobody owes anything." }) : null,
    el("div", { class: "sides" }, ...b.sides.map((label, i) => el("div", { class: "side-col" + ((r ? r.side === i && !r.wash : leading === i && st !== "open") ? " lead" : "") },
      el("b", { text: label }),
      el("div", { class: "muted small", text: `${teams[i].length} ${teams[i].length === 1 ? "angler" : "anglers"}` }),
      el("div", { class: "small", text: teams[i].map(u => who(u).displayName).join(", ") || "Nobody yet" }),
      r && r.side === i && !r.wash && r.shares.size ? el("span", { class: "money-chip", text: `💵 ${fmtMoney(r.shares.get(teams[i][0]))}${teams[i].length > 1 ? " each" : ""}` }) : null))),
    st === "closing" ? el("p", { class: "hint", text: "Fishing's over, but catches from no-signal spots can still sync, so this can change." }) : null,
    r && !r.wash && r.pot ? el("p", { class: "hint", text: `Pot ${fmtMoney(r.pot)}. The app only keeps track: settle up by e-transfer or cash.` }) : null);
}

/* ---------- Proof and settling (bets the organiser decides) ---------- */
function viewPhoto(p, name) {
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: `${name}'s proof` }),
    el("img", { class: "proof-full", src: p.photo || p.thumb, alt: `Proof from ${name}` }),
    p.note ? el("p", { text: p.note }) : null,
    el("p", { class: "muted small", text: [p.takenAt ? `Photo taken ${fmtDate(p.takenAt)}` : "No time in the photo", `sent ${fmtDate(p.at)}`].join(" · ") }),
    el("button", { class: "btn block", type: "button", text: "Close", onclick: closeSheet }))));
}
function proofSection(b, st, ins) {
  if (!["live", "deciding", "done"].includes(st)) return null;
  watchProofs(b.id);
  const proofs = store.proofs.get(b.id), me = uid(), mine = proofs && proofs.get(me), inIt = ins.includes(me);
  const canSend = inIt && st !== "done";
  const note = el("input", { type: "text", maxlength: 200, placeholder: "e.g. At the launch, 5:42 AM", value: (mine && mine.note) || "" });
  const msg = el("p", { class: "msg" });
  const send = async camera => {
    const file = await pickImage({ camera });
    if (!file) return;
    msg.className = "msg ok"; msg.textContent = "Getting the photo ready…";
    try {
      const [p, takenAt] = await Promise.all([catchPhoto(file), photoTakenAt(file)]);
      sendProof(b.id, { photo: p.full, thumb: p.thumb, takenAt: takenAt || null, note: note.value.trim().slice(0, 200) });
      msg.textContent = ""; toast(navigator.onLine ? "Proof sent." : "Proof saved. It sends when you have signal.");
    } catch (e) { console.warn(e); msg.className = "msg err"; msg.textContent = "That photo couldn't be used. Try another."; }
  };
  return el("section", { class: "card stack" },
    el("h3", { text: "📸 Proof" }),
    proofs === undefined ? el("p", { class: "muted", text: "Loading…" })
      : proofs.size ? el("ul", { class: "member-list" }, ...[...proofs].sort((a, c) => a[1].at - c[1].at).map(([u, p]) => el("li", { class: "member-row" },
          el("button", { class: "proof-thumb", type: "button", "aria-label": `See ${who(u).displayName}'s proof`, onclick: () => viewPhoto(p, who(u).displayName) },
            el("img", { class: "thumb sm", src: p.thumb, alt: "" })),
          el("div", { class: "grow" }, el("div", { class: "name", text: who(u).displayName }),
            el("div", { class: "muted small", text: [p.note, p.takenAt ? `taken ${fmtDate(p.takenAt)}` : ""].filter(Boolean).join(" · ") })),
          (u === me && canSend) || (b.organiserUid === me && st !== "done") ? confirmButton("Remove", "Sure?", () => removeProof(b.id, u), "btn small quiet") : null)))
      : el("p", { class: "muted", text: "No proof yet." }),
    canSend ? el("div", { class: "stack" },
      field(mine ? "Replace your proof (optional note)" : "Send your proof (optional note)", note),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", html: icon.camera, onclick: () => send(true) }, "Camera"),
        el("button", { class: "btn", type: "button", html: icon.image, onclick: () => send(false) }, "Gallery")),
      msg,
      el("p", { class: "hint", text: "One photo each: sending another replaces yours. The time the photo was taken shows with it." })) : null);
}
function settleSection(b, st, ins) {
  const me = uid(), canSettle = (b.organiserUid === me || isOwner()) && ["live", "deciding", "done"].includes(st);
  if (!canSettle) return null;
  if (st === "done") {
    return el("section", { class: "card stack" }, el("h3", { text: "Organiser" }),
      confirmButton("Change the result", "Tap again to take it back", () => { settleBet(b.id, null); toast("Result taken back. Pick again."); }, "btn"),
      el("p", { class: "hint", text: `Settled ${fmtDate(b.result.at)} by ${who(b.result.by).displayName}.` }));
  }
  if (isSides(b)) {
    const teams = sideTeams(b, playersOf(b.id));
    let side = null;
    const radios = b.sides.map((label, i) => {
      const r = el("input", { type: "radio", name: `side-${b.id}`, onchange: () => { side = i; } });
      return el("label", { class: "check" }, r, el("span", { text: `${label} (${teams[i].length})` }));
    });
    const msg = el("p", { class: "msg" });
    return el("section", { class: "card stack" },
      el("h3", { text: "🏁 Settle the bet" }),
      el("p", { class: "hint", text: st === "live" ? "You can settle it now if it's already decided, or wait until it ends." : "It's over: pick the side that won." }),
      ...radios, msg,
      el("div", { class: "row" },
        el("button", { class: "btn lime", type: "button", text: "Pick the winning side", onclick: () => {
          if (side == null) { msg.className = "msg err"; msg.textContent = "Pick the side that won, or call it a wash."; return; }
          settleBet(b.id, teams[side], side); toast(`“${b.sides[side]}” wins!`);
        } }),
        confirmButton("Nobody won (a wash)", "Tap again: a wash", () => { settleBet(b.id, []); toast("A wash: nobody owes anything."); }, "btn quiet")),
      el("p", { class: "hint", text: "Everyone on the winning side splits the pot. The league owner can settle it too." }));
  }
  const picked = new Set();
  const boxes = ins.map(u => {
    const box = el("input", { type: "checkbox", onchange: () => { if (box.checked) picked.add(u); else picked.delete(u); } });
    return el("label", { class: "check" }, box, el("span", { text: who(u).displayName }));
  });
  const msg = el("p", { class: "msg" });
  return el("section", { class: "card stack" },
    el("h3", { text: "🏁 Settle the bet" }),
    el("p", { class: "hint", text: st === "live" ? "You can settle it now if it's already decided, or wait until it ends." : "It's over: check the proof and pick the winner." }),
    ...boxes,
    msg,
    el("div", { class: "row" },
      el("button", { class: "btn lime", type: "button", text: "Pick the winner", onclick: () => {
        if (!picked.size) { msg.className = "msg err"; msg.textContent = "Tick the winner (several split the pot), or call it a wash."; return; }
        settleBet(b.id, ins.filter(u => picked.has(u))); toast("Settled!");
      } }),
      confirmButton("Nobody won (a wash)", "Tap again: a wash", () => { settleBet(b.id, []); toast("A wash: nobody owes anything."); }, "btn quiet")),
    el("p", { class: "hint", text: "Tick more than one to split the pot. The league owner can settle it too." }));
}
const fact = (k, v) => el("div", { class: "fact" }, el("dt", { text: k }), el("dd", { text: v }));

/* ---------- Set up or edit ---------- */
const pad = n => String(n).padStart(2, "0");
const toLocalInput = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const num = s => { const n = parseFloat(String(s).replace(",", ".")); return isFinite(n) ? n : 0; };

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

export function renderBetForm(main, id) {
  const loaded = () => store.catchesLoaded && store.members.size > 1 && (!id || store.bets.has(id));
  if (!loaded()) return waitFor(main, loaded, () => renderBetForm(main, id));
  const me = uid(), editing = id ? store.bets.get(id) : null;
  if (editing && (editing.organiserUid !== me || Date.now() >= editing.start)) {
    return fill(main, el("div", { class: "card" }, el("p", { text: "Only the organiser can change a bet, and only before it starts." })));
  }
  const s0 = new Date(); s0.setMinutes(0, 0, 0); s0.setHours(s0.getHours() + 1);
  const b = editing ? { ...editing, rule: { ...editing.rule } } : { title: "", rule: { win: "heaviest", species: [], minWeightOz: 0, minLengthIn: 0 }, open: true, invited: [],
    start: s0.getTime(), end: s0.getTime() + 48 * 3600e3, buyIn: 0, roundTo: 0, prize: "", note: "" };

  const title = el("input", { type: "text", maxlength: 80, value: b.title, placeholder: "e.g. Biggest pike by Sunday", autocapitalize: "sentences" });
  const win = el("select", {}, ...Object.entries(RULES).map(([k, r]) => el("option", { value: k, text: r.label })));
  win.value = b.rule.win;
  const minLb = el("input", { type: "text", inputmode: "numeric", placeholder: "0", value: b.rule.minWeightOz ? String(Math.floor(b.rule.minWeightOz / 16)) : "" });
  const minOz = el("input", { type: "text", inputmode: "decimal", placeholder: "0", value: b.rule.minWeightOz ? String(b.rule.minWeightOz % 16) : "" });
  const minIn = el("input", { type: "text", inputmode: "decimal", placeholder: "0", value: b.rule.minLengthIn ? String(b.rule.minLengthIn) : "" });
  const sizeBox = el("div", { class: "stack" },
    el("div", { class: "field" }, el("span", { class: "field-label", text: "At least (optional)" }),
      el("div", { class: "unit-row" }, minLb, el("span", { text: "lb" }), minOz, el("span", { text: "oz" }))),
    el("div", { class: "field" }, el("span", { class: "field-label", text: "At least (optional)" }), el("div", { class: "unit-row" }, minIn, el("span", { text: "inches" }))),
    el("p", { class: "hint", text: "The first angler in the bet to catch one wins. Nobody by the end: it's a wash." }));
  const calledHint = el("p", { class: "hint", text: "For anything the catches can't settle, like “first boat to the launch”. Say what wins in the details. Anyone in the bet can send a photo as proof, and you pick the winner (you can be in it too)." });
  let speciesField = null;

  // Contest (everyone for themselves) or sides (pick a side; the winning side splits the pot).
  let kind = b.kind === "sides" ? "sides" : "contest";
  const kindSeg = el("div", { class: "seg" });
  const sidesWin = el("select", {}, el("option", { value: "over", text: "Over/under on catches (the app settles it)" }),
    el("option", { value: "called", text: "The organiser decides (with proof photos)" }));
  sidesWin.value = kind === "sides" && b.rule.win === "called" ? "called" : "over";
  const subject = el("select", {}, el("option", { value: "league", text: "The whole league" }),
    ...[...store.members.values()].filter(m => !m.suspended).sort((a, c) => a.displayName.localeCompare(c.displayName))
      .map(m => el("option", { value: m.id, text: m.id === me ? `${m.displayName} (me)` : m.displayName })));
  subject.value = (kind === "sides" && b.rule.subject) || "league";
  const measure = el("select", {}, ...Object.entries(MEASURES).map(([k, v]) => el("option", { value: k, text: v })));
  measure.value = (kind === "sides" && b.rule.measure) || "fish";
  const lineUnit = el("span");
  const line0 = kind === "sides" && b.rule.line ? (b.rule.measure === "weight" ? b.rule.line / 16 : b.rule.line) : "";
  const line = el("input", { type: "text", inputmode: "decimal", placeholder: "e.g. 10", value: line0 ? String(line0) : "" });
  const lineHint = el("p", { class: "hint" });
  const syncLine = () => {
    lineUnit.textContent = measure.value === "weight" ? "lb" : measure.value === "length" ? "inches" : "fish";
    const r = { measure: measure.value, line: lineValue() || 0 };
    lineHint.textContent = r.line ? `The sides: “${overUnderSides(r)[0]}” and “${overUnderSides(r)[1]}”.` : "Set the number to beat. The two sides are reaching it, or not.";
  };
  const lineValue = () => { const n = num(line.value); return measure.value === "weight" ? Math.round(n * 16 * 10) / 10 : measure.value === "length" ? Math.round(n * 4) / 4 : Math.round(n); };
  measure.addEventListener("change", syncLine); line.addEventListener("input", syncLine);
  const overBox = el("div", { class: "stack" }, field("On", subject), field("What counts", measure),
    el("div", { class: "field" }, el("span", { class: "field-label", text: "The line" }), el("div", { class: "unit-row" }, line, lineUnit)), lineHint);
  let labels = kind === "sides" && b.rule.win === "called" ? [...(b.sides || [])] : ["Yes", "No"];
  const labelList = el("div", { class: "stack" });
  const drawLabels = () => fill(labelList, ...labels.map((t, i) => {
    const inp = el("input", { type: "text", maxlength: 40, value: t, placeholder: `Side ${i + 1}`, oninput: () => { labels[i] = inp.value; } });
    return el("div", { class: "unit-row name-row" }, inp, labels.length > 2 ? el("button", { class: "btn small quiet", type: "button", text: "✕", "aria-label": "Remove side",
      onclick: () => { labels.splice(i, 1); drawLabels(); } }) : null);
  }), labels.length < 6 ? el("button", { class: "btn block", type: "button", text: "+ Add a side", onclick: () => { labels.push(""); drawLabels(); } }) : null,
    el("p", { class: "hint", text: "E.g. Yes / No, or Fri / Sat / Sun. Say what decides it in the details. Anyone in the bet can send a photo as proof, and you pick the winning side." }));
  drawLabels();
  const sidesBox = el("div", { class: "stack" }, field("Settled by", sidesWin), overBox, labelList);
  const contestBox = el("div", { class: "stack" }, field("Winner", win), sizeBox, calledHint);
  const syncWin = () => {
    sizeBox.hidden = win.value !== "first"; calledHint.hidden = win.value !== "called";
    contestBox.hidden = kind !== "contest"; sidesBox.hidden = kind !== "sides"; imInBox.hidden = kind === "sides";
    overBox.hidden = sidesWin.value !== "over"; labelList.hidden = sidesWin.value !== "called";
    if (speciesField) speciesField.hidden = kind === "contest" ? win.value === "called" : sidesWin.value === "called";
    fill(kindSeg, ...[["contest", "🏆 Contest"], ["sides", "⚖️ Sides"]].map(([k, label]) =>
      el("button", { type: "button", "aria-pressed": String(kind === k), text: label, onclick: () => { kind = k; syncWin(); } })));
  };
  win.addEventListener("change", syncWin); sidesWin.addEventListener("change", syncWin);
  syncLine();

  let species = [...(b.rule.species || [])];
  const chips = el("div", { class: "chips" });
  const drawChips = () => fill(chips, species.length ? species.map(sp => el("button", { type: "button", class: "chip removable", text: `${sp} ✕`,
    onclick: () => { species = species.filter(x => x !== sp); drawChips(); } })) : el("span", { class: "muted small", text: "Any species counts" }));
  drawChips();
  const spInput = el("input", { type: "text", list: "bet-species", placeholder: "Add a species", autocapitalize: "words" });
  const addSp = () => { const v = normalizeSpecies(spInput.value); if (v && !species.includes(v) && species.length < 10) species.push(v); spInput.value = ""; drawChips(); };
  spInput.addEventListener("change", addSp);
  spInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addSp(); } });

  const start = el("input", { type: "datetime-local", value: toLocalInput(b.start) });
  const end = el("input", { type: "datetime-local", value: toLocalInput(b.end) });

  // Who can join: anyone, or the anglers ticked.
  let open = b.open;
  const invited = new Set(b.invited || []);
  const others = [...store.members.values()].filter(m => m.id !== me && !m.suspended).sort((a, c) => a.displayName.localeCompare(c.displayName));
  const inviteList = el("div", { class: "stack" }, ...others.map(m => {
    const box = el("input", { type: "checkbox", checked: invited.has(m.id), onchange: () => { if (box.checked) invited.add(m.id); else invited.delete(m.id); } });
    return el("label", { class: "check" }, box, el("span", { text: m.displayName }));
  }));
  const whoSeg = el("div", { class: "seg" });
  const drawWho = () => {
    fill(whoSeg, ...[[true, "Anyone"], [false, "Invite only"]].map(([k, label]) =>
      el("button", { type: "button", "aria-pressed": String(open === k), text: label, onclick: () => { open = k; drawWho(); } })));
    inviteList.hidden = open;
  };
  drawWho();

  const buyIn = el("input", { type: "text", inputmode: "decimal", placeholder: "0", value: b.buyIn ? String(b.buyIn) : "" });
  const roundTo = el("select", {}, el("option", { value: "0", text: "Exact (to the cent)" }), el("option", { value: "1", text: "Nearest $1" }), el("option", { value: "5", text: "Nearest $5" }));
  roundTo.value = String(b.roundTo || 0);
  const roundField = field("Rounding", roundTo, "When the pot is split (a tie), shares are rounded this way. Any difference goes to (or comes off) the first winner.");
  const syncBuy = () => { roundField.hidden = !(num(buyIn.value) > 0); };
  buyIn.addEventListener("input", syncBuy); syncBuy();
  const prize = el("input", { type: "text", maxlength: 200, value: b.prize || "", placeholder: "e.g. Loser buys pizza" });
  const note = el("textarea", { rows: 2, maxlength: 300, placeholder: "Anything else" }); note.value = b.note || "";
  const imIn = el("input", { type: "checkbox", checked: true });
  // On a sides bet the organiser picks their side on the bet page, like everyone else.
  const imInBox = el("section", { class: "card stack" }, el("label", { class: "check" }, imIn, el("span", { text: "I'm in" })));
  const msg = el("p", { class: "msg" });

  const form = el("form", { class: "stack", novalidate: true },
    el("h2", { class: "page-title", text: editing ? "Edit bet" : "Start a bet" }),
    el("section", { class: "card stack" }, field("Name", title), field("Details (optional)", note)),
    el("section", { class: "card stack" }, el("h3", { text: "How it's won" }), kindSeg,
      el("p", { class: "hint", text: "Contest: everyone for themselves, the winner takes the pot. Sides: everyone picks a side, and the winning side splits it." }),
      contestBox, sidesBox,
      speciesField = el("div", { class: "field" }, el("span", { class: "field-label", text: "Species" }), chips, spInput),
      el("datalist", { id: "bet-species" }, ...SPECIES.map(s => el("option", { value: s })))),
    el("section", { class: "card stack" }, el("h3", { text: "When" }),
      field("Starts", start, "Joining closes when it starts. Fewer than 2 in by then and it's called off."), field("Ends", end, "Up to a year.")),
    el("section", { class: "card stack" }, el("h3", { text: "Who can join" }), whoSeg, inviteList),
    el("section", { class: "card stack" }, el("h3", { text: "What's at stake" }),
      field("Buy-in ($ per angler, optional)", buyIn, "Makes the pot: the winner takes it, a tie splits it. The app only keeps track."), roundField,
      field("Prize (optional)", prize),
      el("p", { class: "hint", text: "League points are never bet." })),
    editing ? null : imInBox,
    msg,
    el("button", { class: "btn lime block big", type: "submit", text: editing ? "Save changes" : "Start the bet" }),
    el("a", { class: "btn quiet block", href: editing ? `#/b/${id}` : "#/derbies", text: "Cancel" }));

  syncWin();
  form.addEventListener("submit", e => {
    e.preventDefault();
    const fail = x => { msg.className = "msg err"; msg.textContent = x; msg.scrollIntoView({ block: "center", behavior: "smooth" }); };
    if (spInput.value.trim()) addSp();
    const called = kind === "contest" ? win.value === "called" : sidesWin.value === "called";
    if (called) species = [];
    const data = {
      title: title.value.trim().slice(0, 80), organiserUid: me, kind,
      rule: kind === "sides"
        ? { win: sidesWin.value, species, minWeightOz: 0, minLengthIn: 0, ...(sidesWin.value === "over" ? { subject: subject.value, measure: measure.value, line: lineValue() } : {}) }
        : { win: win.value, species, minWeightOz: win.value === "first" ? Math.round((num(minLb.value) * 16 + num(minOz.value)) * 10) / 10 : 0,
          minLengthIn: win.value === "first" ? Math.round(num(minIn.value) * 4) / 4 : 0 },
      open, invited: open ? [] : [...invited], start: new Date(start.value).getTime(), end: new Date(end.value).getTime(),
      buyIn: Math.max(0, Math.round(num(buyIn.value) * 100) / 100), roundTo: +roundTo.value, prize: prize.value.trim().slice(0, 200),
      note: note.value.trim().slice(0, 300), createdAt: editing ? editing.createdAt : Date.now(), cancelled: false,
    };
    if (kind === "sides") data.sides = sidesWin.value === "over" ? (data.rule.line > 0 ? overUnderSides(data.rule) : []) : labels.map(x => x.trim().slice(0, 40));
    const problem = betProblem(data, Date.now());
    if (problem) return fail(problem);
    const newId = saveBet(editing ? id : null, data, { join: !editing && imIn.checked && kind !== "sides" });
    toast(editing ? "Bet updated." : data.open ? "Bet started. Tell the crew!" : "Bet started. Your invites are out.");
    location.hash = `#/b/${newId}`;
  });
  fill(main, form);
}
