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

## Status

Updated 2026-11-25. The phase sections below are the original plan; this
section records what has shipped and what's left. Keep it current when a
pull request merges.

### Done

- [x] **Phase 0, foundations:** save v2 migration, game events, scene
  switching, sea/land input schemes with a touch joystick, articulated
  explorer rig ([#5](https://github.com/James-Thibaudeau/tidewake/pull/5)).
- [x] **Phase 1, character customization:** creator on new voyages, port
  Tailor tab, 37 outfit styles ([#5](https://github.com/James-Thibaudeau/tidewake/pull/5)).
  - Extra: six face shapes, with oval the default
    ([#6](https://github.com/James-Thibaudeau/tidewake/pull/6)).
- [x] **Phase 2a, quest boards:** chart, deliver and salvage quests, HUD
  tracker, map markers, journal (`J`)
  ([#7](https://github.com/James-Thibaudeau/tidewake/pull/7)).
- [x] **Phase 2b, main story:** grandfather's wreck near Port Haven,
  prologue and epilogue cards, Journals I–VII at beach camps, the letters,
  Grandpa's scarf and helmet ([#8](https://github.com/James-Thibaudeau/tidewake/pull/8)).
  - Extra: "Found!" pop-up for story finds
    ([#9](https://github.com/James-Thibaudeau/tidewake/pull/9)).
- [x] **Phase 3, going ashore (core):** grandfather's anchor quest (Oak
  hull), temperate island levels with a difficulty curve by distance from
  Port Haven, coins, caches, a cosmetic chest per island, lantern
  checkpoints, a carried lantern at night
  ([#11](https://github.com/James-Thibaudeau/tidewake/pull/11)).
- [x] Fix: the seam through the "d" in the title logo
  ([#10](https://github.com/James-Thibaudeau/tidewake/pull/10)).
- [x] **Visual upgrade:** three.js r187; post-processing (ink edges, bloom,
  colour grade, SMAA); cascaded cel shadows; a rim light on toon materials.
  On High quality only, still no build step
  ([#17](https://github.com/James-Thibaudeau/tidewake/pull/17)).
  - Fix: black flashing blocks on the title and while turning the camera.
    The sky shader made stray NaN pixels (`pow` of a value rounded just
    below zero), which bloom blurred into large black areas. The sky is
    fixed, and a guard pass now scrubs NaN/Inf before bloom.

- [x] **The wreck as the first walkable level** (left over from Phase 3): a
  short, safe walk from the beach up the bow rocks, down the deck and over
  the caved-in planks to grandfather's cabin. It needs no anchor (you climb
  aboard from the boat), and Journal I, the spyglass and the epilogue chest
  are found in the cabin. Hand-built in `src/ashore/wreck.js`
  ([#18](https://github.com/James-Thibaudeau/tidewake/pull/18)).
  - Fix: the compass follows the camera on foot, and moat water lies still.
  - Fix: a story find ashore (the spyglass) no longer pulls the explorer
    back to the helm.
  - Extra: the wreck at sea is the same ship you walk on, larger and far
    more detailed (two broken masts with a tattered sail, rigging, paintwork,
    portholes, gulls, a stern lantern), and she's broken in two on a dark
    reef: the bow is jammed on the rocks, and the stern with the cabin has
    torn away and rolled over. Ashore, torn planking hangs across the break
    to the stern ([#19](https://github.com/James-Thibaudeau/tidewake/pull/19)).

- [x] **Phase 8, the rival captain:** Captain Sable and their ship, the
  Redwing, which is rigged to match your upgrades.
  Six encounters (a sprint, a buoy race, a foot race to a summit, a fog run
  by compass, a relic scramble, a tow after a storm), the letter, the flare
  and the kraken rescue, then Sable as a friend with rematches from the
  Quest Board. Rewards: Sable's tricorn, crimson sails, the title *Lifeline*.
  How it's built, and the decisions taken, are in
  [rival-captain.md](rival-captain.md)
  ([#28](https://github.com/James-Thibaudeau/tidewake/pull/28)).
  - It shipped before Phase 7, so `rival.js` schedules its own encounters
    (harbor talk on the Quest Board, a search circle, the Redwing appears when
    you get close). The Phase 7 director can take that over later.

- [x] **Character revamp** (not in the original plan): the explorer has
  roughly real proportions, about four and a half heads tall, with a smaller
  head on a neck, a tapered torso, longer legs and ankle joints. On foot the
  legs are solved from where the feet go (a stride that matches ground
  speed, heel strike and toe-off), the hips bob and sway, the shoulders turn
  against them, jumps have rise, apex and fall poses, and landings sink on a
  spring. At the helm the feet stay flat on the deck and the knees give.
  Every outfit is refitted through one body-shape field in `outfits.js`
  ([#30](https://github.com/James-Thibaudeau/tidewake/pull/30)).
  - Not yet done: playing it by hand on a real phone, and a pass over
    Sable's foot races with the new stride.
  - The poncho now reads narrow (more of a serape); widen it if it bothers.

### Next up

- [ ] **Phase 4, ashore content and fetch quests:**
  - [x] The Elder Tree at sea: a giant, detailed landmark tree with roots,
    an owl hollow, drifting clouds, birds and fireflies
    ([#20](https://github.com/James-Thibaudeau/tidewake/pull/20))
  - [ ] The Elder Grove level, the first landmark level, plus the shared
    vault for retrieve and refit quests. Design agreed in
    [elder-grove-level.md](elder-grove-level.md): Journal III at the
    carving, the anchor required, an owl that hoots you up the tree.
  - [ ] Rocky islands first, then tropical, volcanic and cold, in the order
    of the anchor refits (Phase 6)
  - [ ] Landmark levels; move Journals III–VII from the beach camps into
    them, each with a unique cosmetic (makes the fur hood, flower crown,
    gold circlet and shell necklace findable)
  - [x] Retrieve quests, including "Find the lost map fragment": offered by
    Harbormasters (Cartographers for the fragment) once the anchor is fitted.
    The item waits at the level's vault (on generated islands, by the summit)
    and goes back to the island if you're wrecked.
  - [ ] Harmless obstacles (crabs, gulls)
- [ ] **Phase 5, polish:**
  - [ ] Sound: footsteps by surface, jump and land, coins, chest fanfare,
    biome ambience, an on-foot music variant
  - [x] Tutorial hints for the quest board and the Tailor: a one-time note
    at the top of each tab ([#25](https://github.com/James-Thibaudeau/tidewake/pull/25))
  - [ ] Phones: bigger buttons, less decor on Low. The joystick already has
    a 12% dead zone; tune it on a real phone.
  - [ ] Performance pass, including cleanup when leaving an island
  - [x] README controls for going ashore (done in #11)
- [ ] **Visual effects follow-ups** (after #17; `src/fx.js`, `src/toon.js`):
  - [ ] Test High quality on real phones (touch uses 2 shadow cascades,
    1024 maps, medium SMAA). Phones default to Low, which has no effects;
    decide whether High on touch should drop edges or shadows.
  - [ ] Measure frame time on desktop with effects on and off. The in-app
    browser was throttled during the prototype, so there's no real number yet.
  - [ ] Shadows on the ocean: the boat and cliffs cast none on the water
    (the custom water shader needs the shadow chunks and the cel band).
  - [ ] Shadows stop at 220 m (140 m on touch); check whether the cut-off
    line shows while sailing and tune `maxFar` or the fade.
  - [ ] Ink edges: check storm swells for stray lines on wave crests.
  - [x] Thinner, lighter ink lines in the creator close-up.
    Also the sunset sun now stays gold, and freckles are bigger
    ([#24](https://github.com/James-Thibaudeau/tidewake/pull/24)).
  - [ ] Rim light: check hair, hats and coats from all angles, and under
    moonlight; consider a per-material strength.
  - [x] Sunset sun disc reads near-white (neutral tone mapping compresses
    it): the disc drops its white lift and most of `uSunHDR` in golden hour.
  - [x] An "Effects" switch in the pause menu, separate from Quality
    ([#26](https://github.com/James-Thibaudeau/tidewake/pull/26)).
  - [x] Ashore lantern glow takes its bloom boost once at start-up, so
    `tidewake.fx.setEnabled()` doesn't change it. It now follows the boost.

- [ ] **Rival captain follow-ups** (after #28; `src/rival.js`, `src/race.js`,
  `src/kraken.js`, `src/ashore/pacer.js`):
  - [ ] Play every race by hand and tune the pace. So far the races have
    been run by a test pilot in the console, not by a person: `pace` and the
    rubber band in `race.js`, `PACE` in `pacer.js`, the tentacle timings at
    the top of `kraken.js`.
  - [ ] Sable's writing (`rival-text.js`) is a first draft: review it like
    the journals were.
  - [ ] Move the relic scramble to a tropical island when that biome can be
    landed on (Phase 4).
  - [ ] Hand encounter delivery to the Phase 7 event director.
  - [ ] Sounds for the kraken, the buoys' bells and the flare (they reuse
    existing sounds).
  - [ ] The towed Redwing has no collision with land, and Sable carries no
    lantern ashore at night.
  - [ ] In the fog run the panel shows the bearing but not who's ahead.

### Ideas (planned, not started)

- [ ] **Phase 6, anchor refits:** refit grandfather's anchor tier by tier
  to unlock each biome. Ships alongside the Phase 4 biomes.
- [ ] **Phase 7, a living sea:** random ocean events (whales, dolphins, a
  ghost ship at night…), a Sightings log, and report quests.

### Known issues

From Phase 1 (outfits):
- [x] The poncho's hem clips the arms when they hang loose.
- [x] Curly hair pokes through the flower crown and circlet.
- [x] Grandpa's helmet looks only a little different from the normal pith
  helmet.
- [x] The ponytail sticks out sideways instead of hanging.
- [x] The scarf tail hangs inside the back of every top (worst on the long
  coat and poncho), and pokes out through the chest while running.
- [x] Freckles are hard to see from the sailing camera.

From Phase 3 (ashore):
- [x] The compass shows the ship's heading while you're on foot.
- [x] Water in the moat rises and falls with the ocean swell.
- [ ] Rock faces fade into the grass with a soft band instead of a crisp
  edge.
- [ ] Platforms against a cliff can leave a small gap to the rock.

General:
- [x] Toasts were drawn under menus such as the port sheet, so messages
  like "Not enough gold" never showed. They now show above an open menu
  ([#26](https://github.com/James-Thibaudeau/tidewake/pull/26)).
- [ ] Large easy islands can still have up to 20 small hops in total (never
  more than 4 in a row).

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
| III | The Elder Grove | Sails 1 (+ Anchor 0 once ashore) | He's carved his family's initials into the great tree, and plays it off as a joke. |
| IV | Archway Isle | Rudder 1 (+ Anchor 1) | A near-death squall. He writes a letter home and then doesn't send it. |
| V | Sunken Temple Isle | Hull 1–2 (+ Anchor 2) | Treasure, fame, his proudest discovery. Ends on *"and no one to show it to."* |
| VI | Mount Cinderhorn | Keel 2 (+ Anchor 3) | He counts the birthdays he's missed, including the year his grandchild was born. |
| VII | Frostspire, at the far north | Hull/Keel 3, storms (+ Anchor 4) | The coldest, loneliest entry. He decides the adventure isn't worth what it cost. *"I am going home."* |
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
  safe tutorial walk across the broken hull to the captain's cabin in the
  torn-off stern. It teaches moving and jumping right after the sailing
  tutorial.
- **Phase 4:** journals III–VII move from the beach camps into the
  corresponding landmark levels' vaults. The camp stays as the landing spot,
  with a note pointing inland. Journal II stays at a beach camp so early play
  doesn't depend on platforming skill.

---

## Phase 3: Going ashore (core loop, one biome)

### Unlocking it: grandfather's anchor

You can't go ashore until your ship carries an anchor, and the anchor is his.

1. **Trigger:** buying the **Oak Planking** hull (hull tier 1, 120 gold).
   The shipwright says something like *"A hull this sound can carry a proper
   anchor. Your grandfather's ship had the finest in the harbor, and it'll
   still be on the bottom by the wreck."* Saves that already own hull 1 or
   better get the quest the next time they dock.
2. **Quest:** "Grandfather's anchor". It works like the main story: always
   tracked, takes no side-quest slot, and can't be abandoned. It runs
   alongside whatever journal chapter you're on.
3. **Salvage:** a marked spot on the seabed beside the wreck, using the same
   haul interaction as salvage quests. If you're shipwrecked while carrying
   it, it sinks back to that spot.
4. **Fitting:** dock at any port and the shipwright fits it for free. A
   "Found!" pop-up shows the anchor and explains how to go ashore.
5. **On the boat:** the anchor hangs at the bow on every hull tier. It drops
   on its chain when you go ashore and is hauled back up when you return.
6. **Before you have it:** slowing near an island's coast shows a hint instead
   of the action: *"You'll need an anchor to go ashore."*

Save: `story.flags.anchor = 'quest' | 'aboard' | 'fitted'`.

### Landing flow

1. Once the anchor is fitted, sailing slowly near any non-reef, non-port
   island's coast (within ~40u of the shore and slower than 6 kn) shows the
   prompt **Drop anchor & go ashore**.
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

**Done when:** buying the Oak hull starts the anchor quest, hauling and
fitting it unlocks landing, and you can land on any temperate island, platform to its summit,
collect coins and a cosmetic chest, return to the ship and bank the coins. It
should run at 60fps on desktop and stay playable on a phone with the touch
stick.

---

## Phase 4: Ashore content and retrieval quests

- **Biomes:**
  - Tropical: palm-top hops, tide pools, rope bridges.
  - Cold: ice that slides, snow pines, wind gusts.
  - Volcanic: lava, crumbling basalt, steam vents that launch you (the
    launch mechanic is built here, not in the Elder Grove).
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

## Phase 6: Anchor refits (biome gates)

Grandfather's anchor is the key to going ashore, so it also becomes the key
to each new biome. Instead of the shipwright selling new anchors, they
**refit grandfather's anchor** a piece at a time. That keeps the story thread:
by the end it is still his anchor, just one that has been everywhere.

This replaces the Phase 3 placeholder (*"too treacherous to land on (yet)"*).
When a biome ships in Phase 4, it ships with its refit, so the two phases
interleave: each Phase 4 biome PR adds one refit tier.

### Tiers

The order follows the main story: each refit opens the biome of the next
journal's landmark, so the refits and the journals move outward together.
The upgrade each tier needs matches that chapter's soft gate.

| Tier | Refit | Unlocks | Next journal | Shipwright needs | Small perk |
| --- | --- | --- | --- | --- | --- |
| 0 | Grandfather's anchor (as found) | Temperate | III, The Elder Grove | The anchor quest (done) | — |
| 1 | Grapnel arms | Rocky | IV, Archway Isle | Gold + Rudder 1 + a fitting from a temperate vault | Landing range grows from ~40u to ~55u from shore |
| 2 | Coral flukes | Tropical | V, Sunken Temple Isle | Gold + Hull 2 + a fitting from a rocky vault | Drop anchor at up to 8 kn instead of 6 |
| 3 | Tempered chain | Volcanic | VI, Mount Cinderhorn | Gold + Keel 2 + a fitting from a tropical vault | Anchor holds in storms (see *Sea time while ashore* under Risks) |
| 4 | Ice spikes | Cold | VII, Frostspire | Gold + Hull 3 + a fitting from a volcanic vault | Anchor art becomes gilded, a visible trophy |

- **The loop:** exploring a biome turns up the fitting that opens the next
  one. The fitting spawns in the vault of the nearest island of the right
  biome only while the refit quest is active, using the Phase 4 retrieve
  mechanic. It is **never lost** in a wreck, like story items.
- **Refit quest:** works like the anchor quest. It is always tracked, takes
  no side-quest slot, and puts a search circle on the chart. The shipwright
  explains it when you can afford the hull or keel the tier needs.
- **On the boat:** each tier changes the anchor model at the bow, so you can
  see your progress.
- **Locked biomes** show *"Your anchor won't grip bare rock. Ask the
  shipwright."* (wording per biome) instead of the generic line.
- **Save:** `upgrades.anchor = 0–4`. `story.flags.anchor` stays as the
  original quest flag.

**Interplay with the main story:** Phase 4 moves journals III–VII into
landmark levels, so refit tiers become story gates too. That is deliberate:
finding a journal and refitting the anchor are the two halves of each
chapter. Difficulty still rises within a biome by distance from Port Haven,
so Archway Isle, the first rocky level most players reach, should be tuned
gentler than the rocky islands further out.

**Done when:** each landable biome needs its refit, refits are fitted at any
port, the anchor model changes per tier, and an old save with anchor `fitted`
starts at tier 0.

---

## Phase 7: A living sea (random ocean events)

The ocean should feel inhabited between islands. A small **event director**
rolls for an encounter every few minutes of sailing and places it ahead of
the ship, close enough to see but not in your path.

### Event director (`src/sea-events.js`)

- **Rolls** about every 3–6 minutes of sailing time, never while docking, in
  a race or during the rival's scenes. There's a cooldown so two events never
  overlap.
- **Weighting** by region (latitude, like `biomeFor`), time of day, weather
  and story progress. Rare events have a pity timer so everyone sees them
  eventually.
- **Placement:** 150–300u away, off the bow quarter, and never on an
  island. Events last 30–120 seconds, then dive, sail off or fade.
- **Seeded RNG of its own**, so it never touches the world's `rng()` stream
  (same rule as the wreck and camps).
- **"Witnessed"** means it came within ~80u, or you held it in the spyglass
  for 2 seconds. Better spyglasses can witness events from further away,
  which gives spyglass upgrades a second job.
- Emits `game.emit('sighting', { kind, x, z, day })` for quests and the log.

### Events

| Event | Where and when | What happens | Interaction |
| --- | --- | --- | --- |
| **Whale** | Temperate and cold, any weather but storms | Spout visible from far away, then a slow breach with a big splash | Sail alongside slowly to stay with it; it sounds with a tail-flip |
| **Dolphin pod** | Tropical and temperate, clear or breezy | 4–8 dolphins leaping in arcs | Sail fast (>12 kn) and they ride your bow wave, giving a small speed boost while they stay |
| **Ghost ship** | Any region, **night only**, likelier in fog, rare | A pale, see-through ship with green lanterns sails silently past | Follow it and it leads you somewhere (a hidden salvage spot); it fades at dawn or if you get too close |
| **Sea turtles** | Tropical, daytime | A slow line of turtles surfacing | Sail slowly through them without touching any |
| **Glowing bloom** | Warm waters, night | The sea glows blue around you, and your wake glows too | Visual only, a reward for sailing at night |
| **Waterspout** | Storms | A spinning column that drifts across the sea | A hazard to steer around; hull damage if you sail into it |
| **Iceberg calving** | Cold | A berg sheds a slab and leaves new floating ice | Visual, plus a short-lived collision hazard |
| **Message in a bottle** | Anywhere, uncommon | A glinting bottle bobbing on the swell | Haul it up: lore, a treasure hint, or a report quest |

Start with **whale, dolphins and ghost ship**. The rest can follow one at a
time.

### Sightings log

- A third Journal tab, **Sightings**, with a card per event kind: a drawing,
  how many times you've seen it and where you first did. Unseen kinds show as
  silhouettes with a hint (*"Seen on foggy nights"*).
- Milestones give cosmetics, e.g. a whale-tail pendant for five whales, or a
  lantern hat for the ghost ship.

### Report quests (new quest type `report`)

Seeing an event can start a quest to tell someone about it:

- **On first sighting** of a kind, or on any sighting a port has asked for,
  you get *"Report the whale sighting to the Cartographer at [port]. They're
  charting the migration."* Each event kind has a giver role that cares:
  - Cartographer: whales, turtles (migration routes)
  - Harbormaster: waterspouts, icebergs (hazard warnings)
  - Old Salt: the ghost ship (*"So she's sailing again…"*)
  - Merchant: dolphins (good luck for a trade run, so they pay for the news)
- **Which port:** the nearest port with that giver, so the reward depends on
  sailing there rather than on luck.
- **Stale news:** a report expires after a few in-game days. It takes no side
  quest slot, so it never crowds out board work.
- **Bounties:** boards can also post *"Sighting wanted: whales in the northern
  waters"*. While one is active, the director weights that event up in that
  area, and the map shows a search circle.
- **Hand-in** happens on docking, like other quests.

### Ghost ship side chain (later)

The ghost ship is a natural fit for the *"small authored side chains"* idea
in Phase 2. Seeing it three times unlocks a short chain: follow it to a hidden
cove, find the captain's log ashore, and learn why it can't make port. It can
use the same story engine as the journals.

### Ambient life

Cheap, always-on touches that don't count as events: gulls that follow the
boat near land, fish jumping in calm water, and seabirds circling over reefs.

**Done when:** whales, dolphins and the ghost ship appear with the right
weighting, the Sightings tab records them, a first sighting starts a report
quest that pays out at the right port, and events never stack up or appear
inside islands.

---

## Phase 8: The rival captain

A rival captain who keeps turning up, challenges you to races at sea and on
land, and has a story of their own that you piece together one encounter at
a time. It ends with you saving them from a kraken.

### Who they are (draft, open to change)

- **Captain Sable** (working name). About your age, sails alone in the
  *Redwing*, a fast ship with **crimson sails**, so you can recognise them
  from a long way off. The Redwing is rigged to match your own upgrades (and
  never worse than a Clipper Rig on an Oak hull), so she grows as your ship
  does.
- **The link to your story:** Sable's grandmother was your grandfather's
  great rival. The two of them raced each other across the isles for decades.
  Sable grew up on those stories and was raised to beat "the old captain's
  line". Now that the old captain is gone, you are the next best thing.
- **The mirror:** your grandfather learned too late that fame wasn't worth
  what it cost. Sable is still in the middle of that mistake: no crew, no
  home port (they sold the family house to buy the Redwing), and nothing but
  the next win. The rival story is the same lesson as the journals, seen from
  the outside, and this time you get to change the ending.
- **The tie-in:** one of the unsent letters in the epilogue sea chest is
  addressed to Sable's grandmother. Delivering it to Sable is what opens the
  final chapter.

Sable follows the main story's rules: the grandparents are never named (to
Sable, he's "your grandfather" or "the old captain"), and nothing assumes
the player's gender.

### Encounters

Encounters are gated like journals, by story chapter and upgrades, so Sable
keeps pace with you. **The story moves on whether you win or lose.** Winning
gives gold and a different line of dialogue, and the final chapter remembers
your record.

| # | Name | Where | Challenge | What you learn |
| --- | --- | --- | --- | --- |
| 1 | Crossed bows | Off Port Haven, after Journal I | Sable cuts across your bow and dares you to a short race to the point | Sable knows exactly who your grandfather was |
| 2 | Open water | Between two mid-range ports | A buoy race through 3 checkpoints, where reading the wind matters | The two grandparents raced each other for decades |
| 3 | King of the hill | A temperate island, ashore | Race Sable to the summit | Sable sails alone, with no crew |
| 4 | Fog run | Fog, rocky waters | A race through fog using the compass and spyglass | Sable sold their family home to buy the Redwing |
| 5 | Relic scramble | A tropical island, ashore | First to find 3 relics on the level | Sable has never once been back to their home port |
| 6 | Dismasted | After a storm, far out | No race: Sable's mast is down, and you tow them to port | Sable admits they don't know what they'd do if they stopped |
| Finale | The deep | A hand-placed deep-water trench | Rescue Sable from a kraken | — |

### The kraken (finale)

- **Trigger:** you've delivered the letter to Sable, and Sable has sailed
  off to the trench to prove something one last time. At dusk a distress
  flare goes up on the horizon, and the HUD tracks it.
- **No combat**, matching the rest of the game. The kraken is a set piece to
  survive, not a boss to beat:
  1. Tentacles rise around the trench. Each one is telegraphed by a dark
     shadow and bubbles a couple of seconds before it slams down. Steer
     through the gaps to reach Sable's ship.
  2. Come alongside and throw a line, using the haul interaction.
  3. Tow Sable out towards the shallows, where the kraken can't follow.
     Towing makes you slower, so the last stretch is the tense part.
  4. Optional: your lantern or a flare makes nearby tentacles flinch away,
     a nod to the ashore lantern.
- **Failure** sends you back to the edge of the trench with no hold loss.
  It's a story beat, not a punishment.
- **Ending:** story cards on the deck in the shallows. Sable reads the
  letter properly at last.
- **Reward:** Sable's crimson sail colour for your ship, a cosmetic (their
  hat), and a title. Afterwards Sable is a friend: they turn up at ports with
  a friendly line, and you can ask for a rematch on any race for gold.

### How it works

- **Delivery:** an encounter is a special event from the Phase 7 director,
  with top priority once its conditions are met. Ports also spread rumours
  (*"Crimson sails were seen off Archway Isle"*) that put a search circle on
  the chart. If you miss Sable, they turn up again later.
- **Sea races** (`src/race.js`): buoy checkpoints, a countdown, and a
  rival boat that uses the same boat physics with a simple steering AI
  that respects the wind. Rubber-banding is gentle. This needs `boat.js` to
  support a second, AI-controlled boat with its own livery.
- **Land races:** Sable follows the level's main route at a set pace and
  takes canned jump arcs, so they don't need the full character controller.
  Sable reuses the explorer rig with a fixed profile.
- **Dialogue:** hails appear as a banner when the ships are close, and
  bigger moments use story cards.
- **Save:** `rival: { chapter, wins, losses, flags }`.

**Done when:** all six encounters and the kraken finale can be played in
order, losing never blocks the story, the letter hand-off opens the finale,
and Sable stays on as a friend afterwards.

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
  sea-events.js        (P7) event director, event actors, sightings
  race.js              (P8) checkpoints, countdown, AI helmsman
  rival.js             (P8) rival chapters, conditions, the Redwing
  rival-text.js        (P8) Sable's dialogue and story cards
  tow.js               (P8) tow line between two boats
  kraken.js            (P8) finale set piece
  ashore/pacer.js      (P8) Sable on foot: summit race, relic scramble
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
| P6 | One refit per Phase 4 biome PR | P3, and that biome's Phase 4 work |
| P7 | `feature/living-sea` | P2a (report quests) |
| P8 | `feature/rival-captain` | P3, P7 (encounters come through the director), the epilogue letters, and the rival's text written and approved |

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
  storm could later drag the anchor and give you a timer. (Refit 3 could
  then be the fix: the anchor holds in storms.)
- **Refit order (decided 2026-11-23):** refits follow the story (rocky →
  tropical → volcanic → cold), so each one unlocks the next journal. The
  cost is that rocky, with its sheer ledges, comes before the gentler
  tropical biome, so the early rocky levels need tuning down.
- **Rival name and look (decided 2026-11-25, open to change):** Sable keeps
  the working name and is "they". Dark tricorn with a plume, crimson coat,
  black ship with crimson sails. The grandmother is "the captain of the
  crimson sails" and is never named.
- **AI boats (done):** `Boat` now takes options, so the Redwing is a
  second boat with its own livery and no lights, sailed by `AutoHelm` in
  `race.js`.
- **Event frequency:** too many events make them wallpaper. Start rare,
  then tune from playtests.
