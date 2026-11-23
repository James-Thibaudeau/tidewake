# Tidewake feature plan: Captain, Quests, Ashore

Three big features, built in an order where each one ships on its own and
the later ones build on the earlier ones:

1. **Character customization**: a creator when you start a voyage, plus a
   Tailor at every port.
2. **Quest system**: a quest board at each port. Quests send you to chart
   islands, carry cargo between ports and fetch items from islands.
3. **Going ashore**: drop anchor at an island and explore it as a separate 3D
   platforming level, looking for gold, cosmetics and quest items.

Decisions already made:
- Ashore levels are **3D, in a separate scene**. They are generated from the
  island, not walked on the real heightfield.
- Customization is available **on a new voyage and at a port Tailor**.

---

## How the codebase fits (what we build on)

| Area | Today | What changes |
| --- | --- | --- |
| `game.js` | One `Game` class with modes `title / sailing / docking / docked / wrecking / wrecked` | Add modes `creator`, `landing`, `ashore`, `embarking`. Move the ashore logic into its own module so `game.js` doesn't grow past ~700 lines. |
| `explorer.js` | Chibi explorer built from merged primitives with a hard-coded palette `C`. Legs are one static merged mesh. Arms use two-bone IK on the helm. | Build from an **appearance profile**. Swappable hair, hat and outfit parts. Articulated legs so the explorer can walk, run and jump. |
| `save.js` / `knowledge()` | `localStorage` JSON, `v: 1`, fields are added as they're needed | Bump to `v: 2` and add `profile`, `wardrobe`, `quests`, `ashore` and `hold`. Every load fills in defaults, so v1 saves keep working. |
| `input.js` | Edge-triggered actions (`sailUp`, `action`…) plus held steer/spy | Add a **movement layer**: a held 2D move vector, `jump` and `run`, and a virtual joystick on touch. Bindings change with the mode. |
| `main.js` | Renders the single `scene` | Renders `game.view.scene`, so the game can swap in the ashore scene. |
| `sky.js`, `ocean.js`, `weather.js` | Sky, ocean and rain all follow the camera | Their objects can be **moved into the ashore scene** while you're on land, so time of day, weather and the sea around the island match for free. |
| `ui.js` + `index.html` | Port sheet with Shipwright grid; title, map, pause, wreck screens | Port sheet gets tabs (**Shipwright · Tailor · Quest Board**). New creator screen, quest tracker, journal and ashore HUD. |

---

## Phase 0: Foundations (one PR, no visible feature)

Groundwork the three features share. It lands first so the feature PRs stay
focused.

1. **Save schema v2** (`save.js`, `game.js`)
   - `migrate(d)`: fills defaults for `profile`, `wardrobe: [...starterIds]`,
     `quests: { active: [], done: [], boards: {} }`, `ashore: {}` and
     `hold: []` (quest cargo), then sets `v = 2`.
   - The fields go into `knowledge()` (things that always persist) or
     `savePortState()` (things that persist when banked), following the
     current split.
2. **Game events** (`src/events.js`, a ~20-line emitter)
   - `game.emit('discover', I)`, `'dock'`, `'haul'`, `'wreck'`, `'pickup'`,
     `'ashore:enter'`, `'ashore:leave'`. The quest system and achievements
     listen for these, so they never have to patch game rules directly.
3. **View switching** (`main.js`, `game.js`)
   - `game.view = { scene, camera }` and `main.js` renders that view. For now
     it's always the sea scene.
4. **Input movement layer** (`input.js`)
   - `input.move` gives a camera-relative `{x, y}` from WASD/arrows or a touch
     stick. Also `jump` (edge-triggered), `run` (held) and
     `input.setScheme('sea' | 'land' | 'menu')`.
   - On land, Space jumps and E interacts. At sea, Space keeps its current job
     as the action key.
   - Touch: reuse the tiller's drag code for a left-hand joystick, plus Jump
     and Action buttons on the right.
5. **Articulated explorer** (`explorer.js`)
   - Split the merged leg mesh into per-leg `hip → knee` groups (with
     boot/sock/shin parts) and give the arms a free-swing mode when they
     aren't gripping.
   - `explorer.setPose('helm' | 'ground' | 'preview')`. The helm pose keeps
     today's IK behaviour exactly.
   - Procedural cycles for ground mode: idle, walk, run, jump-rise, fall,
     land squash, plus an optional ledge-hang.

