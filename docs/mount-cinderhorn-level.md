# Mount Cinderhorn: level design

The fourth landmark level and the first on a volcanic island. It moves
Journal VI off the beach camp and into the level, gives the mountain a vault
and its own cosmetic, and rebuilds the volcano at sea to the Elder Tree's
standard. It follows the template set by
[elder-grove-level.md](elder-grove-level.md),
[archway-isle-level.md](archway-isle-level.md) and
[sunken-temple-level.md](sunken-temple-level.md).

Status: **built** (4.9, 2026-11-27; see [STATUS.md](STATUS.md)). The
decisions below were agreed before building; what was settled while
building is listed after them.

---

## What we're building on

- **The island** (`src/world.js`): Mount Cinderhorn, volcanic, at
  (5200, 2600), about 5.8 km east-northeast of Port Haven. Radius 330, a
  240 m peak (`exp` 1.9, so a real cone), round. **No shaped coast is
  needed**, and nothing about the coast or the landing changes, so the
  Cinder Rip's calm pocket (`seazones`) is untouched.
- **The sea view today:** the island's own cone, with a dent near the top
  whose ground is coloured as lava, and nine grey smoke puffs that drift up
  and loop. Nothing else.
- **The story** (Journal VI, "Counting"): Journal V's clue sends you to *"a
  mountain that smokes like a kettle left on the stove"*, and says *"the
  view from its shoulder is worth a pair of singed eyebrows"*. In VI the
  mountain *"grumbles all night"* while he counts the birthdays he has
  missed, and the year his grandchild was born: *"I was here, near enough,
  watching this mountain spit sparks at the stars."* The letter with the
  news reached him three months later: *"I read it on this very ridge."*
  The chapter's beat ends on *"I was wrong about that."*
- **The rival:** Sable's last encounter (dismasted, the tow) opens once
  Journal VI is found. It keys off the chapter, so finding VI in the level
  opens it the same way the camp did.
- **Volcanic pieces from 4.8:** the steam-vent launch and crumbling basalt
  (`ashore/hazards.js`), lava that sends you back to your last lantern
  ("Too hot!"), basalt columns, shelves and cinder ledges
  (`volcanic-art.js`), the lava's look, bubbles, steam and falling pieces
  (`volcanic-life.js`), and the sounds (the vent, rock giving way, the
  hiss, the lava's blub and the mountain's rumble as ambience).
- **From the grove, the arch and the temple:** a pure layout file checked
  in Node, lantern checkpoints, `fallBack` (a long fall puts you back at
  the last lantern), a "Climb down" prompt at chosen lanterns, walking on
  the drawn mesh (`groundH`), `spots.looks` (a place that shows a line).
- **The controller:** jump apex about 1.5 m, walking gap 1.9 m, running gap
  3.4 m, safe drop 6 m, a vent's throw up to 6 m to a ledge within 1.6 m
  (`ASHORE.design`).

## The idea

The grove is a climb **up**. Archway Isle is a walk **along**. The temple is
a way **in**. Cinderhorn is a way **down**: the mountain throws you up its
shoulder on steam, and then you climb down inside it, ledge by ledge round
the crater wall, to a ridge of old rock in a lake of lava. Every other level
gets cooler and quieter as you go; this one gets hotter and brighter. The
drama is fire: it's under you the whole way down, and a miss is "Too hot!".
The payoff is quiet again: a bedroll on warm rock, and a wall of tally
marks.

It is also the first landmark built from another PR's mechanics: 4.8's vents
and crumbling basalt are the level's whole vocabulary, used going up, going
down, and going out.

## Where it stands

**At sea**, the hand-built part is the mountain's top and its fire, standing
on the island's own cone: the crater's jagged rim, **the Horn** (a hooked
spire on the far side of the rim, which gives the mountain its name and its
outline), the lake of lava inside, and a river of lava that leaves the rim
by a notch on the side facing Port Haven and runs down the flank to the
sea. `I.landmarkAt` stays at the crater, so the chart's picture stays where
it is.

The coast doesn't change. The lava reaches the sea a little to one side of
the beach where grandfather camped (the side away from the island's sunken
treasure), so the camp, the chapter VI marker and the landing stay as they
are today. No hidden rocks are added: the boat can sail right up to where
the lava hisses into the water.

