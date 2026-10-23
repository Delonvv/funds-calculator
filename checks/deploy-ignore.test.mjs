import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/netlify-ignore-auto-data.sh', import.meta.url));
const workflow = readFileSync(new URL('../.github/workflows/update-funds.yml', import.meta.url), 'utf8');

test('Netlify skips only marked bot data commits and keeps ordinary builds enabled', async t => {
  // Real Git commits in an isolated fixture; no updater, remote push or build hook.
  const directory = mkdtempSync(path.join(tmpdir(), 'funds-deploy-ignore-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  let revision = 0;
  function commit(author, message, files) {
    for (const file of files) writeFileSync(path.join(directory, file), `fixture revision ${++revision}\n`);
    git('add', '--all');
    execFileSync('git', ['commit', '-q', '--allow-empty', '-m', message], {
      cwd: directory,
      env: { ...process.env, GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: author, GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }
  function decision(ref = 'HEAD') {
    const result = spawnSync('bash', [script], { cwd: directory, encoding: 'utf8', env: { ...process.env, COMMIT_REF: ref } });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert([0, 1].includes(result.status), result.stderr);
    return result.status; // Netlify: 0 = skip, 1 = build.
  }
  const match = workflow.match(/git commit -m "([^"]+)"/);
  assert(match, 'Updater commit message not found');
  const message = match[1];
  commit('Developer', 'Initial website', ['index.html']);
  await t.test('ordinary website commit builds', () => assert.equal(decision(), 1));
  await t.test('actual updater message skips duplicate Git build for all data files', () => {
    commit('funds-data-bot', message, ['funds.json', 'market-rates.json', 'dcm.json']);
    assert.equal(decision(), 0);
  });
  await t.test('single data file update also skips duplicate build', () => {
    commit('funds-data-bot', message, ['dcm.json']);
    assert.equal(decision(), 0);
  });
  await t.test('bot without marker builds', () => {
    commit('funds-data-bot', 'Data update without hook marker', ['funds.json']);
    assert.equal(decision(), 1);
  });
  await t.test('human data edit builds even with marker', () => {
    commit('Developer', message, ['market-rates.json']);
    assert.equal(decision(), 1);
  });
  await t.test('website change is never skipped by data marker', () => {
    commit('funds-data-bot', message, ['funds.json', 'index.html']);
    assert.equal(decision(), 1);
  });
  await t.test('empty commit and invalid reference keep build enabled', () => {
    commit('funds-data-bot', message, []);
    assert.equal(decision(), 1);
    assert.equal(decision('invalid-fixture-ref'), 1);
  });
});
