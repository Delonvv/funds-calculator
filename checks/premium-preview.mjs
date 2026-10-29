import { assert } from './core.mjs';

export async function premiumPreviewChecks(test, origin) {
  const openPreview = async page => {
    await page.goto(`${origin}/index.html#premium`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#premiumPage.active #bankbuttons button');
  };
  await test('browser/premium-navigation', 'Премиум: позиция после Умных продаж', async page => {
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const order = await page.locator('.product-nav').evaluate(nav => {
        const premium = nav.querySelector('[data-page="premium"]');
        return { previous: premium.previousElementSibling.className, next: premium.nextElementSibling?.textContent ?? null };
      });
      assert(order.previous.includes('smart-sales-nav') && order.next === null, 'Wrong premium navigation order');
    }
    await page.locator('.product-nav [data-page="premium"]').click();
    assert(new URL(page.url()).hash === '#premium', 'Premium must use the shared application route');
    assert(await page.locator('#premiumPage.active #bankbuttons button').count() === 7, 'Premium did not initialize');
    assert(await page.locator('body > header').count() === 1, 'Duplicate header');
    assert(await page.locator('#missionPage, .product-nav [data-page="mission"]').count() === 0, 'Mission page still present');
    await page.goto(`${origin}/index.html#mission`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#fundsPage.active');
    assert(new URL(page.url()).hash === '#funds', 'Legacy mission link did not return to funds');
  });
  await test('browser/premium-shared-shell', 'Премиум: общая тема, меню продаж, калькулятор и старые ссылки', async page => {
    await openPreview(page);
    await page.evaluate(() => { window.auditPremiumHeader = document.querySelector('body > header'); });
    await page.locator('[data-bank="2"]').click();
    await page.locator('[data-stage="1"]').click();
    await page.locator('#themeToggle').click();
    assert(await page.locator('html').getAttribute('data-theme') === 'dark', 'Theme switch missing or ineffective');
    const palette = await page.locator('#premiumPage .bankpickerfinal').evaluate(el => {
      const probe = document.createElement('div'); probe.style.backgroundColor = 'var(--panel)'; el.append(probe);
      const expected = getComputedStyle(probe).backgroundColor; probe.remove();
      return { actual: getComputedStyle(el).backgroundColor, expected };
    });
    assert(palette.actual === palette.expected, 'Premium did not adopt shared theme palette');
    await page.locator('.smart-sales-trigger').click();
    await page.locator('.smart-sales-menu [data-smart-page="stocks"]').click();
    await page.waitForSelector('#smart-stocksPage.active');
    await page.locator('[data-page="premium"]').click();
    assert(await page.locator('[data-bank="2"]').getAttribute('aria-pressed') === 'true', 'Navigation lost selected banks');
    assert(await page.locator('[data-stage="1"]').getAttribute('aria-pressed') === 'true', 'Navigation lost selected level');
    assert(await page.evaluate(() => document.querySelector('body > header') === window.auditPremiumHeader), 'Header recreated on navigation');
    await page.locator('.header-actions .primary').click();
    await page.waitForSelector('#modalBg.open');
    await page.evaluate(() => window.closeCalc());
    await page.locator('[data-page="funds"]').click();
    const scenery = page.locator('#fundsPage .page-scenery img');
    assert((await scenery.getAttribute('src')).includes('funds-calm-city'), 'Funds background was replaced');
    await page.goto(`${origin}/premium/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#premiumPage.active #bankbuttons button');
    assert(new URL(page.url()).hash === '#premium', 'Old URL did not reach shared route');
    assert(await page.locator('html').getAttribute('data-theme') === 'dark', 'Old URL lost saved theme');
    await page.locator('#themeToggle').click();
    assert(await page.locator('html').getAttribute('data-theme') === 'brand', 'Light theme not restored');
    assert(await page.locator('#premiumPage .premium-scenery img').evaluate(el => el.complete && el.naturalWidth > 0), 'Premium background image did not load');
    await page.locator('#premiumPage .pagefoot a').click();
    await page.waitForSelector('#premiumSberPage.active');
    assert(await page.locator('body > header').count() === 1, 'Sber reference replaced shared header');
    await page.locator('#themeToggle').click();
    assert(await page.locator('html').getAttribute('data-theme') === 'dark', 'Sber reference lost theme switch');
    await page.goto(`${origin}/premium/sber-levels.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#premiumSberPage.active');
    assert(await page.locator('#premiumSberPage .sberfull thead th').count() === 7, 'Sber reference table lost levels');

  });
  await test('browser/premium-selection', 'Премиум банков: банки, ступени и раскрытие условий', async page => {
    await openPreview(page);
    assert(await page.locator('#bankbuttons button').count() === 7, 'Seven bank choices required');
    assert(await page.locator('#premiumPage select').count() === 0, 'Duplicate level selector');
    for (const id of [2, 3, 4, 6]) await page.locator(`[data-bank="${id}"]`).click();
    assert(await page.locator('.bcard').count() === 7, 'Selected bank missing');
    for (let tier = 0; tier < 4; tier++) {
      await page.locator(`[data-stage="${tier}"]`).click();
      assert(await page.locator('.bcard').count() === 7, 'Bank selection reset by level');
      assert(await page.locator('.airport').count() === 7, 'Fast Track missing from level');
    }
    await page.locator('[data-bank="2"]').click();
    assert(await page.locator('[data-bank-id="a"]').count() === 0, 'Deselected bank still rendered');
    await page.locator('[data-bank="2"]').click();
    assert(await page.locator('[data-bank-id="a"]').count() === 1, 'Bank not restored');
    const detail = page.locator('[data-benefit="0:8"]');
    await detail.click();
    assert(await detail.getAttribute('aria-expanded') === 'true', 'Fast Track detail did not open');
    assert(await detail.evaluate(el => document.activeElement === el), 'Focus lost on disclosure');
    assert(await detail.locator('small').isVisible(), 'Disclosure text not visible');
  });
  await test('browser/premium-periods', 'Премиум банков: месяц, год, 30 дней и Fast Track', async page => {
    await openPreview(page);
    await page.locator('[data-bank="2"]').click();
    const alfa = page.locator('[data-bank-id="a"]');
    assert((await alfa.locator('[data-benefit="2:5"]').innerText()).includes('До 2 поездок в месяц · до 12 в год'), 'Dual taxi cap hidden');
    assert(await alfa.locator('[data-benefit="2:5"] .period-labels em').count() === 2, 'Both periods must be visible');
    assert((await page.locator('[data-bank-id="p"] [data-benefit="5:5"]').innerText()).includes('В ГОД'), 'PSB annual cap missing');
    assert((await page.locator('[data-bank-id="t"] [data-benefit="0:5"]').innerText()).includes('КАЖДЫЕ 30 ДНЕЙ'), 'T-Bank period misrepresented');
    assert((await alfa.locator('.airport b').textContent()) === 'Есть · платно', 'Paid Alfa service must be qualified');
    assert((await page.locator('[data-bank-id="s"] .airport b').textContent()) === 'Требует подтверждения', 'Unknown Sber service must not become false yes/no');
    assert(await page.locator('.airport b').evaluateAll(items => items.every(x => !/\d/.test(x.textContent))), 'Fast Track must not show a visit quota');
    const appearance = await page.locator('.airport').first().evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, label: getComputedStyle(el.querySelector('span')).color, normalLabel: getComputedStyle(el.parentElement.previousElementSibling.querySelector('span')).color }));
    assert(appearance.bg === 'rgba(0, 0, 0, 0)' && appearance.label === appearance.normalLabel, 'Fast Track highlighted separately');
    assert(await page.locator('.proof-link').first().getAttribute('rel') === 'noopener noreferrer', 'External source link missing protections');
  });
  await test('browser/premium-mobile', 'Премиум банков: мобильные карточки и выбранные состояния', async page => {
    await openPreview(page);
    for (const id of [2, 3, 4, 6]) await page.locator(`[data-bank="${id}"]`).click();
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow at ${width}`);
      const board = page.locator('#board');
      assert(await board.evaluate(el => el.scrollWidth > el.clientWidth), `Cards cannot scroll at ${width}`);
      await page.locator('#next').scrollIntoViewIfNeeded();
      await page.locator('#next').click();
      await page.waitForFunction(() => document.getElementById('board').scrollLeft > 1);
      await page.locator('#prev').click();
      await page.waitForFunction(() => document.getElementById('board').scrollLeft < 2);
    }
    const selected = await page.locator('[data-bank="0"]').evaluate(el => getComputedStyle(el).backgroundColor);
    await page.locator('[data-bank="0"]').click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-bank="0"]')).backgroundColor === 'rgb(229, 229, 231)');
    const unselected = await page.locator('[data-bank="0"]').evaluate(el => getComputedStyle(el).backgroundColor);
    assert(selected === 'rgb(23, 23, 25)' && unselected === 'rgb(229, 229, 231)', 'Bank colours must be black / grey');
  });
}
