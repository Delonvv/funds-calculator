import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const read = file => fs.readFile(path.join(root, file), 'utf8');
export const json = async file => JSON.parse(await read(file));
export function assert(condition, message) { if (!condition) throw Error(message); }
export function close(actual, expected, tolerance = 0.01) {
  assert(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `Expected ${expected}, received ${actual}`);
}

export async function staticChecks(check) {
  const html = await read('index.html');
  await check('static/javascript', 'JavaScript: синтаксис', async () => {
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc\s*=|\btype\s*=\s*["']application\/ld\+json/i.test(match[1])) new vm.Script(match[2]);
    }
    for (const name of (await fs.readdir(path.join(root, 'scripts'))).filter(x => /\.(m?js)$/.test(x))) {
      const result = spawnSync(process.execPath, ['--check', path.join(root, 'scripts', name)], { encoding: 'utf8' });
      assert(result.status === 0, `${name}: ${result.stderr}`);
    }
  });
  await check('static/json', 'JSON: структура и конечные числа', async () => {
    function numbers(value) {
      if (typeof value === 'number') assert(Number.isFinite(value), 'Non-finite JSON number');
      else if (value && typeof value === 'object') Object.values(value).forEach(numbers);
    }
    for (const name of (await fs.readdir(root)).filter(x => x.endsWith('.json'))) numbers(await json(name));
    const funds = await json('funds.json');
    assert(Array.isArray(funds.tickers) && funds.tickers.length > 0, 'funds.tickers missing');
    assert(new Set(funds.tickers).size === funds.tickers.length, 'Duplicate tickers');
    for (const key of ['market', 'nav', 'history']) assert(funds[key] && typeof funds[key] === 'object', `funds.${key} missing`);
    for (const [ticker, quote] of Object.entries(funds.market)) {
      assert(Number.isFinite(quote.price) && quote.price > 0 && quote.currency && quote.asOf, `Invalid quote: ${ticker}`);
    }
    const placements = (await json('dcm.json')).placements;
    assert(Array.isArray(placements), 'dcm.placements missing');
    assert(new Set(placements.map(x => x.sourceId || x.id)).size === placements.length, 'Duplicate placements');
    assert(placements.every(x => x.id && x.issuer && x.currency), 'Incomplete placement');
    const rates = await json('rates.json');
    for (const name of ['tAccount', 'investLoan']) assert(Object.keys(rates[name].rates.months).length > 0, `${name}: empty terms`);
  });
  await check('static/site-package', 'Статический сайт: точка входа и локальные ресурсы', async () => {
    assert(/<html\b/i.test(html) && /<main\b/i.test(html), 'HTML entry point missing');
    const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>');
    const missing = new Set();
    for (const tag of markup.matchAll(/<(?:script|link|img|image)\b[^>]*>/gi)) {
      for (const attr of tag[0].matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
        const url = attr[1];
        if (/^(?:[a-z]+:|\/\/|#)/i.test(url)) continue;
        const file = path.resolve(root, url.split(/[?#]/)[0].replace(/^\//, ''));
        assert(file.startsWith(root), 'Resource outside site root');
        try { await fs.access(file); } catch { missing.add(url); }
      }
    }
    assert(missing.size === 0, `Missing resources: ${[...missing].join(', ')}`);
  });
}

export async function financialChecks(check) {
  await check('finance/fund-model', 'Фонды: независимые числовые примеры сценарной модели', async () => {
    const html = await read('index.html');
    const start = html.indexOf('function incomeTax('), end = html.indexOf('const metricsSnapshot', start);
    assert(start >= 0 && end > start, 'Production calculation functions not found');
    const context = vm.createContext({});
    vm.runInContext(html.slice(start, end), context, { timeout: 1000 });
    const calc = overrides => context.calculateScenario({ initial: 1_000_000, term: 12, unit: 'months', rate: 10, depositRate: 12, ...overrides });
    let result = calc({});
    close(result.beforeTax, 1_100_000); close(result.tax, 13_000); close(result.afterTax, 1_087_000);
    close(result.depositProfit, 120_000); close(result.depositTaxMax, 15_600);
    close(result.differenceMin, -17_400);
    result = calc({ rate: -10 }); close(result.afterTax, 900_000); close(result.tax, 0);
    result = calc({ initial: 0 }); close(result.afterTax, 0); close(result.tax, 0);
    result = calc({ initial: 10_000_000, rate: 30 }); close(result.tax, 402_000);
    close(context.incomeTax(2_400_000), 312_000); close(context.incomeTax(2_400_100), 312_015);
    result = calc({ unit: 'days', term: 365 }); close(result.beforeTax, 1_100_000);
    result = calc({ term: 6 }); close(result.beforeTax, 1_050_000);
    result = calc({ fee: 1, fundFeeEnabled: true }); close(result.beforeTax, 1_090_000);
    result = calc({ fee: 1, fundFeeEnabled: false }); close(result.beforeTax, 1_100_000);
    result = calc({ depositTaxEnabled: false }); close(result.depositTaxMax, 0); close(result.tax, 13_000);
  });
}
