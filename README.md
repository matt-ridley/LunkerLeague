# Lunker League

**Track your bests. Settle the bet.**

A private fishing league for a group of friends. Log personal bests with a photo, see who holds the record for each species, run fishing derbies with live leaderboards, chat, and settle once and for all who the best angler is. It is a phone web app for Android and iPhone that you add to your home screen. It has no build step and no server to run.

**Live app:** https://matt-ridley.github.io/LunkerLeague/

**Current version:** 0.46.0 (beta)

## Features

- **Accounts for friends only.** Friends create an account with their email and a password, then join with the league's invite code. Nobody else can see anything.
- **Storage meter (admins).** The League admin page shows roughly how much of the free plan's 1 GB is used and how many more catches fit, and warns when it's getting full.
- **League owner and admins.** Whoever sets up the league owns it. The owner can make other members admins. Admins can change the invite code, rename the league, and pause or remove members.
- **Email invites (owner).** On the League admin page, the owner types a friend's email (or several) and the app writes the invite in the owner's own email app, ready to send: what Lunker League is, how to install it on iPhone and Android, how to sign up, and the invite code. There's also a button to copy the whole invite for a text.
- **Profiles.** Each angler has a name, an optional home water and a photo taken with the camera or picked from the gallery.
- **Day and Dusk screens.** Day is high contrast for bright sun. Dusk is darker and easier on the eyes at dawn and dusk. Auto follows the phone's setting.
- **Catches with photo proof.** Log a catch with a photo from the camera or gallery, the species, and optionally the weight (lb and oz) and length (to the quarter inch), when it was caught, whether it was released, and notes. The time the photo was taken is read from the photo and shown with the catch.
- **Past catches (logbook).** Add your old PBs and notable catches from before the league. A catch caught before the league start (when the league was set up, unless an admin moves it), or logged more than 7 days after it was caught (admins can change the days), is a 📜 past catch: it counts for your personal bests and the all-time record boards, but never for points, badges or crowns, and it can't be a derby entry. The log form says so before you save. Moving the league start re-sorts every catch straight away (catches and derbies before it stop earning points, badges and crowns; moving it earlier brings them back), while "logged too late" is saved on the catch and can't be changed back. Past catches show in the feed as throwbacks when they're added, and record points go to the best league catch.
- **Stringers and limits.** On a perch or walleye day, log the whole stringer with one photo: the species, how many fish, and whether it was your limit (the app always asks). A stringer earns the day's full catch points, and a limit earns a bonus on top, once a day. Its fish count toward your catch total and badges, but a stringer is never a PB or a record and can't be entered in a derby.
- **Private or shared spots.** Tag the spot with the phone's GPS (works with no signal), or tap it on a map or satellite view (needs signal; handy for logging a catch later from home). Keep it private, so others only see "Secret spot", or share it with the league with an optional spot name and an Open in Maps link. Only you can read a private spot; the security rules stop anyone else, including admins.
- **Tackle.** Add the bait or lure (the box suggests the ones you've used before), the depth in feet and the technique (casting, trolling, jigging, live bait, fly, ice, drifting or bottom) to any catch, all optional. It shows on the catch for the league, or tick **Keep my tackle secret** and only you see it (others see "Secret tackle"), kept private by the security rules the same way as a private spot.
- **Estimated weight.** A fish that was measured but not weighed shows about what it weighs, going by its length ("~4 lb 11 oz est."), for 35 common species. It uses the standard weight formulas fisheries biologists use (a typical fish in good shape at that length). It's only for show: never saved, and never a personal best, a record, a derby weight or a bet result. The log form shows it as you type the length.
- **Stats and what's working.** Every profile has a stats page: fish, catches, species and days out, then fish by month, time of day, species, bait or lure and technique, for all time, this year or the last 12 months (past logbook catches included). **What's working** shows, for each species, the lures and techniques that caught the most fish and the usual depth: yours (your secret tackle included, only on your phone) or the league's (shared tackle only).
- **Personal bests.** Your best catch of each species is worked out automatically, past catches included (you only ever have one PB per species), with a celebration when you beat it. Heavier wins when both were weighed, longer when both were measured; a fish measured one way never beats a PB measured only the other way. Each profile has catch, species and record counts that work as filters: **catches** shows the PB wall and recent catches, **species** lists every species with how many were caught, and **records** shows the league records held.
- **Leaders.** For every species: the **👑 league record** (heaviest and longest, from league catches, worth points by weight and by length) and, when a past catch beats it, the **📜 all-time record** (props, no points), with a note explaining the points. Each species' leaderboard switches between **League** and **All-time**, by weight or by length.
- **Reactions and comments.** React to any catch with 🎣 🔥 🐟 😂 👏 🤥 (fish story!) or any emoji from the picker, and see who reacted. Comment on catches; the comment's author, the catch's angler or an admin can remove one. Catch cards show the top reactions and the comment count.
- **League chat.** One group chat for the league, with day separators, an emoji picker and an unread badge on the Chat tab. Tap your own message to delete it (admins can delete any).
- **@mentions.** Type `@` in chat or a comment to pick someone from the league. Their name is highlighted, and they get an alert.
- **What's new (the bell).** The bell at the top shows what's new for you since you last looked: mentions, comments and reactions on your catches, records taken from you, badges you earned, your derbies going live and finishing (with your place), derby entries waiting for your approval (organisers) and your entries being approved, head-to-head challenges (yours to answer, answers, results, and everyone else's challenges and results), new derbies and outings, answers to your outings, and a count of new catches. There are no phone notifications; you see these when you open the app. Tap **×** to clear one alert or **Clear all** to clear the list (with Undo); cleared alerts stay cleared on that phone.
- **League news in the feed.** The feed also announces records changing hands, badges earned and derby results.
- **Outings.** "Who's out Saturday?" Plan one on **Events → Outings** (what, when, an optional "back by" time, where, notes, and whether it's a **boat** or **shore, fly or ice** outing), and everyone answers **In**, **Maybe** or **Out**. On a boat outing, anyone can say **I'm bringing a boat** with how many spare seats, and people who are In **grab a seat**: first come, first seated, with a waitlist when a boat is full and a "needs a seat" list when there aren't enough boats. Once it starts, the outing shows what the people who were In caught during it (fish, species, the biggest, photos, PBs and records), and when it's over the feed gets a one-line recap.
- **Bets.** Any number of anglers bet on something on **Events → 🎲 Bets**. League points are never bet.
  - **Setting one up:** a name, how it's won (biggest fish by weight or by length, most fish, or the **first to catch** a species and/or size), the species, when it starts and ends, who can join (**anyone**, or **invite only** with the anglers ticked), an optional buy-in in dollars per angler (the pot), how a split pot is rounded, and an optional prize ("loser buys pizza"). The organiser is in by default and can change the bet until it starts, or cancel it.
  - **Joining:** until it starts. Invited anglers get it in the bell and tap **I'm in** or **No thanks**. Fewer than 2 in when it starts and it's called off.
  - **Contest or sides:** a contest is everyone for themselves (the winner takes the pot). In a **sides** bet everyone picks a side, and everyone on the winning side splits the pot (switch sides any time before it starts). A sides bet is either:
    - an **over/under** on catches, settled by the app: does an angler (or the whole league) reach the line in fish caught, biggest weight or biggest length, by the end? The two sides are named for you ("10 fish or more" and "Fewer than 10 fish"), and the bet page shows the number so far; or
    - **the organiser decides**, between 2 to 6 sides you name (Yes / No, Fri / Sat / Sun), with proof photos like below.
    If fewer than 2 sides have someone on them when it starts, it's called off. Nobody on the winning side: a wash.
  - **Bets the organiser decides:** for anything the catches can't settle ("first boat to the launch"), pick **The organiser decides** and say what wins in the details. Once it starts, each angler in it can send **one proof photo** with a note (sending another replaces it); the time the photo was taken shows with it, and anyone can open it full size. The organiser (or the league owner) ticks the winner, or several to split the pot, or calls it a wash, any time after it starts. They can be in the bet too, and can take the result back and pick again. When the bet ends, the bell reminds the organiser to settle it.
  - **Settling:** the app settles the other kinds from the catches made during it by the anglers in it (sent within 12 hours, for no-signal spots). The winner takes the pot and a tie splits it; nobody scoring is a wash, with nothing owed. The bet page shows the live standings, the result and each winner's share. The app only keeps track; settle up by e-transfer or cash.
  - **The league sees it:** new bets and results show in the feed; invites, people joining your bet and your results show in the bell.
- **Head-to-head challenges.** Challenge any angler from their profile or **Events → 🎲 Bets**.
  - **The terms:** how it's won (biggest fish by weight or by length, most fish, or the best total of the top 2 to 10 fish), the species (one, a few or any), when it starts and ends (up to 31 days), points staked, a written bet ("loser buys the coffee") and some trash talk.
  - **Answering:** the other angler accepts, declines or **counters** with changed terms, back and forth until one of them accepts or declines. Whoever's waiting can take their offer back. An offer nobody has accepted by the start time expires.
  - **The score:** catches made during it count (each has its photo), sent within 12 hours of the end for no-signal spots. For most fish, a stringer counts as its number of fish; stringers don't count for biggest fish or top fish. One catch counts in every challenge you have going. The challenge page shows the live score and the fish that count.
  - **Points:** taking part earns points if you log at least one fish (skunked gets none), the winner gets a bonus, and the loser's staked points go to the winner. A tie: no winner, no bonus, nothing moves. You can only stake what you have (your points, less what's staked in your other challenges), up to a maximum admins set. Admins set all three values on the points page.
  - **The league sees it all:** challenges made, accepted, starting and decided show in the feed and the bell.
  - **Veto:** the league owner can veto a challenge, which voids it: no points move.
  - **Records and rematches:** profiles show each angler's head-to-head record (wins–losses–ties, any winning streak, and how they've done against you), and the H2H tab has everyone's records. A finished challenge has a **Rematch** button (same terms, new times); one that never got going has **Challenge again**. The **Duel King** crown goes to the most wins, and there are 7 head-to-head badges.
- **Derbies.** Any member can set one up and is its organiser:
  - **When:** start and end times, plus a late-entry window so catches made in no-signal spots can sync afterwards.
  - **Scoring:** heaviest fish, longest fish, heaviest bag of the best N fish, most fish, or most species.
  - **Rules:**
    - which species count
    - minimum weight and length
    - entries per angler
    - the photo proof needed (scale, measuring board or both)
    - spot required (shared), catch and release only
    - boat crew required (captain and net man, members or guests)
  - **Fair play (optional):**
    - a **photo code word** (a random fishy word and number, such as PIKE 47, or your own) that every entry photo has to show. Anglers see it on the derby page and when entering a catch, once the derby starts.
    - **approve each entry**: entries wait for the organiser (or an admin) to approve them before they count on the board, in the money, for team and series points, and for rankings. The organiser sees what's waiting on the derby page, on the Entries tab and in the bell, and the angler hears when theirs is approved. Changing an approved fish, its photo or its time sends it back for approval.
  - **Prize:** a note for the prize or bragging rights.

  Members join, then enter catches. The live leaderboard follows the scoring, with ties going to whoever got there first, and a podium appears when the derby finishes. The organiser can disqualify an entry with a reason (and reinstate it). Each derby has its own chat. The security rules enforce:
  - joining before entering
  - the derby times and late-entry window
  - species, minimums, release, spot and crew
  - entries locking when the derby closes

  - **Organiser tools:** the person who created a derby can end it early, enter a catch for any angler in it (the catch counts as theirs and shows who entered it), and cancel it.
  - **Test derbies:** tick **Testing derby** when creating one to try things out. Its organiser can delete it, with or without the catches entered in it.
  - **League owner:** can edit or delete any derby. Real derbies can't otherwise be deleted, so results stay.
- **Derby money.** The app keeps track of the money; nobody pays through it, so settle up by e-transfer or cash.
  - **Settings:**
    - an entry fee, plus optional added money
    - the payout split: winner takes all, 70/30, 60/30/10, 50/30/20, or custom
    - whether unpaid anglers can win
    - captain and net-man cuts as a % of each winning
    - a big-fish side pot (heaviest single fish takes it)
    - rounding to $1, $5 or the cent
  - **Tracking:** the organiser ticks off who has paid. The Money tab shows the pot, projected payouts (and final ones when the derby finishes) with each person's breakdown, "paid out" ticks, and a summary to copy into the chat. The leaderboard shows what each angler stands to win.
- **Angler rankings.** Who's the best angler, for bragging rights, on the Leaders tab, all-time or this season.
  - **Points:** for catches (with a daily cap), limits, each new species, holding a top-3 spot on a species' weight or length board, each crown held, each badge earned, finishing derbies, and head-to-head challenges (taking part, winning, and points staked). Disqualified catches and test derbies don't count.
  - **Titles:** from Bait Bucket up to Legend of the Lake.
  - **Badges:** 63 badges, kept for good and worth a point each (admins can change it): catch totals (Ten Fish to the 500 Club, Double-Digit Day), species (Five Species, Grand Slam, Trophy Case), size (Five Pounder to Twenty Pounder, Twenty-Incher, Yardstick, Tiny Terror, PB Machine), records (Record Setter, Record Breaker, Untouchable, Double Record), stringers and limits, time and season (Sunrise Strike, Hard Water, Four Seasons, Hot Streak…), derbies (First Derby, Podium, Hat Trick, In the Money, Skunked…), social (Trash Talker, Hype Squad, Tall Tale, Outing Planner…), crowns (Crown Thief, Royalty, Long Reign), head-to-head (Duelist, Gunslinger, Sharpshooter, On a Roll, Shutout, High Roller, Rivalry) and Wanderer, plus the originals (First Fish, 10 Species, Derby Champ, Catch & Release Hero, Night Owl, Lucky Net). Tap the badges on a profile to see all of them and how to earn the rest. The **Leaders → Badges** tab shows who has the most badges and every badge with how many anglers have it; tap one to see who earned it and when.
  - **Crowns:** 17 crowns, each held by whoever has the most of something right now: Derby King, Golden Net, Best Captain, Conservationist, Meat Eater, Stringer Filler (most limits), Species Hunter, Grinder, Record Holder, Early Bird, Night Stalker, Iron Angler, Explorer (shared spots only), Fish Story King, Hype Man, Skunk Master and Duel King (most head-to-head wins). You only steal one by passing the holder (a tie isn't enough). The feed announces steals, the bell tells you when you take or lose one, profiles show the crowns held, and each crown is worth points while you hold it (2 by default, set by admins). See them on Leaders → Crowns.
  - **Breakdown:** tap any angler to see where their points came from, or tap **How points work**.
  - **Admin control:** admins can change every value and the title thresholds, choosing **All history** (everything is rescored) or **From now on** (points already earned stay), with a live preview of the new standings before saving. Every change is kept as a version and can be loaded again.
- **Works with no signal.** After the first sign-in, the app opens and shows the league's data with no connection. Changes made offline are kept on the phone and sent when it has signal again. The header shows **Live**, **Offline** or **Syncing**, and catches still waiting show **Waiting for signal**. If the league ever refuses a catch sent from the phone (for example because the account was paused at the time), the app keeps it, photo included, and offers to send it again.

The app is in beta: everything originally planned is in, and the league is trying it out. What comes next is in the [Roadmap](#roadmap).

## Roadmap

Ideas picked for future versions, grouped into milestones in a rough order. Sizes are rough: S is small, M is medium, L is large.

### Milestone A: Holder badges (crowns that move) (done in 0.13.0)
✅ 16 crowns that move to whoever has the most of something, announced in the feed and the bell, and worth admin-set points while held. Built as planned, with these changes: the night crown is called **Night Stalker** (the Night Owl badge stays), **Explorer** counts spots shared with the league (private spots stay private), **Grinder** counts a stringer as one catch, and **Stringer Filler** (most limits) was added.

### Milestone B: Fair play and the bet (done in 0.38.0 to 0.43.0)
- ✅ **Photo code word** (S): optional per derby. A random word and number that must show in each entry photo, the anti-cheating trick tournament apps use (done in 0.38.0).
- ✅ **Organiser approval queue** (S–M): optional per derby. Entries wait until the organiser approves them (done in 0.38.0).
- ✅ **Head-to-head challenges** (L), done in 0.39.0 and 0.40.0:
  - **Challenging:** any angler challenges any other. The challenger picks how it's won (biggest fish by weight or by length, most fish, or the best total of the top N; more ways can come later), the species (one, a few or any), the start and end, and the stakes. The other angler accepts, declines, or **counters** with changed terms, back and forth until one of them accepts or declines. A challenge nobody has accepted by its start time expires.
  - **Stakes:** bragging rights, money and league points, in any mix. Money is only written down (for example "loser buys lunch"); the app doesn't track paying it. Both anglers stake the same points, up to a maximum set by admins, and you can't stake more than you have (your points less what's already staked in your other open challenges). The loser's staked points go to the winner.
  - **Points:** admins set points for taking part, earned by logging at least one fish during the challenge (skunked means none), and a bonus for the winner. A tie has no winner, so nobody gets the bonus and no staked points move.
  - **Catches:** only catches made during the challenge count, and each needs a photo. For most fish, a stringer counts as its number of fish. Stringers have no size for each fish, so they don't count for biggest fish or top N. Challenges can overlap: one catch counts in every challenge you have running.
  - **The league sees it all:** challenges sent, accepted, live and decided show in the feed and the bell.
  - **Overturning a result:** the league owner can veto a result at any time, and any staked points go back.
  - **Extras (0.40.0):** a head-to-head win/loss record on profiles, a **Rematch** button, a crown for most head-to-head wins, and head-to-head badges.
- ✅ **Bets** (L), done in 0.41.0 to 0.43.0. Any number of anglers bet on something; the app settles it from the catches when it can, and the organiser settles the rest.
  - **Setting one up:** anyone can start a bet and is its organiser (and can be in it too). They pick what it's about, who can join (**open** to anyone, or **invite only**: the people named get an invite in the bell and accept or decline), when joining closes, and when it ends (a deadline, or the first one to do it).
  - **Stakes:** an optional buy-in in dollars per person, which makes the pot, and/or a prize in words ("loser buys pizza"). **Never league points.** The app works out who wins what; nobody pays through it.
  - **Contest bets** (everyone for themselves): biggest fish by weight or length, most fish, or the first to catch something (a species, a minimum size), settled by the app; or anything else ("first boat to the launch"), settled by the organiser. The winner takes the pot, and a tie splits it.
  - **Sides bets** (yes/no, over/under, or a few choices): people join a side. Settled by the app when it's about catches ("Andy catches 10+ fish on Saturday") or by the organiser ("Bully falls in the lake this season"). Everyone on the winning side splits the pot: 5 people at $5 each, 3 on the winning side, each gets a third of $25. At least 2 sides need someone on them, or the bet is called off.
  - **Proof:** for bets the organiser settles, anyone in the bet can submit one photo with a note (they can replace it). Everyone in the bet can see the proof, and the organiser picks the winner or winning side.
  - **No winner** (nobody catches a 5 lb walleye by the deadline): it's a wash, called off with nothing owed and the buy-ins back.
  - **The league sees it:** bets made, joined and decided show in the feed and the bell.
  - **Where:** the Events tab's **⚔️ H2H** becomes **🎲 Bets**, holding head-to-head challenges and bets together.
  - **Settled answers:** no paid ticks for now; a sides bet can have 2 or more choices (at least 2 need someone on them); the organiser picks how splits are rounded (exact, nearest $1 or $5).
  - **Releases:** ✅ (1) the Bets tab and contest bets the app settles (0.41.0); ✅ (2) organiser-settled contests with proof photos (0.42.0); ✅ (3) sides bets (0.43.0). Milestone B is complete.

### Milestone C: Notifications and social (done in 0.12.0, except as noted)
- ✅ **In-app alerts (the bell)** instead of push notifications. Push would need the Firebase Blaze plan (a card on file) or a separate server, so the league stays on the free plan with alerts you see when you open the app.
- ✅ **@mentions** in chat and comments.
- ✅ **Feed events**: records stolen, badges earned, derby results.
- ✅ **Trip RSVP**: "Who's out Saturday?" with In / Maybe / Out.
- ⏸️ **Several photos or a short video per catch** (M): left for later. Several photos would work on the free plan; video needs Firebase Storage (Blaze plan).

### Milestone D: Better derbies (done in 0.30.0 to 0.34.0)
- ✅ **Team or boat derbies** (M): a team leaderboard, using boat crews as teams (done in 0.33.0).
- ✅ **Several categories in one derby** (M): for example Big Bass, Big Walleye and Mystery Fish, each with its own leaderboard and payout (done in 0.32.0).
- ✅ **Mystery weight prize** (S): closest to a secret weight, revealed at the end (done in 0.31.0).
- ✅ **Season series or Angler of the Year** (M): a set of derbies with points across the season (done in 0.34.0).
- ✅ **Copy a derby** (S): start a new derby from an old one's settings (done in 0.30.0).

### Milestone E: Logbook and stats
Built in this order, one release each. Tackle, weather and estimated weights never change points, records, derbies or bets.
- ✅ **Tackle on each catch** (S–M), done in 0.44.0: optional bait or lure (suggesting the ones you've used before), depth and technique (casting, trolling, jigging, live bait, fly, ice, drift or bottom). Shared with the league unless you tick **Keep my tackle secret**, like a secret spot.
- ✅ **Estimated weight from length** (S), done in 0.45.0: standard formulas for each species, shown as "~4 lb 2 oz (est.)" on fish that were only measured. For show only: never a personal best, a record, a derby weight or a bet result. Species without a formula get no estimate.
- ✅ **Personal stats page** (M), done in 0.46.0: catches by month, species, time of day and lure, plus **what's working**: the best lures and techniques by species, for you and for the league (the league's only uses tackle that isn't secret).
- **Skunk tracker** (S), 0.47.0: a **Got skunked** button logs a day out with no fish, and anyone marked In on an outing who logged no fish during it counts as skunked too. Shows fish per day out and your longest skunk streak on the stats page.
- **Export your catches** (S), 0.48.0: download your catches as a spreadsheet (CSV) file.
- **Automatic weather and moon** (M), 0.49.0: air temperature, wind, pressure and sky at the time of the catch, from the free Open-Meteo service (no account needed), filled in once the phone has signal. Old logbook catches get weather too. The spot's location is rounded to about 1 km before it's sent, and catches without a spot use the league's **home water**, set by an admin. The moon phase is worked out on the phone. Saved in metric, shown in °F, mph and inHg.
- **Map of catches** (M), 0.50.0: your spots (private ones too, only you see them) and the league's shared spots on a free OpenStreetMap map.
- **Best-bite times** (M), 0.51.0: solunar major and minor feeding times for the home water, worked out on the phone (so they work offline), on a Fish Finder card and on outings.

### Milestone F: Fun extras
- **End-of-season awards page** (M): a podium, the season's records, badge winners and a shareable recap.
- **Hall of Fame** (S): every record ever held, when it was broken and by whom.
- **Boat profiles** (M): boat name and photo, crew, and stats per boat.
- **Personal goals** (S): for example "10 species this year", with progress bars.
- **Profile flair** (S): a cover photo, favourite species and lucky lure.

### Possible ideas
Not planned yet, but worth keeping in mind.
- **Fish of the Week vote** (S): the league votes, and the winner gets a badge.
- **Guess bets** (M): everyone enters a number and the closest wins, for example how many fish the league catches at a derby, or what Matt's biggest muskie weighs this year (a tie splits the pot). Could also pick a person ("who wins the club derby?").
- **AI fish identification from the photo** (L): moved from Milestone E. There's no free option that works without a key, and a key in the app's public code could be used up by anyone. Worth another look if a free on-phone model turns up.

### Backlog
- **Head-to-head disputes** (S–M): let league members dispute a head-to-head result (beyond the owner's veto). To be worked out once challenges are built and the league has used them: who can dispute (including the two anglers themselves), what happens next (a vote, or the owner decides), and any time limit.
- **Accepted measurements per species** (S–M): set whether a species counts by weight, by length, or both (some fish are only weighed, some only measured). Until then, record points count on both the weight and length boards of every species.

## Installing on a phone

1. Open https://matt-ridley.github.io/LunkerLeague/ in **Chrome** on Android or **Safari** on iPhone.
2. Add it to the home screen:
   - **Android:** tap the menu (three dots), then **Add to home screen** or **Install app**.
   - **iPhone:** tap **Share**, then **Add to Home Screen**.
3. Always open the app from the home-screen icon.

## Setting up the league (first time only)

### 1. Create the Firebase project

The app uses a free Firebase project (Google) for accounts and to share data between phones.

1. Go to https://console.firebase.google.com and create a project named `lunkerleague`. Google Analytics isn't needed.
2. In the left menu, open **Security > Authentication** and click **Get started**. On the **Sign-in method** tab, choose **Email/Password**, turn on the first switch only (leave **Email link** off) and click **Save**.
3. Still in Authentication, open the **Settings** tab, then **Authorized domains > Add domain**, and add `matt-ridley.github.io`. `localhost` is already there.
4. Open **Databases and storage > Firestore** and click **Create database**. Pick a nearby location and start in **production mode**.
5. On Firestore's **Rules** tab: paste the whole of [`firestore.rules`](firestore.rules) and click **Publish**.
6. Open **Settings** (the gear) **> General**, scroll to **Your apps** and click the web icon `</>`. Give it a nickname and leave Hosting unticked. Copy its `firebaseConfig` values into `FIREBASE_CONFIG` in [`js/config.js`](js/config.js).
   - These values are public by design. The rules are what keep the data private.
7. Optional but recommended: restrict the app's key so it only works from the app's own websites.
   1. Open https://console.cloud.google.com and pick the project **lunkerleague** (ID `lunkerleague-2c619`). It may only show under the **All** tab of the project picker.
   2. Go to **APIs & Services > Credentials** and open **Browser key (auto created by Firebase)**.
   3. Under **Application restrictions**, choose **Websites** and add each of these:
      - `matt-ridley.github.io/*`
      - `lunkerleague-2c619.firebaseapp.com/*` (Firebase sign-in runs part of its work from here)
      - `localhost:8766/*`
      - `127.0.0.1:8766/*`
   4. Leave **API restrictions** as they are, click **Save**, and give it up to 5 minutes to apply.

The free Spark plan is plenty for a group of friends. Photos are stored in Firestore, shrunk on the phone first, so the paid Firebase Storage isn't needed.

### 2. Claim the league

Do this right after the first deploy, before sharing the link.

1. Open the app, tap **Join the league**, and create your account. Leave **Invite code** blank.
2. The app sees there's no league yet and shows **Start your league**. Enter the league name and an invite code.
3. You're now the owner and an admin. Nobody else can claim the league after this.

### 3. Invite friends

Open your profile, then **League admin > Copy invite**, and text it to your friends. They tap **Join the league**, create an account and enter the code. If you ever need to stop new sign-ups, change the code.

### Updating the security rules

Some new versions change `firestore.rules`, and the changelog says when. Publish them before (or right after) merging, or the new features show a sync problem. Either paste the file into **Firestore > Rules** in the Firebase console and click **Publish**, or from this folder:

```bash
npx firebase login
```

```bash
npm run deploy:rules
```

`npx firebase login` is needed only once per PC.

## Where data is stored

- Accounts, profiles, catches, photos, derbies, outings and chat are stored in the league's Firebase project. Only members can read them.
- Tackle is stored next to its catch. Secret tackle can only be read by its angler.
- Proof photos for bets are stored the same way (one per angler per bet, about the size of a catch photo). The storage meter doesn't count them yet.
- Photos are stored in Firestore itself (Firebase's file storage needs the paid plan), so they use most of the free plan's 1 GB. A new catch takes about 270 KB, photo included, which leaves room for roughly 3,500 to 4,000 catches. Admins can see how much is used on the League admin page (**Storage**). If it gets full: delete old test catches, or move to Firebase's Blaze plan.
- Nothing about members is stored in this repository, which is public so GitHub Pages can host it for free.
- Picking a spot on the map loads map pictures from OpenStreetMap (street map) and Esri (satellite). They only see which area is being viewed, never the catch or who is looking.
- Each phone keeps an offline copy. Changes made with no signal wait on the phone. Signing out before they're sent can lose them, so the app warns you.

## Running locally

```bash
py -m http.server 8766
```

Then open http://localhost:8766. Service workers and sign-in need `localhost` or HTTPS, not `file://`.

### Testing with the Firebase emulator

The emulator is a pretend Firebase that runs only on this PC, so tests never touch the real league. It needs Java 21 (installed with `winget install Microsoft.OpenJDK.21`) and the dev tools:

```bash
npm install
```

Check the security rules (`firestore.rules`) with the automated tests:

```bash
npm run test:rules
```

Try the app against the emulator: start it in one terminal, run the web server in another, then open http://localhost:8766/?emulator. Any made-up email such as `owner@example.test` works, and everything is wiped when the emulator stops. Use http://127.0.0.1:8766/?emulator in a second tab to be a second person. Adding a name, as in `?emulator=teams`, uses a separate test project (`demo-teams`), so two test setups can share one running emulator.

```bash
npm run emulators
```

`?emulator` only works on `localhost` and `127.0.0.1`. The live site always uses the real project.

To redraw the app icons after changing `tools/make-icons.mjs`:

```bash
node tools/make-icons.mjs
```

## Versioning

The version number is the `VERSION` constant in [`js/config.js`](js/config.js), shown at the bottom of your profile. It follows `major.minor.patch`:

- **Major** for a big change in how the app works.
- **Minor** for each new feature.
- **Patch** for fixes and smaller changes.

Update this README's **Current version** and the changelog in the same commit. When adding a new file under `js/`, also add it to `APP_FILES` in [`sw.js`](sw.js) so it's available offline.

## Changelog

| Version | Date | Changes |
| --- | --- | --- |
| 0.46.0 | 2026-Oct-08 09:37:18 AM | **Stats page**: a 📊 button on every profile opens that angler's stats for all time, this year or the last 12 months: fish, catches, species and days with a fish, then bar charts of fish by month, time of day, species, bait and lure, and technique. **What's working** lists, for each species with 2 or more fish on noted tackle, the top lures and techniques and the usual depth, for you or for the league (the league's uses only shared tackle; secret tackle never leaves your phone). Stringers count as their number of fish, past logbook catches are included, and disqualified derby entries aren't. No new security rules. |
| 0.45.0 | 2026-Oct-08 09:31:49 AM | **Estimated weight from length**: fish that were measured but not weighed show "~4 lb 11 oz est." on the catch card, the catch page and the personal-best wall, and the log form shows the estimate as you type the length. Uses the published standard weight (Ws) formulas for 35 species (from the FSA fisheries package's table); other species, and lengths outside a formula's range, get none. For show only: never saved, and never a PB, record, derby weight or bet result. No new security rules. |
| 0.44.0 | 2026-Oct-08 09:24:34 AM | **Tackle on each catch** (Milestone E begins): an optional bait or lure (suggesting the ones you've used before), depth in feet and technique on the log form, shown on the catch. Tick **Keep my tackle secret** and only you see it; others see "Secret tackle". Tackle never changes points, records or derbies, and changing it doesn't send an approved derby entry back for approval. The notes box no longer asks for the lure and depth. **New security rules: publish firestore.rules.** |
| 0.43.1 | 2026-Oct-08 09:19:55 AM | Roadmap: the **Milestone E** plan in release order (tackle on each catch with an option to keep it secret, estimated weight from length for show only, a personal stats page with what's working, a skunk tracker, catch export, automatic weather and moon, a map of catches, and best-bite times). AI fish identification moved to Possible ideas. No app changes. |
| 0.43.0 | 2026-Oct-07 10:34:14 PM | **Bets**, part 3: **sides bets**. When starting a bet, pick **Contest** or **Sides**. Everyone in a sides bet picks a side (and can switch until it starts), and everyone on the winning side splits the pot. Sides bets are an **over/under** on catches that the app settles (an angler or the whole league, fish caught or biggest by weight or length, against a line, with the number so far on the bet page), or **the organiser decides** between 2 to 6 named sides, with proof photos. Fewer than 2 sides taken at the start calls it off; nobody on the winning side is a wash. The feed and the bell name the winning side. Milestone B is complete. **New security rules: publish firestore.rules.** |
| 0.42.0 | 2026-Oct-07 10:24:05 PM | **Bets**, part 2: **bets the organiser decides**, for anything the catches can't settle ("first boat to the launch"). The organiser says what wins in the details. Once it starts, each angler in it can send one proof photo with a note (replaceable), shown with the time it was taken and viewable full size. The organiser (or the league owner) picks the winner, several to split the pot, or a wash, any time after it starts, and can change their call. The bell reminds the organiser to settle a bet once it ends. **New security rules: publish firestore.rules.** |
| 0.41.0 | 2026-Oct-07 10:14:20 PM | **Bets**, part 1. The Events page's H2H tab is now **🎲 Bets**, with bets above head-to-head challenges. Start a bet: how it's won (biggest fish by weight or length, most fish, or first to catch a species and/or size), species, start and end, open to anyone or invite only, an optional buy-in (the pot) with rounding, and an optional prize. Never league points. Anglers join until it starts (invites in the bell, with I'm in / No thanks); fewer than 2 and it's called off. The app settles it from the catches: the winner takes the pot, a tie splits it, nobody scoring is a wash. The feed and the bell announce bets, joins and results. **New security rules: publish firestore.rules.** |
| 0.40.1 | 2026-Oct-07 09:54:41 PM | Roadmap: the **Bets** plan for the rest of Milestone B (contest and sides bets, open or invite only, buy-ins and prizes but never league points, proof photos for bets the organiser settles, the H2H tab renamed Bets). Guess bets added to Possible ideas. No app changes. |
| 0.40.0 | 2026-Oct-07 09:20:01 PM | **Head-to-head extras.** Profiles show the angler's head-to-head record (wins–losses–ties, a winning streak, and how they've done against you), and **Events → H2H** has a records board for everyone. Finished challenges have a **Rematch** button (same terms, starting at the next hour, just as long); expired, declined or taken-back ones have **Challenge again**. New crown: **🤺 Duel King** (most head-to-head wins). 7 new badges: Duelist, Gunslinger, Sharpshooter, On a Roll, Shutout, High Roller and Rivalry (63 in all). Fixes: crowns and badges from a derby or challenge that has just finished now appear without waiting for other league activity, and the challenge form waits for the other angler's profile to load. No new security rules. |
| 0.39.0 | 2026-Oct-07 09:09:25 PM | **Head-to-head challenges.** Challenge any angler from their profile or the new **Events → H2H** tab: pick how it's won (heaviest, longest, most fish or top-fish total), the species, the start and end, points staked, a written bet and trash talk. The other angler accepts, declines or counters, back and forth; an offer expires if nobody accepts it by the start. Catches made during it decide it (sent within 12 hours of the end), with a live score on the challenge page. Points: for taking part (at least one fish), a winner's bonus, and the loser's stake goes to the winner (only what you have, up to an admin-set maximum); a tie moves nothing. Admins set the values on the points page. The feed and the bell announce challenges, answers, starts and results. The league owner can veto a challenge, voiding its points. Also: the bell now refreshes when names load, so alerts no longer say "Former member" right after opening the app. **New security rules: publish firestore.rules.** |
| 0.38.0 | 2026-Oct-07 08:51:49 PM | **Derby fair play**, both optional when setting up a derby. **Photo code word:** a random word and number (or your own) that every entry photo has to show, on a card on the derby page and in the entry rules once the derby starts (the organiser sees it early). **Approve each entry:** entries wait for the organiser (or an admin) to approve them before they count on the board, in the money, for teams, series and rankings. Waiting entries are marked in the feed, on the catch and on the Entries tab (listed first, with **Approve**). The organiser's card and bell show what's waiting, and the angler hears when an entry is approved. Changing an approved fish, its photo or its time sends it back for approval. Editing a catch without changing its time no longer changes the saved time. Roadmap: Milestone B now has the head-to-head challenge plan, Fish of the Week moved to a new **Possible ideas** section, and head-to-head disputes are in the backlog. **New security rules: publish firestore.rules.** |
| 0.37.0 | 2026-Oct-06 09:40:05 AM | **Feed filter: current catches.** Filters → Show has a new **Current catches (no past ones)** option: league catches only, leaving out past catches (throwbacks) and news. |
| 0.36.0 | 2026-Oct-05 11:37:30 PM | **Outings** (trips, reworked): the Events page has **Derbies** (with season series) and **Outings** tabs. An outing is a **boat** or **shore, fly or ice** outing with an optional "back by" time. On boat outings, anglers bring boats (spare seats, not counting the owner) and grab seats first come, first seated, with a waitlist when a boat is full and a "needs a seat" list. Once it starts, the outing shows what the people who were In caught during it, and when it's over the feed gets a one-line recap. **New security rules: publish firestore.rules.** |
| 0.35.1 | 2026-Oct-05 11:13:54 PM | **Fix:** team name boxes on the derby form are full width again (they were squeezed to a few letters), and the Teams hint no longer says scores are always added up, since the Team score setting decides. |
| 0.35.0 | 2026-Oct-05 10:58:46 PM | **Team bag (score each boat as one angler):** team derbies get a "Team score" setting. "Add up each angler's score" works as before; "Score each boat as one angler" pools the boat's fish and scores them by the derby's rules, so with a bag of 5 it's the boat's best 5 fish together, whoever caught them, and bigger boats don't get extra fish. The Teams board shows how many of each angler's fish count. **New security rules: publish firestore.rules.** |
| 0.34.0 | 2026-Oct-05 09:37:41 PM | **Season series and Angler of the Year** (Milestone D, now complete): league admins set up a season series (Events tab, "New series") with start and end dates and points by place (default 25, 18, 15, 12, 10, 8, 6, 4, 2, 1, plus 2 for fishing a derby, fish or no fish), optionally counting only each angler's best N derbies. Derby organisers put their derby in a series from the derby form. The series page shows the standings from finished derbies; once the end date passes and its derbies are done, the leader is crowned Angler of the Year, with a trophy, a feed announcement and a bell alert. Ties go to more wins, then more points over every derby. **New security rules: publish firestore.rules.** |
| 0.33.0 | 2026-Oct-05 09:25:17 PM | **Team derbies** (Milestone D): turn on "Team derby" and name the teams (2 to 12, for example each boat). Anglers pick a team when they join and can switch until the derby starts; someone without a team can pick one any time, and the organiser can move anyone on the Anglers tab. The Board has a 👥 Teams board: each team's score is its anglers' scores on the main board added up. **New security rules: publish firestore.rules.** |
| 0.32.1 | 2026-Oct-05 09:22:07 PM | **Fix:** opening or reloading the app straight onto a derby's edit or copy form no longer says "Only the organiser can edit this derby." before the derbies have loaded. The form shows "Loading…" and appears once the derby arrives. |
| 0.32.0 | 2026-Oct-05 09:03:03 PM | **Derby categories** (Milestone D): turn on "Several categories" to run up to 6 boards in one derby (for example Big Bass and Long Pike), each with its own species, scoring, share of the pot and place split. The derby page has a board for each, the Money tab shows each category's share, and payouts add up per angler. With categories, the mystery weight can have its own share of the pot, paid to the closest fish once revealed. The first category is the main one: it decides the derby's places for ranking points, badges, crowns and news. **New security rules: publish firestore.rules.** |
| 0.31.0 | 2026-Oct-05 08:48:58 PM | **Mystery weight** (Milestone D): an organiser can turn on a mystery weight prize and set a secret weight (with an optional prize). It stays hidden from everyone except the organiser and admins until final entries close (the security rules enforce it), and it can't be changed once the derby starts. Then the derby's Board shows the weight and each angler's closest weighed fish, closest first. **New security rules: publish firestore.rules.** |
| 0.30.0 | 2026-Oct-05 08:32:03 PM | **Copy a derby** (Milestone D): "Copy this derby" on any derby's page opens the new-derby form with the same rules, species, money and prizes, moved to the same weekday and time in the coming weeks. Change anything before creating it. |
| 0.29.0 | 2026-Oct-05 08:18:14 PM | **Fish Finder:** the card at the top of the feed is now a carousel (‹ › buttons, swipe, or tap a dot) of up to seven cards, most relevant first: Happening now (a live or coming derby, or a trip in the next 2 days), Your standing (place this season and points to your next title), Within reach (the league record you're closest to), Crown watch (your closest challenger, or the crown you're nearest to taking), Badge watch (the counting badge you're nearest), This week (the league's last 7 days and the biggest fish), and Get out there / Keep it going (moves up front when your last catch was a week or more ago). Each card opens the page it's about. Replaces the old catches/species/PBs card. |
| 0.28.0 | 2026-Oct-05 08:01:47 PM | **Record and PB flair top right:** on feed and profile cards, the League record / All-time record and PB chips sit in the top-right corner beside the species. On phones they read "👑 Record" and "📜 All-time", and stack when the species name is long. |
| 0.27.0 | 2026-Oct-05 07:53:15 PM | **Filters do it all:** the feed's search box and Everyone/Mine switch are gone; one Filters button sits in a row with the chips for filters in use. Angler now starts with "Me". Searching moved into the Filters sheet as "Notes or spot contains" (words in notes and shared spot names). |
| 0.26.0 | 2026-Oct-05 07:39:41 PM | **Search and filter the feed:** a search box (species, angler, notes, shared spot names, derby) and a Filters sheet: angler, species, show (catches, news, records & PBs, throwbacks), when caught (today, 7 days, 30 days, this year), derby, and sort (newest, heaviest, longest). Filters in use show as chips you can tap to remove, with a result count and Clear all. They stay set until the app is closed. Works offline. |
| 0.25.0 | 2026-Oct-05 07:32:17 PM | **Easier-to-read feed:** day headers (Today, Yesterday, then the date). Badges, records and crowns a catch earned now show on that catch's card (all its badges on one line) instead of as separate cards; other news, such as derby results, still gets its own card. Fewer chips on a card: "Released" and "Spot" moved to the quiet line with reactions and comments, and "Past catch" is dropped when the card already says "All-time record". |
| 0.24.0 | 2026-Oct-05 07:24:49 PM | **Feed order fix:** the feed now lists catches by when they were posted, so a fish logged a day or two after it was caught shows up at the top instead of days down the feed. Its badges, records and crowns move up with it, in the feed and on the bell. A catch posted more than 12 hours after it was caught says when it was posted. |
| 0.23.0 | 2026-Oct-05 12:04:57 AM | **Admins can set the league start** (League admin, League start), with a preview of how many catches change. Catches and derbies before the start count for PBs and the all-time records only: no points, badges or crowns; derby results still show. Moving the start later turns earlier catches into past catches; moving it earlier turns them back into league catches. Only "logged too late" is now saved on the catch (and locked); "before the start" follows the start date. **New security rules: publish firestore.rules.** |
| 0.22.0 | 2026-Oct-04 11:52:43 PM | **Length records earn record points too**, the same as weight: 1st to 3rd on each species' length board as well as its weight board (each board counts on its own). The Records tab, species boards, How points work and the points page say so. Accepted measurements per species is in the roadmap backlog. No new security rules. |
| 0.21.0 | 2026-Oct-04 11:47:05 PM | **PB fix**: a fish measured one way (e.g. weighed) no longer beats a PB measured only the other way (e.g. a past musky with just a length), so a smaller new fish isn't called a PB; and no "First Muskie!" when one is already logged. **Records**: the Records tab shows the 👑 league record (league catches, with its points) and the 📜 all-time record when a past catch beats it, with a note on what's worth points; species boards switch between League and All-time, and show the points for 1st to 3rd by weight. Catch badges say 👑 League record or 📜 All-time record. No new security rules. |
| 0.20.0 | 2026-Oct-04 11:26:15 PM | **Past catches (logbook)**: catches from before the league, or logged more than 7 days late (admins can change it under League admin, Late logging), count for PBs and the all-time record boards only: no points, badges or crowns, and no record-taken news. Record points, the Record Holder crown and record badges go to league catches. Past catches are marked 📜, show in the feed as throwbacks when added, and the bell gets a throwback line instead of counting them as new catches. Profile counts show league catches plus a past-catch note. The flag is set when the catch is saved and the security rules never let it be removed. **New security rules: publish firestore.rules.** |
| 0.19.0 | 2026-Oct-04 11:06:35 PM | What's new can be cleared: **×** on each alert, and **Clear all** with Undo. Cleared alerts stay cleared on that phone, and anything new still shows up, even alerts from a catch logged hours after it was caught. No new security rules. |
| 0.18.0 | 2026-Oct-04 10:55:07 PM | **Leaders → Badges**: who has the most badges, and every badge with how many anglers have it (yours are ticked); tap a badge to see who earned it and when, first to earn it on top. The Rankings tab is now labelled Ranks so four tabs fit on a phone. No new security rules. |
| 0.17.0 | 2026-Oct-04 10:44:55 PM | **50 new badges** (56 in all), each worth a point (admins can change it on the points page): catch totals, species, size, records, stringers and limits, time and season, derbies, social, crowns and spots. Tap the badges on a profile to see the whole collection, when each was earned, and how to earn the rest. Badges are dated when earned, so they show in the feed and the bell. Fixed the profile stats running off the edge on narrow screens. **New security rules: publish firestore.rules.** |
| 0.16.0 | 2026-Oct-04 10:30:29 PM | **Storage meter** on the League admin page: about how much of the free 1 GB is used and how many more catches fit. **Smaller photos** for new catches (about 240 KB instead of up to 530 KB as stored, still sharp enough to read a scale), so the league holds about twice as many catches. Photos now save their size for the meter. **New security rules: publish firestore.rules.** |
| 0.15.0 | 2026-Oct-04 10:22:54 PM | Profile filters: tap **catches** for personal bests and recent catches, **species** for each species with how many were caught (every fish on a stringer counts), or **records** for the league records held. No new security rules. |
| 0.14.0 | 2026-Oct-04 10:12:51 PM | Email invites for the league owner: enter a friend's email on the League admin page and the invite opens in your email app, written and ready to send (what the app is, install steps for iPhone and Android, sign-up steps, the invite code). Or copy the whole invite to text it. No new security rules. |
| 0.13.0 | 2026-Oct-04 09:22:27 PM | Milestone A: **crowns**. 16 crowns that sit with whoever has the most of something right now (Derby King, Golden Net, Best Captain, Conservationist, Meat Eater, Stringer Filler, Species Hunter, Grinder, Record Holder, Early Bird, Night Stalker, Iron Angler, Explorer, Fish Story King, Hype Man, Skunk Master). Steals show in the feed and the bell; crowns show on profiles and on the new Leaders → Crowns tab; each crown held is worth points (2 by default, admins can change it). **New security rules: publish firestore.rules.** |
| 0.12.0 | 2026-Oct-04 09:01:02 PM | Milestone C. **@mentions** in chat and comments. **The bell**: what's new for you since you last looked (mentions, comments and reactions on your catches, records taken from you, badges, your derbies, new derbies and trips, trip answers, new catches). **League news** in the feed: records changing hands, badges earned, derby results. **Trips** with In / Maybe / Out on the Derbies tab, now called **Events**. **New security rules: publish firestore.rules.** |
| 0.11.0 | 2026-Oct-04 08:36:01 PM | Pick a catch's spot on a map: next to **My location (GPS)** there's now **Pick on map**, a full-screen map or satellite view where you tap where you caught it (drag the pin to adjust). A tagged spot can be moved on the map later by editing the catch. The map needs signal; GPS still works without. No new security rules. |
| 0.10.0 | 2026-Oct-04 08:23:42 PM | Stringers and limits: log a whole stringer with one photo, the species, the number of fish, and whether it was your limit. A stringer earns the day's full catch points; a limit adds a bonus (5 by default, once a day) that admins can change on the points page. Rankings show a new Limits line. Stringer fish count toward catch totals and badges but are never PBs, records or derby entries. **New security rules: publish firestore.rules.** |
| 0.9.4 | 2026-Oct-04 12:39:51 PM | Setup steps: clearer instructions for restricting the app's key in Google Cloud, adding the Firebase sign-in site to the allowed websites. No app changes. |
| 0.9.3 | 2026-Oct-04 12:27:51 PM | Added the roadmap of planned features (holder badges, fair play and bets, notifications, better derbies, logbook and stats, fun extras). No app changes. |
| 0.9.2 | 2026-Oct-04 11:46:40 AM | Weight and length are now optional, so not every fish has to be measured (derbies scored by size still need them). Unmeasured catches count toward catch and species points but are never a PB or record. A photo is still required, and the security rules now refuse a new catch without one. **New security rules: publish firestore.rules.** |
| 0.9.1 | 2026-Oct-04 11:15:25 AM | Tapping the photo area on the Log screen opens the camera, the same as the Camera button. Tapping a photo already taken retakes it. |
| 0.9.0 | 2026-Oct-04 10:55:35 AM | Beta. Angler rankings with points for catches (daily cap), new species, species records held and derby results; titles and badges; all-time and season views; a points breakdown per angler. Admins can change the points with a live preview, applied to all history or from now on, and every version is kept. **New security rules: publish firestore.rules.** |
| 0.6.0 | 2026-Oct-04 10:48:43 AM | Derby management: a Testing derby flag (off by default, set when creating) that lets its organiser delete it, optionally with its catches. The league owner can delete any derby, with or without its catches (kept catches become ordinary catches). The organiser can end a derby early and enter catches for anglers in it, shown as "Entered by". **New security rules: publish firestore.rules.** |
| 0.5.0 | 2026-Oct-04 10:22:25 AM | Derby money: entry fee, added money, payout split (presets or custom), unpaid-can-win option, captain and net-man cuts, big-fish side pot and rounding. The organiser ticks off who has paid. The Money tab shows the pot, projected or final payouts with breakdowns, paid-out ticks and a copyable summary, and the leaderboard shows projected winnings. **New security rules: publish firestore.rules.** |
| 0.4.0 | 2026-Oct-04 12:02:50 AM | Derbies: create with times, a late-entry window, scoring (heaviest, longest, bag, most fish, most species) and rules (species, minimums, entry limit, photo proof, spot, catch and release, boat crew), plus a prize note. Join, enter catches, live leaderboard, final podium, organiser disqualification, derby chat, and entries lock when the derby closes. A refused derby entry can be kept as a regular catch. **New security rules: publish firestore.rules.** |
| 0.3.0 | 2026-Oct-03 11:46:42 PM | Emoji reactions and comments on catches, league chat with an unread badge, and an emoji picker. The screen no longer redraws while you're typing, so a friend's reaction can't wipe a half-written comment. **New security rules: publish firestore.rules.** |
| 0.2.2 | 2026-Oct-03 11:33:29 PM | In-app camera: Camera now opens a viewfinder inside Lunker League (with retake, front/back switch and a flash toggle where the phone supports it), because opening the phone's camera app made Android close the browser on some phones (Galaxy S24) and lose the photo. The camera app is still used where the in-app camera can't run. Fixed pages being wider than the screen on phones with large text settings. |
| 0.2.1 | 2026-Oct-03 11:24:27 PM | Fixed rear-camera photos failing with low memory on Android: big photos are now shrunk while they are opened (about 14 MB of memory instead of about 190 MB for a 48-megapixel photo) and the memory is freed straight after. Added a tip to use the camera app and Gallery if Camera still has trouble. |
| 0.2.0 | 2026-Oct-03 11:14:13 PM | Catches: log with a photo (camera or gallery), species, lb/oz, inches, time, released and notes. Private or shared GPS spots. Personal bests with a celebration, PB wall on profiles, Leaders page with species records and per-species leaderboards. Offline catches show Waiting for signal, and a catch the league refuses is kept and can be sent again. The app now always checks for new files so a deploy never mixes versions. **New security rules: publish firestore.rules.** |
| 0.1.3 | 2026-Oct-03 11:01:46 PM | Local Firebase emulator and automated security-rules tests (13 checks for claiming, joining, admins and paused members). Fixed the wrong-invite-code message disappearing, and a new member no longer counts as joined until the server accepts the code. |
| 0.1.2 | 2026-Oct-03 10:41:49 PM | Connected the app to the league's Firebase project. |
| 0.1.1 | 2026-Oct-03 10:30:48 PM | Firebase setup steps updated for the redesigned Firebase console menus (Security, Databases and storage, Settings). |
| 0.1.0 | 2026-Oct-03 10:23:57 PM | First version: accounts with invite codes, claim-the-league setup, league owner and admins, member profiles with photos, Day/Dusk/Auto screens, phone home-screen install, and offline start-up. |

## Credits

Built by Matt Ridley.
