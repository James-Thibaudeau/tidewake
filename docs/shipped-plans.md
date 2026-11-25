# Tidewake: plans that have shipped

The original designs for phases that are now built (0-3 and 8, and the
look-dev gallery), kept for
reference: the reasoning behind the data model, the story and its writing
rules, and the ashore level rules. The code is the source of truth where the
two disagree. Current state is in [STATUS.md](STATUS.md); designs for work
still to come are in [feature-plan.md](feature-plan.md).

Contents: [How the codebase fitted](#how-the-codebase-fits-what-we-build-on) ·
[Phase 0, foundations](#phase-0-foundations-one-pr-no-visible-feature) ·
[Phase 1, character customization](#phase-1-character-customization) ·
[Phase 2, quests and the main story](#phase-2-quest-system-sea-only-quest-types) ·
[Phase 3, going ashore](#phase-3-going-ashore-core-loop-one-biome) ·
[Phase 8, the rival captain](#phase-8-the-rival-captain) ·
[The look-dev gallery](#tooling-the-look-dev-gallery) ·
[File plan](#file-plan)

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

## Tooling: the look-dev gallery

Not a game feature: a page for looking at the art. Proposed and built
2026-11-25.

**Why.** Every shape and colour is numbers in code, and the only way to see
one was to play to it: start a voyage, get to the place, take a screenshot
from wherever the camera is. `tools/check.mjs` answers in a second for
logic; nothing did that for looks. Outfits showed the cost most: 37 styles on
one body, each fix checked against the few combinations someone thought to
try, so `outfits.js` needed four fit passes.

**What was built.** A separate `gallery.html` beside `index.html`, with its
code in `src/gallery/`. It imports the game's modules and builds its own
small scene, so the game is untouched (no game file changed) and there is
still no build step.

- **One subject at a time,** picked in the URL so a view can be linked and
  reloaded: `?show=outfit&top=coat&extra=satchel`, `?show=ship&tier=4`,
  `?show=prop&id=camp`, `?show=grove&kind=fungus`.
  - Subjects: `outfit` (the explorer), `ship` (by upgrade tier, or the
    Redwing), `prop`, `tree` (the Elder Tree), `wreck`, `grove` (the level,
    or one piece), `level` (a generated island by biome and seed, or one
    piece).
- **Fixed cameras:** `front`, `quarter`, `side`, `back`, `rear` and `top`
  frame the subject; `sail` and `foot` are the game's own lens and distance
  (small details vanish there); `face`, `helm` and `bow` are close-ups.
- **Lighting presets:** `noon`, `sunset`, `night`, `overcast`. They set a
  time of day and a weather and let `sky.js` do the rest, so the gallery
  can't drift from the game's look. The ocean and the effects (`?fx=`) are
  the game's own too.
- **Poses** for the explorer: `stand`, `walk`, `run`, `jump`, `fall`;
  `phase` holds a stride at one point. The helm pose is seen on a ship.
- **Contact sheets:** `?sheet=tops-back` and the like draw a grid into one
  image, such as every top with every bag from behind. A sheet takes the
  parameters already in the URL, so it can be narrowed (`&bottom=skirt`).
- **Console helpers** on `window.gallery`, in the style of `tidewake.debug`:
  `show()`, `set()`, `view()`, `light()`, `sheet()`, `step()`, `frame()`,
  `state()`, `list()`. They work in a hidden preview tab.
- **Mistakes are reported, not guessed:** an unknown style, view or
  parameter shows as a warning in the caption and in `state()`.

**Decisions.**
- Subjects are built by the game's own builders (`Explorer`, `Boat`,
  `propMesh`, `generateLevel`…), never copies. None of them needed a `Game`:
  `fx.update` is handed a small stand-in for the fields it reads.
- Every show starts from time zero with the same sky, and the explorer's
  idle glances are turned off, so two screenshots of the same URL match and
  a before/after pair shows only the change.
- `tools/check.mjs gallery` checks that the page's import map matches the
  game's, that the game never imports the gallery, and that every sheet asks
  for styles, views, lights and poses that exist.

What is left (live sliders, a shot list, before/after in one image) is in
[feature-plan.md](feature-plan.md).

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
