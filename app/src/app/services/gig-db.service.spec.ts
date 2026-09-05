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

  it('kvGet/kvSet round-trip a stored value', async () => {
    expect(await db.kvGet('kvRoundTrip')).toBeNull();
    await db.kvSet('kvRoundTrip', { federalRate: 22 });
    expect(await db.kvGet('kvRoundTrip')).toEqual({ federalRate: 22 });
  });

  describe('saved gig locations', () => {
    // Reuses the existing 'kv' store under a new key (no createObjectStore,
    // no DB_VERSION bump) -- deliberately, so an already-installed user's
    // GigTrackerDB never needs a schema migration for this feature. Each
    // saved location carries a name, an optional address (reference only --
    // no geocoding, this app stays offline/no-account by design), and an
    // optional mileage that auto-fills the Add form's Miles field when picked.

    it('starts empty', async () => {
      expect(await db.getSavedLocations()).toEqual([]);
    });

    it('saves a location with address and mileage, sorted by name', async () => {
      await db.saveSavedLocation({ name: 'The Cellar', address: '12 Main St', miles: 8.4 });
      await db.saveSavedLocation({ name: 'Ace Venue', miles: 3 });
      expect(await db.getSavedLocations()).toEqual([
        { name: 'Ace Venue', miles: 3 },
        { name: 'The Cellar', address: '12 Main St', miles: 8.4 },
      ]);
    });

    it('saving the same name again updates it in place rather than duplicating', async () => {
      await db.saveSavedLocation({ name: 'The Cellar', miles: 8 });
      await db.saveSavedLocation({ name: 'The Cellar', address: '12 Main St', miles: 8.4 });
      expect(await db.getSavedLocations()).toEqual([
        { name: 'The Cellar', address: '12 Main St', miles: 8.4 },
      ]);
    });

    it('trims whitespace and ignores a blank name', async () => {
      await db.saveSavedLocation({ name: '  The Cellar  ' });
      await db.saveSavedLocation({ name: '   ' });
      expect(await db.getSavedLocations()).toEqual([{ name: 'The Cellar' }]);
    });

    it('removes a location', async () => {
      await db.saveSavedLocation({ name: 'The Cellar' });
      await db.saveSavedLocation({ name: 'Ace Venue' });
      await db.removeSavedLocation('The Cellar');
      expect(await db.getSavedLocations()).toEqual([{ name: 'Ace Venue' }]);
    });

    it('removing a name that was never saved is a harmless no-op', async () => {
      await db.saveSavedLocation({ name: 'The Cellar' });
      await db.removeSavedLocation('Never Saved');
      expect(await db.getSavedLocations()).toEqual([{ name: 'The Cellar' }]);
    });

    it('reads old plain-string entries (the previous shape) as name-only locations', async () => {
      // Nothing shipped/deployed against the old string[] shape, but this
      // costs nothing and matches how the rest of this file protects
      // already-installed data from schema/shape changes.
      await db.kvSet('savedGigLocations', ['Legacy Venue']);
      expect(await db.getSavedLocations()).toEqual([{ name: 'Legacy Venue' }]);
    });
  });
});
