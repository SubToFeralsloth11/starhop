# Starhop

A one-tap orbit-hopping space game for phones (and desktops). Your ship circles a planet; tap to fling it along the tangent and land in the next planet's ring.

**Play:** https://subtoferalsloth11.github.io/starhop/

- 200 levels across 8 worlds, each adding a mechanic: drifting planets, asteroids, laser gates, crumbling planets, black holes, wormholes, then everything at once.
- 3 stars per level (clear, all star shards, under par). Stars unlock worlds.
- Stardust buys 12 ships, 8 trails and 3 upgrades (Magnet, Guide, Shield).
- 28 trophies, a 7-day login streak, a daily challenge level and an endless mode.
- Installable PWA that works offline. Synthesized music and sound, no asset downloads.

Controls: tap / click / Space or Enter to launch. Esc or P pauses.

## How levels are made

Levels are procedurally generated and **proven beatable**: `js/solver.js` plays each level with the real simulation (`js/sim.js`) and only accepts launch windows at least 0.1 s wide, starting 0.2 s after landing. Each hop is also re-checked as if the player arrived 0.8 s and 1.7 s later than the bot did. Campaign levels are generated once into `data/levels.json`; the daily challenge and endless chunks are generated in a Web Worker at runtime.

## Development

No build step and no dependencies; needs Node 22 for the tools.

```sh
npm run serve    # http://localhost:8080
npm test         # simulation, progression and level-generation tests
npm run levels   # regenerate data/levels.json after changing the generator
npm run icons    # regenerate icons/*.png
```

`window.starhop` exposes the running game (`game`, `save`, `session`, `play(world, level)`) for debugging and automated play-testing.

Pushing to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/pages.yml`).

| Path | Purpose |
|---|---|
| `js/sim.js` | Deterministic physics and hazards (no DOM) |
| `js/solver.js` | Bot that proves levels are beatable |
| `js/levels.js` | Level, daily and endless generation |
| `js/progression.js` | Save data, unlocks, rewards, shop, trophies, daily streak |
| `js/game.js` | Play session: fixed-step loop, camera, effects, sound |
| `js/render.js`, `js/fx.js`, `js/ships.js` | Canvas art |
| `js/audio.js` | WebAudio sound effects and generative music |
| `js/ui.js`, `js/main.js` | Menus, HUD and app flow |

Font: [Baloo 2](https://github.com/EkType/Baloo2), SIL Open Font License (`fonts/OFL.txt`).
