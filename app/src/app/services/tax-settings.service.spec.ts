import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { GigDbService } from './gig-db.service';
import { TaxSettingsService } from './tax-settings.service';

const DEFAULTS = {
  federalRate: 24,
  stateRate: 0,
  irsRate: 0.725,
  trueCostRate: 0.5,
  mpg: 28,
};

describe('TaxSettingsService', () => {
  let db: GigDbService;
  let service: TaxSettingsService;

  beforeEach(() => {
    // Fresh fake IndexedDB per test so stored settings never leak across.
    globalThis.indexedDB = new IDBFactory();
    TestBed.configureTestingModule({});
    db = TestBed.inject(GigDbService);
    service = TestBed.inject(TaxSettingsService);
  });

  it('returns the defaults when nothing is stored', async () => {
    await service.ensureLoaded();
    expect(service.settings()).toEqual(DEFAULTS);
  });

  it('merges a stored partial over the defaults', async () => {
    await db.kvSet('appSettings', { federalRate: 32, irsRate: 0.7 });
    await service.reload();
    expect(service.settings()).toEqual({
      ...DEFAULTS,
      federalRate: 32,
      irsRate: 0.7,
    });
  });

  it('combinedRatePct is federalRate + stateRate', async () => {
    await db.kvSet('appSettings', { federalRate: 24, stateRate: 6 });
    await service.reload();
    expect(service.combinedRatePct()).toBe(30);
    expect(service.irsRate()).toBe(0.725);
    expect(service.trueCostRate()).toBe(0.5);
  });

  it('save() round-trips through IndexedDB and updates the signal', async () => {
    const cfg = { federalRate: 20, stateRate: 5, irsRate: 0.67, trueCostRate: 0.4, mpg: 30 };
    await service.save(cfg);
    expect(service.settings()).toEqual(cfg);
    expect(service.combinedRatePct()).toBe(25);

    // A fresh service instance reads the same values back out of the store.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reopened = TestBed.inject(TaxSettingsService);
    await reopened.ensureLoaded();
    expect(reopened.settings()).toEqual(cfg);
  });
});
