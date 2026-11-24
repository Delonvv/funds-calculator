import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assert} from './core.mjs';
import {PDS_LUMP_SUM_MEMO as memo} from '../scripts/pds-lump-sum.mjs';

export async function pdsLumpSumFinancialChecks(check) {
  await check('finance/pds-lump-memo','ПДС: 42 строки памятки, оба года, формула и исходный PDF',async()=>{
    for(const [sex,first] of [['female',55],['male',60]]) {
      const rows=memo.rows[sex];assert(rows.length===21,'Memo rows missing');
      rows.forEach(([age,coefficient,y26,y27],i)=>{
        assert(age===first+i&&Number.isFinite(coefficient)&&coefficient>0,'Invalid age/coefficient');
        assert(Math.round(16288*.1*coefficient)===y26,'2026 threshold differs from memo formula');
        assert(Math.round(17395*.1*coefficient)===y27,'2027 project differs from memo formula');
      });
    }
    const male=memo.rows.male.find(x=>x[0]===63),female=memo.rows.female.find(x=>x[0]===55);
    assert(male[2]===314086&&male[3]===335433,'Male example differs from PDF');
    assert(female[2]===536768&&female[3]===573249,'Female example differs from PDF');
    assert(memo.periods.length===2&&memo.periods[1].year===2027&&memo.periods[1].status==='project','Draft treated as final or invented later years');
    const pdf=await fs.readFile(new URL('../'+memo.sourceFile,import.meta.url));
    assert(createHash('sha256').update(pdf).digest('hex')===memo.sourceSha256,'Original memo PDF changed');
  });
}
export async function pdsLumpSumBrowserChecks(test) {
  await test('browser/pds-lump-memo','ПДС: памятка по выходу, две таблицы, PDF и мобильная прокрутка',async page=>{
    await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-page=pds]').click();await page.locator('#pdsForm').waitFor();
    assert(await page.locator('#pdsLumpSum').getAttribute('open')===null,'Memo takes over initial screen');
    await page.locator('#pdsClientParameters>summary').click();
    await page.locator('#pdsSex').selectOption('male');await page.locator('#pdsAge').fill('63');await page.locator('#pdsForm button[type=submit]').click();
    const balance=await page.locator('#pdsScenarioAccount').textContent();
    await page.locator('#pdsLumpSumShortcut').focus();await page.keyboard.press('Enter');
    for(const id of ['pdsPayments','pdsLumpSum','pdsLumpSumMale'])assert(await page.locator('#'+id).getAttribute('open')!==null,'Shortcut did not open '+id);
    await page.waitForFunction(()=>document.querySelector('#pdsLumpSumShortcut').getAttribute('aria-expanded')==='true');
    assert(await page.locator('#pdsLumpSumMale tbody tr').count()===21,'Male ages missing');
    assert((await page.locator('#pdsLumpSumMale tbody tr').filter({has:page.locator('th',{hasText:/^63$/})}).textContent()).includes('335 433'),'Male threshold missing');
    await page.locator('#pdsLumpSumFemale>summary').click();
    assert(await page.locator('#pdsLumpSumFemale tbody tr').count()===21,'Female ages missing');
    assert((await page.locator('#pdsLumpSumFemale tbody tr').first().textContent()).includes('536 768'),'Female threshold missing');
    const text=await page.locator('#pdsLumpSum').textContent();
    for(const phrase of ['строго ниже','округлены','проект','После 15 лет','Досрочное расторжение','другие годы здесь не прогнозируются'])assert(text.includes(phrase),'Missing qualification '+phrase);
    assert(await page.locator('#pdsScenarioAccount').textContent()===balance,'Memo imposed a cap on account valuation');
    const url=await page.locator('#pdsLumpSum a[download]').getAttribute('href');
    const response=await page.request.get(new URL(url,page.url()).href);assert(response.ok(),'Memo PDF not served');assert((await response.body()).subarray(0,4).toString()==='%PDF','Download is not PDF');
    for(const theme of ['brand','dark']){
      await page.evaluate(t=>setTheme(t),theme);await page.setViewportSize({width:360,height:900});
      const region=page.locator('#pdsLumpSumFemale .pds-lump-table-scroll');await region.scrollIntoViewIfNeeded();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Memo overflows page');
      assert(await region.evaluate(x=>x.scrollWidth>x.clientWidth),'Narrow table cannot scroll');await region.focus();
      assert(await region.evaluate(x=>x===document.activeElement),'Table not keyboard accessible');
    }
  });
}