**Done when:** the game plays exactly as before, an old save loads, and you
can type `tidewake.boat.explorer.setPose('ground')` in the console to see the
walk cycle on deck.

---

## Phase 1: Character customization

### Appearance profile

```js
profile = {
  name: 'Captain',
  skin: 'tone4',             // from SKIN_TONES
  eyes: { color: 'amber', shape: 'round' },
  hair: { style: 'spiky', color: 'chestnut' },
  brows: 'auto',             // follows hair colour
  face: { blush: true, freckles: false },
  hat: 'pith',               // or 'none'
  top: { style: 'vest', color: 'moss', shirt: 'cream' },
  bottom: { style: 'shorts', color: 'khaki' },
  boots: { style: 'chunky', color: 'leather' },
  neck: { style: 'scarf', color: 'red' },
  extra: 'satchel',
}
```

### Cosmetics catalogue (`src/cosmetics.js`)

Each item has an `id`, a `slot`, a `name`, a `source` and a `build` function or
palette reference:
- **Body (always free):** 8 skin tones, 10 eye colours, 3 eye shapes (round,
  sharp, sleepy), blush and freckles toggles.
- **Hair:** 6 styles to start (spiky, bob, long ponytail, twin buns, buzz,
  curly), 12 colours including a few fantasy ones (sea-teal, coral pink).
- **Hats:** pith helmet, tricorn, bandana, straw hat, captain's cap, none.
- **Tops:** explorer vest, sailor shirt, long coat, tank top, poncho.
  **Bottoms:** shorts, trousers, skirt, rolled cargo pants. **Boots** and
  **neckwear** (scarf, neckerchief, none).
- **Sources:** `starter` (owned from the start), `tailor` (costs gold),
  `found:<biome>` (from island chests), `quest:<id>` (quest reward). The
  rarest items are ashore-only, such as Frostspire's fur hood and the Sunken
  Temple's gold circlet.
- Colours come from **curated swatch palettes** that look good with the toon
  gradient and ink outlines. There's no free colour picker, which keeps the
  art style consistent.

### Building the explorer from a profile

- `new Explorer(profile)` and `explorer.setAppearance(profile)` rebuild only
  the merged meshes whose slots changed. Rebuilding the whole character is a
  few hundred triangles, so it's instant.
- `faceTexture({ irisColors, shape, brow, blush, freckles })` builds the
  canvas face from parameters. It already draws everything procedurally, so
  this is mostly a matter of passing values in.
- Hair styles and hats are small builder functions that return parts
  relative to the head centre `HC`. The hat and hair builders need to agree
  on a `hatFit`, so hair that would poke through a hat gets a flattened
  variant.
- **One explorer instance** is reparented between the boat, the creator
  studio and the ashore scene, so there's a single source of truth for how
  the character looks.

### Creator screen (`src/creator.js`, `#creatorScreen`)

- **Studio view:** a small studio scene (backdrop disc, key and rim light)
  with the explorer in `preview` pose, turning slowly. Drag to rotate, with a
  zoom preset for face or full body. It uses the main renderer through
  `game.view`, not a second WebGL context, which matters on mobile.
- **Layout:** a panel with tabs for **Body · Hair · Outfit · Accessories**,
  each showing swatch rows and item cards. There's also a name field,
  Randomize and Done.
  - Desktop: the panel sits on the right and the character on the left.
  - Phone: the character fills the top 45% and the panel scrolls underneath.
- **Flow:** New Voyage → creator → `startNew(profile)`. Continue skips the
  creator.

### Port Tailor tab

- Opens the same creator in **wardrobe mode**. Body features stay editable,
  you can equip owned items, and tailor items are on sale with a price
  (banked gold).
- Locked items show a silhouette and a hint, e.g. *"Found in the frozen
  north"*.
- Free to change, saved immediately.

**Done when:** a new voyage opens the creator, the chosen look shows at the
helm and through the spyglass's eye position, the look survives a reload, and
the Tailor sells and equips items. It also needs to look right at all six hull
and wheel tiers, since the explorer is repositioned per tier in
`applyUpgrades`.

---

## Phase 2: Quest system (sea-only quest types)

This phase ships quests that don't need going ashore, so the system is proven
before Phase 3. Retrieval quests are added in Phase 4.

### Data model (`src/quests.js`)

