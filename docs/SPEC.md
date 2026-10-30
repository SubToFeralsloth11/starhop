# STARHOP — Specification

## Prompt (verbatim intent)

> Build a fun, GREAT looking, time-consuming mobile game and put it on a GitHub Pages
> site. It must LOOK GREAT, the gameplay loop must be time-consuming and play out over
> time (unlocking things). If it has levels, make a lot of them so it's fun.

## Decisions (no grilling: the user said "no questions")

| Topic | Decision |
|---|---|
| Genre | One-tap orbit hopper: the ship circles a planet; tap to fling it along the tangent; land in the next planet's orbit ring. |
| Platform | Static web app (HTML/CSS/vanilla ES modules, Canvas 2D), portrait, touch-first; also playable with mouse and keyboard. No build step, no runtime dependencies. |
| Hosting | GitHub Pages from `main` via GitHub Actions. Installable PWA that works offline after first load. |
| Levels | 8 worlds × 25 levels = **200 hand-tuned-by-generator levels**, each validated by a solver bot at generation time. |
| Long-term loop | Stars gate worlds, stardust (currency) buys ships, trails and upgrades, achievements pay stardust, daily reward streak, daily challenge level, endless mode with best score. |

## Core gameplay

- **Orbit**: the ship circles its current planet at the planet's orbit radius with constant linear speed. Direction (clockwise or not) follows the direction the ship arrived from.
- **Launch**: tap/click anywhere on the play area, or press Space/Enter. The ship leaves along the tangent at a constant speed. A dotted aim line previews the straight-line path (length set by the *Guide* upgrade).
- **Capture**: entering another planet's orbit ring captures the ship into that orbit (+1 hop).
- **Goal**: the last planet of each level is a swirling portal; capturing it clears the level.
- **Failure**: leaving the playfield sideways, drifting in space for more than 2.5 s, or touching a hazard. Failure restarts the level fast (≤ 1 s), counting attempts. A Shield charge (upgrade) absorbs one asteroid or laser hit; black-hole cores and crumbling planets are always fatal. In endless mode a failure ends the run.
- **Star shards**: 3 per level, placed on flight paths the solver actually flew. Pickup radius grows with the *Magnet* upgrade.
- **Stars per level (max 3)**: ★ cleared, ★ all 3 shards collected in one run, ★ cleared within par time. Each star is kept once earned, so they can be collected over separate runs.

## Worlds (each adds one mechanic; later worlds mix earlier ones)

1. **Nebula Nursery** — static planets.
2. **Drift Belt** — planets that drift back and forth.
3. **Asteroid Alley** — asteroids streak across the gaps and circle planets, crossing launch paths.
4. **Laser Lattice** — laser gates that switch on and off.
5. **Crumble Cluster** — crumbling planets that break a few seconds after you land.
6. **Event Horizon** — black holes that bend your flight path and kill at the core.
7. **Wormhole Web** — paired wormholes that teleport you keeping your heading.
8. **The Singularity** — everything combined at the highest difficulty.

Difficulty rises within each world (more hops, tighter gaps, more/faster hazards) and across worlds.

## Progression & economy

- Level *n* unlocks when level *n − 1* of the same world is cleared. Level 1 of a world unlocks when the previous world's level 25 is cleared **and** the total star count meets the world's star requirement: `[0, 35, 80, 130, 185, 245, 310, 380]`.
- **Stardust** rewards: +1 per hop, +5 per shard, +10 + 2×world per clear, +15 per *new* star earned on a level. Endless: +1 per hop. Daily challenge first clear each day: +100.
- **Shop**: 12 ships, 8 trails (each has a distinct look), 3 upgrades — *Magnet* (5 levels: pickup radius), *Guide* (5 levels: aim-line length), *Shield* (3 levels: 1–3 hazard absorptions per attempt). Prices escalate so the full shop costs several hours of play.
- **Achievements**: ≥ 20, each with a progress bar and a stardust reward claimed by tapping.
- **Daily reward**: 7-day streak with escalating stardust; missing a calendar day resets the streak.
- **Daily challenge**: one date-seeded level with mixed hazards, same for everyone that day.
- **Endless**: unlocked by clearing world 1; an infinite generated run; best score saved.
- Progress is saved to `localStorage` automatically and survives reloads; a corrupted save resets to defaults instead of crashing. Settings include a two-step "reset progress".

## Presentation

- Neon-space art: parallax starfields, per-world nebula palettes, shaded/glowing planets with rings, animated portal, particle bursts, ship trails, screen shake (disabled with *Reduced motion*), smooth camera.
- Glassy HTML UI: title screen, world carousel, 25-level grid with stars and locks, HUD (pause, level, shards, timer vs par, hop progress, shields), pause menu, level-complete screen with animated stars and reward count-up, shop with live previews, achievements, settings.
- Synthesized audio (WebAudio, no files): launch, capture (pitch rises with combo), shard, crash, clear fanfare, UI clicks, and ambient generative music per world. Separate music/SFX toggles. Haptics (where supported) with a toggle.
- First level shows a "tap to launch" tutorial hint.
- Runs at 60 fps on a mid-range phone; canvas resolution capped at 2× device pixels.

## Acceptance scenarios

1. Opening the Pages URL on a phone-sized viewport shows the title screen; Play → world 1 → level 1 starts with a tutorial hint.
2. Tapping launches the ship; landing on a planet increments hops; reaching the portal shows the clear screen with 1–3 stars and stardust earned.
3. Crashing restarts the level within about a second and increments the attempt counter.
4. Clearing a level unlocks the next; reloading the page keeps progress, stars and stardust.
5. World 2 is locked until world 1 level 25 is cleared and 35 stars are owned; the lock shows the requirement.
6. Buying a ship deducts stardust, can be equipped, and changes the ship drawn in game; upgrades change gameplay (aim-line length, pickup radius, shields).
7. Every one of the 200 levels, the daily challenge and endless chunks are solvable: the solver bot clears them with human-sized timing windows (≥ 0.1 s), checked by automated tests.
8. Achievements progress and can be claimed; the daily reward is offered once per calendar day.
9. The game works offline after the first visit (service worker) and can be added to the home screen.
10. `npm test` passes in CI; pushing to `main` deploys to GitHub Pages.
