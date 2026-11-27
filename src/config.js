// Global tuning knobs and the upgrade catalogue.

export const WORLD_HALF = 7000;            // world spans -7000..7000 on x and z
export const MAP_CELL = 100;               // fog-of-war cell size
export const MAP_RES = Math.ceil((WORLD_HALF * 2) / MAP_CELL);
export const DAY_LENGTH = 720;             // seconds for a full day/night cycle
export const WORLD_SEED = 1121;
export const SAVE_KEY = 'tidewake.save.v1'; // key stays put; the data inside is versioned
export const SAVE_VERSION = 2;
export const SETTINGS_KEY = 'tidewake.settings.v1';

// Guarded so the pure modules (ashore layout, collision, save migration) load
// in Node for tools/check.mjs.
export const isTouch = typeof window !== 'undefined' && (
  (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) ||
  'ontouchstart' in window);

// The on-foot joystick (input.js), in fractions of its travel. `deadZone`: a
// thumb resting this close to the centre doesn't move you; `runAt`: pushed
// past this you run. `tidewake.input.deadZone` changes it on a running game,
// for trying values on a real phone.
export const TOUCH = { deadZone: 0.12, runAt: 0.92 };

// [wavelength, amplitude, direction(radians)]
// The three biggest run within 36° of each other and are close in size, so
// crests are long and weave instead of crossing into a grid (far apart) or
// lining up as stripes (one wave much the biggest); no wavelength is a simple
// multiple of another, so the pattern doesn't repeat in rows. The boat rides
// these (waves.js runs the same table on the CPU and the GPU), so a change
// here changes how she pitches and rolls and how often the bow slams in a
// storm: `node tools/check.mjs ride` holds it to what it is now.
export const WAVE_DEFS = [
  [76, 0.74, 0.4],
  [58, 0.62, 0.74],
  [43, 0.5, 0.12],
  [29, 0.34, 0.92],
  [19, 0.22, 0.3],
  [12.3, 0.13, 0.66],
  [8.1, 0.07, 0.02],
];

// Rough water (sea-zones.js gives each zone a severity, 1-3; index 0 is plain sea).
//   floor    the least the swell is inside, in any weather, where a full storm is 1:
//            enough from severity 1 up for the bow to slam under a clear sky
//   wear     what the sea takes for every kilometre sailed through a zone's worst with
//            bare poles, as a share of the hull's full strength; `sail` is how many times
//            that under reefed and under full sail. It goes by the metre and by the share
//            so that it weighs the same on every ship: counted in hull points a second
//            (as it first was) a big fast ship was through before it had lost anything.
//            A boat that is stopped is counted as making `drift` m/s, so heaving to is
//            no shelter
//   keel     how much of the keel counts against it: a storm is resisted by 1 - keel,
//            rough water by 1 - keel × this, so the best keel takes off well under
//            two thirds and how you sail has to do the rest
//   gold     what sunken treasure and salvage are worth at a zone's worst, against the
//            same find in plain sea: it costs hull to reach, so it pays more
// The damage targets these are tuned to are in docs/feature-plan.md (Phase 9), with the
// test pilot that measures them (tidewake.debug.cross).
export const ROUGH = {
  floor: [0, 0.5, 0.8, 1.1],
  wear: [0, 0.07, 0.14, 0.21],
  sail: [1, 2.5, 4.7],
  drift: 2,
  keel: 0.6,
  gold: 1.5,
  warn: 0.3,   // how far into a zone (0-1) before the warning shows
};

