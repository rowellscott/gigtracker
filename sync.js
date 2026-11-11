// GigTracker ↔ Google Sheet sync — the pure part: reading sheet rows and deciding what to write
// where. No DOM, network or IndexedDB in this file, so test/sync.test.mjs can run it under node.
// The sheet is the copy every device shares; Claude adds gigs to its Inbox tab.
'use strict';

const SYNC_TAB = { inbox: 'Inbox', records: 'Records', locations: 'Locations', settings: 'Settings' };

// Field → cell type: d = YYYY-MM-DD, t = HH:MM, s = text, n = number, b = true/false.
// The order is the column order of a new Records tab: the fields a person reads first, id last.
const RECORD_FIELDS = [
  ['date','d'], ['type','s'], ['desc','s'], ['locationName','s'], ['amount','n'], ['tips','n'],
  ['hours','n'], ['miles','n'], ['netAfterAll','n'], ['payMethod','s'], ['payDate','d'],
  ['start','t'], ['end','t'], ['address','s'], ['notes','s'],
  ['hasTips','b'], ['tipsAmount','n'], ['tipsInTax','b'], ['hasToll','b'], ['tollCost','n'],
  ['hasMeal','b'], ['mealCost','n'], ['hasOther','b'], ['otherDesc','s'], ['otherCost','n'],
  ['hasRoom','b'], ['roomCost','n'], ['gasPrice','n'],
  ['fuelCost','n'], ['trueCostMiles','n'], ['irsDed','n'], ['dedMeals','n'], ['totalDed','n'],
  ['taxSavings','n'], ['trueCosts','n'], ['seTax','n'], ['incomeTax','n'], ['totalTax','n'],
  ['trueHourly','n'], ['grossHourly','n'], ['toll','n'], ['meal','n'], ['oth','n'], ['room','n'],
  ['deleted','b'], ['source','s'], ['createdAt','s'], ['updatedAt','s'], ['id','s'],
  ['deductPct','n'],
];
const LOCATION_FIELDS = [
  ['name','s'], ['address','s'], ['miles','n'], ['deleted','b'], ['createdAt','s'], ['updatedAt','s'], ['id','s'],
];

// Read-only tabs showing one record type each, filled by a QUERY over Records.
// Columns: [field, heading, number format ('' = as stored)]. Paid rehearsals are income, so they're under Gigs.
const MONEY = '$#,##0.00';
const VIEW_TABS = [
  { title: 'Gigs', type: 'income', columns: [
    ['date','Date',''], ['desc','Description',''], ['locationName','Location',''], ['amount','Pay',MONEY],
    ['tips','Tips',MONEY], ['hours','Hours','0.0'], ['miles','Miles','0'], ['payMethod','Pay method',''],
    ['totalTax','Est. tax',MONEY], ['netAfterAll','Net',MONEY], ['notes','Notes',''],
  ] },
  { title: 'Rehearsals', type: 'rehearsal', columns: [
    ['date','Date',''], ['desc','Description',''], ['locationName','Location',''], ['hours','Hours','0.0'],
    ['miles','Miles','0'], ['trueCosts','Cost',MONEY], ['totalDed','Deductible',MONEY], ['notes','Notes',''],
  ] },
  { title: 'Expenses', type: 'expense', columns: [
    ['date','Date',''], ['desc','Description',''], ['amount','Amount',MONEY], ['totalDed','Deductible',MONEY],
    ['notes','Notes',''],
  ] },
];

const DEFAULT_CFG = { federalRate: 24, stateRate: 0, irsRate: 0.725, trueCostRate: 0.50, mpg: 28 };
const SETTINGS_KEYS = Object.keys(DEFAULT_CFG);

