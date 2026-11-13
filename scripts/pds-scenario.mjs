// Illustrative cash-flow valuation, separate from programme terms and payout rights.
export const DEFAULT_PDS_SCENARIO_RATE = 15;

function annualIrr(flows) {
  if (flows.every(value => value === 0)) return null;
  if (!flows.some(value => value > 0)) return -1;
  const months = flows.length - 1;
  // Terminal-value scaling avoids overflow near -100% and preserves the NPV root.
  const value = rate => flows.reduce((sum, cash, month) => sum + cash * (1 + rate) ** ((months - month) / 12), 0);
  let low = -0.999999999999, high = 1;
  while (value(high) > 0 && high < 1023) high = high * 2 + 1;
  if (value(low) < 0 || value(high) > 0) return null;
  for (let i = 0; i < 100; i++) {
    const middle = (low + high) / 2;
    if (value(middle) > 0) low = middle; else high = middle;
  }
  const rate = (low + high) / 2;
  return Math.abs(rate) < 1e-12 ? 0 : rate;
}

export function projectPdsScenario(plan, {investmentRatePercent = DEFAULT_PDS_SCENARIO_RATE, period = 'annual'} = {}) {
  if (!Number.isFinite(investmentRatePercent) || investmentRatePercent < -100 || investmentRatePercent > 100) throw Error('Укажите инвестдоход в сценарии от −100 до 100% годовых');
  if (!['annual', 'monthly'].includes(period)) throw Error('Некорректный период взноса');
  if (plan.supportAnnual === null) return {available:false};
  const months = plan.years * 12, monthlyFactor = (1 + investmentRatePercent / 100) ** (1 / 12);
  const cashFlows = Array(months + 1).fill(0), schedule = [];
  const taxAnnual = plan.taxTermMet ? plan.taxAnnual : 0;
  let account = 0;
  for (let month = 0; month < months; month++) {
    const contribution = period === 'monthly' ? plan.annual / 12 : month % 12 === 0 ? plan.annual : 0;
    cashFlows[month] -= contribution;
    account = (account + contribution) * monthlyFactor;
    if ((month + 1) % 12 === 0) {
      const year = (month + 1) / 12, support = year <= plan.supportYears ? plan.supportAnnual : 0;
      account += support;
      cashFlows[month + 1] += taxAnnual;
      schedule.push({year, contribution:plan.annual, support, tax:taxAnnual, account});
    }
  }
  cashFlows[months] += account;
  const taxTotal = taxAnnual * plan.years, investment = account - plan.personal - plan.support;
  return {
    available:true, account, personal:plan.personal, support:plan.support,
    investment:Math.abs(investment) < 1e-7 ? 0 : investment, taxTotal,
    additional:account + taxTotal - plan.personal,
    annualized:annualIrr(cashFlows), cashFlows, schedule, investmentRatePercent, period
  };
}
