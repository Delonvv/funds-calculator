import fs from 'node:fs/promises';

const FILE = new URL('../funds.json', import.meta.url);
const data = JSON.parse(await fs.readFile(FILE, 'utf8'));
const tickers = Array.isArray(data.tickers) ? data.tickers : [];
const skippedHistory = new Set(['TPAY', 'TGLD']);

const iso = d => d.toISOString().slice(0, 10);
const now = new Date();
const from = new Date(now);
from.setUTCFullYear(from.getUTCFullYear() - 1);
from.setUTCDate(from.getUTCDate() - 45);

function targetDate(months) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return iso(d);
}

function nearestOnOrBefore(candles, date) {
  const eligible = candles.filter(x => x.date <= date);
  return eligible.length ? eligible[eligible.length - 1] : null;
}

async function getJson(url) {
  const response = await fetch(url, {headers: {'user-agent': 'funds-calculator-weekly/1.0'}});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function updateTicker(ticker) {
  const marketUrl = `https://iss.moex.com/iss/engines/stock/markets/shares/securities/${encodeURIComponent(ticker)}.json?iss.meta=off&iss.only=marketdata&marketdata.columns=SECID,LAST,MARKETPRICE,SYSTIME`;
  const marketJson = await getJson(marketUrl);
  const row = marketJson.marketdata?.data?.find(r => r[1] != null || r[2] != null);
  const price = row ? Number(row[1] ?? row[2]) : NaN;
  if (Number.isFinite(price) && price > 0) {
    data.market[ticker] = {
      price,
      currency: 'RUB',
      asOf: row[3] || new Date().toISOString(),
      source: 'https://www.moex.com/'
    };
  }

  if (skippedHistory.has(ticker)) return;
  const candlesUrl = `https://iss.moex.com/iss/engines/stock/markets/shares/securities/${encodeURIComponent(ticker)}/candles.json?iss.meta=off&from=${iso(from)}&interval=24&candles.columns=close,end`;
  const candlesJson = await getJson(candlesUrl);
  const candles = (candlesJson.candles?.data || [])
    .map(r => ({close: Number(r[0]), date: String(r[1]).slice(0, 10)}))
    .filter(x => Number.isFinite(x.close) && x.close > 0 && /^\d{4}-\d{2}-\d{2}$/.test(x.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (candles.length < 2) return;
  const latest = candles[candles.length - 1];
  const returns = {};
  for (const [key, months] of [['m1', 1], ['m6', 6], ['y1', 12]]) {
    const base = nearestOnOrBefore(candles, targetDate(months));
    returns[key] = base ? Number((((latest.close / base.close) - 1) * 100).toFixed(2)) : null;
  }
  data.history[ticker] = {
    source: `https://www.moex.com/ru/issue.aspx?code=${encodeURIComponent(ticker)}`,
    asOf: latest.date,
    currency: 'RUB',
    returns,
    basis: 'Изменение биржевой цены; выплаты не добавлены'
  };
}

const failures = [];
for (const ticker of tickers) {
  try {
    await updateTicker(ticker);
  } catch (error) {
    failures.push(`${ticker}: ${error.message}`);
  }
}

data.updatedAt = iso(now);
data.lastRun = new Date().toISOString();
data.failedTickers = failures;
await fs.writeFile(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`Updated ${tickers.length - failures.length}/${tickers.length}; failures: ${failures.length}`);
if (failures.length) console.log(failures.join('\n'));
