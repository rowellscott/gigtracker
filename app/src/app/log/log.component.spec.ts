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
    ...partial,
  } as GigRecord;
}

describe('LogComponent', () => {
  let component: LogComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [LogComponent],
    });
    const fixture = TestBed.createComponent(LogComponent);
    component = fixture.componentInstance;
    const gigDb = TestBed.inject(GigDbService);
    gigDb.recsGetAll = async () => [
      rec({ id: '1', date: '2026-02-01', type: 'income', desc: 'Gig A', amount: 100, tips: 20 }),
      rec({
        id: '2',
        date: '2026-01-15',
        type: 'rehearsal',
        desc: 'Rehearsal A',
        amount: 0,
        trueCosts: 15.5,
      }),
      rec({ id: '3', date: '2026-01-01', type: 'expense', desc: 'Strings', amount: 30 }),
    ];
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('lists all records newest first', () => {
    expect(component.filteredRecords().map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('filters by type', () => {
    component.setFilter('income');
    expect(component.filteredRecords().map((r) => r.id)).toEqual(['1']);
  });

  it('formats income amount as +$amount+tips in green', () => {
    const income = component.filteredRecords().find((r) => r.id === '1')!;
    expect(component.amountLabel(income)).toBe('+$120.00');
    expect(component.amountClass(income)).toBe('amount-income');
  });

  it('formats rehearsal amount as trueCosts cost', () => {
    const rehearsal = component.filteredRecords().find((r) => r.id === '2')!;
    expect(component.amountLabel(rehearsal)).toBe('$15.50 cost');
  });

  it('formats expense amount as -$amount in red', () => {
    const expense = component.filteredRecords().find((r) => r.id === '3')!;
    expect(component.amountLabel(expense)).toBe('-$30.00');
    expect(component.amountClass(expense)).toBe('amount-expense');
  });

  it('shows empty state when filter matches nothing', () => {
    component.records.set([]);
    expect(component.filteredRecords().length).toBe(0);
  });

  it('toggleExpand opens one card at a time and closes on second tap', () => {
    expect(component.expandedId()).toBeNull();
    component.toggleExpand('1');
    expect(component.expandedId()).toBe('1');
    component.toggleExpand('2');
    expect(component.expandedId()).toBe('2');
    component.toggleExpand('2');
    expect(component.expandedId()).toBeNull();
  });

  it('cardDate appends the pay date only when it differs from the gig date', () => {
    const r = component.filteredRecords().find((x) => x.id === '1')!;
    expect(component.cardDate({ ...r, payDate: '' })).toBe('2/1/26');
    expect(component.cardDate({ ...r, payDate: '2026-02-01' })).toBe('2/1/26');
    expect(component.cardDate({ ...r, payDate: '2026-02-20' })).toBe('2/1/26 · paid 2/20/26');
  });
});

describe('LogComponent delete', () => {
  it('doDelete soft-deletes via the db and refreshes the list', async () => {
    let deleted: string | null = null;
    let remaining: GigRecord[] = [rec({ id: '1', desc: 'Keep' }), rec({ id: '2', desc: 'Drop' })];
    TestBed.configureTestingModule({ imports: [LogComponent] });
    const fixture = TestBed.createComponent(LogComponent);
    const component = fixture.componentInstance;
    const gigDb = TestBed.inject(GigDbService);
    gigDb.recsGetAll = async () => remaining;
    gigDb.recMarkDeleted = async (id: string) => {
      deleted = id;
      remaining = remaining.filter((r) => r.id !== id);
    };
    (globalThis as { confirm?: () => boolean }).confirm = () => true;
    fixture.detectChanges();
    await fixture.whenStable();

    await component.doDelete(rec({ id: '2' }));
    expect(deleted).toBe('2');
    expect(component.records().map((r) => r.id)).toEqual(['1']);
  });
});

describe('LogComponent pagination', () => {
  let component: LogComponent;

  function manyRecords(n: number): GigRecord[] {
    return Array.from({ length: n }, (_, i) =>
      rec({
        id: String(i),
        date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
        type: 'income',
        amount: 10,
      }),
    );
  }

  async function setup(count: number): Promise<void> {
    TestBed.configureTestingModule({ imports: [LogComponent] });
    const fixture = TestBed.createComponent(LogComponent);
    component = fixture.componentInstance;
    TestBed.inject(GigDbService).recsGetAll = async () => manyRecords(count);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('shows at most pageSize records per page', async () => {
    await setup(45);
    expect(component.pagedRecords().length).toBe(component.pageSize);
    expect(component.totalPages()).toBe(3); // 45 / 20 -> 3 pages
  });

  it('a short list needs no pagination but still shows everything on page 1', async () => {
    await setup(5);
    expect(component.pagedRecords().length).toBe(5);
    expect(component.totalPages()).toBe(1);
  });

  it('nextPage/prevPage move one page and clamp at the ends', async () => {
    await setup(45);
    expect(component.page()).toBe(1);

    component.prevPage(); // already at page 1 -- must not go below it
    expect(component.page()).toBe(1);

    component.nextPage();
    expect(component.page()).toBe(2);
    expect(component.pagedRecords().length).toBe(20);

    component.nextPage();
    expect(component.page()).toBe(3);
    expect(component.pagedRecords().length).toBe(5); // last page, partial

    component.nextPage(); // already at the last page -- must not go past it
    expect(component.page()).toBe(3);
  });

  it('changing the filter resets to page 1', async () => {
    await setup(45);
    component.nextPage();
    expect(component.page()).toBe(2);

    component.setFilter('income');
    expect(component.page()).toBe(1);
  });
});
