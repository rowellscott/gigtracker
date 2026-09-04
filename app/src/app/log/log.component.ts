import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GigDbService, GigRecord } from '../services/gig-db.service';

type LogFilter = 'all' | 'income' | 'rehearsal' | 'expense';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './log.component.html',
  styleUrl: './log.component.css'
})
export class LogComponent implements OnInit {
  private gigDb = inject(GigDbService);

  readonly pageSize = PAGE_SIZE;

  records = signal<GigRecord[]>([]);
  filter = signal<LogFilter>('all');
  page = signal(1);

  filteredRecords = computed(() => {
    const f = this.filter();
    const recs = this.records();
    return f === 'all' ? recs : recs.filter(r => r.type === f);
  });

  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredRecords().length / PAGE_SIZE))
  );

  // Long lists were the actual reason the tab bar felt unreachable --
  // pagination keeps each page short instead of one endless scroll.
  pagedRecords = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.filteredRecords().slice(start, start + PAGE_SIZE);
  });

  async ngOnInit(): Promise<void> {
    const recs = await this.gigDb.recsGetAll();
    this.records.set(recs);
  }

  setFilter(f: LogFilter): void {
    this.filter.set(f);
    this.page.set(1); // a filter change makes the old page number meaningless
  }

  prevPage(): void {
    this.page.update(p => Math.max(1, p - 1));
  }

  nextPage(): void {
    this.page.update(p => Math.min(this.totalPages(), p + 1));
  }

  formatDate(date: string): string {
    const d = new Date(date + 'T00:00:00');
    if (isNaN(d.getTime())) return date;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  amountLabel(r: GigRecord): string {
    if (r.type === 'income') {
      const total = (r.amount || 0) + (r.tips || 0);
      return `+$${total.toFixed(2)}`;
    }
    if (r.type === 'rehearsal') {
      return `$${(r.trueCosts || 0).toFixed(2)} cost`;
    }
    return `-$${(r.amount || 0).toFixed(2)}`;
  }

  amountClass(r: GigRecord): string {
    if (r.type === 'income') return 'amount-income';
    if (r.type === 'expense') return 'amount-expense';
    return 'amount-rehearsal';
  }
}
