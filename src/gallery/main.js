// The look-dev gallery (gallery.html): one piece of the game's art at a time,
// on neutral ground, from fixed cameras and under fixed light, so a look can
// be judged and compared without playing to it.
//
// This file owns the page: the renderer and scene, the cameras, the lighting,
// the menus, contact sheets and the console helpers on `window.gallery`
// (`gallery.help()`). What can be shown is in subjects.js, the fixed choices
// in presets.js, the contact sheets in sheets.js.
//
// The sky, sun, fog, ocean and effects are the game's own (sky.js, ocean.js,
// fx.js), driven the way game.js drives them, so the gallery can't drift from
// the game's look. Everything is in the URL: reload it, or link it.
import * as THREE from 'three';
import { Environment } from '../sky.js';
import { Ocean, SEA_FEATURES } from '../ocean.js';
import { WEATHER } from '../weather.js';
import { updateWaves, waveHeight, setSeaOrigin, setRogueWave } from '../waves.js';
import { launchRogue, stepRogue } from '../rogue.js';
import { ROGUE } from '../config.js';
import { FX, fxFlags } from '../fx.js';
import { toon } from '../toon.js';
import { initProps } from '../props.js';
import { clamp, lerp } from '../util.js';
import { SUBJECTS, controlsFor, unknownParams } from './subjects.js';
import { LIGHTS, VIEWS, WEATHERS, SEA_PLACES, ROUGH_PLACES, seaPlace, FIT_FOV } from './presets.js';
import { SHEETS, propSheet } from './sheets.js';

const HELP = `gallery
  show(params)     show something new: { show: 'outfit', top: 'coat', extra: 'satchel', view: 'back' }
  set(params)      change some parameters and keep the rest: { light: 'sunset' }; null removes one
  view(name)       ${Object.keys(VIEWS).join(' | ')}
  light(name)      ${Object.keys(LIGHTS).join(' | ')}
  sheet(name)      draw a contact sheet over the page (async); sheet(null) closes it
  step(seconds)    advance the animation without waiting for frames, then draw
  frame()          draw one frame (do this before a screenshot when the tab is hidden)
  state()          what is showing, with any parameters that were not understood
  list()           every subject, view, light and sheet, and the current subject's parameters
Other parameters: sun=<degrees> turns the light round the subject, ink=studio draws the thinner
lines of the character creator, phase=<0-1> holds a walk or run at one point of the stride,
play=0 stops the animation, weather=<${WEATHERS.join('|')}> swaps the light's weather,
waves=<0-1> calms the sea, sea=0 (or sea=${SEA_FEATURES.join(',')}) picks the sea's large features,
zone=<${Object.keys(SEA_PLACES).join('|')}> is where on the map the sea is (shallows: the clear home waters;
rough: the worst of rough water, offing: just outside it looking in, with severity=<${Object.keys(ROUGH_PLACES).join('|')}> for which zone),
rogue=<seconds> is a rogue wave that many seconds before it reaches the subject (${ROGUE.warn} = just called, 0 = on it; -1 = a second
past), coming from from=<degrees> off the bow (50, to starboard, unless said; negative = port); its size follows severity,
fx=0 (or fx=edges,bloom) as in the game.`;

const $ = (id) => document.getElementById(id);
const rad = (deg) => ((parseFloat(deg) || 0) * Math.PI) / 180;
// Parameters that change how a subject is seen, not what is built.
const SEEN = new Set(['view', 'light', 'weather', 'sun', 'ink', 'play', 'waves', 'sea', 'zone', 'severity', 'rogue', 'from', 'sheet', 'fx']);
const size = () => [Math.max(1, window.innerWidth), Math.max(1, window.innerHeight)]; // a hidden tab can report 0

