import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GigDbService } from '../services/gig-db.service';

/**
 * Local structural types. Intentionally NOT imported from the services so
 * this component cannot break the build if those type names/shapes shift.
 */
export interface SettingsTaxConfig {
  federalRate: number;
  stateRate: number;
  irsRate: number;
  trueCostRate: number;
  mpg: number;
}

export interface CsvRecord {
  id?: string;
  date?: string;
  type?: string;
  desc?: string;
  amount?: number;
  tips?: number;
  hours?: number;
  miles?: number;
  trueCosts?: number;
  totalDed?: number;
  taxSavings?: number;
  seTax?: number;
  incomeTax?: number;
  netAfterAll?: number;
  updatedAt?: string;
  [key: string]: unknown;
}

export const DEFAULT_TAX_SETTINGS: SettingsTaxConfig = {
  federalRate: 24,
  stateRate: 0,
  irsRate: 0.725,
  trueCostRate: 0.5,
  mpg: 28,
};

export const CSV_COLUMNS: string[] = [
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
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** PURE: records -> CSV text (header row + one row per record). */
export function recordsToCsv(records: CsvRecord[]): string {
  const list = records || [];
  const lines: string[] = [CSV_COLUMNS.join(',')];
  for (const r of list) {
    lines.push(CSV_COLUMNS.map((c) => csvCell((r as CsvRecord)[c])).join(','));
  }
  return lines.join('\n');
}

/** PURE: records + config -> JSON backup payload. */
export function recordsToBackup(
  records: CsvRecord[],
  cfg: SettingsTaxConfig,
): { exportedAt: string; taxConfig: SettingsTaxConfig; records: CsvRecord[] } {
  return {
    exportedAt: new Date().toISOString(),
    taxConfig: cfg,
    records: records || [],
  };
}

/** PURE: merge imported records into existing ones. */
export function mergeImportedRecords(
  existing: CsvRecord[],
  imported: CsvRecord[],
): { toSave: CsvRecord[]; skipped: number } {
  const byId = new Map<string, CsvRecord>();
  for (const r of existing || []) {
    if (r && typeof r.id === 'string' && r.id) byId.set(r.id, r);
  }
  const toSave: CsvRecord[] = [];
  let skipped = 0;
  for (const inc of imported || []) {
    if (!inc || typeof inc.id !== 'string' || !inc.id || !inc.type) {
      skipped++;
      continue;
    }
    const cur = byId.get(inc.id);
    if (!cur) {
      toSave.push(inc);
      byId.set(inc.id, inc);
      continue;
    }
    const incAt = inc.updatedAt || '';
    const curAt = cur.updatedAt || '';
    if (incAt >= curAt) {
      toSave.push(inc);
      byId.set(inc.id, inc);
    } else {
      skipped++;
    }
  }
  return { toSave, skipped };
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent {
  private db = inject(GigDbService);

  cfg: SettingsTaxConfig = { ...DEFAULT_TAX_SETTINGS };
  lastBackupAt = signal<string>('Never');
  recordCount = signal<number>(0);
  status = signal<string>('');

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const saved = (await this.db.kvGet<SettingsTaxConfig>('appSettings')) as
      | SettingsTaxConfig
      | null;
    this.cfg = { ...DEFAULT_TAX_SETTINGS, ...(saved || {}) };
    const last = (await this.db.kvGet<string>('lastBackupAt')) as string | null;
    this.lastBackupAt.set(last ? last : 'Never');
    const recs = (await this.db.recsGetAll()) as unknown as CsvRecord[];
    this.recordCount.set((recs || []).length);
  }

  async saveSettings(): Promise<void> {
    const cfg: SettingsTaxConfig = {
      federalRate: Number(this.cfg.federalRate) || 0,
      stateRate: Number(this.cfg.stateRate) || 0,
      irsRate: Number(this.cfg.irsRate) || 0,
      trueCostRate: Number(this.cfg.trueCostRate) || 0,
      mpg: Number(this.cfg.mpg) || 0,
    };
    this.cfg = cfg;
    await this.db.kvSet('appSettings', cfg);
    this.status.set('Settings saved.');
  }

  private download(text: string, filename: string, mime: string): void {
    try {
      const blob = new Blob([text], { type: mime });
      const nav = navigator as unknown as { share?: unknown };
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      void nav;
    } catch {
      /* download unavailable in this environment */
    }
  }

  private async markBackedUp(): Promise<void> {
    const now = new Date().toISOString();
    await this.db.kvSet('lastBackupAt', now);
    this.lastBackupAt.set(now);
  }

  async exportCsv(): Promise<void> {
    const recs = (await this.db.recsGetAll()) as unknown as CsvRecord[];
    this.download(recordsToCsv(recs || []), 'gigtracker.csv', 'text/csv');
    await this.markBackedUp();
    this.status.set('CSV exported.');
  }

  async exportJson(): Promise<void> {
    const recs = (await this.db.recsGetAll()) as unknown as CsvRecord[];
    const payload = recordsToBackup(recs || [], this.cfg);
    this.download(
      JSON.stringify(payload, null, 2),
      'gigtracker-backup.json',
      'application/json',
    );
    await this.markBackedUp();
    this.status.set('Backup exported.');
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input && input.files ? input.files[0] : null;
    if (file) void this.importFile(file);
  }

  importFile(file: File): Promise<void> {
    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        void (async () => {
          try {
            const parsed = JSON.parse(String(reader.result || '{}'));
            const imported: CsvRecord[] = Array.isArray(parsed)
              ? parsed
              : ((parsed && parsed.records) || []);
            const existing = (await this.db.recsGetAll()) as unknown as CsvRecord[];
            const { toSave, skipped } = mergeImportedRecords(
              existing || [],
              imported,
            );
            for (const rec of toSave) {
              await this.db.recSave(rec as never);
            }
            this.status.set(
              `Imported ${toSave.length} record(s), skipped ${skipped}.`,
            );
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
