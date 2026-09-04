import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SummaryComponent } from './summary.component';
import { GigDbService, GigRecord } from '../services/gig-db.service';

function rec(partial: Partial<GigRecord>): GigRecord {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    date: '2026-01-01',
    type: 'income',
    desc: 'Test',
    amount: 0,
    ...partial
  } as GigRecord;
}

const thisYear = new Date().getFullYear();

describe('SummaryComponent', () => {
  let component: SummaryComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [SummaryComponent]
    });
    const fixture = TestBed.createComponent(SummaryComponent);
    component = fixture.componentInstance;
    const gigDb = TestBed.inject(GigDbService);
    gigDb.recsGetAll = async () => [
      rec({ id: '1', date: `${thisYear}-02-01`, type: 'income', desc: 'Gig A', amount: 100, tips: 20, trueCosts: 5, seTax: 10, incomeTax: 4 }),
      rec({ id: '2', date: `${thisYear}-03-01`, type: 'rehearsal', desc: 'Rehearsal A', amount: 0, trueCosts: 15 }),
      rec({ id: '3', date: `${thisYear}-04-01`, type: 'expense', desc: 'Strings', amount: 30, trueCosts: 0 }),
      rec({ id: '4', date: `${thisYear - 1}-12-01`, type: 'income', desc: 'Old gig', amount: 500, tips: 50, trueCosts: 1, seTax: 20, incomeTax: 8 })
    ];
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('scopes to the current calendar year', () => {
    expect(component.yearRecords().map(r => r.id)).toEqual(['1', '2', '3']);
  });

  it('computes gross income from income records only', () => {
    expect(component.grossIncome()).toBe(100);
  });

  it('computes total tips from income records only', () => {
    expect(component.totalTips()).toBe(20);
  });

  it('computes total business costs across all record types', () => {
    expect(component.totalCosts()).toBe(20);
  });

  it('computes total tax from income records only', () => {
    expect(component.totalTax()).toBe(14);
  });

  it('computes net as (gross+tips) - costs - tax', () => {
    expect(component.net()).toBe((100 + 20) - 20 - 14);
  });
});
