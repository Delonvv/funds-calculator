import { json, assert } from './core.mjs';

// Calendar-day budgets tolerate weekends; they are monitoring policy, not market rates.
export const budgets = { updateHours: 36, fileDays: 3, marketDays: 7, historyDays: 7, manualDays: 90 };
export function ageDays(value, now = new Date()) {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|T| )/.test(value), `Invalid date: ${value}`);
  let normalized = value;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) normalized = value.replace(' ', 'T') + '+03:00';
  const date = new Date(normalized);
  const calendarDate = new Date(value.slice(0, 10));
  assert(Number.isFinite(date.getTime()) && Number.isFinite(calendarDate.getTime()) && calendarDate.toISOString().slice(0, 10) === value.slice(0, 10), `Invalid date: ${value}`);
  const days = (now - date) / 86400000;
  assert(days >= -1, `Future date: ${value}`);
  return days;
}
export function fresh(value, maxDays, label, now) {
  const age = ageDays(value, now);
  assert(age <= maxDays, `${label}: ${value}, age ${age.toFixed(1)} days > ${maxDays}`);
}
export async function getUpdateRuns({ repository = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN, apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com', request = fetch } = {}) {
  assert(repository && token, 'GITHUB_REPOSITORY and read-only GITHUB_TOKEN required for update history');
  const url = `${apiUrl}/repos/${repository}/actions/workflows/update-funds.yml/runs?branch=main&per_page=100&exclude_pull_requests=true`;
  const response = await request(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000) });
  assert(response.ok, `Update history API: HTTP ${response.status}`);
  return (await response.json()).workflow_runs;
}
export function validateRuns(runs, now = new Date()) {
  assert(Array.isArray(runs), 'Missing workflow runs');
  const completed = runs.filter(x => x.status === 'completed').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  assert(completed.length > 0, 'No completed update runs on main');
  assert(completed[0].conclusion === 'success', `Latest completed update: ${completed[0].conclusion}; ${completed[0].html_url}`);
  fresh(completed[0].updated_at, budgets.updateHours / 24, 'Last successful update', now);
  const cutoff = now.getTime() - 7 * 86400000;
  const failures = completed.filter(x => new Date(x.created_at).getTime() >= cutoff && x.conclusion !== 'success');
  assert(failures.length === 0, `Failed/cancelled updates in last 7 days: ${failures.map(x => `${x.conclusion} ${x.html_url}`).join('; ')}`);
}
export async function weeklyChecks(check, { now = new Date(), load = json, runs = getUpdateRuns } = {}) {
  const funds = await load('funds.json');
  for (const file of ['funds.json', 'market-rates.json', 'dcm.json']) {
    await check(`data/file/${file}`, `Свежесть ${file}`, async () => {
      fresh((await load(file)).updatedAt, budgets.fileDays, file, now);
    });
  }
  await check('data/update-warnings', 'Диагностика обновления фондов', async () => {
    assert(Array.isArray(funds.failedTickers), 'failedTickers missing');
    assert(funds.failedTickers.length === 0, `Updater warnings: ${funds.failedTickers.join('; ')}`);
    fresh(funds.lastRun, budgets.fileDays, 'funds.lastRun', now);
  });
  await check('data/market-coverage', 'Полнота набора котировок', async () => {
    assert(Object.keys(funds.market || {}).length > 0, 'No quotes');
    assert(Array.isArray(funds.tickers), 'Ticker list missing');
    assert(Object.keys(funds.market).every(t => funds.tickers.includes(t)), 'Quote outside ticker list');
  });
  for (const [ticker, value] of Object.entries(funds.market || {})) {
    await check(`data/quote/${ticker}`, `Котировка ${ticker}`, () => fresh(value.asOf, budgets.marketDays, ticker, now));
  }
  for (const [ticker, value] of Object.entries(funds.history || {})) {
    const automatic = /moex\.com/i.test(value.source || '');
    await check(`data/history/${ticker}`, `История ${ticker}`, () => fresh(value.asOf, automatic ? budgets.historyDays : budgets.manualDays, ticker, now));
  }
  for (const [ticker, value] of Object.entries(funds.nav || {})) {
    await check(`data/nav/${ticker}`, `Дата СЧА ${ticker}`, () => fresh(value.asOf, budgets.manualDays, `NAV ${ticker}`, now));
  }
  await check('data/rusfar', 'Дата значения RUSFAR', async () => {
    const rate = (await load('market-rates.json')).rusfar;
    assert(Number.isFinite(rate.value) && rate.value > 0, 'Invalid RUSFAR value');
    fresh(rate.valueDate, budgets.marketDays, 'RUSFAR value', now);
  });
  await check('data/update-workflow', 'Результаты обновления за последние 7 дней', async () => validateRuns(await runs(), now));
}