**Ashore**, the level is fixed, like Archway Isle's and the temple's: the
rowboat always comes in on the black-sand beach at the foot of an old, cold
lava flow, wherever you dropped anchor. The level is built at a scale that
plays well, not the sea model's, but keeps its shape: the flow, the
shoulder with its notch, the crater with its lake, the Horn.

## Scale

- The level is about **150 m** across; the mountain's foot is about 120 m
  across, the crater about 48 m across at the rim.
- **Water line** at 0 (`waterY`): the sea, at the beach only.
- **The old flow:** a broad road of black rock from the beach up to the
  foot of the wall, at about **6 m**.
- **The shoulder:** the notch in the crater's rim, at **24 m**. The rest of
  the rim is 26-29 m, except west of the notch, where it has fallen away to
  about 19 m and stacks of basalt stand on what is left (see *Settled while
  building*).
- **The lake of lava:** about 34 m across, its surface at **8 m**. Sink
  into it and you're back at your last lantern (`level.pools`).
- **The ridge and the knoll:** a spine of old rock about 1.4 m wide across
  the lake, its crest about half a metre above the lava, ending in a knoll
  about 9 m across in the middle of the lake.
- **The Horn:** a great bundle of basalt columns on the rim, flat on top at
  **36 m**, with the hook curling up and over from there: the highest
  point and the one you see from the sea.

## The route

```
 the Horn (36 m) ── the chest (optional, hardest)
     │  along the rim's crest: narrow, crumbling, the widest jumps
 the shoulder (24 m) ── lantern, the view both ways
     │                        ▲
     │  the descent           │  the chimney: three vents,
     │  round the crater      │  one above the other
     ▼  wall, lantern halfway │
 the wall's foot ── the ridge ── the knoll (8.5 m): Journal VI,
                                 the tally marks, lantern
     ▲
     │  two vents up the wall, basalt shelves between
 the old flow (6 m) ── lantern
     │  a walk up black rock, basalt steps
 the beach + rowboat ── spawn, grandfather's camp; the old forge (vault)
```

1. **The beach (spawn).** Black sand, burnt trees, dark boulders. The
   rowboat, and grandfather's camp: a strip of sailcloth pegged to a boulder
   for shade, his crate, and his **kettle** sitting on a little steam vent
   of its own, boiling (the mountain that smokes like a kettle, with a
   kettle on it). The **note** is pinned to the sailcloth: *"Kettle's on.
   Gone up for a look inside."* **White chalk arrows** on the black rock are
   his trail markers here, as the pegs were in the grove, the cairns on the
   arch and the red sailcloth at the temple. **The old forge**, the vault,
   is a few steps along the beach (see *Vault*).
2. **The old flow.** A cold lava flow runs down to the beach like a broad
   black road, its surface in ropes and wrinkles, with cracks that still
   glow (for the look only: they don't burn, and keep clear of where you
   walk). You walk up it; where it has broken into blocks of basalt there
   are a few easy hops up. Lantern at the foot of the wall.
3. **Up the wall.** Two steam vents, one after the other, throw you up the
   shoulder: each about 5.5 m, onto a basalt shelf. Between them, a walk
   along the shelf and a short stair of basalt columns, with the level's
   first **cinder ledge that crumbles** over solid ground, where a miss
   costs nothing. Coins hang in the steam. The second throw and a last
   stair bring you to the notch.
4. **The shoulder (checkpoint).** The notch in the rim. Behind you the
   whole sea; in front, the crater, with the lake of lava 16 m below and
   the Horn standing over the far side. Lantern here. A spot at the lip
   shows his line about the view (see *Pickups*).
5. **The descent.** The heart of the level. A broken spiral of ledges runs
   down the inside of the crater wall, about two thirds of the way round:
   wide basalt shelves at first, then tops of columns standing against the
   wall, then cinder ledges that crumble a second after you land, so you
   keep moving. Every move is **down and across**: you can see where you're
   going, and what's under it. One stretch crosses a fall of lava that
   pours down the wall through a gap in the ledges. A miss is the lake,
   and back to the last lantern. One lantern halfway, on a solid shelf.
6. **The ridge.** At the wall's foot a spine of old rock runs out across
   the lake, lava on both sides: you walk its crest and hop two breaks in
   it, on column tops (one of them crumbles).
