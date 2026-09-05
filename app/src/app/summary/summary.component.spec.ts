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
    ...partial,
  } as GigRecord;
}

const thisYear = new Date().getFullYear();

describe('SummaryComponent', () => {
  let component: SummaryComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [SummaryComponent],
    });
    const fixture = TestBed.createComponent(SummaryComponent);
    component = fixture.componentInstance;
    const gigDb = TestBed.inject(GigDbService);
    gigDb.recsGetAll = async () => [
      rec({
        id: '1',
        date: `${thisYear}-02-01`,
        type: 'income',
        desc: 'Gig A',
        amount: 100,
        tips: 20,
        trueCosts: 5,
        seTax: 10,
        incomeTax: 4,
      }),
      rec({
        id: '2',
        date: `${thisYear}-03-01`,
        type: 'rehearsal',
        desc: 'Rehearsal A',
        amount: 0,
        trueCosts: 15,
      }),
      rec({
        id: '3',
        date: `${thisYear}-04-01`,
        type: 'expense',
        desc: 'Strings',
        amount: 30,
        trueCosts: 0,
      }),
      rec({
        id: '4',
        date: `${thisYear - 1}-12-01`,
        type: 'income',
        desc: 'Old gig',
        amount: 500,
        tips: 50,
        trueCosts: 1,
        seTax: 20,
        incomeTax: 8,
      }),
    ];
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('scopes to the current calendar year', () => {
    expect(component.yearRecords().map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('computes gross income from income records only', () => {
    expect(component.grossIncome()).toBe(100);
  });

  it('computes total tips from income records only', () => {
    expect(component.totalTips()).toBe(20);
  });

  it('computes total business costs the legacy way: gig+rehearsal trueCosts plus expense amount', () => {
    // gigCosts(5) + rehCosts(15) + expCosts(expense.amount = 30) -- matches
    // allCosts in the legacy renderSummary(), where an expense-only record's
    // cost is its `amount`, not `trueCosts`.
    expect(component.totalCosts()).toBe(50);
  });

  it('computes total tax from income records only', () => {
    expect(component.totalTax()).toBe(14);
  });

  it('computes net as (gross+tips) - allCosts - tax', () => {
    expect(component.net()).toBe(100 + 20 - 50 - 14);
  });

  it('breaks costs down the legacy way (gigCosts / rehCosts / expCosts)', () => {
    expect(component.gigCosts()).toBe(5);
    expect(component.rehCosts()).toBe(15);
    expect(component.expCosts()).toBe(30);
  });

  it('the hero bar percentages are shares of total income and never exceed 100', () => {
    // totalIncome 120; costPct = 50/120*100, taxPct = 14/120*100
    expect(component.costPct()).toBeCloseTo((50 / 120) * 100, 6);
    expect(component.taxPct()).toBeCloseTo((14 / 120) * 100, 6);
    for (const p of [component.costPct(), component.taxPct(), component.keptPct()]) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it('accordion state: taxes open by default, toggles independently', () => {
    expect(component.accOpen('taxes')).toBe(true);
    expect(component.accOpen('expenses')).toBe(false);
    component.toggleAcc('expenses');
    expect(component.accOpen('expenses')).toBe(true);
    expect(component.accOpen('taxes')).toBe(true);
    component.toggleAcc('taxes');
    expect(component.accOpen('taxes')).toBe(false);
  });
});
