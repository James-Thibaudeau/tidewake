# The Sunken Temple: level design

The third landmark level and the first on a tropical island. It moves
Journal V off the beach camp and into the level, gives the island a vault
and its own cosmetic, and rebuilds the temple at sea to the Elder Tree's
standard. It follows the template set by
[elder-grove-level.md](elder-grove-level.md) and
[archway-isle-level.md](archway-isle-level.md).

Status: **built** (4.7, 2026-11-27; see [STATUS.md](STATUS.md)). The
decisions below were agreed before building; what was settled while
building is listed after them. The one open question is the wording.

---

## What we're building on

- **The island** (`src/world.js`): Sunken Temple Isle, tropical, at
  (2300, 5500), about 6 km south-southeast of Port Haven. Radius 220, a low
  22 m peak (`exp` 0.9, so mostly flat), round. **No shaped coast is
  needed** (see *Where it stands* below), so it doesn't wait on Phase 11.
- **The sea view today:** ten `pillar` props in a ring round the island's
  centre, three of them short, and five tilted pillars just off the shore.
  Nothing else.
- **The story** (Journal V, "Gold and Quiet"): Journal IV's clue sends you
  to *"a whole temple half drowned among the palms"*. In V he found it: old
  gold, *"statues with seaweed beards, and a hall of carved fish who all
  look slightly disappointed in me"*. He wrote down *"every room, every
  carving, every coin"*, then looked round for somebody to read it to.
  The chapter's beat ends on *"And no one to show it to."*
- **The rival:** Sable's relic scramble (encounter 5) opens once Journal V
  is found, on Thorn Cove (4.6). Finding V in the level has to open it the
  same way the camp did.
- **Tropical pieces from 4.6** (`modules.js` `POOLS.tropical`, art in
  `tropical-art.js`): palms, frond pads, tide pools, rope bridges, pale
  coral sand and warm coral-brown rock.
- **From the grove and the arch:** a pure layout file checked in Node,
  lantern checkpoints, `fallBack` (a long fall puts you back at the last
  lantern), "Climb down" prompts at high lanterns, splash respawns, walking
  on the drawn mesh (`groundH`), `faces` for the camera, and `level.calm`
  (a circle where the sea lies flat).
- **Water on foot:** you splash (back to the last lantern) only when you
  fall more than 0.6 m below the water line (`waterY`). Ground a little
  under the water line can be **waded**, with no new mechanic.
- **The controller:** jump apex about 1.5 m, walking gap 1.9 m, running gap
  3.4 m, safe drop 6 m (`ASHORE.design`).

## The idea

The grove is a climb **up**. Archway Isle is a walk **along**. The temple
is a way **in**: across the drowned forecourt, along the tops of a
colonnade standing in the sea, up the temple steps, and down into the
flooded hall to the treasury at its heart. The drama is water: it's under
you or round your ankles the whole way, and a miss is a splash. The payoff
is quiet: a room full of gold with one camp stool pulled up to it.

## Where it stands

**At sea**, the temple stands on the island's shore facing Port Haven (the
way you come from, and the way the Elder Tree's owl looks). Its stepped
platform rises out of the shallows, the great door at the top. In front of
it, the **drowned colonnade**, two rows of columns, runs straight out into
the sea: the old processional way, sunk when the shore went under. Behind
the platform, the roofless hall, with palms growing out of it.

This needs no shaped coast. The island is round and low, and the temple is
built over its edge: half on the beach, half in the sea. `I.landmarkAt`
moves from the island's centre to that spot on the shore
(`{ x, z, rot }`, rot facing Port Haven), so the chart's picture follows
it. Grandfather's camp at sea, and with it the chapter V marker, moves
there too.

**Ashore**, the level is fixed, like Archway Isle's: the rowboat always
comes in on the beach beside the drowned forecourt, wherever you dropped
anchor. The level is built at a scale that plays well, not the sea model's,
but keeps its shape: forecourt, colonnade, steps, door, hall, pediment.

## Scale

- The level is about **130 m** across; the temple complex is about 90 m
  from the forecourt's far end to the back of the hall.
- **Water line** at 0 (`waterY`). Flooded floors lie **0.2–0.35 m under**
  it, so you wade; deep water (the sunken parts) is 2–4 m down, so you
  splash.
