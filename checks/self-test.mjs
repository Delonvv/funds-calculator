import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import './deploy-ignore.test.mjs';
import { ageDays, fresh, validateRuns, weeklyChecks, getUpdateRuns } from './weekly.mjs';
const { syncIssue, report } = createRequire(import.meta.url)('./report.cjs');

test('freshness catches stale values, missing dates, impossible dates and future dates', () => {
  const now = new Date('2026-10-26T04:00:00Z');
  fresh('2026-10-23', 7, 'Friday value on Monday', now);
  assert.throws(() => fresh('2026-10-01', 7, 'old', now));
  assert.throws(() => ageDays(null, now));
  assert.throws(() => ageDays('2026-02-30', now));
  assert.throws(() => ageDays('2027-01-01', now));
});

test('successful updater status cannot hide stale or failed runs', () => {
  const now = new Date('2026-10-26T04:00:00Z');
  const success = { status: 'completed', conclusion: 'success', created_at: '2026-10-25T09:40:00Z', updated_at: '2026-10-25T09:42:00Z', html_url: 'https://example.com/run' };
  validateRuns([success], now);
  assert.throws(() => validateRuns([], now));
  assert.throws(() => validateRuns([{ ...success, conclusion: 'failure' }], now));
  assert.throws(() => validateRuns([success], new Date('2026-10-30')));
  assert.throws(() => validateRuns([success, { ...success, created_at: '2026-10-24T09:40:00Z', conclusion: 'failure' }], now));
});

test('update API requests main with bounded timeout and reports access errors', async () => {
  const options = { repository: 'test/funds', token: 'test-fixture-token' };
  let requested;
  assert.deepEqual(await getUpdateRuns({ ...options, request: async (url, config) => {
    requested = url; assert(config.signal); return { ok: true, json: async () => ({ workflow_runs: [] }) };
  } }), []);
  assert.match(requested, /update-funds\.yml\/runs\?branch=main/);
  await assert.rejects(getUpdateRuns({ ...options, request: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
});

test('fresh file timestamp does not mask stale individual quote or updater warnings', async () => {
  const results = [];
  const check = async (id, title, operation) => { try { await operation(); } catch { results.push(id); } };
  const now = new Date('2026-10-26T04:00:00Z');
  await weeklyChecks(check, { now, runs: async () => [], load: async file => file === 'funds.json' ? {
    updatedAt: '2026-10-26', lastRun: '2026-10-26', failedTickers: ['TMON: error'], tickers: ['TMON'],
    market: { TMON: { asOf: '2026-09-01' } }, history: {}, nav: {}
  } : { updatedAt: '2026-10-26', rusfar: { value: 14, valueDate: '2026-10-23' } } });
  assert(results.includes('data/quote/TMON'));
  assert(results.includes('data/update-warnings'));
  assert(!results.includes('data/file/funds.json'));
});

function mockGithub() {
  const issues = []; const calls = [];
  return { issues, calls, paginate: async () => issues, rest: { issues: {
    listForRepo() {},
    create: async value => { calls.push('create'); issues.push({ ...value, number: issues.length + 1, state: 'open', user: { login: 'github-actions[bot]' } }); },
    update: async value => { calls.push('update'); Object.assign(issues.find(x => x.number === value.issue_number), value); }
  } } };
}
const context = { repo: { owner: 'test', repo: 'funds' }, runId: 1, sha: 'abc', eventName: 'schedule', ref: 'refs/heads/main' };
const failure = [{ id: 'test/failure', title: 'Test', detail: 'Failure' }];

test('Issues: one creation, repeated failure updates, recovery closes, recurrence reopens', async () => {
  const github = mockGithub();
  await syncIssue(github, context, 'daily', []); assert.equal(github.calls.length, 0);
  await syncIssue(github, context, 'daily', failure);
  await syncIssue(github, context, 'daily', failure);
  assert.equal(github.issues.length, 1); assert.deepEqual(github.calls, ['create', 'update']);
  await syncIssue(github, context, 'daily', []); assert.equal(github.issues[0].state, 'closed');
  const calls = github.calls.length;
  await syncIssue(github, context, 'daily', []); assert.equal(github.calls.length, calls);
  await syncIssue(github, context, 'daily', failure); assert.equal(github.issues[0].state, 'open');
  assert.equal(github.issues.length, 1);
  await syncIssue(github, context, 'weekly', failure); assert.equal(github.issues.length, 2);
});

test('reporter never writes from PRs or non-main dispatches', async () => {
  const github = mockGithub();
  await report({ github, context: { ...context, eventName: 'pull_request' }, core: {} });
  await report({ github, context: { ...context, eventName: 'workflow_dispatch', ref: 'refs/heads/test' }, core: {} });
  assert.equal(github.calls.length, 0);
});

test('missing reports and incomplete weekly runs create infrastructure reports using mock API only', async () => {
  const github = mockGithub();
  const previous = { weekly: process.env.CHECK_WEEKLY, job: process.env.CHECK_JOB_RESULT };
  try {
    process.env.CHECK_WEEKLY = 'true'; process.env.CHECK_JOB_RESULT = 'failure';
    await report({ github, context, core: { warning() {} }, readReport: () => { throw Error('Missing'); } });
    assert.equal(github.issues.length, 2);
    assert.match(github.issues[0].body, /monitor\/infrastructure/);
    assert.match(github.issues[1].body, /monitor\/weekly-incomplete/);
    process.env.CHECK_JOB_RESULT = 'success';
    await report({ github, context, core: {}, readReport: () => ({ version: 1, daily: [{ ok: true }], weekly: [{ ok: true }] }) });
    assert(github.issues.every(x => x.state === 'closed'));
  } finally {
    if (previous.weekly === undefined) delete process.env.CHECK_WEEKLY; else process.env.CHECK_WEEKLY = previous.weekly;
    if (previous.job === undefined) delete process.env.CHECK_JOB_RESULT; else process.env.CHECK_JOB_RESULT = previous.job;
  }
});
