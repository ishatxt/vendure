/* shared module-level constants */

export var FONT = '"Playfair Display", Georgia, serif';
export var SENT = String.fromCharCode(0x200b);

/* motion profile: snappy growth-in, calm idle sway, livelier butterflies */
export var MOTION = {
  growDur: 430,
  growMin: 220,
  leafK: 9, leafW: 18,
  petalK: 6, petalW: 11,
  sway: 1.5,
  flyCap: 6,
  flyRest: 4.2,
  flyWander: 3.5
};

/* poster motion presets: id, label, subtitle, loop duration (ms) */
export var PRESETS = [
  { id: 'breathe', label: 'Breathe', sub: 'Slow sway \u00b7 3s', T: 3000 },
  { id: 'grow', label: 'Grow & wither', sub: 'Bloom, then back \u00b7 6s', T: 6000 },
  { id: 'typed', label: 'Typed', sub: 'Type, cut, repeat \u00b7 5s', T: 5000 },
  { id: 'wind', label: 'Gust', sub: 'Wind sweeps through \u00b7 4s', T: 4000 },
  { id: 'reach', label: 'Reach', sub: 'Stems follow a light \u00b7 6s', T: 6000 },
  { id: 'scatter', label: 'Scatter', sub: 'Random bloom, fade \u00b7 6s', T: 6000 },
  { id: 'visit', label: 'Visitor', sub: 'Butterfly drops by \u00b7 7s', T: 7000 }
];
