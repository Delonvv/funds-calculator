import {assert, close, json} from './core.mjs';
import {calculatePds} from '../scripts/pds-model.mjs';
import {projectPdsScenario,scenarioAnniversary} from '../scripts/pds-scenario.mjs';
const DAY=86400000,at=date=>Date.parse(date+'T00:00:00Z');

export async function pdsScenarioFinancialChecks(check) {
  await check('finance/pds-scenario','ПДС: календарный инвестдоход, датированные доплаты и два годовых показателя',async()=>{
    const config=await json('pds-config.json');
    const base={annual:50000,years:5,income:'low',age:56,sex:'female',contractYear:2026};
    const calc=(changes={},options={})=>{const plan=calculatePds({...base,...changes},config);return projectPdsScenario(plan,{startDate:plan.contractYear+'-11-13',...options});};
    const five=calc();
    close(five.account,570270.4917963649,1e-6);close(five.taxTotal,32500);close(five.support,180000);
    close(five.annualized,.330317094492956,1e-10);close(five.simpleAnnual,.47018889722721635,1e-10);
    // Independent sum of dated future values; income stops before 2031.
    const cutoff=at('2031-01-01');let expected=0;
    for(let year=2026;year<=2030;year++)expected+=50000*1.15**((cutoff-at(year+'-11-13'))/DAY/365);
    for(let year=2027;year<=2031;year++)expected+=36000*1.15**(Math.max(0,cutoff-at(year+'-07-31'))/DAY/365);
    close(five.account,expected,1e-6);
    close(five.cashFlows.reduce((sum,cash,i)=>sum+cash/(1+five.annualized)**((at(five.cashFlowDates[i])-at(five.startDate))/DAY/365),0),0,1e-5);
    close(five.simpleAnnual,five.averageAnnualGain/five.averageInvested,1e-12);
    const one=calc({annual:150000,years:1,income:'high'});
    assert(one.lastIncomeDate==='2026-12-31'&&one.endDate==='2027-11-13','One-year cutoff is not previous calendar year');
    close(one.investment,150000*(1.15**(49/365)-1),1e-6);
    close(one.investment,2840.9527532152133,1e-6);close(one.support,36000);close(one.taxTotal,0);
    const two=calc({years:2});assert(two.lastIncomeDate==='2027-12-31','Second completed calendar year missing');
    close(calc({}, {investmentRatePercent:0}).account,430000,1e-6);
    const monthly=calc({}, {period:'monthly'});
    close(monthly.personal,250000,1e-6);close(monthly.account,506894.0355944837,1e-6);
    close(monthly.support,152333.33333333334,1e-6);close(monthly.taxTotal,27083.333333333332,1e-6);
    const later=calc({contractYear:2027});close(later.taxTotal,0);assert(!later.taxTermMet,'2027 contract ignores six-year minimum');
    const zero=calc({annual:0});close(zero.account,0);assert(zero.annualized===null&&zero.simpleAnnual===null,'Zero contributions have a yield');
    assert(!calc({income:''}).available,'Unknown income invented');
    close(calc({years:11}).support,360000);close(calc({annual:1000000}).taxTotal,260000);
    const loss=calc({annual:150000,years:1},{investmentRatePercent:-20});close(loss.investment,150000*(.8**(49/365)-1),1e-6);
    const long=calc({annual:400000,years:10,income:'high'});
    close(long.personal,4000000);close(long.taxTotal,520000);close(long.support,360000);
    close(long.account,8955935.516842514,1e-5);close(long.annualized,.16410212189064122,1e-10);
    close(long.simpleAnnual,.24868318116352928,1e-10);close(long.averageAnnualGain,547143.8444148693,1e-5);
    const noTaxConfig=structuredClone(config);noTaxConfig.tax.scenarioRate=0;
    const noTax=projectPdsScenario(calculatePds(base,noTaxConfig),{startDate:'2026-11-13'});
    close(noTax.account,five.account,1e-6);assert(noTax.annualized<five.annualized,'Tax returned separately was not included in IRR');
    for(const options of [{investmentRatePercent:NaN},{investmentRatePercent:101},{investmentRatePercent:-101},{period:'weekly'},{startDate:'2026-02-30'},{startDate:'2022-11-13'},{endDate:'2026-11-12'},{endDate:'2057-11-13'},{firstBenefitDate:'2026-07-31'}]){
      let rejected=false;try{calc({},options);}catch{rejected=true;}assert(rejected,'Invalid date/rate accepted');
    }
  });
  await check('finance/pds-calendar-boundaries','ПДС: границы года, полгода, поздние доплаты и високосный день',async()=>{
    const config=await json('pds-config.json');
    const base={annual:150000,years:1,income:'low',age:55,sex:'female',contractYear:2026};
    const calc=options=>projectPdsScenario(calculatePds(base,config),options);
    const half=calc({startDate:'2026-12-31',endDate:'2027-07-01',firstBenefitDate:'2027-07-01',investmentRatePercent:0});
    close(half.additional,36000);close(half.simpleAnnual,.24*365/182,1e-12);
    close(half.annualized,1.24**(365/182)-1,1e-10);assert(!half.taxTermMet,'Half-year exit retains tax');
    const early=calc({startDate:'2026-12-31',endDate:'2027-06-30',firstBenefitDate:'2027-07-01',investmentRatePercent:0});
    close(early.support,0);close(early.supportPotential,36000);close(early.additional,0);
    const january=calc({startDate:'2026-01-01'});close(january.investment,22500,1e-6);close(january.support,0);
    const sameYear=projectPdsScenario(calculatePds({...base,contractYear:2027},config),{startDate:'2027-01-01',endDate:'2027-07-01'});
    close(sameYear.investment,0);close(sameYear.support,0);assert(sameYear.lastIncomeDate==='2026-12-31','Exit year investment included');
    assert(scenarioAnniversary('2028-02-29',1)==='2029-02-28','Leap anniversary invalid');
    const leap=projectPdsScenario(calculatePds({...base,contractYear:2028},config),{startDate:'2028-01-01'});
    close(leap.investment,150000*(1.15**(366/365)-1),1e-6);close(leap.annualized,.15,1e-10);
    const monthly=calc({startDate:'2026-01-31',period:'monthly'});
    assert(monthly.cashFlowDates.includes('2026-02-28')&&monthly.cashFlowDates.includes('2026-03-31'),'Month-end schedule drifts');
    const beforeFifteen=projectPdsScenario(calculatePds({...base,years:15,age:30},config),{startDate:'2026-11-13',endDate:'2041-11-12'});
    assert(!beforeFifteen.eligibleAtEnd,'365-day basis grants legal 15-year right before its calendar anniversary');
  });
}

