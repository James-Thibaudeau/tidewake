// The contract between the level generator, the character controller and
// the follow camera. Plain data, no three.js, so the physics can be tested
// in Node.
//
// Colliders (level space, metres, y up):
//   box(minX, minY, minZ, maxX, maxY, maxZ, tag)   axis-aligned box
//   obox(cx, cy, cz, hx, hy, hz, rotY, tag)        box rotated about y by rotY
//   cyl(x, z, r, y0, y1, tag)                      vertical cylinder
// `tag` is the surface: 'sand' | 'grass' | 'stone' | 'wood' | 'leaf' | 'water' | 'snow' | 'ice'
// (footsteps; 'ice' also slides underfoot: controller.js, ASHORE.ice).
//
// A level (from levelgen.generateLevel) is:
// {
//   group: THREE.Group,                 // everything to render, origin = island centre
//   colliders: Collider[],              // solid shapes (stand on, bump into)
//   groundAt(x, z): number,             // terrain top under (x, z); -Infinity over open water
//   groundTag(x, z): string,            // 'sand' | 'grass' | 'stone' | 'snow' | 'ice'
//   waterY: 0,                          // falling below waterY - 0.6 = splash → respawn
//   bounds: { r },                      // keep the player within r of the origin
//   spawn: { x, y, z, yaw },            // on the beach beside the rowboat
//   exit: { x, y, z, r },               // walk into this circle by the rowboat to leave
//   checkpoints: [{ id, x, y, z }],     // lantern posts along the route (spawn is implicit)
//   coins: [{ id, x, y, z, value }],    // small pickups, mostly along the route
//   caches: [{ id, x, y, z, value }],   // gold piles: summit + secret spots
//   chests: [{ id, x, y, z, yaw }],     // one cosmetic chest per island, off the main route
//   summit: { x, y, z },                // the top of the route (for the map/hints)
//   vault: { x, y, z } | null,          // where a quest item waits while a quest targets
//                                       // this island (generated levels: by the summit)
//   shoal: { x, z, r, fade } | absent,  // the sea's shallows round the island (see shoalOf)
//   dispose(),
// }
// Positions are where the pickup/marker sits (its base), in level space.

/**
 * The shallows round a level's island, for the sea's depth tint: turquoise
 * out to `r`, fading to open water over `fade` metres. A level can set its
 * own (`level.shoal`); otherwise it is the ring just inside its bounds.
 */
export const shoalOf = (level) => level.shoal || { x: 0, z: 0, r: level.bounds.r * 0.94, fade: 300 };

export const box = (x0, y0, z0, x1, y1, z1, tag = 'stone') => ({
  type: 'box', min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], tag,
});
export const obox = (cx, cy, cz, hx, hy, hz, rotY = 0, tag = 'stone') => ({ type: 'obox', c: [cx, cy, cz], h: [hx, hy, hz], rot: rotY, tag });
export const cyl = (x, z, r, y0, y1, tag = 'wood') => ({ type: 'cyl', x, z, r, y0: Math.min(y0, y1), y1: Math.max(y0, y1), tag });

/** Top surface height of a collider (for placing things on it). */
export function topOf(c) {
  if (c.type === 'box') return c.max[1];
  if (c.type === 'obox') return c.c[1] + c.h[1];
  return c.y1;
}
