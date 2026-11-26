// The look-dev gallery's fixed choices: poses, lighting and cameras. Plain
// data with no three.js, so tools/check.mjs can read it in Node.

// On-foot poses: what the explorer's animation is told each step.
export const POSES = {
  stand: { footSpeed: 0 },
  walk: { footSpeed: 1.6 },
  run: { footSpeed: 6 },
  jump: { footSpeed: 3, grounded: false, vy: 5 },
  fall: { footSpeed: 3, grounded: false, vy: -6 },
};

// Lighting: a time of day (0-1, as state.dayT) and a weather from weather.js.
// The sky, sun, fog and colour grade all follow from these, as in the game.
export const LIGHTS = {
  noon: { dayT: 0.5, weather: 'clear' },
  sunset: { dayT: 0.735, weather: 'clear' },
  night: { dayT: 0.0, weather: 'clear' },
  overcast: { dayT: 0.5, weather: 'cloudy' },
};

// Weathers a light's own can be swapped for (`weather=storm`), from weather.js.
export const WEATHERS = ['clear', 'breezy', 'cloudy', 'rain', 'storm', 'fog'];

// Where on the map the subject sits, for the sea round it (sea-zones.js): metres east
// and south of Port Haven. `shallows` is the middle of home waters and `bank` their
// edge. `coastal` is the plain sea of the coast, far enough off that no zone shows even
// on the horizon of the highest camera, so its pictures only change when the sea does.
export const SEA_PLACES = { coastal: [100000, 0], shallows: [0, 0], bank: [1190, 0] };

// Cameras. yaw 0 looks at the subject's front, pitch is radians above level.
//   fit    frame the whole subject (a 30° lens, so little distortion)
//   game   the game's own lens, from behind: how it will be seen (`sail`, `foot`),
//          or the sea itself from low and from high (`horizon`, `aloft`, `high`)
//   face   a close-up of the explorer's head (outfits only)
//   helm   a close-up of the explorer at the helm (ships only)
//   bow    a close-up of the anchor at the bow (ships only)
//   spot   a close-up of one place in a big subject, chosen with `at` (levels, the sea arch)
export const VIEWS = {
  front: { kind: 'fit', yaw: 0, pitch: 0.08 },
  quarter: { kind: 'fit', yaw: 0.7, pitch: 0.2 },
  side: { kind: 'fit', yaw: Math.PI / 2, pitch: 0.08 },
  back: { kind: 'fit', yaw: Math.PI, pitch: 0.08 },
  rear: { kind: 'fit', yaw: Math.PI - 0.7, pitch: 0.2 },
  top: { kind: 'fit', yaw: 0, pitch: 1.25 },
  sail: { kind: 'game', yaw: Math.PI, pitch: 0.3, dist: 30, fov: 55 },   // game.js: the chase camera
  foot: { kind: 'game', yaw: Math.PI, pitch: 0.28, dist: 7.5, fov: 55 }, // ashore/camera.js
  horizon: { kind: 'game', yaw: Math.PI, pitch: 0.09, dist: 30, fov: 55 }, // low over the water, out to the haze
  aloft: { kind: 'game', yaw: Math.PI - 0.6, pitch: 0.6, dist: 170, fov: 55 }, // from a masthead far taller than hers: the run of the crests
  high: { kind: 'game', yaw: Math.PI - 0.6, pitch: 0.62, dist: 430, fov: 55 }, // a gull's view, just under the clouds: gusts, cloud shadows, shallows
  face: { kind: 'face', yaw: 0.3, pitch: 0.05 },
  helm: { kind: 'helm', yaw: 0.65, pitch: 0.16 },
  bow: { kind: 'bow', yaw: 0.95, pitch: 0.22 },
  spot: { kind: 'spot', yaw: 0.6, pitch: 0.5 },
};
export const FIT_FOV = 30;
