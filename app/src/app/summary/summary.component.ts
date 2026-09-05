import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { GigDbService, GigRecord } from '../services/gig-db.service';
import { TaxSettingsService } from '../services/tax-settings.service';

const sum = (arr: GigRecord[], key: keyof GigRecord): number =>
  arr.reduce((s, r) => s + (Number(r[key]) || 0), 0);

@Component({
  selector: 'app-summary',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.css',
})
export class SummaryComponent implements OnInit {
  private gigDb = inject(GigDbService);
  readonly taxSettings = inject(TaxSettingsService);

  records = signal<GigRecord[]>([]);
  openAcc = signal<Set<string>>(new Set(['taxes']));

  readonly year = String(new Date().getFullYear());

  yearRecords = computed(() =>
    this.records().filter((r) => r.date && r.date.startsWith(this.year)),
  );
  private incomeR = computed(() => this.yearRecords().filter((r) => r.type === 'income'));
  private rehearsalR = computed(() => this.yearRecords().filter((r) => r.type === 'rehearsal'));
  private expenseR = computed(() => this.yearRecords().filter((r) => r.type === 'expense'));

  grossIncome = computed(() => sum(this.incomeR(), 'amount'));
  totalTips = computed(() => sum(this.incomeR(), 'tips'));
  totalIncome = computed(() => this.grossIncome() + this.totalTips());

  gigCosts = computed(() => sum(this.incomeR(), 'trueCosts'));
  rehCosts = computed(() => sum(this.rehearsalR(), 'trueCosts'));
  // Legacy: an expense-only record's cost is its `amount`, not `trueCosts`.
  expCosts = computed(() => sum(this.expenseR(), 'amount'));
  /** Every business cost for the year -- matches allCosts in the legacy renderSummary(). */
  totalCosts = computed(() => this.gigCosts() + this.rehCosts() + this.expCosts());

  totalDed = computed(() => sum(this.yearRecords(), 'totalDed'));
  seTax = computed(() => sum(this.incomeR(), 'seTax'));
  incomeTax = computed(() => sum(this.incomeR(), 'incomeTax'));
  totalTax = computed(() => this.seTax() + this.incomeTax());
  taxSavings = computed(() => sum(this.yearRecords(), 'taxSavings'));

  miles = computed(() => sum(this.yearRecords(), 'miles'));
  gigHours = computed(() => sum(this.incomeR(), 'hours'));
  rehHours = computed(() => sum(this.rehearsalR(), 'hours'));
  totalHours = computed(() => this.gigHours() + this.rehHours());

  net = computed(() => this.totalIncome() - this.totalCosts() - this.totalTax());
  realHourly = computed(() => (this.totalHours() > 0 ? this.net() / this.totalHours() : null));

  incomeGigs = computed(() => this.incomeR());

  private pct(v: number): number {
    const ti = this.totalIncome();
    return ti > 0 ? Math.max(0, Math.min(100, (v / ti) * 100)) : 0;
  }
  costPct = computed(() => this.pct(this.totalCosts()));
  taxPct = computed(() => this.pct(this.totalTax()));
  keptPct = computed(() => this.pct(Math.max(0, this.net())));

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
