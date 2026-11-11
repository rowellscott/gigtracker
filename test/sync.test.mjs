// node --test test/*.test.mjs   — exercises beta/sync.js (the browser loads it as a plain script, so it is
// evaluated here in this realm and its declarations are handed back as one object).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../beta/sync.js', import.meta.url), 'utf8');
const S = vm.runInThisContext(`${source}
;({ SYNC_TAB, RECORD_FIELDS, INBOX_COLUMNS, DEFAULT_CFG, syncHeader, localDateStr, columnLetter,
    parseDate, parseTime, parseAmount, readTable, planSync, inboxRecordId, matchLocation })`);

const TODAY = '2026-11-10';
const NOW = '2026-11-10T22:00:00.000Z';
const serialOf = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;

const recordHeader = S.syncHeader(S.SYNC_TAB.records);
const inboxHeader = S.syncHeader(S.SYNC_TAB.inbox);
const toRow = (header, obj) => header.map(h => obj[h] ?? '');
const inboxRow = fields => S.INBOX_COLUMNS.map(([key]) => fields[key] ?? '');

function rec(over = {}) {
  return { id: 'r1', date: '2026-11-01', type: 'income', desc: 'Gig', amount: 100, hasTips: false,
    tipsInTax: true, deleted: false, updatedAt: '2026-11-01T00:00:00.000Z', ...over };
}

// Stand-in for the app's recordFromForm + calc: keeps what the planner hands over.
const buildRecord = (entry, loc, cfg) => ({
  date: entry.date, type: entry.type, desc: entry.desc, amount: entry.pay === '' ? 0 : entry.pay,
  hasTips: entry.tips > 0, tipsAmount: entry.tips === '' ? 0 : entry.tips,
  start: entry.start, end: entry.end, locationName: loc ? loc.name : entry.location,
  miles: entry.miles !== '' ? entry.miles : loc ? loc.miles : 0, mpgUsed: cfg.mpg, deleted: false,
});

function plan({ recs = [], locations = [], cfg = S.DEFAULT_CFG, cfgUpdatedAt = null, remote = {} } = {}) {
  return S.planSync({
    local: { recs, locations, cfg, cfgUpdatedAt },
    remote: {
      inbox: remote.inbox ?? [inboxHeader],
      records: remote.records ?? [recordHeader],
      locations: remote.locations ?? [S.syncHeader(S.SYNC_TAB.locations)],
      settings: remote.settings ?? [['key', 'value']],
    },
    today: TODAY, now: NOW, buildRecord,
  });
}

test('localDateStr uses the device calendar, not UTC', () => {
  // 9:30pm on Nov 10 is already Nov 11 in UTC west of Greenwich; the entry belongs to the 10th.
  assert.equal(S.localDateStr(new Date(2026, 10, 10, 21, 30)), '2026-11-10');
});

test('parseTime reads the ways a gig time gets written', () => {
  const cases = { '21:00': '21:00', '9pm': '21:00', '9:30 PM': '21:30', '2am': '02:00', '12am': '00:00',
    '12pm': '12:00', '9 p.m.': '21:00', '': '' };
  for (const [input, want] of Object.entries(cases)) assert.equal(S.parseTime(input), want, input);
  assert.equal(S.parseTime(0.875), '21:00');
  assert.equal(S.parseTime(46336.0833333), '02:00');
  for (const bad of ['9', '25:00', '13pm', '9:75', 'late']) assert.equal(S.parseTime(bad), null, bad);
});

test('parseDate reads ISO, US and Sheets serial dates and rejects impossible ones', () => {
  assert.equal(S.parseDate('2026-11-10', TODAY), '2026-11-10');
  assert.equal(S.parseDate('11/10/2026', TODAY), '2026-11-10');
  assert.equal(S.parseDate('11/10/26', TODAY), '2026-11-10');
  assert.equal(S.parseDate('11/10', TODAY), '2026-11-10');
  assert.equal(S.parseDate(serialOf(2026, 11, 10), TODAY), '2026-11-10');
  assert.equal(S.parseDate('', TODAY), '');
  assert.equal(S.parseDate('2026-02-30', TODAY), null);
  assert.equal(S.parseDate('next friday', TODAY), null);
});

test('parseAmount accepts currency formatting and rejects the rest', () => {
  assert.equal(S.parseAmount('$150'), 150);
  assert.equal(S.parseAmount('1,200.50'), 1200.5);
  assert.equal(S.parseAmount(30), 30);
  assert.equal(S.parseAmount(''), '');
  assert.equal(S.parseAmount('abc'), null);
  assert.equal(S.parseAmount(-5), null);
});

test('columnLetter', () => {
  assert.deepEqual([0, 12, 25, 26, 51, 52].map(S.columnLetter), ['A', 'M', 'Z', 'AA', 'AZ', 'BA']);
});

