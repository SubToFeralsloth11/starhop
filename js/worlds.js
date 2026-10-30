// World metadata shared by the generator, renderer and UI.

export const LEVELS_PER_WORLD = 25;

/** Total stars needed (in addition to clearing the previous world) to open each world. */
export const WORLD_STAR_REQ = [0, 35, 80, 130, 185, 245, 310, 380];

export const WORLDS = [
  {
    name: 'Nebula Nursery',
    blurb: 'Learn to hop between sleepy planets.',
    mechanic: 'Tap to launch. Land in the next ring.',
    sky: ['#0b0630', '#1d0b4a'],
    nebula: ['#ff4fd8', '#5b8cff'],
    accent: '#9d7bff',
    planetHues: [280, 320, 200, 250],
  },
  {
    name: 'Drift Belt',
    blurb: 'These planets refuse to sit still.',
    mechanic: 'Planets drift side to side.',
    sky: ['#03142e', '#082c4f'],
    nebula: ['#00e5ff', '#3d5afe'],
    accent: '#38e1ff',
    planetHues: [190, 210, 170, 230],
  },
  {
    name: 'Asteroid Alley',
    blurb: 'Rocks fly everywhere. Duck and weave.',
    mechanic: 'Asteroids streak across and circle planets.',
    sky: ['#1a0a05', '#3a1407'],
    nebula: ['#ff8a3d', '#ff3d6e'],
    accent: '#ffa24a',
    planetHues: [20, 35, 5, 45],
  },
  {
    name: 'Laser Lattice',
    blurb: 'Gates blink on and off. Time it right.',
    mechanic: 'Laser gates switch on and off.',
    sky: ['#120018', '#2d0036'],
    nebula: ['#ff2bd6', '#ff5252'],
    accent: '#ff4dd2',
    planetHues: [300, 330, 350, 280],
  },
  {
    name: 'Crumble Cluster',
    blurb: 'Land, look, leave. Before it breaks.',
    mechanic: 'Planets crumble a few seconds after you land.',
    sky: ['#0a1406', '#16290b'],
    nebula: ['#a6ff3d', '#2bd98f'],
    accent: '#a8ff5a',
    planetHues: [95, 120, 70, 140],
  },
  {
    name: 'Event Horizon',
    blurb: 'Gravity bends every flight path.',
    mechanic: 'Black holes pull you in. Avoid the core.',
    sky: ['#040408', '#111127'],
    nebula: ['#ffd23f', '#7a3cff'],
    accent: '#ffd23f',
    planetHues: [45, 260, 30, 220],
  },
  {
    name: 'Wormhole Web',
    blurb: 'Fall in here, fall out there.',
    mechanic: 'Wormholes teleport you, heading unchanged.',
    sky: ['#00121a', '#002a33'],
    nebula: ['#2bffd5', '#ff6bd6'],
    accent: '#3dffd8',
    planetHues: [165, 180, 320, 150],
  },
  {
    name: 'The Singularity',
    blurb: 'Everything at once. Good luck, pilot.',
    mechanic: 'Every hazard, maximum difficulty.',
    sky: ['#140008', '#2a0012'],
    nebula: ['#ff2e63', '#ffd23f'],
    accent: '#ff2e63',
    planetHues: [350, 10, 40, 300],
  },
];

export const DAILY_WORLD = {
  name: 'Daily Challenge',
  blurb: 'A fresh level every day.',
  mechanic: 'A mix of hazards, new every day.',
  sky: ['#06101f', '#1b0d3a'],
  nebula: ['#ffcf3f', '#00e0ff'],
  accent: '#ffcf3f',
  planetHues: [45, 190, 300, 120],
};

export const ENDLESS_WORLD = {
  name: 'Endless',
  blurb: 'How high can you climb?',
  mechanic: 'Infinite climb. One life.',
  sky: ['#05030f', '#130a2b'],
  nebula: ['#6a5cff', '#ff4fa3'],
  accent: '#8f85ff',
  planetHues: [250, 300, 200, 330],
};
