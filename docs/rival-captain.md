# Phase 8: the rival captain (implementation plan)

How [Phase 8 of the feature plan](feature-plan.md#phase-8-the-rival-captain)
is built. The feature plan says *what*; this says *how*, and records the
decisions made along the way.

## Decisions

- **No Phase 7 director yet.** The plan delivers encounters through the
  Phase 7 event director, which isn't built. `rival.js` schedules its own
  encounters (a rumour at a port, a search circle, the sloop spawned when
  you get near). When Phase 7 lands, the director can call
  `rival.spawn()` instead; nothing else changes.
- **Sable** keeps the working name, uses they/them, and wears a dark
  tricorn with a crimson plume. Their grandmother is "the captain of the
  crimson sails", never named, like your grandparents.
- **Relic scramble** runs on a temperate island in the southern waters for
  now, because tropical islands can't be landed on until Phase 4. It moves
  to a tropical island when that biome ships.
- **The letter.** One line is added to the letters page: an envelope
  addressed to the captain of the crimson sails. Grandma keeps the rest;
  that one stays with you.
- **Losing never blocks the story.** Every race advances the chapter on a
  win or a loss. Leaving a race (sailing away, rowing back to the ship,
  being wrecked) cancels it, and Sable turns up again.
- **Rematches** after the finale are offered from a card on the Quest Board
  at whichever port Sable is visiting that day.

## Chapters

`state.rival = { chapter, wins, losses, flags }`

| chapter | Next encounter | Opens when |
| --- | --- | --- |
| 0 | 1 Crossed bows: a sprint off Port Haven | Journal I found |
| 1 | 2 Open water: a three-buoy race between two ports | Journal II, Sails 1 |
| 2 | 3 King of the hill: a foot race to a summit | Anchor fitted |
| 3 | 4 Fog run: buoys by compass bearing in fog | Journal IV, Rudder 1 |
| 4 | 5 Relic scramble: first to three relics ashore | Journal V |
| 5 | 6 Dismasted: tow Sable to a port | Journal VI, Hull 2 |
| 6 | The letter: hand it over at the port Sable is refitting in | The chest's letters found |
| 7 | The Deep: a flare at dusk, then the kraken | Letter delivered |
| 8 | Friends: Sable visits ports, rematches for gold | — |

Encounters need a new in-game day between them, so they don't chain.

## Modules and contracts

```
src/
  rival.js          chapters, conditions, encounter places, rumours, the sloop,
                    tow encounter, letter, flare, rewards, rematches, quest/tracker glue
  rival-text.js     every line Sable says, quest steps and story cards
  race.js           AutoHelm (AI helmsman), planCourse, SeaRace
  tow.js            TowLine: one boat pulling another on a rope
  kraken.js         the finale set piece
  ashore/pacer.js   LandRace: Sable on foot (summit race, relic scramble)
```

### `boat.js`: a second boat

```js
new Boat(scene, opts = {})
// opts.npc      true: not the player's boat. No PointLights (adding lights at
//               runtime recompiles every shader); lantern glow meshes only.
// opts.profile  appearance profile for the explorer at the helm
// opts.livery   { hull, trim, deck, sail, flag, pennant } colours that replace
//               the tier colours. `sail` is the cloth colour of every sail.
boat.setLivery(livery | null)  // change at runtime; null = the standard tier look
boat.setDismasted(on)          // broken stub mast, no sails/flags/rigging, a spar and canvas across the deck
boat.setVisible(on)            // the model and its wake
boat.dispose()                 // out of the scene; frees what this boat owns (not shared caches)
boat.up = { sail, rudder, keel, hull, lantern }  // plain property an NPC's driver reads and writes
simulate(dt, ctl, ...)         // ctl.drive (default 1) scales the sail's thrust (towing, pacing)
```

`Explorer` gains `dispose()`.

### `race.js`

```js
// AI helmsman: sails an NPC boat toward a point, tacking when it lies upwind
// and steering round land and rocks.
class AutoHelm {
  constructor(boat, world)
  update(dt, tx, tz, wind, opts = {})  // sets boat.sailLevel; returns ctl { steer, drive } for boat.simulate
}
// A course in open water: every leg clear of land, rocks and the world's edge.
planCourse(world, from {x, z}, opts { legs, legLen: [min, max], heading?, windAngle, rng })
  → { start: { x, z, heading }, gates: [{ x, z, r }], length } | null
class SeaRace {
  constructor(game, sloop, course, opts { title, fog, pace, onFinish({ won, time }) })
  start()            // line both boats up, sails furled, then 3-2-1-Go (ui.countdown)
  update(dt, wind)   // drives the sloop (simulate), checks gates, updates ui.setRace
  hold               // true until "Go": the player's boat must not move
  phase              // 'countdown' | 'racing' | 'done'
  gates, playerGate  // for map markers; in fog there are none
  playerNext         // { x, z } of the gate the player is sailing for
  dispose()          // buoys and HUD
}
```

`Rival.update` calls `sloop.animate(...)` once a frame, after whichever
driver moved it. Drivers only move the boat (`simulate`, or `pos`,
`heading`, `speed`, `sailLevel`).

### `tow.js`

```js
class TowLine {
  constructor(scene, lead, towed, { length = 16 })
  update(dt)   // keeps `towed` within the rope's length behind `lead`, turns it to follow, draws the rope
  dispose()
}
```

### `kraken.js`

```js
class Kraken {
  constructor(game, sloop, site { x, z, r }, opts { onRescue(), onCaught() })
  update(dt, elapsed)       // tentacles (shadow and bubbles, then the slam), hit tests, the tow
  interaction(x, z, speed)  // { prompt, action? } | null: "Throw Sable a line", "Raise your lantern"
  phase                     // 'approach' | 'tow' | 'done'
  dispose()
}
```

No combat and no hull damage: a slam that lands fades out and puts you back
at the trench edge (`onCaught`). Escaping past `site.r` with Sable in tow
calls `onRescue`.

### `ashore/pacer.js`

```js
class LandRace {
  constructor(ashore, level, enc)  // enc from game.rival.landEncounter(island)
  update(dt, t, acts)
  hold        // true during the countdown: the player can't move
  prompt()    // { prompt, action } | null, e.g. "Race Sable to the summit"
  dispose()
}
// enc = { kind: 'summit' | 'relics', profile, onMeet(), onStart(), onFinish({ won }) }
```

`ashore.js` asks `game.rival.landEncounter(island)` (cheap, pure) for the
landing prompt and on entering a level.

### UI the modules call

```js
ui.setRace({ title, line } | null)  // race panel on the HUD (replaces the quest tracker during a sea race)
ui.countdown(text | null)           // big centred "3", "2", "1", "Go!"
ui.hail(speaker, lines)             // speech banner; rival.js only
```

## Verifying

No test suite, so: syntax-check every module, then play each encounter in
the browser preview. In the console, `tidewake.rival.debug(chapter)` jumps
to a chapter (0-8), skips its gate and puts the boat near where it happens.

What was checked for the first PR, driving the game from the console with a
test pilot steering the player's boat:

- An old (v1) save loads and gains `rival`.
- All six encounters, the letter, the flare, the kraken (caught, re-try,
  rescue), the rewards and a reload afterwards.
- Losing a race still advances the story; being wrecked mid-race cancels it.
- Harbor talk appears on the Quest Board with no debug shortcuts.
- Rematches at sea and on foot, and the crimson sail switch.
- Phone size (375 wide, Low quality): the race panel and speech banner fit.

Not yet done: a person playing the races by hand, on a real phone.
