import { describe, expect, it, vi } from 'vitest';
import { CrazyGamesAdapter, LocalAdapter, YouTubeAdapter, type PlatformHooks } from '../src/platform/adapter';

const hooks = (): PlatformHooks & { calls: string[] } => {
  const calls: string[] = [];
  return { calls, onPause: () => calls.push('pause'), onResume: () => calls.push('resume'), onMuteChange: (m) => calls.push('mute:' + m) };
};

describe('platform adapters', () => {
  it('local adapter is a harmless no-op', async () => {
    const a = new LocalAdapter();
    await a.init();
    expect(() => { a.gameplayStart(); a.gameplayStop(); a.loadingStart(); a.reportScore(); }).not.toThrow();
    expect(a.sdkReady).toBe(false);
  });
  it('CrazyGames adapter falls back silently when the SDK script is missing', async () => {
    const a = new CrazyGamesAdapter({});
    await a.init(hooks());
    expect(a.sdkReady).toBe(false);
    expect(() => { a.gameplayStart(); a.loadingStop(); }).not.toThrow();
  });
  it('CrazyGames adapter survives an SDK init failure and makes no SDK calls afterwards', async () => {
    const gameplayStart = vi.fn();
    const a = new CrazyGamesAdapter({ CrazyGames: { SDK: { init: () => Promise.reject(new Error('blocked')), game: { gameplayStart } } } });
    await a.init(hooks());
    a.gameplayStart();
    expect(a.sdkReady).toBe(false);
    expect(gameplayStart).not.toHaveBeenCalled();
  });
  it('CrazyGames adapter calls the documented methods once per transition and follows muteAudio', async () => {
    let listener: ((s: { muteAudio: boolean }) => void) | undefined;
    const game = { gameplayStart: vi.fn(), gameplayStop: vi.fn(), loadingStart: vi.fn(), loadingStop: vi.fn(), settings: { muteAudio: true }, addSettingsChangeListener: (l: typeof listener) => { listener = l; } };
    const a = new CrazyGamesAdapter({ CrazyGames: { SDK: { init: async () => {}, game } } });
    const h = hooks();
    await a.init(h);
    expect(a.sdkReady).toBe(true);
    a.loadingStart(); a.loadingStop();
    a.gameplayStart(); a.gameplayStart(); a.gameplayStop(); a.gameplayStop();
    expect(game.gameplayStart).toHaveBeenCalledTimes(1);
    expect(game.gameplayStop).toHaveBeenCalledTimes(1);
    expect(game.loadingStart).toHaveBeenCalledTimes(1);
    listener?.({ muteAudio: false });
    expect(h.calls).toEqual(['mute:true', 'mute:false']);
  });
  it('YouTube adapter wires pause/resume/audio and ready signals only when ytgame exists', async () => {
    const none = new YouTubeAdapter({});
    await none.init(hooks());
    expect(none.sdkReady).toBe(false);
    const cb: Record<string, () => void> = {};
    const yt = { game: { firstFrameReady: vi.fn(), gameReady: vi.fn() }, system: { onPause: (f: () => void) => { cb.pause = f; }, onResume: (f: () => void) => { cb.resume = f; }, isAudioEnabled: () => false, onAudioEnabledChange: () => {} }, engagement: { sendScore: vi.fn(async () => {}) } };
    const a = new YouTubeAdapter({ ytgame: yt });
    const h = hooks();
    await a.init(h);
    a.firstFrameReady(); a.loadingStop(); a.reportScore(12);
    cb.pause(); cb.resume();
    expect(yt.game.firstFrameReady).toHaveBeenCalled();
    expect(yt.game.gameReady).toHaveBeenCalled();
    expect(yt.engagement.sendScore).toHaveBeenCalledWith({ value: 12 });
    expect(h.calls).toEqual(['mute:true', 'pause', 'resume']);
  });

  it('YouTube adapter saves/loads through ytgame.game and tolerates failures', async () => {
    const saveData = vi.fn(async () => {});
    const a = new YouTubeAdapter({ ytgame: { game: { saveData, loadData: async () => '{"x":1}' } } });
    await a.init(hooks());
    expect(a.usesPlatformSave).toBe(true);
    expect(await a.loadSave()).toBe('{"x":1}');
    a.writeSave('abc');
    expect(saveData).toHaveBeenCalledWith('abc');
    const bad = new YouTubeAdapter({ ytgame: { game: { loadData: async () => { throw new Error('x'); }, saveData: () => { throw new Error('y'); } } } });
    await bad.init(hooks());
    expect(await bad.loadSave()).toBeNull();
    expect(() => bad.writeSave('z')).not.toThrow();
    const none = new YouTubeAdapter({});
    expect(await none.loadSave()).toBeNull();
  });
  it('CrazyGames adapter saves through SDK.data, migrates a localStorage save, and falls back to localStorage without the SDK', async () => {
    const KEY = 'bridge-builder-build-and-cross:v1';
    const store = new Map<string, string>();
    const data = { getItem: vi.fn((k: string) => store.get(k) ?? null), setItem: vi.fn((k: string, v: string) => void store.set(k, v)) };
    const ls = new Map<string, string>([[KEY, '{"old":1}']]);
    const localStorage = { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v) };
    const a = new CrazyGamesAdapter({ localStorage, CrazyGames: { SDK: { init: async () => {}, data } } });
    await a.init(hooks());
    expect(a.usesPlatformSave).toBe(true);
    expect(await a.loadSave()).toBe('{"old":1}');          // Data module empty -> migrates the local save
    a.writeSave('{"new":1}');
    expect(data.setItem).toHaveBeenCalledWith(KEY, '{"new":1}');
    expect(ls.get(KEY)).toBe('{"old":1}');                   // localStorage untouched while the SDK is healthy
    expect(await a.loadSave()).toBe('{"new":1}');           // Data module wins once it has a value
    const ls2 = new Map<string, string>();
    const bare = new CrazyGamesAdapter({ localStorage: { getItem: (k: string) => ls2.get(k) ?? null, setItem: (k: string, v: string) => void ls2.set(k, v) } });
    await bare.init(hooks());
    bare.writeSave('abc');
    expect(await bare.loadSave()).toBe('abc');               // no SDK: plain localStorage
    const broken = new CrazyGamesAdapter({ CrazyGames: { SDK: { init: async () => {}, data: { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('y'); } } } } });
    await broken.init(hooks());
    expect(await broken.loadSave()).toBeNull();
    expect(() => broken.writeSave('z')).not.toThrow();
  });
});