// The one tab people and Claude write to, so its headers are words. GigTracker fills "Imported".
const INBOX_COLUMNS = [
  ['added','Added'], ['date','Date'], ['desc','Description'], ['type','Type'], ['pay','Pay'],
  ['tips','Tips'], ['start','Start'], ['end','End'], ['location','Location'], ['miles','Miles'],
  ['payMethod','Pay Method'], ['notes','Notes'], ['imported','Imported'], ['deductPct','Deductible %'],
];
// A Map, not an object: a Type cell saying "constructor" must not find Object.prototype.
const INBOX_TYPES = new Map([
  ['income','income'], ['gig','income'], ['rehearsal','rehearsal'], ['practice','rehearsal'], ['expense','expense'],
]);
// The Inbox columns that identify an entry (see inboxRecordId).
const INBOX_IDENTITY = ['added','date','desc','pay','tips','start','end'];

// Sheets serial dates count days from 1899-12-30; the fraction is the time of day.
const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;
const MINUTES_PER_DAY = 1440;

function syncHeader(tab) {
  if (tab === SYNC_TAB.inbox) return INBOX_COLUMNS.map(([, label]) => label);
  if (tab === SYNC_TAB.records) return RECORD_FIELDS.map(([k]) => k);
  if (tab === SYNC_TAB.locations) return LOCATION_FIELDS.map(([k]) => k);
  return ['key', 'value'];
}

// The device's own calendar date. toISOString() is UTC, which is already tomorrow on a Florida evening.
function localDateStr(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function columnLetter(index) {
  let s = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

const isBlank = v => v === '' || v == null;
const pad2 = n => String(n).padStart(2, '0');

function ymd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const valid = dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  return valid ? dt.toISOString().slice(0, 10) : null;
}

// '' when empty, null when unreadable. Accepts a Sheets serial, YYYY-MM-DD, M/D/YYYY, M/D/YY and
// M/D (this year, taken from `today`).
function parseDate(v, today) {
  if (isBlank(v)) return '';
  if (typeof v === 'number') {
    return v > 0 ? new Date(SHEETS_EPOCH_MS + Math.floor(v) * DAY_MS).toISOString().slice(0, 10) : null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +String(today).slice(0, 4);
  return ymd(year, +m[1], +m[2]);
}

// '' when empty, null when unreadable. Accepts a Sheets time fraction, 21:00, 9pm, 9:30 PM.
// A bare "9" is rejected: it could be morning or night.
function parseTime(v) {
  if (isBlank(v)) return '';
  if (typeof v === 'number') {
    if (v < 0) return null;
    const mins = Math.round((v - Math.floor(v)) * MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
  }
  const m = String(v).trim().toLowerCase().replace(/[\s.]+/g, '').match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/);
  if (!m || (!m[2] && !m[3])) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = h % 12 + (m[3][0] === 'p' ? 12 : 0);
  } else if (h > 23) {
    return null;
  }
  return `${pad2(h)}:${pad2(min)}`;
}

// '' when empty, null when unreadable or negative. Accepts 150, "$150", "1,200.50".
function parseAmount(v) {
  if (isBlank(v)) return '';
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  const s = String(v).trim().replace(/[$,\s]/g, '');
  return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
}

// '' when empty, null when unreadable or outside 0–100. Accepts 50, "50%", " 50 % ".
function parsePercent(v) {
  if (isBlank(v)) return '';
  const n = typeof v === 'number' ? v : parseAmount(String(v).replace(/%\s*$/, ''));
  return typeof n === 'number' && n >= 0 && n <= 100 ? n : null;
}

// A machine-tab cell → the value the app stores. Records are written RAW so they normally come
// back as written; the parsing covers cells someone retyped in the sheet.
function cellToField(type, v) {
  if (type === 'b') return v === true || /^(true|yes|1)$/i.test(String(v ?? '').trim());
  if (isBlank(v)) return type === 'n' ? undefined : '';
  if (type === 'n') {
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === 'd') return parseDate(v, '') ?? String(v);
  if (type === 't') return parseTime(v) ?? String(v);
  return String(v);
}

// null/undefined become '' because the Sheets API skips null cells, which would leave the old value.
function fieldToCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  if (typeof v === 'boolean') return v;
  return String(v);
}