```js
// template (authored)
{ type: 'chart' | 'deliver' | 'salvage' | 'retrieve', giverRole, titleFn, textFn, rewardFn, pickTarget }

// instance (saved)
{ id, type, from: portId, target: islandId|portId, item?, reward: { gold, cosmetic? },
  acceptedDay, deadlineDay?, state: 'active' | 'ready' | 'done' | 'failed', hint: { x, z, r } }
```

### Quest types

| Type | Goal | Completes | Notes |
| --- | --- | --- | --- |
| **Chart** | Discover a named, uncharted island | On `discover` (sailing past or through the spyglass), then hand it in at any port | The map shows a **search circle** offset from the real island, so you still have to explore. Better spyglass tiers make these easier, which ties into upgrades. |
| **Deliver** | Carry a parcel from port A to port B | On docking at B | The parcel takes a **hold slot**. If you're shipwrecked it's lost and the quest goes back to port A to pick up again, the same way `pending` treasure works now. Some parcels pay a bonus if delivered within N in-game days. |
| **Salvage** | Haul up a specific sunken treasure or wreck | On `haul`, then dock anywhere | Reuses the treasure system, with a quest-only wreck spawned at a seeded spot. |
| **Retrieve** *(Phase 4)* | Bring back an item from an island | Pick it up ashore, then hand it in at the giving port | Needs going ashore. |

### Generation and the quest board

- Each port has a **board of 3 offers**, seeded by `(portId, day)` so it
  refreshes each in-game day and the same day always shows the same offers.
- Targets are chosen by distance bands (near, mid, far), with gold scaling by
  distance and danger (storms are more common far out).
- Chart quests prefer undiscovered islands. Once everything is charted they
  switch to salvage and deliver.
- Up to **3 active quests**.
- **Quest givers:** each port gets 2 or 3 named characters with roles
  (Harbormaster, Cartographer, Merchant, Old Salt). These are flavour text and
  a portrait, not 3D NPCs.
