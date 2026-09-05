import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GigDbService, GigRecord, SavedLocation } from '../services/gig-db.service';
import { TaxCalcService, CalcInput, CalcResult } from '../services/tax-calc.service';
import { TaxSettingsService } from '../services/tax-settings.service';
import { AppStateService } from '../services/app-state.service';

export type GigType = 'income' | 'rehearsal' | 'expense';

export interface AddForm {
  date: string;
  payDate: string;
  type: GigType;
  desc: string;
  amount: string;
  payMethod: string;
  notes: string;
  start: string;
  end: string;
  /** F2: gig/rehearsal street address (income + rehearsal only, F5). */
  address: string;
  miles: string;
  gasPrice: string;
  hasToll: boolean;
  tollCost: string;
  /** F4: "a toll was paid, amount not known yet" -- set instead of typing 0. */
  tollPending: boolean;
  hasMeal: boolean;
  mealCost: string;
  hasRoom: boolean;
  roomCost: string;
  hasOther: boolean;
  otherDesc: string;
  otherCost: string;
  hasTips: boolean;
  tipsAmount: string;
  tipsInTax: boolean;
}

export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function blankForm(): AddForm {
  return {
    date: todayStr(),
    payDate: '',
    type: 'income',
    desc: '',
    amount: '',
    payMethod: '',
    notes: '',
    start: '',
    end: '',
    address: '',
    miles: '',
    gasPrice: '',
    hasToll: false,
    tollCost: '',
    tollPending: false,
    hasMeal: false,
    mealCost: '',
    hasRoom: false,
    roomCost: '',
    hasOther: false,
    otherDesc: '',
    otherCost: '',
    hasTips: false,
    tipsAmount: '',
    // Legacy default: tips count toward the tax estimate unless the user
    // opts out (emptyForm() in index.html sets tipsInTax:true).
    tipsInTax: true,
  };
}

/** Rebuild the editable form from a stored record -- mirror of startEdit() in the legacy app. */
export function formFromRecord(rec: GigRecord): AddForm {
  const s = (v: number | string | undefined | null) => (v != null && v !== '' ? String(v) : '');
  return {
    date: rec.date || todayStr(),
    payDate: rec.payDate || '',
    type: rec.type || 'income',
    desc: rec.desc || '',
    amount: s(rec.amount),
    payMethod: rec.payMethod || '',
    notes: rec.notes || '',
    start: rec.start || '',
    end: rec.end || '',
    address: rec.address || '',
    miles: s(rec.miles),
    gasPrice: s(rec.gasPrice),
    hasToll: !!rec.hasToll,
    tollCost: s(rec.tollCost),
    tollPending: !!rec.tollPending,
    hasMeal: !!rec.hasMeal,
    mealCost: s(rec.mealCost),
    hasRoom: !!rec.hasRoom,
    roomCost: s(rec.roomCost),
    hasOther: !!rec.hasOther,
    otherDesc: rec.otherDesc || '',
    otherCost: s(rec.otherCost),
    hasTips: !!rec.hasTips,
    tipsAmount: s(rec.tipsAmount),
    tipsInTax: rec.tipsInTax !== false,
  };
}

export type PreviewItem = { kind: 'row'; l: string; v: string; cls: string } | { kind: 'sep' };

const money = (n: number): string => '$' + Math.abs(n ?? 0).toFixed(2);
const plusMinus = (n: number): string => (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2);

