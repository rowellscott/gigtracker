import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { LogComponent } from './log.component';
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

describe('LogComponent', () => {
  let component: LogComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [LogComponent]
    });
    const fixture = TestBed.createComponent(LogComponent);
    component = fixture.componentInstance;
    const gigDb = TestBed.inject(GigDbService);
    gigDb.recsGetAll = async () => [
      rec({ id: '1', date: '2026-02-01', type: 'income', desc: 'Gig A', amount: 100, tips: 20 }),
      rec({ id: '2', date: '2026-01-15', type: 'rehearsal', desc: 'Rehearsal A', amount: 0, trueCosts: 15.5 }),
      rec({ id: '3', date: '2026-01-01', type: 'expense', desc: 'Strings', amount: 30 })
    ];
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('lists all records newest first', () => {
    expect(component.filteredRecords().map(r => r.id)).toEqual(['1', '2', '3']);
  });

  it('filters by type', () => {
    component.setFilter('income');
    expect(component.filteredRecords().map(r => r.id)).toEqual(['1']);
  });

  it('formats income amount as +$amount+tips in green', () => {
    const income = component.filteredRecords().find(r => r.id === '1')!;
    expect(component.amountLabel(income)).toBe('+$120.00');
    expect(component.amountClass(income)).toBe('amount-income');
  });

  it('formats rehearsal amount as trueCosts cost', () => {
    const rehearsal = component.filteredRecords().find(r => r.id === '2')!;
    expect(component.amountLabel(rehearsal)).toBe('$15.50 cost');
  });

  it('formats expense amount as -$amount in red', () => {
    const expense = component.filteredRecords().find(r => r.id === '3')!;
    expect(component.amountLabel(expense)).toBe('-$30.00');
    expect(component.amountClass(expense)).toBe('amount-expense');
  });

  it('shows empty state when filter matches nothing', () => {
    component.records.set([]);
    expect(component.filteredRecords().length).toBe(0);
  });
});
