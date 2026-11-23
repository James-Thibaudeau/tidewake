// Global tuning knobs and the upgrade catalogue.

export const WORLD_HALF = 7000;            // world spans -7000..7000 on x and z
export const MAP_CELL = 100;               // fog-of-war cell size
export const MAP_RES = Math.ceil((WORLD_HALF * 2) / MAP_CELL);
export const DAY_LENGTH = 720;             // seconds for a full day/night cycle
export const WORLD_SEED = 1121;
export const SAVE_KEY = 'tidewake.save.v1'; // key stays put; the data inside is versioned
export const SAVE_VERSION = 2;
export const SETTINGS_KEY = 'tidewake.settings.v1';

export const isTouch =
  (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) ||
  'ontouchstart' in window;

// [wavelength, amplitude, direction(radians)]
export const WAVE_DEFS = [
  [64, 1.0, 0.35],
  [38, 0.55, 1.45],
  [23, 0.34, -0.75],
  [14, 0.2, 2.35],
  [8.5, 0.09, 0.95],
];

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

export function upgradeValue(levels, key) {
  const u = UPGRADES.find((u) => u.key === key);
  return u.tiers[Math.min(levels[key] || 0, u.tiers.length - 1)].value;
}
