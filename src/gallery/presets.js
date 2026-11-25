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

// Cameras. yaw 0 looks at the subject's front, pitch is radians above level.
//   fit    frame the whole subject (a 30° lens, so little distortion)
//   game   the game's own lens and distance, from behind: how it will be seen
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
  face: { kind: 'face', yaw: 0.3, pitch: 0.05 },
  helm: { kind: 'helm', yaw: 0.65, pitch: 0.16 },
  bow: { kind: 'bow', yaw: 0.95, pitch: 0.22 },
  spot: { kind: 'spot', yaw: 0.6, pitch: 0.5 },
};
export const FIT_FOV = 30;
