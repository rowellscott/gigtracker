const assert = require('assert');
const calc = require('./tax-calc.js');

function approxEqual(a, b, msg) {
  assert.ok(Math.abs(a - b) < 1e-6, `${msg}: expected ${b}, got ${a}`);
}

// Test 1: basic income gig with no expenses
{
  const fm = { amount: '100', type: 'income' };
  const s = {};
  const r = calc(fm, s);

  approxEqual(r.base, 100, 'base');
  approxEqual(r.tips, 0, 'tips');
  approxEqual(r.totalIncome, 100, 'totalIncome');
  approxEqual(r.totalDed, 0, 'totalDed');

  const netSE = 100;
  const seTax = netSE * 0.9235 * 0.153;
  const combRate = 24 / 100;
  const incomeTax = Math.max(0, netSE - seTax * 0.5) * combRate;
  approxEqual(r.seTax, seTax, 'seTax');
  approxEqual(r.incomeTax, incomeTax, 'incomeTax');
  approxEqual(r.totalTax, seTax + incomeTax, 'totalTax');
  approxEqual(r.trueCosts, 0, 'trueCosts');
  approxEqual(r.netAfterAll, 100 - 0 - (seTax + incomeTax), 'netAfterAll');
  assert.strictEqual(r.hours, 0, 'hours');
  assert.strictEqual(r.grossHourly, null, 'grossHourly');
  assert.strictEqual(r.trueHourly, null, 'trueHourly');
  console.log('Test 1 passed: basic income gig with no expenses');
}

// Test 2: income gig with mileage + meal + tips
{
  const fm = {
    amount: '200',
    type: 'income',
    hasTips: true, tipsAmount: '50',
    hasMeal: true, mealCost: '20',
    miles: '100',
    gasPrice: '3.50',
    start: '09:00', end: '13:30'
  };
  const s = { mpg: '25', federalRate: '22', stateRate: '5', irsRate: '0.67', trueCostRate: '0.5' };
  const r = calc(fm, s);

  approxEqual(r.base, 200, 'base');
  approxEqual(r.tips, 50, 'tips');
  approxEqual(r.totalIncome, 250, 'totalIncome');
  approxEqual(r.hours, 4.5, 'hours');
  approxEqual(r.fuelCost, (100/25)*3.50, 'fuelCost');
  approxEqual(r.trueCostMiles, 100 * 0.5, 'trueCostMiles');
  approxEqual(r.irsDed, 100 * 0.67, 'irsDed');
  approxEqual(r.dedMeals, 20 * 0.5, 'dedMeals');
  const totalDed = (100*0.67) + 0 + (20*0.5) + 0 + 0;
  approxEqual(r.totalDed, totalDed, 'totalDed');
  const combRate = (22 + 5) / 100;
  approxEqual(r.taxSavings, totalDed * combRate, 'taxSavings');
  const trueCosts = (100*0.5) + 0 + 20 + 0 + 0;
  approxEqual(r.trueCosts, trueCosts, 'trueCosts');

  const taxableIncome = 200 + 50;
  const netSE = Math.max(0, taxableIncome - totalDed);
  const seTax = netSE * 0.9235 * 0.153;
  const incomeTax = Math.max(0, netSE - seTax * 0.5) * combRate;
  approxEqual(r.seTax, seTax, 'seTax');
  approxEqual(r.incomeTax, incomeTax, 'incomeTax');
  const totalTax = seTax + incomeTax;
  approxEqual(r.totalTax, totalTax, 'totalTax');
  approxEqual(r.netAfterAll, 250 - trueCosts - totalTax, 'netAfterAll');
  approxEqual(r.grossHourly, 250 / 4.5, 'grossHourly');
  approxEqual(r.trueHourly, (250 - trueCosts - totalTax) / 4.5, 'trueHourly');
  console.log('Test 2 passed: income gig with mileage + meal + tips');
}

// Test 3: rehearsal (type != 'income') with room cost
{
  const fm = {
    amount: '0',
    type: 'rehearsal',
    hasRoom: true, roomCost: '30',
    hasOther: true, otherCost: '10'
  };
  const s = {};
  const r = calc(fm, s);

  approxEqual(r.room, 30, 'room');
  approxEqual(r.oth, 10, 'oth');
  approxEqual(r.totalIncome, 0, 'totalIncome');
  const totalDed = 0 + 0 + 0 + 10 + 30;
  approxEqual(r.totalDed, totalDed, 'totalDed');
  approxEqual(r.trueCosts, 0 + 0 + 0 + 10 + 30, 'trueCosts');
  approxEqual(r.seTax, 0, 'seTax (non-income type)');
  approxEqual(r.incomeTax, 0, 'incomeTax (non-income type)');
  approxEqual(r.totalTax, 0, 'totalTax');
  approxEqual(r.netAfterAll, 0 - 40 - 0, 'netAfterAll');
  console.log('Test 3 passed: rehearsal with room cost');
}

console.log('All tests passed.');
