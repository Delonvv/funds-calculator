import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {assert,read} from './core.mjs';

export async function tiraUpdaterChecks(check){
  await check('finance/tira-updater','TIRA: рублёвый TQBR и отсутствие истории до запуска фонда',async()=>{
    for(const name of ['update-data.mjs','update-funds.mjs']){
      const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tira-updater-'));
      try{
        await fs.mkdir(path.join(dir,'scripts'));
        await fs.writeFile(path.join(dir,'scripts',name),await read('scripts/'+name));
        await fs.writeFile(path.join(dir,'funds.json'),JSON.stringify({tickers:['TIRA'],market:{},nav:{},history:{TIRA:{asOf:'2025-11-23',returns:{y1:50}}}}));
        await fs.writeFile(path.join(dir,'market-rates.json'),'{}');
        await fs.writeFile(path.join(dir,'mock.mjs'),`globalThis.fetch=async value=>{const u=new URL(value);let body;if(u.pathname.includes('/index/'))body={marketdata:{data:[['RUSFAR',14,null,'2026-11-23','2026-11-23 12:00:00']]}};else{if(!u.pathname.includes('/boards/TQBR/'))throw Error('Wrong board');body=u.pathname.endsWith('/candles.json')?{candles:{data:[[5,'2025-11-23'],[10,'2026-11-23']]}}:{marketdata:{data:[['TIRA',10,null,'2026-11-23 12:00:00']]}};}return{ok:true,json:async()=>body};};`);
        const result=spawnSync(process.execPath,['--import',path.join(dir,'mock.mjs'),path.join(dir,'scripts',name)],{encoding:'utf8',timeout:10000});
        assert(result.status===0,result.stderr||result.error?.message||'Updater failed');
        const actual=JSON.parse(await fs.readFile(path.join(dir,'funds.json'),'utf8'));
        assert(actual.market.TIRA.price===10&&actual.market.TIRA.currency==='RUB','Wrong quote');
        assert(!actual.history.TIRA,'Pre-launch history manufactured a return');
        assert(actual.failedTickers.length===0,'Updater warning');
      }finally{await fs.rm(dir,{recursive:true,force:true});}
    }
  });
}

export async function tiraBrowserChecks(test){
  await test('browser/tira','TIRA: новый фонд, поиск, избранное, фильтры и собственный сценарий',async page=>{
    const total=await page.locator('#grid>.card').count();
    await page.locator('#search').fill('TIRA');
    const card=page.locator('[data-fund-ticker="TIRA"]');
    assert(await page.locator('#grid>.card').count()===1,'Search failed');
    assert((await card.innerText()).includes('До 2,199% в год'),'Fee cap missing');
    assert((await card.locator('[data-q="TIRA"]').innerText()).includes('₽'),'Quote not RUB');
    assert(await card.locator('.fund-name-link').getAttribute('href')==='https://www.tbank.ru/invest/etfs/TIRA/','Wrong destination');
    assert(await card.locator('.fund-icon-link img').evaluate(x=>x.complete&&x.naturalWidth>0),'Illustration missing');
    await card.locator('.ct-star').click();await page.reload({waitUntil:'networkidle'});
    await page.locator('[data-catalog-mode="favorites"]').click();assert(await card.isVisible(),'Favorite lost');
    await page.locator('#ctReset').click();assert(await page.locator('#grid>.card').count()===total,'Reset failed');
    await page.locator('#ctFilterToggle').click();await page.locator('#filters').getByRole('button',{name:'Смешанные',exact:true}).click();await page.keyboard.press('Escape');assert(await card.isVisible(),'Category missing');
    await card.locator('.compare').click();assert((await page.locator('#peers-TIRA').innerText()).includes('23.11.2026'),'Launch disclosure missing');
    assert(!(await page.locator('#peers-TIRA').innerText()).includes('Прямого биржевого аналога нет'),'False no-analogue claim');
    await card.locator('.calc').click();assert(await page.locator('#rate').inputValue()==='0','Invented forecast');
    await page.locator('#rate').fill('12');await page.locator('#initial').fill('120000');
    const profit=await page.locator('#calcTableBody tr').nth(2).locator('td').first().innerText();assert(Number(profit.replace(/[^0-9]/g,''))===1044,'Own scenario changed');await page.keyboard.press('Escape');
    for(const theme of ['brand','dark'])for(const width of [360,1440]){await page.evaluate(t=>setTheme(t),theme);await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow');}
    await page.locator('#ctReset').click();await page.locator('#ctPayoutToggle').click();await page.locator('#ctType').selectOption('funds');await page.locator('#ctApply').click();assert(await page.locator('.ct-rail [data-fund-ticker="TIRA"]').count()===0,'Non-paying fund in monthly payout selection');
  });
}
