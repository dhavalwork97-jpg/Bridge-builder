import { describe, expect, it } from 'vitest';
import { SaveStore, sanitize, type StorageLike } from '../src/game/save';
import { LEVELS } from '../src/levels/levels';

const mem = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};

describe('save / progression', () => {
  it('only level 1 is unlocked at start; completion unlocks the next', () => {
    const s = new SaveStore(LEVELS.length, mem());
    expect(s.isUnlocked(1)).toBe(true);
    expect(s.isUnlocked(2)).toBe(false);
    s.submit(1, 2, 480);
    expect(s.isUnlocked(2)).toBe(true);
    expect(s.isUnlocked(3)).toBe(false);
  });
  it('keeps best stars and lowest cost; persists across reload', () => {
    const st = mem();
    const s = new SaveStore(LEVELS.length, st);
    s.submit(1, 2, 600);
    s.submit(1, 1, 100);   // fewer stars never overwrites
    s.submit(1, 2, 500);   // same stars, cheaper
    s.submit(1, 3, 700);   // more stars wins
    const s2 = new SaveStore(LEVELS.length, st);
    expect(s2.record(1)).toEqual({ stars: 3, bestCost: 700 });
    expect(s2.totalStars()).toBe(3);
  });
  it('failed runs (0 stars) are not recorded', () => {
    const s = new SaveStore(LEVELS.length, mem());
    s.submit(1, 0, 10);
    expect(s.completed(1)).toBe(false);
  });
  it('recovers from corrupted or malicious saved data', () => {
    for (const bad of ['{not json', 'null', '[]', '{"version":999}', '{"version":1,"levels":{"1":{"stars":99,"bestCost":-5},"abc":1,"2":{"stars":2,"bestCost":300}},"settings":{"muted":"yes"}}']) {
      const st = mem();
      st.setItem('bridge-builder-build-and-cross:v1', bad);
      const s = new SaveStore(LEVELS.length, st);
      expect(() => s.isUnlocked(5)).not.toThrow();
      expect(s.record(1)).toBeUndefined();
      expect(s.data.settings.muted).toBe(false);
    }
    expect(sanitize(JSON.parse('{"version":1,"levels":{"2":{"stars":2,"bestCost":300}},"settings":{}}'), 20).levels['2']).toEqual({ stars: 2, bestCost: 300 });
  });
  it('survives storage that throws and when storage is unavailable', () => {
    const throwing: StorageLike = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    const s = new SaveStore(LEVELS.length, throwing);
    expect(() => s.submit(1, 3, 10)).not.toThrow();
    expect(s.completed(1)).toBe(true); // kept in memory
    const none = new SaveStore(LEVELS.length, null);
    none.submit(1, 1, 5);
    expect(none.completed(1)).toBe(true);
  });

  it('platform-owned save: no localStorage use, writes held until hydrate, merges early progress', () => {
    const st = mem();
    const writes: string[] = [];
    const s = new SaveStore(LEVELS.length, null);
    s.useExternal((j) => writes.push(j));
    s.submit(1, 1, 900);                 // earned before the platform load finished
    expect(writes).toEqual([]);          // saveData must not run before loadData completes
    s.hydrate(JSON.stringify({ version: s.data.version, levels: { '1': { stars: 2, bestCost: 700 }, '2': { stars: 1, bestCost: 500 } }, settings: { muted: false, stressView: true, reduceMotion: false } }));
    expect(s.record(1)).toEqual({ stars: 2, bestCost: 700 });
    expect(s.totalStars()).toBe(3);
    expect(s.data.settings.stressView).toBe(true);
    s.submit(3, 1, 400);
    expect(writes.length).toBe(1);
    expect(JSON.parse(writes[0]).levels['3']).toEqual({ stars: 1, bestCost: 400 });
    expect(st.map.size).toBe(0);
  });
  it('platform-owned save tolerates missing or corrupt data', () => {
    const s = new SaveStore(LEVELS.length, null);
    s.useExternal(() => {});
    s.hydrate('{not json');
    expect(s.totalStars()).toBe(0);
  });
});