export async function pdsScenarioBrowserChecks(test) {
  const show=async page=>{await page.clock.setFixedTime(new Date('2026-11-13T09:00:00Z'));await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-page=pds]').click();await page.locator('#pdsForm').waitFor();};
  await test('browser/pds-scenario','ПДС: календарные даты, простая ставка и IRR, раскрытие и ошибки',async page=>{
    await show(page);
    assert(!await page.locator('#pdsScenarioTotals').isVisible(),'Unknown income shows invented result');
    await page.locator('#pdsAmount').fill('50000');await page.locator('#pdsIncome').selectOption('low');await page.locator('#pdsForm button[type=submit]').click();
    await page.locator('#pdsScenarioDetailsToggle').click();
    assert(await page.locator('#pdsScenarioEnd').inputValue()==='2031-11-13','Default five-year exit precedes tax anniversary');
    assert((await page.locator('#pdsTax').textContent()).includes('32 500'),'Default five-year plan excludes refund');
    assert((await page.locator('#pdsScenarioAnnual').textContent()).includes('47%'),'Simple rate wrong');
    assert((await page.locator('#pdsScenarioIrrBadge').textContent()).includes('33%'),'IRR confused with simple rate');
    assert((await page.locator('#pdsScenarioAccount').textContent()).includes('570 270'),'Account wrong');
    assert((await page.locator('#pdsScenarioAdditional').textContent()).includes('352 770'),'Additional result wrong');
    await page.locator('[data-pds-period=monthly]').click();assert((await page.locator('#pdsScenarioAccount').textContent()).includes('506 894'),'Calendar monthly flows ignored');await page.locator('[data-pds-period=annual]').click();
    if(await page.locator('#pdsBreakdown').getAttribute('open')===null)await page.locator('#pdsScenarioDetailsToggle').click();await page.waitForFunction(()=>document.querySelector('#pdsBreakdown').open);
    assert(await page.locator('#pdsScenarioStart').inputValue()==='2026-11-13','Start not Moscow today');
    assert((await page.locator('#pdsScenarioCalendar').textContent()).includes('31.12.2030'),'Cutoff not visible');
    await page.locator('#pdsScenarioRate').fill('0');assert((await page.locator('#pdsScenarioAccount').textContent()).includes('430 000'),'Rate assumption ignored');
    await page.locator('#pdsScenarioRate').fill('15');await page.locator('#pdsYears').fill('1');await page.locator('#pdsAmount').fill('150000');await page.locator('#pdsForm button[type=submit]').click();
    assert((await page.locator('#pdsScenarioCalendar').textContent()).includes('31.12.2026'),'One-year case includes exit-year income');
    assert((await page.locator('#pdsBreakdownInvestment').textContent()).includes('2 841'),'Full-year interest still paid in one-year example');
    assert((await page.locator('#pdsScenarioAccount').textContent()).includes('188 841'),'One-year account wrong');
    await page.locator('#pdsScenarioRate').fill('101');assert(!await page.locator('#pdsScenarioTotals').isVisible(),'Invalid rate leaves stale results');await page.locator('#pdsScenarioRate').fill('15');
    await page.locator('#pdsAmount').fill('0');await page.locator('#pdsForm button[type=submit]').click();assert((await page.locator('#pdsScenarioPrompt').textContent()).includes('нулевых'),'Undefined rate not explained');
  });
  await test('browser/pds-september-default','ПДС: сентябрь по умолчанию, ручная дата и точный налоговый срок',async page=>{
    await show(page);await page.locator('#pdsAmount').fill('150000');await page.locator('#pdsIncome').selectOption('low');await page.locator('#pdsYears').fill('1');await page.locator('#pdsForm button[type=submit]').click();
    await page.locator('#pdsScenarioDetailsToggle').click();
    assert(await page.locator('#pdsScenarioEnd').inputValue()==='2027-09-01','One-year default still anniversary');
    assert((await page.locator('#pdsAssumption').textContent()).includes('292 дней'),'Default holding time wrong');
    assert((await page.locator('#pdsScenarioAnnual').textContent()).includes('32,4%'),'September rate uses old full year');
    await page.locator('#pdsScenarioEnd').fill('2027-07-01');
    assert(await page.locator('#pdsScenarioEnd').inputValue()==='2027-07-01','Manual exit overridden');
    await page.locator('#pdsScenarioRate').fill('14');assert(await page.locator('#pdsScenarioEnd').inputValue()==='2027-07-01','Recalculation resets manual date');
    await page.locator('#pdsYears').fill('2');await page.locator('#pdsForm button[type=submit]').click();
    assert(await page.locator('#pdsScenarioEnd').inputValue()==='2028-09-01','Term change does not restore September default');
    await page.locator('#pdsYears').fill('5');await page.locator('#pdsForm button[type=submit]').click();
    assert(await page.locator('#pdsScenarioEnd').inputValue()==='2031-11-13','Five-year default precedes complete minimum term');
    assert((await page.locator('#pdsTax').textContent()).includes('97 500'),'Five-year default excludes refund');
    assert(await page.locator('#pdsGuarantee').textContent()==='Пятилетний период','Five-year default does not complete guarantee period');
    await page.locator('#pdsScenarioEnd').fill('2031-11-12');
    assert((await page.locator('#pdsTax').textContent()).includes('не сохраняется'),'Manual date one day before minimum retains tax');
    await page.locator('#pdsYears').fill('6');await page.locator('#pdsForm button[type=submit]').click();
    assert(await page.locator('#pdsScenarioEnd').inputValue()==='2032-09-01','Longer plan lost September exit');
    await page.locator('#pdsScenarioStart').fill('2027-11-13');
    assert(await page.locator('#pdsScenarioEnd').inputValue()==='2033-11-13','2027 contract ignores six-year minimum');
    await page.locator('#pdsYears').fill('5');await page.locator('#pdsForm button[type=submit]').click();
    assert(await page.locator('#pdsScenarioEnd').inputValue()==='2032-09-01','Shorter 2027 plan unexpectedly extended');
    assert((await page.locator('#pdsTax').textContent()).includes('не сохраняется'),'Five years incorrectly sufficient for 2027 contract');
  });
  await test('browser/pds-half-year','ПДС: 36 тысяч на 150 тысяч за полгода — простой эффект и проверка даты доплаты',async page=>{
    await show(page);await page.locator('#pdsAmount').fill('150000');await page.locator('#pdsIncome').selectOption('low');await page.locator('#pdsYears').fill('1');await page.locator('#pdsForm button[type=submit]').click();
    await page.locator('#pdsScenarioDetailsToggle').click();
    await page.locator('#pdsScenarioStart').fill('2026-12-31');await page.locator('#pdsScenarioEnd').fill('2027-07-01');await page.locator('#pdsScenarioBenefit').fill('2027-07-01');await page.locator('#pdsScenarioRate').fill('0');
    assert((await page.locator('#pdsScenarioAnnual').textContent()).includes('48,1%'),'Half-year simple equivalent wrong');
    assert((await page.locator('#pdsScenarioIrrBadge').textContent()).includes('53,9%'),'Half-year compound equivalent wrong');
    assert((await page.locator('#pdsBreakdownTax').textContent()).includes('0 ₽'),'Half-year tax benefit included');
    await page.locator('#pdsScenarioEnd').fill('2027-06-30');assert((await page.locator('#pdsBreakdownSupport').textContent()).includes('до 0 ₽'),'Unreceived support included');
    await page.locator('#pdsScenarioEnd').fill('2026-01-01');assert(!await page.locator('#pdsScenarioTotals').isVisible(),'Invalid chronology leaves results');
  });
  await test('browser/pds-scenario-refresh','ПДС: обновление сохраняет ставку, даты и раскрытие',async page=>{
    await show(page);await page.locator('#pdsAmount').fill('50000');await page.locator('#pdsIncome').selectOption('low');
    await page.locator('#pdsScenarioDetailsToggle').click();await page.locator('#pdsScenarioRate').fill('0');
    const config=await json('pds-config.json');config.support.annualCap=30000;await page.route('**/pds-config.json?refresh=*',r=>r.fulfill({json:config}));
    await page.evaluate(()=>{window.showProductPage('funds');window.showProductPage('pds');});
    await page.waitForFunction(()=>document.querySelector('#pdsScenarioAccount').textContent.includes('400 000'));
    assert(await page.locator('#pdsScenarioRate').inputValue()==='0','Rate reset');assert(await page.locator('#pdsScenarioStart').inputValue()==='2026-11-13','Date reset');assert(await page.locator('#pdsBreakdown').getAttribute('open')!==null,'Breakdown closed');
  });
}
