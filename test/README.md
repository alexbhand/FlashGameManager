# Verification harnesses

Plain Node scripts that exercise `src/lib/lineup.js` directly — no test runner,
no build step. They are how every number quoted in `STATE_OF_THE_PROJECT.md`
was produced, and they are the fastest way to prove a change to the algorithm
did not break one of the guarantees.

```bash
cd test
node equity.mjs       # shift spread, keeper field-time floors, duplicates
node sits.mjs         # back-to-back bench sits
node jersey.mjs       # keeper kit-change breaks, both directions
node halftime.mjs     # half-time handover, longest spell off the pitch
node rotation.mjs     # position/line repeats, preference match
node balance.mjs      # competitive balance, with and without ratings
node keeperperk.mjs   # volunteer-keeper defensive share
node edges.mjs        # attendance 0-16, goalie volunteers 0-16
node variety.mjs      # per-player position spread, one readable game
```

Run the lot after any change to `src/lib/lineup.js` or `src/lib/constants.js`.
