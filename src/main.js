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
import { loadSettings } from './save.js';

// Yield so the loading text can paint (setTimeout keeps working in background tabs).
const nextFrame = () => new Promise((r) => setTimeout(r, 30));
const loadingText = (t) => { const el = document.getElementById('loadingText'); if (el) el.textContent = t; };

async function boot() {
  const settings = loadSettings();
  const low = settings.quality === 'low';
  const canvas = document.getElementById('game');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !low && !isTouch, powerPreference: 'high-performance' });
  } catch (e) {
    loadingText('Sorry, your browser does not support WebGL.');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1 : isTouch ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 6000);

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

  const game = new Game({ renderer, scene, camera, world, streamer, ocean, env, weather, boat, input, audio });
  const ui = new UI(game);
  game.ui = ui;

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
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'sailing' && !game.paused) game.setPaused(true);
  });
  window.addEventListener('beforeunload', () => { if (game.mode === 'sailing') game.saveVoyage(); });

  let lastW = -1, lastH = -1;
  const clock = new THREE.Clock();
  // Warm up shaders with one frame before revealing
  game.update(0.016);
  renderer.render(scene, camera);
  ui.hideLoading();
  ui.showTitle(game.hasSave());

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    // Catch size changes that never fired a resize event (hidden tabs, iframes)
    if (window.innerWidth !== lastW || window.innerHeight !== lastH) {
      lastW = window.innerWidth; lastH = window.innerHeight;
      resize();
    }
    game.update(dt);
    renderer.render(scene, camera);
  });
  window.tidewake = game; // handy for debugging in the console
}

boot().catch((e) => {
  console.error(e);
  loadingText('Something went wrong: ' + e.message);
});
