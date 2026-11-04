import { assert, json } from './core.mjs';

export async function strategyChecks(test, origin) {
  const open = async page => {
    await page.evaluate(() => window.showProductPage('smart-strategy'));
    await page.waitForSelector('#strategyIdeasPanel table');
  };
  await test('browser/strategy-navigation', 'Стратегия: меню, прямой адрес, тема и прежние разделы', async page => {
    assert(await page.evaluate(() => performance.getEntriesByType('resource').every(x => !x.name.includes('strategy-2026.json'))), 'Strategy loaded before opening');
    const position = await page.locator('[data-smart-page="strategy"]').evaluate(el => ({before:el.previousElementSibling.dataset.smartPage, after:el.nextElementSibling.className}));
    assert(position.before === 'model' && position.after === 'smart-sales-divider', 'Strategy is not between model and divider');
    await page.goto(`${origin}/#smart-strategy`, {waitUntil:'networkidle'});
    await page.waitForSelector('#strategyIdeasPanel table');
    assert(await page.locator('.product-page.active').count() === 1 && await page.locator('#smart-strategyPage').isVisible(), 'Direct route failed');
    const header = await page.locator('body>header').count(); assert(header === 1, 'Duplicated header');
    await page.locator('#themeToggle').click();
    assert(await page.locator('html').getAttribute('data-theme') === 'dark', 'Shared theme unavailable');
    await page.locator('.strategy-model').click();
    assert(await page.locator('#modelPage').isVisible(), 'Model link broken');
    assert(await page.locator('[data-smart-page="model"]').evaluate(el => el.classList.contains('active')), 'Model menu selection stale');
    await page.locator('.smart-sales-trigger').click(); await page.locator('[data-smart-page="strategy"]').click();
    assert(await page.locator('#strategyIdeasPanel').isVisible(), 'Menu link failed');
    await page.locator('[data-page="funds"]').click();
    assert(await page.locator('#grid').isVisible(), 'Catalogue navigation broken');
  });
  await test('browser/strategy-content', 'Стратегия: периоды прогнозов, идеи, клавиатура и раскрытие сценариев', async page => {
    await open(page);
    const config = await json('strategy-2026.json');
    assert(config.marketDataAsOf === '2026-10-29' && config.macro[0].value2026 === 84.5 && config.macro[1].value2026 === 12.6, 'Source data changed unexpectedly');
    assert(config.macro[0].period2027.includes('В среднем') && config.macro[2].period2027.includes('К концу'), 'Average and year-end forecasts conflated');
    assert((await page.locator('.strategy-macro-row').first().innerText()).includes('84,5'), 'Forecast not rendered');
    await page.locator('[data-strategy-detail]').first().click();
    assert(await page.locator('#strategyDetail-bonds-0').isVisible(), 'Bond details failed');
    await page.locator('#strategyTab-bonds').focus(); await page.keyboard.press('ArrowRight');
    assert(await page.locator('#strategyTab-stocks').getAttribute('aria-selected') === 'true', 'Keyboard tab switch failed');
    assert((await page.locator('#strategyIdeasPanel').innerText()).includes('Целевая цена') && !(await page.locator('#strategyIdeasPanel thead').innerText()).includes('Доходность'), 'Stock targets labeled as yields');
    await page.keyboard.press('End');
    assert(await page.locator('#strategyTab-currency').getAttribute('aria-selected') === 'true', 'End key failed');
    const content = await page.locator('#strategyIdeasPanel').innerText(); assert(content.includes('CNY') && content.includes('USD'), 'Currency information missing');
    await page.locator('[data-strategy-scenario="inflation"]').click();
    assert(await page.locator('#strategyScenario-inflation').getAttribute('open') !== null, 'Risk shortcut did not expand scenario');
    for (const scenario of config.scenarios) {
      const memo = page.locator('#strategyScenario-' + scenario.id);
      if (await memo.getAttribute('open') === null) await memo.locator('summary').click();
      await memo.locator('.strategy-scenario-watch').waitFor({state:'visible'});
      const text = await memo.textContent();
      for (const heading of ['Что происходит и почему', 'Как это может повлиять на активы', 'На что смотреть дальше', 'Кратко, простыми словами']) assert(text.includes(heading), `Missing memo section: ${heading}`);
      assert(!text.includes('Что обсудить') && !text.includes('Что уточнить у клиента') && !text.includes('?'), 'Client questions remain in memo');
      assert(await memo.locator('.strategy-impacts li').count() === scenario.effects.length && await memo.locator('.strategy-scenario-watch li').count() === scenario.watch.length, 'Memo list truncated');
    }
    assert(new URL(page.url()).hash === '#smart-strategy', 'In-page scroll changed application route');
    const future = page.locator('.strategy-accordion').last(); await future.locator('summary').click();
    await future.locator('.strategy-future').waitFor({state:'visible'});
    const forecast = await future.textContent(); assert(forecast.includes('91,2') && forecast.includes('12,75') && forecast.includes('В среднем за 2027 год'), 'Future forecast context missing');
    assert(await page.locator('.strategy-last-actions a').getAttribute('href') === config.sourceUrl, 'Primary source missing');
  });
  await test('browser/strategy-motion', 'Стратегия: стрелка, переход, остановка и reduced-motion', async page => {
    await page.setViewportSize({width:1440,height:720}); await open(page);
    const cue = await page.locator('.strategy-scroll-invitation').boundingBox();
    assert(cue.y >= 0 && cue.y + cue.height <= 720, 'Scroll cue hidden below viewport');
    assert(await page.locator('.strategy-scroll-arrow').evaluate(el => el.getAnimations().length > 0), 'Arrow cue absent');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert(await page.locator('.strategy-scroll-arrow').evaluate(el => el.getAnimations().length === 0), 'Reduced motion ignored');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('.strategy-scroll-invitation button').click();
    await page.waitForFunction(() => document.getElementById('smart-strategyPage').classList.contains('strategy-seen'));
    assert(await page.locator('.strategy-scroll-arrow').evaluate(el => el.getAnimations().length === 0), 'Animation continues after revealing content');
    assert(await page.locator('#strategyIdeasTitle').evaluate(el => el === document.activeElement), 'Scroll destination did not receive focus');
  });
  await test('browser/strategy-mobile', 'Стратегия: темы и ширины 360–1440 px', async page => {
    await open(page);
    for (const theme of ['brand','dark']) {
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      for (const width of [360,390,768,1440]) {
        await page.setViewportSize({width,height:900});
        for (const tab of ['bonds','stocks','currency']) {
          await page.locator(`[data-strategy-tab="${tab}"]`).click();
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme} ${width} ${tab}: page overflow`);
          const pageBox = await page.locator('#smart-strategyPage').boundingBox();
          for (const cell of await page.locator('#strategyIdeasPanel tbody tr:not(.strategy-detail-row)>*').all()) {
            const box = await cell.boundingBox();
            assert(box.x >= pageBox.x - 1 && box.x + box.width <= pageBox.x + pageBox.width + 1, 'Table cell clipped');
          }
        }
      }
    }
  });
  await test('browser/strategy-retry', 'Стратегия: отказ данных, источник и повторная загрузка', async page => {
    await page.route('**/strategy-2026.json*', route => route.fulfill({status:503,body:'Unavailable'}));
    await page.evaluate(() => window.showProductPage('smart-strategy'));
    await page.waitForSelector('.strategy-retry');
    assert((await page.locator('#smart-strategyPage').innerText()).includes('Не удалось загрузить'), 'Failure hidden');
    assert(await page.locator('#smart-strategyPage a').getAttribute('href') === 'https://www.tbank.ru/invest/research/strategy/2026-autumn-update/', 'Missing source fallback');
    await page.unroute('**/strategy-2026.json*');
    await page.locator('.strategy-retry').click();
    await page.waitForSelector('#strategyIdeasPanel table');
    assert(await page.locator('#smart-strategyPage').getAttribute('aria-busy') === 'false', 'Busy state not cleared');
  });
}