test('an empty sheet receives every local record, deleted ones included', () => {
  const p = plan({ recs: [rec(), rec({ id: 'r2', deleted: true })] });
  assert.equal(p.appends.Records.length, 2);
  assert.equal(p.localRecs.length, 0);
  const back = S.readTable([recordHeader, ...p.appends.Records], S.RECORD_FIELDS).rows.map(r => r.obj);
  assert.deepEqual(back.map(r => [r.id, r.deleted, r.amount, r.date]), [['r1', false, 100, '2026-11-01'], ['r2', true, 100, '2026-11-01']]);
});

test('the newer side wins in both directions; equal timestamps change nothing', () => {
  const sheetNewer = rec({ id: 'a', amount: 200, updatedAt: '2026-11-05T00:00:00.000Z' });
  const sheetOlder = rec({ id: 'b', amount: 1, updatedAt: '2026-11-01T00:00:00.000Z' });
  const same = rec({ id: 'c' });
  const p = plan({
    recs: [rec({ id: 'a' }), rec({ id: 'b', amount: 2, updatedAt: '2026-11-03T00:00:00.000Z' }), same],
    remote: { records: [recordHeader, toRow(recordHeader, sheetNewer), toRow(recordHeader, sheetOlder), toRow(recordHeader, same)] },
  });
  assert.deepEqual(p.localRecs.map(r => [r.id, r.amount]), [['a', 200]]);
  assert.deepEqual(p.updates.map(u => u.range), ['Records!A3']);
  assert.equal(p.updates[0].values[0][recordHeader.indexOf('amount')], 2);
  assert.equal(p.appends.Records.length, 0);
});

test('an Inbox row becomes one record, its row is marked, and a second sync does not duplicate it', () => {
  const row = inboxRow({ added: '2026-11-10T21:58:00', date: '2026-11-10', desc: "Johnny Brown's — Miss Dempsey's class",
    pay: 150, tips: '$30', start: '9pm', end: '2:00 AM', location: 'johnny browns' });
  const locations = [{ id: 'L1', name: "Johnny Brown's", address: '1 Beach Blvd', miles: 22, updatedAt: '2026-01-01' }];
  const first = plan({ locations, remote: { inbox: [inboxHeader, row] } });

  assert.equal(first.counts.imported, 1);
  const [made] = first.localRecs;
  assert.match(made.id, /^inbox-[0-9a-f]{16}$/);
  assert.deepEqual([made.amount, made.tipsAmount, made.start, made.end, made.locationName, made.miles, made.source],
    [150, 30, '21:00', '02:00', "Johnny Brown's", 22, 'inbox']);
  assert.equal(first.appends.Records.length, 1);
  assert.deepEqual(first.updates.at(-1), { range: 'Inbox!M2', values: [[made.id]] });

  // The mark didn't reach the sheet, but this device already has the record: mark again, don't re-import.
  const again = plan({ recs: [made], locations, remote: { inbox: [inboxHeader, row] } });
  assert.equal(again.counts.imported, 0);
  assert.deepEqual(again.updates.at(-1), { range: 'Inbox!M2', values: [[made.id]] });

  // Another device that only sees it in Records doesn't import it either.
  const other = plan({ remote: { inbox: [inboxHeader, row], records: [recordHeader, toRow(recordHeader, made)] } });
  assert.equal(other.counts.imported, 0);
  assert.equal(other.localRecs[0].id, made.id);
});

test('a record deleted in the app is not resurrected by its Inbox row', () => {
  const row = inboxRow({ added: 'x', date: '2026-11-10', desc: 'Gig', pay: 100 });
  const id = plan({ remote: { inbox: [inboxHeader, row] } }).localRecs[0].id;
  const p = plan({ recs: [rec({ id, deleted: true, updatedAt: NOW })], remote: { inbox: [inboxHeader, row] } });
  assert.equal(p.counts.imported, 0);
});

test('Inbox rows already imported, blank, or unreadable are left alone, with a reason for the unreadable', () => {
  const p = plan({ remote: { inbox: [inboxHeader,
    inboxRow({ desc: 'Done before', imported: 'inbox-abc' }),
    [],
    inboxRow({ desc: 'Bad time', start: '9' }),
    inboxRow({ desc: 'Bad type', type: 'constructor' }),
    inboxRow({ pay: 50 }),
  ] } });
  assert.equal(p.counts.imported, 0);
  assert.deepEqual(p.updates.filter(u => u.range.startsWith('Inbox')), []);
  assert.deepEqual(p.warnings, [
    'Inbox row 4: can\'t read Start "9" (use 21:00 or 9pm)',
    'Inbox row 5: unknown Type "constructor" (use income, rehearsal or expense)',
    'Inbox row 6: no Description',
  ]);
});