- **Main story:** the board is for side work. The main story is a separate,
  authored quest line (see *Main story: Grandfather's Journals* below).
  Smaller authored side chains per region (e.g. *"The Lantern Keeper"*) can
  come later, using the same story engine.

### Tracking UI

- **HUD tracker** under the hull panel: the pinned quest's title, a bearing
  arrow and distance. A marker also sits on the compass strip.
- **Minimap and sea chart:** target rings, search circles and port flags.
  Tap or click a quest on the chart to pin it.
- **Journal** (`J` / pause menu): lists active and completed quests and lets
  you abandon one.
- **Hand-in:** happens automatically on docking, with a banner and the reward
  toast before the port sheet opens. Gold is banked straight away, since
  docking banks gold anyway.

**Done when:** you can take chart, deliver and salvage quests from boards,
follow them on the HUD and map, hand them in, and get gold or cosmetics.
Wrecking with a parcel aboard handles it correctly, and everything persists
across reloads.

### Main story: Grandfather's Journals

**No names.** The grandparents are never named, so players can picture their
own. He is only ever "your grandfather", "Grandpa" or, to the townsfolk, "the
old captain". She is "your grandmother" or "Grandma". His ship stays unnamed
too ("your grandfather's ship", "the wreck"), because a ship's name would
point back to him. The journals are signed with a simple sign-off and no
name. NPCs never say his name, and no portraits show either grandparent's
face.

**The player is "grandchild".** The story never assumes the player's gender,
so any captain the creator makes fits. Story text speaks to the player as
"you", NPCs use the captain name chosen in the creator, and the journals say
"my grandchild" or "the little one". No text uses he/she for the player.

**Premise.** The player is the grandchild of a famous explorer whose ship went
down on the rocks just off Port Haven years ago. The town gives you a little
boat, and your first errand is to sail out to your grandfather's wreck.
Aboard you find Journal I and his old brass spyglass. The journal admits that
the old man had a habit of leaving his journals behind wherever he set them
down, and that they're scattered across the archipelago. Each one fills in
more of his life. Together they build to the twist: for all the bravado of
an adventurer's life, he secretly longed for home and his family.

**Structural idea: the wreck is the twist.** The wreck is a stone's throw
from Port Haven. Early on that reads as bad luck. The last journal reveals
that he had finally turned for home, so he wasn't setting out when he sank.
He was a few hours from his own harbour. The very first location becomes the
emotional payoff, and an epilogue sends the player back there.

#### Chapters

Journals are ordered by distance from home, so the story drives the player
outward at the pace the upgrades allow. Each journal ends with a clue that
puts a **search circle** on the chart for the next one, the same mechanic as
chart quests. The tone moves from bravado, to a few cracks, to longing.

| # | Where | Gate (soft) | Beat |
| --- | --- | --- | --- |
| Prologue | Port Haven | New voyage, after the creator | Short parchment story cards. Grandma, or an old harbormaster who sailed with your grandfather, hands over the boat. *"Your grandfather's wreck is just past the point. Go and pay your respects."* This replaces the first tutorial toasts: sailing to the wreck **is** the tutorial for sails, steering and wind. |
| I | Grandfather's wreck, a hand-placed wreck on rocks near Port Haven | None | Search the wreck → **Journal I + Brass Spyglass** (spyglass tier 1, free). Grand, boastful tone: the thrill of the open sea. Admits he left "the rest of my scribblings" across the isles. Clue to II. |
| II | A nearby island camp (temperate) | Base boat | First voyages, naming islands. A throwaway line about missing his wife's cooking. |
| III | The Elder Grove | Sails 1 | He's carved his family's initials into the great tree, and plays it off as a joke. |
| IV | Archway Isle | Rudder 1 | A near-death squall. He writes a letter home and then doesn't send it. |
| V | Sunken Temple Isle | Hull 1–2 | Treasure, fame, his proudest discovery. Ends on *"and no one to show it to."* |
| VI | Mount Cinderhorn | Keel 2 | He counts the birthdays he's missed, including the year his grandchild was born. |
| VII | Frostspire, at the far north | Hull/Keel 3, storms | The coldest, loneliest entry. He decides the adventure isn't worth what it cost. *"I am going home."* |
| Epilogue: "The Letter Home" | Back to the wreck, then Port Haven | All journals | The wreck now has a newly searchable sea chest (story flag). Inside are the unsent letters and a gift for the family. A **deliver** quest takes them to Grandma in Port Haven. Closing story cards end on the realisation that he was almost home. **Reward:** his red scarf and pith helmet (unique cosmetics) and the title *Wayfarer*. Free roam continues afterwards. |

The exact clue locations for II–VII are seeded, but they're fixed per world
because `WORLD_SEED` is fixed. Each chapter's search circle is wide enough
that the chart, the spyglass and actually exploring all matter.

#### How it plugs into the quest system

- **Story track:** `src/story.js` holds chapter data: location, clue text,
  journal text, rewards and the flags each chapter needs. Story quests are
  normal quest instances with `type: 'story'`. They **don't use any of the 3
  side-quest slots**, are always pinned by default, and can't be abandoned.
- **Grandfather's camps** (Phase 2 version): each journal island gets a small
  beach camp prop (tent, flag on a pole and a cairn) that you can see from
  the sea. Sailing slowly near it gives **Search the camp** → the journal,
  using the same interaction as hauling treasure. That way the whole story is
  playable before going ashore exists.
- **Journal reader:** the Journal screen (`J`) gets two tabs, **Quests** and
  **Grandfather's Journals**. The journals tab shows parchment pages in a
  handwriting font (e.g. Caveat from Google Fonts), and pages you haven't
  found yet appear as torn stubs. Finding a journal opens it once right away,
  and you can reread it any time.
- **Spyglass change:** shipwright spyglass tier 1 is no longer sold. The card
  reads *"Find your grandfather's spyglass"* until Journal I is found, and
  tiers 2–5 are bought as usual. The *"Buy a spyglass at a port"* hint in
  `game.js` changes to point at the wreck.
- **Save:** `story: { chapter, journals: [ids], flags: {...}, seenCards: [...] }`.
  Journals are saved the moment you find them, and are never lost in a
  shipwreck. The spyglass reward sets `upgrades.spyglass = max(current, 1)`.
- **Existing saves:** saves from before the story start at Chapter I. If they
  already own a spyglass, they still get Journal I at the wreck, but no
  duplicate spyglass.
- **World placement:** the wreck and camps are added **after** island
  generation, using their own seeded RNG. Drawing from the world's `rng()`
  stream would reshuffle every island and break existing saves and charts.
  The wreck needs collision rocks like the arch so you can't sail through it,
  plus its own entry on the minimap and chart.

#### Writing

- Each journal is about 150–250 words in the grandfather's voice, about 1,500 words for
  the whole story. The writing is the heart of this feature, so drafting all
  eight is a separate task to review before any code depends on them.
- The prologue and epilogue use 3–5 short story cards each: parchment, a
  simple painted-style illustration made from CSS/SVG shapes, and tap or
  Space to advance.

#### Later phases

- **Phase 3:** the wreck becomes the **first ashore level**, a short,
  safe tutorial walk across the beached hull to the captain's cabin. It
  teaches moving and jumping right after the sailing tutorial.
- **Phase 4:** journals III–VII move from the beach camps into the
  corresponding landmark levels' vaults. The camp stays as the landing spot,
  with a note pointing inland. Journal II stays at a beach camp so early play
  doesn't depend on platforming skill.

---

## Phase 3: Going ashore (core loop, one biome)

### Landing flow

1. Sailing slowly near any non-reef, non-port island's coast (within ~40u of
   the shore and slower than 6 kn) shows the prompt **Drop anchor & go
   ashore**.