- **The forecourt:** a causeway about 45 m long and 4 m wide, mostly a
  hand's depth under water, broken by gaps of deep water.
- **The colonnade:** two rows of eight columns, 5 m apart along the row,
  standing in deep water. The architrave (the stone beams along their tops)
  is at **7 m**, about 1.2 m wide.
- **The temple platform:** three broad tiers of steps up to the portico at
  **8 m**, with the great door.
- **The hall:** about 26 × 18 m, roofless, its walls 10–12 m high. Its floor
  has sunk to the water line: flooded, with holes into the deep undercroft.
- **The treasury:** a raised room at the back of the hall, its floor at
  **1.5 m**, dry.
- **The pediment:** the broken gable over the portico, its top at about
  **19 m**, the highest point and the one you see from the sea.

## The route

```
 the pediment (19 m) ── the chest (optional, hardest)
     │  up the broken portico columns and along the tilted cornice
 the portico (8 m) ── lantern, the great door; the way down into the hall
     │
 the treasury (1.5 m) ── Journal V, the gold, one camp stool
     │  across the flooded hall: fallen roof slabs, pillar stumps, the
     │  carved fish along the walls; out by the breach (one-way, to the beach)
     │
 the colonnade (7 m) ── lantern halfway; walking the architrave
     │  stumps rising like steps, a fallen column leaning up as a ramp
 the forecourt gate ── lantern
     │  the drowned causeway: wading, statues with seaweed beards, gaps
 the beach + rowboat ── spawn, grandfather's camp; the tide shrine (vault)
```

