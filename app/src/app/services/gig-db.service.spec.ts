import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { GigDbService, type GigRecord } from './gig-db.service';

describe('GigDbService', () => {
  let db: GigDbService;

  beforeEach(() => {
    // Fresh fake IndexedDB per test so records from one test never leak
    // into the next (fake-indexeddb keeps a module-level registry).
    globalThis.indexedDB = new IDBFactory();
    db = new GigDbService();
  });

  it('round-trips a record through recSave/recGet', async () => {
    const rec: GigRecord = { id: 'a1', date: '2026-01-15', type: 'income', desc: 'Club gig', amount: 200 };
    await db.recSave(rec);
    const back = await db.recGet('a1');
    expect(back?.desc).toBe('Club gig');
    expect(back?.updatedAt).toBeTruthy();
  });

  it('recsGetAll excludes soft-deleted records and sorts newest date first', async () => {
    await db.recSave({ id: '1', date: '2026-01-01', type: 'income', desc: 'Jan', amount: 100 });
    await db.recSave({ id: '2', date: '2026-03-01', type: 'income', desc: 'Mar', amount: 100 });
    await db.recSave({ id: '3', date: '2026-02-01', type: 'income', desc: 'Feb (deleted)', amount: 100 });
    await db.recMarkDeleted('3');

    const all = await db.recsGetAll();
    expect(all.map((r) => r.id)).toEqual(['2', '1']);
  });

  it('kvGet/kvSet round-trip settings', async () => {
    expect(await db.kvGet('appSettings')).toBeNull();
    await db.kvSet('appSettings', { federalRate: 22 });
    expect(await db.kvGet('appSettings')).toEqual({ federalRate: 22 });
  });

  describe('saved gig locations', () => {
    // Reuses the existing 'kv' store under a new key (no createObjectStore,
    // no DB_VERSION bump) -- deliberately, so an already-installed user's
    // GigTrackerDB never needs a schema migration for this feature.

    it('starts empty', async () => {
      expect(await db.getSavedLocations()).toEqual([]);
    });

    it('adds a location, sorted', async () => {
      await db.addSavedLocation('The Cellar');
      await db.addSavedLocation('Ace Venue');
      expect(await db.getSavedLocations()).toEqual(['Ace Venue', 'The Cellar']);
    });

    it('does not add a duplicate', async () => {
      await db.addSavedLocation('The Cellar');
      await db.addSavedLocation('The Cellar');
      expect(await db.getSavedLocations()).toEqual(['The Cellar']);
    });

    it('trims whitespace and ignores an empty/blank name', async () => {
      await db.addSavedLocation('  The Cellar  ');
      await db.addSavedLocation('   ');
      expect(await db.getSavedLocations()).toEqual(['The Cellar']);
    });

    it('removes a location', async () => {
      await db.addSavedLocation('The Cellar');
      await db.addSavedLocation('Ace Venue');
      await db.removeSavedLocation('The Cellar');
      expect(await db.getSavedLocations()).toEqual(['Ace Venue']);
    });

    it('removing a name that was never saved is a harmless no-op', async () => {
      await db.addSavedLocation('The Cellar');
      await db.removeSavedLocation('Never Saved');
      expect(await db.getSavedLocations()).toEqual(['The Cellar']);
    });
  });
});
