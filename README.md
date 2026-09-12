# FLASH — Game Day Manager

Mobile-first game-day tool for a 9v9 youth rec soccer team. Equal playing time,
daily goalie opt-in, live dual clocks, manual overrides, season-long history.

```bash
git clone https://github.com/alexbhand/FlashGameManager.git
cd FlashGameManager
npm install
npm run dev
```

Vite serves it at <http://localhost:5173>. Everything is stored in the
browser's localStorage — there is no backend and nothing leaves the device.

## Game shape

| | |
|---|---|
| Field | 9 players — GK, L/C/R D, L/C/R Mid, L/R Fwd |
| Halves | 2 × 30 minutes |
| Shifts | 7:30 each → 4 per half, 8 per game |
| Slots | 8 shifts × 9 positions = 72 |

## The four views

- **Setup** — attendance, position preferences (season-long), "Wants Goalie Today?" (per game), build lineup, and **Line Balance**.
- **Live** — half clock counting up to 30:00, derived shift countdown, substitution alert, who's on / who's benched, and a next-shift preview split into three shoutable lists: **Going On** (from the bench), **Staying On** (everyone already out there, with position switchers flagged amber), and **Coming Off**. Positions are spelled out — "Center Mid", not "CM" — because the list is read aloud across a pitch.
- **Matrix** — the full 8 × 9 grid, split into 1st/2nd half so it fits a phone. Tap any cell to swap.
- **Season** — cumulative shifts per player, broken out by GK / D / M / F.

## How fair play is enforced

`src/lib/lineup.js` builds the matrix in two stages and ranks by three
priorities in a strict order: **equity > continuity > preference**.

1. **Goalie first (hard constraint).** The 8 GK slots go only to players who
   opted in today, and a keeper only ever gets one of two block shapes — a
   **full half**, or **half of a half** — always aligned to the run of play, so
   no block straddles half time and nobody gets a single stray shift in goal.

   | Volunteers | Blocks |
   |---|---|
   | 1 | a full half (or all 8, if they want it) |
   | 2 | a half each |
   | 3 | 4 + 2 + 2 — not 3/3/2, since a 3-shift block would have to cross half time |
   | 4 | 2 + 2 + 2 + 2 |
   | 5+ | only 4 can have a turn; the rest are first in line next game, and the app says so |

   Order is by who has kept *least this season*, so the biggest block goes to
   whoever has done least of the chore — that is what levels the season GK
   column out. Nobody opts in → the two least-used keepers are drafted and the
   app says so.

   **Keeping does not cost you your game.** Anyone who takes a turn in goal is
   guaranteed out-field shifts, scaled to how much of a half they kept:

   | In goal | Guaranteed field shifts | Typical shape |
   |---|---|---|
   | A full half | **2**, necessarily in the other half | keep 0–30, play 2 shifts after the break |
   | Half of a half | **1** | keep 0:00–15:00, sit 15:00–22:30, play 22:30–30:00 |

   Keepers therefore finish with *more* total shifts than everyone else,
   deliberately: standing in the net is not the same experience as playing, so
   it is not allowed to quietly eat a kid's afternoon. Equity is enforced
   strictly among everyone else. Both floors live in `src/lib/constants.js`;
   set them to 0 to treat a GK shift as just another shift.

   **The kit-change rule.** A keeper wears a different jersey and gloves, so
   nobody makes that change live. Both sides of a handover get a bench shift:
   the incoming keeper sits the shift *before* their block, the outgoing keeper
   sits the shift *after*. Going in is applied first when a squad can only
   afford one of the two, because it is the harder deadline — the new keeper
   has to be dressed before the restart, whereas the one coming out can peel
   the gloves off at their own pace.

   These are hard exclusions, not score penalties: a rule honoured "most of the
   time" is no use, because the one time it breaks is the one time the game
   stops. The only exception is 9 players present, where everyone plays every
   shift and it is arithmetically impossible; the app warns when that happens.

   Measured over 1,960 keeper handovers: **0 go straight from the field into
   goal** (was 65%) and **0 go straight from goal onto the field** (was 48%).
   With 10 or more present, both are honoured every time. A happy side effect
   is that a half-of-a-half keeper now rests immediately after their block in
   **100%** of games, which is exactly the keep / sit / play rhythm you want.

   The floor term squares its ratio so it stays quiet while there is plenty of
   game left and only becomes decisive as the window closes. A linear version
   was too loud too early — it yanked a keeper who had just done two straight
   shifts in net right back on, instead of letting them breathe.
