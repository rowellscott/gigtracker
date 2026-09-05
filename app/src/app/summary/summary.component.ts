import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { GigDbService, GigRecord } from '../services/gig-db.service';
import { TaxSettingsService } from '../services/tax-settings.service';

/** The keys of `GigRecord` whose value is numeric -- the only keys `sum` can
 * meaningfully add. A non-numeric key (`desc`, `type`, ...) is a compile error. */
type NumericKey<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends number ? K : never;
}[keyof T];

const sum = (arr: readonly GigRecord[], key: NumericKey<GigRecord>): number =>
  arr.reduce((s, r) => s + (Number(r[key]) || 0), 0);

@Component({
  selector: 'app-summary',
  imports: [DecimalPipe],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryComponent implements OnInit {
  private readonly gigDb = inject(GigDbService);
  readonly taxSettings = inject(TaxSettingsService);

  readonly records = signal<GigRecord[]>([]);
  readonly openAcc = signal<Set<string>>(new Set(['taxes']));

  readonly year = String(new Date().getFullYear());

  readonly yearRecords = computed(() =>
    this.records().filter((r) => r.date && r.date.startsWith(this.year)),
  );
  private readonly incomeR = computed(() => this.yearRecords().filter((r) => r.type === 'income'));
  private readonly rehearsalR = computed(() =>
    this.yearRecords().filter((r) => r.type === 'rehearsal'),
  );
  private readonly expenseR = computed(() =>
    this.yearRecords().filter((r) => r.type === 'expense'),
  );

  readonly grossIncome = computed(() => sum(this.incomeR(), 'amount'));
  readonly totalTips = computed(() => sum(this.incomeR(), 'tips'));
  readonly totalIncome = computed(() => this.grossIncome() + this.totalTips());

  readonly gigCosts = computed(() => sum(this.incomeR(), 'trueCosts'));
  readonly rehCosts = computed(() => sum(this.rehearsalR(), 'trueCosts'));
  // Legacy: an expense-only record's cost is its `amount`, not `trueCosts`.
  readonly expCosts = computed(() => sum(this.expenseR(), 'amount'));
  /** Every business cost for the year -- matches allCosts in the legacy renderSummary(). */
  readonly totalCosts = computed(() => this.gigCosts() + this.rehCosts() + this.expCosts());

  readonly totalDed = computed(() => sum(this.yearRecords(), 'totalDed'));
  readonly seTax = computed(() => sum(this.incomeR(), 'seTax'));
  readonly incomeTax = computed(() => sum(this.incomeR(), 'incomeTax'));
  readonly totalTax = computed(() => this.seTax() + this.incomeTax());
  readonly taxSavings = computed(() => sum(this.yearRecords(), 'taxSavings'));

  readonly miles = computed(() => sum(this.yearRecords(), 'miles'));
  readonly gigHours = computed(() => sum(this.incomeR(), 'hours'));
  readonly rehHours = computed(() => sum(this.rehearsalR(), 'hours'));
  readonly totalHours = computed(() => this.gigHours() + this.rehHours());

  readonly net = computed(() => this.totalIncome() - this.totalCosts() - this.totalTax());
  readonly realHourly = computed(() =>
    this.totalHours() > 0 ? this.net() / this.totalHours() : null,
  );

  readonly incomeGigs = computed(() => this.incomeR());

  private pct(v: number): number {
    const ti = this.totalIncome();
    return ti > 0 ? Math.max(0, Math.min(100, (v / ti) * 100)) : 0;
  }
  readonly costPct = computed(() => this.pct(this.totalCosts()));
  readonly taxPct = computed(() => this.pct(this.totalTax()));
  readonly keptPct = computed(() => this.pct(Math.max(0, this.net())));

  async ngOnInit(): Promise<void> {
    this.records.set(await this.gigDb.recsGetAll());
    void this.taxSettings.ensureLoaded();
  }

  accOpen(id: string): boolean {
    return this.openAcc().has(id);
  }

  toggleAcc(id: string): void {
    this.openAcc.update((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  money(n: number | null | undefined): string {
    return '$' + Math.abs(n ?? 0).toFixed(2);
  }

  plusMinus(n: number | null | undefined): string {
    const v = n ?? 0;
    return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2);
  }

  gigDate(r: GigRecord): string {
    return r.payMethod ? `${r.date} · ${r.payMethod}` : r.date;
  }

  gigTotal(r: GigRecord): number {
    return (r.amount || 0) + (r.tips || 0);
  }
}
