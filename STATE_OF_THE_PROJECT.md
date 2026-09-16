# FLASH Game Manager — State of the Project

A handoff document. Written to be pasted whole into a fresh session so work can
resume without re-deriving anything.

**Status:** feature freeze. Stabilisation only unless the owner lifts it.
**Live:** https://alexbhand.github.io/FlashGameManager/
**Repo:** https://github.com/alexbhand/FlashGameManager (public)
**Local:** `/Users/handelsmanhome/Documents/Claude/Flash Game Mgr`

---

## 1. What this is

A game-day management tool for one youth rec soccer team, **Flash**. 9v9, two
30-minute halves, substitutions every 7:30. Used one-handed on a phone, outdoors,
in sunlight, by a coach who is also watching sixteen children.

Its single promise is **equal playing time**, and every design decision defers to
that. Everything else — position preferences, competitive balance, goalkeeper
fairness — operates strictly underneath it.

There is no backend. All state lives in `localStorage` on one device.

---

## 2. Quick start

```bash
cd "/Users/handelsmanhome/Documents/Claude/Flash Game Mgr"
npm install
npm run dev          # http://localhost:5173, also served on the LAN
npm run build        # production build into dist/
```

Deployment is automatic: any push to `main` triggers
`.github/workflows/deploy.yml`, which builds and publishes to GitHub Pages in
about 30 seconds. Confirm a deploy by matching the content hash:

```bash
ls dist/assets/
curl -sL https://alexbhand.github.io/FlashGameManager/ | grep -o 'assets/[^"]*'
```

Identical filenames means the live site is serving the current source. This is
the only reliable proof — a green Actions run is not.

---

## 3. Stack and file map

React 18 · Vite 6 · Tailwind CSS v4 (via `@tailwindcss/vite`, no config file —
theme lives in `src/index.css`) · `@dnd-kit/core` 6.3. Only standard hooks:
`useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`.

`@dnd-kit/core` is the **only** runtime dependency beyond React. Image export
uses the platform `<canvas>` and `navigator.share`, not a library.

~4,590 lines across 23 source files. Bundle 263 kB raw / 84 kB gzipped.

```
src/
  App.jsx                      597  state owner, clock, all handlers, view switch
  lib/
    lineup.js                 1028  THE ALGORITHM — read this first
    constants.js               167  roster, positions, all tunable numbers
    persistence.js             192  validators for every localStorage key
    exportLineup.js            223  canvas lineup card + plain-text export
    useLocalStorage.js          53  useState that mirrors to localStorage
    useWakeLock.js              73  keeps the screen awake while the clock runs
    format.js                   36  clock and date formatting
    haptics.js                  21  navigator.vibrate wrapper
  components/
    LiveDashboard.jsx          527  View B — clocks, alerts, sub preview
    PreGameSetup.jsx           264  View A — attendance, preferences, goalies
    PitchBoard.jsx             248  drag-and-drop pitch + bench
    MatrixView.jsx             270  View C — 8x9 grid, tap to swap, share
    SeasonHistory.jsx          174  View D — cumulative stats, game log
    LineBalanceSheet.jsx       146  coach's Anchor/Steady/Support ratings
    RosterChangeSheet.jsx      142  mid-game arrivals and departures
    SwapModal.jsx              113  tap-to-swap sheet used by the Matrix
    ui.jsx                     101  Button, Card, Tag, Banner primitives
    ErrorBoundary.jsx           65  catches render crashes, offers recovery
    Toast.jsx                   59  confirmation pill
    TabBar.jsx                  38  bottom navigation
test/                              verification harnesses — see section 13
```

---

## 4. The four views

| Tab | What it does |
|---|---|
| **Setup** | Attendance, position preferences (season-long), "Wants Goalie Today?" (per game), Line Balance sheet, Build/Regenerate |
| **Live** | Half clock, shift countdown, substitution alert, drag-to-swap pitch and bench, next-shift call sheet, roster-change sheet |
| **Matrix** | Full 8 shifts × 9 positions, split into halves, tap any cell to swap, live shift-count check, **Share Lineup** / Copy as text |
| **Season** | Cumulative shifts per player by GK/D/M/F, game log with per-game delete |