// Rogue waves (rogue.js has the rules, rough-water.js runs them, waves.js draws the ridge).
//   every    seconds from one to the next at a zone's worst, by severity (rarer in its fades)
//   first    the first comes this soon after you are well in, so nobody crosses the
//            Reach without one (in a gentler zone, as much later as its waves are rarer)
//   from     how far into a zone (0-1) before they come at all
//   size     how tall, and how costly, by severity (1 = the Reach's)
//   height   the ridge's full height in metres; `front` and `back` are how far it reaches
//            ahead of and behind its crest (the front is the steeper), and `reach` how far
//            along the crest it is full height, and where it has tapered to nothing
//   speed    m/s it runs at; a boat running before it is still caught, at `close` m/s,
//            and one running along it finds the crest keeps pace (`follow`, a rate a
//            second), so no ship is fast enough to sail out from under one
//   rise     seconds it takes to stand up; it arrives `warn` seconds after the warning,
//            and is gone `fade` seconds after it has passed
//   off      it comes from between these angles off the bow (radians), on either side
//   share    what one costs, as a share of the hull's full strength, met bow-on with
//            reefed sails; `sail` is how many times that by sail setting (bare poles,
//            reefed, full), `beam` taken side-on and `stern` taken from astern. `bowOn`:
//            the sine of the angle off the bow up to which it still counts as end-on,
//            and from which it is fully side-on. The keel counts as for the battering
//   shove    m/s it throws the boat sideways when taken side-on under full sail, and
//            `lurch` how far the camera rolls then (radians)
export const ROGUE = {
  every: [null, [70, 120], [40, 70], [20, 40]],
  first: [10, 18],
  from: 0.15,
  size: [0, 0.4, 0.65, 1],
  height: 8, front: 15, back: 26, reach: [70, 110],
  speed: 16, close: 14, follow: 3,
  rise: 4, warn: 4.6, fade: 3,
  off: [0.45, 1.75],
  share: 0.015, sail: [0.7, 1, 7.3], beam: 5, stern: 2, bowOn: [0.26, 0.87],
  shove: 16, lurch: 0.3,
};

// Ice growlers (rogue.js, rough-water.js): loose ice adrift in one zone. The sea there
// is cut into squares `cell` metres across; a square holds a growler `chance` of the
// time where the zone is at its worst, none where it is weaker than `from`. Each
// reaches `r` metres from its middle and wanders up to `drift` metres round its place,
// once in `period` seconds. `see`: how far from the boat they are drawn; `shore`: none nearer
// an island than this.
export const GROWLERS = { zone: 'reach', cell: 60, chance: 0.5, from: 0.3, r: [1.8, 3.2], drift: 14, period: [90, 160], see: 380, shore: 70 };

