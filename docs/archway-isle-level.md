# Archway Isle: level design

The second landmark level and the first on a rocky island. It moves
Journal IV off the beach camp and into the level, gives the island a vault
and its own cosmetic, and rebuilds the great arch at sea to the Elder Tree's
standard. It follows the template set by
[elder-grove-level.md](elder-grove-level.md).

Status: **draft** (2026-11-25). Open questions and decisions are at the end.

---

## What we're building on

- **The island** (`src/world.js`): rocky, at (-3800, -3300), about 5 km from
  Port Haven and north of the Elder Grove, radius 180 and a 60 m peak. The
  arch stands about 30 m off the shore, a little round from the treasure
  side. Its legs are two hidden collision rocks 18 m either side of the
  middle, so a boat fits through the 24 m channel between them.
- **The sea view today:** one `arch` prop from `props.js`, ten jittered
  stones in a half-circle at 3× scale, about 36 m across and 21 m high.
- **The story** (Journal IV, "The Squall"): Journal III's clue sends you
  north to *"a great stone arch that stands in the open sea like a doorway
  with no house behind it. I intend to sail straight through."* In IV he did:
  *"I would like that written down somewhere official."* A squall caught him
  an hour past the arch. Afterwards he wrote the four-page letter home and
  didn't send it. That letter turns up later in the chest under his bunk
  (`LETTERS`), so it **stays out of this level**.
- **The rival:** Sable's fog run (encounter 4) already happens off Archway
  Isle and opens once Journal IV is found. Finding IV in the level has to
  open it the same way.
- **Rocky pieces from 4.4** (`modules.js` `POOLS.rocky`, art in
  `pieces.js`): sheer ledges, sea stacks, rock arches, the rock spire, grey
  shingle, thin turf, pines and boulders.
- **From the grove:** a pure layout file checked in Node, lantern
  checkpoints, `fallBack` (a long fall puts you back at the last lantern),
  "Climb down" prompts at high lanterns, and splash respawns from water.
- **The controller:** jump apex about 1.5 m, walking gap 1.9 m, running gap
  3.4 m, safe drop 6 m (`ASHORE.design`).

## The idea

The grove is a climb **up**. Archway Isle is a walk **along**: out along the
sea cliffs, round a headland and over the top of the arch. The drama comes
from height and the sea underneath you, not from hard jumps. You go where he
went: up for a look at the weather, then out onto the arch before it blew.

## Scale

- Level radius about **85 m**: a cove on the landward side, cliffs on the
  seaward side, and the arch standing off the headland.
- Cliff top at about **24 m**. The traverse runs along the face between
  **10 and 18 m** above the surf.
- The arch keeps the sea view's size: legs **36 m** apart, the keystone
  **21 m** above the water. Its back is about 3 m wide, narrowing to 2 m at
  the crown.
- The seaward stack beyond the arch tops out at about **30 m**.

## The route

```
 seaward stack (30 m) ── the chest, your ship framed in the arch (optional, hardest)
     │  stack hops past the arch's far leg
 the keystone (21 m) ── Journal IV, his mark
     │  along the arch's back
 the shoulder (16 m) ── lantern
     │  THE TRAVERSE: ledges round the headland, stack hops over two inlets
 cliff top (24 m) ── lantern, the arch comes into view; storm cave (vault) below
     │  up the gully on sheer ledges
 shingle cove + rowboat ── spawn, grandfather's camp
```

1. **Shingle cove (spawn).** The rowboat on grey shingle and grandfather's
   camp: a fire ring and a **weather board**, a plank on a post with his
   barometer readings chalked on it, falling fast. Pinned to it is the note
   that sends you inland: *"Glass dropping. Up to the arch for a look. If
   it's coming, I'm going through first."*
2. **The gully.** A cleft up from the cove on short sheer ledges. It's
   easy, a warm-up for the rocky moves. Lantern at the top.
3. **The cliff top.** Heath, thin turf and wind-bent pines. This is the
   reveal: the path tops a rise and **the arch is framed out to sea**. Small
   stone cairns, his trail markers here the way the iron pegs were in the
   grove, lead off along the cliff edge. A side path drops to the **storm
   cave**, the vault (see *Vault* below).
