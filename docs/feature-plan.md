# Tidewake feature plan

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

This file holds the designs for phases that **haven't shipped yet** (4-7).
What is done, what's next and known issues live in [STATUS.md](STATUS.md).
The designs of shipped phases (0-3 and 8) moved to
[shipped-plans.md](shipped-plans.md).

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

### Phase 4 in smaller PRs

Phase 4 is too big for one PR. It ships as the pieces below, in this order.
Each one is playable on its own and leaves `main` working.

Two rules hold for every piece:
- **A biome PR ships with its anchor refit** (Phase 6), so the biome is
  gated the moment it can be landed on.
- **A landmark PR also rebuilds that landmark's sea view** to the standard
  of the Elder Tree (`src/elder-tree.js`): a detailed, hand-built model that
  reads from far off and has life in it (movement, weather of its own,
  something at night). Today the other four are a few props: ten pillars, one
  arch, some smoke puffs and extra ice.

| PR | Branch | What it adds | Depends on |
| --- | --- | --- | --- |
| 4.0 | (done, #20 and the retrieve quests) | The Elder Tree at sea; the vault; retrieve quests and the map fragment | P3 |
| 4.1 | (done, #33) | The Elder Grove as a walkable level: beach, old wood, roots and vault, the trunk spiral, the owl hollow, the owl bough, the crown. No story yet: Journal III stays at the camp | 4.0 |
| 4.2 | (done, #34) | The note in the tent, Journal III at the carving, the flower crown in the crown chest, the owl guide and its hoot, fireflies at night. Chapter III points at the level | 4.1 |
| 4.3 | (done, `feature/anchor-refits`) | The refit system (Phase 6): `upgrades.anchor`, the shipwright's refit quest, the fitting at a vault, the anchor model per tier, the per-biome "can't land" lines. No new biome yet | 4.0 |
| 4.4 | `feature/rocky-biome` | Rocky islands (sheer ledges, arches, sea-stack hops) and the grapnel refit, tier 1 | 4.3 |
| 4.5 | `feature/archway-isle` | Archway Isle: the cliff traverse, Journal IV, the fur hood; the great arch rebuilt at sea | 4.4 |
| 4.6 | `feature/tropical-biome` | Tropical islands (palm-top hops, tide pools, rope bridges) and the coral flukes, tier 2. Sable's relic scramble moves here | 4.3 |
| 4.7 | `feature/sunken-temple` | The Sunken Temple: flooded ruins, Journal V, the shell necklace; the temple rebuilt at sea | 4.6 |
| 4.8 | `feature/volcanic-biome` | Volcanic islands (lava, crumbling basalt) with the steam-vent launch, and the tempered chain, tier 3 | 4.3 |
| 4.9 | `feature/mount-cinderhorn` | Mount Cinderhorn: the crater descent, Journal VI, the gold circlet; the volcano rebuilt at sea | 4.8 |
| 4.10 | `feature/cold-biome` | Cold islands (ice that slides, snow pines, wind gusts) and the ice spikes, tier 4 | 4.3 |
| 4.11 | `feature/frostspire` | Frostspire: the vertical climb, Journal VII, its cosmetic; the spire rebuilt at sea | 4.10 |
| 4.12 | `feature/ashore-critters` | Crabs that bump you back and gulls that swoop, on every biome | any biome |

Notes:
- 4.1 and 4.3 don't touch the same files, so they can be built side by side.
- Which cosmetic goes with which landmark (after the flower crown) is a
  suggestion, to be settled in each landmark's design.
- Each landmark gets a short design file like
  [elder-grove-level.md](elder-grove-level.md) before it is built.
- 4.12 can land any time after 4.4; it is last because nothing waits on it.

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
| P4 | Thirteen smaller PRs: see *Phase 4 in smaller PRs* | P2, P3 |
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