export const UPGRADES = [
  {
    key: 'sail', name: 'Sails', stat: 'Top speed', icon: 'sail',
    tiers: [
      { label: 'Patched Canvas', cost: 0, value: 1.0 },
      { label: 'Sturdy Canvas', cost: 120, value: 1.25 },
      { label: 'Clipper Rig', cost: 400, value: 1.5 },
      { label: 'Windweaver Silk', cost: 1000, value: 1.8 },
      { label: 'Clipper Topsails', cost: 1200, value: 2.05 },
      { label: 'Royal Sunsilk', cost: 1800, value: 2.3 },
    ],
  },
  {
    key: 'hull', name: 'Hull', stat: 'Hull strength', icon: 'hull',
    tiers: [
      { label: 'Driftwood Hull', cost: 0, value: 100 },
      { label: 'Oak Planking', cost: 120, value: 150 },
      { label: 'Copper-Clad Hull', cost: 400, value: 220 },
      { label: 'Ironheart Hull', cost: 1000, value: 320 },
      { label: 'Teak Galleon Hull', cost: 1200, value: 450 },
      { label: 'Leviathan Flagship', cost: 1800, value: 600 },
    ],
  },
  {
    key: 'rudder', name: 'Rudder', stat: 'Turning', icon: 'rudder',
    tiers: [
      { label: 'Old Tiller', cost: 0, value: 1.0 },
      { label: 'Balanced Rudder', cost: 100, value: 1.25 },
      { label: "Ship's Wheel", cost: 300, value: 1.5 },
      { label: 'Master Helm', cost: 800, value: 1.8 },
      { label: "Admiral's Helm", cost: 900, value: 2.1 },
      { label: 'Golden Compass Helm', cost: 1300, value: 2.4 },
    ],
  },
  {
    key: 'keel', name: 'Keel', stat: 'Storm & impact resistance', icon: 'keel',
    tiers: [
      { label: 'Shallow Keel', cost: 0, value: 0 },
      { label: 'Weighted Keel', cost: 150, value: 0.35 },
      { label: 'Storm Keel', cost: 450, value: 0.6 },
      { label: 'Leviathan Keel', cost: 1100, value: 0.8 },
      { label: 'Twin Bilge Keels', cost: 1100, value: 0.87 },
      { label: 'Runic Abyss Keel', cost: 1600, value: 0.93 },
    ],
  },
  {
    key: 'lantern', name: 'Lantern', stat: 'Night light', icon: 'lantern',
    tiers: [
      { label: 'Candle Lamp', cost: 0, value: 28 },
      { label: 'Oil Lantern', cost: 80, value: 48 },
      { label: 'Brass Lantern', cost: 250, value: 75 },
      { label: 'Starlight Beacon', cost: 700, value: 110 },
      { label: 'Twin Lanterns', cost: 600, value: 150 },
      { label: 'Lighthouse Heart', cost: 900, value: 200 },
    ],
  },
  {
    key: 'spyglass', name: 'Spyglass', stat: 'Charting range', icon: 'spyglass',
    tiers: [
      { label: 'Bare Eyes', cost: 0, value: 320 },
      { label: 'Brass Spyglass', cost: 150, value: 480 },
      { label: "Captain's Glass", cost: 450, value: 680 },
      { label: 'Farseer Lens', cost: 1000, value: 950 },
      { label: 'Mounted Telescope', cost: 1000, value: 1250 },
      { label: 'Astral Telescope', cost: 1500, value: 1600 },
    ],
  },
];

// Grandfather's anchor, refitted a piece at a time (state.upgrades.anchor,
// 0-4). Each tier opens one more biome to going ashore. The shipwright offers
// a tier once you own `needs`; its fitting waits in a vault on an island of
// biome `from`, and fitting it costs `cost` gold. Perks add up: `range` is how
// far from the shore you can land, `speed` the fastest you can drop anchor
// (m/s; the HUD shows m/s × 1.2 as knots), `storm` that the anchor holds in a
// storm while you're ashore (without it, it drags: ashore/anchor-drag.js).
export const REFITS = [
  { label: "Grandfather's anchor", biome: 'temperate' },
  { label: 'Grapnel arms', biome: 'rocky', from: 'temperate', needs: { key: 'rudder', lvl: 1 }, cost: 150, range: 62 },
  { label: 'Coral flukes', biome: 'tropical', from: 'rocky', needs: { key: 'hull', lvl: 2 }, cost: 300, speed: 6.7 },
  { label: 'Tempered chain', biome: 'volcanic', from: 'tropical', needs: { key: 'keel', lvl: 2 }, cost: 500, storm: true },
  { label: 'Ice spikes', biome: 'cold', from: 'volcanic', needs: { key: 'hull', lvl: 3 }, cost: 800 },
];
// A storm while you're ashore (ashore/anchor-drag.js): without the tempered
// chain the anchor drags once the storm is past `start` (weather.p.storm,
// 0-1), you have `time` seconds to get back aboard, and if you don't she takes
// `hull` of her hull on the rocks. It holds again once the storm eases below `end`.
export const ANCHOR_DRAG = { start: 0.6, end: 0.3, time: 90, hull: 0.2 };
// Biomes that have ashore levels. Each Phase 4 biome PR adds its own; a
// refit is only offered once its biome is here.
export const ASHORE_BIOMES = new Set(['temperate', 'rocky', 'tropical', 'volcanic']);
export const LAND_RANGE = 46; // how close to the shore the boat must be to land (before the grapnel)
export const LAND_SPEED = 5;  // boat speed (m/s) below which you can drop anchor (before the coral flukes)