2. **Field, shift by shift.** Each shift picks who plays, then where:
   - *Equity* is the dominant term, and it is a **rate, not a count**. Ranking
     by "shifts played (plus GK shifts still owed)" compares a keeper's nearly
     final total against everyone else's partial total — a player keeping the
     2nd half looks like they already have 4 shifts at kickoff, so they sit the
     whole 1st half and finish the game far behind. Instead each player gets an
     *urgency*: `needed / opportunities`, where `needed` is their fair share
     minus what they are already guaranteed, and `opportunities` is the shifts
     left in which they could take a field slot. The 2nd-half keeper needs 3.2
     from 4 open shifts (0.80); a field player needs 7.2 from 8 (0.90).
     Comparable numbers, so they interleave and land on the same total.
   - *No back-to-back sits* pushes on the player who sat the **last** shift,
     sized to beat continuity and break ties but to lose to a genuine one-shift
     equity gap.
   - *Rotation* moves players around the pitch. A player is penalised for
     returning to the line they just left, and penalised harder for the exact
     same slot, so nobody spends the afternoon at Left D. This deliberately
     outranks preference: a defender who has just played defence gets moved
     rather than parked. Penalties rather than bans, so when the only open slot
     is on the line they just left, they take it instead of leaving a hole.
   - *Preference* biases which line a player sees most, and a cumulative term
     spreads each player across all three over the game.

Measured across every roster size from 9 to 16 and 1–4 goalie volunteers, 60–80
seeds each:

- **Spread among non-keepers is always ≤ 1 shift** — the mathematical optimum,
  and exactly 0 where 72/players divides evenly (12 present → everybody 6).
- **Every keeper clears its scaled field-time floor**: 4,620 keepers checked
  across 1,680 games, 0 misses. Of the 1,680 who kept a *full half*, **not one**
  failed to get 2+ field shifts in the other half. Keepers on a 2-shift block
  get a rest immediately after it ~60% of the time — a preference, not a rule,
  since equity sometimes says they should stay on.
- **No duplicate players** within a shift across all 1,680 generated games.
- Keepers average ~6.1 total shifts vs ~5.4 for everyone else — the intended
  trade-off, visible in the Season table's GK column.
- **Rotation**: across 22,575 back-to-back field transitions, a player returns
  to the same line 7.5% of the time and the same exact slot 2.2%. Players with
  three or more field shifts now typically see 4–5 different positions; the
  old continuity rule left 79 of them in a single position all game.
- Preference still biases strongly without owning a player: someone who prefers
  defence takes 58% of their shifts there against 37.5% if positions were
  random, and a player with no preference lands exactly on the neutral split.
- Over 200 games every back-to-back bench sit belongs to a player already ahead
  on projected load, i.e. **none are avoidable**.

## Late arrivals and early exits

Kids turn up at half time and go home with a sore ankle. **Live → Someone
Arrived / Left** records it and re-plans only the shifts that have *not* been
played; everything already on the pitch is left alone, and the nine currently
out there finish their shift.

The mechanism is one line of the equity model. Instead of a single team-wide
fair share, each player's target is weighted by the shifts they are actually
available for:

```
target[p] = Σ over shifts p is available of (9 / players available that shift)
```

