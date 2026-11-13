import {assert, close, json} from './core.mjs';
import {calculatePds} from '../scripts/pds-model.mjs';
import {projectPdsScenario} from '../scripts/pds-scenario.mjs';

export async function pdsScenarioFinancialChecks(check) {
  await check('finance/pds-scenario','ПДС: накопления, отдельный НДФЛ и годовые по денежным потокам',async()=>{
    const config=await json('pds-config.json');
    const base={annual:50000,years:5,income:'low',age:56,sex:'female',contractYear:2026};
    const calc=(changes={},options={})=>projectPdsScenario(calculatePds({...base,...changes},config),options);
    const five=calc();
    close(five.account,630412.646875,1e-6);close(five.investment,200412.646875,1e-6);
    close(five.taxTotal,32500);close(five.additional,412912.646875,1e-6);
    close(five.annualized,0.3637738476455156,1e-10);
    // Independent annuity-due + end-of-year support formula.
    const g=1.15,annuity=(g**5-1)/(g-1);
    close(five.account,50000*g*annuity+36000*annuity,1e-6);
    close(five.cashFlows.reduce((sum,value,month)=>sum+value/(1+five.annualized)**(month/12),0),0,1e-5);
    const short=calc({years:3});
    close(short.account,324678.75,1e-6);close(short.taxTotal,0);close(short.annualized,0.4394049101287758,1e-10);
    close(calc({years:1}).annualized,0.87,1e-10);
    const later=calc({contractYear:2027});close(later.taxTotal,0);close(later.account,five.account,1e-6);
    assert(later.annualized<five.annualized,'Tax is reinvested or ignored in IRR');
    const monthly=calc({}, {period:'monthly'}),f=g**(1/12);
    close(monthly.account,50000/12*f*(f**60-1)/(f-1)+36000*annuity,1e-6);
    close(monthly.account,606651.0377472878,1e-6);close(monthly.taxTotal,32500);
    assert(monthly.account<five.account&&monthly.annualized>five.annualized,'Monthly contribution timing ignored');
    close(calc({income:'high'}).account,50000*g*annuity+12500*annuity,1e-6);
    close(calc({}, {investmentRatePercent:0}).account,430000,1e-6);
    close(calc({annual:1999,years:3},{investmentRatePercent:0}).annualized,0,1e-10);
    close(calc({annual:1999,years:3}).annualized,0.15,1e-10);
    close(calc({annual:1999,years:3},{investmentRatePercent:-100}).annualized,-1,1e-10);
    const zero=calc({annual:0});close(zero.account,0);close(zero.additional,0);assert(zero.annualized===null,'Undefined zero-contribution IRR reported as a rate');
    assert(!calc({income:''}).available,'Unknown income invented');
    const eleven=calc({years:11});close(eleven.support,360000);close(eleven.schedule[10].support,0);
    close(calc({annual:1000000}).taxTotal,260000);
    const loss=calc({}, {investmentRatePercent:-20});assert(loss.investment<0,'Loss scenario silently compensated');
    for(const options of [{investmentRatePercent:NaN},{investmentRatePercent:Infinity},{investmentRatePercent:-100.1},{investmentRatePercent:101},{period:'weekly'}]){
      let rejected=false;try{calc({},options);}catch{rejected=true;}assert(rejected,'Invalid scenario accepted');
    }
  });
}

