import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import { root, json, assert, close } from './core.mjs';

export async function browserChecks(check, directory) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.otf': 'font/otf' };
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      const file = path.resolve(root, relative);
      assert(file.startsWith(root) && !relative.startsWith('.') && !relative.startsWith('checks/'), 'Forbidden');
      const body = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    browser = await chromium.launch({ ...(process.env.CHECK_CHROMIUM_PATH ? { executablePath: process.env.CHECK_CHROMIUM_PATH } : {}) });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const test = (id, title, action) => check(id, title, async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      try {
        await page.goto(origin, { waitUntil: 'networkidle' });
        await page.waitForSelector('#grid [data-fund-ticker]');
        await action(page);
        assert(errors.length === 0, `Uncaught JavaScript: ${errors.join('; ')}`);
      } catch (error) {
        await page.screenshot({ path: `${directory}/${id.replaceAll('/', '-')}.png`, fullPage: true }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    });
    const show = (page, name) => page.evaluate(value => window.showProductPage(value), name);
    const number = async (page, selector) => Number((await page.locator(selector).textContent()).replace(/[^\d,.-]/g, '').replace(',', '.'));
    const fillAmount = async (page, selector, value) => {
      const field = page.locator(selector);
      await field.focus();
      // Money fields select themselves on the next animation frame after focus.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await field.fill(value);
      await field.blur();
    };

    await test('browser/catalog', 'Поиск, фильтры, сброс и сравнение', async page => {
      const cards = page.locator('#grid>.card');
      const total = await cards.count(); assert(total > 0, 'Empty catalogue');
      await page.locator('#search').fill('TMON'); assert(await cards.count() === 1, 'Search should match TMON');
      await page.locator('.compare').first().click(); assert(await page.locator('.peers.open').count() === 1, 'Comparison did not open');
      await page.locator('.peers.open button').filter({ hasText: '1 месяц' }).click();
      assert(await page.locator('.peers.open button[aria-pressed="true"]').textContent() === '1 месяц', 'Comparison period not changed');
      await page.locator('#search').fill('no-such-fund-012345'); assert(await cards.count() === 0, 'Empty search must be empty');
      await page.locator('#ctReset').click(); assert(await cards.count() === total, 'Reset did not restore catalogue');
      await page.locator('#ctFilterToggle').click();
      await page.locator('#filters button').filter({ hasText: 'Только квалам' }).click();
      assert(await cards.count() > 0 && await cards.count() < total, 'Access filter ineffective');
      assert((await cards.locator('.access').allTextContents()).every(x => x === 'Только квал'), 'Wrong access in filtered results');
    });
    await test('browser/fund-favorites', 'Избранный фонд сохраняется после перезагрузки', async page => {
      await page.locator('#search').fill('TMON'); await page.locator('.ct-star').first().click();
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('[data-catalog-mode="favorites"]').click();
      assert(await page.locator('#grid>.card').count() === 1, 'Favorite fund lost');
      assert(await page.locator('#grid>.card').getAttribute('data-fund-ticker') === 'TMON', 'Wrong favorite');
      await page.locator('.ct-star').first().click(); assert(await page.locator('#grid>.card').count() === 0, 'Favorite not removed');
    });
    await test('browser/modal', 'Калькулятор фонда и Escape', async page => {
      await page.locator('[data-fund-ticker="TMON"] .calc').click();
      assert(await page.locator('#modalBg').evaluate(x => x.classList.contains('open')), 'Modal closed');
      await fillAmount(page, '#initial', '1000000'); await page.locator('#term').fill('12'); await page.locator('#rate').fill('10');
      close(await number(page, '#beforeTax'), 1_100_000, 1);
      await page.keyboard.press('Escape');
      assert(!await page.locator('#modalBg').evaluate(x => x.classList.contains('open')), 'Escape did not close modal');
    });
    await test('browser/publication', 'Логотипы, фоны и напоминание после загрузки и перерисовки', async page => {
      const missing = await page.evaluate(() => performance.getEntriesByType('resource').filter(x => /publication\.js/.test(x.name)).map(x => x.name));
      assert(missing.length === 0, 'Obsolete publication script still requested');
      for (const query of ['TMON', '']) {
        await page.locator('#search').fill(query);
        const logos = page.locator('#grid>.card .top img');
        assert(await logos.count() === await page.locator('#grid>.card').count(), 'Fund logos missing');
        await logos.first().evaluate(img => img.decode());
        assert(await logos.evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), 'Broken fund logo');
      }
      for (const [name, selector] of [['funds', '.funds-scenery img'], ['mission', '.mission-scenery img']]) {
        await show(page, name);
        await page.locator(selector).evaluate(img => img.decode());
        assert(await page.locator(selector).isVisible(), `${name} background missing`);
      }
      for (const name of ['funds', 'nszh', 'spk', 'model', 'smart-deposits']) {
        await show(page, name);
        assert(await page.locator('.site-independence').isVisible(), `Independence note hidden on ${name}`);
        assert(await page.locator('.site-independence').evaluate(x => !x.closest('main')), 'Note moved into dynamic pages');
      }
    });
    await test('browser/product-selection', 'Подбор передаёт срок и ставку в калькулятор', async page => {
      await page.locator('#ctPayoutToggle').click(); await page.locator('#ctType').selectOption('products'); await page.locator('#ctApply').click();
      const card = page.locator('#ctRail .ct-product').filter({ hasText: 'Т‑Счёт' });
      const rates = (await json('rates.json')).tAccount.rates.months;
      const term = Math.max(...Object.keys(rates).map(Number));
      const option = card.locator('option').filter({ hasText: `${term} мес.` });
      await card.locator('select').selectOption({ label: await option.textContent() });
      await card.locator('.ct-open-product').click();
      assert(await page.locator('#taccTerm').inputValue() === `months:${term}`, 'Selected offer term not transferred');
      close(Number(await page.locator('#taccRate').inputValue()), rates[term]);
      await fillAmount(page, '#taccAmount', '1000000');
      close(await number(page, '#taccProductBefore'), 1_000_000 + 1_000_000 * rates[term] / 100 * term / 12, 1);
      await show(page, 'funds');
      await card.locator('select').selectOption('months:3');
      await card.locator('.ct-open-product').click();
      assert(await page.locator('#taccTerm').inputValue() === 'months:3', 'Repeated selection lost');
      close(Number(await page.locator('#taccRate').inputValue()), rates['3']);
    });
    await test('browser/product-selection-loading', 'Выбранный срок сохраняется при медленной загрузке условий', async page => {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      const rates = await json('rates.json');
      let requests = 0;
      await page.route('**/rates.json*', async route => {
        if (++requests === 1) await gate; // Calculator request precedes the catalogue's request.
        await route.fulfill({ json: rates });
      });
      try {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('#ctPayoutToggle').click(); await page.locator('#ctType').selectOption('products'); await page.locator('#ctApply').click();
        const card = page.locator('#ctRail .ct-product').filter({ hasText: 'Т‑Счёт' });
        await card.locator('option[value="months:18"]').waitFor({ state: 'attached' });
        await card.locator('select').selectOption('months:18'); await card.locator('.ct-open-product').click();
        release();
        await page.waitForFunction(() => document.getElementById('taccTerm').value === 'months:18');
        close(Number(await page.locator('#taccRate').inputValue()), rates.tAccount.rates.months['18']);
      } finally { release(); }
    });
    await test('browser/product-favorites', 'Избранный продукт виден после перезагрузки', async page => {
      await page.locator('#ctPayoutToggle').click(); await page.locator('#ctType').selectOption('products'); await page.locator('#ctApply').click();
      await page.locator('[data-favorite="product:taccount"]').click();
      await page.reload({ waitUntil: 'networkidle' }); await page.locator('[data-catalog-mode="favorites"]').click();
      assert(await page.locator('[data-favorite="product:taccount"]:visible').count() === 1, 'Favorite product counted but not displayed');
      assert(await page.locator('#count').textContent() === 'Показано: 1', 'Favorite product not counted');
      await page.locator('#search').fill('Инвестзайм');
      assert(await page.locator('[data-favorite="product:taccount"]:visible').count() === 0, 'Favorite product ignores search');
      await page.locator('#search').fill('');
      await page.locator('[data-favorite="product:taccount"]').click();
      assert(await page.locator('#count').textContent() === 'Показано: 0', 'Removed favorite still counted');
      assert(await page.locator('#empty').isVisible(), 'Empty favorites message hidden');
      await page.locator('[data-catalog-mode="all"]').click();
      assert(await page.locator('.ct-product:visible').count() === 0, 'Products leaked into all-funds view');
    });
    await test('browser/mixed-favorites', 'Избранные продукты, фонды и синхронизация вкладок', async page => {
      await page.locator('[data-fund-ticker="TMON"] .ct-star').click();
      await page.locator('#ctPayoutToggle').click(); await page.locator('#ctType').selectOption('products'); await page.locator('#ctApply').click();
      for (const id of ['taccount', 'investloan', 'rentier']) await page.locator(`[data-favorite="product:${id}"]`).click();
      await page.reload({ waitUntil: 'networkidle' }); await page.locator('[data-catalog-mode="favorites"]').click();
      assert(await page.locator('.ct-product:visible').count() === 3, 'Some favorite products missing');
      assert(await page.locator('#grid>.card').count() === 1, 'Favorite fund disappeared');
      assert(await page.locator('#count').textContent() === 'Показано: 4', 'Mixed favorite count incorrect');
      const tab = await page.context().newPage();
      try {
        await tab.goto(page.url(), { waitUntil: 'networkidle' });
        await tab.evaluate(() => localStorage.setItem('funds-favorites-v1', JSON.stringify(['product:investloan'])));
        await page.waitForFunction(() => document.getElementById('count').textContent === 'Показано: 1');
        assert(await page.locator('[data-favorite="product:investloan"]:visible').count() === 1, 'Other-tab update lost product');
      } finally { await tab.close(); }
    });
    await test('finance/products', 'Т‑Счёт и Инвестзайм: доход и НДФЛ', async page => {
      const config = await json('rates.json');
      for (const [name, prefix, key] of [['taccount', 'tacc', 'tAccount'], ['investloan', 'loan', 'investLoan']]) {
        await show(page, name); await fillAmount(page, `#${prefix}Amount`, '2000000');
        await page.locator(`#${prefix}Term`).selectOption('months:6'); await page.locator(`#${prefix}Tax`).check();
        const income = 2_000_000 * config[key].rates.months['6'] / 100 / 2;
        close(await number(page, `#${prefix}ProductBefore`), 2_000_000 + income, 1);
        close(await number(page, `#${prefix}ProductAfter`), 2_000_000 + income * .87, 1);
        await page.locator(`#${prefix}DepositRate`).fill('12');
        for (const [cap, periods] of [['none', 1], ['monthly', 6], ['daily', 182.5]]) {
          await page.locator(`#${prefix}DepositCap`).selectOption(cap);
          // Independent repeated accrual; the half-day uses the documented fractional-period convention.
          let balance = 2_000_000;
          const step = cap === 'daily' ? .12 / 365 : cap === 'monthly' ? .01 : .06;
          for (let i = 0; i < Math.floor(periods); i++) balance += balance * step;
          if (periods % 1) balance *= Math.sqrt(1 + step);
          close(await number(page, `#${prefix}DepositBefore`), balance, 1);
        }
      }
      await page.locator('[data-loan-payout="monthly"]').click();
      const monthly = await json('investloan-monthly-rates.json');
      close(Number(await page.locator('#loanRate').inputValue()), monthly.rates.months['6']);
      await page.locator('.loan-payout-schedule').evaluate(x => { x.open = true; });
      const values = await page.locator('.loan-payout-items b').allTextContents();
      const sum = values.reduce((a, x) => a + Number(x.replace(/\D/g, '')), 0);
      close(sum, 2_000_000 * monthly.rates.months['6'] / 200, 6);
    });
    await test('finance/spk-nszh', 'СПК и НСЖ: начисление и налоговый переключатель', async page => {
      await show(page, 'spk'); await fillAmount(page, '#spkAmount', '1000000'); await page.locator('#spkTerm').fill('12');
      await page.locator('#spkSegment').selectOption('employee'); await page.locator('#spkTax').check();
      const rate = (await json('market-rates.json')).rusfar.value / 100;
      let balance = 1_000_000; for (let day = 0; day < 365; day++) balance += balance * rate / 365;
      close(await number(page, '#spkBefore'), 1_000_000 + (balance - 1_000_000) * .87, 1);
      await page.locator('#spkTax').uncheck(); close(await number(page, '#spkBefore'), balance, 1);
      await show(page, 'nszh'); await page.locator('#nszhAmount').fill('500000'); await page.locator('#nszhTerm').selectOption('60');
      const terms = (await json('nszh-config.json')).terms;
      const total = 500_000 + 500_000 * terms.find(x => x.months === 60).annualRate / 100 * 5;
      await page.locator('#nszhExempt').check(); close(await number(page, '#nszhAfter'), total, 1);
      await page.locator('#nszhExempt').uncheck(); close(await number(page, '#nszhAfter'), 500_000 + (total - 500_000) * .87, 1);
      await page.locator('#nszhAmount').fill('100'); assert(await page.locator('#nszhAfter').textContent() === '—', 'Below-minimum NSZH calculated');
    });
    await test('finance/rentier', 'Рантье: периодичность, сумма выплат и возврат взноса', async page => {
      await show(page, 'nszh'); await page.locator('[data-program="rentier"]').click();
      await page.locator('#rentierAmount').fill('500000'); await page.locator('#rentierYears').selectOption('3');
      const config = await json('rentier-config.json');
      for (const frequency of [12, 4, 2, 1]) {
        await page.locator(`[data-frequency="${frequency}"]`).click();
        const income = 500_000 * config.rates[frequency][2] / 100 * 3;
        close(await number(page, '#rentierPayment'), income / (3 * frequency), 1);
        close(await number(page, '#rentierTotal'), income, 1);
        close(await number(page, '#rentierReturn'), 500_000, 1);
        assert(await page.locator('#rentierPayments article').count() === 3 * frequency, 'Incorrect payout count');
      }
      await page.locator('#rentierAmount').fill('100');
      assert(await page.locator('#rentierTotal').textContent() === '—', 'Below-minimum Rentier calculated');
    });
    await test('browser/mobile-navigation', 'Навигация и адаптация 360–1440 px', async page => {
      for (const width of [360, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [name, id] of [['funds', 'fundsPage'], ['taccount', 'taccountPage'], ['investloan', 'investloanPage'], ['spk', 'spkPage'], ['nszh', 'nszhPage'], ['model', 'modelPage']]) {
          await show(page, name);
          assert(await page.locator(`#${id}`).evaluate(x => x.classList.contains('active')), `${name} not active`);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} overflow at ${width}px`);
        }
      }
    });
    await test('browser/offline-json', 'Недоступный funds.json: резервный каталог', async page => {
      await page.route('**/funds.json*', route => route.fulfill({ status: 503, body: 'Unavailable' }));
      await page.reload({ waitUntil: 'networkidle' }); await page.locator('#search').fill('TMON');
      assert(await page.locator('#grid>.card').count() === 1, 'Fallback catalogue broken');
    });
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
