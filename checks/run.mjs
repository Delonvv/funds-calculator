import fs from 'node:fs/promises';
import { root } from './core.mjs';
import { staticChecks, financialChecks } from './core.mjs';
import { browserChecks } from './browser.mjs';
import { weeklyChecks } from './weekly.mjs';

const weekly = process.argv.includes('--weekly');
const results = { version: 1, checkedAt: new Date().toISOString(), daily: [], ...(weekly ? { weekly: [] } : {}) };
const directory = `${root}checks/results`;
await fs.mkdir(directory, { recursive: true });
function checker(scope) {
  return async (id, title, operation) => {
    try {
      await operation();
      results[scope].push({ id, title, ok: true });
      console.log(`PASS ${id}`);
    } catch (error) {
      results[scope].push({ id, title, ok: false, detail: String(error.message).slice(0, 5000) });
      console.error(`FAIL ${id}: ${error.message}`);
    }
  };
}
try {
  const daily = checker('daily');
  await staticChecks(daily);
  await financialChecks(daily);
  await daily('browser/runner', 'Запуск браузерных проверок', () => browserChecks(daily, directory));
  if (weekly) await checker('weekly')('weekly/runner', 'Проверки данных и обновления', () => weeklyChecks(checker('weekly')));
} finally {
  await fs.writeFile(`${directory}/report.json`, JSON.stringify(results, null, 2) + '\n');
  const failures = [...results.daily, ...(results.weekly || [])].filter(x => !x.ok);
  const summary = `# Funds calculator checks\n\n${failures.length ? `${failures.length} проверок выявили проблемы` : 'Проверки пройдены'}\n\n` +
    Object.entries(results).filter(([, items]) => Array.isArray(items)).map(([scope, items]) =>
      `## ${scope}\n\n` + items.map(x => `- ${x.ok ? '✅' : '❌'} ${x.title} (\`${x.id}\`)`).join('\n')).join('\n\n');
  await fs.writeFile(`${directory}/summary.md`, summary + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  if (failures.length) process.exitCode = 1;
}
