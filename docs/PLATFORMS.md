# Platform publishing notes

The core game never calls a platform SDK directly. `src/platform/adapter.ts` exposes `init, loadingStart/Stop, firstFrameReady,
gameplayStart/Stop, reportScore`. Every call is a safe no-op if the SDK is absent or failed to initialise. **No ads or rewards are
implemented or faked**; ads are never required to finish a level.

Builds: `npm run build` (local/generic, zero external URLs) · `npm run build:crazygames` · `npm run build:youtube`
(the platform builds add the SDK `<script>` tag via `vite.config.ts`).

## CrazyGames (HTML5 SDK v3)
Method names checked against https://docs.crazygames.com/sdk/html5-v3/ : `SDK.init()`, `game.loadingStart/loadingStop`,
`game.gameplayStart/gameplayStop`, `game.settings.muteAudio` + `addSettingsChangeListener`.
Implemented: init, loading start/stop, gameplayStart on entering a level / resuming, gameplayStop on menus, pause, result, tab hidden; audio mute follows the platform setting.
Checklist before submitting:
- [ ] Re-read the current SDK docs and QA guidelines; confirm the SDK script URL in `vite.config.ts` is still current.
- [ ] Upload `dist/` as a zip with `index.html` at the root; test in the CrazyGames QA tool (desktop + mobile).
- [ ] Verify no external requests other than the SDK, mute control works, game is playable offline after load.
- [ ] Prepare cover images/description (not generated here). Decide on monetisation separately (ads are not implemented).
- [ ] Confirm size/load limits and mobile requirements in the current guidelines.

## YouTube Playables
Method names checked against https://developers.google.com/youtube/gaming/playables/ : `ytgame.game.firstFrameReady()`,
`ytgame.game.gameReady()`, `ytgame.system.onPause/onResume`, `ytgame.system.isAudioEnabled/onAudioEnabledChange`, `ytgame.engagement.sendScore`.
Implemented: firstFrameReady after first rendered frame, gameReady when loaded, pause/resume hooks, audio-enabled sync, total stars reported as score.
Checklist:
- [x] SDK script URL `https://www.youtube.com/game_api/v1` checked against the Playables "getting started" page (must load before game code; `vite.config.ts` injects it in the `youtube` build).
- [x] **Saving:** the integration requirements say progress MUST be saved only via `ytgame.game.saveData`/`loadData`, `loadData` MUST be awaited before `saveData`, and no other mechanism may be used. The YouTube build therefore never touches localStorage: `SaveStore.useExternal` routes writes to `saveData`, holds them until `hydrate(loadData())` has run, and merges any progress earned before the load finished. (Save string limit is 3 MiB; ours is a few hundred bytes.)
- [ ] Re-read the current publishing and integration requirements before submitting (other rules: no external network calls, size limits, no non-SDK ads/IAP).
- [ ] Test in the Playables test suite/emulator; confirm audio only starts after a gesture (it does).
- [ ] Acceptance on one platform does not imply the other.

## Not verified
Neither SDK was exercised against the real platform (adapters are unit-tested against mocks only).
