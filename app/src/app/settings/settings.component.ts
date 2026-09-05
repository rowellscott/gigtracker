import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GigDbService, GigRecord } from '../services/gig-db.service';
import { TaxSettingsService } from '../services/tax-settings.service';

/**
 * `SettingsTaxConfig` is the settings form's model shape. `ExportRecord` is the
 * precise subset of `GigRecord` the pure helpers below read -- derived from the
 * real record type so the call sites (which pass `GigRecord[]` straight from
 * `recsGetAll()`) type-check without a cast.
 */
export interface SettingsTaxConfig {
  federalRate: number;
  stateRate: number;
  irsRate: number;
  trueCostRate: number;
  mpg: number;
}

export type ExportRecord = Readonly<
  Pick<
    GigRecord,
    | 'id'
    | 'date'
    | 'payDate'
    | 'type'
    | 'desc'
    | 'amount'
    | 'tips'
    | 'tipsInTax'
    | 'hours'
    | 'grossHourly'
    | 'miles'
    | 'irsDed'
    | 'room'
    | 'meal'
    | 'oth'
    | 'trueCosts'
    | 'totalDed'
    | 'taxSavings'
    | 'seTax'
    | 'incomeTax'
    | 'netAfterAll'
    | 'trueHourly'
    | 'payMethod'
    | 'notes'
    | 'updatedAt'
  >
>;

export const DEFAULT_TAX_SETTINGS: SettingsTaxConfig = {
  federalRate: 24,
  stateRate: 0,
  irsRate: 0.725,
  trueCostRate: 0.5,
  mpg: 28,
};

/**
 * The legacy CSV export header (exportCSV() in index.html) -- kept verbatim
 * so a tax accountant opening the file in Numbers/Excel sees the same
 * columns they always have. This is the human-readable label row, not a
 * list of record field keys.
 */
export const CSV_COLUMNS: string[] = [
  'Date',
  'Pay Date',
  'Type',
  'Description',
  'Base Pay',
  'Tips',
  'Tips In Tax',
  'Total Income',
  'Hours',
  'Rate ($/hr)',
  'Miles',
  'IRS Ded',
  'Room Rental',
  'Meal',
  'Other',
  'Total Costs',
  'Total Ded',
  'Tax Savings',
  'SE Tax',
  'Income Tax',
  'Net After All',
  'True Hourly',
  'Payment Method',
  'Notes',
];

function csvQuote(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"';
}

const n2 = (v: number | undefined | null): string => (Number(v) || 0).toFixed(2);
const n1 = (v: number | undefined | null): string => (Number(v) || 0).toFixed(1);

/** PURE: records -> legacy CSV text (header row + one row per record),
 * matching exportCSV() in index.html column-for-column. */
export function recordsToCsv(records: readonly ExportRecord[]): string {
  const lines: string[] = [CSV_COLUMNS.join(',')];
  for (const r of records) {
    const ti = (Number(r.amount) || 0) + (Number(r.tips) || 0);
    lines.push(
      [
        r.date ?? '',
        r.payDate ?? '',
        r.type ?? '',
        csvQuote(r.desc ?? ''),
        n2(r.amount),
        n2(r.tips),
        r.tipsInTax ? 'yes' : 'no',
        ti.toFixed(2),
        n2(r.hours),
        r.grossHourly != null ? n2(r.grossHourly) : '',
        n1(r.miles),
        n2(r.irsDed),
        n2(r.room),
        n2(r.meal),
        n2(r.oth),
        n2(r.trueCosts),
        n2(r.totalDed),
        n2(r.taxSavings),
        n2(r.seTax),
        n2(r.incomeTax),
        n2(r.netAfterAll),
        r.trueHourly != null ? n2(r.trueHourly) : '',
        csvQuote(r.payMethod ?? ''),
        csvQuote(r.notes ?? ''),
      ].join(','),
    );
  }
  return lines.join('\n');
}

/** PURE: records + config -> JSON backup payload (matches exportJSON()). */
export function recordsToBackup(
  records: readonly ExportRecord[],
  cfg: SettingsTaxConfig,
): {
  exportedAt: string;
  appVersion: string;
  taxConfig: SettingsTaxConfig;
  records: readonly ExportRecord[];
} {
  return {
    exportedAt: new Date().toISOString(),
    appVersion: '2.0',
    taxConfig: cfg,
    records,
  };
}

/** An imported entry we can safely persist: a backup is produced by
 * `recordsToBackup` from full records, so an `id` + `type` is enough to treat
 * the rest of the object as a `GigRecord`. */
function isImportedRecord(value: unknown): value is GigRecord {
  if (!value || typeof value !== 'object') return false;
  const rec = value as Partial<GigRecord>;
  return typeof rec.id === 'string' && rec.id.length > 0 && !!rec.type;
}

