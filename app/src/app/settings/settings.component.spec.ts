import { describe, it, expect } from 'vitest';
import {
  recordsToCsv,
  recordsToBackup,
  mergeImportedRecords,
  CSV_COLUMNS,
  DEFAULT_TAX_SETTINGS,
  type ExportRecord,
} from './settings.component';

function rec(over: Partial<ExportRecord> = {}): ExportRecord {
  return {
    id: 'a',
    date: '2026-01-01',
    type: 'income',
    desc: 'Gig',
    amount: 300,
    tips: 20,
    hours: 4,
    miles: 50,
    trueCosts: 25,
    totalDed: 36.25,
    taxSavings: 8.7,
    seTax: 42.4,
    incomeTax: 63.3,
    netAfterAll: 190,
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...over,
  };
}

describe('recordsToCsv', () => {
  it('has a header row plus one row per record', () => {
    const csv = recordsToCsv([rec({ id: 'a' }), rec({ id: 'b' })]);
    const lines = csv.split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0].split(',')).toEqual(CSV_COLUMNS);
  });

  it('includes every legacy accountant-facing column in the header', () => {
    // The header row is the human-readable label row from exportCSV() in
    // index.html, kept verbatim so a CSV opened in Numbers/Excel looks the
    // same as it always has.
    const header = recordsToCsv([]).split('\n')[0];
    for (const f of [
      'Date',
      'Pay Date',
      'Type',
      'Description',
      'Base Pay',
      'Tips',
      'Total Income',
      'Hours',
      'Miles',
      'IRS Ded',
      'Total Costs',
      'Total Ded',
      'Tax Savings',
      'SE Tax',
      'Income Tax',
      'Net After All',
      'Notes',
    ]) {
      expect(header).toContain(f);
    }
  });

  it('emits the values and quotes commas', () => {
    const csv = recordsToCsv([rec({ desc: 'Jazz, Trio' })]);
    const row = csv.split('\n')[1];
    expect(row).toContain('"Jazz, Trio"');
    expect(row).toContain('300');
    expect(row).toContain('190');
  });

  it('matches the legacy row shape: Pay Date, Tips In Tax yes/no, Total Income = base + tips', () => {
    const csv = recordsToCsv([
      rec({
        date: '2026-01-01',
        payDate: '2026-01-08',
        amount: 300,
        tips: 20,
        tipsInTax: true,
        payMethod: 'Venmo',
      }),
    ]);
    const cells = csv.split('\n')[1].split(',');
    // Date, Pay Date, Type, "Description", Base Pay, Tips, Tips In Tax, Total Income, ...
    expect(cells[0]).toBe('2026-01-01');
    expect(cells[1]).toBe('2026-01-08');
    expect(cells[4]).toBe('300.00');
    expect(cells[5]).toBe('20.00');
    expect(cells[6]).toBe('yes');
    expect(cells[7]).toBe('320.00');
  });

  it('Tips In Tax is "no" when the record opted tips out of tax', () => {
    const csv = recordsToCsv([rec({ tipsInTax: false })]);
    expect(csv.split('\n')[1].split(',')[6]).toBe('no');
  });
});

describe('recordsToBackup appVersion', () => {
  it('stamps the legacy app version so a backup restores like the old app expects', () => {
    const backup = recordsToBackup([], { ...DEFAULT_TAX_SETTINGS });
    expect(backup.appVersion).toBe('2.0');
  });
});

describe('recordsToBackup', () => {
  it('round-trips taxConfig and records through JSON', () => {
    const cfg = { ...DEFAULT_TAX_SETTINGS, federalRate: 32 };
    const backup = recordsToBackup([rec()], cfg);
    const parsed = JSON.parse(JSON.stringify(backup));
    expect(parsed.taxConfig).toEqual(cfg);
    expect(parsed.records.length).toBe(1);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(new Date(parsed.exportedAt).toString()).not.toBe('Invalid Date');
  });
});

