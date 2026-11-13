import {assert,json} from './core.mjs';
import fs from 'node:fs/promises';

export async function refreshChecks(test) {
  const show=(p,name)=>p.evaluate(n=>window.showProductPage(n),name);
  const replace=async(p,file,value)=>p.route('**/'+file+'?refresh=*',r=>r.fulfill({contentType:file.endsWith('.js')?'text/javascript':'application/json',body:typeof value==='string'?value:JSON.stringify(value)}));
  await test('browser/refresh-products','Возврат в Т‑Счёт и займ обновляет ставки без потери параметров',async p=>{
    await p.evaluate(async()=>{await window.productRatesReady;window.refreshSentinel=123;});
    await show(p,'taccount');await p.locator('#taccTerm').selectOption('months:6');
    await p.locator('#taccAmount').fill('777000');await p.locator('#taccDepositRate').fill('12.8');
    await show(p,'funds');
    const cfg=await json('rates.json');cfg.tAccount.rates.months['6']=16.75;
    await replace(p,'rates.json',cfg);await show(p,'taccount');
    await p.waitForFunction(()=>document.querySelector('#taccRate').value==='16.75');
    assert(await p.locator('#taccTerm').inputValue()==='months:6','Selected term lost');
    assert((await p.locator('#taccAmount').inputValue()).replace(/\s/g,'')==='777000','Amount reset');
    assert(await p.locator('#taccDepositRate').inputValue()==='12.8','Deposit assumption reset');
    assert(await p.evaluate(()=>window.refreshSentinel)===123,'Document reloaded');
    const monthly=await json('investloan-monthly-rates.json');monthly.rates.months['6']=17.25;
    await replace(p,'investloan-monthly-rates.json',monthly);await show(p,'investloan');
    await p.evaluate(()=>window.setLoanPayoutMode('monthly'));
    await p.locator('#loanTerm').selectOption('months:6');
    await p.waitForFunction(()=>document.querySelector('#loanRate').value==='17.25');
  });
  await test('browser/refresh-nszh','НСЖ и Рантье обновляют ставки и памятку при повторном входе',async p=>{
    await show(p,'nszh');await p.locator('#nszhTerm option').first().waitFor({state:'attached'});
    await p.locator('#nszhTerm').selectOption('60');await show(p,'funds');
    const cfg=await json('nszh-config.json');cfg.terms.find(t=>t.months===60).annualRate=18.7;cfg.surrender['5'][0]=88;
    const rent=await json('rentier-config.json');rent.rates['4'][0]=17.3;
    await replace(p,'nszh-config.json',cfg);await replace(p,'rentier-config.json',rent);await show(p,'nszh');
    await p.waitForFunction(()=>document.querySelector('#nszhRate').textContent.includes('18,7'));
    assert(await p.locator('#nszhTerm').inputValue()==='60','NSZH term reset');
    assert((await p.locator('#nszhExitRows').textContent()).includes('88%'),'Surrender memo stale');
    await p.locator('[data-program=rentier]').click();
    await p.waitForFunction(()=>document.querySelector('#rentierRate').textContent.includes('17,3'));
  });
  await test('browser/refresh-funds','Фонды: новая цена без перезагрузки и сброса поиска',async p=>{
    await p.locator('#search').fill('TMON');await show(p,'taccount');
    const cfg=await json('funds.json');cfg.market.TMON.price=177.77;cfg.nav.TMON.value=123456789;
    await replace(p,'funds.json',cfg);await show(p,'funds');
    await p.waitForFunction(()=>document.querySelector('[data-q=TMON]').textContent.includes('177,77'));
    assert(await p.locator('#search').inputValue()==='TMON','Search reset');
    assert(await p.locator('#grid>.card').count()===1,'Filter state lost');
    assert((await p.locator('[data-fund-ticker=TMON] .navValue').getAttribute('title')).includes('123 456 789'),'Cached NAV stayed stale');
  });
  await test('browser/refresh-other-data','ПДС, СПК, модельный портфель и стратегия получают новые данные',async p=>{
    await show(p,'pds');await p.locator('#pdsForm').waitFor();await p.locator('#pdsIncome').selectOption('low');
    const pds=await json('pds-config.json');pds.support.annualCap=30000;
    await replace(p,'pds-config.json',pds);await show(p,'funds');await show(p,'pds');
    await p.waitForFunction(()=>document.querySelector('#pdsSupport').textContent.includes('150 000'));
    assert(await p.locator('#pdsIncome').inputValue()==='low','PDS parameters reset');
    const market=await json('market-rates.json');market.rusfar.value=13.55;
    await replace(p,'market-rates.json',market);await show(p,'spk');
    await p.waitForFunction(()=>document.querySelector('#spkRusfar').value==='13.55');
    const model=await json('model-portfolios.json');model.profiles[0].basis='Обновлённое основание теста';
    await replace(p,'model-portfolios.json',model);await show(p,'model');
    await p.waitForFunction(()=>document.querySelector('#modelDemoNote').textContent.includes('Обновлённое основание'));
    await show(p,'smart-strategy');await p.locator('.strategy-idea-panel').waitFor();await show(p,'funds');
    const strategy=await json('strategy-2026.json');strategy.macro[0].value2026=88.8;
    await replace(p,'strategy-2026.json',strategy);await show(p,'smart-strategy');
    await p.waitForFunction(()=>document.querySelector('#smart-strategyPage').textContent.includes('88,8'));
  });
  await test('browser/refresh-failure','Ошибка источника сохраняет прежние ставки; повторный вход восстанавливает обновление',async p=>{
    await show(p,'taccount');await p.locator('#taccTerm').selectOption('months:6');
    const old=await p.locator('#taccRate').inputValue();await show(p,'funds');
    await replace(p,'rates.json',{tAccount:{rates:null}});await show(p,'taccount');
    await p.locator('.page-data-status').filter({hasText:'не удалось'}).waitFor();
    assert(await p.locator('#taccRate').inputValue()===old,'Malformed data overwrote last valid rate');
    const cfg=await json('rates.json');cfg.tAccount.rates.months['6']=17.8;
    await replace(p,'rates.json',cfg);await show(p,'funds');await show(p,'taccount');
    await p.waitForFunction(()=>document.querySelector('#taccRate').value==='17.8');
  });
  await test('browser/refresh-premium-placements','Банки и размещения обновляются без повторного открытия сайта',async p=>{
    await show(p,'premium');await p.locator('#bankbuttons button').first().waitFor();
    await p.locator('#rail [data-stage="1"]').click();await show(p,'funds');
    const source=await fs.readFile(new URL('../premium/data.js',import.meta.url),'utf8');
    await replace(p,'premium/data.js',source.replace('"name": "Т-Банк"','"name": "Т-Банк обновлён"'));
    await show(p,'premium');
    await p.waitForFunction(()=>document.querySelector('#bankbuttons').textContent.includes('обновлён'));
    assert(await p.locator('#rail [data-stage="1"]').getAttribute('aria-pressed')==='true','Premium stage reset');
    const dcm=await json('dcm.json');
    dcm.placements=[{id:'refresh-test',sourceId:'refresh-test',section:'primary',issuer:'Новый эмитент теста',title:'Новый эмитент теста',issueName:'Выпуск 1',coupon:'15% годовых',currency:'RUB',deadline:'Открыт сбор',isQual:false}];
    await replace(p,'dcm.json',dcm);await show(p,'smart-fixed-income');
    await p.waitForFunction(()=>document.querySelector('#ssDcmTrack').textContent.includes('Новый эмитент теста'));
    await show(p,'funds');
    await p.waitForFunction(()=>document.querySelector('.ct-strip-rail').textContent.includes('Новый эмитент теста'));
  });
  await test('browser/refresh-version','Новая версия интерфейса предлагает обновление, не перезагружая рабочую вкладку',async p=>{
    const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
    await replace(p,'index.html',html.replace('</head>','<script src="scripts/future-release.js"></script></head>'));
    await p.evaluate(()=>window.refreshSentinel='still-open');await show(p,'taccount');
    await p.locator('.page-data-status button').filter({hasText:'Обновить интерфейс'}).waitFor();
    assert(await p.evaluate(()=>window.refreshSentinel)==='still-open','Forced document reload');
  });
  await test('browser/refresh-race','Запоздавшая ставка от прошлого перехода не заменяет свежую',async p=>{
    await p.evaluate(async()=>await window.productRatesReady);
    await show(p,'taccount');await p.locator('#taccTerm').selectOption('months:6');await show(p,'spk');
    let release,started,count=0;
    const gate=new Promise(r=>{release=r;}),first=new Promise(r=>{started=r;});
    const old=await json('rates.json'),fresh=structuredClone(old);old.tAccount.rates.months['6']=16.5;fresh.tAccount.rates.months['6']=17.6;
    await p.route('**/rates.json?refresh=*',async route=>{const previous=++count===1;if(previous){started();await gate;}await route.fulfill({json:previous?old:fresh});});
    try {
      await show(p,'taccount');await first;await show(p,'spk');await show(p,'taccount');
      await p.waitForFunction(()=>document.querySelector('#taccRate').value==='17.6');
      const response=p.waitForResponse(r=>r.url().includes('rates.json?refresh='));release();await response;
      await p.waitForTimeout(100);
      assert(await p.locator('#taccRate').inputValue()==='17.6','Old navigation response overwrote fresh rate');
    } finally {release();}
  });
}
