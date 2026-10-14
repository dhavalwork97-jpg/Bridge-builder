/**
 * Platform adapter. The game core only talks to this interface; nothing platform specific leaks
 * into physics or construction. Every method is a safe no-op when the real SDK is absent or
 * failed to initialise, and no ad/reward is ever faked.
 *
 * SDK calls below were checked against the official docs:
 *  - CrazyGames HTML5 SDK v3: https://docs.crazygames.com/sdk/html5-v3/  (SDK.init, game.loadingStart/Stop,
 *    game.gameplayStart/Stop, game.settings.muteAudio + addSettingsChangeListener)
 *  - YouTube Playables SDK: https://developers.google.com/youtube/gaming/playables/  (ytgame.game.firstFrameReady,
 *    ytgame.game.gameReady, ytgame.system.onPause/onResume, ytgame.system.isAudioEnabled/onAudioEnabledChange,
 *    ytgame.engagement.sendScore)
 */
declare const __PLATFORM__: string;

export interface PlatformHooks { onPause(): void; onResume(): void; onMuteChange(muted: boolean): void }

export interface PlatformAdapter {
  readonly name: 'local' | 'crazygames' | 'youtube';
  /** True only when the real SDK initialised successfully. */
  readonly sdkReady: boolean;
  init(hooks: PlatformHooks): Promise<void>;
  loadingStart(): void;
  loadingStop(): void;
  firstFrameReady(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  reportScore(totalStars: number): void;
}

const safe = (fn: () => void): void => { try { fn(); } catch { /* SDK errors must never break gameplay */ } };

export class LocalAdapter implements PlatformAdapter {
  readonly name = 'local' as const;
  sdkReady = false;
  async init(): Promise<void> { /* nothing */ }
  loadingStart(): void {}
  loadingStop(): void {}
  firstFrameReady(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  reportScore(): void {}
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export class CrazyGamesAdapter implements PlatformAdapter {
  readonly name = 'crazygames' as const;
  sdkReady = false;
  private playing = false;
  constructor(private win: any = globalThis) {}
  private get sdk(): any { return this.sdkReady ? this.win.CrazyGames?.SDK : undefined; }
  async init(hooks: PlatformHooks): Promise<void> {
    const sdk = this.win.CrazyGames?.SDK;
    if (!sdk || typeof sdk.init !== 'function') return; // script not present -> stay in fallback mode
    try {
      await sdk.init();
      this.sdkReady = true;
      const settings = sdk.game?.settings;
      if (settings) {
        hooks.onMuteChange(!!settings.muteAudio);
        sdk.game.addSettingsChangeListener?.((s: any) => hooks.onMuteChange(!!s?.muteAudio));
      }
    } catch { this.sdkReady = false; }
  }
  loadingStart(): void { safe(() => this.sdk?.game?.loadingStart?.()); }
  loadingStop(): void { safe(() => this.sdk?.game?.loadingStop?.()); }
  firstFrameReady(): void {}
  gameplayStart(): void { if (this.playing) return; this.playing = true; safe(() => this.sdk?.game?.gameplayStart?.()); }
  gameplayStop(): void { if (!this.playing) return; this.playing = false; safe(() => this.sdk?.game?.gameplayStop?.()); }
  reportScore(): void {}
}

export class YouTubeAdapter implements PlatformAdapter {
  readonly name = 'youtube' as const;
  sdkReady = false;
  constructor(private win: any = globalThis) {}
  private get yt(): any { return this.sdkReady ? this.win.ytgame : undefined; }
  async init(hooks: PlatformHooks): Promise<void> {
    const yt = this.win.ytgame;
    if (!yt?.game) return;
    this.sdkReady = true;
    safe(() => yt.system?.onPause?.(() => hooks.onPause()));
    safe(() => yt.system?.onResume?.(() => hooks.onResume()));
    safe(() => { if (typeof yt.system?.isAudioEnabled === 'function') hooks.onMuteChange(!yt.system.isAudioEnabled()); });
    safe(() => yt.system?.onAudioEnabledChange?.((enabled: boolean) => hooks.onMuteChange(!enabled)));
  }
  loadingStart(): void {}
  loadingStop(): void { safe(() => this.yt?.game?.gameReady?.()); }
  firstFrameReady(): void { safe(() => this.yt?.game?.firstFrameReady?.()); }
  gameplayStart(): void {}
  gameplayStop(): void {}
  reportScore(totalStars: number): void { safe(() => { void this.yt?.engagement?.sendScore?.({ value: totalStars }); }); }
}

export function createAdapter(): PlatformAdapter {
  const p = typeof __PLATFORM__ === 'string' ? __PLATFORM__ : 'local';
  if (p === 'crazygames') return new CrazyGamesAdapter();
  if (p === 'youtube') return new YouTubeAdapter();
  return new LocalAdapter();
}
