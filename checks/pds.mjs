import {assert, close, json} from './core.mjs';
import {calculatePds, minimumTaxYears} from '../scripts/pds-model.mjs';

export async function pdsFinancialChecks(check) {
  await check('finance/pds', 'ПДС: коэффициенты, лимиты, налоговый срок и возраст отдельно', async () => {
    const config = await json('pds-config.json');
    const base = {annual:36000, years:5, income:'low', age:56, sex:'female', contractYear:2026};
    const calc = changes => calculatePds({...base, ...changes}, config);
    const five = calc({});
    close(five.personal, 180000); close(five.support, 180000); close(five.taxPotential, 23400);
    assert(five.ageMetNow && five.taxTermMet && five.guaranteeCycles === 1, 'Five-year conditions mixed');
    const two = calc({age:53, years:2});
    assert(!two.ageMetNow && two.eligibleAtEnd && two.wait === 2, 'Age forecast wrong');
    close(two.support, 72000); close(two.taxRetainedCeiling, 0);
    assert(!two.taxTermMet && two.taxRemaining === 3 && two.guaranteeCycles === 0, 'Two-year withdrawal preserves tax benefit');
    assert(!calc({age:30}).eligibleAtEnd, 'Five years falsely grants payout right');
    assert(calc({age:30, years:15}).eligibleAtEnd, '15-year right missing');
    assert(calc({age:59, sex:'male'}).wait === 1 && !calc({age:59, sex:'male'}).ageMetNow, 'Male threshold wrong');
    assert(calc({age:60, sex:'male'}).ageMetNow, 'Male age right missing');
    assert(calc({age:'', sex:''}).ageWait === null, 'Unknown age invented');
    assert(calc({income:''}).support === null, 'Unknown income invented');
    close(calc({income:'middle'}).supportAnnual, 18000); close(calc({income:'high'}).supportAnnual, 9000);
    close(calc({annual:1999}).support, 0); close(calc({annual:2000}).supportAnnual, 2000);
    close(calc({annual:1000000, income:'high', years:30}).support, 360000);
    close(calc({annual:1000000}).taxAnnual, 52000);
    close(calc({annual:0}).personal, 0); close(calc({annual:0}).taxPotential, 0);
    assert(minimumTaxYears(2026) === 5 && minimumTaxYears(2027) === 6 && minimumTaxYears(2028) === 7 && minimumTaxYears(2031) === 10 && minimumTaxYears(2035) === 10, 'Transition tax periods wrong');
    assert(!calc({contractYear:2027}).taxTermMet, '2027 contract incorrectly uses five years');
    for (const changes of [{annual:-1},{annual:NaN},{annual:Infinity},{annual:1e9+1},{years:0},{years:2.5},{years:31},{age:17},{age:111},{income:'bad'}]) {
      let rejected=false;try {calc(changes);}catch {rejected=true;}assert(rejected, 'Invalid PDS parameters accepted');
    }
    assert(config.promo.nominalPercent === 15 && config.promo.capitalizedPercent === 16.07 && config.promo.maximumBoostedAmount === 1000000 && config.promo.sourceSha256 === '48b121a16eb3c3b1331f9722868f7d0073c45ad63a739bcf0b16812e60b0660f', 'Promo differs from supplied PDF');
  });
}

