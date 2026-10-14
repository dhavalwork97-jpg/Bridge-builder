import { GAME } from '../config';

export interface LevelRecord { stars: number; bestCost: number }
export interface Settings { muted: boolean; stressView: boolean; reduceMotion: boolean }
export interface SaveData {
  version: number;
  levels: Record<string, LevelRecord>;
  settings: Settings;
}

export const defaultSave = (): SaveData => ({
  version: GAME.saveVersion,
  levels: {},
  settings: { muted: false, stressView: false, reduceMotion: false },
});

/** Validate unknown parsed JSON into a safe SaveData (never throws). */
export function sanitize(raw: unknown, levelCount: number): SaveData {
  const out = defaultSave();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (r.version !== GAME.saveVersion) return out;
  if (r.levels && typeof r.levels === 'object') {
    for (const [k, v] of Object.entries(r.levels as Record<string, unknown>)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > levelCount || !v || typeof v !== 'object') continue;
      const rec = v as Record<string, unknown>;
      const stars = Number(rec.stars), bestCost = Number(rec.bestCost);
      if (!Number.isInteger(stars) || stars < 0 || stars > 3 || !Number.isFinite(bestCost) || bestCost < 0) continue;
      out.levels[String(id)] = { stars, bestCost };
    }
  }
  if (r.settings && typeof r.settings === 'object') {
    const s = r.settings as Record<string, unknown>;
    out.settings.muted = s.muted === true;
    out.settings.stressView = s.stressView === true;
    out.settings.reduceMotion = s.reduceMotion === true;
  }
  return out;
}

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Versioned progress store; falls back to memory when localStorage is unavailable. */
export class SaveStore {
  data: SaveData;
  private storage: StorageLike | null;
  /** Platform-owned persistence (e.g. YouTube Playables saveData). Writes are held until `hydrate` has run. */
  private external: ((json: string) => void) | null = null;
  private hydrated = false;
  constructor(private levelCount: number, storage?: StorageLike | null) {
    this.storage = storage === undefined ? SaveStore.detect() : storage;
    this.data = this.load();
  }
  /** Route persistence to a platform save API instead of localStorage. Nothing is written until `hydrate`. */
  useExternal(write: (json: string) => void): void { this.external = write; this.storage = null; }
  /**
   * Load progress from the platform (the raw string, or null if none). Merges with anything earned
   * before the load finished (best stars / lowest cost win), then enables writes.
   */
  hydrate(json: string | null): void {
    let loaded = defaultSave();
    try { if (json) loaded = sanitize(JSON.parse(json), this.levelCount); } catch { /* corrupt: start fresh */ }
    for (const [k, r] of Object.entries(this.data.levels)) {
      const prev = loaded.levels[k];
      if (!prev || r.stars > prev.stars || (r.stars === prev.stars && r.bestCost < prev.bestCost)) loaded.levels[k] = r;
    }
    this.data = loaded;
    this.hydrated = true;
  }
  private static detect(): StorageLike | null {
    try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
  }
  private key = `${GAME.saveKey}:v${GAME.saveVersion}`;
  private load(): SaveData {
    try {
      const txt = this.storage?.getItem(this.key);
      return txt ? sanitize(JSON.parse(txt), this.levelCount) : defaultSave();
    } catch { return defaultSave(); }
  }
  persist(): void {
    if (this.external) {
      if (!this.hydrated) return; // the platform requires loadData to finish before saveData
      try { this.external(JSON.stringify(this.data)); } catch { /* keep in memory */ }
      return;
    }
    try { this.storage?.setItem(this.key, JSON.stringify(this.data)); } catch { /* quota / privacy mode: keep in memory */ }
  }
  record(levelId: number): LevelRecord | undefined { return this.data.levels[String(levelId)]; }
  /** Record a result. Keeps the best star count; among equal stars, keeps the lowest cost. */
  submit(levelId: number, stars: number, cost: number): void {
    if (stars < 1) return;
    const prev = this.record(levelId);
    if (!prev || stars > prev.stars || (stars === prev.stars && cost < prev.bestCost)) {
      this.data.levels[String(levelId)] = { stars, bestCost: cost };
    }
    this.persist();
  }
  completed(levelId: number): boolean { return (this.record(levelId)?.stars ?? 0) >= 1; }
  /** Level 1 is always open; level n opens when n-1 is completed. */
  isUnlocked(levelId: number): boolean { return levelId <= 1 || this.completed(levelId - 1); }
  totalStars(): number { return Object.values(this.data.levels).reduce((s, l) => s + l.stars, 0); }
  setSettings(p: Partial<Settings>): void { Object.assign(this.data.settings, p); this.persist(); }
}
