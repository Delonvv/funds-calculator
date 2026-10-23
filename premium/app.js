(() => {
  'use strict';
  const page = document.getElementById('premiumPage');
  if (!page) return;
  const byId = id => page.querySelector('#' + id);
  const model = window.PREMIUM_DATA;
  if (!model) {
    byId('selectioncount').textContent = 'Данные сравнения недоступны. Обновите страницу.';
    return;
  }
  const meta = model.banks;
  const board = byId('board');
  const names = ['Платный вход', 'Начальный', 'Расширенный', 'Старший'];
  const descriptions = ['Обслуживание за плату', 'Первые пакеты по активам', 'Расширенные привилегии', 'Старшие пакеты'];
  const rowLabels = { 3: 'Бизнес-залы', 8: 'Fast Track · без очереди', 4: 'Рестораны', 5: 'Такси / каршеринг', 6: 'Страхование', 7: 'Что важно' };
  const periodLabels = { month: 'В МЕСЯЦ', year: 'В ГОД', '30-days': 'КАЖДЫЕ 30 ДНЕЙ' };
  const expanded = new Set(['1:7', '5:5']);
  let stage = 2;
  let visible = [true, true, false, false, false, true, false];
  const safe = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const value = (bank, row) => model.stages[stage][bank][row].map(safe);

  function extra(bank) {
    if (bank === 1 && stage === 1) return 'Также уровень 1: от 2 млн ₽, без залов. Здесь показан уровень 2 от 3 млн ₽.';
    if (bank === 1 && stage === 3) return 'Также уровни 5 и 6: от 30 и 100 млн ₽. <a class="source" href="#premium-sber">Все уровни →</a>';
    if (bank === 5 && stage === 2) return 'Также OPC при 7 млн ₽: поездки до 10 000 ₽ в год. Лимиты залов и ресторанов те же.';
    return '';
  }

  function periods(bank, row) {
    return (model.periods[`${stage}:${bank}:${row}`] || [])
      .map(period => `<em>${periodLabels[period]}</em>`).join('');
  }

  function benefit(bank, row) {
    const key = `${bank}:${row}`;
    const open = expanded.has(key);
    const [summary, detail] = value(bank, row);
    const source = model.fastTrack[`${stage}:${bank}`];
    return `<div class="benefitwrap">
      <button type="button" data-benefit="${key}" class="benefitbtn ${row === 8 ? 'airport' : ''} ${open ? 'open' : ''}" aria-expanded="${open}">
        <span>${rowLabels[row]} ${open ? '−' : '+'}</span><b>${summary}</b>
        <span class="period-labels">${periods(bank, row)}</span>
        ${open ? `<small>${detail}</small>` : row === 3 ? `<small class="critical">${detail}</small>` : ''}
      </button>
      ${row === 8 ? `<a class="proof-link" href="${safe(source.url)}" target="_blank" rel="noopener noreferrer">Источник условий →</a>` : ''}
    </div>`;
  }

  function card(bank) {
    const m = meta[bank];
    const additional = extra(bank);
    return `<article data-bank-id="${m.id}" class="bcard ${m.id === 't' ? 'highlight' : ''}">
      <div class="bankth"><span class="bank ${m.color}">${m.letter}</span><b>${m.name}</b></div>
      <h3>${value(bank, 0)[0]}</h3><p class="tier">${value(bank, 2)[0]}</p>
      <p class="entry">${value(bank, 1)[0]}</p><p class="thresholdnote">${value(bank, 1)[1]}</p>
      ${[3, 8, 4, 5, 6, 7].map(row => benefit(bank, row)).join('')}
      ${additional ? `<div class="miniinfo" style="margin-top:12px">${additional}</div>` : ''}
    </article>`;
  }

  function updateArrows() {
    byId('prev').disabled = board.scrollLeft < 2;
    byId('next').disabled = board.scrollLeft + board.clientWidth >= board.scrollWidth - 2;
  }

  function slide(direction) {
    const width = board.querySelector('.bcard').getBoundingClientRect().width + 14;
    board.scrollBy({ left: direction * width, behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' });
  }

  function render(keepScroll = false) {
    const left = keepScroll ? board.scrollLeft : 0;
    const focus = document.activeElement;
    const restore = ['bank', 'stage', 'benefit'].map(key => [key, focus?.dataset[key]]).find(([, val]) => val !== undefined);
    byId('selectioncount').textContent = `Выбрано ${visible.filter(Boolean).length} из 7 · чёрный — выбран, серый — скрыт`;
    byId('bankbuttons').innerHTML = meta.map((m, i) =>
      `<button type="button" data-bank="${i}" class="${visible[i] ? 'on' : ''}" aria-pressed="${visible[i]}">${visible[i] ? '✓ ' : ''}${m.name}</button>`).join('');
    byId('rail').innerHTML = names.map((name, i) =>
      `<button type="button" data-stage="${i}" class="${stage === i ? 'on' : ''}" aria-pressed="${stage === i}"><span class="step">0${i + 1}</span><span><b>${name}</b><small>${descriptions[i]}</small></span></button>`).join('');
    byId('currentstage').textContent = `${names[stage]} уровень`;
    board.innerHTML = meta.map((_, i) => visible[i] ? card(i) : '').join('');
    board.scrollLeft = left;
    if (restore) page.querySelector(`[data-${restore[0]}="${restore[1]}"]`)?.focus({ preventScroll: true });
    updateArrows();
  }

  byId('bankbuttons').addEventListener('click', event => {
    const button = event.target.closest('[data-bank]');
    if (!button) return;
    const bank = Number(button.dataset.bank);
    if (visible[bank] && visible.filter(Boolean).length === 1) {
      byId('selectioncount').textContent = 'Оставьте хотя бы один банк для сравнения';
      return;
    }
    visible[bank] = !visible[bank];
    render();
  });
  byId('rail').addEventListener('click', event => {
    const button = event.target.closest('[data-stage]');
    if (!button) return;
    stage = Number(button.dataset.stage);
    render();
  });
  board.addEventListener('click', event => {
    const button = event.target.closest('[data-benefit]');
    if (!button) return;
    const key = button.dataset.benefit;
    expanded.has(key) ? expanded.delete(key) : expanded.add(key);
    render(true);
  });
  board.addEventListener('scroll', updateArrows);
  window.addEventListener('resize', updateArrows);
  byId('prev').addEventListener('click', () => slide(-1));
  byId('next').addEventListener('click', () => slide(1));
  render();
  // The carousel is initially hidden when another section is active. Re-measure on open.
  new MutationObserver(updateArrows).observe(page, { attributes: true, attributeFilter: ['class'] });
})();
