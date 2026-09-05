import { describe, expect, it } from 'vitest';
import { TaxCalcService } from './tax-calc.service';

describe('TaxCalcService', () => {
  const svc = new TaxCalcService();
  const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

  it('basic income gig with no expenses', () => {
    const r = svc.calc({ amount: '100', type: 'income' }, {});
    expect(r.base).toBe(100);
    expect(r.tips).toBe(0);
    expect(r.totalIncome).toBe(100);
    expect(r.totalDed).toBe(0);

    const seTax = 100 * 0.9235 * 0.153;
    const incomeTax = Math.max(0, 100 - seTax * 0.5) * 0.24;
    close(r.seTax, seTax);
    close(r.incomeTax, incomeTax);
    close(r.netAfterAll, 100 - (seTax + incomeTax));
    expect(r.hours).toBe(0);
    expect(r.grossHourly).toBeNull();
    expect(r.trueHourly).toBeNull();
  });

  it('income gig with mileage + meal + tips', () => {
    const r = svc.calc(
      {
        amount: '200',
        type: 'income',
        hasTips: true,
        tipsAmount: '50',
        hasMeal: true,
        mealCost: '20',
        miles: '100',
        gasPrice: '3.50',
        start: '09:00',
        end: '13:30',
      },
      { mpg: 25, federalRate: 22, stateRate: 5, irsRate: 0.67, trueCostRate: 0.5 },
    );
    expect(r.totalIncome).toBe(250);
    close(r.hours, 4.5);
    close(r.fuelCost, (100 / 25) * 3.5);
    close(r.trueCostMiles, 100 * 0.5);
    close(r.irsDed, 100 * 0.67);
    close(r.dedMeals, 20 * 0.5);
    const totalDed = 100 * 0.67 + 20 * 0.5;
    close(r.totalDed, totalDed);
    close(r.taxSavings, totalDed * 0.27);
  });

  it('rehearsal (not income) with room cost carries no SE/income tax', () => {
    const r = svc.calc(
      { type: 'rehearsal', hasRoom: true, roomCost: '40', start: '18:00', end: '20:00' },
      {},
    );
    expect(r.seTax).toBe(0);
    expect(r.incomeTax).toBe(0);
    close(r.room, 40);
    close(r.trueCosts, 40);
    close(r.hours, 2);
  });

  it('tips excluded from taxable income when tipsInTax is false', () => {
    const taxed = svc.calc(
      { amount: '100', type: 'income', hasTips: true, tipsAmount: '50', tipsInTax: true },
      {},
    );
    const untaxed = svc.calc(
      { amount: '100', type: 'income', hasTips: true, tipsAmount: '50', tipsInTax: false },
      {},
    );
    expect(taxed.totalIncome).toBe(untaxed.totalIncome); // gross always includes tips
    expect(taxed.seTax).toBeGreaterThan(untaxed.seTax); // but taxable base differs
  });

  it('missing/invalid numeric fields fall back to zero/defaults, never NaN', () => {
    const r = svc.calc({ amount: 'not-a-number', type: 'income' }, { mpg: 'nope' });
    expect(Number.isNaN(r.base)).toBe(false);
    expect(r.base).toBe(0);
    expect(r.totalTax).toBe(0);
  });
});
