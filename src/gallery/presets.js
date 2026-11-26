// The look-dev gallery's fixed choices: poses, lighting and cameras. Plain
// data with no three.js, so tools/check.mjs can read it in Node.
import { SEA_ZONES } from '../sea-zones.js';

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

// Rough water (sea-zones.js) by severity, 1-3: `worst` is in the middle of a zone's worst
// water, looking along it; `offing` is 500 m outside it, looking in, to see what shows
// of it from plain sea. Each is [x, z, turn]: the turn (radians, as a heading) is which
// way the subject and the cameras face there. A ring is seen from the side nearest Port Haven.
function roughPlaces(Z) {
  if (Z.edge) return { worst: [300, Z.inner + 150, Math.PI / 2], offing: [300, Z.inner - (Z.fadeIn ?? Z.fade) - 500, 0] };
  const l = Math.hypot(Z.x, Z.z), ux = -Z.x / l, uz = -Z.z / l, mid = (Z.inner + Z.outer) / 2, out = Z.outer + Z.fade + 500;
  const inward = Math.atan2(-ux, -uz);
  return { worst: [Z.x + ux * mid, Z.z + uz * mid, inward + Math.PI / 2], offing: [Z.x + ux * out, Z.z + uz * out, inward] };
}
export const ROUGH_PLACES = Object.fromEntries(SEA_ZONES.filter((Z) => Z.severity).map((Z) => [Z.severity, roughPlaces(Z)]));

// Where on the map the subject sits, for the sea round it (sea-zones.js): metres east
// and south of Port Haven. `shallows` is the middle of home waters and `bank` their
// edge. `coastal` is the plain sea of the coast, far enough off that no zone shows even
// on the horizon of the highest camera, so its pictures only change when the sea does.
// `open` is the open sea, clear of every zone. `rough` and `offing` are rough water from
// inside and from outside: which zone is `severity` (1-3; the roughest unless said).
export const SEA_PLACES = { coastal: [100000, 0], shallows: [0, 0], bank: [1190, 0], open: [-4700, -500], rough: ROUGH_PLACES[3].worst, offing: ROUGH_PLACES[3].offing };

/** Where a `zone` (and, in rough water, a `severity`) puts the subject: [x, z, turn], or null if there's no such place. */
export function seaPlace(zone, severity) {
  const P = (zone === 'rough' || zone === 'offing') && severity != null ? ROUGH_PLACES[severity]?.[zone === 'rough' ? 'worst' : 'offing'] : SEA_PLACES[zone || 'coastal'];
  return P ? [P[0], P[1], P[2] || 0] : null;
}

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