function boot() {
  const canvas = $('view');
  const flags = fxFlags('high');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !flags.post, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FIT_FOV, 1, 0.3, 6000);
  const fx = new FX(renderer, scene, camera, 'high');
  const env = new Environment(scene, 'high');
  const ocean = new Ocean(scene, 'high');
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4000, 96).rotateX(-Math.PI / 2), toon('#b9b3a5'));
  const stage = new THREE.Group(); // holds the subject; `sun` turns it under the light
  scene.add(floor, stage);

  const view = { scene, camera };
  // what fx.update reads from the game
  const stub = { env, scene, weather: { p: { ...WEATHER.clear, flash: 0 } }, creator: null, ashore: null };
  const wind = new THREE.Vector2(0.94, 0.34).normalize().multiplyScalar(0.85);
  const seen = { night: 0, light: new THREE.Color(1, 1, 1) }; // what a subject is told about the light
  const orbit = { yaw: 0, pitch: 0, dist: 5, fov: FIT_FOV, target: new THREE.Vector3(), name: 'quarter' };

  let q = {};            // the parameters showing now (the URL's query)
  let subject = null, builtKey = '';
  let warnings = [];
  let t = 0, dayT = 0.5, playing = true, sheetOpen = false;

  // ---------------------------------------------------------------- drawing
  function placeCamera() {
    const yaw = orbit.yaw + stage.rotation.y, cp = Math.cos(orbit.pitch), T = orbit.target;
    camera.position.set(T.x + Math.sin(yaw) * cp * orbit.dist, T.y + Math.sin(orbit.pitch) * orbit.dist, T.z + Math.cos(yaw) * cp * orbit.dist);
    // over the sea, ride above the swell as the game's camera does (game.js, updateCamera)
    if (ocean.mesh.visible) camera.position.y = Math.max(camera.position.y, waveHeight(camera.position.x, camera.position.z) + 1.8);
    camera.lookAt(T);
    if (camera.fov !== orbit.fov) { camera.fov = orbit.fov; camera.updateProjectionMatrix(); }
  }

  /** One step of everything that moves, in the order game.js does it. */
  function tick(dt) {
    t += dt;
    const w = stub.weather.p;
    updateWaves(t, w.wave * clamp(parseFloat(q.waves ?? 1), 0, 1), w.swell);
    subject?.update?.(dt, t, seen);
    env.update(dt, dayT, w, camera, wind, t);
    seen.night = env.night;
    const L = seen.light.copy(env.oceanAmbient).add(env.oceanLight);
    L.r = Math.min(L.r, 1.1); L.g = Math.min(L.g, 1.1); L.b = Math.min(L.b, 1.1);
    const ou = ocean.uniforms;
    ou.uSunDir.value.copy(env.lightDir);
    ou.uLightCol.value.copy(env.oceanLight);
    ou.uAmbient.value.copy(env.oceanAmbient).multiplyScalar(lerp(1, 0.55, env.night));
    ou.uLantern.value.set(0, 0, 0, subject?.boat ? env.night : 0);
    ou.uLanternR.value = subject?.boat?.lanternRange || 30;
    ou.uSkyColor.value.copy(env.horizon);
    ocean.setWind(wind.x, wind.y, w.wind);
    ocean.setSky(env, w);
    ocean.update(camera);
  }

  function render() {
    fx.update(stub, view);
    fx.render(view, 1 / 60);
  }
  function frame() { fitWindow(); placeCamera(); tick(0); render(); return state(); }
  function step(seconds = 1) {
    fitWindow();
    placeCamera();
    for (let i = 0, n = Math.round(seconds * 60); i < n; i++) tick(1 / 60);
    render();
    return state();
  }

  /** Follow the window's size (a hidden tab gets no resize events, and no frames to notice in). */
  let lastW = 0, lastH = 0;
  function fitWindow() {
    const [w, h] = size();
    if (sheetOpen || (w === lastW && h === lastH)) return;
    lastW = w; lastH = h;
    resizeTo(w, h);
    if (subject && VIEWS[orbit.name]) applyView(orbit.name);
  }

  function resizeTo(w, h) {
    renderer.setSize(w, h);
    fx.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- cameras
  /** The box round everything that is drawn (hidden parts, such as other hull tiers, don't count). */
  function boundsOf(root) {
    const box = new THREE.Box3(), b = new THREE.Box3();
    root.updateWorldMatrix(true, true);
    root.traverseVisible((o) => {
      if (!o.isMesh || !o.geometry?.attributes.position) return;
      o.geometry.computeBoundingBox(); // sails and flags move their vertices
      box.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
    });
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
    return box;
  }

  /** How far back a camera at this angle must be for the box to fill the frame. */
  function fitDist(box, yaw, pitch) {
    const c = box.getCenter(new THREE.Vector3()), cp = Math.cos(pitch);
    const back = new THREE.Vector3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp); // towards the camera
    const right = new THREE.Vector3(0, 1, 0).cross(back).normalize();
    const up = back.clone().cross(right);
    // each corner must sit inside the frame from where the camera ends up
    const tan = Math.tan((FIT_FOV * Math.PI) / 360) / 1.06, d = new THREE.Vector3();
    let dist = 0;
    for (let i = 0; i < 8; i++) {
      d.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
      dist = Math.max(dist, d.dot(back) + Math.abs(d.dot(up)) / tan, d.dot(back) + Math.abs(d.dot(right)) / (tan * camera.aspect));
    }
    return dist;
  }

  function applyView(name) {
    let V = VIEWS[name];
    if (!V) { warn(`view=${name} is not a view (${Object.keys(VIEWS).join(', ')})`); name = 'quarter'; V = VIEWS.quarter; }
    if (V.kind !== 'fit' && V.kind !== 'game' && !subject[V.kind]) { warn(`view=${name} doesn't fit this subject`); name = 'quarter'; V = VIEWS.quarter; }
    const box = boundsOf(subject.group);
    orbit.name = name; orbit.yaw = V.yaw; orbit.pitch = V.pitch; orbit.fov = FIT_FOV;
    if (V.kind === 'game') {
      // the game's own lens and distance, aimed where the game aims
      if (subject.look) subject.group.localToWorld(orbit.target.set(0, subject.look.y, 0));
      else box.getCenter(orbit.target);
      orbit.fov = V.fov; orbit.dist = V.dist;
    } else if (V.kind === 'fit') {
      box.getCenter(orbit.target);
      orbit.dist = fitDist(box, V.yaw + stage.rotation.y, V.pitch);
    } else {
      const f = subject[V.kind];
      // (a place may say which way it is best looked at)
      orbit.yaw = f.yaw ?? V.yaw; orbit.pitch = f.pitch ?? V.pitch;
      subject.group.localToWorld(orbit.target.set(f.x || 0, f.y, f.z || 0));
      orbit.dist = f.span / 2 / Math.tan((FIT_FOV * Math.PI) / 360) / Math.min(1, camera.aspect);
    }
  }

  /**
   * The rogue wave, if one is asked for: launched at the subject as the game launches one
   * at the boat (rogue.js), and run on until it is `rogue` seconds short of arriving.
   */
  function rogueWave(seaX, seaZ) {
    setRogueWave();
    if (q.rogue == null) { if (q.from != null) warn(`from=${q.from} only means something with rogue=<seconds>`); return; }
    const secs = parseFloat(q.rogue), from = q.from == null ? 50 : parseFloat(q.from);
    if (!Number.isFinite(secs) || !Number.isFinite(from)) { warn(`rogue=${q.rogue}${q.from == null ? '' : `, from=${q.from}`}: both are numbers (seconds before it arrives, degrees off the bow)`); return; }
    const boat = { x: seaX, z: seaZ, heading: stage.rotation.y, vx: 0, vz: 0 };
    const W = launchRogue(boat, () => 0.5, ROUGH_PLACES[q.severity] ? Number(q.severity) : 3, rad(from));
    for (let t = 0; t < ROGUE.warn - secs && !W.done; t += 1 / 120) stepRogue(W, 1 / 120, boat);
    setRogueWave(W.x, W.z, W.dx, W.dz, W.h);
  }

  function applyLight(name, weather) {
    let P = LIGHTS[name];
    if (!P) { warn(`light=${name} is not a light (${Object.keys(LIGHTS).join(', ')})`); P = LIGHTS.noon; }
    if (weather && !WEATHERS.includes(weather)) { warn(`weather=${weather} is not a weather (${WEATHERS.join(', ')})`); weather = null; }
    dayT = P.dayT;
    stub.weather.p = { ...WEATHER[weather || P.weather], flash: 0 };
  }

  // --------------------------------------------------------------- subjects
  const warn = (text) => { if (!warnings.includes(text)) warnings.push(text); };
  const subjectKey = (p) => JSON.stringify(Object.entries(p).filter(([k]) => !SEEN.has(k)).sort());

  /** Make `params` what is showing. Rebuilds the subject only if what is built changed. */
  function build(params) {
    q = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
    if (!q.show) q.show = 'outfit';
    warnings = [];
    const key = subjectKey(q);
    applyLight(q.light || 'noon', q.weather);
    for (const f of q.sea && q.sea !== '0' ? q.sea.split(',') : []) if (!SEA_FEATURES.includes(f)) warn(`sea=${f} is not one of ${SEA_FEATURES.join(', ')} (or 0 for none)`);
    ocean.setFeatures(q.sea);
    // the subject stands at (0, 0), which in the game is Port Haven: say where it is instead
    if (q.zone && !SEA_PLACES[q.zone]) warn(`zone=${q.zone} is not a place (${Object.keys(SEA_PLACES).join(', ')})`);
    const inRough = q.zone === 'rough' || q.zone === 'offing';
    if (q.severity != null && !(inRough && ROUGH_PLACES[q.severity])) warn(inRough ? `severity=${q.severity} is not one of ${Object.keys(ROUGH_PLACES).join(', ')}` : `severity=${q.severity} only means something with zone=rough or zone=offing`);
    const [seaX, seaZ, seaTurn] = seaPlace(q.zone, q.severity) || seaPlace(SEA_PLACES[q.zone] ? q.zone : 'coastal');
    setSeaOrigin(seaX, seaZ);
    stage.rotation.y = rad(q.sun) + seaTurn; // (a place in rough water also says which way to face)
    rogueWave(seaX, seaZ);
    stub.creator = q.ink === 'studio' ? { scene } : null; // fx.js thins the ink for the creator's scene
    playing = q.play !== '0' && q.phase == null;
    if (key !== builtKey || !subject) {
      if (subject) { subject.dispose(); stage.clear(); }
      let make = SUBJECTS[q.show];
      if (!make) { warn(`show=${q.show} is not a subject (${Object.keys(SUBJECTS).join(', ')})`); make = SUBJECTS.outfit; }
      subject = make(q, stage);
      builtKey = key;
      subject.built = [...subject.warnings];
      t = 0;
      env.cloudUniforms.uOffset.value.set(0, 0); // the same sky every time
      floor.visible = subject.ground === 'floor';
      ocean.mesh.visible = subject.ground === 'sea';
      ocean.setShoal(subject.shoal || null);
      // still water inside a level that asks for it (the temple's flooded courts)
      ocean.uniforms.uCalm.value.set(subject.calm?.x || 0, subject.calm?.z || 0, subject.calm?.r || 0);
      // let poses, sails and the hull's ride settle before framing it
      applyView(q.view || 'quarter');
      placeCamera();
      for (let i = 0; i < 90; i++) tick(1 / 60);
      if (q.phase != null) subject.freeze?.(clamp(parseFloat(q.phase) || 0, 0, 1));
      if (fx.csm) fx.scan(scene);
      warnings = [];
    }
    for (const w of subject.built) warn(w);
    for (const k of unknownParams(SUBJECTS[q.show] ? q.show : 'outfit', q, SEEN)) warn(`${k}=${q[k]}: ${q.show} has no parameter "${k}"`);
    applyView(q.view || 'quarter');
    placeCamera();
    tick(0);
  }

  function state() {
    const size = boundsOf(subject.group).getSize(new THREE.Vector3());
    const r = (n) => Math.round(n * 100) / 100;
    return {
      ...q, view: orbit.name, light: q.light || 'noon',
      note: subject.note || null, warnings: [...warnings],
      size: [r(size.x), r(size.y), r(size.z)], distance: r(orbit.dist), playing,
    };
  }

  // ------------------------------------------------------------------- page
  function syncPage() {
    const query = new URLSearchParams(q).toString();
    history.replaceState(null, '', '?' + query);
    const cap = $('caption');
    cap.textContent = '';
    const line = (text, cls) => { const d = document.createElement('div'); d.textContent = text; if (cls) d.className = cls; cap.append(d); };
    line('?' + decodeURIComponent(query));
    if (subject.note) line(subject.note);
    for (const w of warnings) line(w, 'warn');

    const bar = $('bar');
    bar.textContent = '';
    const menu = (key, choices, value, onPick, required = false) => {
      const label = document.createElement('label');
      const select = document.createElement('select');
      const list = required ? choices : ['', ...choices];
      if (value && !list.includes(value)) list.push(value);
      for (const c of list) { const o = document.createElement('option'); o.value = c; o.textContent = c || '·'; select.append(o); }
      select.value = value || '';
      select.addEventListener('change', () => onPick(select.value));
      label.append(key, select);
      bar.append(label);
    };
    menu('show', Object.keys(SUBJECTS), q.show, (v) => show({ show: v, light: q.light, fx: q.fx }), true);
    menu('view', Object.keys(VIEWS), VIEWS[orbit.name] ? orbit.name : '', (v) => set({ view: v }));
    menu('light', Object.keys(LIGHTS), q.light, (v) => set({ light: v }));
    menu('weather', WEATHERS, q.weather, (v) => set({ weather: v }));
    menu('zone', Object.keys(SEA_PLACES), q.zone, (v) => set({ zone: v }));
    if (q.zone === 'rough' || q.zone === 'offing') menu('severity', Object.keys(ROUGH_PLACES), q.severity, (v) => set({ severity: v }));
    menu('rogue', ['4', '3', '2', '1', '0', '-1'], q.rogue, (v) => set({ rogue: v }));
    for (const [key, choices] of controlsFor(q.show)) menu(key, choices, q[key], (v) => set({ [key]: v }));
    menu('sheet', [...Object.keys(SHEETS), 'props'], '', (v) => { if (v) sheet(v); });
  }

  function show(params = {}) { build(params); render(); syncPage(); return state(); }
  function set(params = {}) { return show({ ...q, ...params }); }

  // ---------------------------------------------------------- contact sheets
  const pause = () => new Promise((r) => setTimeout(r, 0));
  async function sheet(name) {
    const out = $('sheet');
    if (!name) { out.classList.add('hidden'); sheetOpen = false; return null; }
    const S = name === 'props' ? propSheet(Object.keys(initProps())) : SHEETS[name];
    if (!S) throw new Error(`No sheet "${name}". Try: ${[...Object.keys(SHEETS), 'props'].join(', ')}`);
    const keep = { ...q };
    const base = { ...q }; delete base.sheet;
    const { cols, cells } = S.make(base);
    const [tw, th] = S.tile, LABEL = 20, HEAD = 30;
    const rows = Math.ceil(cells.length / cols), pr = renderer.getPixelRatio();
    out.width = cols * tw * pr; out.height = (HEAD + rows * (th + LABEL)) * pr;
    const g = out.getContext('2d');
    g.scale(pr, pr);
    g.fillStyle = '#141a28'; g.fillRect(0, 0, cols * tw, HEAD + rows * (th + LABEL));
    g.fillStyle = '#e8edf7'; g.textBaseline = 'middle';
    g.font = '600 15px system-ui, sans-serif';
    g.fillText(`${name}: ${S.about}`, 10, HEAD / 2);
    g.font = '12px system-ui, sans-serif';
    sheetOpen = true;
    out.classList.remove('hidden');
    resizeTo(tw, th);
    const problems = new Map(); // warning → the cells it came from
    for (const [i, cell] of cells.entries()) {
      build(cell.q);
      render();
      const x = (i % cols) * tw, y = HEAD + Math.floor(i / cols) * (th + LABEL);
      g.drawImage(canvas, x, y, tw, th); // straight after drawing, while the frame is still there
      g.fillStyle = warnings.length ? '#ffb86b' : '#c9d2e4';
      g.fillText(cell.label, x + 8, y + th + LABEL / 2);
      for (const w of warnings) problems.set(w, [...(problems.get(w) || []), cell.label]);
      if (i % 3 === 2) await pause(); // let the page paint the sheet as it fills
    }
    resizeTo(...size());
    build(keep);
    q.sheet = name;
    render();
    syncPage();
    const told = [...problems].map(([w, at]) => (at.length === cells.length ? w : `${w} (${at.join(', ')})`));
    return { sheet: name, about: S.about, cells: cells.length, cols, rows, warnings: told };
  }

  // ------------------------------------------------------------------ input
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    orbit.yaw -= (e.clientX - drag.x) * 0.008;
    orbit.pitch = clamp(orbit.pitch + (e.clientY - drag.y) * 0.006, -0.4, 1.5);
    orbit.name = 'free';
    drag = { x: e.clientX, y: e.clientY };
    if (!playing) frame();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * 0.0012), 0.5, 900);
    orbit.name = 'free';
    if (!playing) frame();
  }, { passive: false });
  $('sheet').addEventListener('click', () => { sheet(null); delete q.sheet; syncPage(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen) $('sheet').click(); });

  // ------------------------------------------------------------------- start
  fitWindow();
  const first = Object.fromEntries(new URLSearchParams(location.search));
  show(first);
  if (first.sheet) sheet(first.sheet).catch((e) => { console.error(e); $('caption').textContent = e.message; });

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    if (sheetOpen) return;
    fitWindow();
    placeCamera();
    tick(playing ? Math.min(timer.getDelta(), 0.05) : 0);
    render();
  });

  window.gallery = {
    help() { console.log(HELP); return HELP; },
    show, set, sheet, frame, step, state,
    view: (name) => set({ view: name }),
    light: (name) => set({ light: name }),
    list: () => ({
      subjects: Object.keys(SUBJECTS), views: Object.keys(VIEWS), lights: Object.keys(LIGHTS),
      sheets: Object.fromEntries([...Object.entries(SHEETS).map(([k, s]) => [k, s.about]), ['props', 'Every prop']]),
      parameters: Object.fromEntries(controlsFor(q.show)),
    }),
  };
}

try { boot(); } catch (e) {
  console.error(e);
  document.getElementById('caption').textContent = 'Something went wrong: ' + e.message;
}
