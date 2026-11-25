# The Elder Grove: level design

The first landmark level, and the template for the other four. It moves
Journal III off the beach camp and into the level, adds the vault that
retrieve and refit quests need, and gives the grove its unique cosmetic.

Status: **design agreed** (decisions on 2026-11-24, listed at the end).
Ready to build.

---

## What we're building on

- **The sea view** (`src/elder-tree.js`, this branch): a giant tree on the
  hilltop, about 140 m to the top of the crown, with a skirt of arching root buttresses, an owl
  in a hollow facing Port Haven, moss and aerial roots, clouds drifting through
  the canopy, birds over the crown, fireflies at night, and grandfather's red
  pennant lashed to a pole at the very top.
- **The story** (Journal III, "The Oldest Tree"): he climbed the biggest tree,
  carved a lopsided heart with their initials "sixty feet up" and added a
  little anchor for the children. Owls. The trees "creak like a ship at
  anchor". Journal II's clue: *"look among the roots."*
- **The wreck level** (`src/ashore/wreck.js`) shows how a hand-built level
  plugs in: the level contract in `shapes.js`, plus `hints`, `spots` and
  `syncStory`.
- **The controller:** jump apex about 1.5 m, walking gap 1.9 m, running gap
  3.4 m, safe drop 6 m (`ASHORE` in `config.js`).

The level doesn't have to match the sea model. It's built at a scale that
plays well, but it keeps the sea view's landmarks: the arching roots, the owl
hollow, the moss and hanging roots, and the pennant at the top.

## Scale

Generated islands are 52–84 m across with summits of 10–25 m. The grove is
bigger but still walkable:

- Level radius about **95 m**, with the tree on a low hill in the middle.
- Trunk about **14 m across** at the base, so walking round it takes about
  10 s.
- The carving ledge at **18 m** ("sixty feet"), the boughs between 18 and
  32 m, and the crown platform at about **42 m**.

## The route

```
 crown (42 m) ── pennant, the chest, the best view
     │  leaf mats up through the canopy (optional, hardest)
 the carving (18 m) ── Journal III
     │  along the owl bough
 owl hollow (14 m) ── checkpoint
     │  spiral of bark ledges, fungus shelves and grandfather's pegs
 root gate (3 m) ── checkpoint, the vault below
     │  over and under the arching roots
 the old wood ── log bridges over a stream
     │
 beach camp + rowboat ── spawn
```

1. **Beach camp (spawn).** The rowboat, and grandfather's tent with its red
   pennant. The tent holds a note instead of the journal: *"Gone up the big
   tree. Back for supper."* That's the hook that sends you inland. You can
   only get here with the anchor fitted (see *Story gate* below).
2. **The old wood.** A gentle walk inland under the giant companion trees,
   with mossy fallen logs as bridges over a stream and stumps as stepping
   stones. Coins mark the way. There's nothing hard yet, so it works as a
   breather.
3. **Among the roots.** The base of the tree is a ring of huge arching roots.
   You walk under some arches and hop along the tops of others to reach the
   **root gate**, a gap between two buttresses. Inside is a hollow at the foot
   of the trunk, lit from a shaft above: **the vault**. Retrieve and refit
   items spawn here (see *Vault* below), and on a normal visit it holds a gold
   cache.
4. **Up the trunk.** A spiral climb round the outside of the trunk on bark
   ledges, shelf fungus and the iron pegs grandfather hammered in on his way
   up. It's mostly walking and small hops. It **never drops you more than
   6 m**: under each harder jump there's a ledge or a broad leaf mat to land
   on, so a miss costs a few seconds, not the whole climb.
5. **Owl hollow (checkpoint).** The owl from the sea view watches you arrive
   and hoots, then flutters to the next branch along the route. It keeps
   doing that all the way up: it waits a little ahead, hoots when you get
   close, and flies on. It works as a gentle guide, never as an obstacle.
   **It never talks:** no speech bubbles, no hint text, just hoots and where
   it chooses to perch.
6. **Along the owl bough to the carving.** The broadest bough, flat on top
   like a deck, with moss to walk on. At its root, facing the sea, is the
   lopsided heart with the initials and the little anchor. **Journal III**
   sits wedged in a crack beside it. Reading it while standing at the carving
   is the payoff.
7. **The crown (optional).** For players who want more: leaf mats and thinner
   branches up through the canopy, the hardest jumps in the level, with clouds
   drifting through (the same puffs as the sea view). At the top are
   **grandfather's pennant** and the **cosmetic chest**, plus the best view in
   the game so far, out over the whole grove to the sea.
8. **The way down.** You don't climb back down. An aerial root hangs from the
   crown to a pool by the roots: walk off the edge and splash into it, which
   is safe. From the carving, an easier drop lands on leaf mats. Both lead back
   to the root gate, a short walk from the boat.

## Pickups and rewards

