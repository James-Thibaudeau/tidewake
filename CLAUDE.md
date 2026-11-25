# Tidewake

A cel-shaded sailing game for the browser: three.js as plain ES modules from a
CDN import map in `index.html`. **No build step, no package.json, no
dependencies to install.** It deploys from `main` to GitHub Pages as-is.

## Start here

- What's done, what's next, known issues: `docs/STATUS.md`. Update it in the
  same PR as the change.
- Which file does what: "Project structure" in `README.md`. Every source file
  also opens with a comment saying what it owns.
- Designs: `docs/feature-plan.md` (not built yet), `docs/shipped-plans.md`
  (built; reference only, 550 lines, read one section), `docs/rival-captain.md`,
  `docs/elder-grove-level.md`, `docs/archway-isle-level.md`.

## Check your work

```bash
node tools/check.mjs
```

About a second, no browser. Run it after every change. It checks syntax,
that every import resolves to a real export and is used, that no helper was
left behind when code moved between files, text keys (`LINES.x`), element
ids, save migration, 150 generated ashore layouts per landable biome, a test
climber (the real controller) that walks 12 generated islands per biome to
the summit, the Elder Grove (its limits, and the climber from the beach
to the crown) and Archway Isle (its limits, and the climber from the cove
over the arch and up the stack). One group at a time:
`node tools/check.mjs imports`.

It can't see rendering or behaviour. For those, use the browser: the game
for behaviour, the gallery for looks.

## Test in the browser

Start the `tidewake` entry in `.claude/launch.json` (it runs
`tools/serve.py`, caching off). Then drive the game from the console; the
game object is `window.tidewake`, and `tidewake.debug.help()` lists the
helpers:

```js
tidewake.debug.start()                    // new voyage, prologue skipped; backs up the real save
tidewake.debug.give({ gold: 5000, upgrades: 'max' })
tidewake.debug.teleport('Frostspire')     // id, name or { x, z }
tidewake.debug.step(30)                   // 30 s of game time in well under a second
tidewake.debug.frame()                    // draw a frame before a screenshot
tidewake.debug.restoreSave()              // when you're done: real save back, reload to the title
```

- The preview tab is usually hidden: no animation frames arrive and the game
  pauses itself. `step()` and `frame()` work anyway. Don't wait for the game
  to advance on its own.
- UI that waits on real timers (`ui.fade`, story cards, `setTimeout`) still
  needs a real `await` between steps. `await tidewake.debug.ashore(id)` does
  that for going ashore.
- The preview origin may hold a real save in `localStorage['tidewake.save.v1']`.
  `debug.start()` backs it up. **Always finish with `debug.restoreSave()`**:
  it puts the save back and reloads to the title. Skip it and the test voyage
  is written over the real save when the tab closes.
- Visual effects: `?fx=0` turns them all off, `?fx=edges,bloom` picks some.

## Look at the art

For how something looks, use the gallery, not the game: `gallery.html` on the
same dev server shows one subject at a time from fixed cameras under fixed
light, and it never touches the save.

```js
gallery.help()                             // everything below, and the other parameters
gallery.list()                             // subjects, views, lights, sheets, this subject's parameters
gallery.show({ show: 'outfit', top: 'coat', extra: 'satchel', view: 'back' })
gallery.set({ light: 'sunset' })           // change some parameters, keep the rest
gallery.show({ show: 'ship', tier: 4, view: 'sail' })   // the game's own lens and distance
await gallery.sheet('tops-back')           // contact sheet: every top with every bag, from behind
gallery.frame()                            // draw before a screenshot when the tab is hidden
```

- Subjects: `outfit`, `ship`, `prop`, `tree`, `wreck`, `grove`, `level`. The
  same parameters work in the URL: `gallery.html?show=ship&tier=4&light=night`.
