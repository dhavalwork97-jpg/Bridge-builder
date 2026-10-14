# Bridge Builder: Build & Cross

A procedural, asset-free HTML5 bridge-construction physics puzzle. Build a bridge from road, wood, steel and cable within a
budget, press **Test**, and watch a vehicle try to cross. 20 levels in 4 tiers, 3 stars each. No images or audio files: all
graphics are drawn on canvas and all sound is synthesised.

TypeScript + Vite, no runtime dependencies.

## Quick start

```bash
npm ci
npm run dev        # local dev server
npm run verify     # typecheck + unit tests + build + asset check
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and build to `dist/` (generic build, zero external URLs) |
| `npm run build:crazygames` | Build with the CrazyGames SDK script tag |
| `npm run build:youtube` | Build with the YouTube Playables SDK script tag |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (physics, construction, levels, saves, camera, platform adapter) |
| `npm run check:assets` | Fails if the build contains remote URLs or binary assets |
| `npm run qa` | Headless-Chromium UI tests (needs `npm run build` first; Python + Playwright) |
| `npm run solve-check` | Re-checks that each level's reference solution still wins |
| `npm run bench` | Simulation benchmark |

## Layout

- `src/sim/` pin-jointed truss solver (XPBD), terrain, analysis
- `src/game/` game loop, construction rules, scoring, camera, save data
- `src/levels/` level definitions and reference solutions
- `src/render/`, `src/audio/` canvas drawing and synthesised sound
- `src/platform/` safe-no-op adapter for platform SDKs
- `src/config.ts` all gameplay balance (materials, vehicles, build limits, physics constants)

## Docs

- [docs/PHYSICS.md](docs/PHYSICS.md) physics model
- [docs/LEVELS.md](docs/LEVELS.md) level table, star rules, solvability proof
- [docs/PLATFORMS.md](docs/PLATFORMS.md) platform publishing notes and checklists
- [store/LISTING.md](store/LISTING.md) store copy, cover images and screenshots

## Status

Solvability of every level is proven by tests. Difficulty has not been playtested with real players, and the platform SDK
integrations have not been exercised on the real platforms (see the docs above).
