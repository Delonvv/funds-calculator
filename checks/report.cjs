const fs = require('node:fs');

function bodyFor(scope, failures, context) {
  const marker = `<!-- funds-calculator-monitor:${scope}:v1 -->`;
  const run = `${context.serverUrl || 'https://github.com'}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const heading = scope === 'daily' ? 'Ежедневные проверки сайта' : 'Еженедельные проверки данных и обновления';
  const lines = failures.slice(0, 50).map(item => {
    const detail = String(item.detail || '').replace(/`/g, "'").slice(0, 1500);
    return `- **${item.title}** (\`${item.id}\`)\n  ${detail.replaceAll('\n', '\n  ')}`;
  });
  return `${marker}\n## ${heading}\n\n${failures.length ? `Обнаружено проблем: ${failures.length}.` : 'Все проверки этой группы восстановились.'}\n\n` +
    `Последний отчёт: [GitHub Actions](${run}). Коммит: \`${context.sha}\`.\n\n${lines.join('\n\n')}\n\n` +
    'Полный JSON, сводка и снимки ошибок доступны в артефакте project-check-results этого запуска. ' +
    'Финансовые тесты проверяют сценарную арифметику, а не подтверждают актуальность ставок или налоговых правил.\n\n' +
    'Эта Issue управляется workflow: повторные сбои обновляют её, восстановление закрывает, повторное появление переоткрывает.\n';
}

async function syncIssue(github, context, scope, failures) {
  const marker = `<!-- funds-calculator-monitor:${scope}:v1 -->`;
  const items = await github.paginate(github.rest.issues.listForRepo, { ...context.repo, state: 'all', creator: 'github-actions[bot]', per_page: 100 });
  const existing = items.filter(x => !x.pull_request && x.user?.login === 'github-actions[bot]' && x.body?.includes(marker))
    .sort((a, b) => a.number - b.number)[0];
  if (!failures.length && (!existing || existing.state === 'closed')) return;
  const body = bodyFor(scope, failures, context);
  if (existing) {
    await github.rest.issues.update({ ...context.repo, issue_number: existing.number, body, state: failures.length ? 'open' : 'closed' });
  } else if (failures.length) {
    await github.rest.issues.create({ ...context.repo, title: `[Автопроверки] ${scope === 'daily' ? 'Сайт и расчёты' : 'Данные и обновление'}`, body });
  }
}

async function report({ github, context, core, readReport = () => JSON.parse(fs.readFileSync('checks/results/report.json', 'utf8')) }) {
  // Defense in depth: never write Issues from a PR or a non-default-branch dispatch.
  if (!['schedule', 'workflow_dispatch'].includes(context.eventName) || context.ref !== 'refs/heads/main') return;
  let data;
  try {
    data = readReport();
    if (data.version !== 1 || !Array.isArray(data.daily) || !data.daily.length || !data.daily.every(x => typeof x.ok === 'boolean')) throw Error('Invalid report');
  } catch {
    core.warning('Check report unavailable; reporting infrastructure failure');
    data = { daily: [{ id: 'monitor/infrastructure', title: 'Не удалось завершить проверки', ok: false, detail: 'Смотрите шаги установки, самотестирования и запуска в журнале Actions.' }] };
  }
  if (process.env.CHECK_JOB_RESULT !== 'success' && !data.daily.some(x => !x.ok) && !(data.weekly || []).some(x => !x.ok)) {
    data.daily.push({ id: 'monitor/infrastructure', title: 'Ошибка выполнения workflow', ok: false, detail: 'Проверьте журнал Actions; успешного полного результата нет.' });
  }
  await syncIssue(github, context, 'daily', data.daily.filter(x => !x.ok));
  if (process.env.CHECK_WEEKLY === 'true') {
    const weekly = Array.isArray(data.weekly) && data.weekly.length ? data.weekly : [{ id: 'monitor/weekly-incomplete', title: 'Еженедельные проверки не завершены', ok: false }];
    await syncIssue(github, context, 'weekly', weekly.filter(x => !x.ok));
  }
}
module.exports = { report, syncIssue, bodyFor };