---

## 5. Domain model

**Positions (9):** `LF RF LM CM RM LD CD RD GK`, grouped into lines
Forward (2) / Midfield (3) / Defense (3) / Goalie (1).

**Game shape:** 2 halves × 4 shifts = **8 shifts**, 9 positions = **72 slots**.
Shift length 7:30. Boundaries are fixed at 7:30 / 15:00 / 22:30 / 30:00.

**Player object** (`createPlayer` in `constants.js`):

```js
{
  id, name,
  isPresent: true,              // attendance, per game
  preferredPositions: [],       // season-long: Defense | Midfield | Forward
  wantsGoalieToday: false,      // per game
  offense: 'Steady',            // season-long: Anchor | Steady | Support
  defense: 'Steady',
  arriveShift: 0,               // per game, for late arrivals
  departShift: null,            // per game, for early exits
}
```

**Per-game fields are cleared when a game is saved**: `wantsGoalieToday`,
`arriveShift`, `departShift`. Season-long fields are never cleared:
`preferredPositions`, `offense`, `defense`.

**Roster (16):** Hudson, Bear, Morrison, Colin, Henry, Sawyer, Ruben, Ari,
Ethan, Calvin, Desmond, Owen, Daniel, Leo, Madden, Decker. Hardcoded in
`ROSTER_NAMES`; `validateRoster` re-adds any missing name on read, so a player
cannot currently be removed or added through the UI.

---

## 6. The algorithm (`src/lib/lineup.js`)

Output is `lineup[shiftIndex][positionId] = playerId`, 8 × 9.

### Priority order — this is the contract

1. **Equity** — untouchable
2. **Nobody sits twice running** — hard constraint
3. **Goalkeeper rules** — block shape, kit changes, field-time floors
4. **Competitive balance** — one Support player per line
5. **Rotation** — don't repeat the line you just left
6. **Position preference** — a bias, not a home

### Two stages, and the distinction matters

**Stage 1 — who is in goal.** Runs first, produces a fixed GK schedule.

**Stage 2 — the outfield**, shift by shift:
- **2a. WHO plays** — equity, rest rules, keeper floors
- **2b. WHERE they stand** — balance, rotation, preference

*Nothing in 2b can affect 2a.* Competitive balance and the volunteer-keeper perk
decide which shirt a player stands behind; they get no vote on whether a player
is on the pitch. This is what lets those features exist without costing anyone
playing time.

### Equity is a rate, not a count (`urgencyOf`)

The subtle part. Ranking by "shifts played, plus GK shifts owed" compares a
keeper's near-final total against everyone else's partial total — a player
keeping the second half looks like they already have 4 shifts at kickoff, sits
the whole first half, and finishes far behind. Instead:

```
needed        = fair share - (shifts played + GK shifts still owed)
opportunities = shifts they are still available for, minus GK shifts,
                minus shifts blocked by a kit change
urgency       = needed / opportunities
```

Fair share is **availability-weighted**, which is what makes late arrivals work
without special-casing:

```
target[p] = Σ over shifts p is available of (9 / players available that shift)
```

A kid arriving at half time is owed a normal share of the four shifts that are
*left* (~2), not a full game crammed into the second half.

### Goalkeeper rules

**Block shapes** — a full half or half of a half, always aligned to the run of
play so no block crosses half time:

| Volunteers | Blocks |
|---|---|
| 0 | four drafted keepers, 15 min each |
| 1 | a full half; the other half split between two drafted keepers (or all 60 if they ask) |
| 2 | a half each |
| 3 | 4 + 2 + 2 |
| 4 | 2 + 2 + 2 + 2 |
| 5+ | only 4 get a turn; the rest are named as first in line next game |

Ordering is by fewest season GK shifts, tie-broken by a seeded random key (an
earlier alphabetical tie-break drafted the same child every week).

**Drafted keepers are capped at 15 minutes** (`DRAFTED_KEEPER_MAX_SHIFTS = 2`).
Volunteering for a half is one thing; being handed half a match of a job you
never asked for is another. Applies to mid-game replacements too.

