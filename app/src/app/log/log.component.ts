import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GigDbService, GigRecord } from '../services/gig-db.service';

type LogFilter = 'all' | 'income' | 'rehearsal' | 'expense';

@Component({
  selector: 'app-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './log.component.html',
  styleUrl: './log.component.css'
})
export class LogComponent implements OnInit {
  private gigDb = inject(GigDbService);

  records = signal<GigRecord[]>([]);
  filter = signal<LogFilter>('all');

  filteredRecords = computed(() => {
    const f = this.filter();
    const recs = this.records();
    return f === 'all' ? recs : recs.filter(r => r.type === f);
  });

  async ngOnInit(): Promise<void> {
    const recs = await this.gigDb.recsGetAll();
    this.records.set(recs);
  }

  setFilter(f: LogFilter): void {
    this.filter.set(f);
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
