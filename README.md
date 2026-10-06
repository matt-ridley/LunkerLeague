# Lunker League

**Track your bests. Settle the bet.**

A private fishing league for a group of friends. Log personal bests with a photo, see who holds the record for each species, run fishing derbies with live leaderboards, chat, and settle once and for all who the best angler is. It is a phone web app for Android and iPhone that you add to your home screen. It has no build step and no server to run.

**Live app:** https://matt-ridley.github.io/LunkerLeague/

**Current version:** 0.32.0 (beta)

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
- **Personal bests.** Your best catch of each species is worked out automatically, past catches included (you only ever have one PB per species), with a celebration when you beat it. Heavier wins when both were weighed, longer when both were measured; a fish measured one way never beats a PB measured only the other way. Each profile has catch, species and record counts that work as filters: **catches** shows the PB wall and recent catches, **species** lists every species with how many were caught, and **records** shows the league records held.
- **Leaders.** For every species: the **👑 league record** (heaviest and longest, from league catches, worth points by weight and by length) and, when a past catch beats it, the **📜 all-time record** (props, no points), with a note explaining the points. Each species' leaderboard switches between **League** and **All-time**, by weight or by length.
- **Reactions and comments.** React to any catch with 🎣 🔥 🐟 😂 👏 🤥 (fish story!) or any emoji from the picker, and see who reacted. Comment on catches; the comment's author, the catch's angler or an admin can remove one. Catch cards show the top reactions and the comment count.
- **League chat.** One group chat for the league, with day separators, an emoji picker and an unread badge on the Chat tab. Tap your own message to delete it (admins can delete any).
- **@mentions.** Type `@` in chat or a comment to pick someone from the league. Their name is highlighted, and they get an alert.
- **What's new (the bell).** The bell at the top shows what's new for you since you last looked: mentions, comments and reactions on your catches, records taken from you, badges you earned, your derbies going live and finishing (with your place), new derbies and trips, answers to your trips, and a count of new catches. There are no phone notifications; you see these when you open the app. Tap **×** to clear one alert or **Clear all** to clear the list (with Undo); cleared alerts stay cleared on that phone.
- **League news in the feed.** The feed also announces records changing hands, badges earned and derby results.
- **Trips.** "Who's out Saturday?" Plan a trip on the **Events** tab (what, when, where, notes) and everyone answers **In**, **Maybe** or **Out**. The trip shows who's coming and who hasn't answered.
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
  - **Points:** for catches (with a daily cap), limits, each new species, holding a top-3 spot on a species' weight or length board, each crown held, each badge earned, and finishing derbies. Disqualified catches and test derbies don't count.
  - **Titles:** from Bait Bucket up to Legend of the Lake.
  - **Badges:** 56 badges, kept for good and worth a point each (admins can change it): catch totals (Ten Fish to the 500 Club, Double-Digit Day), species (Five Species, Grand Slam, Trophy Case), size (Five Pounder to Twenty Pounder, Twenty-Incher, Yardstick, Tiny Terror, PB Machine), records (Record Setter, Record Breaker, Untouchable, Double Record), stringers and limits, time and season (Sunrise Strike, Hard Water, Four Seasons, Hot Streak…), derbies (First Derby, Podium, Hat Trick, In the Money, Skunked…), social (Trash Talker, Hype Squad, Tall Tale, Trip Planner…), crowns (Crown Thief, Royalty, Long Reign) and Wanderer, plus the originals (First Fish, 10 Species, Derby Champ, Catch & Release Hero, Night Owl, Lucky Net). Tap the badges on a profile to see all of them and how to earn the rest. The **Leaders → Badges** tab shows who has the most badges and every badge with how many anglers have it; tap one to see who earned it and when.
  - **Crowns:** 16 crowns, each held by whoever has the most of something right now: Derby King, Golden Net, Best Captain, Conservationist, Meat Eater, Stringer Filler (most limits), Species Hunter, Grinder, Record Holder, Early Bird, Night Stalker, Iron Angler, Explorer (shared spots only), Fish Story King, Hype Man and Skunk Master. You only steal one by passing the holder (a tie isn't enough). The feed announces steals, the bell tells you when you take or lose one, profiles show the crowns held, and each crown is worth points while you hold it (2 by default, set by admins). See them on Leaders → Crowns.
  - **Breakdown:** tap any angler to see where their points came from, or tap **How points work**.
  - **Admin control:** admins can change every value and the title thresholds, choosing **All history** (everything is rescored) or **From now on** (points already earned stay), with a live preview of the new standings before saving. Every change is kept as a version and can be loaded again.
- **Works with no signal.** After the first sign-in, the app opens and shows the league's data with no connection. Changes made offline are kept on the phone and sent when it has signal again. The header shows **Live**, **Offline** or **Syncing**, and catches still waiting show **Waiting for signal**. If the league ever refuses a catch sent from the phone (for example because the account was paused at the time), the app keeps it, photo included, and offers to send it again.

The app is in beta: everything originally planned is in, and the league is trying it out. What comes next is in the [Roadmap](#roadmap).

## Roadmap

Ideas picked for future versions, grouped into milestones in a rough order. Sizes are rough: S is small, M is medium, L is large.

### Milestone A: Holder badges (crowns that move) (done in 0.13.0)
✅ 16 crowns that move to whoever has the most of something, announced in the feed and the bell, and worth admin-set points while held. Built as planned, with these changes: the night crown is called **Night Stalker** (the Night Owl badge stays), **Explorer** counts spots shared with the league (private spots stay private), **Grinder** counts a stringer as one catch, and **Stringer Filler** (most limits) was added.

### Milestone B: Fair play and the bet
- **Photo code word** (S): the derby shows a random word or number that must appear in each entry photo, the anti-cheating trick tournament apps use.
- **Organiser approval queue** (S–M): entries show as pending until the organiser approves them.
- **Bet tracker** (M): make a wager in the app ("biggest pike by Sunday, loser buys"). The app settles it from the catches and announces the winner in the chat.
- **Head-to-head challenges** (S–M): one-on-one weekend matchups, biggest fish wins.
- **Fish of the Week vote** (S): the league votes, and the winner gets a badge.

### Milestone C: Notifications and social (done in 0.12.0, except as noted)
- ✅ **In-app alerts (the bell)** instead of push notifications. Push would need the Firebase Blaze plan (a card on file) or a separate server, so the league stays on the free plan with alerts you see when you open the app.
- ✅ **@mentions** in chat and comments.
- ✅ **Feed events**: records stolen, badges earned, derby results.
- ✅ **Trip RSVP**: "Who's out Saturday?" with In / Maybe / Out.
- ⏸️ **Several photos or a short video per catch** (M): left for later. Several photos would work on the free plan; video needs Firebase Storage (Blaze plan).

### Milestone D: Better derbies
- **Team or boat derbies** (M): a team leaderboard, using boat crews as teams.
- ✅ **Several categories in one derby** (M): for example Big Bass, Big Walleye and Mystery Fish, each with its own leaderboard and payout (done in 0.32.0).
- ✅ **Mystery weight prize** (S): closest to a secret weight, revealed at the end (done in 0.31.0).
- **Season series or Angler of the Year** (M): a set of derbies with points across the season.
- ✅ **Copy a derby** (S): start a new derby from an old one's settings (done in 0.30.0).

### Milestone E: Logbook and stats
- **Bait or lure, depth and technique on each catch** (S–M), with "what's working" stats such as the best lures by species.
- **Automatic weather on each catch** (M): air temperature, wind, pressure and moon phase, from a free weather service, filled in once the phone has signal.
- **Personal stats page** (M): catches by month, species, time of day and lure.
- **Map of catches** (M): your spots and the league's shared spots on a free OpenStreetMap map.
- **Best-bite times forecast** (M): solunar times.
- **Estimated weight from length** (S): standard species formulas, for fish that were only measured.
- **Skunk tracker** (S): log trips with no fish, to show fish per trip.
- **Export or backup your catches** (S) as a spreadsheet file.
- **AI fish identification from the photo** (L): only if a free option exists, because it costs money per photo.

### Milestone F: Fun extras
- **End-of-season awards page** (M): a podium, the season's records, badge winners and a shareable recap.
- **Hall of Fame** (S): every record ever held, when it was broken and by whom.
- **Boat profiles** (M): boat name and photo, crew, and stats per boat.
- **Personal goals** (S): for example "10 species this year", with progress bars.
- **Profile flair** (S): a cover photo, favourite species and lucky lure.

### Backlog
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

- Accounts, profiles, catches, photos, derbies, trips and chat are stored in the league's Firebase project. Only members can read them.
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

Try the app against the emulator: start it in one terminal, run the web server in another, then open http://localhost:8766/?emulator. Any made-up email such as `owner@example.test` works, and everything is wiped when the emulator stops. Use http://127.0.0.1:8766/?emulator in a second tab to be a second person.

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
