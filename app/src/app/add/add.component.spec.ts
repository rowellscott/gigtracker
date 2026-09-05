import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddComponent, todayStr } from './add.component';
import { GigDbService, GigRecord, SavedLocation } from '../services/gig-db.service';
import { TaxCalcService } from '../services/tax-calc.service';
import { AppStateService } from '../services/app-state.service';

describe('AddComponent', () => {
  let fixture: ComponentFixture<AddComponent>;
  let cmp: AddComponent;
  let saved: GigRecord[];
  let locations: SavedLocation[];
  let dbStub: {
    recSave: (r: GigRecord) => Promise<void>;
    getSavedLocations: () => Promise<SavedLocation[]>;
    saveSavedLocation: (loc: SavedLocation) => Promise<SavedLocation[]>;
    removeSavedLocation: (name: string) => Promise<SavedLocation[]>;
  };

  beforeEach(async () => {
    saved = [];
    locations = [
      { name: 'Ace Venue', miles: 3 },
      { name: 'The Cellar', address: '12 Main St', miles: 8.4 },
    ];
    dbStub = {
      recSave: (r: GigRecord) => {
        saved.push(r);
        return Promise.resolve();
      },
      getSavedLocations: () => Promise.resolve(locations),
      saveSavedLocation: (loc: SavedLocation) => {
        const name = loc.name.trim();
        if (name) {
          const cleaned: SavedLocation = { name };
          if (loc.address?.trim()) cleaned.address = loc.address.trim();
          if (loc.miles != null && !isNaN(loc.miles)) cleaned.miles = loc.miles;
          locations = [...locations.filter((l) => l.name !== name), cleaned].sort((a, b) =>
            a.name.localeCompare(b.name),
          );
        }
        return Promise.resolve(locations);
      },
      removeSavedLocation: (name: string) => {
        locations = locations.filter((l) => l.name !== name);
        return Promise.resolve(locations);
      },
    };

    await TestBed.configureTestingModule({
      imports: [AddComponent],
      providers: [{ provide: GigDbService, useValue: dbStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(AddComponent);
    cmp = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it("creates with income type and today's date", () => {
    expect(cmp).toBeTruthy();
    expect(cmp.fm.type).toBe('income');
    expect(cmp.fm.date).toBe(todayStr());
  });

  it('blocks save when desc is empty', async () => {
    cmp.fm.amount = '100';
    cmp.fm.desc = '   ';
    await cmp.save();
    expect(saved.length).toBe(0);
    expect(cmp.error()).toBeTruthy();
  });

  it('persists calculated fields matching TaxCalcService output', async () => {
    const tax = TestBed.inject(TaxCalcService);
    cmp.fm.desc = 'Club gig';
    cmp.fm.amount = '300';
    cmp.fm.miles = '60';
    cmp.fm.gasPrice = '3.50';
    cmp.fm.start = '19:00';
    cmp.fm.end = '22:00';

    const expected = tax.calc(cmp.calcInput, {});
    await cmp.save();

    expect(saved.length).toBe(1);
    const rec = saved[0];
    expect(rec.desc).toBe('Club gig');
    expect(rec.type).toBe('income');
    expect(rec.amount).toBe(300);
    expect(rec.deleted).toBe(false);
    expect(rec.id).toBeTruthy();
    expect(rec.createdAt).toBeTruthy();

    expect(rec.hours).toBe(expected.hours);
    expect(rec.fuelCost).toBe(expected.fuelCost);
    expect(rec.trueCostMiles).toBe(expected.trueCostMiles);
    expect(rec.irsDed).toBe(expected.irsDed);
    expect(rec.dedMeals).toBe(expected.dedMeals);
    expect(rec.totalDed).toBe(expected.totalDed);
    expect(rec.taxSavings).toBe(expected.taxSavings);
    expect(rec.trueCosts).toBe(expected.trueCosts);
    expect(rec.seTax).toBe(expected.seTax);
    expect(rec.incomeTax).toBe(expected.incomeTax);
    expect(rec.totalTax).toBe(expected.totalTax);
    expect(rec.netAfterAll).toBe(expected.netAfterAll);
    expect(rec.grossHourly).toBe(expected.grossHourly);
    expect(rec.trueHourly).toBe(expected.trueHourly);
    expect(rec.miles).toBe(expected.miles);
  });

  it('resets the form after a successful save', async () => {
    cmp.fm.type = 'expense';
    cmp.fm.desc = 'Strings';
    cmp.fm.miles = '10';
    await cmp.save();

    expect(saved.length).toBe(1);
    expect(cmp.fm.desc).toBe('');
    expect(cmp.fm.miles).toBe('');
    expect(cmp.fm.type).toBe('income');
    expect(cmp.fm.date).toBe(todayStr());
  });

  describe('saved locations', () => {
    it('loads saved locations on init', () => {
      expect(cmp.savedLocations()).toEqual([
        { name: 'Ace Venue', miles: 3 },
        { name: 'The Cellar', address: '12 Main St', miles: 8.4 },
      ]);
    });

    it('picking a saved location fills description, miles AND address (F2)', () => {
      cmp.pickLocation({ name: 'The Cellar', address: '12 Main St', miles: 8.4 });
      expect(cmp.fm.desc).toBe('The Cellar');
      expect(cmp.fm.miles).toBe('8.4');
      expect(cmp.fm.address).toBe('12 Main St');
    });

    it('onLocationSelect(name) resolves the saved location and fills the form', () => {
      cmp.onLocationSelect('The Cellar');
      expect(cmp.fm.desc).toBe('The Cellar');
      expect(cmp.fm.address).toBe('12 Main St');
      cmp.onLocationSelect(''); // placeholder option -- no-op
      expect(cmp.fm.desc).toBe('The Cellar');
    });

    it('picking a location with no saved mileage leaves miles untouched, clears address', () => {
      cmp.fm.miles = '25';
      cmp.fm.address = 'stale';
      cmp.pickLocation({ name: 'No Mileage Venue' });
      expect(cmp.fm.miles).toBe('25');
      expect(cmp.fm.address).toBe('');
    });

    it('saves the current description + address + miles as a location, and dedupes by name', async () => {
      cmp.fm.desc = 'New Venue';
      cmp.fm.miles = '12.5';
      cmp.fm.address = '99 Oak Ave';
      await cmp.saveCurrentLocation();
      expect(cmp.savedLocations()).toEqual([
        { name: 'Ace Venue', miles: 3 },
        { name: 'New Venue', address: '99 Oak Ave', miles: 12.5 },
        { name: 'The Cellar', address: '12 Main St', miles: 8.4 },
      ]);

      await cmp.saveCurrentLocation(); // same desc again -- must update, not duplicate
      expect(cmp.savedLocations().filter((l) => l.name === 'New Venue').length).toBe(1);
    });

    it('saving with no mileage entered omits miles rather than storing NaN/0', async () => {
      cmp.fm.desc = 'Unknown Distance Gig';
      cmp.fm.miles = '';
      await cmp.saveCurrentLocation();
      const loc = cmp.savedLocations().find((l) => l.name === 'Unknown Distance Gig');
      expect(loc).toEqual({ name: 'Unknown Distance Gig' });
    });

    it('does not save a blank description as a location', async () => {
      cmp.fm.desc = '   ';
      await cmp.saveCurrentLocation();
      expect(cmp.savedLocations().map((l) => l.name)).toEqual(['Ace Venue', 'The Cellar']);
    });

    it('removes a saved location without touching the current description', async () => {
      cmp.fm.desc = 'Club gig';
      await cmp.removeLocation('The Cellar');
      expect(cmp.savedLocations()).toEqual([{ name: 'Ace Venue', miles: 3 }]);
      expect(cmp.fm.desc).toBe('Club gig');
    });
  });
});

describe('AddComponent edit mode', () => {
  let fixture: ComponentFixture<AddComponent>;
  let cmp: AddComponent;
  let saved: GigRecord[];
  const existing: GigRecord = {
    id: 'rec-42',
    date: '2026-03-10',
    payDate: '2026-03-20',
    type: 'income',
    desc: 'Wedding set',
    amount: 800,
    payMethod: 'check',
    miles: 40,
    gasPrice: 3.5,
    hasTips: true,
    tipsAmount: 100,
    tipsInTax: true,
    tips: 100,
    start: '18:00',
    end: '23:00',
    createdAt: '2026-03-10T02:00:00.000Z',
    deleted: false,
  };

  async function mount(edit: GigRecord | null): Promise<void> {
    saved = [];
    const dbStub = {
      recSave: (r: GigRecord) => {
        saved.push(r);
        return Promise.resolve();
      },
      kvGet: () => Promise.resolve(null),
      getSavedLocations: () => Promise.resolve([]),
      saveSavedLocation: () => Promise.resolve([]),
      removeSavedLocation: () => Promise.resolve([]),
    };
    await TestBed.configureTestingModule({
      imports: [AddComponent],
      providers: [{ provide: GigDbService, useValue: dbStub }],
    }).compileComponents();
    const state = TestBed.inject(AppStateService);
    if (edit) state.startEdit(edit);
    fixture = TestBed.createComponent(AddComponent);
    cmp = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('loads the record into the form when AppStateService has an editId', async () => {
    await mount(existing);
    expect(cmp.editId).toBe('rec-42');
    expect(cmp.fm.desc).toBe('Wedding set');
    expect(cmp.fm.amount).toBe('800');
    expect(cmp.fm.payDate).toBe('2026-03-20');
    expect(cmp.fm.hasTips).toBe(true);
    expect(cmp.fm.tipsAmount).toBe('100');
    expect(cmp.saveLabel).toBe('Update Record');
  });

  it('saving an edit writes back to the SAME id and preserves createdAt', async () => {
    await mount(existing);
    cmp.fm.amount = '900';
    await cmp.save();
    expect(saved.length).toBe(1);
    expect(saved[0].id).toBe('rec-42');
    expect(saved[0].amount).toBe(900);
    expect(saved[0].createdAt).toBe('2026-03-10T02:00:00.000Z');
    expect(TestBed.inject(AppStateService).editId()).toBeNull();
    expect(TestBed.inject(AppStateService).activeTab()).toBe('log');
  });

  it('cancelEdit drops edit state without saving and returns to the log', async () => {
    await mount(existing);
    cmp.fm.amount = '5';
    cmp.cancelEdit();
    expect(saved.length).toBe(0);
    expect(cmp.editId).toBeNull();
    expect(cmp.fm.desc).toBe('');
    expect(TestBed.inject(AppStateService).editId()).toBeNull();
    expect(TestBed.inject(AppStateService).activeTab()).toBe('log');
  });

  it('with no editId it is a normal fresh add', async () => {
    await mount(null);
    expect(cmp.editId).toBeNull();
    expect(cmp.saveLabel).toBe('Save Income Gig');
  });
});

/**
 * F1 — an Expense must persist what it cost, and doing so must not perturb
 * the tax math for income / rehearsal records (AGENTS.md: no drift).
 */
describe('AddComponent — expense amount (F1)', () => {
  let cmp: AddComponent;
  let saved: GigRecord[];

  beforeEach(async () => {
    saved = [];
    const dbStub = {
      recSave: (r: GigRecord) => {
        saved.push(r);
        return Promise.resolve();
      },
      getSavedLocations: () => Promise.resolve([] as SavedLocation[]),
      saveSavedLocation: () => Promise.resolve([] as SavedLocation[]),
      removeSavedLocation: () => Promise.resolve([] as SavedLocation[]),
    };
    await TestBed.configureTestingModule({
      imports: [AddComponent],
      providers: [{ provide: GigDbService, useValue: dbStub }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AddComponent);
    cmp = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('persists the entered amount on an expense record', async () => {
    cmp.fm.type = 'expense';
    cmp.fm.desc = 'Strings';
    cmp.fm.amount = '42';
    await cmp.save();
    expect(saved).toHaveLength(1);
    expect(saved[0].type).toBe('expense');
    expect(saved[0].amount).toBe(42);
  });

  it('a rehearsal still stores amount 0 (it has no amount concept)', async () => {
    cmp.fm.type = 'rehearsal';
    cmp.fm.desc = 'Run-through';
    cmp.fm.amount = '99'; // even if somehow set
    await cmp.save();
    expect(saved[0].amount).toBe(0);
  });

  it('adding an expense does not change an income gig CalcResult', () => {
    const tax = TestBed.inject(TaxCalcService);
    // Income calcInput is derived only from income-relevant fields; assert
    // the shape the component feeds calc() is identical before/after an
    // expense is in play.
    cmp.fm.type = 'income';
    cmp.fm.desc = 'Club gig';
    cmp.fm.amount = '300';
    cmp.fm.miles = '40';
    const before = tax.calc(cmp.calcInput, {});

    cmp.fm.type = 'expense';
    cmp.fm.amount = '75';
    cmp.fm.type = 'income'; // back to the gig
    cmp.fm.amount = '300';
    cmp.fm.miles = '40';
    const after = tax.calc(cmp.calcInput, {});

    expect(after).toEqual(before);
  });
});

/**
 * F4 — "toll paid, amount not known yet" without typing 0.
 */
describe('AddComponent — pending toll (F4)', () => {
  let cmp: AddComponent;
  let saved: GigRecord[];

  beforeEach(async () => {
    saved = [];
    const dbStub = {
      recSave: (r: GigRecord) => {
        saved.push(r);
        return Promise.resolve();
      },
      getSavedLocations: () => Promise.resolve([] as SavedLocation[]),
      saveSavedLocation: () => Promise.resolve([] as SavedLocation[]),
      removeSavedLocation: () => Promise.resolve([] as SavedLocation[]),
    };
    await TestBed.configureTestingModule({
      imports: [AddComponent],
      providers: [{ provide: GigDbService, useValue: dbStub }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AddComponent);
    cmp = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('hasToll + amount-unknown persists tollPending true and toll 0', async () => {
    cmp.fm.desc = 'Gig with toll';
    cmp.fm.amount = '100';
    cmp.fm.hasToll = true;
    cmp.fm.tollPending = true;
    cmp.fm.tollCost = '';
    await cmp.save();
    expect(saved[0].tollPending).toBe(true);
    expect(saved[0].tollCost).toBe(0);
    expect(saved[0].toll).toBe(0);
    expect(saved[0].trueCosts).toBe(0);
  });

  it('a known toll amount persists normally and is not pending', async () => {
    cmp.fm.desc = 'Gig with toll';
    cmp.fm.amount = '100';
    cmp.fm.hasToll = true;
    cmp.fm.tollPending = false;
    cmp.fm.tollCost = '7.50';
    await cmp.save();
    expect(saved[0].tollPending).toBe(false);
    expect(saved[0].toll).toBe(7.5);
    expect(saved[0].tollCost).toBe(7.5);
  });

  it('tollPending is never true without hasToll', async () => {
    cmp.fm.desc = 'No toll';
    cmp.fm.amount = '100';
    cmp.fm.hasToll = false;
    cmp.fm.tollPending = true; // stale flag
    await cmp.save();
    expect(saved[0].tollPending).toBe(false);
  });
});

/**
 * F5 — only income + rehearsal carry a location; an expense uses its
 * description only.
 */
describe('AddComponent — location is income/rehearsal only (F5)', () => {
  let cmp: AddComponent;
  let saved: GigRecord[];

  beforeEach(async () => {
    saved = [];
    const dbStub = {
      recSave: (r: GigRecord) => {
        saved.push(r);
        return Promise.resolve();
      },
      getSavedLocations: () =>
        Promise.resolve([{ name: 'The Blue Room', address: '12 Main St', miles: 24 }]),
      saveSavedLocation: () => Promise.resolve([] as SavedLocation[]),
      removeSavedLocation: () => Promise.resolve([] as SavedLocation[]),
    };
    await TestBed.configureTestingModule({
      imports: [AddComponent],
      providers: [{ provide: GigDbService, useValue: dbStub }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AddComponent);
    cmp = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('locationEnabled is true for income and rehearsal, false for expense', () => {
    cmp.fm.type = 'income';
    expect(cmp.locationEnabled).toBe(true);
    cmp.fm.type = 'rehearsal';
    expect(cmp.locationEnabled).toBe(true);
    cmp.fm.type = 'expense';
    expect(cmp.locationEnabled).toBe(false);
  });

  it('switching to expense clears a half-entered address', () => {
    cmp.fm.type = 'income';
    cmp.fm.address = '12 Main St, Tampa FL';
    cmp.setType('expense');
    expect(cmp.fm.address).toBe('');
  });

  it('an expense record never carries an address, even if one lingers on the form', async () => {
    cmp.fm.type = 'expense';
    cmp.fm.desc = 'Strings';
    cmp.fm.amount = '20';
    (cmp.fm as { address: string }).address = 'sneaky';
    await cmp.save();
    expect(saved[0].address).toBe('');
  });

  it('an income record keeps its address', async () => {
    cmp.fm.type = 'income';
    cmp.fm.desc = 'Club gig';
    cmp.fm.amount = '200';
    cmp.fm.address = '12 Main St';
    await cmp.save();
    expect(saved[0].address).toBe('12 Main St');
  });
});
