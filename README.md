# Lunker League

**Track your bests. Settle the bet.**

A private fishing league for a group of friends. Log personal bests with a photo, see who holds the record for each species, run fishing derbies with live leaderboards, chat, and settle once and for all who the best angler is. It is a phone web app for Android and iPhone that you add to your home screen. It has no build step and no server to run.

**Live app:** https://matt-ridley.github.io/LunkerLeague/

**Current version:** 0.9.4 (beta)

## Features

- **Accounts for friends only.** Friends create an account with their email and a password, then join with the league's invite code. Nobody else can see anything.
- **League owner and admins.** Whoever sets up the league owns it. The owner can make other members admins. Admins can change the invite code, rename the league, and pause or remove members.
- **Profiles.** Each angler has a name, an optional home water and a photo taken with the camera or picked from the gallery.
- **Day and Dusk screens.** Day is high contrast for bright sun. Dusk is darker and easier on the eyes at dawn and dusk. Auto follows the phone's setting.
- **Catches with photo proof.** Log a catch with a photo from the camera or gallery, the species, and optionally the weight (lb and oz) and length (to the quarter inch), when it was caught, whether it was released, and notes. The time the photo was taken is read from the photo and shown with the catch.
- **Private or shared spots.** Tag the GPS spot (works with no signal). Keep it private, so others only see "Secret spot", or share it with the league with an optional spot name and an Open in Maps link. Only you can read a private spot; the security rules stop anyone else, including admins.
- **Personal bests.** Your best catch of each species is worked out automatically (heaviest, then longest), with a celebration when you beat it. Each profile has a PB wall, catch and species counts and recent catches.
- **Leaders.** The league record for every species (heaviest and longest), and a leaderboard per species of everyone's personal best, by weight or by length.
- **Reactions and comments.** React to any catch with 🎣 🔥 🐟 😂 👏 🤥 (fish story!) or any emoji from the picker, and see who reacted. Comment on catches; the comment's author, the catch's angler or an admin can remove one. Catch cards show the top reactions and the comment count.
- **League chat.** One group chat for the league, with day separators, an emoji picker and an unread badge on the Chat tab. Tap your own message to delete it (admins can delete any).
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
  - **Points:** for catches (with a daily cap), each new species, holding a top-3 spot on a species' weight board, and finishing derbies. Disqualified catches and test derbies don't count.
  - **Titles:** from Bait Bucket up to Legend of the Lake.
  - **Badges:** First Fish, 10 Species, Derby Champ, Catch & Release Hero, Night Owl and Lucky Net.
  - **Breakdown:** tap any angler to see where their points came from, or tap **How points work**.
  - **Admin control:** admins can change every value and the title thresholds, choosing **All history** (everything is rescored) or **From now on** (points already earned stay), with a live preview of the new standings before saving. Every change is kept as a version and can be loaded again.
- **Works with no signal.** After the first sign-in, the app opens and shows the league's data with no connection. Changes made offline are kept on the phone and sent when it has signal again. The header shows **Live**, **Offline** or **Syncing**, and catches still waiting show **Waiting for signal**. If the league ever refuses a catch sent from the phone (for example because the account was paused at the time), the app keeps it, photo included, and offers to send it again.

The app is in beta: everything originally planned is in, and the league is trying it out. What comes next is in the [Roadmap](#roadmap).

## Roadmap

Ideas picked for future versions, grouped into milestones in a rough order. Nothing here is built yet. Sizes are rough: S is small, M is medium, L is large.

### Milestone A: Holder badges (crowns that move)
A crown sits with whoever currently has the most of something. When someone overtakes, it moves to them and the feed announces it was stolen. All of these come from data the app already has. (M)

- **Derby King**: most derby wins
- **Golden Net**: most fish netted for other anglers
- **Best Captain**: most derby wins or placings from fish caught on your boat
- **Conservationist**: most fish released
- **Meat Eater**: most fish kept
- **Species Hunter**: most different species
- **Grinder**: most catches logged
- **Record Holder**: most species records held right now
- **Early Bird** and **Night Owl**: most fish at dawn, most at night
- **Iron Angler**: most days fished
- **Explorer**: most different spots
- **Fish Story King**: most 🤥 reactions received
- **Hype Man**: most reactions and comments given
- **Skunk Master**: most derbies finished without a fish

### Milestone B: Fair play and the bet
- **Photo code word** (S): the derby shows a random word or number that must appear in each entry photo, the anti-cheating trick tournament apps use.
- **Organiser approval queue** (S–M): entries show as pending until the organiser approves them.
- **Bet tracker** (M): make a wager in the app ("biggest pike by Sunday, loser buys"). The app settles it from the catches and announces the winner in the chat.
- **Head-to-head challenges** (S–M): one-on-one weekend matchups, biggest fish wins.
- **Fish of the Week vote** (S): the league votes, and the winner gets a badge.

### Milestone C: Notifications and social
- **Push notifications** (M): new catches, your PB or record beaten, derbies starting and ending, chat mentions. This uses Firebase Cloud Messaging, which is free. It works on Android, and on iPhone home-screen apps from iOS 16.4.
- **@mentions** in chat and comments (S).
- **Feed events** (S): records stolen, badges earned, derby results.
- **Trip RSVP** (S–M): "Who's out Saturday?" with In / Out / Maybe.
- **Several photos or a short video per catch** (M).

### Milestone D: Better derbies
- **Team or boat derbies** (M): a team leaderboard, using boat crews as teams.
- **Several categories in one derby** (M): for example Big Bass, Big Walleye and Mystery Fish, each with its own leaderboard and payout.
- **Mystery weight prize** (S): closest to a secret weight, revealed at the end.
- **Season series or Angler of the Year** (M): a set of derbies with points across the season.
- **Copy a derby** (S): start a new derby from an old one's settings.

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

- Accounts, profiles and (from the next versions) catches, photos, derbies and chat are stored in the league's Firebase project. Only members can read them.
- Nothing about members is stored in this repository, which is public so GitHub Pages can host it for free.
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