/** The anchor tier an island's biome needs (0 for temperate; -1 for a biome no refit opens). */
export const refitFor = (biome) => REFITS.findIndex((r) => r.biome === biome);

/** A perk of the refits up to `tier`: the last tier that sets it wins. */
export function refitPerk(tier, key, fallback) {
  let v = fallback;
  for (let i = 1; i <= Math.min(tier, REFITS.length - 1); i++) if (REFITS[i][key] != null) v = REFITS[i][key];
  return v;
}

export function upgradeValue(levels, key) {
  const u = UPGRADES.find((u) => u.key === key);
  return u.tiers[Math.min(levels[key] || 0, u.tiers.length - 1)].value;
}

// On-foot movement (going ashore). The controller uses these, and level
// builders must keep every required jump inside `design` (with margin).
export const ASHORE = {
  radius: 0.32,          // capsule radius (m)
  height: 1.7,           // capsule height, feet to head
  stepUp: 0.35,          // ledges this high are walked up without jumping
  slopeMax: 0.75,        // steepest walkable ground (radians, ~43°)
  walk: 4.3, run: 7.0,   // top speeds (m/s)
  accel: 45, airAccel: 14, friction: 24,
  gravity: 30,
  jumpVel: 9.6,          // a held jump: apex ≈ 1.56 m, 0.66 s in the air (controller.js, jumpArc)
  // Shares of gravity through a jump (controller.js, gravityScale): falling,
  // near the top of a held jump (upward or downward speed under hangSpeed),
  // and rising after jump is let go early (a lower jump)
  fallGravity: 1.6, hangGravity: 0.6, hangSpeed: 1.5, cutGravity: 2,
  coyote: 0.1, buffer: 0.12,
  maxFall: 32,
  // Level design limits for *required* moves (comfortable, not frame-perfect);
  // launchUp and launchReach: the most a steam vent throws you up, and how far
  // from the vent's middle what it throws you to may start
  design: { jumpUp: 1.15, gapWalk: 1.9, gapRun: 3.4, safeDrop: 6, launchUp: 6, launchReach: 1.6 },
  // Steam vents (ashore/hazards.js): a vent throws you `over` m higher than
  // what it serves, so there is time at the top to step across; while still
  // rising faster than `steerAbove` m/s you only drift (`steer` of your speed
  // and grip), so the rock you are going up beside can't catch you; a vent
  // rests `cooldown` s after it fires
  vent: { over: 2.6, steerAbove: 6, steer: 0.2, cooldown: 0.6 },
  // Crumbling basalt: it shakes for `hold` s after you land on it, then falls,
  // and is back `back` s later
  crumble: { hold: 1.0, back: 3.5 },
};

// The score (music-cues.js, audio/music.js).
//   hold     seconds a newly wanted cue must stay wanted before the music follows it,
//            so it never flips back and forth at the edge of a zone; urgentHold: the
//            same for a cue that can't wait (a storm breaking)
//   brisk, fast   boat speeds (m/s) from which a cue plays its second and third
//            levels: more layers the faster she sails
//   storm    how much of a storm (weather.p.storm, 0-1) brings on the storm's cue;
//            stormLevels: from where it plays its second and third levels
//   roughLevels   how far into rough water (0-1) its cue plays its second and third
//   fog      the weather's fog number below which the fog's cue plays (clear is 1,
//            thick fog 0.18)
//   rain     how much rain (0-1) turns a cue to its rain colour
//   ahead    seconds ahead of the audio clock that the next bar is written out
//   level    the score's own level on the music bus, under the sea
export const MUSIC = {
  hold: 8, urgentHold: 1.5, brisk: 7, fast: 14,
  storm: 0.3, stormLevels: [0.6, 0.85], roughLevels: [0.7, 0.9], fog: 0.4, rain: 0.3,
  ahead: 0.25, level: 1,
};
