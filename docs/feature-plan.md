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

This file holds the designs for phases that **haven't shipped yet** (4, 6,
7, 9, 10 and 11),
plus what is left of one piece of tooling, the look-dev gallery.
What is done, what's next and known issues live in [STATUS.md](STATUS.md).
The designs of shipped phases (0-3, 5 and 8) moved to
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
| 4.3 | (done, #35) | The refit system (Phase 6): `upgrades.anchor`, the shipwright's refit quest, the fitting at a vault, the anchor model per tier, the per-biome "can't land" lines. No new biome yet | 4.0 |
| 4.4 | (done, #37) | Rocky islands (sheer ledges, arches, sea-stack hops) and the grapnel refit, tier 1 | 4.3 |
| 4.5a | (done, #39) | Archway Isle as a walkable level: the U-shaped island, the cliff traverse round the bay, the storm cave vault, the seaward stack; the great arch rebuilt at sea. No story yet | 4.4 |
| 4.5b | (done, #45) | Archway Isle's story: Journal IV at the keystone, the sou'wester, the storm lantern; the crab report quest and the crab pin | 4.5a |
| 4.6 | `feature/tropical-biome` | Tropical islands (palm-top hops, tide pools, rope bridges) and the coral flukes, tier 2. Sable's relic scramble moves here | 4.3 |
| 4.7 | `feature/sunken-temple` | The Sunken Temple: flooded ruins, Journal V, the shell necklace; the temple rebuilt at sea | 4.6 |
| 4.8 | `feature/volcanic-biome` | Volcanic islands (lava, crumbling basalt) with the steam-vent launch, and the tempered chain, tier 3 | 4.3 |
| 4.9 | `feature/mount-cinderhorn` | Mount Cinderhorn: the crater descent, Journal VI, the gold circlet; the volcano rebuilt at sea | 4.8 |
| 4.10 | `feature/cold-biome` | Cold islands (ice that slides, snow pines, wind gusts) and the ice spikes, tier 4 | 4.3 |
| 4.11 | `feature/frostspire` | Frostspire: the vertical climb, Journal VII, the fur hood; the spire rebuilt at sea | 4.10 |
| 4.12 | `feature/ashore-critters` | Crabs that bump you back and gulls that swoop, on every biome | any biome |

Notes:
- 4.1 and 4.3 don't touch the same files, so they can be built side by side.
- Which cosmetic goes with which landmark (after the flower crown) is a
  suggestion, to be settled in each landmark's design.
- Each landmark gets a short design file like
  [elder-grove-level.md](elder-grove-level.md) before it is built. Archway
  Isle's is drafted: [archway-isle-level.md](archway-isle-level.md).
- 4.12 can land any time after 4.4; it is last because nothing waits on it.

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

**Shipped** (see [STATUS.md](STATUS.md)): all of it. What was built differs
from the text below in a few places: bounties need the kind's own hour and
weather; a bottle's first message is a letter to carry, then charts and
notes; the ghost ship's chain leads to an island you can already land on
(there is no hand-built cove); and Sable's encounters keep their places and
only take their moment from the director. The link to Phase 9's sea zones
waits for Phase 9.

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
- **The first one has shipped:** Archway Isle (4.5b) has a one-off report
  quest, the upside-down crabs under the arch, reported to a naturalist (see
  [archway-isle-level.md](archway-isle-level.md)). It lives in
  `src/reports.js`: `sight(kind, at)` starts a report, kept in
  `state.quests.reports`, and it emits `sighting`. Phase 7 builds on that
  instead of starting it.

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

## Phase 9: Sea zones (calm home waters, rough far waters)

Today the sea is the same everywhere. There is one weather for the whole
world, and the waves only change with it, so reaching Frostspire feels like
reaching anywhere else. This phase gives the map a shape you can feel at the
helm:
- **home waters** that are clear, shallow and safe;
- **open sea** further out, where storms come more often;
- **rough water** round the hardest places to reach, rough even under a
  clear sky.

Goals:
- Leaving home feels like leaving home: first the water changes colour, then
  the weather gets worse.
- Reaching Frostspire is an event. You see the white water from far off, you
  get ready, and you're relieved to come through it.
- Rough water tests how you sail, not only what you've bought. A starting
  hull can cross the Frostspire Reach if it is sailed well. A maxed hull
  still takes real damage if it is sailed carelessly.

### Bands and zones

Distances are from Port Haven (0, 0). Every landmark is 5,000–6,000u out,
so all of them sit in the open sea.

| Where | Water | Storms |
| --- | --- | --- |
| **Home waters**: within ~1,000u, fading out over ~400u | Clear and shallow: turquoise, with sand and ripples showing below. Waves half as big | Never start here. A storm that is already blowing breaks up soon after you arrive |
| **Coastal sea**: ~1,000–3,500u | As today | As today |
| **Open sea**: beyond ~3,500u | As today, a shade darker | Rain and storms come about twice as often and last longer |
| **Rough water**: named zones round the far landmarks | Tall swells and heavy chop in any weather, and rogue waves | As open sea. A storm on top makes it the worst water in the game |

### Home waters (the shallows)

- **Look, shader only** (`ocean.js`). A `shallowK` factor (1 inside, 0
  past the fade) mixes the deep colours (`uDeep`, `uMid`, `uTrough`)
  towards turquoise and draws a fake seabed under the surface: sand, ripple
  bands and slow caustic lines. The seabed pattern is offset by the view
  direction times a pretend depth, so it slides under the water like real
  depth. No seabed geometry. Foam and wave faces stay on top, so it is still
  the same cel-shaded sea. The effect fades with distance from the camera:
  far water stays opaque.
- The edge is a lumpy bank, not a perfect circle.
- **Waves** are half as big inside (wave scale and swell × 0.5, on the CPU
  and the GPU; see *Waves that change by place*).
- **No grounding:** the shallows are only a look. Ground stays where the
  terrain is.
- Grandfather's wreck sits near Port Haven, so it is inside the shallows.
  Check it still reads well there.
- Phase 5 built the weaker version of this for every shore: paler water
  over the shallows round each island and reef, from a map of the world's
  shores (`shoreMap` in `ocean.js`). Home waters are the stronger,
  see-through version, and should start from that map and its `shoal`
  factor rather than add a second one.

### Storms by distance

The weather stays one state machine for the whole world (`Weather` in
`weather.js`): the sky, rain and light are one scene. What changes is how it
picks the next state. The pick is weighted by the band the boat is in when
the timer runs out.

- **Home waters:** never pick `storm`; rain is half as likely. This is the
  general version of today's `calmTimer`, which keeps the first 5 minutes of
  a new voyage calm. Keep `calmTimer` for the prologue.
- **Coastal sea:** today's table (`NEXT`).
- **Open sea and rough water:** storm and rain weights × 1.5; a storm lasts
  120–220 s instead of 80–170 s. Fog is likelier in the Frostspire Reach.
  (As built in 9.1. The first plan was × 2, but with the longer storms that
  measured 21% of the time in a storm against the coast's 7.7%, nearer
  three times than the "about double" below; × 1.5 gives 16%. The numbers
  are `BANDS` in `sea-zones.js`.)
- **Storms blow out at home:** sail into home waters during a storm and its
  timer drops to at most 40 s, then it eases to rain or overcast. The swell
  there is already halved, so the relief is immediate. Running for home in a
  storm becomes a real choice.
- **Targets**, measured by a test pilot sailing for a long time in each
  band: the share of time spent in a storm is about 0% at home, today's
  rate on the coast (measure it first), and about double that in the open.

### Rough water

Named zones round the hardest landmarks to reach. Each is a ring: rough
water in a band, with a calmer pocket round the island so you can land,
anchor and catch your breath.

| Zone | Round | Severity | Ring, from the island's centre | Character |
| --- | --- | --- | --- | --- |
| **The Frostspire Reach** | Frostspire (radius 300) | 3 | Rough from 600u to 1,500u, worst near 900u | Tall cold swells, rogue waves, ice growlers, fog more often |
| **The Cinder Rip** | Mount Cinderhorn (radius 330) | 2 | Rough from 600u to 1,200u | Steep chop, gusts that swing the wind, steam on the water |
| **The Outer Swell** | The last ~600u before the world-edge current | 1 | A band along the edge | Long heavy swells: a sign you are near the edge |

- **Danger follows the story**, like the refits: the Reach guards the last
  chapter (VII), the Rip the one before it (VI).
- **No zone** at Archway Isle (the first rocky level, tuned gentle), the
  Elder Grove or the Sunken Temple, for now. Adding a zone is one row in the
  table.
- **Severity** scales every effect below: the wave and swell boost, the
  damage and how often rogue waves come.

**From outside, you can see it.** The band shows as a pale, broken line on
the horizon: whitecaps, darker water and flying spray, well before you reach
it. Once charted, the chart draws the band hatched, with its name. Sailing
in shows the name like a discovery: *"The Frostspire Reach"*.

**At the helm:**
- **Swell in any weather.** The swell inside is at least a floor set by
  severity (about 0.5, 0.8 and 1.1, where a full storm is 1.0), so the
  existing bow slams (`checkBowSlam`) fire under a clear sky.
- **A steady battering**, like a storm's, and less with the sails reefed.
  It is resisted differently, though. Storms use `1 - keel`, so a max keel
  (0.93) makes storms almost harmless. Rough water uses `1 - keel × 0.5`, so
  a max keel only halves it and the hull's strength does the rest. That is
  what keeps it treacherous for a maxed ship. The hull becomes the rough
  water stat; the keel stays the storm stat.
- **Rogue waves** (9.3): one every 20–40 s in the Reach, rarer at lower
  severity. Each is announced: a warning (*"Big wave off the port bow!"*), a
  sound, and a tall dark crest rising for about 4 s before it arrives. Meet
  it bow-on with reefed sails and it costs a little. Take it side-on or
  under full sail and it costs a lot, shoves you sideways and rolls the
  camera. This is where skill beats upgrades. The wave is one moving ridge
  added to `waveHeight`, so the boat rides it like any other wave.
- **Ice growlers** (9.3, the Reach only): small chunks of floating ice
  drifting in the band. Hitting one is a rock strike (the existing collision
  damage). Easy to steer round in clear weather, hard in fog.
- **Warnings:** *"Rough water: reef your sails"* under full sail, *"Rough
  water: hull taking a beating"* otherwise.
- **Wrecking** there works as anywhere else: back to your last port, cargo
  lost. The calm pocket doesn't repair the hull; ports do.

**Damage targets**, for one crossing of the Reach straight through its worst
part, in clear weather. The test pilot tunes to these.

| Boat | Sailed well (reefed, bow-on to rogue waves) | Sailed badly (full sail, side-on) |
| --- | --- | --- |
| Starting hull, no keel (100) | 35–50% of the hull | Wrecked |
| Hull 3 and keel 2 (about what landing at Frostspire needs) | 20–30% | 60–80% |
| Max hull and keel (600) | 10–15% | 35–50% |

So a starting boat can get in, chart Frostspire and get out again only with
no mistakes and no storm. A maxed boat gets through comfortably if sailed
well, but a careless run still costs half the hull.

### Waves that change by place

- **A new pure module, `src/sea-zones.js`** (no three.js, no DOM): the zone
  table, `bandAt(x, z)` (home, coastal or open) and `seaAt(x, z)` → `{
  shallow, rough, severity, zone }`, with smooth fades. Zone centres come
  from the landmark islands, looked up by their `landmark` key after the
  world is built. Nothing draws from the world's `rng()`, so the world
  doesn't change.
- **`waveHeight` gets a factor per point** in `waves.js`: the wave scale and
  swell are multiplied, and the swell floored, by what the zones say at that
  point. The CPU and GLSL versions are generated from the same table, as the
  waves already are. The zones reach the GPU as a small uniform array (up to
  8). This is the same idea as `uCalm` in `ocean.js` (still water in a
  moat).
- **Wide fades** (at least 200u), so the boat's motion never jumps and the
  water shows no seam.
- **Cost:** the ocean samples the waves five times a pixel. Work out the
  zone factor once per pixel and once per vertex and pass it in, rather
  than once per sample. Measure on Low. The CPU only asks at the boat, the
  Redwing and floating props, so its cost is tiny.
- Shore foam and the other wave-aware materials include `WAVE_GLSL`, so they
  follow along. Check the shore foam round Frostspire.

### How it fits with the rest

- **Refits:** the ice spikes (tier 4) need Hull 3, so a player who can land
  at Frostspire has a boat that can cross the Reach with care. Going earlier
  just to chart it is possible, at real risk. That's the point.
- **Story:** chapter VII can mention the Reach (*"the water round the spire
  never sleeps"*). Text goes in `story-text.js`, reviewed like the journals.
  The shipwright gets a line about it when you buy Hull 3.
- **Rival:** race courses (`race.js`) and the kraken trench stay out of
  rough water and home waters; add that to the course planner's checks.
  Sable could later race you *through* the Reach, as a written encounter.
- **Phase 7 events:** the director reads `seaAt`. Waterspouts are likelier
  in rough water; turtles and the glowing bloom look best in the clear home
  shallows.
- **Treasure** and salvage inside rough water are worth more (× 1.5), so
  there's a reason to go in besides the landmark. Optional; tune after.
- **Ashore:** the anchored ship stays safe, as today. You land from the calm
  pocket.
- **Save:** nothing new. The chart's hatching comes from the fog-of-war
  cells you've already charted.

### Checks and tools

- **`tools/check.mjs`** gets a `seazones` group (the module is pure):
  - home waters contain Port Haven and grandfather's wreck;
  - every rough zone's calm pocket holds its whole island plus landing
    range;
  - no rough zone covers a port;
  - every rough zone has a port within ~2,000u of its outer edge, so you
    can repair before and after the run. If one doesn't, move the zone,
    never a port: moving islands changes the world;
  - the generated GLSL includes the zone code, and the CPU and GLSL tables
    match.
- **`tidewake.debug.zone()`** reports the band, the zone and the factors at
  the boat (built in 9.1; `debug.sea()` is Phase 7's, for spawning sea
  events). `debug.teleport('Frostspire')` and `debug.weather('storm')`
  already exist.
- **Gallery:** a `zone` parameter for any subject at sea, `zone: 'shallows'
  | 'bank' | 'coastal'` (built in 9.1, with the `shallows` and `sea-zones`
  sheets), then `'rough'` and `severity` in 9.2, and a sheet of all of them
  under every light. The shallows are judged there, not in the game.

### Phase 9 in smaller PRs

| PR | Branch | What it adds | Depends on |
| --- | --- | --- | --- |
| 9.1 | `feature/home-waters` | `sea-zones.js` with the bands; storms by distance; storms blow out at home; the clear shallows and calmer waves at home, judged on the gallery's `sea` sheets | — |
| 9.2 | `feature/rough-water` | The Reach, the Rip and the Outer Swell: waves by place, swell floor, damage, warnings, the name on entering, chart hatching; races and the kraken kept out | 9.1 |
| 9.3 | `feature/rogue-waves` | Rogue waves, ice growlers in the Reach, and tuning to the damage targets | 9.2 |

- Phase 5 retuned the wave set (`WAVE_DEFS`) and measured how the boat
  rides it. Waves by place start from that table; `node tools/check.mjs
  ride` holds pitch and bow slams to today's numbers, so extend it with a
  case for each zone.
- 9.1 is worth doing early: it makes the first minutes of the game prettier
  and safer.

**Done when:** home waters are clear and calm, and storms neither start nor
last there; storms are measurably more common far out; the Frostspire Reach
can be seen from outside it, a starting boat sailed well can cross it, and it
still costs a maxed boat real hull; the test pilot hits the damage targets;
and the world itself hasn't moved.

---

## Phase 10: Things worth buying at the end

Late in the game, gold has nowhere to go. Every upgrade together costs about
23,600, the refits 1,750 and everything at the Tailor about 1,200. After
that, the only thing left to buy is repairs. Meanwhile quests and treasure
keep paying 60–400 a time.

This phase adds three things to spend on, each a different size:
- **Restoring grandfather's ship:** one long project you work towards, with
  a story ending.
- **The paint yard:** your ship's look, bought a piece at a time.
- **Fireworks:** small, repeatable fun.

Rules for all three:
- **Nothing makes the ship stronger.** Upgrades stay the only stats, so the
  sea zones' damage targets (Phase 9) and the story's soft gates still
  hold.
- **What you see is what you paid for.** Every purchase shows on the ship,
  at Port Haven or in the sky.
- **Prices follow measured income.** Before tuning, log the gold earned per
  hour in late-game play. Set the restoration's total at about 5–8 hours of
  that. The numbers below are starting points.

### Restoring grandfather's ship

Grandfather's ship lies wrecked on the rock just past the point, where the
game begins. The epilogue ends with Grandma saying *"Just remember to come
home."* This project lets you bring *him* home: raise his ship, rebuild her
at Port Haven and sail her again.

**When it opens:** after the epilogue (the chest's letters read). The
shipwright at Port Haven brings it up the next time you dock: *"I've been
looking at her from the harbor wall for years. She's not as broken as she
looks."* It is tracked like the refit quest: no side-quest slot, always on
the tracker.

**Stages.** Each stage costs gold at Port Haven's shipwright, and most also
need something brought from out in the world, using the Phase 4 retrieve
mechanic: it waits in a landmark's vault while that stage is active, and is
never lost in a wreck.

| Stage | What happens | Gold | Brought from |
| --- | --- | --- | --- |
| 1. Raise her | Barrels and a salvage crew float her off the rock; she is towed into a slipway beside Port Haven's dock | 2,000 | — |
| 2. Mend the hull | New planks over the broken back; the stern section is joined back on | 4,000 | Oak heartwood from the Elder Grove |
| 3. A new keel | A new keel is laid under her, and she sits upright in the slipway | 4,000 | Iron bolts from Archway Isle's storm cave |
| 4. Step the mast | A new mast and yards; her old figurehead goes back on the bow | 5,000 | Her figurehead, from the Sunken Temple |
| 5. Sails and rigging | Canvas, rope and her flag | 5,000 | Sailcloth from Mount Cinderhorn's traders' cache |
| 6. His cabin | The cabin restored: bunk, chart table, his lamp | 3,000 | His logbook's last page, from Frostspire |
| Launch | The slipway scene (below) | — | — |

About 23,000 in all: roughly what the upgrades cost, spent again on
something that isn't a stat. The items are suggestions, to settle with each
landmark's design. A stage whose landmark isn't walkable yet asks for gold
only.

**Seeing it happen:**
- **At sea:** once raised, the wreck site keeps only its rocks, with a buoy
  where she lay. In the slipway at Port Haven you can see each stage from
  the water as you sail in: bare ribs, a planked hull, the mast, sails
  furled, the cabin lamp lit at night.
- **The walkable wreck** (the first ashore level, `ashore/wreck.js`) is
  only needed before the epilogue, so raising her retires it. The rocks stay
  as a small landing spot with a plaque.
- **Each stage ends** with a short card in the journal's voice, read from
  the cabin: what he wrote about this part of her. The text goes in
  `story-text.js`.
- **Writing rule:** his ship is never named, like the grandparents. The
  nameboard on her stern stays blank. At the launch, Grandma explains why:
  *"He said a name was for a ship that might not come back."*

**The launch:** with stage 6 paid for, the next dock at Port Haven plays a
scene: the harbor gathers, Grandma breaks a bottle on the bow, she slides
down the slipway, and the town sets off fireworks (see below). Then you sail
her once round the point at sunset with Grandma aboard, past the rock where
she lay.

**Afterwards: she is yours to sail.**
- At Port Haven's shipwright you can switch between your own ship and his.
  She takes **your current upgrades**, so she is never stronger or weaker.
  The choice is a look and a feeling, not stats.
- Grandma waves from the dock when you sail in on her.

**Her model: bigger and grander than any tier.** She has to look special
next to even a maxed ship.
- **How:** a hull style in `boat/model.js`, built from the wreck's lines
  (`ashore/wreck.js`), made whole. Switching ships swaps the hull style, so
  everything already built on the boat keeps working: the rig, the sails,
  the explorer at the helm, the anchor, the livery and the wake.
- **Size:** `sizeScale` 1.4, against 1.25 for the largest tier (the
  Leviathan Flagship, `SIZE_SCALE` in `boat/parts.js`).
- **Ornate:**
  - a raised stern castle with his cabin's gallery windows, lit at night;
  - carved and gilded scrollwork along the rails and round the stern;
  - her own figurehead, the one brought back from the Sunken Temple;
  - always a bowsprit;
  - a small mizzen mast aft, just for looks;
  - a brass bell by the helm, his lantern at the stern;
  - a long red pennant like his scarf;
  - the pressed-flower emblem from Grandma's book on the mainsail.
- **What stays yours:** your sail tier still sets the sail size and cloth,
  and your upgrades set every stat. The mizzen sail doesn't add speed.
- **Paint:** her default colours are his: dark varnished wood and cream
  trim. The paint yard works on her as on any ship, and each ship keeps its
  own livery. Her figurehead can be swapped like any other.

**What being bigger touches.** `sizeScale` already scales the terrain
probes (`boat.js`), the wake, where the explorer stands, the tow line
(`tow.js`) and how close Sable sails (`rival.js`). So most of it follows by
itself. Check:
- **Tight water:** she is bigger, so narrow gaps are tighter: Archway Isle's
  bay, the sea arch and the reefs. That's a fair trade for the look, but
  every landmark approach and the kraken trench must still be passable.
- **Docks:** she has to fit at every port without poking through the pier.
  Scale the berth offset with `sizeScale` if needed.
- **Camera:** the sailing camera pulls back in proportion, as it should
  already for hull 4–5.
- **Landing and hauling:** distances are measured from the boat's centre,
  so a bigger hull puts its edge closer to the shore. Check that the landing
  and treasure prompts still feel right.
- **Gallery:** `gallery.show({ show: 'ship', hull: 'his', view: 'sail' })`
  and a `his-ship` sheet: every view and every light, beside hull 5 for
  scale.

**Save:** `restore = { stage: 0–7, ship: 'own' | 'his' }`, added the usual
three ways (`freshState()`, `migrate()`, `continueGame()` /
`savePortState()`). Stage 7 means launched.

### The paint yard

A **Paint yard** section on the shipwright's tab, with a side view of your
ship that updates as you pick. The ship can already be repainted: Sable's
Redwing uses `setLivery({ hull, trim, deck, sail, flag, pennant, emblem })`
in `boat/rig.js`, and Sable's reward, the crimson sail dye, is one use of
it. The paint yard turns that into a shop.

**What you buy:**

| Kind | Examples | Price each |
| --- | --- | --- |
| **Paints** for hull, trim and deck | Harbor blue, sea green, mustard, whitewash, tar black, cherry red | 200–600 |
| **Sail cloth** | Cream, sky blue, rose, sunset orange, striped | 400–1,000 |
| **Sail emblems** | Compass rose, anchor, owl, crab, wave, star | 500–1,200 |
| **Flags and pennants** | Plain colours, chequered, swallowtail | 150–400 |
| **Figureheads** | Mermaid, dolphin, owl, sea serpent, the gilded eagle (today's) | 1,500–3,000 |

- **Bought once, used for good:** like the Tailor, you buy a paint or an
  emblem once, then put it on any part as often as you like for free. That
  keeps trying looks fun.
- **"Tier default"** stays as a choice for every part, so a painted ship
  can go back to its tier's look. Parts you never touch keep following the
  tier, as `applyColors()` does now.
- **Earned paints:** a few can't be bought, only unlocked, then they're
  free:
  - **crimson** sail cloth (Sable's reward, already in the game);
  - **gold leaf** trim, for charting every island;
  - **kraken ink** hull, for the tow out of the Deep;
  - the **owl** emblem, from the Elder Grove's owl.

  Their tiles show how to earn them, like locked clothes do.
- **Figureheads** sit where today's gilded eagle goes at hull 2 and up.
  Below hull 2 there's no bow to put one on, so the shop says so.
- **The crimson dye moves here.** Today it is a toggle in `rival.js`
  (`flags.dye`, `flags.dyeOn`). It becomes an owned sail cloth in the
  paint yard; `migrate()` turns `dyeOn` into a crimson sail.

**Save:** `paints: []` (owned ids) and `livery: { hull, trim, deck, sail,
flag, pennant, emblem, figurehead }` (each a paint id or null), added the
usual three ways. With grandfather's ship, each ship keeps its own livery.

**Gallery:** the `ship` subject takes the livery parameters
(`gallery.show({ show: 'ship', tier: 4, hull: 'harbor-blue', emblem: 'owl' })`),
plus two sheets: `paints` (every hull paint on tiers 0, 2 and 4) and
`figureheads` (every figurehead, bow view).

### Fireworks

Something to set off from your ship, for no reason except that it's fun,
and best at night.

**Buying:** a **Stores** section on the shipwright's tab.

| Item | What you get | Price |
| --- | --- | --- |
| Box of rockets | 6 single bursts in mixed colours | 120 |
| Festival crate | 20 rockets and 4 specials | 450 |
| Grand finale | One long show: about 30 seconds, 40 shells | 1,500 |

**Shells:**
- **Kinds:** peony (a round burst), willow (gold trails that droop),
  crossette (splits in four), ring, and crackle (glitter and pops).
- **Specials:** a heart, a star, an owl's face, and Sable's crimson wing
  (earned with the crimson dye).

**Setting them off:**
- Press **F** while sailing or anchored (a button on touch). The rocket goes
  up from the stern and bursts about 60 m up.
- The **Grand finale** runs by itself once lit. You can keep steering.
- **Carrying:** you hold up to 40 shells. They aren't lost in a wreck.
  Ruining something fun as a punishment isn't worth it.

**How it looks and sounds:**
- **Look:** GPU point sprites, additive, bright enough to bloom (use
  `glowBoost` as Sable's flare in `rival.js` does). The burst briefly
  colours the sea below it, the way lightning flashes it now. The trails
  drift with the wind.
- **Sound:** procedural, in `audio.js`: a whoosh going up, then the boom
  late by the distance, as the thunder is.
- **Daytime:** they still work, just paler. Smoke puffs read better than
  sparks then.
- **Low quality:** fewer sparks per shell, and one show at a time.

**Who notices:**
- **Sable:** if she's in sight, she sometimes answers with one of her own.
  That's a few lines in `rival-text.js`.
- **Ports:** set one off by a port at night and you get a cheer, and a one-time toast
  per port.
- **The launch** of grandfather's ship ends with the town's own show: a
  free Grand finale that doesn't come out of your hold.

**Save:** `fireworks: { rocket, special, finale }`, counts, added the usual
three ways.

**New file:** `src/fireworks.js` (shells, sparks, the finale's timing),
hanging off `game.fireworks`. The gallery gets a `fireworks` subject that
holds each shell at its peak, so they can be judged one at a time.

### Phase 10 in smaller PRs

| PR | Branch | What it adds | Depends on |
| --- | --- | --- | --- |
| 10.1 | `feature/paint-yard` | The paint yard: paints, cloth, emblems, flags, figureheads, earned paints; the crimson dye moved in; gallery sheets | — |
| 10.2 | `feature/fireworks` | Stores, rockets, specials and the finale; the sea flash; Sable's answer | — |
| 10.3 | `feature/restore-ship` | The restoration quest and its six stages at the slipway; the wreck site retired; the stage cards | The epilogue (done); landmark items as each landmark ships |
| 10.4 | `feature/his-ship` | His ship as a hull style (bigger and more ornate than any tier); the launch scene with the town's fireworks; the sail with Grandma; switching ships at Port Haven | 10.2, 10.3 |

- 10.1 and 10.2 touch different files and can be built side by side. Both
  add a section to the shipwright's tab, so agree on its layout first.
- 10.1 is the quickest win: most of the parts already exist.

**Done when:** a late-game captain has something worth saving up for; the
paint yard's choices show on every hull tier and on his ship; fireworks
work at sea and at anchor, day and night, on Low; his ship is raised,
rebuilt stage by stage in sight of the harbor, launched and sailed; and no
purchase changes a stat.

---

## Phase 11: Islands with shapes

Today every island but one has the same shape: a lumpy circle. The coast
comes from `edgeFactor` in `world.js`, which gives a radius for each angle,
so an island can be fatter on one side but can never be a crescent, a ring
or a hook. Archway Isle is the exception. A bay cut into it (`bayFor`,
`baySdf`) makes it a U you sail into, and that one change is why you
remember it from the sea and on the chart. This phase gives the other
islands a mix of shapes (crescents, rings, coves, twins, hooks and more), so
the archipelago has variety. The point is variety, not shapes that match
names, though a name that fits can pick its shape (Moon Island becomes a
crescent).

Goals:
- You can tell islands apart by their outline on the chart and their
  silhouette from the deck.
- **Variety, spread out.** Wherever you sail, the islands in sight look
  different from each other.
- **Shapes make places to sail**, not only things to look at: lagoons, coves
  and the bowl of a crescent that you can sail into, anchor in and land
  from.
- **The world doesn't move.** Every island keeps its centre, size, biome,
  name, id and treasure angle. Only coasts change.

### How a shape is made

- **A shape is a signed distance.** A form is a few primitives in
  island-local units, scaled by `r`: disc, ellipse, capsule (a fat line),
  arc (a fat curve) and cut (the bay from Archway Isle). They combine by
  union and subtraction. `formSdf(I, x, z)` is negative on land and 0 at the
  coast. The coast still wobbles: the noise that `edgeFactor` uses today is
  added along the edge, so no shape looks drawn with a compass.
- **Height follows the shape.** Today a point's height comes from how far it
  is from the centre (`s = 1 - d / edge`). A shaped island uses how far the
  point is inland instead: `s = -sdf / depth`, where `depth` is the furthest
  inland point. So the ridge runs down the middle of the shape: along a
  crescent's arc, round an atoll's ring, out along a point. A form can also
  taper its peak, so a crescent's horns are low sand and the middle of the
  arc is a hill.
- **Plain islands don't change.** The form `round` is today's code exactly.
  Ports, Port Haven and every island left `round` use it, and the check
  holds their heights to today's, point for point.
- **Pure, and out of `world.js`.** `world.js` is 1,045 lines and needs
  three.js. Move the island layout (names, `add()`, `islandHeight`,
  `edgeFactor`, the bay) into a pure `src/island-layout.js`, and the forms
  into a pure `src/island-forms.js`. Then `tools/check.mjs` can build the
  real world in Node instead of reading `world.js` with regular expressions.
- **No new draws from the world's `rng()`.** A form and its facing come from
  the name and `I.seed`, which already exist. `add()` and `finishIsland()`
  make the same number of `rng()` calls as today, so every island, reef,
  port and the wreck stay where they are.
- **Inside the bound.** Every form stays inside `I.bound` (`r × 1.32`).
  Islands are placed at least `(r1 + r2) × 1.35 + 170` apart, so a form
  can't reach its neighbour, and the streamer's grid and `heightAt` don't
  change.

### What has to follow the coast

All of these assume today that the coast is a radius at an angle. Each one
moves to the shape:

| What | Where | Change |
| --- | --- | --- |
| Terrain | `buildTerrain` | Nothing: it is a square grid already. Thin parts (horns, rings) must be at least 3 cells wide: about 16u |
| Chart coastline | `I.coast`, `ui/chart.js` | Traced from the height field (marching squares at h = 0) instead of 72 rays. A coast can be more than one loop (a cluster's rocks), so it becomes `I.coasts`, a list |
| Shallows and foam | `ringGeometry` | A strip along each coast loop, pushed out along its normal, instead of a ring round the centre |
| The sea's shore map | `shores()` | Uses `formSdf` |
| Landing | `ashore.landingIsland` | Distance to the coast from either side, so you can land from inside a crescent or a lagoon. This replaces `inBay` |
| Treasure, sea stacks, camps | `finishIsland`, `story.campOn` | Walk out from the coast point nearest the old angle, not along a ray from the centre (a ray from Moon Island's centre starts in the water) |
| Props | `buildDecor`, `buildPort`, `buildLandmark` | Placed by inland depth and the form's named spots (below), not by a fraction of the radius |

- **Named spots.** Each form lists a few points, in local units, for props
  and life: a crescent's two horns and the middle of its bowl, a ring's
  passes, the tip of a point.
- **Passes.** Water a boat should reach (a lagoon, a cove, a crescent's
  bowl) opens to the sea through a pass at least 36u wide and 5u deep. That
  fits the largest hull, and grandfather's ship (Phase 10, `sizeScale` 1.4).

### The forms

About a dozen general shapes. None of them belongs to a name.

| Form | Shape | Water you can sail into |
| --- | --- | --- |
| round | Today's lumpy circle | — |
| crescent | A disc with an offset disc taken out: low sandy horns, a hill in the middle of the arc | The bowl |
| ring | An atoll: a low ring round a shallow lagoon, with one or two passes. A tall island keeps its peak on one side, as the rim of an old crater | The lagoon |
| cove | Archway Isle's bay, its mouth facing by seed. Beaches all round; cliffs only on rocky islands | The cove |
| hook | A curved arm round a sheltered bight | The bight (open, no pass needed) |
| twin | Two hills joined by a low sand neck | — |
| kidney | A bean, pushed in on one side | — |
| teardrop | Round at one end, tapering to a tail | — |
| point | A round island with a long headland running out to a point | — |
| long | About three times as long as it is wide, with a bend | — |
| lobed | Four or five broad lobes round a middle | — |
| cluster | Three to five rocky knobs, joined under water or only just above it | — |
| bar | A low sand bar in a gentle arc, with a tail of sand | — |

**How islands get them:**
- **By seed, spread out.** Go through the islands in id order. Each one
  takes a form from its seed, skipping any form (other than round) already
  used within 1.5 km. So wherever you sail, the islands in sight differ.
- **The mix.** About a quarter of the islands stay round. About one in six
  gets water you can sail into (crescent, ring, cove or hook). The rest are
  spread over the other forms.
- **Size.** Some forms don't read when they are small. Under 60u an island
  can only be round, twin, teardrop, cluster or bar. Forms with a lagoon or
  a cove need at least 110u, so the pass and the water inside fit.
- **A name can nudge, but doesn't have to.** A short table of hints
  (`NAME_HINTS`) gives a fitting name its form when the size and the spread
  allow it: Moon → crescent, Atoll and Lagoon → ring, Cove → cove, Point →
  point, Reach → long. A hint loses to the spread and the size rules, and
  most islands have no hint: they get a form for variety alone.

**Landmarks keep their shapes.** The Elder Grove's giant tree and Archway
Isle's arch already make them stand out from the deck.
- **The Elder Grove stays exactly as it is.** It gets no form (no leaf, no
  lobes), and its coast and heights don't change.
- **Archway Isle** moves onto the form system unchanged, as a cove with
  cliffs.
- **The Sunken Temple, Mount Cinderhorn and Frostspire** stand out through
  their sea-view rebuilds (4.7, 4.9, 4.11), as the Elder Grove does through
  its tree. Their designs can still use a form if they want a shaped coast,
  but none needs one. If Cinderhorn or Frostspire gets one, it must still
  fit inside its rough water's calm pocket (Phase 9.2; the `seazones`
  check).

### Moon Island, the first one

Moon Island (radius 244, temperate, 3.2 km from Port Haven, peak 35) is the
first crescent. It ships with the system in 11.1 as the test case: big
enough to read, close enough to visit early, and its name fits.

- **Shape:** the outer disc is the island's radius. A disc of about `0.72 r`
  is taken out, offset by `0.42 r`. The horns are about 25u wide at the
  tips, low and sandy, each trailing a sand bar. The hill is in the middle
  of the arc, at today's peak.
- **Facing:** the horns open east (+x), where the moon rises (`moonDir` in
  `sky.js`), so from inside the bowl the moon comes up between them.
- **The bowl:** sheltered water inside the crescent, shallow and turquoise
  (the shore map's `shoal` tint), wide open to the sea between the horns.
  The treasure lies in the bowl, and you can anchor and go ashore from
  inside it.
- **At night:** moonflowers along the bowl's shore open after dusk and glow
  faintly (pale and bright enough to bloom, like the fireflies).
- **From the sea:** a long low hill with two sand horns. From the crow's nest
  and on the chart, plainly a crescent.
- **Later, maybe:** calmer waves in the bowl, as a small `lee` row in
  `sea-zones.js`. Not in 11.1.

### Not in this phase

- **Ports** keep their shape: docks, towns and Port Haven's home waters
  depend on it.
- **Landmarks** keep theirs (see above).
- **Shapes that spell out a name** (a whale, a crab, a turtle) aren't
  planned. Each would be one more form if it's wanted later.
- **Ashore levels** are still generated from the biome and seed, so landing
  on Moon Island still gives a round level. A level that follows its island
  (walking the crescent from horn to horn) is a later idea; Archway Isle
  shows what one costs when it is built by hand.
- No new, moved or renamed islands.

### Saves

Nothing new is saved. Everything keyed by island id (treasure taken, ashore
progress) stays right, and the chart's fog of war doesn't care about
coasts. Two things can be caught out by a coast that moved:
- **A saved quest spot** (a salvage site or search point) that is now on
  land or too shallow: on load, move it to the nearest water 10u deep.
- **The boat saved mid-voyage** next to a reshaped coast: on load, if it is
  aground, move it to the nearest deep water.

### Checks and tools

- **`tools/check.mjs`** gets a `forms` group that builds the real world in
  Node:
  - every island, reef, port, treasure angle and the wreck is where it is
    today (held against a list taken from `main` before 11.1);
  - round islands, ports and the Elder Grove give today's heights exactly;
  - every form stays inside its bound and leaves at least 120u of water to
    the nearest other coast;
  - every pass is at least 36u wide and 5u deep, and its water joins the
    open sea (a flood fill);
  - every thin part is at least 16u across, so the terrain grid can draw it;
  - every treasure lies in water a boat can reach, every camp on a beach,
    and every landable island has a stretch of beach to land on;
  - no two islands within 1.5 km share a form other than round, every
    form is used at least twice, and the mix is near its aims (about a
    quarter round, about one in six with water to sail into).
- **Gallery:** an `island` subject at sea
  (`gallery.show({ show: 'island', name: 'Moon Island', view: 'chart' })`)
  with the views `chart` (straight down), `deck` (from the boat, 400u out)
  and `crow` (from the crow's nest), and a `forms` sheet: every form from
  above and from the deck.
- **Cost:** `islandHeight` runs for every terrain vertex and every probe
  under the boat. Keep each form to six primitives or fewer, and measure
  `debug.bench()` while sailing past Moon Island on Low.

### Phase 11 in smaller PRs

| PR | Branch | What it adds | Depends on |
| --- | --- | --- | --- |
| 11.1 | `feature/island-forms` | The form system: `island-layout.js` and `island-forms.js` out of `world.js`; heights by inland depth; traced coasts, with the shallows and foam along them; landing, treasure, stacks, camps and props placed from the coast; Archway Isle moved onto it unchanged; Moon Island; the gallery's `island` subject and the `forms` check | — |
| 11.2 | `feature/island-water` | The forms with water to sail into (ring, cove, hook, more crescents), their passes and treasure inside | 11.1 |
| 11.3 | `feature/island-variety` | The other forms (twin, kidney, teardrop, point, long, lobed, cluster, bar), the name hints, and the spread over every island | 11.2 |

- 11.2 gives its forms only to a handful of islands picked by hand, to judge
  them. 11.3 then runs the spread over the whole world once every form
  exists.
- A landmark PR (4.7, 4.9, 4.11) that wants a shaped coast comes after
  11.1. None has to have one.

**Done when:** wherever you sail, the islands in sight look different from
one another; Moon Island is a crescent you can sail into by moonlight;
rings, coves and crescents have water you can reach; landmarks, round
islands and ports haven't changed by a point; and every island, port and
treasure angle is where it was.

---

## Tooling: the look-dev gallery, what's left

The gallery itself has shipped (`gallery.html`; how to use it is in
`CLAUDE.md`, its design in [shipped-plans.md](shipped-plans.md)). These ideas
are not built and not scheduled:

- **Live sliders** for the few numbers being tuned (sea colours, rim
  strength, ink width) with a "copy values" button. Hand-rolled, or a slider
  library from the CDN loaded by the gallery page only: that would be the one
  exception to "no new dependencies", so decide before building.
- **A shot list per polish pass:** agree which gallery views and sheets count
  as done, ideally with a reference image, before the work starts.
- **Before and after in one image:** keep a sheet from `main` and draw it
  beside the same sheet from the branch (today: two screenshots).
- **More subjects** as they are needed: the kraken, the rival's foot-race
  pacer, sea props placed as on an island, weather (rain, fog).
- The gallery is also where an imported model or painted texture would be
  judged, if the game ever takes assets as well as code.

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
| P4 | Fourteen smaller PRs: see *Phase 4 in smaller PRs* | P2, P3 |
| P5 | (done: one PR, with the water work) | P4 |
| P6 | One refit per Phase 4 biome PR | P3, and that biome's Phase 4 work |
| P7 | `feature/living-sea` | P2a (report quests) |
| P8 | `feature/rival-captain` | P3, P7 (encounters come through the director), the epilogue letters, and the rival's text written and approved |
| P9 | Three smaller PRs: see *Phase 9 in smaller PRs* | — (builds on Phase 5's wave set and shore map) |
| P10 | Four smaller PRs: see *Phase 10 in smaller PRs* | P2b's epilogue (done); landmark items as Phase 4 ships them |
| P11 | Three smaller PRs: see *Phase 11 in smaller PRs* | — |

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
- **Rough water that punishes more than it thrills:** a wreck in the Reach
  means a long sail back from port. If playtests find it frustrating, lower
  the rogue waves' damage first, and keep the look and the swell.
- **One weather for the world:** a storm that starts while you're far out
  is still blowing when you sail home, until home waters break it up. If
  that reads as odd, the next step is a storm front with a position, which
  is a much bigger change.
- **Restoration pricing:** the late-game income is a guess today. If the
  restoration takes too long, players stop before the launch, which is the
  best part. Measure income first, and keep the total within an evening or
  two of play.
- **Shapes that only read from above:** from the deck, a crescent is mostly
  a long hill. If shaped islands don't feel different at sea, lean on height
  (taper the peak along the shape) and on the signature touches before
  adding more forms.
- **Retiring the walkable wreck:** it is the first ashore level. Raising her
  removes it, so make sure nothing after the epilogue still points there
  (quests, hints, the chart's markers).
