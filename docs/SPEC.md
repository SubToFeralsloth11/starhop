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
| Levels | 10 worlds × 25 levels = **250 hand-tuned-by-generator levels** (level 25 of each world is a boss), each validated by a solver bot at generation time. |
| Long-term loop | Stars gate worlds, stardust (currency) buys ships, paints, trails and upgrades, achievements pay stardust, daily reward streak, three daily missions, pilot XP levels, star chests, gold shards and a secret ship, mutator medals, a codex, a weekly event, ascension (New Game+), daily challenge, shard hunt, endless, zen, time attack and pass-and-play. |

## Core gameplay

- **Orbit**: the ship circles its current planet at the planet's orbit radius with constant linear speed. Direction (clockwise or not) follows the direction the ship arrived from.
- **Launch**: tap/click anywhere on the play area, or press Space/Enter. The ship leaves along the tangent at a constant speed. A dotted aim line previews the straight-line path (length set by the *Guide* upgrade).
- **Boost**: keep the press held (≥ 0.15 s) to fly 1.45× faster while boost fuel lasts (0.6 s per flight, refilled on landing). A normal tap never boosts, so the solver-validated timing is unchanged.
- **Reverse orbit**: the ⟲ button (or F) flips the orbit direction while orbiting, giving a second launch tangent.
- **Perfect landing**: a flight aimed within 30% of the next planet's centre lands *perfect* (+3 stardust, combo text, combo raises the music intensity). **Chain hop**: launching within 0.35 s of landing (+1 stardust).
- **Capture**: entering another planet's orbit ring captures the ship into that orbit (+1 hop).
- **Goal**: the last planet of each level is a swirling portal; capturing it clears the level.
- **Failure**: leaving the playfield sideways, drifting in space for more than 2.5 s, or touching a hazard. Failure restarts the level fast (≤ 1 s), counting attempts. A Shield charge (upgrade) absorbs one asteroid or laser hit; black-hole cores and crumbling planets are always fatal. In endless mode a failure ends the run.
- **Star shards**: 3 per level, placed on flight paths the solver actually flew. Pickup radius grows with the *Magnet* upgrade.
- **Stardust coins** (+2 each) sit on alternative launch windows the solver did not take, and the generator proves the level can still be finished after taking them. **Gold shards**: one per world on a riskier alternative line (also proven finishable); finding all ten unlocks the secret ship *Aurum*.
- **Near misses** (skimming a hazard) trigger brief slow motion (off with *Reduced motion*). After a crash the ship reports how far it missed the next ring ("Almost! Missed by 12"). After 5 failed attempts on a level a hint path and launch cue from the solver appear (toggle in Settings).
- **Ghost**: the inputs of your best clear of each campaign level are stored and replayed as a translucent ghost ship (toggle in Settings).
- **Stars per level (max 3)**: ★ cleared, ★ all 3 shards collected in one run, ★ cleared within par time (the clock starts at the first launch, so reading the level first is free). Each star is kept once earned, so they can be collected over separate runs.

## Worlds (each adds one mechanic; later worlds mix earlier ones)

1. **Nebula Nursery** — static planets.
2. **Drift Belt** — planets that drift back and forth.
3. **Asteroid Alley** — asteroids streak across the gaps and circle planets, crossing launch paths.
4. **Laser Lattice** — laser gates that switch on and off.
5. **Crumble Cluster** — crumbling planets that break a few seconds after you land.
6. **Event Horizon** — black holes that bend your flight path and kill at the core.
7. **Wormhole Web** — paired wormholes that teleport you keeping your heading.
8. **The Singularity** — everything combined at the highest difficulty.
9. **Gravity Gardens** (bonus) — giant planets that pull your flight toward them.
10. **Pinball Rim** (bonus) — bouncy side walls; every level's bot route uses at least one bank shot.

Difficulty rises within each world (more hops, tighter gaps, more/faster hazards) and across worlds. Level 25 of every world is a **boss**: two extra hops, a drifting portal and (from world 2) two guardian rocks circling the portal's track. Late levels of hazard worlds may also end on a drifting portal.

## Progression & economy

