import { assert } from './core.mjs';

export async function catalogBannerChecks(test) {
  await test('browser/catalog-banner', 'Два ручных слайда, клавиатура и существующий модельный портфель', async page => {
    const banner = page.locator('.ct-banner');
    assert(await banner.count() === 1, 'Expected exactly one banner');
    assert(await banner.locator('.ct-banner-slide').count() === 2, 'Expected exactly two slides');
    assert(await page.locator('.ct-toolbar #ctPayoutToggle').count() === 0, 'Old payout button remains');
    assert(await banner.locator('#ctPayoutToggle').isVisible(), 'Banner payout trigger missing');
    const height = (await banner.boundingBox()).height;
    assert(height >= 90 && height <= 110, `Desktop banner height: ${height}`);
    await banner.locator('.ct-banner-next').click();
    assert(await banner.locator('.ct-banner-dots button').nth(1).getAttribute('aria-current') === 'true', 'Next slide not selected');
    await page.waitForTimeout(2200);
    assert(await banner.locator('.ct-banner-dots button').nth(1).getAttribute('aria-current') === 'true', 'Unexpected automatic slide change');
    await banner.getByRole('button', { name: 'Открыть портфель', exact: false }).click();
    assert(await page.locator('#modelPage').isVisible(), 'Existing model page not opened');
    await page.evaluate(() => window.showProductPage('funds'));
    await banner.locator('.ct-banner-prev').click();
    await banner.locator('.ct-banner-dots button').nth(1).click();
    await page.keyboard.press('ArrowLeft');
    assert(await banner.locator('.ct-banner-dots button').first().getAttribute('aria-current') === 'true', 'Keyboard slide navigation failed');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await banner.locator('.ct-banner-next').click();
    assert(await banner.locator('.ct-banner-track').evaluate(x => x.getAnimations().length) === 0, 'Reduced motion not respected');
  });

  await test('browser/catalog-banner-popup', 'Подбор поверх каталога, четыре периода, применение, сброс и избранное', async page => {
    const total = await page.locator('#grid>.card').count();
    await page.locator('[data-fund-ticker="TMON"] .ct-star').click();
    const before = await page.locator('#grid').boundingBox();
    await page.locator('#ctPayoutToggle').click();
    await page.locator('#ctPayout').waitFor({ state: 'visible' });
    const after = await page.locator('#grid').boundingBox();
    assert(Math.abs(before.y - after.y) < 1, 'Popup moves the catalogue');
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
    await page.locator('.ct-banner-next').click();
    await page.locator('#ctPayout').waitFor({ state: 'hidden' });
    await page.locator('.ct-banner-prev').click();
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
    const area = await page.locator('.ct-banner-window').boundingBox();
    const y = area.y + 30, start = area.x + area.width - 15, end = area.x + 15;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start + (end-start)*i/5, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert(await page.locator('.ct-banner-dots button').nth(1).getAttribute('aria-current') === 'true', 'Touch swipe failed');
    await page.locator('.ct-banner-dots button').first().click();
    for (const theme of ['brand','dark']) {
      await page.evaluate(value => window.setTheme(value), theme);
      for (const width of [360,390,768]) {
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
