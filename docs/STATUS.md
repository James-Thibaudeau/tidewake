# Tidewake status

What has shipped, what's next, and known issues. **Read this before starting
work, and update it in the same pull request as the change.**

- Designs for work that hasn't started: [feature-plan.md](feature-plan.md)
- Original designs of what has shipped (reference only): [shipped-plans.md](shipped-plans.md)

Updated 2026-11-25.

## Done

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
  - Fix: wardrobe fit on the new body. Straps, pocket flaps, lapels and the
    sailor collar are bands that wrap the clothes instead of flat boxes; the
    satchel hangs behind the hip, clear of the arm; the coat covers a skirt
    and the arms hang wider beside it; sailor stripes are clean bands. The
    vest and coat have their own shoulders (they used to stop at the chest,
    leaving the shirt's), and straps lie over the sailor collar, pocket
    flaps and lapels instead of passing through them
    ([#32](https://github.com/James-Thibaudeau/tidewake/pull/32)).
  - Still open: thighs come through a skirt or coat front at a run (the
    cloth is rigid).

## Next up

- [ ] **Phase 4, ashore content and fetch quests:**
  - [x] The Elder Tree at sea: a giant, detailed landmark tree with roots,
    an owl hollow, drifting clouds, birds and fireflies
    ([#20](https://github.com/James-Thibaudeau/tidewake/pull/20))
  Phase 4 is split into thirteen smaller PRs, 4.0 to 4.12: see *Phase 4 in
  smaller PRs* in [feature-plan.md](feature-plan.md). Every landmark PR also
  rebuilds that landmark's sea view to the Elder Tree's standard.
  - [x] 4.1 The Elder Grove as a walkable level (design in
    [elder-grove-level.md](elder-grove-level.md)): the beach camp, a log
    bridge over the stream, root arches, the root gate and the vault, twice
    round the trunk on bark ledges, shelf fungus and pegs to the owl hollow,
    fungus steps to the owl bough, and an optional climb on leaf mats to the
    crown, with a diving branch back down to a pool. Hand-built in
    `src/ashore/grove.js` from `grove-layout.js`; `node tools/check.mjs grove`
    checks its limits and walks a test climber up it (40 s to the owl bough
    at a walk, 19 jumps).
    - **Climbing round a tree is easier to control** (this also changes the
      lookout tree on ordinary islands). The camera there is now a tower
      camera: it looks straight in at the trunk and orbits with you, so left
      and right on the stick run round the tree and jumps go across the
      screen. A drag is kept as an offset instead of snapping back. Before,
      it looked about 50° off the trunk, so no stick direction ran along the
      ledge.
    - Fix: walking into a low step at a slant slid you along its face
      instead of stepping up (`controller.js` judged "blocked" by velocity,
      not by where you were steering). On the spiral that stalled you and
      pushed you off the outside edge.
    - The grove's leaf clumps hang from forks at the bough tips, outside the
      climb and the camera that circles it. Nothing hangs over the spiral
      any more: the leaf mats that are the way down from the carving now
      hang beyond the owl bough's tip.
    - The camera ducks under a bough or ledge overhead (it looks along more
      level from below it) instead of rising into it. Passing under the owl
      bough on the spiral used to put the camera inside the bough.
    - Fix: low steps are taken in stride. Stepping up used to carry you 19 cm
      forward in one tick, a lurch at every step of the spiral, and on flat
      ground beside a wall it could fire over and over.
    - A long fall costs one stretch, not the whole climb: once a lantern up
      the tree is lit, a fall of more than 6 m that lands well below it puts
      you back at the last lantern you touched (`level.fallBack`, grove
      only). Each bough of the crown climb has a lantern. The dive into the
      pool doesn't count, and the leaf-mat way down (off the owl bough's
      tip) has no drop over 6 m.
      Jumping straight to the ground from the hollow or higher does send you
      back up, so every lit lantern from the hollow up offers "Climb down to
      the roots", which sets you down by the root gate.
    - Played by hand with the new camera, out along a bough, on Low
      quality and on a phone (2026-11-25).
    - The pool is a still disc on the grass, not real water.
  - [x] 4.2 The grove's story
    ([#34](https://github.com/James-Thibaudeau/tidewake/pull/34)). Journal III has moved off the beach and up
    the tree: chapter III's step is "Go ashore at the Elder Grove", there is
    no search from the sea, and the anchor is needed (without one the step
    says so). Saves that already hold Journal III keep it.
    - A note on the tent pole at the camp sends you inland.
    - At the root of the owl bough, his carving: a heart, two sets of
      initials too worn to read, a little anchor. Journal III is wedged in a
      crack beside it once the story has reached chapter III; before that you
      can only look at the carving, and afterwards you can read the journal
      there.
    - The crown's chest holds the flower crown, which is found nowhere else.
      A chest already opened in 4.1 comes back until you have the crown.
    - The owl guide (`src/ashore/grove-life.js`): it waits a little ahead,
      hoots when you come close and flies on, from the arch over the path,
      up the spiral, through its hollow and the owl bough, to the crown and
      the diving branch. It never talks, and it starts again on each visit.
      This is more than the design asked for, which had it start at the
      hollow.
    - Fireflies round the roots and the lower trunk at night.
    - A level can now carry its own life (`level.update`), a journal spot
      (`spots.journal`) and a chest with its own cosmetic (`chest.cosmetic`),
      ready for the other four landmarks.
    - The tree looks its age (`src/ashore/grove-art.js`). The trunk's bark
      is split by deep furrows into long plates, each a slightly different
      brown, with moss patches low down, lichen, burls, stacks of bracket
      fungus, moss cushions and climbing vines. Boughs, the log, stumps,
      roots and the root arches are in bark too. The fungus steps are banded
      brackets with a neck into the trunk; ledges, boughs and leaf mats have
      patchy moss, tufts, ferns, small mushrooms and blossoms. No collider or
      walking surface moved. Furrows follow the mesh's own columns and each
      quad is one flat colour, which is what keeps them crisp.
    - Fix: grandfather's tent was upside down (its ridge in the sand), here
      and at every camp at sea.
    - The level's own meshes are about 175k triangles with outlines on High;
      Low drops the small growth and uses a coarser trunk. Frame time on
      both, a play by hand from the beach to the crown with the owl and the
      hoot on real speakers were checked by hand (2026-11-25).
    - Not yet done: the pacing check. Chapter III now needs the Oak hull
      (120 gold) and the anchor quest as well as Sails 1.
  - [x] 4.3 Anchor refits (Phase 6), `src/refits.js`
    ([#35](https://github.com/James-Thibaudeau/tidewake/pull/35)). The system is in, but
    no new biome yet, so in normal play nothing changes: the shipwright's
    Anchor card says "Nothing more to fit yet" and other biomes still say
    "too treacherous to land on (yet)".
    - `upgrades.anchor` (0-4) is saved like the other upgrades; old saves
      start at 0 (from `freshState()`; `migrate()` leaves upgrades alone).
    - Tiers, costs and perks are `REFITS` in `config.js`. A refit is offered
      only once its biome is in `ASHORE_BIOMES`, so each biome PR adds its
      biome there and its refit is live.
    - The refit quest: offered (on docking or buying an upgrade) once you own
      the hull, rudder or keel the tier needs. The fitting waits at the vault
      of the nearest landable island of the previous biome (not a landmark),
      with a search circle until it's charted. It's never lost in a wreck.
      At a port it's fitted if you can pay; if not, the Anchor card has a
      Refit button.
    - Perks: tier 1 lands from 62 m off the shore (was 46), tier 2 drops
      anchor at up to 8 kn (was 6), tier 4 is gilded. Tier 3's "holds in
      storms" does nothing yet, because the anchor never drags.
    - The anchor at the bow is rebuilt per tier: grapnel arms, coral flukes,
      a tempered chain (it shows when the anchor is down; the chain from the
      cathead hides behind the bulwark, as the rope did), ice spikes and
      gilding.
    - Per-biome "can't land" lines (`REFIT.cantLand` in `story-text.js`)
      show once a biome has levels and your anchor isn't up to it.
    - Retrieve quests and Sable's rematches only pick islands your anchor
      holds at (`ashore.canLandNow`).
    - `debug.refit(tier, { open: ['rocky'] })` sets the tier and opens a
      biome so its refit can be played before the biome ships.
    - Played in the preview: offer → fitting at Wren Island's vault → survives
      a wreck → fitted at Port Haven (tier 1); the short-of-gold toast and the
      Refit button (tier 2); each tier's model; a pre-change save loads at
      tier 0. Not looked at on a phone.
  - [ ] 4.4 Rocky islands and 4.5 Archway Isle
  - [ ] 4.6 Tropical islands and 4.7 the Sunken Temple
  - [ ] 4.8 Volcanic islands (with the steam-vent launch) and 4.9 Mount
    Cinderhorn
  - [ ] 4.10 Cold islands and 4.11 Frostspire
  - [x] Retrieve quests, including "Find the lost map fragment": offered by
    Harbormasters (Cartographers for the fragment) once the anchor is fitted.
    The item waits at the level's vault (on generated islands, by the summit)
    and goes back to the island if you're wrecked.
  - [ ] 4.12 Harmless obstacles (crabs, gulls)
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

## Ideas (planned, not started)

- [ ] **Phase 6, anchor refits:** refit grandfather's anchor tier by tier
  to unlock each biome. Ships alongside the Phase 4 biomes.
- [ ] **Phase 7, a living sea:** random ocean events (whales, dolphins, a
  ghost ship at night…), a Sightings log, and report quests.

## Known issues

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
