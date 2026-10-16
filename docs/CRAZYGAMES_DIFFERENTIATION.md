# CrazyGames resubmission: differentiation plan

## Review feedback and decision

CrazyGames rejected the current submission because its concept is too close to existing titles and the platform is prioritising more differentiated experiences. Treat this as a product/gameplay problem, not a store-listing-only problem. A new title, palette, cover image, or more levels is not a sufficient response.

The current game is a 2.5D bridge-construction puzzle with a structural solver, material budgets, vehicle tests, stress visualization, and 30 levels. Those are useful foundations, but the core loop—place beams, test a vehicle, reinforce a failed bridge—is recognisable within a crowded genre.

## Proposed direction: FLOODLINE RESCUE

**Player fantasy:** become the emergency engineer keeping an isolated community connected during a flood.

**Distinctive loop:** read the rescue briefing and water forecast → build within a material budget → choose when to launch the convoy → watch water rise and the structure respond → deliver the rescue vehicle before the route is cut off → earn a debrief based on supplies delivered, structural safety, cost, and time.

The key difference must be in decisions and outcomes, not merely the setting. Environmental pressure and mission trade-offs should be visible and affect play.

## Vertical slice before a full conversion

An initial optional prototype is now wired into the game behind a separate Floodline Rescue menu entry. It reuses the short-hop level geometry and existing construction controls; it does not replace the campaign or change the level schema. The deadline and rising water are prototype tuning and still require playtesting.

### Mission: The Last Supply Run

- Objective: get one emergency supply truck to the far bank before a visible flood deadline.
- Briefing: show a short objective card, starting water level, time window, and available budget before entering build mode. Keep it skippable after the first play.
- Flood forecast: a simple, deterministic water-level curve displayed in the HUD and in the world. The timer must be based on simulation time, not frame count, so refresh rate cannot change the challenge.
- Consequence: rising water changes the safe route window and gives the player a strategic choice about when to test/launch. It must not arbitrarily alter structural physics without clear visual communication.
- Debrief: report mission success/failure, arrival time, remaining budget, peak structural stress, and the objective outcome. Explain the reason for failure in plain language.
- Replay: preserve the design on retry and allow immediate edits; do not force a long restart sequence.

### Guardrails

- Reuse BridgeGraph, Simulation, material costs, vehicle testing, and scoring wherever possible.
- Keep the prototype behind an explicit mission flag or dedicated level definition. Existing levels must behave exactly as before.
- No login, energy timer, monetisation, or extra currency.
- Keep controls keyboard, mouse, and touch friendly. The timer should pause when the game is paused or the browser tab is hidden.
- Use deterministic mission data; test the water curve and win/fail boundaries as pure functions.
- Do not claim the game is differentiated until the playable prototype visibly changes the player's decisions and has been reviewed by someone unfamiliar with the project.

## Implementation sequence

1. **Baseline and preserve:** run npm run verify, npm run solve-check, and npm run qa; save baseline results and confirm the current main remains untouched.
2. **Mission model:** add typed mission rules and a pure deterministic flood-forecast function, with unit tests for boundaries and pause/resume semantics.
3. **Playable vertical slice:** wire the mission briefing, forecast display, visible water cue, launch decision, and debrief into the existing game flow. Keep standard levels unchanged.
4. **Quality pass:** test desktop, mobile landscape, mobile portrait, keyboard, touch, pause, retry, and browser-tab visibility. Confirm no runtime console errors.
5. **Originality review:** compare the actual playable experience—not just its art—with common bridge-building titles. If the main interaction still feels like ordinary beam placement and vehicle testing, revise the mechanic before resubmission.
6. **CrazyGames submission:** build with npm run build:crazygames, check archive and initial-load size against current limits, verify SDK behaviour in the QA preview, and update listing assets/copy only after the new gameplay is real.

## Acceptance criteria for resubmission

- [ ] A new player can explain the rescue objective after the first screen without reading an external tutorial.
- [ ] Flood timing creates at least two viable, understandable strategies; it is not only a countdown decoration.
- [ ] The mission state is deterministic and independent of device refresh rate.
- [ ] Pausing or switching tabs does not consume the mission deadline.
- [ ] Standard campaign levels, existing saves, and current construction controls continue to work.
- [ ] Desktop and mobile browser QA pass with no unexpected console/page errors.
- [ ] CrazyGames QA preview has been tested on desktop and mobile.
- [ ] Store assets accurately show the differentiated gameplay.

## Current prototype status

The first implementation exists on the feature branch: a separate menu entry, simulation-time flood rise, flood collision/failure, HUD countdown, waterline visual, and unit tests. GitHub Actions `npm run verify` and `npm run solve-check` passed on the feature branch. The verification suite includes deterministic flood-model tests and a reference-solution check that the short-hop bridge can cross before the deadline. Browser QA is now included in CI, with a mission-specific UI smoke test; the latest completed run passed all 46/46 checks, including the rescue UI flow and desktop/mobile layouts. The CrazyGames save adapter has also been tightened to use the Data module as the only ongoing persistence source, with legacy localStorage read only for one-time migration; it no longer falls back to localStorage when the SDK is unavailable. CI now builds the CrazyGames-specific output and checks total bundle size/file count against the documented basic-launch limits. That new CI run must pass before treating the bundle check as verified. The CrazyGames QA preview and a human playtest have not yet been completed.

This remains a vertical-slice prototype, not a resubmission-ready release. Review and tune the deadline and visual readability in a real browser. Do not resubmit until automated checks pass and a human playtest confirms that the flood meaningfully changes launch timing and bridge-design decisions.