4. **The traverse.** The heart of the level. Off the cliff top and along the
   seaward face, round the headland toward the arch:
   - sheer ledges along the face, with **his handline**, a rope bolted into
     the rock along the hard stretches (it's art and a route marker, not a
     mechanic);
   - sea stacks across two inlets, with surf bursting between them;
   - a short rock arch over the second inlet;
   - gulls nesting on the ledges (decor only; the critters that move come
     in 4.12).

   The surf is below the whole way. A miss means a splash, and **a splash
   puts you back at the last lantern**, so it costs a stretch, never the
   level. There are two lanterns along the way.
5. **The shoulder (checkpoint).** A rock platform at the foot of the arch's
   landward leg. You climb the leg's back on fallen blocks.
6. **Over the arch to the keystone.** A walk along the arch's back with the
   sea 21 m below and the channel between the legs underneath you. There
   are no jumps up here: the height is the challenge. At the keystone
   grandfather scratched his official record into the rock: his initials,
   *"SAILED THROUGH"* and an arrow pointing out to sea. **Journal IV** sits
   under a stone beside it in an oilskin pouch. Reading it here, looking out
   where the squall came from, is the payoff.
7. **The seaward stack (optional).** Past the arch's far leg, a tall sea
   stack climbed by hops up smaller stacks. These are the hardest jumps in
   the level. At the top are the **cosmetic chest** and a view back through
   the arch to your anchored ship.
8. **The way down.** You don't walk back. The keystone and stack lanterns
   offer **"Climb down to the cove"**, like the grove's "Climb down to the
   roots" (`fallBack.down`). Jumping off the arch is a splash, which puts you
   back at the shoulder.

## Pickups and rewards

- **Journal IV** at the keystone (story, never lost).
- **Cosmetic chest** on the seaward stack: a **sou'wester**, the oilskin
  storm hat, for "The Squall". It's a new hat (`found:arch`).
- **Coins** along the route, and **gold caches** in the storm cave, on the
  shoulder and on the seaward stack.
- **Lanterns:** top of the gully, cliff top, two on the traverse, the
  shoulder, the keystone and the stack top.
- **At night:** grandfather's storm lantern hangs on the keystone and burns
  after dark, and it can be seen from the sea (see *Sea view*). The carried
  lantern still works.

There are **no new movement mechanics**. Wind gusts belong to the cold biome
and launches to the volcanic one.

## Story gate

Going ashore on a rocky island needs the **grapnel refit** (tier 1), so
reading Journal IV needs it too. That matches the chapter's soft gate
(Rudder 1): the grapnel refit is offered once you own the Balanced Rudder,
and its fitting comes from a temperate vault. As with the grove, there's **no
sea-search fallback**:

- **The chapter IV step** reads *"Go ashore at Archway Isle. He was heading
  for the arch."* The search circle on the chart stays the same.
- **Without the grapnel**, the step reads *"Grandpa's fourth journal is
  ashore at Archway Isle. Your anchor won't grip bare rock there. Ask the
  shipwright about a refit."* Sailing past shows the usual rocky "can't
  land" line.
- **Old saves** that already found IV at the camp keep it, as the grove did
  with III.
- Finding IV in the level opens Sable's fog run exactly as the camp did.

## Vault

**The storm cave:** a sea cave under the cliff top, reached by a short side
path down from the cliff top on wide ledges. It's off the main route but
gentle, because rocky vaults hold the coral-flukes fitting (refit tier 2),
and Archway Isle can be the nearest rocky island for some players. Retrieve
and refit items spawn here. On a normal visit it holds a gold cache.

## Difficulty

By distance Archway Isle counts as **hard**: about 5 km out, or 4.2 km after
the rocky ease (`BIOME_EASE`). But it's the story's first rocky level, and
the feature plan asks for it to be gentler than the rocky islands further
out. Override it to **medium**:

- Required gaps up to **1.7 m** (the widest on a medium rocky island) and
  required climbs up to **1.05 m**.
- Harder jumps only on the optional seaward stack, up to about 90% of what
  the controller can really do.
- Nothing on the required route drops you more than 6 m onto rock. Every
  bigger fall ends in the surf, which puts you back at the last lantern.