test('Inbox values typed into the sheet (serial dates and times) import the same as text', () => {
  const p = plan({ remote: { inbox: [inboxHeader,
    inboxRow({ added: 46336.9, date: serialOf(2026, 11, 10), desc: 'Gig', type: 'Gig', pay: 150, start: 0.875, end: 0.0833333 })] } });
  const [made] = p.localRecs;
  assert.deepEqual([made.date, made.type, made.start, made.end], ['2026-11-10', 'income', '21:00', '02:00']);
});

test('an empty Date means today', () => {
  assert.equal(plan({ remote: { inbox: [inboxHeader, inboxRow({ desc: 'Gig' })] } }).localRecs[0].date, TODAY);
});

test('a Records tab missing a column gets it added, and columns the app does not know are kept', () => {
  const oldHeader = recordHeader.filter(h => h !== 'source').concat('Accountant note');
  const sheetRow = [...toRow(oldHeader, rec({ id: 'a' })).slice(0, -1), 'deductible?'];
  const p = plan({ recs: [rec({ id: 'a', amount: 999, updatedAt: NOW })], remote: { records: [oldHeader, sheetRow] } });
  const [headerWrite, rowWrite] = p.updates;
  assert.deepEqual(headerWrite, { range: 'Records!A1', values: [[...oldHeader, 'source']] });
  assert.equal(rowWrite.range, 'Records!A2');
  assert.equal(rowWrite.values[0][oldHeader.indexOf('Accountant note')], 'deductible?');
  assert.equal(rowWrite.values[0][oldHeader.indexOf('amount')], 999);
});

test('duplicate rows for one id: the newest wins and receives the update', () => {
  const older = rec({ id: 'a', amount: 1, updatedAt: '2026-11-01T00:00:00.000Z' });
  const newer = rec({ id: 'a', amount: 2, updatedAt: '2026-11-02T00:00:00.000Z' });
  const p = plan({ recs: [rec({ id: 'a', amount: 3, updatedAt: NOW })],
    remote: { records: [recordHeader, toRow(recordHeader, newer), toRow(recordHeader, older)] } });
  assert.deepEqual(p.updates.map(u => u.range), ['Records!A2']);
});

test('settings: the newer side wins, and untouched defaults never overwrite the sheet', () => {
  const sheet = [['key', 'value'], ['federalRate', 22], ['stateRate', 0], ['irsRate', 0.7], ['trueCostRate', 0.5], ['mpg', 30], ['updatedAt', '2026-11-02']];
  const pulled = plan({ remote: { settings: sheet } });
  assert.deepEqual([pulled.cfg.federalRate, pulled.cfg.mpg, pulled.cfgUpdatedAt], [22, 30, '2026-11-02']);
  assert.equal(pulled.localRecs.length, 0);

  const fresh = plan();
  assert.deepEqual([fresh.cfg, fresh.updates], [null, []]);

  const custom = plan({ cfg: { ...S.DEFAULT_CFG, mpg: 35 } });
  assert.equal(custom.cfgUpdatedAt, NOW);
  assert.deepEqual(custom.updates[0].values.at(-2), ['mpg', 35]);

  const localNewer = plan({ cfg: { ...S.DEFAULT_CFG, mpg: 40 }, cfgUpdatedAt: '2026-11-05', remote: { settings: sheet } });
  assert.deepEqual([localNewer.cfg, localNewer.cfgUpdatedAt], [null, null]);
  assert.deepEqual(localNewer.updates[0].values.at(-1), ['updatedAt', '2026-11-05']);
});

test('Inbox imports use the rates pulled in the same sync', () => {
  const sheet = [['key', 'value'], ['federalRate', 24], ['stateRate', 0], ['irsRate', 0.725], ['trueCostRate', 0.5], ['mpg', 50], ['updatedAt', '2026-11-02']];
  const p = plan({ remote: { settings: sheet, inbox: [inboxHeader, inboxRow({ desc: 'Gig' })] } });
  assert.equal(p.localRecs[0].mpgUsed, 50);
});

test('locations sync like records, including soft deletes', () => {
  const header = S.syncHeader(S.SYNC_TAB.locations);
  const gone = { id: 'L1', name: 'Old bar', miles: 5, deleted: true, updatedAt: '2026-11-03' };
  const p = plan({ locations: [{ id: 'L1', name: 'Old bar', miles: 5, deleted: false, updatedAt: '2026-11-01' }],
    remote: { locations: [header, toRow(header, gone)] } });
  assert.deepEqual(p.localLocations.map(l => [l.id, l.deleted]), [['L1', true]]);
});

test('inboxRecordId depends on the entry, not on where the row sits', () => {
  const cells = { added: 'a', date: '2026-11-10', desc: 'Gig', pay: 100 };
  const id1 = S.inboxRecordId(k => cells[k]);
  assert.equal(S.inboxRecordId(k => ({ ...cells, notes: 'changed later' })[k]), id1);
  assert.notEqual(S.inboxRecordId(k => ({ ...cells, pay: 101 })[k]), id1);
});