**Kit-change rule** — a keeper wears a different jersey and gloves, so nobody
makes that change live. The incoming keeper sits the shift *before* their block;
the outgoing keeper sits the shift *after*. **Half time is exempt** — the
interval is already a break. The rest rule outranks this: if a changing shift
would mean sitting twice running, they play and swap at the touchline, with a
warning.

**Field-time floor** — anyone who keeps is still owed outfield time:
a full half in goal → 2 field shifts guaranteed (necessarily in the other half);
half of a half → 1.

**Volunteer perk** — a player who volunteers *and* keeps gets first refusal on
non-defensive slots for their next two outfield shifts. Skipped for anyone who
lists Defense as a preference (they get more of it, not less). Drafted keepers
get nothing — the point is to make volunteering worth doing.

### Competitive balance

Coach buckets each player **Anchor / Steady / Support** at each end of the pitch
(Setup → Line Balance). The only thing it does is stop two Support players
sharing a line. Defenders judged on defending, forwards on attacking,
midfielders on both averaged. Everyone defaults to Steady, so the feature is
inert until used.

Implemented as a first-pass constraint, then a pairwise-swap repair, then an
**exact solver** for the ~0.5% of shifts pairwise cannot fix (they need a
three-way rotation; 8 players over 8 slots, pruned, node-budgeted).

### Rotation

Penalties, not bonuses: `LINE_REPEAT` for returning to the line you just left,
`EXACT_REPEAT` on top for the same slot, plus a cumulative `GROUP_REPEAT`.
`LINE_REPEAT` deliberately outweighs `PREFERRED_GROUP`, so preference biases
which line a player sees most rather than being a home they never leave.
`lastPos` survives a bench shift — one shift off is not a reason to put someone
back where they were.

### Tunable numbers

All in `constants.js` unless noted:

```
HALF_MINUTES 30 · SHIFTS_PER_HALF 4 · TOTAL_SHIFTS 8 · SHIFT_MS 450000
KEEPER_FIELD_FLOOR_FULL_HALF 2 · KEEPER_FIELD_FLOOR_PARTIAL 1
DRAFTED_KEEPER_MAX_SHIFTS 2 · KEEPER_SHIELDED_FIELD_SHIFTS 2
SUPPORT_THRESHOLD 0.75 · BALANCE_VALUE { Anchor 2, Steady 1, Support 0 }

W (scoring weights, lineup.js):
  URGENCY 1000 · BENCH_SAT_ONE 150 · BENCH_SAT_EXTRA 300 · KEEPER_FLOOR 2500
  ON_FIELD_ONE 40 · ON_FIELD_TWO_PLUS -120
  PREFERRED_GROUP 120 · NO_PREFERENCE 45
  LINE_REPEAT -200 · EXACT_REPEAT -140 · GROUP_REPEAT -35
  KEEPER_NOT_DEFENCE -260
```

Generation is seeded and deterministic. Regenerate bumps the seed; automatic
rebuilds reuse it so the plan only moves in response to the change made.

---

## 7. The clock

**One number is stored.** `accumulated` (ms banked for this half) plus
`startedAt` (a real wall-clock timestamp). Elapsed is always derived:

```js
elapsed = accumulated + (running ? Date.now() - startedAt : 0)
```

No drift when a tab is throttled or a phone sleeps, and a mid-half refresh
resumes at the correct time. Verified: a simulated five-minute screen lock
advanced the clock five minutes on resume.

**The shift countdown is derived from the same value**, never counted
separately, so the two clocks cannot disagree.

**Shift boundaries are fixed** at 7:30 / 15:00 / 22:30 / 30:00. Confirming a sub
advances which shift is on the pitch; it does not move the remaining boundaries.
A sub made 44s late simply makes that shift 44s short. (An earlier version
re-cut the remaining shifts to keep halves exact — it was removed because no
boundary was ever where you expected it.)

Clock state: `{ half, shiftInHalf, running, startedAt, accumulated, status }`
where status is `pregame | live | final`.

---

## 8. State management rules

These are invariants. Breaking one is a bug.

