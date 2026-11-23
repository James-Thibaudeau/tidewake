# Tidewake

A cel-shaded, open-world sailing game that runs in the browser. Explore an archipelago of more than 100 procedurally placed islands, chart the seas, haul up sunken treasure and upgrade your little boat. There's no combat, but the sea is dangerous: rocks, reefs and storms can wreck your ship and send you back to your last port.

Built with [three.js](https://threejs.org/) as plain ES modules. There's no build step, so it runs straight from GitHub Pages on desktop and mobile.

## How to play

| Action | Desktop | Touch |
| --- | --- | --- |
| Raise / lower sail | `W` / `S` or `↑` / `↓` | ▲ / ▼ buttons |
| Steer | `A` / `D` or `←` / `→` | Drag the tiller (bottom left) |
| Dock, haul treasure | `E` / `Space` | Gold action button |
| Look around / zoom | Drag mouse / wheel | Drag / pinch |
| Spyglass (once upgraded) | Hold `Z` or `Shift` | Spyglass button |
| Sea chart | `M` | Map button |
| Pause | `Esc` | Pause button |

### Sailing tips
- **Watch the wind.** The flag on your mast and the wind dial show where the wind is blowing.
- **Beam reach is fastest.** Sailing across the wind beats running straight downwind.
- **You can't sail into the wind.** If the dial turns red ("In irons"), turn away from the wind.
- **Lower your sails in storms.** Full sail in a storm batters your hull.
- **Bank your gold.** Gold in your hold is lost if you're shipwrecked. Docking at a port banks your cargo and saves your progress. Ports are your save points.
- Glowing golden beams mark sunken treasure. Sail over one slowly and haul it up.
- Spend banked gold at any port's shipwright: sails, hull, rudder, keel, lantern and spyglass. Every tier changes how the ship looks.
- Every new voyage starts with the character creator. Restyle any time for free at a port's **Tailor** tab, where new hats, coats and boots are sold. Rarer pieces are hidden on the islands.
- With a spyglass, hold `Z` / `Shift` (or the spyglass button) to look through it from the explorer's eyes; drag to pan. Islands you spot through it are charted from afar.

## Run locally

ES modules need a web server, so opening `index.html` as a file won't work:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (it already includes `.nojekyll`).
2. In the repository, go to **Settings → Pages**.
3. Under *Build and deployment*, choose **Deploy from a branch**, then select `main` and `/ (root)`.
4. After a minute the game is live at `https://<you>.github.io/<repo>/`.

## Project structure

```
index.html        page shell, HUD markup, import map (three.js from CDN)
style.css         all UI styling
src/
  main.js         bootstrap: renderer, scene, main loop
  game.js         game state & rules: sailing, docking, discovery, treasure, shipwrecks
  events.js       tiny event emitter (dock, discover, haul, wreck…) for quests and story
  cosmetics.js    wardrobe catalogue: palettes, styles, unlock sources, appearance profile
  creator.js      character creator / port wardrobe (studio scene + panel)
  world.js        procedural islands, terrain height, island streaming
  props.js        low-poly prop library (trees, huts, lighthouse, rocks, chests…)
  boat.js         boat model, upgrade visuals and sailing physics
  explorer.js     the anime explorer character: rig, poses (helm / on foot), animation
  ocean.js        toon water shader
  sky.js          sky dome, sun/moon/stars, clouds, lighting
  weather.js      weather states, wind, rain, lightning, wind streaks
  waves.js        shared CPU/GPU wave function
  toon.js         cel-shading gradient and outline materials
  ui.js           HUD, minimap, sea chart, port/pause/wreck screens
  input.js        keyboard, mouse and touch controls
  audio.js        procedural WebAudio sound and music
  save.js         localStorage save/load and save-version migration
  config.js       tuning constants and upgrade catalogue
  util.js         math and noise helpers
```
