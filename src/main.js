// Entry point: renderer, scene, systems, main loop.
import * as THREE from 'three';
import { WORLD_SEED, isTouch } from './config.js';
import { initProps } from './props.js';
import { World, IslandStreamer } from './world.js';
import { Ocean } from './ocean.js';
import { Environment } from './sky.js';
import { Weather } from './weather.js';
import { Boat } from './boat.js';
import { Input } from './input.js';
import { SoundSystem } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { Creator } from './creator.js';
import { QuestSystem } from './quests.js';
import { Story } from './story.js';
import { Ashore } from './ashore/ashore.js';
import { loadSettings } from './save.js';
import { FX, fxFlags } from './fx.js';

// Yield so the loading text can paint (setTimeout keeps working in background tabs).
const nextFrame = () => new Promise((r) => setTimeout(r, 30));
const loadingText = (t) => { const el = document.getElementById('loadingText'); if (el) el.textContent = t; };

async function boot() {
  const settings = loadSettings();
  const low = settings.quality === 'low';
  const canvas = document.getElementById('game');
  let renderer;
  try {
    // with post-processing on, SMAA replaces the canvas's own MSAA
    const post = fxFlags(settings.quality).post;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !post && !low && !isTouch, powerPreference: 'high-performance' });
  } catch (e) {
    loadingText('Sorry, your browser does not support WebGL.');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1 : isTouch ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 6000);
  const fx = new FX(renderer, scene, camera, settings.quality);
  if (settings.effects === false) fx.setEnabled(false);

  loadingText('Charting the isles…');
  await nextFrame();
  initProps();
  const world = new World(WORLD_SEED);
  const quality = low ? 'low' : 'high';
  const env = new Environment(scene, quality);
  const ocean = new Ocean(scene, quality);
  const weather = new Weather(scene, quality);
  const boat = new Boat(scene);
  const streamer = new IslandStreamer(scene, world, quality);
  const input = new Input(canvas);
  const audio = new SoundSystem();
  audio.setSound(settings.sound);
  audio.setMusic(settings.music);

  const game = new Game({ renderer, scene, camera, world, streamer, ocean, env, weather, boat, input, audio, fx });
  const ui = new UI(game);
  game.ui = ui;
  game.creator = new Creator(game);
  game.story = new Story(game);
  game.ashore = new Ashore(game);
  game.quests = new QuestSystem(game);

  loadingText('Raising the sails…');
  await nextFrame();
  const home = world.home;
  boat.place(home.dock.x, home.dock.z, home.dock.heading);
  streamer.buildAll(home.x, home.z);

  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    fx.setSize(w, h);
    for (const cam of new Set([camera, game.view.camera])) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  };
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (game.mode === 'sailing' || game.mode === 'ashore') && !game.paused) game.setPaused(true);
  });
  window.addEventListener('beforeunload', () => { if (game.mode === 'sailing' || game.mode === 'ashore') game.saveVoyage(); });

  let lastW = -1, lastH = -1;
  const timer = new THREE.Timer();
  timer.connect(document);
  // Warm up shaders with one frame before revealing
  game.update(0.016);
  fx.update(game, game.view);
  fx.render(game.view, 0.016);
  ui.hideLoading();
  ui.showTitle(game.hasSave());

  renderer.setAnimationLoop((now) => {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    // Catch size changes that never fired a resize event (hidden tabs, iframes)
    if (window.innerWidth !== lastW || window.innerHeight !== lastH) {
      lastW = window.innerWidth; lastH = window.innerHeight;
      resize();
    }
    game.update(dt);
    fx.update(game, game.view);
    fx.render(game.view, dt);
  });
  window.tidewake = game; // handy for debugging in the console
}

boot().catch((e) => {
  console.error(e);
  loadingText('Something went wrong: ' + e.message);
});
