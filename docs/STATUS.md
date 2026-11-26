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
  - It shipped before Phase 7 and scheduled its own encounters (harbor talk
    on the Quest Board, a search circle, the Redwing appears when you get
    close). Since Phase 7 the living sea's director decides the moment:
    it calls `rival.spawn()`, and clears the water first.
  - Sable has a tab of their own in the journal (`J`), shown once you've
    met: the race record, what you've learned, and everything Sable has
    said to you, newest first, with the story card scenes. It used to be a
    card in the middle of the Quests tab. The talk is saved in
    `state.rival.log`; older saves are given what was said in the
    encounters already behind them (all but the win or lose line).

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

- [x] **Look-dev gallery** (tooling, not a game feature): `gallery.html`
  shows one piece of the art at a time (an outfit, a ship tier, a prop, a
  landmark, a level or one of its pieces) from fixed cameras under fixed
  light, and draws contact sheets such as every top with every bag from
  behind. Driven from the URL or from `window.gallery`. No game file changed.
  How to use it is in `CLAUDE.md`; the design is in
  [shipped-plans.md](shipped-plans.md)
  ([#40](https://github.com/James-Thibaudeau/tidewake/pull/40)).
  - Not yet done: live sliders, and before/after in one image (see
    [feature-plan.md](feature-plan.md)).

- [x] **Phase 5, polish:** sound on foot, the sea's larger features and a
  retuned wave set, bigger touch targets, and a performance pass
  ([#47](https://github.com/James-Thibaudeau/tidewake/pull/47)).
  The design, and what was built instead where they differ, is in
  [shipped-plans.md](shipped-plans.md). Earlier pieces: the quest board and
  Tailor hints ([#25](https://github.com/James-Thibaudeau/tidewake/pull/25)),
  the first-landing hint and the on-foot controls in the README
  ([#11](https://github.com/James-Thibaudeau/tidewake/pull/11)), and the
  first water pass ([#38](https://github.com/James-Thibaudeau/tidewake/pull/38)).
  - **Sound on foot** (`src/audio/ashore.js`, mixed into `SoundSystem`; all
    made from oscillators and noise, like the rest):
    - A footfall each time a foot comes down, by what you're standing on:
      sand, grass, stone, wood or leaf (the surface tags on colliders and
      `groundTag`). Louder at a run.
    - A jump, and a landing that grows with the fall. They replace the sail
      and bow-slam sounds that stood in for them.
    - Coins chime, and the note climbs the scale while you keep collecting
      (it starts again after 1.6 s without one). A chest has its own
      fanfare.
    - Each island has its own air: songbirds by day and crickets at night
      on temperate islands; far-off gulls and wind whistling in the rocks on
      rocky ones (and aboard the wreck). Birds and crickets go quiet in
      rain. A new biome adds a line to `AMBIENCE`. The sea's own sound
      drops back while you're ashore.
    - The score on foot is the same wandering line as at sea, a fourth
      lower on a soft mallet, a little quicker, with a bass note under
      every few.
    - Checked through the real game loop (which sound plays when, on every
      surface) and by rendering each sound offline and measuring it against
      the existing ones. **Nobody has listened to them yet.**
  - **The sea** (`src/ocean.js`, `src/waves.js`, `WAVE_DEFS`):
    - The wave set is retuned: seven waves instead of five, the three
      biggest close in size and within 36° of each other (all seven within
      52°), no wavelength a simple multiple of another. Crests run long and weave instead of crossing into a grid.
      The storm swell is unchanged.
    - This changes how the boat rides. Measured by `node tools/check.mjs
      ride` (new: the boat's own pitch and bow-slam sums, eight headings at
      9 m/s): heave and crest heights are the same as before; pitch and roll
      now depend on your heading (in clear weather 0.7° running along the
      crests to 1.7° head-on; it was 1.4° on every heading); in a storm the
      bow slams 7.7 times a minute on average, where it was 9.7 (the worst
      heading is as bad as before, about 12). The check fails if a later
      wave change moves these far.
    - Three things larger than a wave, all colouring only: **shallows**
      (paler water over the wide shelf round every island, turquoise close
      in, and a pale patch over every reef, from a map of the world's
      shores built at load; ashore, a ring round the island you're on);
      **gusts** (darker, ruffled bands running downwind, stronger in a
      fresh breeze); **cloud shadows** (the sky's own cloud pattern, thrown
      where the sun would put it; they fade under an overcast sky, at night
      and as the sun gets low).
    - `?sea=0` in the URL turns the three off, `?sea=gusts,shade` picks
      some (`shallows`, `gusts`, `shade`), like `?fx=`.
    - Cost: the colouring pass now gets a wave's height and slope from one
      evaluation instead of four, which pays for the two extra waves and
      the new features; cloud shadows are worked out at the grid's corners.
      The sea's shader costs the same as on `main` within the noise of the
      measurement, on High and on Low.
    - Gallery: `weather=` swaps a light's weather; views `horizon`, `aloft`
      and `high`; sheets `sea`, `sea-lights` and `sea-features`.
    - Shore foam and the kraken read the same wave function and sit on the
      new water (looked at: an island's shore, and the start of the rescue).
      The rescue was not played through.
  - **Phones:** the stick, Jump, the spyglass button and the HUD's icon
    buttons are bigger; the stick and Jump also take a press that lands a
    little outside them; every button, tab and chip in the menus is at
    least 44 px tall on touch. Looked at on a 375×812 screen. The stick's
    dead zone and run threshold are `TOUCH` in `config.js`; **not tuned on
    a real phone.** On Low, generated islands also drop half their sea
    stacks and the ink line on flowers and bushes (Low already halved the
    trees and left out grass tufts and pebbles).
  - **Performance** (`tidewake.debug.profile()` counts a frame: draw calls,
    triangles, lights and what is in view by kind, ink outlines apart;
    `debug.bench()` times frames):
    - Leaving an island already frees what it made: geometry, texture and
      shader counts come back to the same number after every visit (three
      visits each to a temperate island, a rocky one, the grove, Archway
      Isle and the wreck).
    - The sea is drawn after everything else that is solid, so its shader,
      the dearest thing on screen, no longer runs for water hidden under an
      island or behind the hull.
    - Lantern posts share two lights (Low) or three (High) instead of
      having one each: the nearest posts get them. A light costs every
      pixel of the island whether it reaches it or not, and a different
      number of lights has every shader built again. The lantern you carry
      keeps its light in the scene by day (dark), for the same reason: it
      used to be added at dusk.
    - Ashore on Low, at 1024×768 on the development Mac, ms a frame before
      → after: a temperate island 0.71 → 0.50 by day and 0.82 → 0.49 at
      night; a rocky one 0.75 → 0.36 and 0.74 → 0.40; the Elder Grove 0.60
      → 0.46 and 0.94 → 0.38. On High, where the effects are most of the
      frame, it is about the same (2.6–3.0 ms before, 2.4–3.1 after).
    - Platforms were already one mesh and one outline per level. Ink
      outlines are about a quarter of the triangles ashore on Low; the
      explorer's and the platforms' stay.

- [x] **Phase 7, a living sea** (design in
  [feature-plan.md](feature-plan.md);
  [#46](https://github.com/James-Thibaudeau/tidewake/pull/46)): every three
  to six minutes of sailing something turns up off the bow quarter, in open
  water, one at a time.
  - The director (`src/sea-events.js`) rolls from the rules in
    `src/sightings.js` (pure, so `node tools/check.mjs sea` runs them): by
    latitude, time of day, weather and story. A kind that could have been
    picked and wasn't gains weight, and the ghost ship is certain after eight
    misses. No rolls while Sable has your attention, in port, ashore, or with
    the boat stopped. The director has its own random stream.
  - A line of text says which side to look ("A spout of mist, ahead to the
    left!"). It counts as **seen** within 80 m, or held in the spyglass for
    2 s; the spyglass reaches 340 m at tier 1 and 850 m at tier 5.
  - The eight kinds:
    - **Whale** (temperate and cold, not in storms; `src/sea-life.js`),
      about 30 m, four lengths of the starting boat: blows every 8 s,
      breaches, and goes down flukes-up. Keep within 95 m at under 8 kn and
      it stays up (to about 3 minutes). She is solid wherever her body is at
      the height of the hull: at the surface you are kept about 5.5 m from
      her spine amidships (less towards the tail), deep down you sail over
      her. Run into her at speed and it costs half what a rock would, and
      she dives; a breach that catches the boat costs 9 hull, once.
    - **Dolphins** (tropical and temperate, clear or breezy): 4-8 leaping.
      Come within 75 m at over 12 kn and they ride your bow wave: 8% more
      drive from the sail while they stay (up to 45 s).
    - **Sea turtles** (tropical, by day, not in rain or storms): a slow
      line of 5-7. Come among them at under 6 kn and after 3 s one swims
      along beside you for half a minute. Bump one (2.3 m), or come within
      24 m at over 8 kn, and they all dive.
    - **A message in a bottle** (anywhere, uncommon, not in storms): a
      glint 90-170 m off. Stop and haul it up. The first holds a letter
      for the harbormaster at the third-nearest port (80 gold, never
      stale); after that, turn about, a scrap of chart that puts the
      nearest uncharted island on yours, and one of seven notes.
    - **The glowing bloom** (tropical, and half as often temperate, at
      night): a patch about 350 m across where the sea shines blue, drawn
      by the ocean shader (`uBloom`), and your wake shines while you are
      in it. Nothing to do but look.
    - **An iceberg** (cold water; `src/sea-wonders.js`), built from flat-
      faced blades of ice: a great spire 21 m tall, a second spire, a
      shoulder and a low shelf, white on top and blue in the shade. A slab
      breaks off
      with a crack and leaves five pieces of loose ice for about 100 s,
      then the berg rolls over and sinks. The berg and the ice are solid:
      a hard knock costs hull as a rock does.
    - **A waterspout** (storms only, and the likeliest thing in one; a
      storm that blows up looks for its waterspout within 40 s): a column
      that wanders across your bow for 60-85 s. Within 7.5 m it takes 13
      hull (less with a better keel) and throws the boat clear.
    - **The ghost ship** (night only, three times likelier in fog, not
      before Journal I; `src/ghost-ship.js`, her model in
      `src/ghost-model.js`): see-through, green lanterns
      that carry through fog, no wake. She is a three-master with a poop,
      quarterdeck and forecastle, wales, gun ports, lit stern windows, a
      figurehead, an anchor at the cathead, the wheel, a boat and a capstan
      on deck, shrouds with ratlines, torn and holed sails, staysails, a
      spanker, pennants and a ragged ensign; her cloth stirs while she holds
      still. She fades within 38 m and at first
      light. Stay within 340 m and she leads you 650-950 m to a strongbox
      under a beam (110-190 gold; it waits 4 minutes).
  - **Sightings**, a new tab in the journal (`J`): a card for each kind
    (and the crabs under the arch) with a drawing, how often you've seen
    it, and when and where first; a dark shape and a hint until then. Five
    whales earn the whale-tail pendant (neck), three ghost ships the
    lantern hat.
  - **Report quests** for every kind (`src/reports.js`): the first sighting
    starts one at the nearest port. Cartographer: whale 90 gold, turtles
    70. Merchant: dolphins 60. Naturalist: the bloom 80. Harbormaster:
    iceberg 100, waterspout 110. Old salt: the ghost ship 150. News goes
    stale after 3 days (2 for a waterspout); the report is dropped and the
    next sighting starts a new one. Each kind is reported once.
  - **Sighting wanted** on the quest boards (`quests.js`, type
    `sighting`), on about four boards in ten: a whale, dolphins, turtles,
    an iceberg, the glowing sea or the ghost ship, in waters where it can
    turn up, with a 520 m search circle on the chart. Inside the circle
    that kind is four times likelier and the director looks twice as
    often; it still needs its hour and weather, which the offer says. See
    it there, then any port pays (70 gold and up, by distance).
  - **The ghost ship's captain** (`src/ghost-chain.js`), a short side
    chain. After the third sighting she turns up three times as often,
    and instead of a strongbox she makes for an island you can go ashore
    on, 500-1700 m off, and fades off its shore. Follow her there and the
    island goes on your chart with a story step; her captain's log waits
    at the top (the level's vault), with 180 gold of unclaimed pay, and
    reads as four story cards: why she can't make port. It can be read
    again from her Sightings card.
  - **Ambient life** (`src/sea-ambient.js`), always on and not events:
    three gulls that come out to wheel over the boat within 380 m of an
    island by day, seabirds circling reefs, and fish jumping in calm
    water.
  - **Sable comes through the director.** `rival.js` no longer schedules
    itself: the director calls `rival.spawn()` when nothing of Sable's is
    live. A meeting at sea waits for the water to be clear, and whatever
    is out there is sent on its way first, so the Redwing never arrives on
    top of a whale. Where and when Sable appears is unchanged.
  - Saved: `state.sightings` (`seen`, `miss` for the pity counts, `chain`
    for the ghost ship's). A live event is not saved.
  - Tools: `tidewake.debug.sea(kind)` brings one on; the gallery has a
    `sealife` subject and sheet (nine kinds; not the bloom, which only the
    game's ocean can draw).
  - Checked in the preview through the real game: each kind's whole act
    and its way of leaving; the bow-wave ride; the turtle that comes
    along, the bump and the too-fast dive; three bottles (letter, chart,
    note); the bloom and the wake in it; ramming loose ice (27 hull at
    11 kn) and leaning on the berg (none); the waterspout's damage; the
    ghost ship followed to her strongbox, and with the chain begun to an
    island, then ashore to the log and its cards; a bounty taken, seen
    and paid; reports paid at port; the five-whale reward; stale news;
    the spyglass by tier; save and continue; gulls arriving, roosting at
    night and circling a reef; fish jumping; Sable held back until a
    whale had gone. Unattended sailing, 53 minutes over the south, the
    north and a forced storm: the right kinds in each, none overlapping,
    none over land. The Sightings tab at desktop and phone sizes; the
    hats and tops-front sheets for the two new pieces; the sealife sheet.
  - Not yet done: a play by hand, and **none of the new sounds have been
    heard** (the blow, splash, breach, dolphins' whistles, ghost ship's
    bell, sighting chime, the waterspout's rush and the ice's crack). The
    new writing (`SIGHTINGS`, `REPORTS`, `BOUNTY`, `BOTTLES` and
    `GHOST_LOG` in `story-text.js`) is a first draft. Tuning to judge by
    hand: how often events come, the 8% boost, the rewards, how faint the
    ghost ship is in fog, how hard ice and waterspouts hit, and how often
    boards ask for sightings. The phone-size look covered the first four
    cards only.
  - Known: the dolphins and the turtles don't collide with the boat (a
    turtle you touch dives instead). The whale's flukes aren't solid, only
    her body and tail stock.
    Reports go to the nearest port even if you haven't charted it, as the
    crabs' does. The fish's outline is heavy for its size. A bounty's
    kind can only be seen in its hour and weather, so a "glowing sea"
    bounty means waiting for night.
  - Left for later: the plan's link between events and Phase 9's sea
    zones (waterspouts likelier in rough water, turtles and the bloom in
    the home shallows), which waits for Phase 9.

## Next up

- [ ] **Phase 4, ashore content and fetch quests:**
  - [x] The Elder Tree at sea: a giant, detailed landmark tree with roots,
    an owl hollow, drifting clouds, birds and fireflies
    ([#20](https://github.com/James-Thibaudeau/tidewake/pull/20))
  Phase 4 is split into fourteen smaller PRs, 4.0 to 4.12: see *Phase 4 in
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
  - [x] 4.4 Rocky islands ([#37](https://github.com/James-Thibaudeau/tidewake/pull/37)). `rocky` is in `ASHORE_BIOMES`, so the grapnel
    refit (tier 1) is live: it's offered once you own the Balanced Rudder,
    and its fitting waits on a temperate island (Wren Island from Port
    Haven). Until it's fitted, rocky shores say "Your anchor won't grip bare
    rock. Ask the shipwright."
    - Rocky levels (`modules.js` `POOLS.rocky`, art in `pieces.js`): taller
      walls (×1.15, summits ×1.12), and three new ways up: sheer ledges
      (narrow shelves on the face), sea stacks (freestanding pillars a step
      out from the wall) and rock arches (long spans on two legs). The moat
      is crossed on sea stacks whose tops step up and down. The chest branch
      is a rock spire with shelves round it instead of a lookout tree, and a
      natural arch stands over the path from the moat. Grey shingle, thin
      turf broken by scree, pines and boulders, sea stacks offshore.
    - Gentler early on (feature plan: refits follow the story, so rocky comes
      before tropical): rocky islands count as 800 m nearer home for
      difficulty (`BIOME_EASE`). The world's rocky islands: Cobalt Isle,
      Amber Isle, Briar Point and Glimmer Skerry are medium; Otter Point,
      Plover Spire and Flint Cove hard. Averages over 300 islands: medium
      27 jumps (temperate 25), hard 33 (31); the widest required gap on a
      medium rocky island is 1.70 m (temperate 1.54, limit 1.9). Arches
      never start a climb (their leg takes the spot you'd hop on from).
    - Rocky levels are lighter than temperate ones (62-81k triangles against
      ~112k), from fewer trees.
    - Sable's foot races stay on temperate islands (`rival.js`), so a new
      biome doesn't move them in old saves.
    - Two controller fixes, found by the new climb check, which apply on
      every island (`collide.js`, `controller.js`):
      - Walking inland off the rim of a rock face: the ground there counted
        as too steep (its slope was sampled across the face's edge) and
        pushed you back onto the rim, so you had to jump. Each axis now
        takes the flatter side.
      - Walking down a bank onto a bridge's end: settling onto the ground
        moved you sideways off the deck's edge, back up the bank, every
        tick. It now only settles straight down.
    - `node tools/check.mjs climb`: the real controller, steered by a simple
      pilot (lifted from the grove check), walks 12 generated islands per
      biome from the beach to the summit; a missed hop is retried at the
      other pace. `layout` now runs 150 islands per landable biome.
    - Known: with 60 islands per biome the pilot misses 3 hops, all on easy
      islands with railed ledges on the summit rock (temperate too). The
      summit rock's invisible wall bulges into the straight line between
      two wide ledges at their joint; a player brushes it and steers round.
    - Not done: a look on a phone; a play by hand.
  - [x] 4.5 Archway Isle, in two PRs: 4.5a the walkable level and the arch
    at sea, 4.5b the story and the crab report. Design in
    [archway-isle-level.md](archway-isle-level.md).
    - [x] 4.5b, the story and the crabs
      ([#45](https://github.com/James-Thibaudeau/tidewake/pull/45)):
      - Journal IV has moved off the beach and onto the arch: chapter IV's
        step is "Go ashore at Archway Isle. He was heading for the arch.",
        and it needs the grapnel refit (without it, or without an anchor,
        the step says so). Saves that already hold Journal IV keep it.
        Finding it opens Sable's fog run as before.
      - His camp at sea has moved to the head of the bay, where the level
        has it, and the story's marker points into the bay. The way in is
        through the arch, so following the story finds the crabs too.
      - In the cove, a note pinned to his weather board sends you up.
      - At the keystone: a dark flagstone with "SAILED THROUGH" scratched
        into it, two initials too worn to read and an arrow out to sea
        (drawn as a texture, `markTexture` in `archway-art.js`), and
        Journal IV in an oilskin pouch under a stone beside it. Before the
        story reaches chapter IV you can only look at the marks; afterwards
        you can read the journal there.
      - Grandfather's storm lantern: the keystone's lantern is now an iron
        crook with a brass lantern hanging out over the seaward edge, and
        it burns after dark whether you've lit it or not. On the arch at
        sea there is one too, with a glow that carries at night.
      - The stack's chest holds the sou'wester, a new hat found nowhere
        else. A chest opened in 4.5a comes back until you have it.
      - The first report quest (`src/reports.js`): sail through the arch,
        either way, and the camera tips up at the crabs on the underside.
        "The crabs under the arch" joins the story steps (no side-quest
        slot, never expires) and points at the nearest port, Driftwood
        Landing, where a naturalist writes them down as "{captain}'s crab"
        for 120 gold and the crab pin. Saved in `state.quests.reports`.
        The naturalist is a fifth giver every port has but no board uses.
      - The crab pin is worn in the bag slot (`extra:crabPin`), high on the
        chest, so it goes with any scarf but not with a satchel.
      - A level can now word its own note and journal spot, give a chest's
        piece its own line, and draw a lantern itself (`post: false`,
        `burns`, `lamp` on a checkpoint), ready for the other landmarks.
      - Gallery: new subjects `archway` (the level) and `arch` (the sea
        view), a `spot` view for one place in a big subject (`at=keystone`),
        and the sheets `archway-story` and `pins`.
      - Played in the preview through the real game: the three step texts,
        sailing through the arch both ways, the hand-in at Driftwood
        Landing, the note, the journal, the lantern at night, the chest,
        and a save from before this change. Looked at on a phone-sized
        screen.
      - Not yet done: a play by hand, and a review of the new writing
        (`STEPS.ashore.IV`, the `arch…` lines and `REPORTS` in
        `story-text.js`), which is a first draft. The pacing check: chapter
        IV now needs the Balanced Rudder and the grapnel refit.
    - [x] 4.5a ([#39](https://github.com/James-Thibaudeau/tidewake/pull/39)):
      - The island is a U round a bay (`world.js`, `bayFor`), and the arch
        spans the mouth, so you sail in through it. The channel is carved
        through the offshore shelf; you can land from inside the bay
        (`inBay`); the chart draws the bay.
      - The arch at sea is new (`sea-arch.js`): banded rock, an undercut
        waterline, rubble, pines on its back, gulls circling and sitting on
        the ledges, surf at the legs as the waves come through, a squall that
        drifts past out to sea now and then, and crabs on the underside. The
        old `arch` prop is gone.
      - The walkable level (`archway-layout.js`, `archway.js`,
        `archway-art.js`): the cove and the storm cave (the vault), the
        gully's terraces, the cliff top, the traverse round the bay's west
        wall and out along the mouth, over the arch to the keystone, and the
        seaward stack (optional) with the chest. (The story came in 4.5b.)
      - A face camera for cliff faces (`camera.js`, `level.faces`): out over
        the water, looking in at the rock.
      - The climb-down prompt takes its lanterns and wording from the level
        ("Climb down to the cove" from the keystone and the stack).
      - `node tools/check.mjs archway`: the layout's limits, and the test
        climber from the cove over the arch (56 s, 35 jumps) and up the
        stack (11 s more, 13 jumps); 3 hops need a second try.
      - The rock (`archway-art.js`): ledges are shelves of rock growing out
        of the wall, deep where they meet it and thin at the lip, with turf
        in patches; the sea stacks are lumpy banded columns; rock is
        coloured a face at a time (`bandFaces`), so bands stay level and
        crisp, and the terrain's cliffs, whose faces are too tall to band,
        take tones that vary along the cliff instead. The handline's pins sit
        on the rock.
      - Gulls (`archway-life.js`): a few wheel over the bay by day; the rest
        sit on ledges, the inlet's stacks, the arch's back, the stack's top
        and the cove, lift off with a cry (`audio` 'gull') when you come
        within 4.5 m, circle out over the water and come back once you've
        moved on. Decor only: the gulls that swoop are 4.12.
      - Played through the real game loop by a scripted pilot steering the
        stick by the camera (stick → camera → controller, with pickups,
        lanterns, splashes, prompts, the gulls and the cameras all live):
        cove to the east arm in 60 s and up the stack in 13 s, no splashes,
        every lantern lit, the chest opened, back to the ship by the rowboat.
        It found and fixed: the face camera snapped about 70° in one frame
        at the corner into the mouth (it now blends the wall's way in and
        eases round), the shoulder's lantern stood off the path, and the
        stack's lantern and chest were off to one side of where you arrive.
      - Looked at in the preview, at desktop and phone sizes. Landing from
        inside the bay works.
      - Fixes after a play by hand (2026-11-25):
        - You sank into the ground on the gully and at the start of the
          stack. The terrain mesh draws straight lines between grid points
          1.1 m apart, but you walked on the exact height function, so on
          sharp changes (the gully's terraces) the drawn ground rose
          through your feet. Now you walk on the mesh's own triangles
          (`groundH` in `archway-layout.js`, from the same grid
          `archway.js` draws), and the gully's terraces are stone steps
          (pieces) over a floor a step lower.
        - The arch's rock carried on, flat, past the arms' edges, so by the
          stack you waded through it. Over the arms it now goes no higher
          than the ground.
        - Boulders on the cliff tops and the beach are solid.
        - The storm cave: the camera was pushed in close by the narrow nook
          and could end up inside its overhang. The cave is wider and
          deeper, its lintel high and solid, and the camera looks straight
          in while you're at it (a `faces` entry).
  - [ ] 4.6 Tropical islands and 4.7 the Sunken Temple
  - [ ] 4.8 Volcanic islands (with the steam-vent launch) and 4.9 Mount
    Cinderhorn
  - [ ] 4.10 Cold islands and 4.11 Frostspire
  - [x] Retrieve quests, including "Find the lost map fragment": offered by
    Harbormasters (Cartographers for the fragment) once the anchor is fitted.
    The item waits at the level's vault (on generated islands, by the summit)
    and goes back to the island if you're wrecked.
  - [ ] 4.12 Harmless obstacles (crabs, gulls)
- [x] **Phase 9, sea zones:** the map gets a shape you can feel at the
  helm. Three PRs, 9.1 to 9.3: see *Phase 9* in
  [feature-plan.md](feature-plan.md).
  - [x] **9.1 Home waters**
    ([#48](https://github.com/James-Thibaudeau/tidewake/pull/48)):
    - **`src/sea-zones.js`** (pure): the zone table (`SEA_ZONES`, one row
      so far), `bandAt(x, z)` (home, coastal or open) and `seaAt(x, z)` →
      `{ shallow, rough, severity, zone, wave, swell }`. Home waters reach
      1,000 m from Port Haven and fade out over the next 400; the open sea
      starts at 3,500 m. `rough` stays 0 until 9.2 adds its rows.
    - **Calmer waves at home:** the wave scale and the swell are halved
      inside, on the CPU (`waveHeight` in `waves.js`) and in the shaders
      (the same table written out as GLSL, so shore foam and the other
      wave-aware materials follow). The ocean works the factor out once a
      vertex and hands it to the pixels. Bow slams and the camera's roll
      use the swell where the boat is.
    - **Storms by distance** (`weather.js`, `BANDS` in `sea-zones.js`):
      the next weather is weighted by the band the boat is in. No storm
      starts in home waters and rain is half as likely; a storm blows out
      40 s after you sail home. In the open sea storms and rain are 1.5
      times as likely and a storm lasts 120–220 s. `calmTimer` still keeps
      a new voyage's first five minutes fair.
    - **The clear shallows** (`ocean.js`, `SHALLOWS_GLSL`, a block of its
      own): turquoise water with sand, beds of weed, ripple bands and slow
      caustic lines showing through near the camera, shallower close to a
      shore (it reads the Phase 5 shore map, not a second one). The edge
      is a lumpy bank with a paler lip. Fades at night, under rain and
      with distance. `?sea=0` hides it with the other large features.
    - **Ashore and in the gallery** the sea is drawn round (0, 0), so
      `setSeaOrigin` (`waves.js`) says where that is on the map: a level
      gets the sea of where its island lies.
    - **Tools:** `tidewake.debug.zone()`; a `seazones` group in
      `tools/check.mjs` and a home-waters case in `ride`; the gallery's
      `zone` parameter (`shallows`, `bank`, `coastal`) and the `shallows`
      and `sea-zones` sheets.
    - **Measured:**
      - Share of time in a storm, over 2,000,000 s of the weather machine
        in each band: 7.8% before, everywhere; now 0% at home, 7.8% on the
        coast, 16.4% in the open sea. An unattended boat in the whole
        game, 40 hours a band: 0%, 7.2% and 15.2%.
      - A storm at home (`ride`): pitch 3.7° and 3.5 bow slams a minute,
        against 7.2° and 7.7 outside. Plain sea is as it was.
      - A frame at sea on the development Mac, before → after: inside home
        waters 4.62 → 5.03 ms on High (2048×1536) and 0.94 → 1.03 ms on
        Low (1024×768); outside them no change (4.75 and 0.95 either way).
      - The gallery's sea sheets in plain sea (`zone=coastal`) match the
        old ones cell for cell; the world's islands, reefs and wreck are
        where they were.
    - **Not as planned:** the plan's weights of × 2 in the open sea gave
      21% of the time in a storm, nearly three times the coast's, so they
      are × 1.5 (one line in `BANDS`). The open sea is not yet "a shade
      darker".
  - [x] **9.2 Rough water**
    ([#53](https://github.com/James-Thibaudeau/tidewake/pull/53)):
    - **Three zones**, as rows in `SEA_ZONES`: the Frostspire Reach
      (severity 3, rough from 600 to 1,500 m from the island's centre,
      worst at 850–950), the Cinder Rip (severity 2, 600 to 1,200 m) and
      the Outer Swell (severity 1). The two rings are centred on their
      landmark islands, read from the world once it is built
      (`placeSeaZones`, by `landmark` key); the hole in each is its calm
      pocket. The Outer Swell is not a ring, so it has a form of its own
      (`edge: true`): a band measured along the further axis from the
      world's centre. It gives way inside a ring's calm pocket, because
      Frostspire's north shore lies inside the band.
    - **Waves by place:** inside, the swell never drops below a floor (0.5,
      0.8 and 1.1 by severity; a full storm is 1), and the wave scale is
      × 1, × 1.5 (the Rip's steep chop) and × 1.25. The CPU
      (`waveFactors`) and the shaders (`seaZones()` and `swellAt()` in the
      GLSL written from the same table) agree; shore foam and the other
      wave-aware materials follow. Ashore only an eighth of the floor is
      let through (`updateWaves`' last argument), or an island inside a
      zone would stand in a storm's surf for good.
    - **Damage** (`ROUGH` in `config.js`, `roughDamage`): a steady
      battering, 0.04 / 0.08 / 0.12 hull points a second at a zone's worst
      with bare poles, × 2.5 reefed and × 9 under full sail, resisted by
      `1 - keel × 0.5`. Bow slams fire under a clear sky from the floor
      alone.
    - **What you see:** rough water is darker, foams more and breaks into
      whitecaps under any sky; from outside the whitecaps still show as
      pale streaks, a broken line at the horizon from the deck. Sailing in
      shows the zone's name as a banner, and the warning is "Rough water:
      reef your sails" under full sail, "Rough water: hull taking a
      beating" otherwise. The sea chart hatches what you have charted of a
      zone and writes its name there, from the fog-of-war cells
      (`src/ui/chart-seas.js`; nothing new is saved). The words are `SEAS`
      in `story-text.js`.
    - **Kept out:** race courses and the kraken's trench ask `raceWater()`
      (`race.js`): no rough water, no home waters. The Deep is where it
      was.
    - **Worth the hull:** sunken treasure and salvage are worth more in
      rough water, up to × 1.5 at a zone's worst (`goldBonus`,
      `ROUGH.gold`), worked out when it is hauled, so the world's own
      numbers are untouched. Twelve islands gain by it, ten of them by a
      quarter or more: eight in the Outer Swell (Heron Atoll
      175 → 250 gold), Plover Spire in the Reach (230 → 333) and Thorn
      Atoll in the Rip (177 → 246). The banner says "Hauled out of rough
      water!". A landmark's own treasure lies in its calm pocket and is
      worth what it was.
    - **Left over from 9.1:** the open sea is a shade darker (about 4% in
      the gallery's `open` cells), ending past the world's corners so the
      gallery's plain sea stays plain. The event director reads `seaAt`:
      a storm over rough water breeds waterspouts twice as fast; turtles
      also turn up over the home shallows by day, and the bloom is twice
      as likely there at night.
    - **Tools:** `debug.zone()` adds the zone's name, the swell's floor,
      the swell now and hull points a second; `debug.teleport('reach' |
      'rip' | 'swell')` goes to the worst of a zone. The gallery's `zone`
      gains `open`, `rough` and `offing` (from 500 m outside, looking in),
      with `severity` 1–3; the `sea-zones` sheet covers every kind of sea
      under every light, and a new `rough` sheet each zone from inside and
      outside. `seazones` in `tools/check.mjs` holds each calm pocket to
      its island plus landing range, every port clear of rough water and
      one within 2,000 m of each zone, the table's centres to `world.js`,
      and the shader to the CPU at 12,769 points; `ride` has a case for
      each zone and `sea` for the director's new weights.
    - **Measured:**
      - `ride`, clear weather at each zone's worst: the Reach pitch 4.0°,
        2.8 bow slams a minute, crests to 6.3 m; the Rip 3.3°, 2.4 and
        4.5 m; the Outer Swell 2.2°, 0.4 and 2.9 m. The Reach in a storm:
        8.8° and 9.4 slams (plain sea in a storm: 7.2° and 7.7). Plain
        sea and home waters are as they were.
      - One crossing of the Reach in clear weather, wind on the beam, a
        test pilot holding a straight course in from three sides (share
        of the hull lost; the plan's target in brackets):

        | Boat | Reefed | Full sail |
        | --- | --- | --- |
        | Starting hull, no keel (100) | 25–35% (35–50%) | 50–59%, not wrecked (wrecked) |
        | Hull 3, keel 2, sails 2 (320) | 4–5% (20–30%) | 7–9% (60–80%) |
        | Everything at its best (600) | 1% (10–15%) | 2% (35–50%) |

        The starting boat is a little under its targets, which leaves room
        for 9.3's rogue waves. The bigger boats are far under, and no
        number in `ROUGH` can fix that: the battering is in hull points,
        the same for every boat, and a faster boat is through in a third
        of the time (35 s against 150 s). 9.3 has to make up the
        difference with something that grows with the boat: rogue waves
        that take a share of the hull, or battering by the metre sailed
        rather than by the second.
      - The Rip, starting boat: 14% reefed, 24% under full sail.
      - A frame at sea on the development Mac, `main` → this branch, run
        back to back: on High (2048×1536) in the Reach 7.54 → 7.87 ms, in
        the Rip 7.75 → 8.03, in the Outer Swell 7.56 → 7.74; on the coast,
        at home and in Frostspire's calm pocket no change (7.61 → 7.60,
        8.20 → 8.24, 7.21 → 7.22). On Low (1024×768) in the Reach
        1.35 → 1.43 ms; elsewhere within the noise.
      - The gallery's sea sheets from before (`sea`, `sea-lights`,
        `sea-features`, `shallows`, and the old cells of `sea-zones`)
        match cell for cell, to 0.1 in 255. The world's 110 islands, 50
        reefs, the wreck and Sable's places are where they were.
    - **Not as planned:**
      - The Outer Swell starts 100 m further out: it fills in from 6,250 m
        and is full from 6,450 m to the edge (the plan: the last 600 m
        before the current, from 6,150). Any nearer and it could reach
        Windrest's dock.
      - Frostspire can't be landed on yet (the cold biome has no levels,
        4.11), so the landing from the calm pocket was tried with the
        biome opened by `debug.refit(4, { open: ['cold'] })`.
      - Not built: fog more often in the Reach, flying spray, the chapter
        VII line and the shipwright's line about the Reach, hatching on
        the minimap, a sound for sailing in.
      - A race asked for inside a zone starts up to 750 m away, outside
        it; deep in home waters there is "no room to race".
    - **Fixed on the way:** a shipwreck ended on a blank dark screen. The
      Shipwrecked screen was drawn underneath the fade-out that comes
      before it (`#fade` above `.screen` in `style.css`, since the first
      commit), so "Wash ashore" could not be reached. It now sits above
      the fade, and the `dom` check holds it there.
    - **Worth knowing:** three islands you can land on lie in rough water,
      with their treasure: Plover Spire (rocky) in the worst of the Reach,
      Thorn Atoll (temperate) and Echo Cove in the Rip. The bonus is the
      same × 1.5 in every zone, though the Reach costs far more hull than
      the Outer Swell: one number a zone would fix that, if it matters.
  - [x] **9.3 Rogue waves and ice growlers**
    ([#55](https://github.com/James-Thibaudeau/tidewake/pull/55)):
    - **Rogue waves** in every rough zone (`src/rogue.js` has the rules,
      `src/rough-water.js` runs them, the numbers are `ROGUE` in
      `config.js`). One every 20–40 s in the Reach; every 40–70 s and
      two thirds the size in the Rip; every 70–120 s and 0.4 the size in the
      Outer Swell. The clock only runs in rough water, slower in a zone's
      fades, and the first wave comes 10–18 s after you are well in, so
      nobody crosses the Reach without meeting one.
    - **Each is announced:** a warning that says where it is ("◀ Big wave
      off the port bow!"), a low roar that swells for four seconds, and a
      dark band on the sea that grows into a dark wall 8 m tall with a
      breaking white top. It rises for 4 s and arrives 4.6 s after the
      call. The warning follows the wave as you turn: bow-on, it reads
      "Big wave dead ahead!".
    - **The wave is one ridge added to `waveHeight`** (`waves.js`:
      `rogueShape`, `rogueHeight`, `setRogueWave`, and `rogueWave()` in
      the GLSL written from the same numbers), so the ocean, the shore foam
      and the boat all have it, and the boat rides it like any other wave.
      The ocean's shader darkens it and breaks its top (`ocean.js`).
    - **What a strike costs is a share of the hull's full strength**, by
      how it was met: 1.5% bow-on with reefed sails; × 5 taken side-on,
      × 2 from astern; × 7.3 under full sail (× 0.7 with bare poles); less
      the keel, as for the wear below. So bow-on and reefed is 1.5% of any
      hull, side-on reefed 7.5%, bow-on under full sail 11%, and side-on
      under full sail 55% of a hull with no keel (24% with the best).
      Within 15° of the bow counts as bow-on. Taken side-on it also shoves
      the boat the way it runs (16 m/s, about 6 m), knocks a third off her
      speed and rolls the camera over (0.3 rad, easing back), with spray
      and the whale's splash for a sound. "Bow-on, and over the top." /
      "The wave caught you side-on!" / "Too much sail up for a wave like
      that!"
    - **It can't be sailed out from under:** a boat running before it is
      still caught (it closes at 14 m/s whatever the boat does), and the
      crest keeps its middle on a boat running along it. Running before it
      costs twice what meeting it does.
    - **The steady battering now goes by the metre sailed and as a share of
      the hull** (`roughWear` in `sea-zones.js`, `ROUGH.wear`): 7%, 14% and
      21% of the hull for each kilometre through a zone's worst with bare
      poles, × 2.5 reefed, × 4.7 under full sail, less `keel × 0.6`. A
      stopped boat counts as making 2 m/s. **Why:** rogue waves alone, as a
      share of the hull, could not reach the targets. With 9.2's battering
      left as it was, a wave cheap enough for the starting boat (38–51%
      sailed well) left hull 3 at 8–12% and the best boat at 2–7%; a wave
      dear enough to bring hull 3 to 25% (10% of the hull, bow-on) put the
      starting boat at 75%. Hull points a second weigh on a slow small boat
      and hardly at all on a fast big one, so the battering had to change
      as well. For the starting boat it costs what it did (26–34% reefed
      with the waves held off, against 9.2's 25–35%).
    - **Ice growlers, the Reach only** (`GROWLERS` in `config.js`): about
      450 of them, about 40 in sight at once, 3.6–6.4 m across, each wandering up
      to 14 m round its own place. They are the loose ice of Phase 7's
      iceberg (`chunkGeometry` in `sea-wonders.js`, drawn as two instanced
      meshes) and striking one is the same knock (`seaEvents.bump`): 40
      hull points at 11 m/s. Where they lie is worked out by hashing, so
      nothing is saved and the world's `rng()` is not touched. None in the
      calm pocket, and none within 70 m of a shore (Plover Spire lies in
      the Reach's worst).
    - **Fog more often in the Reach** (`weather: { fog: 3 }` on its row,
      `zoneWeather`): fog is three times as likely to be the next weather
      while the boat is anywhere inside the Reach's outer edge, pocket and
      island included. Over 300,000 s of the weather machine: fog 12.1% of
      the time there, against 5.6% in the open sea (storms 12.6% against
      15.7%).
    - **Also from 9.2's list:** the minimap hatches rough water you have
      charted, like the chart; the shipwright says a word about the Reach
      when you buy Hull 3; and journal VI's clue, which sends you to
      Frostspire, now ends "The water round the spire never sleeps:
      shorten sail, and turn your bow into the big waves." (It is VI's
      clue, not chapter VII: VII is found at Frostspire, after the
      crossing.) **Not built:** flying spray on the band, and a sound for
      sailing in.
    - **Tools:** `tidewake.debug.rogue(50)` sends a wave now, from 50° off
      the starboard bow (`rogue('state')` says what is out there);
      `tidewake.debug.cross({ badly })` is the test pilot
      (`src/debug-pilot.js`): one crossing of the Reach or the Rip, and
      what it cost, by cause. `debug.zone()` gives the wear in hull points
      a kilometre. The gallery takes `rogue=<seconds before it arrives>`
      and `from=<degrees>` for anything at sea, with a `rogue` sheet (18
      cells). `node tools/check.mjs` has a `rogue` group (the ridge on the
      CPU against the shader at 5,400 points; every wave reaches its boat,
      sailing on, running before it or along it; the damage rule; the wear;
      the ice; the fog) and `ride` gains a rogue wave met bow-on and on the
      beam.
    - **Measured:**
      - One crossing of the Reach in clear weather, wind on the beam, the
        test pilot sailing the real game in from three sides with four
        seeds each (share of the hull lost; the plan's target in brackets):

        | Boat | Sailed well: reefed, bow-on to each wave | Sailed badly: full sail, side-on |
        | --- | --- | --- |
        | Starting hull, no keel (100) | 37–51%, mean 44 (35–50%) | wrecked, 12 of 12, three quarters of the way in (wrecked) |
        | Hull 3, keel 2, sails 2 (320) | 20–26%, mean 22 (20–30%) | 68–71%, mean 70 (60–80%) |
        | Everything at its best (600) | 12.7–14.2%, mean 13 (10–15%) | 47–48%, mean 47 (35–50%) |

        Every cell is inside its target but for one crossing in twelve of
        the starting boat, at 50.7%. Where it went, on average: the
        starting boat sailed well, 29 wear, 9 bow slams, 6 waves (3.8
        met); hull 3 sailed well, 18 wear, 3 from waves; the best boat, 12
        wear, 1 from waves. Sailed badly each met one wave: 55, 35 and 24 points of
        the hull, on top of 40 (to the wreck), 34 and 23 of wear.
      - The Rip, nine crossings a cell: the starting boat 15–20% sailed
        well (9.2: 14%); sailed badly 59–68% when its wave strikes (eight
        of nine), 26% when none does (9.2: 24%). Hull 3: 9–10% and 15%
        (40% with a wave). The best boat: 5–7% and 10–11%.
      - `ride`: a rogue wave in the Reach lifts the boat 8.0 m; met bow-on
        it pitches her 19° (6° without it), on the beam it rolls her 13°
        (5°). Everything else in `ride` reads as it did.
      - A frame in the Reach on the development Mac, `main` → this branch,
        back to back: High (2048×1536) 7.94 → 7.99 ms with 42 growlers in
        view (four more draw calls: they cast no shadows); Low (1024×768)
        1.37 → 1.33 ms. With a wave out, in the same view: 8.07 against
        8.10 ms on High, 1.50 against 1.43 ms on Low.
      - The gallery's sea sheets (`sea`, `sea-lights`, `sea-features`,
        `shallows`, `sea-zones`, `rough`: 114 cells) match `main` cell for
        cell, to 0.03 in 255, with no rogue wave. The world's 110 islands,
        50 reefs and the wreck are where they were.
      - The warning sound, rendered offline and measured, never heard: it
        peaks at 0.15 after 3.2 s and lasts 4.3 s (the whale's splash, which
        is the strike's sound, peaks at 0.165).
    - **Not as planned:**
      - The battering by the metre, above. The keel now takes off
        `keel × 0.6` of rough water's damage, not `keel × 0.5`: with 0.5
        the best boat sat above its targets while hull 3 sat below.
      - The wave is 8 m tall, not just "tall": the Reach's own sea already
        crests at 6.3 m.
      - A side-on wave under full sail takes over half of a hull with no
        keel in one blow. That is what the targets ask of a careless
        crossing, and it keeps the careless cost in the thing you can see
        coming rather than in the steady wear; it is also the number to
        turn down first if it feels unfair (`ROGUE.sail[2]`, then raise
        `ROUGH.sail[2]` to keep the table).
      - The test pilot turns at once and never misjudges. It steered round
        every growler in clear weather; in a first run, before it looked
        for ice while turning for a wave, it struck one in about one
        crossing in six.
  - [ ] Only a person can do, 9.3: meet a rogue wave by hand in the
    starting boat (is 4.6 s enough to reef and turn bow-on with the old
    tiller? does the shove and the camera's roll feel like a blow, or like
    a glitch?); whether half a hull for one wave taken side-on is fair;
    listen to the warning sound and set its level (`case 'rogue'` in
    `audio.js`); steer through the growlers in fog and at night; read the
    new lines (port and starboard with an arrow, the shipwright, journal
    VI's clue); frame times on a real phone.
  - [ ] Only a person can do, 9.2: sail each zone by hand (how it feels at
    the helm, whether reefing feels worth it); judge on a real screen
    whether the band reads from the deck before you reach it, the Rip and
    the Outer Swell above all; whether the open sea's darker shade is
    enough; frame times on a real phone.
  - [ ] Only a person can do: judge the shallows on a real screen and
    sailing (so far: the gallery's sheets and stills from the game); run
    for home in a storm by hand; frame times on a real phone.
- [ ] **Phase 11, islands with shapes:** four PRs, 11.1–11.4: see
  *Phase 11* in [feature-plan.md](feature-plan.md). 11.4 is built; 11.1–11.3
  are not started.
  - [x] **11.4 Landmarks on the chart** (PR to come):
    - **A picture for each landmark you have found**, on the sea chart and
      the minimap, from the moment it is discovered (`state.discovered`;
      nothing new is saved, so an old save shows the ones it has found).
      The Elder Tree (canopy, trunk, arching roots); the arch, its legs on
      the arms of the bay and its feet in the water, turned to span the
      mouth as it does at sea but kept the right way up; columns under a
      broken pediment with water at their feet; a cone with a glowing
      crater, a lava run and smoke; a white needle shaded ice-blue.
    - **`src/ui/landmarks.js`**, a new UI part: one drawing function per
      `I.landmark` key in the chart's style (flat fills, dark ink), each
      drawn in a box from -1 to 1. A key with no function draws nothing.
      `chart.js` grew by four lines.
    - **One spot, `I.landmarkAt = { x, z, rot }`**, set at the end of
      `finishIsland` (Archway Isle's is `archPos`; the rest stand at the
      island's heart, the Elder Tree turned to Port Haven). `buildLandmark`,
      `buildGrove` and `buildArch` now build from it. It draws nothing from
      `rng()`: a fingerprint of every island, coast, rock, dock, treasure,
      reef and the wreck is the same before and after.
    - **Size:** 22 px across (times `dpr`) on the chart at any zoom,
      growing with the island once it is bigger than that, to 0.9 of its
      radius. On the minimap, a port anchor's size. Drawn over the island
      and the fog, under the name (which moves up to clear it), the
      treasure cross, quest markers and the boat.
    - **Checked** in the game (`debug.start()`, `teleport` to each of the
      five): the chart zoomed right out, at the opening zoom and right in,
      at 1280×800 and phone size; the minimap by each one; an island
      charted but not discovered shows no picture; a save made before the
      change with two landmarks found shows those two and no others.
  - [ ] Only a person can do, 11.4: judge the pictures on a real screen
    and phone, at a glance, beside the islands' colours (the spire on the
    cold islands' white is the weakest); whether the treasure cross over
    a picture zoomed out bothers anyone.
- [ ] **Phase 5 follow-ups** (after the polish PR; things only a person
  with the game in front of them can do):
  - [ ] Listen to the new sounds on real speakers and set their levels
    (`STEPS` and the voices in `src/audio/ashore.js`). They have only been
    rendered offline and measured, never heard.
  - [ ] Tune the joystick on a real phone (`TOUCH` in `config.js`; or set
    `tidewake.input.deadZone` on a running game). It is still 12%.
  - [ ] Sail a storm by hand. The bow slams about a fifth less often than
    before on average (see the ride numbers under Phase 5 above); if storms
    feel too easy, raise the damage in `checkBowSlam` (`game.js`), not the
    waves.
  - [ ] Frame times on a real phone. Every number so far is from a desktop.
- [ ] **Visual effects follow-ups** (after #17; `src/fx.js`, `src/toon.js`):
  - [ ] Test High quality on real phones (touch uses 2 shadow cascades,
    1024 maps, medium SMAA). Phones default to Low, which has no effects;
    decide whether High on touch should drop edges or shadows.
  - [x] Measure frame time on desktop with effects on and off:
    `tidewake.debug.bench()` times frames with the graphics card's work
    included, in a hidden tab too. At sea off Port Haven, High, 2048×1536
    on the development Mac: about 5 ms a frame with effects and 4 ms
    without; the sea's own shader is about 3 ms of either.
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
  - [x] Hand encounter delivery to the Phase 7 event director
    ([#46](https://github.com/James-Thibaudeau/tidewake/pull/46)).
  - [ ] Sounds for the kraken, the buoys' bells and the flare (they reuse
    existing sounds).
  - [ ] The towed Redwing has no collision with land, and Sable carries no
    lantern ashore at night.
  - [ ] In the fog run the panel shows the bearing but not who's ahead.

## Ideas (planned, not started)

- [ ] **Phase 6, anchor refits:** refit grandfather's anchor tier by tier
  to unlock each biome. Ships alongside the Phase 4 biomes.
- [ ] **Phase 10, things worth buying at the end:** restore grandfather's
  ship stage by stage at Port Haven and sail her; a paint yard for the
  ship (paints, sail cloth, emblems, figureheads); fireworks. Nothing adds
  stats. Four PRs, 10.1–10.4.
- [ ] **Phase 11, islands with shapes:** variety in the archipelago, as
  Archway Isle's bay gave it a shape: crescents, rings, coves, hooks, twins
  and more, spread so neighbours differ. Moon Island is the first, a
  crescent you can sail into. Landmarks, ports, islands and treasure angles
  don't move or change. Found landmarks show their picture on the chart
  (the Elder Tree, the arch…). Four PRs, 11.1–11.4.

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
- [x] Near a shore you could land on, a treasure beam a couple of ship
  lengths ahead looked like it was under the bow, but the prompt said
  "Drop anchor & go ashore", so pressing E landed you instead of hauling.
  Slowed within 40 m of a beam you now get "Sail onto the treasure to haul
  it up" until you're close enough to haul
  ([#41](https://github.com/James-Thibaudeau/tidewake/pull/41)).
- [x] While Sable was hailing you ("Race Sable…") she sails alongside, and
  her prompt blocked hauling treasure, docking and landing until you
  answered. Her challenge now gives way to whatever spot you're at
  (treasure, salvage, a dock, a story spot, or slowing by a shore to land)
  and comes back when you move on
  ([#41](https://github.com/James-Thibaudeau/tidewake/pull/41)).
