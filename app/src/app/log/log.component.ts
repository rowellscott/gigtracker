import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { GigDbService, GigRecord, TaxSettings } from '../services/gig-db.service';
import { AppStateService } from '../services/app-state.service';

type LogFilter = 'all' | 'income' | 'rehearsal' | 'expense';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-log',
  standalone: true,
  templateUrl: './log.component.html',
  styleUrl: './log.component.css',
})
export class LogComponent implements OnInit {
  private gigDb = inject(GigDbService);
  private state = inject(AppStateService);

  readonly pageSize = PAGE_SIZE;

  records = signal<GigRecord[]>([]);
  filter = signal<LogFilter>('all');
  page = signal(1);
  expandedId = signal<string | null>(null);
  settings = signal<Partial<TaxSettings>>({});

  readonly editId = this.state.editId;

  filteredRecords = computed(() => {
    const f = this.filter();
    const recs = this.records();
    return f === 'all' ? recs : recs.filter((r) => r.type === f);
  });

  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredRecords().length / PAGE_SIZE)),
  );

  // Long lists were the actual reason the tab bar felt unreachable --
  // pagination keeps each page short instead of one endless scroll.
  pagedRecords = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.filteredRecords().slice(start, start + PAGE_SIZE);
  });

  async ngOnInit(): Promise<void> {
    this.records.set(await this.gigDb.recsGetAll());
    // Rate labels only -- loaded after the list so it can't delay first paint.
    void this.loadSettings();
  }

  private async loadSettings(): Promise<void> {
    try {
      if (typeof this.gigDb.kvGet === 'function') {
        this.settings.set((await this.gigDb.kvGet<TaxSettings>('appSettings')) ?? {});
      }
    } catch {
      /* defaults are fine */
    }
  }

  setFilter(f: LogFilter): void {
    this.filter.set(f);
    this.page.set(1); // a filter change makes the old page number meaningless
  }

  prevPage(): void {
    this.page.update((p) => Math.max(1, p - 1));
  }

  nextPage(): void {
    this.page.update((p) => Math.min(this.totalPages(), p + 1));
  }

  toggleExpand(id: string): void {
    this.expandedId.update((cur) => (cur === id ? null : id));
  }

  startEdit(r: GigRecord): void {
    this.state.startEdit(r);
  }

  async doDelete(r: GigRecord): Promise<void> {
    if (!confirm('Delete this record? This cannot be undone.')) return;
    await this.gigDb.recMarkDeleted(r.id);
    if (this.expandedId() === r.id) this.expandedId.set(null);
    this.records.set(await this.gigDb.recsGetAll());
  }

  formatDate(date: string): string {
    if (!date) return '';
    const [y, m, d] = date.split('-');
    if (!y || !m || !d) return date;
    return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
  }

  cardDate(r: GigRecord): string {
    const base = this.formatDate(r.date);
    if (r.payDate && r.payDate !== r.date) return `${base} · paid ${this.formatDate(r.payDate)}`;
    return base;
  }

  money(n: number | undefined | null): string {
    return '$' + Math.abs(n ?? 0).toFixed(2);
  }

  plusMinus(n: number | undefined | null): string {
    const v = n ?? 0;
    return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2);
  }

  total(r: GigRecord): number {
    return (r.amount || 0) + (r.tips || 0);
  }

  amountLabel(r: GigRecord): string {
    if (r.type === 'income') return `+$${this.total(r).toFixed(2)}`;
    if (r.type === 'rehearsal') return `$${(r.trueCosts || 0).toFixed(2)} cost`;
    return `-$${(r.amount || 0).toFixed(2)}`;
  }

  amountClass(r: GigRecord): string {
    if (r.type === 'income') return 'amount-income';
    if (r.type === 'expense') return 'amount-expense';
    return 'amount-rehearsal';
  }

  /** Legacy card-amt tone classes (val-g / val-b / val-r). */
  amountTone(r: GigRecord): string {
    if (r.type === 'income') return 'val-g';
    if (r.type === 'rehearsal') return 'val-b';
    return 'val-r';
  }

  pillLabel(r: GigRecord): string {
    return r.type === 'income' ? 'income gig' : r.type;
  }

  irsRate(): number {
    return this.settings().irsRate ?? 0.725;
  }

  trueCostRate(): number {
    return this.settings().trueCostRate ?? 0.5;
  }

  combinedRatePct(): number {
    return Number(this.settings().federalRate ?? 24) + Number(this.settings().stateRate ?? 0);
  }
}
