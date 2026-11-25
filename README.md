# Tidewake

A cel-shaded, open-world sailing game that runs in the browser. Explore an archipelago of more than 100 procedurally placed islands, chart the seas, haul up sunken treasure and upgrade your little boat. There's no combat, but the sea is dangerous: rocks, reefs and storms can wreck your ship and send you back to your last port.

Built with [three.js](https://threejs.org/) as plain ES modules, plus [postprocessing](https://github.com/pmndrs/postprocessing) and [three-custom-shader-material](https://github.com/FarazzShaikh/THREE-CustomShaderMaterial), all loaded from a CDN through the import map. There's no build step, so it runs straight from GitHub Pages on desktop and mobile.

## How to play

| Action | Desktop | Touch |
| --- | --- | --- |
| Raise / lower sail | `W` / `S` or `↑` / `↓` | ▲ / ▼ buttons |
| Steer | `A` / `D` or `←` / `→` | Drag the tiller (bottom left) |
| Dock, haul treasure | `E` / `Space` | Gold action button |
| Look around / zoom | Drag mouse / wheel | Drag / pinch |
| Spyglass (once upgraded) | Hold `Z` | Spyglass button |
| Sea chart | `M` | Map button |
| Journal (quests) | `J` | Journal button |

On foot (once grandfather's anchor is fitted):

| Action | Desktop | Touch |
| --- | --- | --- |
| Walk / run | `WASD` or arrows / hold `Shift` | Joystick (push to the rim to run) |
| Jump (hold for higher) | `Space` | ▲ button |
| Open chests, row back to the ship | `E` | Gold action button |
| Look around / zoom | Drag mouse / wheel | Drag / pinch |
| Pause | `Esc` | Pause button |

### Sailing tips
- **Watch the wind.** The flag on your mast and the wind dial show where the wind is blowing.
- **Beam reach is fastest.** Sailing across the wind beats running straight downwind.
- **You can't sail into the wind.** If the dial turns red ("In irons"), turn away from the wind.
- **Lower your sails in storms.** Full sail in a storm batters your hull.
- **Bank your gold.** Gold in your hold is lost if you're shipwrecked. Docking at a port banks your cargo and saves your progress. Ports are your save points.
- Glowing golden beams mark sunken treasure. Sail over one slowly and haul it up.
- Spend banked gold at any port's shipwright: sails, hull, rudder, keel, lantern and spyglass. Every tier changes how the ship looks.
- **Grandfather's Journals:** your grandfather's ship lies broken in two on a reef just past Port Haven. Slow down beside it and climb aboard (no anchor needed): cross the wreck to the torn-off stern and his cabin, where his journal and brass spyglass wait on the chart table. His other journals are scattered across the isles. Follow his clues; found pages are kept in the journal (`J`).
- **Going ashore:** buy the Oak Planking hull and the shipwright tells you about your grandfather's anchor, lying beside his wreck. Haul it up and have it fitted, then slow down by any green (temperate) island and drop anchor. Climb to the summit for gold, light lanterns as checkpoints, and look for each island's hidden chest. Gold found ashore goes in your hold until you bank it.
- Every port has a **Quest Board**: chart rumoured islands, carry parcels between ports and salvage wrecks (cyan beams). Up to three at a time; rewards are paid when you dock. A parcel or salvage aboard sinks with your ship, just like gold.
- **Captain Sable:** once you have your grandfather's first journal, the Redwing, a ship with crimson sails, starts turning up. She is rigged to match your own upgrades, and her captain will race you at sea (round buoys, and once through fog by compass bearing) and on foot, and the story moves on whether you win or lose. Harbor talk on the Quest Board says where the crimson sails were last seen.
- Every new voyage starts with the character creator. Restyle any time for free at a port's **Tailor** tab, where new hats, coats and boots are sold. Rarer pieces are hidden on the islands.
- With a spyglass, hold `Z` (or the spyglass button) to look through it from the explorer's eyes; drag to pan. Islands you spot through it are charted from afar.

## Run locally

ES modules need a web server, so opening `index.html` as a file won't work:

```bash
python3 tools/serve.py 8000
```

Then open http://localhost:8000. (`tools/serve.py` is a plain static server with caching turned off; `python3 -m http.server 8000` works too.)

After a change, run the quick checks. They need Node and nothing else:

```bash
node tools/check.mjs
```

In the browser console, `tidewake.debug.help()` lists helpers for jumping around the game while testing.

Visual effects run on the High quality setting. To compare, add `?fx=0` to the URL to turn them all off, or pick some with `?fx=edges,bloom,grade,smaa,shadows,rim`. In the console, `tidewake.fx.setEnabled(false)` flips them at runtime.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (it already includes `.nojekyll`).
2. In the repository, go to **Settings → Pages**.
3. Under *Build and deployment*, choose **Deploy from a branch**, then select `main` and `/ (root)`.
4. After a minute the game is live at `https://<you>.github.io/<repo>/`.

## Project structure

```
index.html        page shell, HUD markup, import map (three.js and libraries from CDN)
style.css         all UI styling
src/
  main.js         bootstrap: renderer, scene, main loop
  game.js         game state & rules: sailing, docking, discovery, treasure, shipwrecks
  events.js       tiny event emitter (dock, discover, haul, wreck…) for quests and story
  quests.js       quest boards: offer generation, tracking, hand-in, salvage sites
  story.js        main story: chapters, grandfather's camps, searches, rewards
  refits.js       grandfather's anchor refits: which biomes you can land on, the refit quest
  story-text.js   all story writing (journals, cards, letters), kept apart from logic
  rival.js        the rival captain: chapters, where and when Sable appears, the Redwing, rewards
  rival-text.js   everything Sable says, quest steps and story cards
  race.js         the AI helmsman, race courses and buoy races
  tow.js          a tow line between two boats
  kraken.js       the finale set piece
  ashore/         going ashore: ashore.js (visit flow, pickups), levelgen.js + modules.js +
                  pieces.js (island levels), wreck.js (grandfather's wreck, hand-built),
                  grove.js + grove-layout.js (the Elder Grove, hand-built) + grove-art.js
                  (its bark, moss and fungus) + grove-life.js (its owl guide and fireflies),
                  controller.js + collide.js (movement), camera.js, pacer.js (races on foot),
                  shapes.js (the collider shapes they all share)
  cosmetics.js    wardrobe catalogue: palettes, styles, unlock sources, appearance profile
  creator.js      character creator / port wardrobe (studio scene + panel)
  world.js        procedural islands, terrain height, island streaming
  props.js        low-poly prop library (trees, huts, lighthouse, rocks, chests…)
  elder-tree.js   the Elder Tree landmark, as seen from the sea
  boat.js         the Boat class (the player's boat and the Redwing): sailing physics, collisions
  boat/           the rest of Boat: model.js (hull, mast, sails), fittings.js (helm, keel, lanterns,
                  crow's nest), rig.js (upgrades, rig layout, animation), parts.js (shared textures and helpers)
  wake.js         the wake ribbons behind a boat
  explorer.js     the anime explorer character: rig, poses (helm / on foot), animation
  outfits.js      geometry for every wearable style, and the face texture
  ocean.js        toon water shader
  sky.js          sky dome, sun/moon/stars, clouds, lighting
  weather.js      weather states, wind, rain, lightning, wind streaks
  waves.js        shared CPU/GPU wave function
  toon.js         cel-shading gradient, rim-lit toon material, outline materials
  fx.js           post-processing (ink edges, bloom, grade, SMAA) and cascaded cel shadows
  ui.js           the UI class: HUD, banners and toasts, title, pause and wreck screens
  ui/             the rest of UI: chart.js (minimap, sea chart), port.js (port screen, journal),
                  story.js (Found! pop-up, story cards, quest tracker, races), icons.js, shared.js
  input.js        keyboard, mouse and touch controls
  audio.js        procedural WebAudio sound and music
  save.js         localStorage save/load and save-version migration
  config.js       tuning constants and upgrade catalogue
  util.js         math and noise helpers
  debug.js        console helpers for testing (tidewake.debug)
tools/
  serve.py        static dev server, caching off
  check.mjs       quick checks in Node: syntax, imports, text keys, element ids, saves, ashore layouts, the grove climb
docs/
  STATUS.md       what has shipped, what's next, known issues
  feature-plan.md designs for phases not built yet; shipped-plans.md keeps the designs of built ones
```