// A machine tab → { header, rows: [{ obj, row }] }, read by header name so column order doesn't matter.
// Columns the app doesn't know (someone's own notes column) are carried along untouched.
function readTable(values, fields) {
  const types = new Map(fields);
  const header = (values[0] || []).map(h => String(h ?? '').trim());
  const rows = [];
  values.slice(1).forEach((cells = [], i) => {
    if (cells.every(isBlank)) return;
    const obj = {};
    header.forEach((h, c) => {
      if (!h) return;
      const v = types.has(h) ? cellToField(types.get(h), cells[c]) : (cells[c] ?? '');
      if (v !== undefined) obj[h] = v;
    });
    rows.push({ obj, row: i + 2 });
  });
  return { header, rows };
}

// Last writer wins. ISO timestamps compare correctly as text; a missing one counts as oldest.
const isNewer = (a, b) => (a?.updatedAt || '') > (b?.updatedAt || '');

// A tab's header after sync: its own columns in their order, then any known field it lacks.
function completeHeader(sheetHeader, fields) {
  const header = [...sheetHeader];
  for (const [k] of fields) if (!header.includes(k)) header.push(k);
  return header;
}

// The formula for a view tab. Letters come from the real Records header, so a column someone
// added or moved in the sheet doesn't break it.
function viewFormula(view, recordsHeader) {
  const col = k => columnLetter(recordsHeader.indexOf(k));
  const cols = view.columns.filter(([k]) => recordsHeader.includes(k));
  const formats = cols.filter(([, , fmt]) => fmt).map(([k, , fmt]) => `${col(k)} '${fmt}'`);
  const deleted = col('deleted');
  const query = [
    `select ${cols.map(([k]) => col(k)).join(', ')}`,
    `where ${col('type')} = '${view.type}' and (${deleted} = false or ${deleted} is null)`,
    `order by ${col('date')} desc`,
    `label ${cols.map(([k, heading]) => `${col(k)} '${heading}'`).join(', ')}`,
    ...(formats.length ? [`format ${formats.join(', ')}`] : []),
  ].join(' ');
  return `=QUERY(${SYNC_TAB.records}!A:${columnLetter(recordsHeader.length - 1)}, "${query}", 1)`;
}

// Merge one machine tab: what to save locally, which rows to overwrite, which rows to add.
function planTable(tab, fields, local, values) {
  const { header: sheetHeader, rows } = readTable(values, fields);
  const remote = new Map();
  for (const r of rows) {
    const id = r.obj.id;
    if (!id) continue;
    if (!remote.has(id) || isNewer(r.obj, remote.get(id).obj)) remote.set(id, r);
  }

  const header = completeHeader(sheetHeader, fields);
  const known = new Set(fields.map(([k]) => k));
  const rowFor = (item, sheetObj) =>
    header.map(h => !h ? '' : fieldToCell(known.has(h) || !sheetObj ? item[h] : (item[h] ?? sheetObj[h])));

  const localById = new Map(local.map(x => [x.id, x]));
  // A record this device lacks always comes down, even with no updatedAt (records restored from an
  // old backup may not have one).
  const toLocal = [...remote.values()]
    .filter(r => !localById.has(r.obj.id) || isNewer(r.obj, localById.get(r.obj.id)))
    .map(r => r.obj);

  const updates = [];
  const appends = [];
  for (const item of local) {
    if (!item.id) continue;
    const r = remote.get(item.id);
    if (r && !isNewer(item, r.obj)) continue;
    if (r) updates.push({ range: `${tab}!A${r.row}`, values: [rowFor(item, r.obj)] });
    else appends.push(rowFor(item));
  }
  const pushed = updates.length + appends.length;
  if (header.length !== sheetHeader.length) updates.unshift({ range: `${tab}!A1`, values: [header] });
  return { toLocal, updates, appends, pushed, remoteIds: new Set(remote.keys()) };
}

