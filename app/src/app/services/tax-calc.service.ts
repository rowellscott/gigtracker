import { Injectable } from '@angular/core';
import type { TaxSettings } from './gig-db.service';

/** The subset of GigRecord fields calc() reads as input -- a form-in-progress
 * has the same shape before it's saved as a record. */
export interface CalcInput {
  amount?: string | number;
  type?: string;
  hasTips?: boolean;
  tipsAmount?: string | number;
  tipsInTax?: boolean;
  hasToll?: boolean;
  tollCost?: string | number;
  hasMeal?: boolean;
  mealCost?: string | number;
  hasOther?: boolean;
  otherCost?: string | number;
  hasRoom?: boolean;
  roomCost?: string | number;
  miles?: string | number;
  gasPrice?: string | number;
  start?: string;
  end?: string;
}

/** Tax-rate settings as calc() reads them. Values may still be strings here
 * (raw form input, or an older stored config), so calc() coerces each one --
 * the same tolerance CalcInput gives the gig fields. */
export type CalcSettings = Partial<Record<keyof TaxSettings, string | number>>;

export interface CalcResult {
  hours: number;
  fuelCost: number;
  trueCostMiles: number;
  irsDed: number;
  dedMeals: number;
  totalDed: number;
  taxSavings: number;
  trueCosts: number;
  seTax: number;
  incomeTax: number;
  totalTax: number;
  netAfterAll: number;
  grossHourly: number | null;
  trueHourly: number | null;
  toll: number;
  meal: number;
  oth: number;
  room: number;
  tips: number;
  miles: number;
  totalIncome: number;
  base: number;
}

/**
 * Ported verbatim from the legacy index.html's calc(fm, s) -- same field
 * names, same arithmetic (IRS mileage deduction, 50%-deductible meals,
 * SE tax = net x 0.9235 x 15.3%, etc). Behavior-identical, not a redesign:
 * every existing record's stored calculated fields must still match what
 * this produces, or historical tax numbers silently drift.
 */
@Injectable({ providedIn: 'root' })
export class TaxCalcService {
  calc(fm: CalcInput, s: CalcSettings): CalcResult {
    const num = (v: string | number | undefined) =>
      typeof v === 'number' ? v : parseFloat(v ?? '') || 0;

    const base = num(fm.amount);
    const tips = fm.hasTips ? num(fm.tipsAmount) : 0;
    const toll = fm.hasToll ? num(fm.tollCost) : 0;
    const meal = fm.hasMeal ? num(fm.mealCost) : 0;
    const oth = fm.hasOther ? num(fm.otherCost) : 0;
    const room = fm.hasRoom ? num(fm.roomCost) : 0;
    const miles = num(fm.miles);
    const gasP = num(fm.gasPrice);
    const mpg = num(s.mpg) || 28;
    const fedR = num(s.federalRate) || 24;
    const stR = num(s.stateRate) || 0;
    const irsR = num(s.irsRate) || 0.725;
    const trueR = num(s.trueCostRate) || 0.5;
    const tipsInTax = fm.tipsInTax !== false;

    let hours = 0;
    if (fm.start && fm.end) {
      const toMinutes = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      let d = toMinutes(fm.end) - toMinutes(fm.start);
      if (d < 0) d += 1440;
      hours = d / 60;
    }

    const fuelCost = miles > 0 && mpg > 0 ? (miles / mpg) * gasP : 0;
    const trueCostMiles = miles * trueR;
    const irsDed = miles * irsR;
    const dedMeals = meal * 0.5;
    const totalDed = irsDed + toll + dedMeals + oth + room;
    const combRate = (fedR + stR) / 100;
    const trueCosts = trueCostMiles + toll + meal + oth + room;
    const taxSavings = totalDed * combRate;

    const totalIncome = base + tips;
    const taxableIncome = base + (tipsInTax ? tips : 0);

    let seTax = 0;
    let incomeTax = 0;
    if (fm.type === 'income' && totalIncome > 0) {
      const netSE = Math.max(0, taxableIncome - totalDed);
      seTax = netSE * 0.9235 * 0.153;
      incomeTax = Math.max(0, netSE - seTax * 0.5) * combRate;
    }

    const totalTax = seTax + incomeTax;
    const netAfterAll = totalIncome - trueCosts - totalTax;
    const grossHourly = hours > 0 ? totalIncome / hours : null;
    const trueHourly = hours > 0 ? netAfterAll / hours : null;

    return {
      hours,
      fuelCost,
      trueCostMiles,
      irsDed,
      dedMeals,
      totalDed,
      taxSavings,
      trueCosts,
      seTax,
      incomeTax,
      totalTax,
      netAfterAll,
      grossHourly,
      trueHourly,
      toll,
      meal,
      oth,
      room,
      tips,
      miles,
      totalIncome,
      base,
    };
  }
}