2. The boat anchors: sails are furled, the boat is pinned in place, and it
   **can't be damaged while anchored**. The game saves the voyage.
3. The screen fades. `Ashore.enter(I)` builds the level, moves the sky, ocean
   and weather objects into the ashore scene, sets `game.view`, reparents the
   explorer in `ground` pose and switches the input scheme to `land`.
4. You start on a beach next to a beached rowboat. Walking up to the rowboat
   and pressing E, or choosing **Return to ship** from the pause menu, reverses
   the steps. You end up back aboard, anchored where you were.
5. If you quit while ashore, Continue puts you back aboard the anchored ship.
   Pickups are saved as they happen, so nothing is lost.

### Level generation (`src/ashore/levelgen.js`, `modules.js`)

- **Deterministic** from `I.seed`, `I.biome`, `I.r`, `I.landmark` and the
  quests that are active.
- **Module stitching:** a graph of 6 to 12 **room modules**, each with entry
  and exit sockets, placed along a route that climbs from the beach to a
  **summit or vault**. One or two **side branches** hold the secret cosmetic
  chest.
- **Module types:** beach start, stepping stones over water, broken ruins
  (columns and lintels), tree-top hops, cliff ledges, rope bridge, cave
  passage, vista summit. Each biome reskins and extends the pool.
- **Difficulty** scales with distance from Port Haven and island size: gap
  widths, moving platforms, crumbling platforms, slippery ice.
- **Geometry:** merged toon parts per module, reusing `props.js` (trees,
  rocks, pillars, chests, arch) plus new platform pieces. Coins use
  `InstancedMesh`. The level is disposed on leave.

### Character controller (`src/ashore/controller.js`)

- Custom kinematic controller, no physics library: there's no build step and
  rapier/cannon are heavy for this.
- **Capsule vs.** axis-aligned boxes, oriented boxes, vertical cylinders and a
  low-res ground heightfield. The colliders are generated alongside each
  module's geometry.
- **Movement feel:** acceleration and friction, camera-relative movement,
  coyote time (0.1s), jump buffer (0.12s), variable jump height, air control,
  a step-up for small ledges and a slope limit. Moving platforms carry the
  player.
- **Falling** into water, lava or the void fades out and respawns you at the
  **last checkpoint** (lanterns you light by walking past). There's no health
  ashore, which keeps the game's no-combat tone.
- **Camera:** a third-person orbit reusing the sea camera's drag and pinch,
  with auto-follow behind the player when they move, collision pull-in
  against level geometry and a slight look-ahead.

### Pickups (first pass)

- **Coins and gold caches** go into the hold, so they're at risk until you
  bank them at a port, just like the sea economy today.
- **Cosmetic chests** (one per island, one-time) unlock an item from that
  biome's pool straight away. They are **never lost** on a wreck.
- Per-island progress is saved: `ashore[islandId] = { coins: bitset,
  chests: [...], visited: true }`.
- The sea chart marks islands as *explored* or *chest found*.

### First biome

Phase 3 ships **temperate** only, to prove the loop end to end. Other islands
show the prompt but say *"Too treacherous to land (coming soon)"*. Another
option is to allow only temperate islands at first.

**Done when:** you can land on any temperate island, platform to its summit,
collect coins and a cosmetic chest, return to the ship and bank the coins. It
should run at 60fps on desktop and stay playable on a phone with the touch
stick.

---

## Phase 4: Ashore content and retrieval quests

- **Biomes:**
  - Tropical: palm-top hops, tide pools, rope bridges.
  - Cold: ice that slides, snow pines, wind gusts.
  - Volcanic: lava, crumbling basalt, steam vents that launch you.
  - Rocky: sheer ledges, arches, sea-stack hops.
