import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';
import { GigDbService, GigRecord } from './services/gig-db.service';
import { AppStateService } from './services/app-state.service';

/**
 * End-to-end through the real app shell (real GigDbService on a fake
 * IndexedDB): the pieces the rewrite added on top of the half-built
 * version -- Log -> Add edit hand-off, saved-location auto-fill, and Log
 * pagination -- all wired together.
 */
describe('GigTracker integration', () => {
  let fixture: ComponentFixture<App>;
  let db: GigDbService;
  let state: AppStateService;

  const el = () => fixture.nativeElement as HTMLElement;

  // fake-indexeddb resolves request callbacks on the macrotask queue, which
  // fixture.whenStable() (zoneless) does not wait for -- so pump real timers
  // between change-detection passes.
  async function settle(): Promise<void> {
    for (let i = 0; i < 12; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 8));
    }
    fixture.detectChanges();
  }

  /** Poll (pumping change detection) until `predicate` holds or we give up.
   * The App-level specs drive real IndexedDB reads through zoneless change
   * detection, so the settle point is "the DOM shows the expected result",
   * not a fixed number of ticks. */
  async function waitFor(predicate: () => boolean, label: string): Promise<void> {
    for (let i = 0; i < 100; i++) {
      fixture.detectChanges();
      if (predicate()) {
        fixture.detectChanges();
        return;
      }
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 10));
    }
    fixture.detectChanges();
    throw new Error(`waitFor timed out: ${label}`);
  }

  async function clickTab(tab: string): Promise<void> {
    el().querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)!.click();
    await settle();
  }

  function baseRecord(over: Partial<GigRecord>): GigRecord {
    return {
      id: over.id ?? crypto.randomUUID(),
      date: over.date ?? '2026-01-01',
      type: over.type ?? 'income',
      desc: over.desc ?? 'Gig',
      amount: over.amount ?? 100,
      deleted: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...over,
    };
  }

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    db = TestBed.inject(GigDbService);
    state = TestBed.inject(AppStateService);
  });

  it('Log pagination: 45 records -> 20 on page 1, 5 on page 3', async () => {
    for (let i = 0; i < 45; i++) {
      await db.recSave(
        baseRecord({ id: `r${i}`, date: `2026-02-${String((i % 28) + 1).padStart(2, '0')}` }),
      );
    }
    fixture = TestBed.createComponent(App);
    await settle();
    await clickTab('log');
    await waitFor(() => el().querySelectorAll('.card').length === 20, '20 cards on page 1');

    expect(el().querySelectorAll('.card').length).toBe(20);
    expect(el().querySelector('.pager-label')!.textContent).toContain('Page 1 of 3');

    el().querySelector<HTMLButtonElement>('.pager button:last-child')!.click(); // Next
    await settle();
    el().querySelector<HTMLButtonElement>('.pager button:last-child')!.click(); // Next
    await waitFor(
      () => (el().querySelector('.pager-label')?.textContent ?? '').includes('Page 3 of 3'),
      'on page 3',
    );

    expect(el().querySelector('.pager-label')!.textContent).toContain('Page 3 of 3');
    expect(el().querySelectorAll('.card').length).toBe(5);
  });

  it('Log -> Edit hands the record to the Add form and Update writes back to the same id', async () => {
    await db.recSave(baseRecord({ id: 'edit-me', desc: 'Club gig', amount: 250 }));
    fixture = TestBed.createComponent(App);
    await settle();
    await clickTab('log');
    await waitFor(() => !!el().querySelector('.card-acts .abt-edit'), 'log card rendered');

    // Tap the card's Edit button.
    const editBtn = Array.from(el().querySelectorAll<HTMLButtonElement>('.card-acts .abt-edit'))[0];
    editBtn.click();
    await settle();

    // We should now be on the Add tab, in edit mode, with the record loaded.
    await waitFor(
      () => el().querySelector<HTMLInputElement>('input[name="amount"]')?.value === '250',
      'edit form populated from the record',
    );
    expect(el().querySelector('app-add')).toBeTruthy();
    expect(el().querySelector('.edit-banner')).toBeTruthy();
    expect(state.editId()).toBe('edit-me');
    const amountInput = el().querySelector<HTMLInputElement>('input[name="amount"]')!;
    expect(amountInput.value).toBe('250');

    // Change the amount and hit Update.
    amountInput.value = '400';
    amountInput.dispatchEvent(new Event('input'));
    await settle();
    const updateBtn = Array.from(el().querySelectorAll<HTMLButtonElement>('button.btn')).find((b) =>
      b.textContent!.includes('Update Record'),
    )!;
    updateBtn.click();
    await settle();
    await waitFor(() => state.editId() === null, 'edit committed');

    const all = await db.recsGetAll();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe('edit-me');
    expect(all[0].amount).toBe(400);
    expect(all[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(state.editId()).toBeNull();
  });

  it('saved location round-trips through IndexedDB and auto-fills description + miles', async () => {
    await db.saveSavedLocation({ name: 'The Blue Room', address: '5 Jazz St', miles: 12.5 });

    fixture = TestBed.createComponent(App);
    await settle(); // starts on Add
    await waitFor(() => !!el().querySelector('.loc-pick'), 'saved-location chip rendered');

    const chip = Array.from(el().querySelectorAll<HTMLButtonElement>('.loc-pick')).find((b) =>
      b.textContent!.includes('The Blue Room'),
    );
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toContain('12.5 mi');

    chip!.click();
    await waitFor(
      () => el().querySelector<HTMLInputElement>('input[name="desc"]')?.value === 'The Blue Room',
      'description filled from the picked location',
    );

    expect(el().querySelector<HTMLInputElement>('input[name="desc"]')!.value).toBe('The Blue Room');
    expect(el().querySelector<HTMLInputElement>('input[name="miles"]')!.value).toBe('12.5');
  });
});