export async function pdsScenarioBrowserChecks(test) {
  await test('browser/pds-scenario','ПДС: сценарный итог, раскрытие состава, изменение ставки и срока',async page=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('[data-page=pds]').click();await page.locator('#pdsForm').waitFor();
    assert(!(await page.locator('#pdsScenarioTotals').isVisible()),'Unselected income shows invented result');
    assert((await page.locator('#pdsScenarioPrompt').textContent()).includes('Выберите доход'),'Unknown-income prompt missing');
    await page.locator('#pdsAmount').fill('50000');await page.locator('#pdsIncome').selectOption('low');
    await page.locator('#pdsForm button[type=submit]').click();
    assert((await page.locator('#pdsScenarioAnnual').textContent()).includes('36,4%'),'Scenario rate wrong');
    assert((await page.locator('#pdsScenarioAccount').textContent()).includes('630 413'),'Account result wrong');
    assert((await page.locator('#pdsScenarioAdditional').textContent()).includes('412 913'),'Additional result wrong');
    await page.locator('[data-pds-period=monthly]').click();
    assert((await page.locator('#pdsScenarioAccount').textContent()).includes('606 651'),'Monthly timing not applied');
    assert((await page.locator('#pdsScenarioAnnual').textContent()).includes('41,3%'),'Monthly IRR wrong');
    await page.locator('[data-pds-period=annual]').click();
    const details=page.locator('#pdsBreakdown'),toggle=page.locator('#pdsScenarioDetailsToggle');
    assert(await details.getAttribute('open')===null,'Breakdown open by default');
    await toggle.click();await page.waitForFunction(()=>document.querySelector('#pdsBreakdown').open&&document.querySelector('#pdsScenarioDetailsToggle').getAttribute('aria-expanded')==='true');
    assert(await details.evaluate(x=>x.getBoundingClientRect().top>=0&&x.getBoundingClientRect().top<innerHeight),'Breakdown not scrolled into view');
    assert((await page.locator('#pdsBreakdownTax').textContent()).includes('32 500'),'Tax missing from breakdown');
    await page.locator('#pdsScenarioRate').fill('0');
    assert((await page.locator('#pdsScenarioAccount').textContent()).includes('430 000'),'Investment assumption not applied');
    await page.locator('#pdsScenarioRate').fill('15');
    await page.locator('#pdsYears').fill('3');await page.locator('#pdsForm button[type=submit]').click();
    assert((await page.locator('#pdsScenarioAnnual').textContent()).includes('43,9%'),'Short scenario wrong');
    assert((await page.locator('#pdsScenarioAdditional').textContent()).includes('174 679'),'Early-exit tax included');
    assert((await page.locator('#pdsBreakdownTax').textContent()).includes('0 ₽'),'Early-exit tax retained');
    await page.locator('#pdsScenarioRate').fill('101');
    assert(!await page.locator('#pdsScenarioTotals').isVisible(),'Invalid assumption leaves stale totals');
    assert((await page.locator('#pdsScenarioAnnual').textContent())==='—','Invalid assumption leaves stale rate');
    await page.locator('#pdsScenarioRate').fill('15');
    await page.locator('#pdsAmount').fill('0');await page.locator('#pdsForm button[type=submit]').click();
    assert((await page.locator('#pdsScenarioPrompt').textContent()).includes('нулевых'),'Zero investment pretends to have an IRR');
    await details.locator('summary').first().click();
    await page.waitForFunction(()=>document.querySelector('#pdsScenarioDetailsToggle').getAttribute('aria-expanded')==='false');
  });
  await test('browser/pds-scenario-refresh','ПДС: обновление условий сохраняет допущение и раскрытую расшифровку',async page=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('[data-page=pds]').click();await page.locator('#pdsForm').waitFor();
    await page.locator('#pdsAmount').fill('50000');await page.locator('#pdsIncome').selectOption('low');
    await page.locator('#pdsScenarioDetailsToggle').click();await page.locator('#pdsScenarioRate').fill('0');
    const config=await json('pds-config.json');config.support.annualCap=30000;
    await page.route('**/pds-config.json?refresh=*',r=>r.fulfill({json:config}));
    await page.evaluate(()=>{window.showProductPage('funds');window.showProductPage('pds');});
    await page.waitForFunction(()=>document.querySelector('#pdsScenarioAccount').textContent.includes('400 000'));
    assert(await page.locator('#pdsScenarioRate').inputValue()==='0','Updated terms reset scenario assumption');
    assert(await page.locator('#pdsBreakdown').getAttribute('open')!==null,'Updated terms closed breakdown');
  });
}