function planSettings(localCfg, localUpdatedAt, values, now) {
  const sheet = new Map((values || []).slice(1).map(r => [String(r?.[0] ?? '').trim(), r?.[1]]));
  const sheetCfg = {};
  for (const k of SETTINGS_KEYS) {
    const v = sheet.get(k);
    if (!isBlank(v) && Number.isFinite(Number(v))) sheetCfg[k] = Number(v);
  }
  const sheetAt = isBlank(sheet.get('updatedAt')) ? '' : String(sheet.get('updatedAt'));
  const sheetComplete = sheetAt && SETTINGS_KEYS.every(k => k in sheetCfg);
  const localAt = localUpdatedAt || '';
  const nothing = { cfg: null, cfgUpdatedAt: null, updates: [] };

  if (sheetComplete && sheetAt > localAt) return { cfg: sheetCfg, cfgUpdatedAt: sheetAt, updates: [] };
  if (sheetComplete && sheetAt === localAt) return nothing;
  // Never-edited defaults stay off the sheet, so a new phone can't overwrite rates set on the computer.
  if (!localAt && SETTINGS_KEYS.every(k => localCfg[k] === DEFAULT_CFG[k])) return nothing;

  const at = localAt || now;
  const rows = [['key', 'value'], ...SETTINGS_KEYS.map(k => [k, fieldToCell(localCfg[k])]), ['updatedAt', at]];
  return { cfg: null, cfgUpdatedAt: localAt ? null : at, updates: [{ range: `${SYNC_TAB.settings}!A1`, values: rows }] };
}

// One Inbox row → the plain fields of a new record, or why it can't be imported yet.
// `get(key)` returns the raw cell for an INBOX_COLUMNS key.
function parseInboxRow(get, today) {
  const desc = String(get('desc') ?? '').trim();
  if (!desc) return { error: 'no Description' };
  const date = parseDate(get('date'), today);
  if (date === null) return { error: `can't read Date "${get('date')}" (use YYYY-MM-DD)` };
  const typeWord = String(get('type') ?? '').trim().toLowerCase();
  const type = typeWord ? INBOX_TYPES.get(typeWord) : 'income';
  if (!type) return { error: `unknown Type "${get('type')}" (use income, rehearsal or expense)` };

  const entry = {
    date: date || today, type, desc,
    location: String(get('location') ?? '').trim(),
    payMethod: String(get('payMethod') ?? '').trim(),
    notes: String(get('notes') ?? '').trim(),
  };
  for (const [key, label] of [['pay','Pay'], ['tips','Tips'], ['miles','Miles']]) {
    entry[key] = parseAmount(get(key));
    if (entry[key] === null) return { error: `can't read ${label} "${get(key)}"` };
  }
  entry.deductPct = parsePercent(get('deductPct'));
  if (entry.deductPct === null) return { error: `can't read Deductible % "${get('deductPct')}" (use 0 to 100)` };
  // The app's rehearsal type is unpaid: Summary counts pay only on income records, so a paid
  // rehearsal is income, exactly as it would be entered on the Add screen.
  if (entry.type === 'rehearsal' && entry.pay > 0) entry.type = 'income';
  for (const [key, label] of [['start','Start'], ['end','End']]) {
    entry[key] = parseTime(get(key));
    if (entry[key] === null) return { error: `can't read ${label} "${get(key)}" (use 21:00 or 9pm)` };
  }
  return { entry };
}