- **Journal III** at the carving (story, never lost).
- **Cosmetic chest:** the **flower crown**, at the crown. The feature plan
  already lists it as a landmark cosmetic that isn't findable yet.
- **Coins** along the route, and **gold caches** in the vault, at the owl
  hollow and at the crown.
- **Lantern checkpoints:** the root gate, the owl hollow, the carving and the
  crown.
- At night the fireflies are out round the roots and the lower trunk (the
  carried lantern still works).

The climb uses walking and jumping only, with **no new movement
mechanics**: no bouncy mushrooms or launch pads. Launching belongs to the
volcanic biome's steam vents (Phase 4), which can be built as a launch
mechanic there.

## Story gate

Going ashore needs the anchor, and that doesn't change for the grove, so
reading Journal III needs it too. There's **no sea-search fallback**:
- **Sailing slowly past the camp** without the anchor shows the usual hint,
  *"You'll need an anchor to go ashore."*
- **With the anchor**, the camp is where you drop anchor and land.
- **The chapter III step** in the tracker reads *"Go ashore at the Elder
  Grove"*, and the search circle on the chart stays the same.

That makes the Oak hull, which starts the anchor quest, part of chapter III's
gate along with Sails 1. Check the story pacing (a risk the feature plan
already lists) so a player can afford both by then from side quests.

## Vault (the shared mechanic)

Every level, generated or hand-built, gets a `vault: { x, y, z }` spot in the
level contract:
- **Generated levels:** the summit cache spot.
- **Hand-built landmarks:** an authored spot. In the grove it's the root
  hollow.

While a retrieve quest or an anchor refit (Phase 6) targets an island, its
item spawns at that island's vault. Picking it up puts it in the hold for
retrieve quests, where a wreck returns it to the island. For refits it's
story-safe and never lost. This is the piece that unblocks the grapnel refit
and the rocky biome.

## Difficulty

By distance the grove counts as **hard** (5.3 km from Port Haven), but it's
the first landmark and the story needs it early (Journal III, Sails 1).
Override it to **medium-low**:
- Required gaps up to 1.6 m and required climbs up to 1.0 m.
- Harder jumps only on the optional crown climb.
- The safe-drop rule from step 4 applies everywhere on the required route.

## How it plugs in

| Piece | Change |
| --- | --- |
| `src/ashore/grove.js` (new) | `buildGroveLevel(I, opts)`, hand-built like `wreck.js`: terrain, tree, roots, colliders, pickups, `hints`, `spots` (`journal`, `vault`), `syncStory` |
| `src/ashore/ashore.js` | Choose the level from a small table, `LANDMARK_LEVELS = { grove: buildGroveLevel }`, so later landmarks just add an entry; a `spots.journal` interaction like the wreck's chart table |
| `src/ashore/shapes.js` | Add `vault` to the level contract |
| `src/ashore/levelgen.js` / `modules.js` | Generated levels expose `vault` (the summit cache spot) |
| `src/story.js` | Chapter III points at the grove level instead of the camp search: no sea search, tracker step "Go ashore at the Elder Grove". Saves that already found III keep it |
| `src/ashore/grove.js` (owl) | The owl guide: perches along the route, hoots as you get close (a hoot in `audio.js`), flies on; no text |
| `src/quests.js` | Retrieve quest type: spawn at the target island's vault, carry in the hold, hand in at the giving port; "Find the lost map fragment" |
| `src/cosmetics.js` | The flower crown's source becomes `found:grove` |

## Order of work

1. **Vault and retrieve quests** on generated levels. Small, testable, and
   useful on its own.
2. **The grove level**, without story: walkable and tuned, with the camera
   checked all the way up the trunk.
3. **Story hook-up:** the note, Journal III at the carving, the flower crown,
   and the owl guide.
4. **Then rocky:** the grapnel refit, using the grove's vault for its fitting,
   and Archway Isle.

## Risks

- **The camera on the trunk spiral.** Climbing round a 14 m cylinder with a
  third-person camera is the main risk. The camera should swing out round the
  trunk, not clip into it. Prototype this first, with grey boxes, before
  building any art.
- **Too much at once on screen.** The sea tree is about 27k triangles (54k
  with outlines). The walkable tree is closer and more detailed, so merge it
  into a few meshes like the wreck, and check frame time on Low.
- **Story gate.** Chapter III now needs the Oak hull and the anchor quest as
  well as Sails 1, so check the pacing once it's playable.

## Decisions (2026-11-24)

1. **Journal III is at the carving.** The roots are the way in, and the
   journal waits at the heart.
2. **The anchor is required.** You need the anchor to go ashore at the
   Elder Grove, so Journal III needs it too, with no sea-search fallback.
3. **No bouncy mushrooms here.** The grove sticks to walking and jumping.
   The launch idea moves to the volcanic level as steam vents.
4. **The owl guides you up the tree.** It never talks: it hoots and flies
   ahead, nothing more.