- Level *n* unlocks when level *n − 1* of the same world is cleared. Level 1 of a world unlocks when the previous world's level 25 is cleared **and** the total star count meets the world's star requirement: `[0, 35, 80, 130, 185, 245, 310, 380, 450, 520]`.
- **Stardust** rewards: +1 per hop, +5 per shard, +10 + 2×world per clear, +3 per perfect landing, +1 per chain hop, +2 per coin, +15 per *new* star, +150 per new gold shard, +40 per new mutator medal. **Replay fatigue**: the farmable part (everything except new stars, gold and medals) pays in full for the first 3 clears of a level per day, then halves per extra clear down to 10%. Ship perks and ascension multiply the total. Endless: +1 per hop. Zen: +1 per 2 hops. Daily challenge first clear each day: +100. Shard Hunt first win each day: +60. Weekly: +60 per stage, +300 for finishing. Time Attack: +200 + 20×world first finish, +30 after.
- **Shop**: 12 ships each with a perk that only ever helps (e.g. Phoenix revives once per attempt, Needle has a smaller hitbox, Hammerhead +1 shield, Crown +20% stardust), plus the secret Aurum; 3 paint jobs per ship; 8 bought trails, 10 world aurora trails (75/75 ★ in that world; also unlocks the world as menu theme) and 4 weekly-event trails; 3 upgrades — *Magnet* (5 levels: pickup radius), *Guide* (5 levels: aim-line length), *Shield* (3 levels: 1–3 hazard absorptions per attempt). Prices escalate so the full shop costs several hours of play.
- **Achievements**: 43, each with a progress bar and a stardust reward claimed by tapping.
- **Missions**: three date-seeded daily tasks from 12 types (hops, shards, shards in a world, clears, perfect landings, clean clears, 3-star runs, coins, boost time, chains, endless score, daily clear), each paying 60–180 stardust.
- **Pilot XP**: hops, clears, perfects, stars and modes give XP; each pilot level pays 25 + 5×level stardust, every 5 levels a new title.
- **Star chests**: one per 25 stars ever earned; each holds a paint job or 100–300 stardust (deterministic per chest).
- **Mutators**: once a world's boss is beaten, its levels can be replayed as Mirror, Turbo (1.5× speed) or Blind (no aim line) for medals (no stars).
- **Codex**: 16 entries (planets, hazards, pickups) discovered by playing a level that contains them, 20 stardust each.
- **Ascension (New Game+)**: with all 750 stars, reset the campaign (keeping the shop, medals and gold) for +25% stardust per tier and 10% faster levels per tier (max 1.3×).
- **Daily reward**: 7-day streak with escalating stardust; missing a calendar day resets the streak.
- **Daily challenge**: one date-seeded level with mixed hazards, same for everyone that day.
- **Endless**: unlocked by clearing world 1; an infinite generated run; best score saved.
- **Modes**: Weekly Event (five ISO-week-seeded stages, played in order, shareable result line), Shard Hunt (date-seeded, 10 shards, 60 s, no portal), Zen (hazard-free endless; drifting off returns you to the last planet), Time Attack (a beaten world's 25 levels on one clock), Pass & Play (two players, three single attempts each on today's daily level, best time wins).
- **Save codes**: Settings can export the save as a checksummed code and import it on another device.
- After the fifth clear the game offers to install itself (browser install prompt, or Add-to-Home-Screen instructions on iOS).
- Progress is saved to `localStorage` automatically and survives reloads; a corrupted save resets to defaults instead of crashing. Settings include a two-step "reset progress".

## Presentation

- Neon-space art: parallax starfields, per-world nebula palettes, shaded/glowing planets with rings, animated portal, particle bursts, ship trails, screen shake (disabled with *Reduced motion*), smooth camera.
- Glassy HTML UI: title screen with pilot rank, world carousel, a winding level map per world (the player's ship flies to the next node after a first clear; boss node at the top), HUD (pause, level, shards, timer vs par, hop progress, shields), pause menu, level-complete screen with animated stars and reward count-up, shop with live previews, achievements, settings.
- Ship lean while orbiting, squash-and-stretch on launch, planet wobble and ring flash on capture, portal suction, camera zoom-out during long flights, ship-specific launch and crash effects.
- Synthesized audio (WebAudio, no files): launch, capture (pitch rises with combo), shard, crash, clear fanfare, UI clicks, and ambient generative music per world; percussion joins at a 5-capture combo and an arpeggio at 10; looping hazard sounds (laser hum, black-hole rumble, wormhole shimmer, asteroid crackle) follow the distance to each hazard. Separate music/SFX toggles. Haptics (where supported) with a toggle.
- First level shows a "tap to launch" tutorial hint.
- Runs at 60 fps on a mid-range phone; canvas resolution capped at 2× device pixels.

## Acceptance scenarios

1. Opening the Pages URL on a phone-sized viewport shows the title screen; Play → world 1 → level 1 starts with a tutorial hint.
2. Tapping launches the ship; landing on a planet increments hops; reaching the portal shows the clear screen with 1–3 stars and stardust earned.
3. Crashing restarts the level within about a second and increments the attempt counter.
4. Clearing a level unlocks the next; reloading the page keeps progress, stars and stardust.
5. World 2 is locked until world 1 level 25 is cleared and 35 stars are owned; the lock shows the requirement.
6. Buying a ship deducts stardust, can be equipped, and changes the ship drawn in game; upgrades change gameplay (aim-line length, pickup radius, shields).
7. Every one of the 250 levels, the daily challenge, weekly stages, shard hunts, mirrored levels and endless/zen chunks are solvable: the solver bot clears them with human-sized timing windows (≥ 0.1 s), checked by automated tests.
8. Achievements progress and can be claimed; the daily reward is offered once per calendar day.
9. The game works offline after the first visit (service worker) and can be added to the home screen.
10. `npm test` passes in CI; pushing to `main` deploys to GitHub Pages.
