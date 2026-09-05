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

    it('picking a saved location fills in the description AND the miles', () => {
      cmp.pickLocation({ name: 'The Cellar', address: '12 Main St', miles: 8.4 });
      expect(cmp.fm.desc).toBe('The Cellar');
      expect(cmp.fm.miles).toBe('8.4');
    });

    it('picking a location with no saved mileage leaves miles untouched', () => {
      cmp.fm.miles = '25';
      cmp.pickLocation({ name: 'No Mileage Venue' });
      expect(cmp.fm.miles).toBe('25');
    });

    it('saves the current description + address + miles as a location, and dedupes by name', async () => {
      cmp.fm.desc = 'New Venue';
      cmp.fm.miles = '12.5';
      cmp.locationAddress = '99 Oak Ave';
      await cmp.saveCurrentLocation();
      expect(cmp.savedLocations()).toEqual([
        { name: 'Ace Venue', miles: 3 },
        { name: 'New Venue', address: '99 Oak Ave', miles: 12.5 },
        { name: 'The Cellar', address: '12 Main St', miles: 8.4 },
      ]);
      expect(cmp.locationAddress).toBe(''); // scratch input clears after saving

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