describe('mergeImportedRecords', () => {
  it('skips entries missing id or type', () => {
    const res = mergeImportedRecords(
      [],
      [{ desc: 'no id', type: 'income' }, { id: 'x' }, rec({ id: 'ok' })],
    );
    expect(res.skipped).toBe(2);
    expect(res.toSave.map((r) => r.id)).toEqual(['ok']);
  });

  it('adds records that are new', () => {
    const res = mergeImportedRecords([rec({ id: 'a' })], [rec({ id: 'b' })]);
    expect(res.toSave.map((r) => r.id)).toEqual(['b']);
    expect(res.skipped).toBe(0);
  });

  it('replaces only when incoming updatedAt is newer or equal', () => {
    const existing = [rec({ id: 'a', updatedAt: '2026-01-05T00:00:00.000Z' })];

    const older = mergeImportedRecords(existing, [
      rec({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    expect(older.toSave.length).toBe(0);
    expect(older.skipped).toBe(1);

    const equal = mergeImportedRecords(existing, [
      rec({ id: 'a', updatedAt: '2026-01-05T00:00:00.000Z' }),
    ]);
    expect(equal.toSave.length).toBe(1);

    const newer = mergeImportedRecords(existing, [
      rec({ id: 'a', desc: 'newer', updatedAt: '2026-02-05T00:00:00.000Z' }),
    ]);
    expect(newer.toSave.length).toBe(1);
    expect(newer.toSave[0].desc).toBe('newer');
  });
});

// --- F2: Saved-locations management on the Settings screen -----------------
import { TestBed } from '@angular/core/testing';
import { SettingsComponent } from './settings.component';
import { GigDbService, SavedLocation } from '../services/gig-db.service';
import { TaxSettingsService } from '../services/tax-settings.service';

describe('SettingsComponent — saved locations (F2)', () => {
  async function mount(initial: SavedLocation[] = []) {
    let locations = [...initial];
    const dbStub = {
      kvGet: () => Promise.resolve(null),
      kvSet: () => Promise.resolve(),
      recsGetAll: () => Promise.resolve([]),
      getSavedLocations: () =>
        Promise.resolve([...locations].sort((a, b) => a.name.localeCompare(b.name))),
      saveSavedLocation: (loc: SavedLocation) => {
        const name = loc.name.trim();
        const cleaned: SavedLocation = { name };
        if (loc.address?.trim()) cleaned.address = loc.address.trim();
        if (loc.miles != null && !isNaN(loc.miles)) cleaned.miles = loc.miles;
        locations = [...locations.filter((l) => l.name !== name), cleaned];
        return Promise.resolve([...locations].sort((a, b) => a.name.localeCompare(b.name)));
      },
      removeSavedLocation: (name: string) => {
        locations = locations.filter((l) => l.name !== name);
        return Promise.resolve([...locations]);
      },
    };
    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        { provide: GigDbService, useValue: dbStub },
        {
          provide: TaxSettingsService,
          useValue: {
            reload: () => Promise.resolve(),
            settings: () => DEFAULT_TAX_SETTINGS,
            save: () => Promise.resolve(),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SettingsComponent);
    const cmp = fixture.componentInstance;
    await cmp.load();
    return cmp;
  }

  it('lists existing locations on load', async () => {
    const cmp = await mount([
      { name: 'Zed Hall', miles: 9 },
      { name: 'Ace', address: '1 A St' },
    ]);
    expect(cmp.savedLocations().map((l) => l.name)).toEqual(['Ace', 'Zed Hall']);
  });

  it('addLocation saves and clears the form', async () => {
    const cmp = await mount();
    cmp.newLoc = { name: 'Studio B', address: '9 Ivy Rd', miles: '8' };
    await cmp.addLocation();
    expect(cmp.savedLocations()).toEqual([{ name: 'Studio B', address: '9 Ivy Rd', miles: 8 }]);
    expect(cmp.newLoc).toEqual({ name: '', address: '', miles: '' });
  });

  it('addLocation with a blank name is rejected', async () => {
    const cmp = await mount();
    cmp.newLoc = { name: '   ', address: 'x', miles: '1' };
    await cmp.addLocation();
    expect(cmp.savedLocations()).toEqual([]);
  });

  it('deleteLocation removes it', async () => {
    const cmp = await mount([
      { name: 'Gone', miles: 1 },
      { name: 'Stay', miles: 2 },
    ]);
    await cmp.deleteLocation('Gone');
    expect(cmp.savedLocations().map((l) => l.name)).toEqual(['Stay']);
  });
});
