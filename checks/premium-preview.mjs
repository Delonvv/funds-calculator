import { assert } from './core.mjs';

export async function premiumPreviewChecks(test, origin) {
  // The small static test server serves files rather than directory indexes.
  const openPreview = page => page.goto(`${origin}/designs/premium/index.html`, { waitUntil: 'networkidle' });
  await test('browser/premium-selection', 'Макет премиумов: банки, ступени и раскрытие условий', async page => {
    await openPreview(page);
    assert(await page.locator('#bankbuttons button').count() === 7, 'Seven bank choices required');
    assert(await page.locator('select').count() === 0, 'Duplicate level selector');
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
  await test('browser/premium-periods', 'Макет премиумов: месяц, год, 30 дней и Fast Track', async page => {
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
  await test('browser/premium-mobile', 'Макет премиумов: мобильные карточки и выбранные состояния', async page => {
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
