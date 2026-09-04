import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GigDbService, GigRecord } from '../services/gig-db.service';

@Component({
  selector: 'app-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.css'
})
export class SummaryComponent implements OnInit {
  private gigDb = inject(GigDbService);

  records = signal<GigRecord[]>([]);

  yearRecords = computed(() => {
    const year = String(new Date().getFullYear());
    return this.records().filter(r => r.date && r.date.startsWith(year));
  });

  grossIncome = computed(() =>
    this.yearRecords()
      .filter(r => r.type === 'income')
      .reduce((sum, r) => sum + (r.amount || 0), 0)
  );

  totalTips = computed(() =>
    this.yearRecords()
      .filter(r => r.type === 'income')
      .reduce((sum, r) => sum + (r.tips || 0), 0)
  );

  totalCosts = computed(() =>
    this.yearRecords().reduce((sum, r) => sum + (r.trueCosts || 0), 0)
  );

  totalTax = computed(() =>
    this.yearRecords()
      .filter(r => r.type === 'income')
      .reduce((sum, r) => sum + (r.seTax || 0) + (r.incomeTax || 0), 0)
  );

  net = computed(() =>
    (this.grossIncome() + this.totalTips()) - this.totalCosts() - this.totalTax()
  );

  async ngOnInit(): Promise<void> {
    const recs = await this.gigDb.recsGetAll();
    this.records.set(recs);
  }
}