## Sea view (`src/sea-arch.js`, new)

Rebuilt to the Elder Tree's standard: a detailed, hand-built model that reads
from far off and has life in it.

- **The rock:** a heavy, weathered arch in layered strata (grey with warmer
  bands), undercut where the surf hits the legs, fallen blocks round the
  feet, turf and two wind-bent pines on its back, and white streaks on the
  ledges where the seabirds nest.
- **Movement:** surf that bursts at the legs in time with the waves, spray
  blowing off it, and gulls circling the crown and settling on the ledges.
- **Weather of its own:** a small dark squall cloud with a curtain of rain
  that sometimes drifts past beyond the arch, in clear weather too. It's a
  nod to Journal IV and does nothing to the boat.
- **At night:** grandfather's storm lantern glows on the keystone. Before you
  find Journal IV, it's a light out at sea to steer for.
- **The channel stays sailable.** The model's legs have to match the two
  hidden collision rocks in `world.js`, or move them along with it.
- **The arch crabs.** A colony of small, bright crabs lives **upside down on
  the underside of the arch**, and nowhere else in the world. They're too
  small to see from outside the channel. You only spot them by sailing
  through (see *Sailing through: the crab report* below).

## Sailing through: the crab report

Grandfather wanted sailing through the arch "written down somewhere
official". Sailing through yourself does get something written down, just
not what you expected: the crabs.

- **The trigger:** the boat crosses the line between the two legs, inside
  the channel, in either direction. It works at any point in the story; you
  don't need Journal IV or the grapnel.
- **The sighting:** the first time, the camera tilts up at the underside for
  a moment and a toast says *"Crabs! Upside down, all over the underside of
  the arch."*
