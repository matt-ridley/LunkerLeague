# Lunker League

**Track your bests. Settle the bet.**

A private fishing league for a group of friends. Log personal bests with a photo, see who holds the record for each species, run fishing derbies with live leaderboards, chat, and settle once and for all who the best angler is. It is a phone web app for Android and iPhone that you add to your home screen. It has no build step and no server to run.

**Live app:** https://matt-ridley.github.io/LunkerLeague/

**Current version:** 0.2.0

## Features

Done:
- **Accounts for friends only.** Friends create an account with their email and a password, then join with the league's invite code. Nobody else can see anything.
- **League owner and admins.** Whoever sets up the league owns it. The owner can make other members admins. Admins can change the invite code, rename the league, and pause or remove members.
- **Profiles.** Each angler has a name, an optional home water and a photo taken with the camera or picked from the gallery.
- **Day and Dusk screens.** Day is high contrast for bright sun. Dusk is darker and easier on the eyes at dawn and dusk. Auto follows the phone's setting.
- **Catches with photo proof.** Log a catch with a photo from the camera or gallery, the species, weight (lb and oz) and/or length (to the quarter inch), when it was caught, whether it was released, and notes. The time the photo was taken is read from the photo and shown with the catch.
- **Private or shared spots.** Tag the GPS spot (works with no signal). Keep it private, so others only see "Secret spot", or share it with the league with an optional spot name and an Open in Maps link. Only you can read a private spot; the security rules stop anyone else, including admins.
- **Personal bests.** Your best catch of each species is worked out automatically (heaviest, then longest), with a celebration when you beat it. Each profile has a PB wall, catch and species counts and recent catches.
- **Leaders.** The league record for every species (heaviest and longest), and a leaderboard per species of everyone's personal best, by weight or by length.
- **Works with no signal.** After the first sign-in, the app opens and shows the league's data with no connection. Changes made offline are kept on the phone and sent when it has signal again. The header shows **Live**, **Offline** or **Syncing**, and catches still waiting show **Waiting for signal**. If the league ever refuses a catch sent from the phone (for example because the account was paused at the time), the app keeps it, photo included, and offers to send it again.

Planned:
1. Comments, emoji reactions and league chat.
2. Derbies: rules, entries, live leaderboards and boat crew.
3. Derby money: entry fees, paid tracking and payouts, including captain and net-man cuts.
4. Angler rankings with admin-adjustable points.

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
7. Optional but recommended: in the Google Cloud console under **APIs & Services > Credentials**, restrict the **Browser key** to these websites:
   - `matt-ridley.github.io/*`
   - `localhost:8766/*`
   - `127.0.0.1:8766/*`

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
| 0.2.0 | 2026-Oct-03 11:14:13 PM | Catches: log with a photo (camera or gallery), species, lb/oz, inches, time, released and notes. Private or shared GPS spots. Personal bests with a celebration, PB wall on profiles, Leaders page with species records and per-species leaderboards. Offline catches show Waiting for signal, and a catch the league refuses is kept and can be sent again. The app now always checks for new files so a deploy never mixes versions. **New security rules: publish firestore.rules.** |
| 0.1.3 | 2026-Oct-03 11:01:46 PM | Local Firebase emulator and automated security-rules tests (13 checks for claiming, joining, admins and paused members). Fixed the wrong-invite-code message disappearing, and a new member no longer counts as joined until the server accepts the code. |
| 0.1.2 | 2026-Oct-03 10:41:49 PM | Connected the app to the league's Firebase project. |
| 0.1.1 | 2026-Oct-03 10:30:48 PM | Firebase setup steps updated for the redesigned Firebase console menus (Security, Databases and storage, Settings). |
| 0.1.0 | 2026-Oct-03 10:23:57 PM | First version: accounts with invite codes, claim-the-league setup, league owner and admins, member profiles with photos, Day/Dusk/Auto screens, phone home-screen install, and offline start-up. |

## Credits

Built by Matt Ridley.
