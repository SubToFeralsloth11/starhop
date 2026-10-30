# Starhop

A one-tap orbit-hopping space game for phones (and desktops). Your ship circles a planet; tap to fling it along the tangent and land in the next planet's ring.

**Play:** https://subtoferalsloth11.github.io/starhop/

- 250 levels across 10 worlds, each adding a mechanic: drifting planets, asteroids, laser gates, crumbling planets, black holes, wormholes, everything at once, then two bonus worlds with giant gravity planets and bouncy walls. Level 25 of every world is a boss.
- 3 stars per level (clear, all star shards, under par). Stars unlock worlds. Stardust coins and one gold shard per world hide on riskier lines.
- Stardust buys 12 ships (each with a perk), paint jobs, trails and 3 upgrades (Magnet, Guide, Shield). Find all ten gold shards for a secret ship.
- Daily missions, pilot levels, star chests, mutator medals (Mirror, Turbo, Blind), a codex, 43 trophies, a 7-day login streak and Ascension (New Game+).
- Modes: daily challenge, weekly event, Shard Hunt, Endless, Zen, Time Attack and Pass & Play.
- Best-run ghosts, hint paths after five failed attempts, near-miss slow motion and save codes to move progress between devices.
- Installable PWA that works offline. Synthesized music and sound, no asset downloads.

Controls: tap / click / Space or Enter to launch; keep holding to boost. ⟲ or F reverses the orbit. Esc or P pauses. On the result screen swipe left for the next level, right to retry (or N / R).

## How levels are made

Levels are procedurally generated and **proven beatable**: `js/solver.js` plays each level with the real simulation (`js/sim.js`) and only accepts launch windows at least 0.1 s wide, starting 0.2 s after landing. Each hop is also re-checked as if the player arrived 0.8 s and 1.7 s later than the bot did. Coins and gold shards are placed on launch windows the solver did not take, and only where the solver can still finish the level afterwards. Campaign levels are generated once into `data/levels.json`; the daily challenge, weekly stages, shard hunts and endless/zen chunks are generated in a Web Worker at runtime.

## Development

No build step and no dependencies; needs Node 22 for the tools.

```sh
npm run serve    # http://localhost:8080
npm test         # simulation, progression and level-generation tests
npm run levels   # regenerate data/levels.json after changing the generator
npm run icons    # regenerate icons/*.png
```

`window.starhop` exposes the running game (`game`, `save`, `session`, `play(world, level, mutator)`) for debugging and automated play-testing.

Pushing to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/pages.yml`).

| Path | Purpose |
|---|---|
| `js/sim.js` | Deterministic physics and hazards (no DOM) |
| `js/solver.js` | Bot that proves levels are beatable |
| `js/levels.js` | Level, daily and endless generation |
| `js/progression.js` | Save data, unlocks, rewards, shop, perks, trophies, missions, XP, chests, codex, events, ascension, save codes |
| `js/game.js` | Play session: fixed-step loop, camera, effects, sound |
| `js/render.js`, `js/fx.js`, `js/ships.js` | Canvas art |
| `js/audio.js` | WebAudio sound effects and generative music |
| `js/ui.js`, `js/main.js` | Menus, HUD and app flow |

Font: [Baloo 2](https://github.com/EkType/Baloo2), SIL Open Font License (`fonts/OFL.txt`).
