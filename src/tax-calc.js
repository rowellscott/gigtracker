function calc(fm, s) {
  const base   = parseFloat(fm.amount)   || 0;
  const tips   = fm.hasTips ? parseFloat(fm.tipsAmount) || 0 : 0;
  const toll   = fm.hasToll ? parseFloat(fm.tollCost)   || 0 : 0;
  const meal   = fm.hasMeal ? parseFloat(fm.mealCost)   || 0 : 0;
  const oth    = fm.hasOther ? parseFloat(fm.otherCost) || 0 : 0;
  const room   = fm.hasRoom ? parseFloat(fm.roomCost)   || 0 : 0;
  const miles  = parseFloat(fm.miles)    || 0;
  const gasP   = parseFloat(fm.gasPrice) || 0;
  const mpg    = parseFloat(s.mpg)       || 28;
  const fedR   = parseFloat(s.federalRate) || 24;
  const stR    = parseFloat(s.stateRate)   || 0;
  const irsR   = parseFloat(s.irsRate)     || 0.725;
  const trueR  = parseFloat(s.trueCostRate)|| 0.50;
  const tipsInTax = fm.tipsInTax !== false;

  let hours = 0;
  if (fm.start && fm.end) {
    const tm = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
    let d = tm(fm.end) - tm(fm.start); if (d < 0) d += 1440; hours = d / 60;
  }

  const fuelCost      = (miles > 0 && mpg > 0) ? (miles/mpg)*gasP : 0;
  const trueCostMiles = miles * trueR;
  const irsDed        = miles * irsR;
  const dedMeals      = meal * 0.5;
  const totalDed      = irsDed + toll + dedMeals + oth + room;
  const combRate      = (fedR + stR) / 100;
  const trueCosts     = trueCostMiles + toll + meal + oth + room;
  const taxSavings    = totalDed * combRate;

  const totalIncome   = base + tips;
  const taxableIncome = base + (tipsInTax ? tips : 0);

  let seTax = 0, incomeTax = 0;
  if (fm.type === 'income' && totalIncome > 0) {
    const netSE = Math.max(0, taxableIncome - totalDed);
    seTax       = netSE * 0.9235 * 0.153;
    incomeTax   = Math.max(0, netSE - seTax * 0.5) * combRate;
  }

  const totalTax    = seTax + incomeTax;
  const netAfterAll = totalIncome - trueCosts - totalTax;
  const grossHourly = hours > 0 ? totalIncome / hours : null;
  const trueHourly  = hours > 0 ? netAfterAll / hours : null;

  return {hours, fuelCost, trueCostMiles, irsDed, dedMeals, totalDed, taxSavings,
    trueCosts, seTax, incomeTax, totalTax, netAfterAll,
    grossHourly, trueHourly, toll, meal, oth, room, tips, miles, totalIncome, base};
}

module.exports = calc;
module.exports.calc = calc;