- **The quest:** that starts a **report quest**: *"Tell the naturalist at
  {port} about the crabs living upside down under the arch at Archway Isle.
  Nobody has ever written them down."*
  - **Who:** a naturalist, a new kind of quest giver who cares about exactly
    this. They live at **the nearest port to Archway Isle**, so the reward
    means sailing there. They aren't on that port's board: they only turn
    up for this quest (and later for Phase 7 sightings, if that fits).
  - **Hand-in:** dock at that port, as with other quests. The naturalist is
    delighted, writes them down and names them after you: *"{captain}'s
    crab. It's official now."* That's the "somewhere official" from his
    journal, coming back round.
  - **Reward:** gold and a **crab pin**, a little enamel crab worn on the
    collar (a new cosmetic, source `quest:archCrabs`; its slot gets settled
    when it's modelled). The crabs also get a page in the naturalist's book,
    shown on the hand-in card.
  - **Slots:** it takes **no side-quest slot** and never expires, like story
    steps. It's one-off: once it's handed in, sailing through again does
    nothing new.
- **Not the 4.12 crabs:** these are decor on the sea view. They don't move
  about or bump you. The crabs that bump you ashore come in 4.12.
- **Phase 7:** this is the first `report` quest. It builds the quest type
  small (a sighting starts it, a named giver at a fixed port, hand-in on
  docking, no slot), and Phase 7's whales and dolphins extend it.

## How it plugs in

| Piece | Change |
| --- | --- |
| `src/ashore/archway-layout.js` (new, pure) | Where everything stands: cove, gully, cliff top, traverse, arch, stack, lanterns, vault. Checked in Node like `grove-layout.js` |
| `src/ashore/archway.js` (new) | `buildArchwayLevel(I, opts)`, assembled like `grove.js`: terrain, cliffs, the arch, colliders, pickups, `hints`, `spots` (`note`, `journal`, `vault`), `syncStory`, `fallBack` |
| `src/ashore/archway-art.js` (new, if needed) | The strata rock, the handline, the cairns and the weather board. Reuses the rocky art in `pieces.js` where it can |
| `src/ashore/ashore.js` | `LANDMARK_LEVELS.arch = buildArchwayLevel` |
| `src/ashore/camera.js` | A **face camera** for the traverse (see *Risks*): `faces: [{ path, out }]` in the level, like `hubs` for trunks |
| `src/sea-arch.js` (new) | The sea view, with the crabs on the underside. `world.js` uses it in place of `propMesh('arch')`, and exports the channel line between the legs |
| `src/story.js`, `src/story-text.js` | `IN_LEVEL` gains `'IV'`; `STEPS.ashore.IV` (text, noAnchor, where); the note, the keystone mark |
| `src/quests.js` | The `report` quest type, built small: started by sailing through, the naturalist at the nearest port, hand-in on docking, no slot. Saved in `state.quests` with everything else |
| `src/story-text.js` (or a new text file) | The crab sighting toast, the quest text and the naturalist's hand-in line |
| `src/cosmetics.js`, `src/outfits.js` | The sou'wester (`found:arch`) and the crab pin (`quest:archCrabs`), and their models |
| `tools/check.mjs` | An `archway` group: the layout's limits, and a test climber from the cove to the keystone and up the stack |
| `docs/STATUS.md`, `docs/feature-plan.md` | Status and the 4.5 row |

## Order of work

Two PRs, split the way the grove was (4.1 walkable, 4.2 story). Each one
leaves `main` playable.

**4.5a, the arch and the level** (`feature/archway-isle`):
1. **The sea view first**, as the Elder Tree came before the grove. It's
   self-contained and sets the look the level matches. The crabs on the
   underside go in here as decor.
2. **The level in grey boxes:** cove to keystone and up the stack, with the
   face camera, tuned and passing the climber check.
3. **The art:** strata, surf, the handline, cairns and the seaward stack.

No story yet: Journal IV stays at the beach camp, and sailing through the
arch does nothing. The vault works, so rocky retrieve and refit items can
already spawn in the storm cave.

**4.5b, the story and the crabs** (`feature/archway-isle-story`):
1. **The story:** the note on the weather board, Journal IV at the keystone,
   the keystone mark, the storm lantern (in the level and on the sea view),
   and the chapter IV step. Saves that already found IV keep it.
2. **The sou'wester** in the stack chest.
3. **The crab report:** the sighting, the `report` quest, the naturalist,
   and the crab pin.

The text for 4.5b (see *Open questions*) gets approved before 4.5b is built.

## Risks

- **The camera on the traverse.** The trunk camera circles a cylinder from
  outside. A cliff face is the opposite: the camera has to hang out over the
  sea looking straight in at the face, so left and right on the stick run
  along the ledge, and it has to swing round the headland without going into
  the rock. Prototype it in grey boxes first, as the grove did with the
  trunk.
- **Seeing your feet.** On narrow ledges with the face camera, the edge
  under you has to be readable. Keep ledges a flat, lighter colour than the
  face, and check on a phone.
- **The arch's back.** A 2 m wide walk 21 m up is easy to fall off by
  accident on a stick. Low rubble along its edges catches you, and the walk
  shouldn't need precise steering.
- **Frame time.** Surf bursts, spray and gulls, both at sea and ashore. Merge
  the rock like the grove and the wreck, and check frame time on Low.
- **Story pacing.** Chapter IV now needs Rudder 1 **and** the grapnel quest
  (gold plus a trip to a temperate vault). Check that a player can afford
  both from side quests.

## Open questions

1. **The wording** of the note, the keystone mark, the crab toast and the
   naturalist's lines: these touch the story text, so they need approval
   like the journals did.

## Decisions (2026-11-25)

1. **The cosmetic is a new sou'wester**, the oilskin storm hat, for "The
   Squall". The fur hood stays with Frostspire, where `cosmetics.js`
   (`found:cold`, *"Found in the frozen north"*) and the shipped plans
   already put it. (Separately, the feature plan pairs the gold circlet with
   Cinderhorn, but `cosmetics.js` hints it's in the Sunken Temple. That one
   is for 4.7 and 4.9 to settle.)
2. **Sailing through the arch starts a report quest**, not a log entry: the
   upside-down crabs under the arch, reported to a naturalist at the
   nearest port (see *Sailing through: the crab report*). It's the first
   `report` quest, ahead of Phase 7.
3. **Reporting the crabs pays gold and a crab pin.**
4. **Two PRs:** 4.5a, the arch and the level; 4.5b, the story and the crabs
   (see *Order of work*).