So a kid arriving at half time is owed a normal share of the four shifts that
are **left** — about 2 — not a full game crammed into the second half. No
catch-up, which is the point. Players who leave drop out of the denominator the
moment they go, and the rest absorb those slots evenly. Because the target
feeds the same urgency metric, none of this needed special-casing.

If the departing player was the keeper, the GK plan is repaired in preference
order: a volunteer who has not already done a full half → a drafted outfield
player with the fewest season GK shifts → only as a last resort a volunteer who
already kept 4. Without that middle step, one kid losing their keeper partner
means they keep all 60 minutes. The app says exactly what it did, in one banner.

## Competitive balance

Rec football, so winning is not the point — but a 9-0 drubbing is no fun either,
and the games kids enjoy are the close ones. **Setup → Line Balance** buckets
each player **Anchor / Steady / Support** at each end of the pitch, and those
buckets do exactly one thing: stop two Support players ending up on the same
line at the same time — each gets an Anchor or a Steady beside them instead.

The wording is load-bearing. This screen lives on a phone that gets handed to
assistants and left face-up on a bench, so the labels describe a *role in a
pairing* rather than a verdict on a child. "Support" means plays better with an
Anchor beside them, which is exactly what the algorithm does with it and is true
of every kid on some day. Read over a shoulder, none of it means anything about
anybody. Saves from the earlier High/Medium/Low build migrate forward on read.

Buckets rather than a 1-16 ranking, on purpose. Ranking sixteen kids twice is
thirty-two fiddly drags on a phone, and it implies a precision nobody has —
whether the 7th best defender beats the 8th is not a real question. What a coach
actually knows is "not those two together", and buckets say that directly.

Which rating applies depends on the line: defenders are judged on defending,
forwards on attacking, and midfielders on both at once (their two ratings are
averaged, since midfield is where a one-dimensional player is most exposed).

**It never costs anyone playing time.** Balance runs in the *where* stage, not
the *who* stage — it decides which shirt a player stands behind, and has no vote
on whether they are on the pitch. Measured over 2,400 shifts with a realistic
set of ratings: **zero stacked lines**, playing-time spread unchanged at ≤1
shift, and the weaker players averaged *slightly more* minutes than the stronger
ones. The only cost is position preference, down from 81% to 79%.

Greedy assignment fills one slot at a time and cannot see what lands next to it,
so a pairwise-swap repair runs afterwards. That still stuck in a local minimum on
12 shifts in 2,400 — cases needing a three-way rotation to escape — so an exact
solver takes over when it gives up. Eight players over eight slots is 40k
permutations, pruned to almost nothing, and it only runs on the ~0.5% of shifts
that need it.

Everyone starts Steady, so the feature is inert until a coach deliberately marks
someone. It is season-long and lives behind its own button rather than on the
roster list, and nothing from this screen is ever rendered on the Live, Matrix
or Season views.

## Keeping the plan in sync with Setup

A lineup is only rebuilt when you ask for it, so the app has to notice when
your Setup choices have drifted away from the plan on screen. It stores a
`planSignature` — a fingerprint of attendance, arrival/departure shifts, goalie
ticks and the both-halves answer — alongside the lineup, and compares **inputs**
rather than output.

**Before kickoff the lineup rebuilds itself.** Tick a goalie, flip attendance,
mark someone late — the plan just follows, with no nudge to notice and no
button to remember. Automatic rebuilds reuse the current seed, so the lineup
moves only in response to the change you made rather than reshuffling the whole
team every time you touch a toggle; **Regenerate** is what asks for a different
plan.

Once the clock starts this stops, and the Live tab shows a rebuild nudge
instead. **A rebuild never rewrites a shift that has already been played** —
it re-plans only from the first shift still to come, so the season stats saved
at full time describe what actually happened on the pitch. A half that has not
kicked off counts as still to come, which is why a player arriving at half time
can be slotted straight into the first shift of the second half. Silently re-planning mid-game would pull players off the pitch the
moment you touched a toggle, so from kickoff on it asks first. A deliberate
hand-swap on the Matrix never raises the nudge — an override is not staleness.