1. **Shifts already played are never rewritten.** `replanFrom` is `globalShift`
   while the current half is still `pregame` (covers kickoff *and* half time,
   where nobody is on the pitch yet), otherwise `globalShift + 1`. Every rebuild
   path goes through it — including Regenerate on Setup.

2. **Equity is decided in the WHO stage only.** Nothing in position assignment
   may influence who plays.

3. **Nothing in a scrolling list may change size in response to a tap.** Roster
   rows are fixed height whatever their state; the lone-keeper prompt sits below
   the list; the toast and drag overlay are `fixed`. A list that reflows moves
   rows out from under a thumb already on its way down — this caused a bug that
   looked like goalie selection being broken.

4. **Staleness compares inputs, not output.** `planSignature` fingerprints
   attendance, arrival/departure, goalie ticks, ratings and the both-halves
   answer. Comparing generated lineups instead would flag every deliberate
   manual override as out of date.

5. **Before kickoff the lineup rebuilds itself**; once the clock starts it asks
   first. Silently re-planning mid-game would pull players off the pitch the
   moment a toggle was touched. Guarded by a ref so one set of choices triggers
   at most one automatic rebuild.

6. **Every mutation returns new objects.** `applySwap` maps to fresh shift
   objects; the original is untouched.

7. **A manual swap is a local edit.** History preserved, future deliberately not
   re-planned — which means each swap moves one shift from one player to
   another. The confirmation reports the resulting counts so it is never silent.

---

## 9. Persistence and fault tolerance

| Key | Holds |
|---|---|
| `flash.roster.v1` | names, attendance, preferences, goalie opt-in, ratings, availability |
| `flash.lineup.v1` | the 8 × 9 matrix including manual overrides |
| `flash.lineupMeta.v1` | `planSignature` of the inputs the lineup was built from |
| `flash.gameState.v1` | clock |
| `flash.completedGames.v1` | season history |
| `flash.settings.v1` | opponent, seed, both-halves answer |

**Every key is validated on read** (`persistence.js`). `JSON.parse` succeeding
does not mean a value is usable — a truncated write or hand-edited key used to
throw mid-render, and with no error boundary that is a white screen a coach
cannot recover from. Validators cannot throw; duplicates inside a shift are
stripped; legacy `High/Medium/Low` ratings migrate to `Anchor/Steady/Support`.

**`ErrorBoundary`** wraps the app and offers *Reload & keep my data* or *Start
fresh*. 17 corrupted shapes tested, all heal.

Writes are wrapped in `try/catch` — Safari private mode throws on quota, and
losing the app mid-game is worse than losing persistence.

---

## 10. Drag and drop

Pitch pucks and bench chips on the Live tab are draggable. Three gestures, one
rule, all normalising to the same `applySwap`:

| Drag | Drop on | Result |
|---|---|---|
| bench player | a position | comes on, other goes off |
| a position | another position | the two swap |
| a position | bench player | bench player on, dragged one sits |

**`TouchSensor` with `delay: 220, tolerance: 8`.** Live is a long scrolling page;
a drag that began on contact would mean every attempt to scroll past the pitch
snatched up a player. `MouseSensor` is separate with `distance: 8`, because a
mouse should not wait. Verified: a 60ms flick starts no drag, a 320ms hold does.

**`collisionDetection={pointerWithin}`, never `closestCenter`.** closestCenter
resolves to the nearest droppable however far away the pointer is, so a drag
released over the page header still swapped the player with whoever was closest
— there was no way to abandon a drag begun by accident.

Editing the live shift re-derives the whole next-shift panel, so a bench player
dragged on moves from "Going On" to "Staying On" with their new position.

Tap-to-swap on the Matrix is unchanged. Drag is an addition for the touchline,
not a replacement for the precise editor.

---

## 11. Sharing the lineup

**Matrix → Share Lineup** draws both halves onto a canvas and hands the PNG to
`navigator.share()`, which on a phone opens the native sheet with Messages one
tap away. Browsers without the Web Share API fall back to a download named
`flash-lineup-<date>-vs-<opponent>.png`. **Copy as text** produces a compact
per-shift listing (~1,600 chars) for when an image is more than is wanted.