- **Landmark levels:** bigger, partly hand-authored set pieces, each holding
  a unique cosmetic and one of the grandfather's journals (III–VII move here
  from the beach camps).
  - Sunken Temple: flooded ruins.
  - Frostspire: a vertical climb.
  - Mount Cinderhorn: a crater descent.
  - Elder Grove: the canopy.
  - Archway Isle: a cliff traverse.
- **Retrieve quests:** the quest item spawns at the vault or end of a branch
  only while the quest is active. It's carried in the hold, and a wreck
  returns it to the island. A variant, *"Find the lost map fragment"*,
  reveals an uncharted island when you hand it in, which links ashore play
  back to charting.
- **Gentle obstacles:** crabs that bump you back and gulls that swoop, but no
  combat.

---

## Phase 5: Polish

- **Audio** (`audio.js`, all procedural): footsteps per surface, jump and
  land sounds, a coin chime, chest fanfare, a biome ambience bed and an
  ashore music variant of the existing score.
- **Tutorial hints** the first time you go ashore, the first time you open
  the quest board and the first time you visit the Tailor.
- **Mobile:** joystick dead-zone tuning, bigger hit targets, a lower decor
  budget on `quality: 'low'`.
- **Performance:** a profile pass covering draw calls per module, outline
  cost and geometry disposal when you leave an island.
- **README:** controls table for ashore, plus new tips.

---

## File plan

```
src/
  events.js            (P0) tiny emitter used by Game
  explorer.js          (P0/P1) articulated rig, poses, build-from-profile
  cosmetics.js         (P1) catalogue, palettes, sources, starter set
  creator.js           (P1) studio scene + creator/wardrobe UI controller
  quests.js            (P2) templates, board generation, tracking, hand-in
  story.js             (P2) main-story chapters, flags, wreck + camp placement
  story-text.js        (P2) journal entries and story-card text (kept apart from logic)
  ashore/
    ashore.js          (P3) mode orchestrator: enter/leave, update, pickups, HUD
    levelgen.js        (P3) seeded module-graph generator
    modules.js         (P3/P4) per-biome room modules (geometry + colliders)
    controller.js      (P3) kinematic capsule controller
    collide.js         (P3) capsule vs box/cylinder/heightfield
    camera.js          (P3) third-person follow camera
  save.js              (P0) v2 migration
  input.js             (P0) movement layer, schemes, touch joystick
  game.js              (all) new modes, event emits, wiring
  ui.js / index.html / style.css   (all) port tabs, creator, tracker, journal, ashore HUD
```

## Delivery

One feature branch and PR per phase, matching how the repo already works
(`feature/...` → PR → merge):

| PR | Branch | Depends on |
| --- | --- | --- |
| P0 | `feature/foundations-v2` | — |
| P1 | `feature/character-creator` | P0 |
| P2a | `feature/quest-board` | P0 (can run in parallel with P1, but both touch the port sheet tabs; land P1 first or agree on the tab markup up front) |
| P2b | `feature/main-story` | P2a (story quests reuse the quest engine, tracker and map markers), plus the journal text written and approved |
| P3 | `feature/ashore-core` | P0, and P1's articulated explorer |
| P4 | `feature/ashore-biomes-retrieve` | P2, P3 |
| P5 | `feature/ashore-polish` | P4 |

**Verification each phase:** there's no test suite, so each PR is checked in
the browser preview (`tidewake-dev` in `.claude/launch.json`):
- Load a pre-change save.
- Play the new loop end to end at desktop and phone sizes.
- Check the console for errors.
- Leave a screenshot or two on the PR.

## Risks and open questions

- **Explorer refactor:** the helm IK, spyglass eye position and per-tier
  positioning all depend on today's rig. Phase 0 has to keep the helm pose
  pixel-identical before anything new is added.
- **Controller feel** decides whether the platforming is fun. Budget time to
  tune it, and expose the constants in `config.js` (`ASHORE`) so they're easy
  to adjust.
- **Mobile 3D platforming** with a virtual stick is hard. Keep jumps generous
  and the camera auto-framing.
- **Story pacing:** the soft gates assume certain upgrade levels at each
  chapter. Once P2b is playable, check that a player can afford the next
  chapter's upgrades by doing side quests, without grinding.
- **Port islands:** should ports be explorable towns later? That's out of
  scope here. Ports stay menus.
- **Sea time while ashore:** the day/night clock keeps running. Weather keeps
  changing too, but the anchored ship is safe. If that feels too safe, a
  storm could later drag the anchor and give you a timer.
