// Scenario model for a new personal PDS contract, not a payment instruction.
export function minimumTaxYears(year) {
  if (!Number.isInteger(year) || year < 2024) throw new Error('Некорректный год договора');
  return Math.min(10, 5 + Math.max(0, year - 2026));
}

export function calculatePds(input, config) {
  const annual = Number(input.annual), years = Number(input.years), year = Number(input.contractYear);
  if (!Number.isFinite(annual) || annual < 0 || annual > 1e9) throw new Error('Укажите годовой взнос от 0 до 1 млрд ₽');
  if (!Number.isInteger(years) || years < 1 || years > 30) throw new Error('Укажите срок от 1 до 30 лет');
  const minimum = minimumTaxYears(year);
  const band = input.income || null;
  if (band !== null && !Object.hasOwn(config.support.divisors, band)) throw new Error('Выберите группу дохода');
  const age = input.age === '' || input.age == null ? null : Number(input.age);
  if (age !== null && (!Number.isInteger(age) || age < 18 || age > 110)) throw new Error('Укажите возраст от 18 до 110 лет');
  const sex = input.sex || null;
  if (sex !== null && !['female', 'male'].includes(sex)) throw new Error('Укажите пол');
  const ageWait = age !== null && sex ? Math.max(0, config.payments.ages[sex] - age) : null;
  const wait = Math.min(config.payments.years, ageWait ?? config.payments.years);
  const annualSupport = band === null ? null : annual < config.support.minimumAnnual ? 0 : Math.min(config.support.annualCap, annual / config.support.divisors[band]);
  const supportYears = Math.min(years, config.support.years);
  const taxAnnual = Math.min(annual, config.tax.annualContributionLimit) * config.tax.scenarioRate;
  return {
    annual, years, contractYear: year, personal: annual * years,
    supportAnnual: annualSupport, supportYears,
    support: annualSupport === null ? null : annualSupport * supportYears,
    minimumTaxYears: minimum, taxAnnual, taxPotential: taxAnnual * years,
    taxTermMet: years >= minimum, taxRemaining: Math.max(0, minimum - years),
    // This is a conditional ceiling, not an entitlement or the PDS account balance.
    taxRetainedCeiling: years >= minimum ? taxAnnual * years : 0,
    ageWait, wait, ageMetNow: ageWait === 0, eligibleAtEnd: years >= wait,
    guaranteeCycles: Math.floor(years / config.guarantee.years),
    conditions: {
      supportMinimum:config.support.minimumAnnual, supportCap:config.support.annualCap,
      supportYears:config.support.years, supportDivisor:band ? config.support.divisors[band] : null,
      taxLimit:config.tax.annualContributionLimit, taxRate:config.tax.scenarioRate,
      guaranteeYears:config.guarantee.years
    }
  };
}
