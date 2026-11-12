import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {assert,read,json} from './core.mjs';

export async function tcnyUpdaterChecks(check){
  await check('finance/tcny-updater','TCNY: режим TQBR в рублях и защита от данных до запуска торгов',async()=>{
    const source=await json('funds.json');assert(source.tickers.filter(x=>x==='TCNY').length===1,'TCNY absent or duplicated');
    for(const name of ['update-data.mjs','update-funds.mjs']){
      const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tcny-updater-'));
      try{
        await fs.mkdir(path.join(dir,'scripts'));
        await fs.writeFile(path.join(dir,'scripts',name),await read('scripts/'+name));
        await fs.writeFile(path.join(dir,'funds.json'),JSON.stringify({tickers:['TCNY'],market:{},nav:{},history:{TCNY:{asOf:'2021-01-01',returns:{m1:99}}}}));
        await fs.writeFile(path.join(dir,'market-rates.json'),'{}');
        await fs.writeFile(path.join(dir,'mock.mjs'),`globalThis.fetch=async value=>{
          const u=new URL(value);let body;
          if(u.pathname.includes('/index/'))body={marketdata:{data:[['RUSFAR',14,null,'2026-11-12','2026-11-12 12:00:00']]}};
          else if(!u.pathname.includes('/boards/TQBR/'))throw Error('TCNY must use TQBR');
          else if(u.pathname.endsWith('/candles.json'))body={candles:{data:[[100,'2025-11-01'],[110,'2025-11-12'],[13.14,'2026-11-12']]}};
          else body={marketdata:{data:[['TCNY',13.14,null,'2026-11-12 12:00:00']]}};
          return {ok:true,json:async()=>body};
        };`);
        const result=spawnSync(process.execPath,['--import',path.join(dir,'mock.mjs'),path.join(dir,'scripts',name)],{encoding:'utf8',timeout:10000});
        assert(result.status===0,result.stderr||result.error?.message||'Updater failed');
        const actual=JSON.parse(await fs.readFile(path.join(dir,'funds.json'),'utf8'));
        assert(actual.market.TCNY.price===13.14&&actual.market.TCNY.currency==='RUB','Wrong TCNY quote currency');
        assert(!actual.history.TCNY,'Synthetic pre-launch history survived');
        assert(actual.failedTickers.length===0,'Unexpected updater warning');
      }finally{await fs.rm(dir,{recursive:true,force:true});}
    }
  });
}

export async function tcnyBrowserChecks(test){
  await test('browser/tcny','TCNY: карточка, источник, валюта, избранное, фильтры и сценарий',async page=>{
    const total=await page.locator('#grid>.card').count();
    await page.locator('#search').fill('TCNY');
    const card=page.locator('[data-fund-ticker="TCNY"]');
    assert(await page.locator('#grid>.card').count()===1,'Search does not find TCNY');
    assert((await card.textContent()).includes('До 0,399% в год'),'Wrong fee cap');
    assert((await card.locator('[data-q="TCNY"]').textContent()).includes('₽'),'Quote is not RUB');
    assert(!(await card.textContent()).includes('13,9%'),'Ruble money-market forecast leaked');
    assert(await card.locator('.fund-name-link').getAttribute('href')==='https://www.tbank.ru/invest/etfs/TCNY/','Wrong broker link');
    assert(await card.locator('.fund-icon-link img').evaluate(x=>x.complete&&x.naturalWidth>0),'TCNY illustration failed');
    await card.locator('.ct-star').click();
    await page.reload({waitUntil:'networkidle'});await page.locator('[data-catalog-mode="favorites"]').click();
    assert(await card.isVisible(),'Favorite lost after reload');
    await page.locator('#ctReset').click();
    assert(await page.locator('#grid>.card').count()===total,'Reset changed catalogue');
    await page.locator('#ctFilterToggle').click();
    await page.locator('#filters').getByRole('button',{name:'Ликвидность',exact:true}).click();
    await page.keyboard.press('Escape');assert(await card.isVisible(),'TCNY missing in liquidity category');
    await card.locator('.compare').click();
    assert(!(await page.locator('#peers-TCNY').textContent()).includes('Прямого биржевого аналога нет'),'False no-analogue claim');
    assert((await page.locator('#peers-TCNY').textContent()).includes('12.11.2026'),'Missing start date');
    await card.locator('.calc').click();
    assert((await page.locator('#rateNote').textContent()).includes('CNY/RUB'),'No currency explanation');
    assert(await page.locator('#rate').inputValue()==='0','Invented expected rate');
    await page.locator('#rate').fill('10');await page.locator('#initial').fill('120000');
    const profit=await page.locator('#calcTableBody tr').nth(2).locator('td').first().textContent();assert(Number(profit.replace(/[^0-9]/g,''))===870,'Wrong ruble scenario result');
    await page.keyboard.press('Escape');
  });
}
