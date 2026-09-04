import { describe, it, expect } from 'vitest';
import {
  recordsToCsv,
  recordsToBackup,
  mergeImportedRecords,
  CSV_COLUMNS,
  DEFAULT_TAX_SETTINGS,
  type CsvRecord,
} from './settings.component';

function rec(over: Partial<CsvRecord> = {}): CsvRecord {
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

  it('includes every required field in the header', () => {
    const header = recordsToCsv([]).split('\n')[0];
    for (const f of [
      'date',
      'type',
      'desc',
      'amount',
      'tips',
      'hours',
      'miles',
      'trueCosts',
      'totalDed',
      'taxSavings',
      'seTax',
      'incomeTax',
      'netAfterAll',
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
      [
        { desc: 'no id', type: 'income' } as CsvRecord,
        { id: 'x' } as CsvRecord,
        rec({ id: 'ok' }),
      ],
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