@Component({
  selector: 'app-add',
  imports: [FormsModule],
  templateUrl: './add.component.html',
  styleUrl: './add.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddComponent implements OnInit {
  private readonly db = inject(GigDbService);
  private readonly tax = inject(TaxCalcService);
  private readonly taxSettings = inject(TaxSettingsService);
  private readonly state = inject(AppStateService);

  /** The in-progress record. A plain object rather than a signal: it is
   * driven by `[(ngModel)]`, whose change events schedule change detection
   * on their own (that is true in zoneless mode too), and the derived
   * getters below re-run on that pass. */
  fm: AddForm = blankForm();

  /** State that changes outside a template event (after `await`, in
   * `ngOnInit`) must be a signal so the write itself triggers change
   * detection under OnPush + zoneless. */
  readonly saving = signal(false);
  readonly error = signal('');
  readonly savedLocations = signal<SavedLocation[]>([]);

  /** Non-null while editing an existing record (set from the Log's Edit
   * button via AppStateService). Drives the edit banner + "Update" button. */
  editId: string | null = null;
  private editCreatedAt: string | undefined;

  async ngOnInit(): Promise<void> {
    const rec = this.state.editRecord();
    if (rec) {
      this.fm = formFromRecord(rec);
      this.editId = rec.id;
      this.editCreatedAt = rec.createdAt;
    }

    this.savedLocations.set(await this.db.getSavedLocations());
    void this.taxSettings.ensureLoaded();
  }

  setType(t: GigType): void {
    this.fm.type = t;
    // F5: only income + rehearsal carry a location. Drop a half-entered
    // address when the entry becomes an expense so it can't be saved on one.
    if (t === 'expense') this.fm.address = '';
  }

  /** True for the types that have a location (F5). */
  get locationEnabled(): boolean {
    return this.fm.type !== 'expense';
  }

  /** Fills description, miles AND address from a previously-saved location --
   * the actual auto-fill: all three are looked up, not re-typed (F2). */
  pickLocation(loc: SavedLocation | null): void {
    if (!loc) return;
    this.fm.desc = loc.name;
    if (loc.miles != null) {
      this.fm.miles = String(loc.miles);
    }
    this.fm.address = loc.address ?? '';
  }

  /** Bound to the pick-list <select>. Always reset to '' after a pick so the
   * control shows the placeholder again, not the last-chosen location. */
  locationPick = '';

  /** Called from the pick-list <select>. */
  onLocationSelect(name: string): void {
    if (!name) return;
    this.pickLocation(this.savedLocations().find((l) => l.name === name) ?? null);
    this.locationPick = '';
  }

  /** Saves the current description + address + whatever's in Miles right
   * now as a reusable location (upserts by name). */
  async saveCurrentLocation(): Promise<void> {
    const miles = parseFloat(this.fm.miles);
    this.savedLocations.set(
      await this.db.saveSavedLocation({
        name: this.fm.desc,
        address: this.fm.address,
        miles: isNaN(miles) ? undefined : miles,
      }),
    );
  }

  async removeLocation(name: string): Promise<void> {
    this.savedLocations.set(await this.db.removeSavedLocation(name));
  }

  get calcInput(): CalcInput {
    const f = this.fm;
    return {
      // F1: expense carries an amount too (what it cost); only rehearsal
      // has no amount concept. Matches the legacy calc(), which passed
      // f.amount for every type.
      amount: f.type === 'rehearsal' ? '' : f.amount,
      type: f.type,
      hasTips: f.type === 'income' && f.hasTips,
      tipsAmount: f.tipsAmount,
      tipsInTax: f.tipsInTax,
      // F4: a pending toll contributes nothing to the cost math until a
      // real number is entered.
      hasToll: f.hasToll,
      tollCost: f.tollPending ? '' : f.tollCost,
      hasMeal: f.hasMeal,
      mealCost: f.mealCost,
      hasOther: f.hasOther,
      otherCost: f.otherCost,
      hasRoom: f.type === 'rehearsal' && f.hasRoom,
      roomCost: f.roomCost,
      miles: f.miles,
      gasPrice: f.gasPrice,
      start: f.start,
      end: f.end,
    };
  }

  get calc(): CalcResult {
    return this.tax.calc(this.calcInput, this.taxSettings.settings());
  }

  /** Ported from upPrev() in the legacy app -- same rows, same order, same
   * value formatting and colour classes. A getter, not a computed: its
   * inputs are `fm` (a plain object) and the `settings` signal, and it is
   * re-read on the change-detection pass that every `[(ngModel)]` edit
   * schedules. */
  get preview(): PreviewItem[] {
    const f = this.fm;
    const isI = f.type === 'income';
    const isR = f.type === 'rehearsal';
    const p = this.calc;
    const irsRate = this.taxSettings.irsRate();
    const combinedRate = this.taxSettings.combinedRatePct();
    const isE = f.type === 'expense';
    const hasIncome = isI && ((parseFloat(f.amount) || 0) > 0 || p.tips > 0);
    const hasExpense = isE && p.base > 0;
    if (!hasIncome && !hasExpense && !p.trueCosts && !p.hours) return [];

    const rows: PreviewItem[] = [];
    const row = (l: string, v: string, cls = '') => rows.push({ kind: 'row', l, v, cls });

    if (p.hours > 0) row('Duration', p.hours.toFixed(2) + ' hrs');
    if (p.tips > 0)
      row(
        'Tips' + (f.tipsInTax !== false ? ' (taxed)' : ' (not taxed)'),
        money(p.tips),
        f.tipsInTax !== false ? 'r' : 'a',
      );
    if (p.totalIncome > p.base && p.base > 0) row('Total income', money(p.totalIncome), 'g');
    if (p.miles > 0) row(`IRS deduction ($${irsRate}/mi)`, money(p.irsDed), 'g');
    if (p.meal > 0) row('Meal (50% ded.)', money(p.meal) + ' → ' + money(p.dedMeals) + ' deducted');
    if (p.room > 0) row('Room rental (100% ded.)', money(p.room), 'g');
    if (hasExpense) row('Amount spent', money(p.base), 'r');
    if (p.trueCosts > 0) row('Total out-of-pocket', money(p.trueCosts), 'r');
    if (p.taxSavings > 0) row('Est. tax savings', money(p.taxSavings), 'g');
    if (isI && p.seTax > 0) row('SE tax (15.3%)', money(p.seTax), 'r');
    if (isI && p.incomeTax > 0) row(`Income tax (${combinedRate}%)`, money(p.incomeTax), 'r');
    if (isI && hasIncome) {
      rows.push({ kind: 'sep' });
      row('Net after costs + taxes', plusMinus(p.netAfterAll), p.netAfterAll >= 0 ? 'g' : 'r');
      if (p.grossHourly !== null && p.hours > 0)
        row(
          'Rate (auto)',
          `${money(p.grossHourly)}/hr gross — ${plusMinus(p.trueHourly ?? 0)}/hr true`,
        );
    }
    if (isR && p.hours > 0) {
      rows.push({ kind: 'sep' });
      row('Cost of rehearsal', money(p.trueCosts) + ' / ' + p.hours.toFixed(1) + ' hrs', 'a');
    }
    return rows;
  }

  get canSave(): boolean {
    return this.fm.desc.trim().length > 0 && !this.saving();
  }

  get saveLabel(): string {
    if (this.editId) return 'Update Record';
    return this.fm.type === 'income'
      ? 'Save Income Gig'
      : this.fm.type === 'rehearsal'
        ? 'Save Rehearsal'
        : 'Save Expense';
  }

  buildRecord(): GigRecord {
    const f = this.fm;
    const c = this.calc;
    const num = (v: string): number => {
      const n = Number(v);
      return Number.isNaN(n) ? 0 : n;
    };
    return {
      id: this.editId ?? crypto.randomUUID(),
      date: f.date || todayStr(),
      payDate: f.payDate,
      type: f.type,
      desc: f.desc.trim(),
      // F1: an expense stores what it cost in `amount` too (rehearsal has
      // none). Fixes Log rows that always read -$0.00.
      amount: f.type === 'rehearsal' ? 0 : num(f.amount),
      payMethod: f.payMethod,
      notes: f.notes,
      start: f.start,
      end: f.end,
      // F2/F5: address is income + rehearsal only.
      address: f.type === 'expense' ? '' : f.address.trim(),
      hasToll: f.hasToll,
      tollCost: f.hasToll && !f.tollPending ? num(f.tollCost) : 0,
      // F4: only meaningful together with hasToll; false unless the amount
      // was explicitly deferred.
      tollPending: f.hasToll && f.tollPending,
      hasMeal: f.hasMeal,
      mealCost: f.hasMeal ? num(f.mealCost) : 0,
      hasOther: f.hasOther,
      otherDesc: f.otherDesc,
      otherCost: f.hasOther ? num(f.otherCost) : 0,
      hasRoom: f.type === 'rehearsal' && f.hasRoom,
      roomCost: f.type === 'rehearsal' && f.hasRoom ? num(f.roomCost) : 0,
      hasTips: f.type === 'income' && f.hasTips,
      tipsAmount: f.type === 'income' && f.hasTips ? num(f.tipsAmount) : 0,
      tipsInTax: f.tipsInTax !== false,
      miles: c.miles,
      gasPrice: num(f.gasPrice),
      hours: c.hours,
      fuelCost: c.fuelCost,
      trueCostMiles: c.trueCostMiles,
      irsDed: c.irsDed,
      dedMeals: c.dedMeals,
      totalDed: c.totalDed,
      taxSavings: c.taxSavings,
      trueCosts: c.trueCosts,
      seTax: c.seTax,
      incomeTax: c.incomeTax,
      totalTax: c.totalTax,
      netAfterAll: c.netAfterAll,
      trueHourly: c.trueHourly,
      grossHourly: c.grossHourly,
      toll: c.toll,
      meal: c.meal,
      oth: c.oth,
      room: c.room,
      tips: c.tips,
      deleted: false,
      createdAt: this.editCreatedAt ?? new Date().toISOString(),
    };
  }

  private resetForm(): void {
    this.fm = blankForm();
    this.editId = null;
    this.editCreatedAt = undefined;
    this.locationPick = '';
    this.error.set('');
  }

  cancelEdit(): void {
    this.state.clearEdit();
    this.resetForm();
    this.state.goTab('log');
  }

  async save(): Promise<void> {
    this.error.set('');
    if (!this.fm.desc.trim()) {
      this.error.set('Description is required.');
      return;
    }
    this.saving.set(true);
    try {
      await this.db.recSave(this.buildRecord());
      this.state.clearEdit();
      this.resetForm();
      // Legacy saveRec() drops you back on the Log after saving.
      this.state.goTab('log');
    } catch {
      this.error.set('Save failed.');
    } finally {
      this.saving.set(false);
    }
  }
}
