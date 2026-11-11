import { assert } from './core.mjs';

export async function catalogBannerChecks(test) {
  await test('browser/catalog-placement-strip', 'Лёгкая лента совпадает с Fixed Income, ручная прокрутка и переход', async page => {
    assert(await page.locator('.ct-banner').count() === 0, 'Old banner remains');
    const rail=page.locator('.ct-strip-rail');
    await rail.locator('.ct-strip-card').first().waitFor();
    const titles=await rail.locator('.ct-strip-copy b').allTextContents();
    const size=await rail.evaluate(x=>({width:x.clientWidth,card:x.querySelector('.ct-strip-card').getBoundingClientRect().width}));
    assert(Math.abs(size.card*2+10-size.width)<5,'Expected two cards per row');
    await page.locator('[data-strip-next]').click();
    await page.waitForFunction(()=>document.querySelector('.ct-strip-rail').scrollLeft>10);
    await page.waitForTimeout(700);
    const position=await rail.evaluate(x=>x.scrollLeft);
    assert(Math.abs(position-2*(size.card+10))<5,'Arrow should advance by a pair');
    await page.waitForTimeout(1100);
    assert(Math.abs(position-await rail.evaluate(x=>x.scrollLeft))<2,'Unexpected auto-scroll');
    await page.emulateMedia({reducedMotion:'reduce'});
    await rail.focus();await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(()=>document.querySelector('.ct-strip-rail').scrollLeft<10);
    await rail.locator('.ct-strip-card').first().click();
    await page.locator('#smart-fixed-incomePage').waitFor({state:'visible'});
    await page.locator('#ssDcmTrack .ss-dcm-card').first().waitFor();
    assert(JSON.stringify(titles)===JSON.stringify(await page.locator('#ssDcmTrack h3').allTextContents()),'Preview differs from Fixed Income');
    await page.evaluate(()=>window.showProductPage('funds'));
    await page.locator('#search').fill('TMON');
    assert(await rail.locator('.ct-strip-card').count()===titles.length,'Fund search filters placements');
  });

  await test('browser/catalog-placement-errors', 'Пустые данные, сбой JSON и повтор загрузки не ломают каталог', async page => {
    await page.route('**/dcm.json?*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({placements:[],updatedAt:'2026-11-11T10:00:00Z'})}));
    await page.reload({waitUntil:'networkidle'});
    assert((await page.locator('.ct-strip-rail').textContent()).includes('Сейчас нет'),'Missing empty state');
    await page.route('**/dcm.json?*',r=>r.fulfill({status:503,body:'Unavailable'}));
    await page.reload({waitUntil:'networkidle'});
    assert(await page.locator('#grid>.card').count()>0,'Failed DCM hides funds');
    assert(await page.locator('[data-strip-retry]').isVisible(),'Missing retry');
    await page.unroute('**/dcm.json?*');
    await page.locator('[data-strip-retry]').click();
    await page.locator('.ct-strip-card').first().waitFor();
  });

  await test('browser/catalog-placement-logos', 'Логотипы эмитентов из JSON и заглушка при сбое изображения', async page => {
    await page.context().route('https://invest-brands.cdn-tinkoff.ru/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="gray"/></svg>'}));
    await page.reload({waitUntil:'networkidle'});
    const logos=page.locator('.ct-strip-monogram img');
    await logos.first().waitFor();
    await page.waitForFunction(()=>document.querySelector('.ct-strip-monogram img')?.naturalWidth>0);
    assert(await logos.first().getAttribute('src')!==null,'Logo URL missing');
    await page.context().route('https://invest-brands.cdn-tinkoff.ru/**',r=>r.abort());
    await page.reload({waitUntil:'networkidle'});
    await page.locator('.ct-strip-card').first().waitFor();
    await page.waitForFunction(()=>document.querySelector('.ct-strip-monogram')&&!document.querySelector('.ct-strip-monogram').querySelector('img'));
    assert((await page.locator('.ct-strip-monogram').first().textContent()).length>0,'Fallback missing');
  });

  await test('browser/fund-identity-links', 'Иконка и название всех фондов ведут в карточку брокера', async page => {
    const links=await page.locator('#grid>.card').evaluateAll(cards=>cards.map(card=>({ticker:card.dataset.fundTicker,name:card.querySelector('h2 a')?.href,icon:card.querySelector('.fund-icon-link')?.href,targets:[...card.querySelectorAll('.fund-name-link,.fund-icon-link')].map(a=>[a.target,a.rel])})));
    for(const item of links){
      const expected=await page.evaluate(t=>fundSource(data.find(x=>x.t===t)),item.ticker);
      assert(item.name===expected&&item.icon===expected,'Wrong destination '+item.ticker);
      assert(item.targets.length===2&&item.targets.every(([target,rel])=>target==='_blank'&&rel.includes('noopener')),'Unsafe link '+item.ticker);
    }
    const destination=links.find(x=>x.ticker==='TMON').name;
    await page.context().route(destination,r=>r.fulfill({contentType:'text/html',body:'<title>Broker destination test</title>'}));
    for(const selector of ['.fund-name-link','.fund-icon-link']){
      const opened=page.context().waitForEvent('page');
      await page.locator('[data-fund-ticker="TMON"] '+selector).click();
      const external=await opened;await external.waitForLoadState();
      assert(external.url()===destination,'Click did not open broker card');await external.close();
    }
    await page.locator('[data-fund-ticker="TMON"] .ct-star').click();
    await page.locator('#ctPayoutToggle').click();await page.locator('#ctApply').click();
    const selected=page.locator('.ct-rail .fund-name-link');
    assert(await selected.count()>0,'Fund identity missing in payout rail');
    await page.locator('#ctReset').click();
    await page.locator('[data-fund-ticker="TMON"] .calc').click();
    assert(await page.locator('#modalBg').isVisible(),'Calculator stopped opening');
  });

  await test('browser/catalog-banner-popup', 'Подбор поверх каталога, четыре периода, применение, сброс и избранное', async page => {
    await page.locator('.ct-strip-card').first().waitFor();
    const total = await page.locator('#grid>.card').count();
    await page.locator('[data-fund-ticker="TMON"] .ct-star').click();
    await page.locator('#ctPayoutToggle').scrollIntoViewIfNeeded();
    const before = await page.locator('#grid').evaluate(x=>x.getBoundingClientRect().top+scrollY);
    await page.locator('#ctPayoutToggle').click();
    await page.locator('#ctPayout').waitFor({ state: 'visible' });
    const after = await page.locator('#grid').evaluate(x=>x.getBoundingClientRect().top+scrollY);
    assert(Math.abs(before - after) < 1, 'Popup moves the catalogue');
    assert(await page.locator('#ctPayout').evaluate(x => x.parentElement === document.body), 'Popup remains inside clipping ancestors');
    assert(JSON.stringify(await page.locator('#ctFrequency option').evaluateAll(a => a.map(x => x.value))) === JSON.stringify(['monthly','quarterly','semiannual','maturity']), 'Unexpected frequencies');
    assert(await page.locator('#ctFrequency').inputValue() === 'monthly', 'Default frequency is not monthly');
    assert(JSON.stringify(await page.locator('#ctType option').evaluateAll(a => a.map(x => x.value))) === JSON.stringify(['all','funds','placements','products']), 'Instrument types changed');
    await page.waitForTimeout(220);
    assert(await page.locator('#ctPayout').evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+20)); }), 'Popup is covered by another layer');
    await page.keyboard.press('Escape');
    await page.locator('#ctPayout').waitFor({ state: 'hidden' });
    assert(await page.locator('#ctPayoutToggle').evaluate(x => x === document.activeElement), 'Escape did not restore focus');
    await page.locator('#ctFilterToggle').click();
    await page.locator('#ctPayoutToggle').click();
    assert(await page.locator('#ctFilters:visible, #ctPayout:visible').count() === 1, 'Both windows are visible');
    await page.locator('#ctFilters').waitFor({ state: 'hidden' });
    assert(await page.locator('#ctPayout').isVisible(), 'Payout not opened after filters');
    await page.locator('#ctFilterToggle').click();
    await page.locator('#ctPayout').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Закрыть фильтры', exact: true }).click();
    await page.locator('#ctFilters').waitFor({ state: 'hidden' });
    await page.locator('#ctPayoutToggle').click();
    await page.locator('#ctClose').click();
    await page.locator('#ctPayout').waitFor({ state: 'hidden' });
    await page.locator('#ctPayoutToggle').click();
    await page.locator('#ctMin').fill('18');
    await page.locator('#ctApply').click();
    assert(await page.locator('.ct-carousel').isVisible(), 'Result rail not shown');
    assert(await page.locator('#grid').getAttribute('hidden') !== null, 'Full grid remains in selection');
    assert((await page.locator('.ct-active').textContent()).includes('Ежемесячно'), 'Monthly choice not applied');
    await page.locator('#ctPayoutToggle').click();
    await page.locator('#ctPopupReset').click();
    assert(await page.locator('#grid>.card').count() === total, 'Reset did not restore all funds');
    assert(!await page.locator('.ct-carousel').isVisible(), 'Selection rail remains after reset');
    assert(await page.locator('#ctFrequency').inputValue() === 'monthly', 'Reset did not restore monthly default');
    await page.locator('[data-catalog-mode="favorites"]').click();
    assert(await page.locator('#grid>.card').count() === 1, 'Reset lost favorites');
    await page.locator('[data-catalog-mode="all"]').click();
    await page.locator('#ctPayoutToggle').click();
    await page.locator('h1').first().click();
    await page.locator('#ctPayout').waitFor({ state: 'hidden' });
    await page.locator('#ctFilterToggle').click();
    await page.evaluate(() => window.showProductPage('spk'));
    await page.locator('#ctFilters').waitFor({ state: 'hidden' });
  });

  await test('browser/catalog-banner-mobile', 'Мобильный свайп и окна в пределах экрана в обеих темах', async page => {
    await page.setViewportSize({ width: 390, height: 844 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await page.locator('.ct-strip-card').first().waitFor();
    const rail=page.locator('.ct-strip-rail');
    await rail.scrollIntoViewIfNeeded();
    const area=await rail.boundingBox(),y=area.y+area.height/2,start=area.x+area.width-20,end=area.x+20;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
    for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/8,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>document.querySelector('.ct-strip-rail').scrollLeft>10);
    for (const theme of ['brand','dark']) {
      await page.evaluate(value => window.setTheme(value), theme);
      for (const width of [360,390,768,1440]) {
        await page.setViewportSize({ width, height: 844 });
        for (const id of ['ctPayoutToggle','ctFilterToggle']) {
          await page.locator('#'+id).click();
          const current = id === 'ctPayoutToggle' ? '#ctPayout' : '#ctFilters';
          await page.waitForTimeout(220);
          const box = await page.locator(current).boundingBox();
          assert(box.x >= 0 && box.y >= 0 && box.x+box.width <= width+1 && box.y+box.height <= 845, `Popup outside screen: ${theme}/${width}/${id}`);
          await page.keyboard.press('Escape');
          await page.locator(current).waitFor({ state: 'hidden' });
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Document overflow');
      }
    }
    await cdp.detach();
  });
}
