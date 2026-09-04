import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GigDbService, GigRecord } from '../services/gig-db.service';
import { TaxCalcService, CalcInput, CalcResult } from '../services/tax-calc.service';

export type GigType = 'income' | 'rehearsal' | 'expense';

export interface AddForm {
  date: string;
  type: GigType;
  desc: string;
  amount: string;
  payMethod: string;
  notes: string;
  start: string;
  end: string;
  miles: string;
  gasPrice: string;
  hasToll: boolean;
  tollCost: string;
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
    type: 'income',
    desc: '',
    amount: '',
    payMethod: '',
    notes: '',
    start: '',
    end: '',
    miles: '',
    gasPrice: '',
    hasToll: false,
    tollCost: '',
    hasMeal: false,
    mealCost: '',
    hasRoom: false,
    roomCost: '',
    hasOther: false,
    otherDesc: '',
    otherCost: '',
    hasTips: false,
    tipsAmount: '',
    tipsInTax: false,
  };
}

@Component({
  selector: 'app-add',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add.component.html',
  styleUrls: ['./add.component.css'],
})
export class AddComponent implements OnInit {
  private db = inject(GigDbService);
  private tax = inject(TaxCalcService);

  fm: AddForm = blankForm();
  saving = false;
  error = '';
  savedLocations: string[] = [];

  async ngOnInit(): Promise<void> {
    this.savedLocations = await this.db.getSavedLocations();
  }

  setType(t: GigType): void {
    this.fm.type = t;
  }

  /** Fills the description from a previously-saved gig location. */
  pickLocation(name: string): void {
    this.fm.desc = name;
  }

  /** Saves the current description as a reusable location (deduped). */
  async saveCurrentLocation(): Promise<void> {
    this.savedLocations = await this.db.addSavedLocation(this.fm.desc);
  }

  async removeLocation(name: string): Promise<void> {
    this.savedLocations = await this.db.removeSavedLocation(name);
  }

  get calcInput(): CalcInput {
    const f = this.fm;
    return {
      amount: f.type === 'income' ? f.amount : '',
      type: f.type,
      hasTips: f.type === 'income' && f.hasTips,
      tipsAmount: f.tipsAmount,
      tipsInTax: f.tipsInTax,
      hasToll: f.hasToll,
      tollCost: f.tollCost,
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
    return this.tax.calc(this.calcInput, {});
  }

  get canSave(): boolean {
    return this.fm.desc.trim().length > 0 && !this.saving;
  }

  buildRecord(): GigRecord {
    const f = this.fm;
    const c = this.calc;
    const num = (v: string) => {
      const n = parseFloat(v);
      return isNaN(n) ? 0 : n;
    };
    return {
      id: crypto.randomUUID(),
      date: f.date,
      type: f.type,
      desc: f.desc.trim(),
      amount: f.type === 'income' ? num(f.amount) : 0,
      payMethod: f.payMethod,
      notes: f.notes,
      start: f.start,
      end: f.end,
      hasToll: f.hasToll,
      tollCost: num(f.tollCost),
      hasMeal: f.hasMeal,
      mealCost: num(f.mealCost),
      hasOther: f.hasOther,
      otherDesc: f.otherDesc,
      otherCost: num(f.otherCost),
      hasRoom: f.type === 'rehearsal' && f.hasRoom,
      roomCost: num(f.roomCost),
      hasTips: f.type === 'income' && f.hasTips,
      tipsAmount: num(f.tipsAmount),
      tipsInTax: f.tipsInTax,
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
      createdAt: new Date().toISOString(),
    };
  }

  async save(): Promise<void> {
    this.error = '';
    if (!this.fm.desc.trim()) {
      this.error = 'Description is required.';
      return;
    }
    this.saving = true;
    try {
      await this.db.recSave(this.buildRecord());
      this.fm = blankForm();
    } catch (e) {
      this.error = 'Save failed.';
    } finally {
      this.saving = false;
    }
  }
}
