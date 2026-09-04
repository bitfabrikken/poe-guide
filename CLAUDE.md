# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A small Node.js/Ink (React-for-CLI) terminal app that guides a player through the Path of Exile 2
campaign leveling route. It tails the game's own log file, detects zone changes from
`[LOADING SCREEN] (<zone name>)` lines, and shows the current/previous/next step of a hardcoded
route plus the current zone's level/tags and a death counter.

The real value of this repo is the **data** (`data/steps.poe2-0.5.json`, `data/zones.poe2-0.5.json`),
not the code — it's a leveling route for an early-access game that changes with every patch. Treat
data edits with the same care as code edits: PoE2 zone names, boss names, and area connections are
exact facts that can be verified, not prose to improve stylistically.

## Commands

```sh
yarn                 # install deps
./cli.js              # run the app (equivalent to `node cli.js`)
./cli.js -l <path>     # set the Client.txt log path (persisted via `conf`, only needed once)
./cli.js -p             # force polling mode if file-watching doesn't pick up zone changes
yarn test              # runs `xo && ava` — xo lint first, then ava
```

`test.js` is stale boilerplate (`Hello, {name}` greeting tests) left over from the original
Ink starter template — it doesn't test any of this app's real behavior. There's no test coverage
for the data or the routing logic.

There's no build step; `cli.js` is run directly (`bin` field in package.json) and JSX is
transpiled at require-time via `import-jsx`/`@babel/register` in tests, not at build time.

### Manually verifying data changes

After editing `data/steps.poe2-0.5.json` or `data/zones.poe2-0.5.json`, always:

1. Validate both are well-formed JSON: `node -e "JSON.parse(require('fs').readFileSync('./data/steps.poe2-0.5.json','utf8'))"`
2. Confirm every step resolves a matching zone entry (same `name`+`act`+`difficulty`) — `hooks.js`
   degrades silently to a stub with just a `console.error` if a zone is missing, so nothing crashes
   but the level/tags display breaks:
   ```js
   const {zones} = require('./data/zones.poe2-0.5.json');
   const {acts} = require('./data/steps.poe2-0.5.json');
   for (const chapter of acts) for (const step of chapter.steps) {
     if (!zones.find(z => z.name === step.zone && z.act === chapter.act && z.difficulty === chapter.difficulty)) {
       console.log('MISSING:', chapter.act, chapter.difficulty, step.zone);
     }
   }
   ```