**Reset Game** rebuilds the lineup as well as resetting the clock, which is
what "reset" means to a coach standing on a touchline.

## Clock synchronization

One number is stored: `accumulated` ms banked for this half, plus `startedAt`,
a real wall-clock timestamp. Elapsed is always derived:

```js
elapsed = accumulated + (running ? Date.now() - startedAt : 0)
```

No drift when a background tab is throttled or the phone screen sleeps, and a
mid-half refresh resumes at the correct time. **The shift countdown is derived
from the same value rather than being its own timer**, so the two can never
disagree.

**Shift boundaries are fixed** at 7:30 / 15:00 / 22:30 / 30:00 of each half.
Subs happen at stoppages, so the half clock never stops for the shift timer:
the countdown just goes negative (`+0:44`) under a substitution alert naming
who to send on. Confirming **Shift Change Complete** moves the next shift onto
the field but does *not* push the remaining boundaries back — a sub made 44s
late simply makes that one shift 44s short, and the next one is still due at
15:00, where the plan says it is. Some shifts therefore run a little long or
short, which evens out across a season and keeps every boundary predictable.

## Surviving the touchline

Things that matter when the only device is a phone in someone's hand during a
live match:

- **Nothing white-screens.** Every persisted key is validated on read
  (`src/lib/persistence.js`) — parsing successfully is not the same as being
  usable, and a bad shape used to throw mid-render. An `ErrorBoundary` catches
  anything that still gets through and offers *Reload & keep my data* or
  *Start fresh*, because a blank screen is unrecoverable for a coach with 16
  kids and no console.
- **The screen stays awake** while the clock runs, via the Screen Wake Lock
  API (`src/lib/useWakeLock.js`). The lock is re-requested on
  `visibilitychange`, since the browser drops it whenever the page is hidden.
  A ☀ appears next to "Running" when it is held.
- **Ending a half is always reachable.** Once the clock passes 30:00 the End
  Half button appears whatever shift you are on — being behind on subs used to
  leave no way out.
- **One tap of undo** after a shift change, for 25 seconds.
- **Every tappable control is at least 48×48px.**
- **Nothing reflows under your thumb.** Roster rows are a fixed height whatever
  their state, and the lone-keeper prompt sits below the list rather than above
  it. Anything that grows or shrinks mid-list moves every row beneath it while
  a finger is already on the way down.

## localStorage

`src/lib/useLocalStorage.js` — a `useState` drop-in that mirrors to
localStorage. Lazy initial read, writes wrapped in `try/catch` (Safari private
mode throws on quota), and an optional `migrate` to heal older saved shapes.

| Key | Holds |
|---|---|
| `flash.roster.v1` | names, attendance, preferences, goalie opt-in, availability window |
| `flash.lineup.v1` | the 8 × 9 matrix, including manual overrides |
| `flash.lineupMeta.v1` | fingerprint of the Setup choices that lineup was built from |
| `flash.gameState.v1` | clock (`accumulated`/`startedAt`), half, current shift |
| `flash.completedGames.v1` | season history |
| `flash.settings.v1` | opponent, seed, both-halves keeper answer |

Saving a finished game clears the clock and lineup and resets the per-game
fields — `wantsGoalieToday` plus the `arriveShift` / `departShift` availability
window. **`preferredPositions` is never cleared** — it is season-long, so last
week's picks are already selected when you open Setup next Saturday and you
just toggle what changed.

The Setup screen also shows each player's **season GK shifts** under their
name, with a summary line on the Today card, so you can see who has been
carrying the gloves before deciding who takes them today.

## Stack

Vite 6 · React 18 · Tailwind CSS v4 (via `@tailwindcss/vite`; no config file —
theme comes from `src/index.css`). Only standard hooks: `useState`,
`useEffect`, `useMemo`, `useCallback`.