(The portico comes before the treasury on the way: up the steps, through
the door, down into the hall. The diagram puts the pediment on top because
it's the highest.)

1. **The beach (spawn).** Pale coral sand and palms. The rowboat, and
   grandfather's camp: a hammock slung between two palms and a camp table
   with a stack of charcoal rubbings of carvings, weighted with a shell. The
   **note** on top sends you in: *"Gone in to count it. Every room, every
   carving, every coin."* Strips of **red sailcloth tied round the
   columns** are his trail markers here, as the pegs were in the grove and
   the cairns on the arch. The **tide shrine**, the vault, is a few steps
   along the beach (see *Vault*).
2. **The drowned forecourt.** The old causeway runs out across the
   shallows towards the colonnade, a hand's depth under water: you wade it,
   with rings spreading from your feet. Statues line it on plinths, worn
   smooth, with seaweed beards. Here and there the causeway has broken and
   sunk, leaving gaps of deep water to hop, at first small. Sea turtles
   doze on the plinths and slide into the water as you come by. Lantern at
   the forecourt gate, where the colonnade begins.
3. **The colonnade.** The heart of the level. The court here sank further,
   so the columns stand in deep green water. First, **broken column stumps**
   rising like steps (hops of up to 1.1 m); then a **fallen column** leaning
   up against the row, a round ramp to walk up; then **along the
   architrave** at 7 m. Some beams have fallen, leaving gaps to hop from
   capital to capital; one stretch crosses between the two rows on a beam
   that fell across. Fish move about in the water below, and a giant stone
   face lies half sunk on the bottom, looking up. A miss is a splash, back
   to the last lantern. One lantern halfway, on a capital.
4. **The portico (checkpoint).** The architrave runs onto the temple's top
   step. The great door stands open behind you; turn round and the
   colonnade runs out to sea. Lantern here.
5. **Into the hall of carved fish.** Through the door, steps lead **down**
   into the flooded hall. Its roof fell in long ago; palms grow through the
   gap, and the light comes straight in. The walls are carved with rows of
   fish, every one of them looking slightly disappointed (a spot by the
   wall shows his line, see *Pickups*). The floor is flooded at wading
   depth, with collapsed holes into the deep undercroft: you cross on
   wading floor, fallen roof slabs and pillar stumps, round the holes. It's
   a puzzle of finding the way, not of hard jumps.
6. **The treasury.** At the back of the hall, up a few steps onto a dry
   dais, under the one piece of roof still standing: a shaft of light falls
   on **the gold**, heaped round the feet of a seated statue, old plates
   and cups and coins. In front of it, grandfather's **camp stool**, one,
   and a crate he used as a desk with an inkpot on it. **Journal V** lies
   open on the crate. Reading it here, in a room full of treasure with
   nobody in it, is the payoff. Lantern here.
7. **The breach (the way out).** A crack in the hall's side wall, at the
   top of a fallen slab beside the treasury, opens over the beach outside:
   a 3 m drop onto the sand, a short walk from the rowboat. It's one way:
   from outside it's too high to climb, so it never skips the colonnade.
8. **The pediment (optional).** From the portico, up the front: the
   portico's columns are broken at different heights, and with fallen
   blocks against them they make a stair of capitals, the hardest jumps in
   the level. Then along the tilted, broken cornice to the top of the
   gable. At the top: the **cosmetic chest** and the best view, back down
   the colonnade to the open sea, and over the hall's open roof. The
   pediment's lantern offers **"Climb down to the beach"**; so does the
   portico's.

## Pickups and rewards

- **Journal V** in the treasury (story, never lost).
- **Cosmetic chest:** the **gold circlet**, on the pediment (see
  *Decisions*). It's already in `cosmetics.js` as `found:ruins` ("Hidden in
  the Sunken Temple") and already modelled, but no chest gives it yet.
- **Coins** along the route, and **gold caches**: the treasury holds the
  biggest one in the level, the portico and the pediment smaller ones, and
  the tide shrine one on a normal visit.
- **Lanterns:** the forecourt gate, the colonnade, the portico, the
  treasury and the pediment.
- **Spots** (stand there for a line, like the grove's carving): the note at
  the camp, the carved fish in the hall, the camp stool in the treasury.
- **At night** the flooded floors and the colonnade's water glow a soft
  blue (the same glow as the bloom at sea), brighter in rings round your
  feet as you wade. The carried lantern still works.

There are **no new movement mechanics**. Wading is walking on ground just
under the water line; the fallen column is a walkable ramp. No tide that
rises and falls (considered, and left out: a timer that opens and shuts
ways across is a new mechanic, and the climber check can't walk it).

## Story gate

Going ashore on a tropical island needs the **coral flukes** (refit tier
2), so reading Journal V needs them too. That matches the chapter's soft
gate (Hull 1–2): the flukes are offered once you own Hull 2, and their
fitting waits in a rocky vault. As with the grove and the arch, there's
**no sea-search fallback**:

- **The chapter V step** reads *"Go ashore at Sunken Temple Isle. He went
  in to count the treasure."* The search circle on the chart stays the
  same, centred on the temple.
- **Without the anchor:** *"Grandpa's fifth journal is ashore at Sunken
  Temple Isle. You'll need an anchor to land there, and a refit to hold in
  coral sand."*
- **Without the flukes:** *"Grandpa's fifth journal is ashore at Sunken
  Temple Isle. Your anchor drags in the coral sand there. Ask the
  shipwright about a refit."* Sailing past shows the usual tropical "can't
  land" line.
- **Old saves** that already found V at the camp keep it.
- Finding V in the level opens Sable's relic scramble exactly as the camp
  did.

## Vault

**The tide shrine:** a small domed shrine at the edge of the beach, its
front step in the water, with an offering niche inside. It's off the main
route and needs no climbing, because tropical vaults hold the tempered
chain's fitting (refit tier 3), and this can be the nearest tropical island
for some players. Retrieve and refit items wait here; on a normal visit it
holds a gold cache.

## Difficulty

By distance the temple counts as **hard**: about 6 km out, or 5.7 km after
the tropical ease (`BIOME_EASE`). It's the story's third landmark and comes
after Archway Isle, so it can be a little harder than the arch, but not a
hard tropical island. Override it to **medium**, at the top of the range:

- Required gaps up to **1.75 m** and required climbs up to **1.1 m**
  (the arch: 1.7 m and 1.05 m).
- Harder jumps only on the optional pediment, up to about 90% of what the
  controller can really do.
- Nothing on the required route drops you more than 6 m onto stone. Every
  bigger fall ends in deep water, which puts you back at the last lantern.

## Sea view (`src/sea-temple.js`, new)

Rebuilt to the Elder Tree's standard: a detailed, hand-built model that reads
from far off and has life in it.

- **The stone:** weathered cream and honey limestone, green-stained and
  barnacled up to the old waterlines, moss in the joints, vines hanging off
  the cornices. The platform's three tiers of steps run down into the sea.
  The portico: six columns, two of them broken off, under the **broken
  pediment** (the chart's picture). Behind it, the hall's walls with no roof
  and three or four palms growing out of it.
- **The drowned colonnade:** two rows of columns running out into the
  shallows from the steps, some still carrying their beams, some broken
  short, one fallen across the row. A **giant stone head** lies half sunk
  beside it with a seaweed beard. The rows are far enough apart (about
  30 m) that you can **sail up the avenue** between them to the steps.
  The columns are solid to the boat (hidden collision rocks, like the
  arch's legs), and the channel between the rows stays clear.
- **Movement:** waves washing up the drowned steps and breaking white round
  the column bases; a sheet of water spilling out of the flooded hall down
  the steps; turtles hauled out on the lowest step by day, which slide into
  the water when you sail close; frigatebirds circling over the hall.
- **Weather of its own:** mist that rises off the flooded hall and drifts
  out through the colonnade, thickest at dawn and dusk. It does nothing to
  the boat.
- **By day, a glint:** now and then the sun flashes off gold in the
  doorway. A treasure hunter's lure, seen from far off.
- **At night:** the water round the colonnade and on the steps glows soft
  blue, pulsing as the waves come through. Before you find Journal V, it's a
  light to steer for, as the arch's storm lantern is.
- **The chart's picture** (`ui/landmarks.js` `ruins`: columns under a
  broken pediment, water at their feet) already matches; check it once the
  model is in.

## Music

None in this PR. The feature plan gives the temple a "watery, mysterious,
echoing" theme, muffled in flooded rooms, but landmark themes (Phase 12.3)
aren't built yet, and `src/music/` is being worked on for Sable's theme.
The temple's theme goes in with the other landmark themes.

## How it plugs in

| Piece | Change |
| --- | --- |
| `src/ashore/temple-layout.js` (new, pure) | Where everything stands: beach, camp, tide shrine, forecourt, colonnade, platform, hall, treasury, breach, pediment, lanterns, vault, water depths. Checked in Node like `archway-layout.js` |
| `src/ashore/temple.js` (new) | `buildTempleLevel(I, opts)`, assembled like `archway.js`: terrain, water, colliders, pickups, `hints`, `spots` (`note`, `journal`, `vault`, the fish, the stool), `syncStory`, `fallBack`, `calm` over the flooded courts |
| `src/ashore/temple-art.js` (new) | The stone (columns, beams, steps, walls with carved fish, statues, the sunken head), the camp, the shrine, the gold, the night glow |
| `src/ashore/temple-life.js` (new) | Turtles on the plinths that slide in as you come, fish in the flooded floors that dart off, rings from your feet as you wade. Decor only |
| `src/ashore/ashore.js` | `LANDMARK_LEVELS.ruins = buildTempleLevel` |
| `src/sea-temple.js` (new) | The sea view. `world.js` uses it in place of the pillars |
| `src/world.js` | `landmarkAt` on the shore facing Port Haven; the colonnade's hidden rocks; exclusions round the temple; the camp for V there |
| `src/story.js`, `src/story-text.js` | `IN_LEVEL` gains `'V'`; `STEPS.ashore.V` (text, noAnchor, noRefit, where); the note, the fish, the stool, the circlet lines |
| `src/cosmetics.js` | The circlet's hint: *"On the Sunken Temple's pediment"* |
| `src/gallery/` | Subjects `temple` (the sea view) and `ruins` (the level, `at=forecourt|colonnade|hall|treasury|pediment|shrine`); sheets `temple` and `temple-places` |
| `tools/check.mjs` | A `temple` group: the layout's limits, and the test climber from the beach to the treasury and up the pediment |
| `docs/STATUS.md`, `docs/feature-plan.md` | Status and the 4.7 row (and 4.9's cosmetic, see *Decisions*) |

## Order of work

One PR (`feature/sunken-temple`), since the grove and the arch have laid
down the pattern. In this order, so each step can be checked before the
next:

1. **The sea view first**, as the Elder Tree and the arch came first. It
   sets the look the level matches.
2. **The level in grey boxes:** beach to treasury and up the pediment,
   tuned and passing the climber check; the camera checked in the hall.
3. **The art and life:** stone, carvings, statues, water, glow, turtles and
   fish.
4. **The story:** the note, Journal V in the treasury, the spots, the
   circlet in the chest, the chapter V step. Saves that already found V keep
   it.

## Risks

- **The camera in the hall.** A roofless hall is still a box of 10 m walls.
  The follow camera mustn't end up inside a wall or looking at one from
  behind. The roof is gone for that reason; if it's still a problem, the
  hall gets a `faces`-style entry that holds the camera up and in, as the
  storm cave did.
- **Water that reads.** Wading only works if you can see the floor is
  shallow and the holes are deep: clear, pale water over the floors, dark
  green over the holes, and a lighter edge where the floor stops. Check on
  a phone and at night.
- **The sea in the level.** The flooded floors sit in the level's `calm`
  circle, so the sea lies flat there instead of rolling waves over them.
  Only one circle exists; the forecourt, colonnade and hall have to fit in
  it, or the circle grows a second entry.
- **The architrave.** A 1.2 m beam 7 m up over water, like the arch's back.
  Low rubble on its edges where it's long and straight, and no turns on a
  jump.
- **Frame time.** Columns, carvings, statues and glow. Merge the stone like
  the grove and the arch, and check frame time on Low.
- **Story pacing.** Chapter V now needs Hull 2 **and** the coral flukes
  quest. 4.6 already noted the pacing check is not done; this makes it
  matter more.

## Open questions

1. **The wording** of the note, the fish line, the stool line and the
   circlet's chest line: they touch the story text. First drafts:
   - Note: *"Gone in to count it. Every room, every carving, every coin."*
     Under it: *"Weighted down with a shell on his camp table, on top of a
     stack of charcoal rubbings. Strips of red sailcloth are tied round the
     columns out along the causeway."*
   - Fish: *"Rows and rows of carved fish. Every single one of them looks
     slightly disappointed in you."*
   - Stool: *"One camp stool, pulled up to the gold. Just the one."*
   - Circlet: *"A thin band of old gold. It has long forgotten what it was
     for. Try it on at any port's Tailor."*

## Decisions (2026-11-27)

1. **The cosmetic is the gold circlet**, not the shell necklace. The
   circlet is already the temple's in `cosmetics.js` and the shipped plans,
   it's already modelled, and Journal V is about gold *"so old it has
   forgotten what it was for"*. The shell necklace stays a tropical-isle
   find (`found:tropical`; no chest gives it yet, which is a separate,
   small fix). Mount Cinderhorn (4.9) then settles its own cosmetic in its
   design; the feature plan's 4.9 row changes to say so.
2. **No shaped coast.** The temple stands over the edge of the round island,
   half in the sea, facing Port Haven.
3. **The way in, then down:** forecourt, colonnade, portico, down into the
   hall, treasury. Journal V in the treasury; the chest on the pediment.
4. **No tide mechanic.** The water stays put.
5. **Sail up the avenue.** The drowned colonnade at sea is wide enough to
   sail between its rows, with nothing triggered.
6. **One PR**, sea view and level and story together.
7. **No music yet**; the temple's theme waits for the landmark themes.

Settled while building:

8. **Wading floors show as pale patches on the water.** The sea is opaque,
   so a floor a hand's depth under it can't be seen through it. Each
   wading floor gets a pale, soft-edged patch (with faint paving joints) on
   the still water over it, and deep water stays the sea's blue. At night
   the patches turn blue and glow. The ocean shader is unchanged.
9. **Things to land on after a jump up are about 2 m across**: the stumps,
   the pile up to the gable and the fallen roof slabs. At 1.4-1.6 m a
   walking jump carried you past them. The second stump stands in line with
   the fallen column, so you step straight up onto its foot.
10. **The treasury's lantern is at the top of the dais steps**, on the way
    to the journal, not beside the gold.
11. **Two things to look at**, the carved fish and the stool, are
    `spots.looks` (a place, a prompt and a line), new in `ashore.js` for
    any level.
12. **At sea the portico is raised clear of the ground under the hall**
    (`placeTemple` in `world.js`; 18 m in this world), and the hall is 38 m
    deep, so the island's ground never shows through its flooded floor.
13. **The avenue is open**: the fallen column lies outside the east row,
    not across the rows.
14. **The turtles at sea slide in when you sail within 55 m**; the
    landmarks' `update` now gets the boat's position for that.
15. **Phase 10's figurehead** (*Restoring grandfather's ship*, step 4)
    comes from here. The tide shrine is the temple's vault, so it can wait
    there as a quest item; nothing for it is built yet.