7. **The knoll.** The ridge ends in a hump of black rock in the middle of
   the lake. This is "this very ridge": his other camp, where he sat up
   all night. A bedroll laid out where the rock is warm, a ring of stones
   with no fire in it (he didn't need one), and **Journal VI** on the
   bedroll. Beside it, a slab of rock scratched with **tally marks** in
   fives, rows and rows of them; one mark near the end has a ring round it.
   Reading the journal here, with the lake glowing all round, is the
   payoff. Lantern here, and the biggest gold cache.
8. **The chimney (the way out).** From the knoll a second short spine runs
   to the wall right under the notch. Three steam vents stand one above
   the other up the wall there, each on the shelf the one below throws you
   to: three throws of about 5.2 m and you're out on the shoulder beside
   its lantern. It's one way: the shelves are too far apart to climb down
   (a drop from one to the next counts as a long fall: back to your
   lantern), so it never skips the descent. The shoulder's lantern offers
   **"Climb down to the beach"**; so does the knoll's, for anyone who
   doesn't want the chimney.
9. **The Horn (optional).** From the shoulder, the other way round the
   rim: across the tops of the basalt stacks that stand on the broken rim,
   two of them caps of rock that crumble, with the widest jumps in the
   level, then up the column tops round the Horn to its tip. At the tip: the **cosmetic chest** and the
   best view, down into the crater on one side and out over the whole sea
   on the other. A lantern at the Horn's foot, and one at the tip that
   offers the climb down.

## Pickups and rewards

- **Journal VI** on the knoll (story, never lost).
- **Cosmetic chest:** the **smoked goggles**, on the Horn (see
  *Decisions*). New in `cosmetics.js` as `hat:goggles`, `found:volcano`
  ("On the Horn of Mount Cinderhorn"), and new in `outfits.js`: brass
  goggles with dark lenses, worn pushed up on the forehead.
- **Coins** along the route (some in the vents' steam), and **gold
  caches**: the knoll holds the biggest, the shoulder and the Horn smaller
  ones, and the forge one on a normal visit.
- **Lanterns:** the foot of the wall, the shoulder, halfway down the
  descent, the knoll, the Horn's foot and its tip.
- **Spots** (stand there for a line): the note at the camp, the view from
  the shoulder, the tally marks on the knoll.
- **At night** the lava lights the crater from below: the lake, the fall
  down the wall and the cracks in the rock all glow, sparks rise off the
  lake, and the rock near the lava is lit orange. The carried lantern
  still works.

There are **no new movement mechanics**: vents, crumbling basalt and lava
are 4.8's. What is new is using them going down.

## Story gate

Going ashore on a volcanic island needs the **tempered chain** (refit tier
3), so reading Journal VI needs it too. That matches the chapter's soft
gate (Keel 2): the chain is offered once you own Keel 2, and its fitting
waits in a tropical vault. As with the other three, there's **no sea-search
fallback**:

- **The chapter VI step** reads *"Go ashore at Mount Cinderhorn. He went up
  for a look inside."* The search circle on the chart stays the same.
- **Without the anchor:** *"Grandpa's sixth journal is ashore at Mount
  Cinderhorn. You'll need an anchor to land there, and a refit that can
  take the heat."*
- **Without the chain:** *"Grandpa's sixth journal is ashore at Mount
  Cinderhorn. The heat there would soften your anchor chain. Ask the
  shipwright about a refit."* Sailing past shows the usual volcanic "can't
  land" line.
- **Old saves** that already found VI at the camp keep it.
- Finding VI in the level opens Sable's tow exactly as the camp did.

## Vault

**The old forge:** a stone hearth built over a steam vent at the edge of
the beach, with an anvil, a quenching trough and a few crates under a
lean-to. Traders once came here to forge in the mountain's heat. It's off
the main route and needs no climbing, because volcanic vaults hold the ice
spikes' fitting (refit tier 4, "fire-forged spikes"), and this can be the
nearest volcanic island for some players: here the spikes wait on the anvil
they were made on. Retrieve and refit items wait here; on a normal visit it
holds a gold cache. It is also where Phase 10's sailcloth ("from Mount
Cinderhorn's traders' cache") can wait later; nothing for it is built here.

## Difficulty

By distance Cinderhorn counts as **hard**: about 5.8 km out, or 4.8 km
after the volcanic ease (`BIOME_EASE`). It's the story's fourth landmark, so
it can be a notch harder than the temple, but most of its moves are drops,
which are kinder than climbs. Override it to the **top of medium**:

- Required gaps up to **1.8 m** and required climbs up to **1.1 m** (the
  temple: 1.75 m and 1.1 m). Required drops up to 2.5 m.
- Required vents throw you no more than 6 m, to a ledge within 1.6 m, with
  nothing overhead (`ASHORE.design`, as on generated islands).
- Crumbling pieces are on the required route (the descent and the ridge),
  never under a lantern and never two in a row without a solid piece
  between.
- Harder jumps only on the optional Horn, up to about 90% of what the
  controller can really do.
- Nothing on the required route drops you more than 5 m onto stone. Every
  bigger fall ends in lava (the crater) or is a long fall (the outside),
  and both put you back at the last lantern.

## Sea view (`src/sea-volcano.js`, new)

Rebuilt to the Elder Tree's standard: a detailed, hand-built model that
reads from far off and has life in it. It replaces the nine smoke puffs.

- **The crown:** the mountain's top, built by hand over the island's cone:
  a jagged rim of dark banded rock streaked with ash and yellow sulphur,
  broken by the notch facing Port Haven; **the Horn**, a hooked spire about
  70 m tall on the far side of the rim, so it stands against the sky as you
  come from home; and inside, the lake of lava, bright enough to see
  through the notch.
- **The river of lava:** from the notch down the flank to the sea, a
  glowing channel between black banks, splitting in two round an outcrop
  and joining again. Either side of it, fields of cold black lava, darker
  than the mountain, so the scar reads from far off by day as well.
- **Movement:** the lava creeps downhill; the smoke billows up out of the
  crater in a tall column that leans downwind and thins out; where the
  lava meets the sea, steam boils up off the water; and every so often the
  mountain **spits sparks**: a handful of glowing rocks thrown up out of
  the crater in arcs, trailing embers.
- **Weather of its own:** the smoke column, and a collar of cloud that
  hangs round the peak below the rim and turns slowly. None of it does
  anything to the boat.
- **At night:** the lake lights the underside of the smoke orange, the
  river is a bright thread from the summit to the sea, and the sparks are
  the brightest thing on the water for miles (*"spit sparks at the
  stars"*). Before you find Journal VI, it's a light to steer for, as the
  arch's storm lantern and the temple's glow are.
- **The chart's picture** (`ui/landmarks.js` `volcano`: a cone with a
  glowing crater, a lava run and a puff of smoke) gains the Horn on its
  rim; the rest already matches.

## Music and sound

No music in this PR. The feature plan gives Cinderhorn "ominous ritual
drums, louder as you descend into the crater", but landmark themes ashore
(Phase 12.3) aren't built yet; the temple's waits for them too, and
Cinderhorn's goes in with them. Until then the level plays what a volcanic
island plays.

No new sounds either: the vents, the crumbling rock, the lava's hiss and
the mountain's rumble are 4.8's (still waiting for a listen).

## How it plugs in

| Piece | Change |
| --- | --- |
| `src/ashore/cinderhorn-layout.js` (new, pure) | Where everything stands: beach, camp, forge, the flow, the wall's vents and shelves, the shoulder, the descent, the ridge, the knoll, the chimney, the Horn, lanterns, vault, vents, crumbling pieces, the lake. Checked in Node like `temple-layout.js` |
| `src/ashore/cinderhorn.js` (new) | `buildCinderhornLevel(I, opts)`, assembled like `temple.js`: terrain, colliders, pickups, `spots` (`note`, `journal`, `looks`), `syncStory`, `fallBack`, and the hazards' lists (`vents`, `crumbles`, `pools`) |
| `src/ashore/cinderhorn-art.js` (new) | The rock (the flow's ropes, the rim, the Horn, the knoll, the tally slab), the camp and the kettle, the forge, the chalk arrows, the bedroll and the journal |
| `src/ashore/cinderhorn-life.js` (new) | The lake, the fall of lava, bubbles, sparks, the glow at night, the kettle's steam. Decor only; the vents' steam and the falling pieces come from `volcanic-life.js` |
| `src/ashore/volcanic-life.js` | The lava's texture, the vents' steam and the crumbling pieces become exports, so a hand-built level can use them. Generated islands look the same |
| `src/ashore/ashore.js` | `LANDMARK_LEVELS.volcano = buildCinderhornLevel`; falling in a pool of lava says "Too hot!" on a level whose water is the sea |
| `src/sea-volcano.js` (new) | The sea view. `world.js` uses it in place of the smoke puffs |
| `src/world.js` | `placeVolcano` (which side the river runs down) and `buildVolcano`; the smoke puffs go. Nothing else about the island changes |
| `src/story.js`, `src/story-text.js` | `IN_LEVEL` gains `'VI'`; `STEPS.ashore.VI` (text, noAnchor, noRefit, where); the note, the view, the tally marks, the bedroll and the goggles lines |
| `src/cosmetics.js`, `src/outfits.js` | `hat:goggles` and its model |
| `src/ui/landmarks.js` | The Horn on the volcano's picture |
| `src/gallery/` | Subjects `volcano` (the sea view; `at=mountain|crown|horn|river|shore`) and `cinderhorn` (the level; `at=overview|sea|beach|forge|flow|wall|vent|shoulder|crater|descent|fall|ridge|knoll|tally|chimney|rim|horn|tip|lantern`); sheets `volcano`, `cinderhorn-places` and `cinderhorn-night`; the goggles join the `hats` sheet |
| `tools/check.mjs` | A `cinderhorn` group: the layout's limits, the vents' throws, and the test climber from the beach to the knoll, out by the chimney, and up the Horn |
| `docs/STATUS.md`, `docs/feature-plan.md`, `CLAUDE.md` | Status, the 4.9 row, and the new check group and gallery names |

## Order of work

One PR (`feature/mount-cinderhorn`), as the temple was. In this order, so
each step can be checked before the next:

1. **The sea view first**, as the Elder Tree, the arch and the temple came
   first. It sets the look the level matches.
2. **The level in grey boxes:** beach to knoll, out by the chimney and up
   the Horn, tuned and passing the climber check; the camera checked on
   the descent.
3. **The art and life:** rock, lava, glow, sparks, the camps and the forge.
4. **The story:** the note, Journal VI on the knoll, the spots, the goggles
   in the chest, the chapter VI step. Saves that already found VI keep it.

## Risks

- **The camera on the descent.** You walk ledges on the inside of a bowl,
  with the wall at your shoulder. The follow camera mustn't end up inside
  the wall. The spiral gets a `faces` entry, as Archway Isle's traverse
  has, so the camera hangs out over the crater and looks in at the wall;
  that also keeps the lava in view under you.
- **Going down with a test climber.** The climber jumps wherever the
  footing ends, which carries it further on a drop than on a climb. Ledges
  you drop onto are at least 2 m long in the direction of travel (the
  temple's lesson), and the scripted pilot in the real game is the judge.
- **Crumbling pieces on a way down.** A piece that falls while you stand
  on it drops you. Under every crumbling ledge on the descent is either
  the next ledge or the lake, never a long fall onto stone.
- **Lava that reads at night and by day.** By day the lake has to look hot
  without washing out; at night it's the only light in the crater besides
  your lantern. No real lights are added (each one costs every pixel on
  the island): the glow is unlit colour on the lava and on the rock next
  to it.
- **The mountain at sea is the island.** The crown sits on the island's
  own terrain, whose top is lumpy and whose "crater" is a shallow dent.
  The crown's skirt has to cover that from every side, at every distance,
  with no ground showing through the lake (as the temple's hall had to).
- **Frame time.** The plume, the sparks and the lava are many small moving
  things. Instanced, merged, and checked on Low.
- **Story pacing.** Chapter VI needs Keel 2 **and** the tempered chain
  quest. 4.8 already noted the pacing check is not done.
- **The refit's wording.** The ice spikes' offer says the fitting is "at
  the top of" an island; here it waits at the forge on the beach. (The
  temple's tide shrine has the same mismatch with the chain's offer.)
  Reword both offers in a later, small PR.

## Decisions (2026-11-27)

1. **The cosmetic is a pair of smoked goggles** (hat slot): brass, with
   dark glass, worn pushed up on the forehead. Journal V's clue promises a
   view *"worth a pair of singed eyebrows"*; these are for whoever wants
   the view and the eyebrows. The other three landmarks gave headwear too
   (flower crown, sou'wester, circlet), and Frostspire's is the fur hood.
   Second choice: an obsidian pendant (neck slot).
2. **No shaped coast**, and no change to the landing: the Cinder Rip's
   calm pocket stays as checked.
3. **Up by steam, down on foot, out by steam.** Journal VI is at the
   bottom, on the knoll at the end of the ridge ("this very ridge"); the
   chest is at the top, on the Horn.
4. **The chimney is a real way out**, three vents, and the lanterns also
   offer the climb down.
5. **The Horn** is new: the mountain's name becomes its outline, at sea,
   ashore and on the chart.
6. **The forge is the vault**, on the beach.
7. **One PR**, sea view and level and story together.
8. **No music and no new sounds yet.**

Settled while building:

9. **The rim west of the notch has fallen away**, to about 19 m, and the
   walk to the Horn is across the tops of basalt stacks standing on it. A
   plain crest could be stood on in places (the ground is a grid of
   triangles, and a knife edge drawn on it has flat spots), which would
   have let you walk past every jump. Now a miss lands far enough below
   the shoulder that it counts as a long fall: back to your last lantern.
   The two stacks that crumble are caps of rock on thin spires.
10. **A long fall here is 4.5 m** (`fallBack.drop`; 6 m on the other
    landmarks), so the chimney's shelves, 5 m apart, can't be climbed
    down, and required drops stay under 2.5 m.
11. **Under every ledge of the descent the wall is too steep to stand
    on**, all the way to the lava, and the check enforces it: a miss
    always ends in the lake.
12. **The columns on the descent stand a little closer than first laid
    out** (gaps of 1.1 to 1.45 m). Measured edge to edge on the curved
    wall they came out wider than asked for, and the pilot, walking with
    the stick part-way over, fell short at 1.5 m. The fall of lava is
    still the widest required gap, 1.5 m.
13. **The rock by the lava is drawn twice**: once lit, and once unlit with
    its heat for a colour, faint by day and bright after dark. That is the
    crater's light at night; no lights were added.
14. **Falling in the lake says "Too hot!"** although the level's water is
    the sea: `ashore.js` now tells a pool of lava from a splash.
15. **At sea the river parts round an outcrop** part of the way down and
    joins again; trees and boulders keep out of it. Its side of the
    mountain is picked clear of the island's sunken treasure and sea
    stacks (`placeVolcano`); the lake stands above every lump of ground
    inside the rim (186 m in this world).
16. **The Horn at sea is 72 m tall**, not 45: at 45 it was lost against
    the smoke from a kilometre off.
17. **The steam and the falling pieces are shared code**: `ventSteam` and
    `crumblingPieces` in `volcanic-life.js`, used by generated islands and
    by this level.
18. **Phase 10's sailcloth** (*Restoring grandfather's ship*, stage 5)
    comes from here. The forge is the vault, so it can wait there as a
    quest item; a bolt of sailcloth lies on the traders' crates, but
    nothing for the quest is built yet.

## Open questions

None. The cosmetic (smoked goggles), Journal VI at the bottom of the
crater and the wording below were agreed on 2026-11-27.

1. **The wording** of the note, the view, the tally marks, the bedroll and
   the goggles' chest line, as built:
   - Note: *"Kettle's on. Gone up for a look inside."* Under it: *"Pinned
     to the sailcloth, in his hand. The kettle is still on, over a crack
     in the rock, and still boiling. White chalk arrows lead up the old
     lava flow."*
   - The view: *"The whole sea on one side, and the fire on the other.
     Worth a pair of singed eyebrows."*
   - The tally marks: *"Tally marks scratched in the rock, in fives. Rows
     and rows of them. One mark near the end has a ring round it."*
   - The bedroll, before the journal is yours to take: *"A bedroll, laid
     out where the rock is warm."*
   - Goggles: *"Brass goggles with smoked glass, for looking into
     craters. Somebody liked their eyebrows. Try them on at any port's
     Tailor."*