The card is portrait, one table per half, each with the clock time every shift
starts at, the keeper row highlighted, and a resting list underneath — "who is
off?" being the next question another coach asks.

Four decisions, all of which have a reason:

- **Canvas, not a DOM screenshot.** html2canvas and its relatives are another
  dependency, they choke on the `oklch` colours Tailwind v4 emits, and they
  would inherit the app's phone layout rather than something shaped for a
  message thread.
- **PNG, not JPEG.** Flat colour and small type is exactly what JPEG smears.
  PNG is crisper *and* smaller here — ~350 kB at 1520 × 2164 (760 × 1082 at a
  fixed 2× so the file looks the same whatever device made it).
- **Light, not the app's dark theme.** The app is dark because one person set it
  up and holds it. This image is read by somebody else on an unknown phone,
  possibly in sun, possibly printed. Dark text on a bright ground survives all
  of that.
- **Rendered ahead of the tap**, parked in a ref, re-rendered by an effect on
  `[lineup, roster, opponent]`. `navigator.share()` must be called from inside
  the user gesture, and on iOS awaiting even a 10 ms `toBlob` first can get the
  call rejected as though no gesture happened.

`AbortError` from dismissing the share sheet is treated as a normal outcome,
not a failure. Verified at 13 and 16 present — seven resting players wrap to
exactly three lines without overflowing.

## 12. Measured guarantees

Reproduce with the harnesses in `test/`.

- **Shift spread among non-keepers never exceeds 1** — across every roster size
  9–16 and 0–5 goalie volunteers, 1,680 games. Exactly 0 where 72/players
  divides evenly.
- **Zero duplicate players** within a shift, 1,680 games.
- **Zero back-to-back bench sits**, 450 games. Longest continuous spell off the
  pitch is one shift, 7.5 minutes, with no exceptions.
- **Every player benched for the last shift of the first half starts the
  second** — 2,160 of 2,160.
- **Every keeper clears its field-time floor** — 0 misses. Full-half keepers:
  0 short in the other half.
- **Drafted keepers never exceed 15 minutes** — 960 blocks checked, 0 breaches,
  0 shifts with an empty net.
- **Kit changes:** mid-half goal→field break honoured 100%; field→goal 74%, the
  remainder being cases where a rest shift would have meant sitting twice.
- **Rotation:** same line again 7.5%, same exact slot 2.2% of 22,575
  transitions. Players with 3+ field shifts see 4–5 different positions.
- **Preference** still biases without owning: a Defense preference yields 58%
  defensive shifts against 37.5% at random; no preference lands on 38/37/25,
  exactly the slot distribution.
- **Competitive balance:** 0 stacked lines across 2,400 shifts, with playing
  time unchanged and weaker players averaging *slightly more* minutes.
- **Volunteer keepers** spend 7% of outfield shifts at the back vs 38% for an
  ordinary outfielder; 0% when they have only two outfield shifts.
- **Performance:** clock costs 1 DOM write/sec and 0 on the pitch subtree; no
  long tasks over 5 seconds; drags survive clock ticks mid-gesture.

---

## 13. Testing

```bash
cd test && node equity.mjs sits.mjs ...   # see test/README.md
```

Run the whole set after any change to `lineup.js` or `constants.js`.

There is **no component test suite and no CI test step** — the deploy workflow
only builds. Browser behaviour was verified by driving the running app
(real clicks, synthetic drag events, geometry measurement), not by unit tests.

---

## 14. Known constraints

**Data lives on one device.** Phone and laptop keep entirely separate season
histories and never sync. Clearing site data wipes the season. Pick one device.

**Roster is hardcoded.** `ROSTER_NAMES` in `constants.js`, and `validateRoster`
re-adds any missing name on read. A player joining or leaving mid-season cannot
be handled through the UI.

**Repo is public** and `constants.js` contains sixteen children's first names.
A deliberate choice made to get free GitHub Pages hosting on a private-repo-free
plan. Line Balance ratings are *not* in the source — they live only in
localStorage — and nothing from that screen renders on Live, Matrix or Season.