export async function pdsBrowserChecks(test) {
  const show = async page => {await page.locator('[data-page="pds"]').click();await page.locator('#pdsForm').waitFor();};
  await test('browser/pds-initial-refresh', 'ПДС: поздняя начальная загрузка не сбрасывает заполненные поля', async page => {
    let release;
    const gate=new Promise(resolve=>{release=resolve;});
    await page.route('**/pds-config.json?v=*',async route=>{await gate;await route.continue();});
    try {
      await show(page);
      await page.locator('#pdsIncome').selectOption('low');
      await page.locator('#pdsAge').fill('56');await page.locator('#pdsSex').selectOption('female');
      release();await page.waitForLoadState('networkidle');
      assert(await page.locator('#pdsAge').inputValue()==='56' && await page.locator('#pdsSex').inputValue()==='female','Initial response reset client fields');
      assert(await page.locator('#pdsStatus').getAttribute('data-state')==='met','Initial response reset eligibility');
    } finally {release();}
  });
  await test('browser/pds', 'ПДС: навигация, месячный/годовой взнос, возраст и льготы', async page => {
    await page.locator('[data-page="pds"]').waitFor();
    assert(await page.locator('[data-page="pds"]').evaluate(x=>x.nextElementSibling.classList.contains('smart-sales-nav')), 'PDS is not left of Smart Sales');
    await show(page);
    assert(await page.locator('.product-page.active').getAttribute('id') === 'pdsPage', 'PDS route inactive');
    assert(await page.locator('#pdsIncome').inputValue() === '' && (await page.locator('#pdsSupport').textContent()).includes('Укажите'), 'Income assumption hidden');
    await page.locator('#pdsIncome').selectOption('low');
    assert(await page.locator('#pdsAge').isVisible() && await page.locator('#pdsSex').isVisible(), 'Client fields hidden');
    assert(await page.locator('.pds-parameter-fields input,.pds-parameter-fields select').count() === 2, 'Unexpected personal fields');
    await page.locator('#pdsAge').fill('56');await page.locator('#pdsSex').selectOption('female');
    assert(await page.locator('#pdsStatus').getAttribute('data-state') === 'met', 'No fulfilled-age highlight');
    assert((await page.locator('#pdsSupport').textContent()).includes('180 000'), 'Five-year support wrong');
    assert((await page.locator('#pdsTax').textContent()).includes('23 400'), 'Five-year tax wrong');
    await page.locator('[data-pds-period="monthly"]').click();
    assert((await page.locator('#pdsAmount').inputValue()).replace(/\s/g,'') === '3000', 'Monthly conversion wrong');
    await page.locator('[data-pds-period="annual"]').click();
    assert((await page.locator('#pdsAmount').inputValue()).replace(/\s/g,'') === '36000', 'Annual conversion drift');
    await page.locator('#pdsYears').fill('2');await page.locator('#pdsAge').fill('53');
    await page.locator('#pdsForm button[type="submit"]').click();
    assert(await page.locator('#pdsStatus').getAttribute('data-state') === 'future', 'Future condition shown as already met');
    assert((await page.locator('#pdsEligibility').textContent()).includes('через 2'), 'Age wait missing');
    assert((await page.locator('#pdsTax').textContent()).includes('не сохраняется'), 'Early-exit tax condition missing');
    await page.locator('.pds-incomes summary').click();
    assert((await page.locator('.pds-incomes').textContent()).includes('НПД'), 'Income explanation missing');
    assert((await page.locator('.pds-incomes').locator('..').locator('h3').textContent())==='Налоговый возврат', 'Income help detached from tax result');
    await page.locator('#pdsAmount').fill('-10');await page.locator('#pdsForm button[type="submit"]').click();
    assert(await page.locator('#pdsError').textContent(), 'Invalid amount silently accepted');
    assert(!await page.locator('#pdsBenefits').isVisible(), 'Stale results remain after invalid input');
    await page.locator('[data-page="funds"]').click();
    assert(await page.locator('#grid>.card').count() === 22, 'PDS changed catalogue');
    await page.evaluate(()=>window.showProductPage('model'));
    assert(await page.locator('#modelPage').isVisible(), 'Model navigation broken');
  });
  await test('browser/pds-promo', 'ПДС + вклад: точные условия, тихая кнопка и раскрытие', async page => {
    await show(page);
    const promo=page.locator('#pdsPromo');
    assert(await promo.getAttribute('open') === null, 'Promo opens automatically');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('#pdsPromoShortcut').click();
    assert(await promo.getAttribute('open') !== null, 'Top shortcut did not open promotion');
    await page.waitForFunction(()=>document.activeElement === document.querySelector('#pdsPromo>summary') && document.querySelector('#pdsPromo').getBoundingClientRect().top < innerHeight);
    const text=await promo.textContent();
    for(const value of ['15%','16,07%','1 000 000','50 000','10 дней','3 дней','150 000','базовой'])assert(text.includes(value), 'Missing promo term '+value);
    assert(await promo.locator('a').first().getAttribute('href') === 'https://cdn.tbank.ru/static/documents/promo-increased-rate-deposit-for-active-participation-long-savings-program.pdf', 'Wrong legal terms link');
    await page.locator('#pdsMemo summary').click();
    assert(!(await page.locator('#pdsMemo').textContent()).includes('Вечный портфель'), 'Unprovided sales points added');
    await page.reload({waitUntil:'networkidle'});
    await page.locator('#pdsForm').waitFor();
    assert(await page.locator('.product-page.active').getAttribute('id') === 'pdsPage', 'PDS deep link failed');
    assert(await page.locator('#pdsPromo').getAttribute('open') === null, 'Disclosure state persisted unexpectedly');
  });
  await test('browser/pds-mobile', 'ПДС: обе темы, адаптация и клавиатура', async page => {
    await show(page);
    for (const theme of ['brand','dark']) for (const width of [360,390,768,1440]) {
      await page.evaluate(t=>window.setTheme(t),theme);await page.setViewportSize({width,height:900});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), 'PDS document overflow');
      await page.locator('#pdsForm').scrollIntoViewIfNeeded();
      await page.locator('#pdsAmount').fill('36000');
      await page.locator('#pdsForm button[type="submit"]').click();
      assert(await page.locator('#pdsSupport').isVisible(), 'Mobile results missing');
      assert(await page.locator('.pds-period').evaluate(x=>x.getBoundingClientRect().right<=innerWidth), 'Period toggle outside screen');
      assert(await page.locator('#pdsAge').isVisible() && await page.locator('#pdsSex').isVisible(), 'Client parameters require discovery');
      const layout=await page.locator('.pds-layout').evaluate(x=>{const form=x.querySelector('form').getBoundingClientRect(),result=x.querySelector('.pds-results').getBoundingClientRect();return {formRight:form.right,formBottom:form.bottom,formTop:form.top,resultLeft:result.left,resultTop:result.top};});
      if(width===1440)assert(layout.resultLeft>=layout.formRight+20&&Math.abs(layout.formTop-layout.resultTop)<2,'Desktop panels not aligned');
      else assert(layout.resultTop>=layout.formBottom+18,'Mobile form and results overlap');
    }
    await page.locator('#pdsAge').focus();await page.keyboard.press('Tab');
    assert(await page.locator('#pdsSex').evaluate(x=>x===document.activeElement), 'Client keyboard navigation failed');
    const surface=()=>page.evaluate(()=>({body:getComputedStyle(document.body).background,header:getComputedStyle(document.querySelector('body>header')).background}));
    for(const theme of ['brand','dark']){
      await page.evaluate(t=>window.setTheme(t),theme);
      await page.evaluate(()=>window.showProductPage('funds'));const original=await surface();
      await page.evaluate(()=>window.showProductPage('pds'));
      assert(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor===getComputedStyle(document.querySelector('body>header')).backgroundColor),'PDS header and canvas have a harsh colour boundary');
      await page.evaluate(()=>window.showProductPage('funds'));
      assert(JSON.stringify(await surface())===JSON.stringify(original),'PDS background leaked into another section');
    }
  });
  await test('browser/pds-json', 'ПДС: сбой и некорректные условия не дают ложного расчёта', async page => {
    await page.route('**/pds-config.json?*', route=>route.fulfill({status:503,body:'Unavailable'}));
    await page.locator('[data-page="pds"]').click();
    await page.locator('#pdsRetry').waitFor();
    assert(await page.locator('#pdsForm').count() === 0, 'Fallback invented financial data');
    await page.route('**/pds-config.json?*',route=>route.fulfill({contentType:'application/json',body:'{"schemaVersion":1}'}));
    const response = page.waitForResponse(r=>r.url().includes('pds-config.json'));
    await page.locator('#pdsRetry').click();
    await response;
    await page.locator('#pdsRetry').waitFor();
    assert(await page.locator('#pdsForm').count() === 0, 'Invalid config accepted');
    await page.unroute('**/pds-config.json?*');await page.locator('#pdsRetry').click();
    await page.locator('#pdsForm').waitFor();
    await page.locator('[data-page="taccount"]').click();
    assert(await page.locator('#taccountPage').isVisible(), 'Recovery broke other pages');
  });
}