/** PURE: merge imported records into existing ones (newer updatedAt wins,
 * ties go to the incoming record -- restore behaviour, matches importJSON()).
 * `imported` is whatever `JSON.parse` produced, so each entry is validated
 * before use. */
export function mergeImportedRecords(
  existing: readonly ExportRecord[],
  imported: readonly unknown[],
): { toSave: GigRecord[]; skipped: number } {
  const lastSeenAt = new Map<string, string>();
  for (const r of existing) {
    if (r.id) lastSeenAt.set(r.id, r.updatedAt ?? '');
  }
  const toSave: GigRecord[] = [];
  let skipped = 0;
  for (const inc of imported) {
    if (!isImportedRecord(inc)) {
      skipped++;
      continue;
    }
    const seenAt = lastSeenAt.get(inc.id);
    const incAt = inc.updatedAt ?? '';
    if (seenAt === undefined || incAt >= seenAt) {
      toSave.push(inc);
      lastSeenAt.set(inc.id, incAt);
    } else {
      skipped++;
    }
  }
  return { toSave, skipped };
}

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly db = inject(GigDbService);
  private readonly taxSettings = inject(TaxSettingsService);
  private readonly cdr = inject(ChangeDetectorRef);

  cfg: SettingsTaxConfig = { ...DEFAULT_TAX_SETTINGS };
  readonly lastBackupAt = signal<string | null>(null);
  readonly recordCount = signal<number>(0);
  readonly status = signal<string>('');

  readonly lastBackupLabel = computed(() => {
    const last = this.lastBackupAt();
    if (!last) return 'Never';
    return `${new Date(last).toLocaleDateString()} (${this.recordCount()} records)`;
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    await this.taxSettings.reload();
    this.cfg = { ...this.taxSettings.settings() };
    this.lastBackupAt.set(await this.db.kvGet<string>('lastBackupAt'));
    this.recordCount.set((await this.db.recsGetAll()).length);
    // `cfg` is a plain object (it backs `[(ngModel)]`), so this async write
    // needs an explicit nudge -- the signals above schedule their own.
    this.cdr.markForCheck();
  }

  async saveSettings(): Promise<void> {
    const num = (v: unknown, fallback: number) => {
      const n = Number(v);
      return isNaN(n) || n === 0 ? fallback : n;
    };
    // Match saveCfg() in the legacy app: blank/0 falls back to the sane default.
    const cfg: SettingsTaxConfig = {
      federalRate: num(this.cfg.federalRate, 24),
      stateRate: Number(this.cfg.stateRate) || 0,
      irsRate: num(this.cfg.irsRate, 0.725),
      trueCostRate: num(this.cfg.trueCostRate, 0.5),
      mpg: num(this.cfg.mpg, 28),
    };
    this.cfg = cfg;
    await this.taxSettings.save(cfg);
    this.status.set('Settings saved.');
  }

  private download(text: string, filename: string, mime: string): void {
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      /* download unavailable in this environment */
    }
  }

  private async markBackedUp(): Promise<void> {
    const now = new Date().toISOString();
    await this.db.kvSet('lastBackupAt', now);
    this.lastBackupAt.set(now);
  }

  private stamp(): string {
    return new Date().toISOString().split('T')[0];
  }

  async exportCsv(): Promise<void> {
    const recs = await this.db.recsGetAll();
    if (recs.length === 0) {
      this.status.set('No records to export.');
      return;
    }
    this.download(recordsToCsv(recs), `gigs_${this.stamp()}.csv`, 'text/csv');
    await this.markBackedUp();
    this.status.set('CSV exported.');
  }

  async exportJson(): Promise<void> {
    const payload = recordsToBackup(await this.db.recsGetAll(), this.cfg);
    this.download(
      JSON.stringify(payload, null, 2),
      `gigtracker_backup_${this.stamp()}.json`,
      'application/json',
    );
    await this.markBackedUp();
    this.status.set('Backup exported.');
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input && input.files ? input.files[0] : null;
    if (file) void this.importFile(file).finally(() => (input.value = ''));
  }

  importFile(file: File): Promise<void> {
    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        void (async () => {
          try {
            const parsed: unknown = JSON.parse(String(reader.result ?? '{}'));
            const nested = (parsed as { records?: unknown } | null)?.records;
            const imported: readonly unknown[] = Array.isArray(parsed)
              ? parsed
              : Array.isArray(nested)
                ? nested
                : [];
            const existing = await this.db.recsGetAll();
            const { toSave, skipped } = mergeImportedRecords(existing, imported);
            for (const rec of toSave) {
              await this.db.recSave({ ...rec, synced: true });
            }
            this.status.set(`Restored ${toSave.length} record(s), skipped ${skipped}.`);
            await this.markBackedUp();
            await this.load();
          } catch {
            this.status.set('Import failed: invalid file.');
          }
          resolve();
        })();
      };
      reader.onerror = () => {
        this.status.set('Import failed: could not read file.');
        resolve();
      };
      reader.readAsText(file);
    });
  }
}