**iOS Safari has no Vibration API.** Haptics are silently skipped on iPhone; the
confirmation pill carries the whole job. This is why the pill is the primary
signal and the buzz is garnish.

**More than 17 players present** breaks the no-double-sit guarantee
arithmetically (N−9 sitters must fit into 8 outfield slots). Not an issue for a
16-player roster.

**9 or fewer present** makes the keeper kit-change rule impossible — everyone
plays every shift. The app warns rather than failing.

**The share sheet is untested on a real phone.** `navigator.share` does not
exist in the Chromium pane used for verification, so the download fallback is
well tested and the primary path — the thing that actually puts the lineup into
Messages — is not. If Share Lineup downloads instead of opening a share sheet
on iOS, that is the first thing to look at.

**The shared image is ~350 kB.** Fine for iMessage; may be recompressed by SMS
or by some Android messaging apps.

**Drag thresholds are untested by a real finger.** The 220ms hold discriminates
correctly in code, but how it feels with cold hands or gloves is unknown.

**~3.7 position switches per substitution.** The cost of rotation. The "Staying
On" panel names each one, but it is more to call out than a plan that parked
players in one position.

---

## 15. Bugs found and fixed — do not reintroduce

Each of these was shipped, then caught. They are the regression surface.

1. **Equity as a count, not a rate** — second-half keepers sat the entire first
   half. Fixed by `urgencyOf`.
2. **Staleness ignored goalie picks** — ticking a second volunteer after
   building changed nothing, silently. Fixed by `planSignature`.
3. **Alphabetical tie-break** — the same child drafted as backup keeper every
   week. Fixed with a seeded key.
4. **Reflow on Setup** — ticking a goalie inserted a prompt above the roster and
   shoved every row down 134px, so the next tap hit the wrong player. This is
   the one that looked like "goalie selection is broken".
5. **Rebuild rewrote history** — the rebuild nudge re-planned from shift 1, so
   pressing it at half time redealt the half just played and falsified the
   season stats.
6. **`replanFrom` skipped a shift at half time** — offered shift 6 when shift 5
   had not been played.
7. **Temporal dead zone** — `handleGenerate` listed `replanFrom` in its
   dependency array while the declaration sat 25 lines below. Vite builds this
   happily and the app renders a blank white screen.
8. **Position continuity leaked** — the cap of 2 was enforced in one pass and
   undone by a `SAME_POSITION` bonus in the next; 32 players spent seven
   consecutive shifts in one spot.
9. **Kit rule caused every double sit** — all 380 across 450 games.
10. **Corrupt localStorage white-screened** — 8 of 9 malformed shapes threw
    during render with no boundary.
11. **No way to end a half when behind on subs** — End Half was gated on being
    on the last shift.
12. **`closestCenter` made drags uncancellable** — releasing anywhere swapped
    the player with the nearest one.

---

## 16. If you change X, check Y

| Change | Check |
|---|---|
| `lineup.js` or `constants.js` | all harnesses in `test/` |
| Anything in position assignment | that it cannot affect the WHO stage |
| Anything rendering in a scrolling list | measure layout drift before/after a tap |
| A rebuild path | that it starts from `replanFrom`, never 0 |
| A new persisted field | add it to `persistence.js` *and* `planSignature` |
| `exportLineup.js` or the roster size | re-render the card at 13 *and* 16 present and look at it — the resting row is the part that overflows |
| Anything touching `navigator.share` | the call must stay synchronous inside the tap; pre-render, never `await` first |
| dnd-kit config | that a drag released over nothing still cancels |
| A hook dependency array | that every identifier is declared above it |
| Anything at all | load the page — a green build is not a working app |

---

## 17. Working agreements that produced this

- **Test, don't assert.** Every number here came from running something. Claims
  verified by driving the real UI, not by reading code.
- **Look up elements by geometry, not by name.** Calling `.click()` on an
  element found by name can never mis-tap, which is why the reflow bug survived
  several rounds of "verified working".
- **A green Actions run is not a deploy.** Match the asset content hash.
- **Clear test data off the live site** when finished.