function fnv1a(s, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

// The same row gets the same id on every device, so two devices importing it at once still make
// one record, and a record deleted in the app stays deleted instead of being re-imported.
function inboxRecordId(get) {
  const key = INBOX_IDENTITY.map(k => String(get(k) ?? '')).join('␟');
  return `inbox-${fnv1a(key, 0x811c9dc5)}${fnv1a(key, 0x9e3779b9)}`;
}

const normName = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function matchLocation(name, locations) {
  const n = normName(name);
  return n ? locations.find(l => !l.deleted && normName(l.name) === n) || null : null;
}

// An Inbox made by an older version lacks newer columns: add their headings after its last one.
function missingInboxColumns(headerRow) {
  const have = (headerRow || []).map(h => String(h ?? '').trim().toLowerCase());
  if (!have.length) return [];
  const missing = INBOX_COLUMNS.map(([, label]) => label).filter(label => !have.includes(label.toLowerCase()));
  return missing.length ? [{ range: `${SYNC_TAB.inbox}!${columnLetter(have.length)}1`, values: [missing] }] : [];
}

function readInbox(values) {
  const header = (values[0] || []).map(h => String(h ?? '').trim().toLowerCase());
  const col = {};
  for (const [key, label] of INBOX_COLUMNS) {
    const i = header.indexOf(label.toLowerCase());
    if (i >= 0) col[key] = i;
  }
  return { col, rows: values.slice(1).map((cells, i) => ({ cells: cells || [], row: i + 2 })) };
}

/**
 * Everything one sync does, decided up front.
 * local:  { recs, locations, cfg, cfgUpdatedAt }  — every record, deleted ones included
 * remote: { inbox, records, locations, settings } — each tab's values (rows of cells)
 * buildRecord(entry, savedLocation|null, cfg) turns an Inbox entry into a record (the app owns the tax math).
 */
function planSync({ local, remote, today, now, buildRecord }) {
  const warnings = [];
  const settings = planSettings(local.cfg, local.cfgUpdatedAt, remote.settings, now);
  const cfg = { ...local.cfg, ...settings.cfg };

  const locs = planTable(SYNC_TAB.locations, LOCATION_FIELDS, local.locations, remote.locations);
  const pulledLocs = new Map(locs.toLocal.map(l => [l.id, l]));
  const allLocs = [...local.locations.filter(l => !pulledLocs.has(l.id)), ...locs.toLocal];

  const remoteRecIds = readTable(remote.records, RECORD_FIELDS).rows.map(r => r.obj.id).filter(Boolean);
  const knownIds = new Set([...local.recs.map(r => r.id), ...remoteRecIds]);
  const imported = [];
  const inboxMarks = [];
  const inbox = readInbox(remote.inbox);
  const inboxHeaderFix = missingInboxColumns(remote.inbox[0]);
  if (remote.inbox.length && !('desc' in inbox.col && 'imported' in inbox.col)) {
    warnings.push('Inbox tab has no "Description" or "Imported" column, so it was skipped');
  } else {
    for (const { cells, row } of inbox.rows) {
      if (cells.every(isBlank)) continue;
      const get = key => key in inbox.col ? cells[inbox.col[key]] : '';
      if (!isBlank(get('imported'))) continue;
      const id = inboxRecordId(get);
      if (!knownIds.has(id)) {
        const parsed = parseInboxRow(get, today);
        if (parsed.error) { warnings.push(`Inbox row ${row}: ${parsed.error}`); continue; }
        const rec = buildRecord(parsed.entry, matchLocation(parsed.entry.location, allLocs), cfg);
        imported.push({ ...rec, id, source: 'inbox', createdAt: now, updatedAt: now });
        knownIds.add(id);
      }
      inboxMarks.push({ range: `${SYNC_TAB.inbox}!${columnLetter(inbox.col.imported)}${row}`, values: [[id]] });
    }
  }

  const recs = planTable(SYNC_TAB.records, RECORD_FIELDS, [...local.recs, ...imported], remote.records);
  return {
    localRecs: [...recs.toLocal, ...imported],
    localLocations: locs.toLocal,
    cfg: settings.cfg,
    cfgUpdatedAt: settings.cfgUpdatedAt,
    updates: [...settings.updates, ...locs.updates, ...recs.updates, ...inboxHeaderFix, ...inboxMarks],
    appends: { [SYNC_TAB.records]: recs.appends, [SYNC_TAB.locations]: locs.appends },
    counts: {
      imported: imported.length,
      pulled: recs.toLocal.length + locs.toLocal.length,
      pushed: recs.pushed + locs.pushed - imported.length,
    },
    warnings,
  };
}
