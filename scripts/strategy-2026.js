(() => {
  'use strict';
  const menu = document.querySelector('.smart-sales-menu');
  const modelButton = menu?.querySelector('[data-smart-page="model"]');
  if (!modelButton || document.getElementById('smart-strategyPage')) return;
  const sourceUrl = 'https://www.tbank.ru/invest/research/strategy/2026-autumn-update/';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Number(value).toLocaleString('ru-RU', {maximumFractionDigits:2});
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('.') : value;
  const external = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.smartPage = 'strategy'; button.innerHTML = '<b>Стратегия 2026</b>';
  modelButton.after(button);
  button.addEventListener('click', () => window.showProductPage('smart-strategy'));
  const page = document.createElement('section');
  page.id = 'smart-strategyPage'; page.className = 'product-page strategy-page'; page.setAttribute('aria-labelledby', 'strategyTitle');
  page.innerHTML = '<div class="strategy-loading" role="status">Загрузка стратегии…</div>';
  const main = document.querySelector('main'), footer = main.querySelector('.product-pages-note');
  if (footer) footer.before(page); else main.append(page);
  let data, loading = false, seen = false, activeTab = 'bonds', revealObserver;

  function jump(id, tab) {
    if (tab) selectTab(tab);
    const target = page.querySelector('#' + id);
    if (!target) return;
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'start', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }
  function markSeen() {
    seen = true; page.classList.add('strategy-seen'); revealObserver?.disconnect();
  }
  function selectTab(tab, focus = false) {
    if (!data || !Object.hasOwn(data.ideas, tab)) return;
    activeTab = tab;
    page.querySelectorAll('[data-strategy-tab]').forEach(b => {
      const active = b.dataset.strategyTab === tab;
      b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1;
      if (active && focus) b.focus();
    });
    const stocks = tab === 'stocks';
    const source = stocks ? data.stocksSourceUrl : data.sourceUrl;
    const panel = page.querySelector('#strategyIdeasPanel');
    panel.setAttribute('aria-labelledby', 'strategyTab-' + tab);
    panel.innerHTML = `<table class="strategy-table"><caption class="strategy-sr-only">${stocks ? 'Целевые цены акций' : 'Доходности облигаций'} из стратегии, рыночные данные на ${esc(date(data.marketDataAsOf))}</caption><thead><tr><th scope="col">${stocks ? 'Компания' : 'Выпуск'}</th><th scope="col">${stocks ? 'Целевая цена' : 'Доходность к погашению'}</th><th scope="col">${stocks ? 'Горизонт цели' : 'Погашение'}</th><th scope="col"><span class="strategy-sr-only">Подробности</span></th></tr></thead><tbody>${data.ideas[tab].map((item, i) => `<tr><th scope="row">${esc(item.name)}${item.kind ? `<small>${esc(item.kind)}</small>` : ''}</th><td data-label="${stocks ? 'Целевая цена' : 'Доходность к погашению'}"><b>${number(stocks ? item.targetPrice : item.yield)}${stocks ? ' ₽' : '%'}</b><small>${stocks ? 'оценка аналитиков · RUB' : esc(item.currency === 'RUB' ? 'в рублях · RUB' : item.currency === 'CNY' ? 'в юанях · CNY' : 'в долларах · USD')}</small></td><td data-label="${stocks ? 'Горизонт цели' : 'Погашение'}">${stocks ? 'Не указан в сохранённой подборке' : esc(date(item.maturity))}</td><td class="strategy-detail-control"><button type="button" data-strategy-detail="${i}" aria-expanded="false" aria-controls="strategyDetail-${tab}-${i}" aria-label="Подробнее: ${esc(item.name)}"><span aria-hidden="true">›</span></button></td></tr><tr id="strategyDetail-${tab}-${i}" class="strategy-detail-row" hidden><td colspan="4"><p>${esc(item.note)}</p><p>${stocks ? 'Целевая цена не гарантирует будущую стоимость акции.' : 'Доходность к погашению не равна купону или гарантированному доходу. Условия покупки, комиссии и НДФЛ проверяются отдельно.'}</p>${external(source, 'Проверить в стратегии')}</td></tr>`).join('')}</tbody></table><p class="strategy-table-note">${stocks ? 'Целевые цены из публикации, не текущие котировки. Срок достижения сверяйте в оригинале.' : 'Доходности на дату источника, не текущие котировки. Разные валюты напрямую не сравниваются.'}</p>`;
  }
  function render() {
    const equity = data.equityIndex[0];
    page.innerHTML = `<div class="strategy-crumb">Умные продажи / Стратегия 2026</div><h1 id="strategyTitle">Стратегия 2026</h1><div class="strategy-intro"><p>Главные ориентиры, идеи и сценарии — в одном месте</p><span class="strategy-source-pill">Т‑Инвестиции · ${esc(data.period)}</span></div>
      <div class="strategy-overview"><section class="strategy-card" aria-labelledby="strategyMacroTitle"><h2 id="strategyMacroTitle">Макроориентиры <small>Прогноз · 2026</small></h2>${data.macro.map(m => `<div class="strategy-macro-row"><span>${esc(m.name)}</span><b>${number(m.value2026)}${m.unit === '%' ? '%' : ' ₽'}</b></div>`).join('')}<p class="strategy-note">Валюта и ставка — конец 2026 года. Инфляция — по итогам 2026 года.</p></section>
      <section class="strategy-card" aria-labelledby="strategyStocksTitle"><h2 id="strategyStocksTitle">Рынок акций</h2><div class="strategy-index">${number(equity.low)}–${number(equity.high)}</div><p class="strategy-subdued">Прогноз индекса Мосбиржи, пунктов<br>${esc(equity.period)}</p><button class="strategy-link" type="button" data-strategy-jump="strategyIdeasTitle" data-strategy-open-tab="stocks">Секторы и идеи ниже ↓</button></section>
      <section class="strategy-card" aria-labelledby="strategyBondsTitle"><h2 id="strategyBondsTitle">Облигации</h2><p class="strategy-bond-lines">Надёжные эмитенты<br>Короткие и средние сроки</p><span class="strategy-chip">Фиксированный + плавающий купон</span><br><button class="strategy-link" type="button" data-strategy-jump="strategyIdeasTitle" data-strategy-open-tab="bonds">Посмотреть идеи ниже ↓</button><p class="strategy-note">Длинные ОФЗ — для высокой готовности к риску.</p></section>
      <section class="strategy-card" aria-labelledby="strategyRisksTitle"><h2 id="strategyRisksTitle">Что может изменить прогноз</h2>${[['Инфляция и решения ЦБ','inflation'],['Бюджет и налоги','budget'],['Нефть и геополитика','external']].map(([title,id]) => `<button type="button" class="strategy-risk-link" data-strategy-scenario="${id}">${title}<span aria-hidden="true">+</span></button>`).join('')}<button class="strategy-link" type="button" data-strategy-jump="strategyScenariosTitle">Разобрать сценарии ниже ↓</button></section></div>
      <div class="strategy-scroll-invitation"><div class="strategy-scroll-message"><svg class="strategy-scroll-arrow" viewBox="0 0 20 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 5 6 6 6-6"/><path d="m4 12 6 6 6-6"/></svg><div><b>Ниже — идеи и сценарии</b><small>Примеры инструментов и пояснения к прогнозам</small></div></div><button type="button" class="strategy-link" data-strategy-jump="strategyIdeasTitle">Посмотреть ↓</button></div>
      <section class="strategy-lower" aria-labelledby="strategyIdeasTitle"><div class="strategy-section-head"><div><h2 id="strategyIdeasTitle" tabindex="-1">Идеи из стратегии</h2><p class="strategy-subdued">Подборка аналитиков · рыночные данные на ${esc(date(data.marketDataAsOf))}</p></div><span>01 / Идеи</span></div><div class="strategy-idea-panel"><div class="strategy-tabs" role="tablist" aria-label="Класс активов">${[['bonds','Облигации'],['stocks','Акции'],['currency','Валютная часть']].map(([id,label], i) => `<button type="button" role="tab" id="strategyTab-${id}" data-strategy-tab="${id}" aria-controls="strategyIdeasPanel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join('')}</div><div id="strategyIdeasPanel" role="tabpanel" tabindex="0" aria-labelledby="strategyTab-bonds"></div></div></section>
      <section class="strategy-lower" aria-labelledby="strategyScenariosTitle"><div class="strategy-section-head"><div><h2 id="strategyScenariosTitle" tabindex="-1">Если сценарий изменится</h2><p class="strategy-subdued">Что может повлиять на прогноз — и почему это важно</p></div><span>02 / Сценарии</span></div>${data.scenarios.map(s => `<details class="strategy-accordion" id="strategyScenario-${esc(s.id)}"><summary>${esc(s.title)}<span aria-hidden="true">+</span></summary><div class="strategy-scenario-body"><div><small>Что меняется</small><p>${esc(s.change)}</p></div><div><small>Что обсудить</small><p>${esc(s.discussion)}</p></div></div></details>`).join('')}<p class="strategy-note">Пояснения показывают возможные связи, а не готовые торговые сигналы.</p>
      <details class="strategy-accordion strategy-future-accordion"><summary>Ориентиры аналитиков на 2027 год<span aria-hidden="true">⌄</span></summary><div class="strategy-future">${data.macro.map(m => `<div><span>${esc(m.name)}</span><b>${number(m.value2027)}${m.unit === '%' ? '%' : ' ₽'}</b><small>${esc(m.period2027)}</small></div>`).join('')}<p class="strategy-note">Валютные курсы — среднегодовые, ставка — на конец года; это разные горизонты.</p>${data.equityIndex.slice(1).map(x => `<p class="strategy-subdued">Индекс Мосбиржи: ${number(x.low)}–${number(x.high)} пунктов · ${esc(x.period)}</p>`).join('')}</div></details>
      <div class="strategy-last-actions">${external(data.sourceUrl, 'Полная стратегия Т‑Инвестиций')}<button type="button" class="strategy-model">Открыть модельный портфель →</button></div><p class="strategy-end-note">Прогнозы могут измениться. Не является индивидуальной инвестиционной рекомендацией.</p><p class="strategy-end-note">Сохранённый обзор: ${esc(data.period)}. Проверено ${esc(date(data.reviewedAt))}. Рыночные данные — на ${esc(date(data.marketDataAsOf))}.</p></section>`;
    page.classList.toggle('strategy-seen', seen);
    selectTab(activeTab);
    revealObserver?.disconnect();
    if (!seen && typeof IntersectionObserver === 'function') {
      revealObserver = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) markSeen(); }, {threshold:.35});
      revealObserver.observe(page.querySelector('.strategy-idea-panel'));
    }
  }
  async function load() {
    if (loading || data) return;
    loading = true; page.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('./strategy-2026.json?v=20261104', {cache:'no-store'});
      if (!response.ok) throw Error('HTTP ' + response.status);
      const payload = await response.json();
      if (payload.version !== 1 || !Array.isArray(payload.macro) || payload.macro.length !== 4 || !payload.ideas?.bonds?.length || !payload.ideas?.stocks?.length || !payload.ideas?.currency?.length || !payload.scenarios?.length || !payload.equityIndex?.length) throw Error('Invalid strategy snapshot');
      if (!payload.macro.every(m => Number.isFinite(m.value2026) && Number.isFinite(m.value2027) && m.period2026 && m.period2027) || !payload.equityIndex.every(x => Number.isFinite(x.low) && Number.isFinite(x.high) && x.low <= x.high && x.period) || !Object.entries(payload.ideas).every(([group, rows]) => Array.isArray(rows) && rows.every(x => x.name && ['RUB','CNY','USD'].includes(x.currency) && Number.isFinite(group === 'stocks' ? x.targetPrice : x.yield)))) throw Error('Invalid financial values');
      const sources = [payload.sourceUrl, payload.stocksSourceUrl].map(x => new URL(x));
      if (sources.some(x => x.protocol !== 'https:' || x.hostname !== 'www.tbank.ru')) throw Error('Invalid source');
      data = payload; render();
    } catch {
      data = undefined;
      page.innerHTML = `<h1 id="strategyTitle">Стратегия 2026</h1><p role="status">Не удалось загрузить сохранённую стратегию. Попробуйте ещё раз или откройте оригинал.</p><button type="button" class="strategy-retry">Повторить загрузку</button><p>${external(sourceUrl, 'Открыть стратегию Т‑Инвестиций')}</p>`;
    } finally { loading = false; page.setAttribute('aria-busy', 'false'); }
  }
  page.addEventListener('click', e => {
    const control = e.target.closest('button');
    if (!control) return;
    if (control.matches('.strategy-retry')) return load();
    if (control.matches('.strategy-model')) return window.showProductPage('model');
    if (control.dataset.strategyTab) return selectTab(control.dataset.strategyTab);
    if (control.hasAttribute('data-strategy-detail')) {
      const row = page.querySelector('#' + control.getAttribute('aria-controls'));
      row.hidden = !row.hidden; control.setAttribute('aria-expanded', String(!row.hidden)); return;
    }
    if (control.dataset.strategyScenario) {
      const details = page.querySelector('#strategyScenario-' + control.dataset.strategyScenario);
      details.open = true; return jump('strategyScenariosTitle');
    }
    if (control.dataset.strategyJump) jump(control.dataset.strategyJump, control.dataset.strategyOpenTab);
  });
  page.addEventListener('keydown', e => {
    const tab = e.target.closest('[data-strategy-tab]');
    if (!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    e.preventDefault();
    const tabs = [...page.querySelectorAll('[data-strategy-tab]')], i = tabs.indexOf(tab);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectTab(tabs[next].dataset.strategyTab, true);
  });
  new MutationObserver(() => { if (page.classList.contains('active')) load(); }).observe(page, {attributes:true, attributeFilter:['class']});
})();