- **After changing how something looks, take the contact sheet that covers
  it** (`tops-back`, `scarves`, `running`, `hats`, `ships`, `anchors`…, or
  `views` / `lights` / `distance` for the subject showing) and read every
  cell, not only the one you were fixing. A sheet takes the parameters
  already showing, so `gallery.set({ bottom: 'skirt' })` first narrows it.
- The same URL always draws the same picture, so a screenshot before and one
  after show only your change. Take the "before" first.
- `state()` and `sheet()` return `warnings` for anything not understood (an
  unknown style, a misspelt parameter). Check it is empty.
- Sheets are big; use the screenshot zoom to read cells and labels.
- New art that the gallery can't show yet gets a subject in
  `src/gallery/subjects.js`; a new combination worth checking gets a sheet
  in `src/gallery/sheets.js`.

## How the code is wired

`src/main.js` builds everything and hands it to one `Game` (`src/game.js`),
which the other systems hang off:

```
game.world  .streamer  .boat  .ocean  .env (sky)  .weather  .input  .audio  .fx
game.ui  .creator  .story  .ashore  .quests  .rival  .debug
game.state     everything that is saved (see below)
game.mode      title | sailing | docking | docked | landing | ashore | wrecking | wrecked
game.view      { scene, camera } being drawn: the sea, or the ashore level
game.events    emitter: dock, setSail, discover, haul, wreck, respawn, upgrade, cosmetic, outfit, pickup
```

- **Systems react to events** (`src/events.js`) instead of patching game
  rules: quests, story and the rival all listen.
- **Writing is kept apart from logic**: `story-text.js`, `rival-text.js`.
  The grandparents are never named.
- **`UI` and `Boat` are each one class split over several files.** The core
  is `src/ui.js` / `src/boat.js`; the rest is mixed in from `src/ui/` and
  `src/boat/` (see the header of each core file for the map). Methods are
  called as `this.method()` wherever they live, so grep the method name to
  find it. New methods go in the part file that fits.
- **Pure modules stay pure**: `ashore/modules.js`, `ashore/grove-layout.js`, `ashore/archway-layout.js`, `collide.js`,
  `controller.js`, `shapes.js`, `save.js`, `config.js`, `util.js`,
  `cosmetics.js` and the text files import no three.js and touch no DOM at
  load, so `tools/check.mjs` can run them in Node. Keep it that way.
- Tuning numbers live in `src/config.js`; on-foot limits are `ASHORE` there,
  and ashore levels must keep required jumps inside `ASHORE.design`.

## Saved state

`game.state` is created by `freshState()` in `src/game.js` and loaded by
`continueGame()` through `migrate()` in `src/save.js`. To add a saved field:

1. add it with a default in `freshState()`;
2. fill the default for old saves in `migrate()`;
3. copy it across in `continueGame()` and write it out in `knowledge()` /
   `savePortState()`.

Progress is banked at ports; `saveVoyage()` only remembers the boat mid-trip.
The save key stays `tidewake.save.v1`; the data inside carries `v`.

## House style

- Plain modern JavaScript, 2 spaces, single quotes, semicolons. No new
  dependencies and nothing that needs a build.
- One-line imports (`import { a, b } from './x.js';`) and top-level
  declarations in column 0: `tools/check.mjs` reads the source with regular
  expressions and relies on both.
- Every file opens with a comment on what it owns. Keep new files under
  about 600 lines; split along a seam before a file gets hard to read whole.
- User-facing text: plain, short, no jargon.

## Git

- Several sessions work on this repo at once. **Work in your own worktree**,
  not the shared checkout: branches get switched under you there, and
  uncommitted work has ended up on the wrong branch. Each worktree serves on
  its own port (`autoPort` in `launch.json`).
- If you must use the shared checkout, run `git branch --show-current` right
  before committing or pushing, and push with `HEAD:refs/heads/<branch>`.
- One branch per change (`feature/…`, `fix/…`, `chore/…`) → PR → merge commit
  (`gh pr merge --merge`) → delete the branch locally and on origin. Ask
  before committing, merging or deleting.