3. Optionally render a step to eyeball formatting, using `ink-testing-library` directly against
   `Step.js`/`Zone.js` (NOT the full `ui.js` App — mounting `App` starts a live `Tail` watcher on
   the configured log file and will hang forever; that's by design, not a bug):
   ```js
   require('@babel/register');
   const {render} = require('ink-testing-library');
   const Step = require('./Step');
   render(React.createElement(Step, {step})).lastFrame();
   ```

## Architecture

- `cli.js` — entry point, parses `-l`/`--log` via `meow`, optionally persists it to `config.js`,
  renders `ui.js`.
- `ui.js` (`App`) — top-level Ink component; wires keybindings (`useInput`) to the state returned
  by `hooks.js`'s `useData()`, and renders `Zone` + three `Step` components (prev/current/next).
- `hooks.js` — all the real logic:
  - `useData()` tails the configured log file with `tail`, matches `[LOADING SCREEN] (<zone>)`
    lines, and on startup replays the last 2MB of the log to resume near where the player left off
    (`resumeFromLog`).
  - **"chapter" vs "act"**: `data/steps.poe2-0.5.json`'s `acts` array is a flat, sequential list of
    route sections (Act 1 Normal, Act 2 Normal, Act 3 Normal, Act 4 Normal, Interlude 1, Interlude 2,
    Interlude 3). `chapter` in this file always means the 1-based index into that flat array —
    distinct from the real PoE2 act number shown to the user (`step.act`, 1-4, which repeats across
    Normal and each Interlude). `flattenIndex`/`unflattenIndex` convert between (chapter, step) and
    a single linear position across the whole route.
  - `checkMovement(chapter, step, zoneName)` — when a new zone loads, scans the *entire* flattened
    route for the nearest step with a matching zone name (preferring a match ahead of the current
    position, falling back to the nearest one behind for backtracking like town visits). This is
    what makes duplicate zone names (e.g. `Ziggurat Encampment` appearing many times as a hub)
    resolve correctly without tracking separate state.
  - `getZone(step)` looks up `data/zones.poe2-0.5.json` by exact `{name, act, difficulty}` match.
- `Step.js` — renders one step's zone/bosses/rewards/waypoint/trial/travel-or-port-or-tp/note. The
  act label reads `Act ${act}` normally, `Interlude ${act}` when `difficulty === 'interlude'`.
- `Zone.js` — renders the current zone's name/level/tags/death counter, same Act-vs-Interlude
  label logic.
- `config.js` — thin wrapper around `conf` (persists the log path across runs under project name
  `poe-guide`).

### Data schema (`data/steps.poe2-0.5.json`)

```
{ version, acts: [ { act: 1-4, difficulty: "normal" | "interlude", steps: [ ...step ] } ] }
```

Each `step`:
- `zone` (required) — must be the **exact** in-game zone name as it appears in
  `[LOADING SCREEN] (<zone name>)` log lines. Any typo silently breaks detection for that zone.
- `bosses` — array of notable fights in this step. Convention in this file blends mandatory
  act-gating bosses with optional-but-recommended ones (e.g. side-dungeon bosses, permanent-buff
  minibosses) — both render the same "✕ Kill X" line; optionality is explained in `note`, not by a
  separate field.
- `rewards` — NPCs to talk to for a quest reward ("$ Talk to X for a reward").
- `waypoint` (bool), `trial` (string ascendancy trial name), `port`/`travel`/`tp` (mutually-exclusive-ish
  "how to leave this zone" hint — port/travel take a target zone name, `tp` means "Town Portal or
  Logout"), `note` (free italic text) — used for boss/mechanic explanations, permanent-buff/reward
  callouts, and in-game environmental navigation cues (e.g. "follow the mushrooms", "hug a wall",
  "railroad tracks" — the kind of wayfinding patch 0.5.0 added to let experienced players route
  without memorizing full layouts).

`data/zones.poe2-0.5.json` is a flat list of `{act, difficulty, tags, name, level}` — one entry per
unique `(name, act, difficulty)` combo referenced anywhere in steps.json. `tags` (`waypoint`, `town`,
`boss`, `trial`, `hideout`) drive the letter badges (WP/T/B/A/H) in `Zone.js`; `level` is an
approximate expected character level, not a confirmed value.

## Domain facts worth knowing (PoE2 patch state)

This targets PoE2 **Early Access patch 0.5.5**. It's a fast-moving early-access game — always
cross-reference data changes against current patch notes and multiple community guides
(maxroll.gg, domistae.github.io/poe2-leveling, poe2wiki.net) rather than relying on prior
knowledge, since areas get merged/renamed/reordered between patches.

- **Patch 0.5.0 ("Return of the Ancients") replaced Cruel difficulty entirely** with three
  "Interlude" chapters (Ogham → Khari Bazaar → Mount Kriar) that run after Act 4 and gate the
  endgame map device. Do not reintroduce a `"difficulty": "cruel"` block — it no longer exists
  in-game. Interludes use `act: 1/2/3` + `difficulty: "interlude"`, mirroring the act-numbering
  the old Cruel-mode acts used.
- Act 1's "Ogham Manor" is a single zone, not separate First/Second/Third Floor zones (this was a
  real bug in this data, since fixed).
- Act 2's old "The Dreadnought Vanguard" was removed in 0.5.0; the act boss (Jamanra, the
  Abomination) now fights in "The Dreadnought" itself.
- Act 3's area order was rearranged in 0.5.0: Venom Crypts branches off Jungle Ruins (not
  Infested Barrens); Azak Bog branches off the Matlan Waterways (not Infested Barrens). The
  Matlan Waterways' old lever puzzle became auto-activating pressure pads with the final section
  pre-drained.

## Editing large JSON structural blocks

When replacing a large multi-step region of `steps.poe2-0.5.json` (e.g. swapping out a whole
difficulty block) with the `Edit` tool, make sure `old_string` spans the **entire** region being
replaced, start to end. Matching only the opening fragment and writing a `new_string` that
includes new closing braces will leave the old block's trailing content orphaned in the file and
produce invalid JSON — always re-validate with `node -e "JSON.parse(...)"` immediately after.
