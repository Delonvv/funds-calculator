import {calculatePds} from './pds-model.mjs';

const nav = document.querySelector('.product-nav');
const menu = nav?.querySelector('.smart-sales-nav');
if (nav && menu && !document.getElementById('pdsPage')) {
  const tab = document.createElement('button');
  tab.type = 'button'; tab.className = 'product-tab'; tab.dataset.page = 'pds'; tab.textContent = 'ПДС';
  menu.before(tab);
  const page = document.createElement('section');
  page.id = 'pdsPage'; page.className = 'product-page pds-page'; page.setAttribute('aria-labelledby', 'pdsTitle');
  const main = document.querySelector('main'), footer = main.querySelector('.product-pages-note');
  if (footer) footer.before(page); else main.append(page);
  page.innerHTML = '<div class="pds-loading" role="status">Загрузка условий ПДС…</div>';
  let config, loading = false, annual = 36000, period = 'annual';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Number(value).toLocaleString('ru-RU', {maximumFractionDigits:2});
  const money = value => number(value) + ' ₽';
  const fieldNumber = value => {
    const text = String(value).replace(/[\s\u00a0]/g, '').replace(',', '.');
    return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
  };
  const q = id => page.querySelector('#pds' + id);
  const currentYear = () => Number(new Intl.DateTimeFormat('en', {year:'numeric', timeZone:'Europe/Moscow'}).format(new Date()));
  const link = (url, title) => /^https:\/\//.test(url || '') ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)} ↗</a>` : esc(title);
  const previous = window.showProductPage;
  window.showProductPage = function(name) {
    if (name !== 'pds') return previous(name);
    previous('funds');
    document.querySelectorAll('.product-page').forEach(node => node.classList.toggle('active', node === page));
    document.querySelectorAll('.product-tab').forEach(node => node.classList.toggle('active', node === tab));
    history.replaceState(null, '', '#pds');
    window.scrollTo({top:0, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    load();
  };
  tab.onclick = () => window.showProductPage('pds');
  window.addEventListener('hashchange', () => { if (location.hash === '#pds') window.showProductPage('pds'); });

  function validate(c) {
    if (c?.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(c.checkedAt || '')) throw Error('Неверный формат условий');
    const values = [c.support?.minimumAnnual,c.support?.annualCap,c.support?.years,c.tax?.scenarioRate,c.tax?.annualContributionLimit,c.payments?.years,c.payments?.ages?.female,c.payments?.ages?.male,c.guarantee?.years,...Object.values(c.support?.divisors || {}),c.returns?.historicalPercent,c.returns?.forecastMaxPercent,c.promo?.nominalPercent,c.promo?.capitalizedPercent];
    if (values.some(x => !Number.isFinite(x) || x <= 0) || c.tax.scenarioRate > 1 || ['low','middle','high'].some(x => !c.support.divisors[x])) throw Error('Некорректные числа в условиях');
    if (!c.sources?.program || !c.sources?.help || !c.promo?.termsUrl) throw Error('Нет источника условий');
  }
  async function load() {
    if (config || loading) return;
    loading = true;
    try {
      const response = await fetch('./pds-config.json?v=' + Date.now(), {cache:'no-store'});
      if (!response.ok) throw Error('HTTP ' + response.status);
      const next = await response.json(); validate(next); config = next; mount();
    } catch {
      page.innerHTML = '<h1 id="pdsTitle">ПДС · Т‑Пенсия</h1><p role="status">Не удалось загрузить условия. Расчёт недоступен, чтобы не подставлять неподтверждённые значения.</p><button type="button" class="pds-calculate" id="pdsRetry">Повторить загрузку</button><p><a href="https://www.tbank.ru/pension/" target="_blank" rel="noopener noreferrer">Условия Т‑Пенсии ↗</a></p>';
      q('Retry').onclick = load;
    } finally { loading = false; }
  }
  function mount() {
    const p = config.promo, sources = config.sources;
    page.innerHTML = `
      <div class="pds-heading"><div><h1 id="pdsTitle">ПДС · Т‑Пенсия</h1><p class="pds-lead">Расчёт накоплений и срока начала выплат</p></div><button type="button" class="pds-promo-shortcut" id="pdsPromoShortcut" aria-controls="pdsPromo">ПДС + вклад · акция <span aria-hidden="true">↓</span></button></div>
      <form id="pdsForm" class="pds-form" novalidate>
        <label class="pds-field"><span class="pds-amount-head"><span>Взнос, ₽</span><span class="pds-period" role="group" aria-label="Период взноса"><button type="button" data-pds-period="monthly" aria-pressed="false">В месяц</button><button type="button" data-pds-period="annual" aria-pressed="true">В год</button></span></span><input id="pdsAmount" inputmode="decimal" value="36 000" aria-describedby="pdsTaxAssumption"></label>
        <label class="pds-field">Срок, лет<input id="pdsYears" type="number" min="1" max="30" step="1" value="5"></label>
        <label class="pds-field pds-field-income">Средний доход в месяц<select id="pdsIncome"><option value="">Выберите доход</option><option value="low">До 80 000 ₽ включительно</option><option value="middle">Свыше 80 000 до 150 000 ₽</option><option value="high">Свыше 150 000 ₽</option></select></label>
        <button class="pds-calculate" type="submit">Рассчитать</button>
      </form>
      <p class="pds-small" id="pdsTaxAssumption">НДФЛ для оценки возврата — 13% по умолчанию. При переключении периода сохраняется годовой взнос.</p>
      <details class="pds-parameters"><summary>Параметры клиента</summary><div class="pds-parameter-fields"><label class="pds-field">Возраст<input id="pdsAge" type="number" min="18" max="110" step="1" placeholder="Укажите возраст"></label><label class="pds-field">Пол<select id="pdsSex"><option value="">Выберите</option><option value="female">Женщина</option><option value="male">Мужчина</option></select></label></div></details>
      <p class="pds-error" id="pdsError" role="alert"></p><p class="pds-assumption" id="pdsAssumption"></p>
      <section class="pds-status" id="pdsStatus" aria-live="polite" aria-atomic="true"><span class="pds-status-icon" aria-hidden="true" id="pdsStatusIcon">◷</span><div><span class="pds-status-label">Когда можно начать получать выплаты</span><strong id="pdsEligibility"></strong><p id="pdsEligibilityNote"></p></div></section>
      <h2>По выбранному плану</h2>
      <div class="pds-benefits" id="pdsBenefits">
        <section class="pds-benefit"><h3>Софинансирование</h3><strong id="pdsSupport"></strong><p id="pdsSupportNote"></p><details><summary>Подробнее</summary><p>Это потенциальная доплата за взносные годы, а не уже доступная к выводу сумма. От ${money(config.support.minimumAnnual)} личных взносов в календарный год; максимум ${money(config.support.annualCap)} за год, до ${config.support.years} лет. Пропорция зависит от среднего дохода: 1:1, 1:2 или 1:4. Доход и условия проверяются ежегодно.</p><p>Зачисление происходит позднее взносов — как правило, в следующем году. Перед назначением выплат нужно проверить фактические зачисления и действующие условия. Вывод может прекратить право на будущую господдержку, в том числе по другим договорам.</p><p>${link(sources.support,'Правила софинансирования')}</p></details></section>
        <section class="pds-benefit"><h3>Налоговый возврат</h3><strong id="pdsTax"></strong><p id="pdsTaxNote"></p><details><summary>Подробнее</summary><p id="pdsTaxDetails"></p><p>Оценка условная: необходимы подходящий доход, достаточный уплаченный НДФЛ и соблюдение остальных условий НК РФ. Не более трёх договоров ПДС одновременно. Общий лимит взносов для вычета по ПДС, НПО, ИИС‑3 и другим учитываемым долгосрочным продуктам — ${money(config.tax.annualContributionLimit)} в год; использованную часть лимита нужно учитывать отдельно.</p><p>Возврат поступает отдельно и не зачисляется в ПДС автоматически. Фактическая ставка НДФЛ может отличаться от принятых в примере 13%.</p><p>${link(sources.tax,'Условия налогового вычета')}</p></details></section>
        <section class="pds-benefit"><h3>Безубыточность НПФ</h3><strong id="pdsGuarantee"></strong><p id="pdsGuaranteeNote"></p><details><summary>Подробнее</summary><p>По предоставленному материалу НПФ компенсирует убытки от инвестирования по итогам каждого пятилетнего периода. Дату фиксации, базу компенсации и применимость к конкретному договору проверяют по правилам фонда.</p><p>Это не ежегодная гарантия доходности, не компенсация инфляции и не обещание свободного вывода всей суммы. Страхование АСВ — отдельная защита при гарантийном случае.</p><p>${link(sources.help,'Разъяснение Т‑Пенсии')}</p></details></section>
        <details class="pds-incomes"><summary>Какие доходы подходят для вычета?</summary><div><p>Официальная зарплата, выплаты по ГПХ и доход от аренды — при обложении НДФЛ по основной налоговой базе.</p><p>Только государственная пенсия или доход самозанятого на НПД сами по себе такого возврата не дают. Налог с дивидендов и процентов по вкладам не считается автоматически подходящим НДФЛ для этого вычета.</p><p>Проверьте налоговое резидентство, базу и фактически уплаченный налог. ${link(sources.incomes,'Разъяснение ФНС')}</p></div></details>
      </div>
      <p class="pds-small" id="pdsPersonal"></p><p class="pds-small">Расчётный пример при неизменных правилах и выполнении условий. Инвестиционный доход в эти суммы не включён; фактическая выплата не рассчитана.</p>
      <details class="pds-lower"><summary>Условия выплат и расчёт срока</summary><div class="pds-detail-body"><p id="pdsTimingDetails"></p><p>Право обратиться за назначением выплат возникает по возрасту (55 лет для женщин, 60 для мужчин) либо через 15 лет участия — что наступит раньше. Возраст без даты рождения даёт только приблизительный срок, не точную дату перечисления.</p><p>Возрастное право не означает возможность получить все средства единовременно. У Т‑Пенсии возможны регулярные выплаты на срок от года; получение всей суммы по возрасту связано с установленным критерием размера пожизненной выплаты. После 15 лет условия единовременной выплаты отличаются. Проверяйте правила договора, фактическое поступление господдержки и налоговые последствия.</p><p>Этот экран предполагает новый личный договор в текущем году. Для ранее открытого договора и иных оснований (особые жизненные ситуации, договор в пользу другого лица) нужен отдельный расчёт по документам.</p><p>${link(sources.program,'Условия Т‑Пенсии')} · ${link(sources.help,'Порядок выплат')}</p></div></details>
      <div class="pds-history">${number(config.returns.historicalPercent)}% годовых — результат за ${config.returns.historicalYear} · до ${number(config.returns.forecastMaxPercent)}% годовых — прогноз на ${config.returns.forecastYear}<small>Доходность не гарантирована. Прогноз не является ставкой на весь выбранный срок и не используется автоматически в расчёте.</small></div>
      <details class="pds-lower pds-promo" id="pdsPromo"><summary>ПДС + вклад · акция</summary><div class="pds-detail-body"><p>Условия из присланного предложения. Доступность акции и текущую ставку проверяйте перед оформлением.</p><div class="pds-promo-facts"><div><strong>${number(p.nominalPercent)}% годовых</strong><span>Номинальная ставка вклада на ${p.months} месяцев</span></div><div><strong>${number(p.capitalizedPercent)}%</strong><span>Доходность при капитализации процентов</span></div></div><ol><li>Открыть новый ПДС и пополнить его от ${money(p.minimumAmount)} в течение ${p.fundingDays} дней.</li><li>Открыть непополняемый вклад на ${p.months} месяцев от ${money(p.minimumAmount)} и пополнить его в течение ${p.fundingDays} дней с открытия ПДС.</li><li>Повышенная ставка подключается автоматически в течение ${p.activationDays} дней после выполнения условий — на сумму не больше пополнения ПДС, остатка вклада и ${money(p.maximumBoostedAmount)}.</li></ol><p>Пример из материала: ПДС ${money(150000)}, вклад ${money(200000)} — повышенная ставка на ${money(150000)}, на оставшиеся ${money(50000)} действует базовая ставка.</p><p>Один ПДС и один акционный вклад; только для клиентов, у которых ранее не было ПДС на дату начала акции. Вклад на 12 месяцев, без пополнения, кроме первого месяца; продление — по стандартной ставке.</p><p>При закрытии ПДС или любом выводе из него ставка по вкладу становится базовой. Повторное участие не предусмотрено. Не сравнивайте номинальные 15% и доходность 16,07% как две разные акционные ставки.</p><p>${link(p.termsUrl,'Полные условия акции')} · ${link(sources.promo,'Страница предложения')}</p><p class="pds-small">Источник: предоставленный PDF, стр. 1–2. Ставки не обновляются автоматически и не включены в расчёт льгот ПДС.</p></div></details>
      <details class="pds-lower" id="pdsMemo"><summary>Памятка менеджеру</summary><div class="pds-detail-body"><p>По присланному материалу ПДС сочетает личные взносы, господдержку при выполнении условий и инвестиционный результат. Налоговый возврат зависит от права на вычет и уплаченного НДФЛ. Он не является инвестиционной доходностью.</p><p>Материал указывает возможность назначить правопреемников, пятилетнюю безубыточность и государственное гарантирование личных средств с инвестдоходом до 2,8 млн ₽ на этапе накопления. Условия, состав защищённых средств, исключения и правовые ограничения проверяют по правилам программы; это не гарантия инвестиционной ставки.</p><p>Условия защиты при разводе или аресте и освобождения инвестдохода от НДФЛ применяются с предусмотренными законом ограничениями. Для конкретного клиента нужно сверить договор и актуальные правила.</p><p>${link(sources.program,'Официальная страница программы')}</p></div></details>
      <p class="pds-small">Источники проверены ${esc(config.checkedAt.split('-').reverse().join('.'))}. Суммы льгот — условные ориентиры, не гарантированная выплата.</p>`;
    q('PromoShortcut').onclick = () => {
      const promo = q('Promo');
      promo.open = true;
      promo.querySelector('summary').focus({preventScroll:true});
      promo.scrollIntoView({block:'start', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    };
    q('Form').addEventListener('submit', event => { event.preventDefault(); render(true); });
    q('Amount').addEventListener('input', () => { const n = fieldNumber(q('Amount').value); annual = n * (period === 'monthly' ? 12 : 1); });
    q('Amount').addEventListener('blur', () => { if (Number.isFinite(annual)) q('Amount').value = number(period === 'monthly' ? annual / 12 : annual); });
    for (const id of ['Amount','Years','Income','Age','Sex']) q(id).addEventListener('change', () => render());
    page.querySelectorAll('[data-pds-period]').forEach(button => button.onclick = () => {
      period = button.dataset.pdsPeriod;
      page.querySelectorAll('[data-pds-period]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      if (Number.isFinite(annual)) q('Amount').value = number(period === 'monthly' ? annual / 12 : annual);
      render();
    });
    render();
  }
  function render(focusError = false) {
    let r;
    try {
      r = calculatePds({annual, years:q('Years').value, income:q('Income').value, age:q('Age').value, sex:q('Sex').value, contractYear:currentYear()}, config);
      q('Error').textContent = ''; q('Benefits').hidden = false;
    } catch (error) {
      q('Error').textContent = error.message;
      q('Benefits').hidden = true;
      q('Status').dataset.state = 'unknown'; q('Eligibility').textContent = 'Проверьте параметры расчёта';
      q('EligibilityNote').textContent = ''; q('StatusIcon').textContent = '◷'; q('Personal').textContent = '';
      if (focusError) { q('Error').tabIndex = -1; q('Error').focus({preventScroll:true}); }
      return;
    }
    q('Assumption').textContent = `Пример для нового личного договора ${r.contractYear} года; одинаковый годовой взнос на всём горизонте.`;
    q('Status').dataset.state = r.ageMetNow ? 'met' : 'future'; q('StatusIcon').textContent = r.ageMetNow ? '✓' : '◷';
    q('Eligibility').textContent = r.ageMetNow ? 'Возрастное условие выполнено' : r.wait === 15 ? 'По сроку участия — ориентировочно через 15 лет' : `По возрасту — ориентировочно через ${r.wait} ${yearsWord(r.wait)}`;
    q('EligibilityNote').textContent = r.ageMetNow ? 'Можно обратиться за назначением выплат. Формат и сумма определяются отдельно.' : `${r.eligibleAtEnd ? 'К концу выбранного срока основание для назначения выплат возникнет.' : 'К концу выбранного срока основание по возрасту или 15-летнему участию ещё не наступит.'}${r.ageWait === null ? ' Для проверки возраста укажите возраст и пол.' : ''} Господдержка и единовременный вывод проверяются отдельно.`;
    q('Support').textContent = r.support === null ? 'Укажите средний доход' : `до ${money(r.support)} за ${r.supportYears} ${yearsWord(r.supportYears)}`;
    q('SupportNote').textContent = r.support === null ? 'Без группы дохода не подставляем коэффициент господдержки.' : r.annual < config.support.minimumAnnual ? `Для господдержки нужно внести от ${money(config.support.minimumAnnual)} за календарный год.` : `При ежегодном выполнении условий; до ${money(r.supportAnnual)} за взносный год. Зачисление позднее взносов, не гарантированная сумма к выводу.`;
    q('Tax').textContent = r.taxTermMet ? `до ${money(r.taxPotential)} за ${r.years} ${yearsWord(r.years)}` : 'При таком выходе льгота не сохраняется';
    q('TaxNote').textContent = r.taxTermMet ? 'При подходящем доходе и достаточном НДФЛ. Возврат отдельно; другие условия вычета также должны соблюдаться.' : `До минимального срока ещё ${r.taxRemaining} ${yearsWord(r.taxRemaining)}. Ранее полученные вычеты нужно вернуть при таком выходе; возрастное право не отменяет срок.`;
    q('TaxDetails').textContent = `Для нового договора ${r.contractYear} года минимальный срок до обращения за выплатами для сохранения вычета — ${r.minimumTaxYears} ${yearsWord(r.minimumTaxYears)}. Потенциальный возврат за один год при принятых 13% — до ${money(r.taxAnnual)}. Вычет можно заявлять за соответствующие годы при соблюдении условий; если выйти раньше минимума, льгота не сохраняется.`;
    q('Guarantee').textContent = r.guaranteeCycles ? 'Пятилетний период' : 'Пятилетний период не завершён';
    q('GuaranteeNote').textContent = r.guaranteeCycles ? 'По итогам пятилетних периодов — по условиям фонда. Это не обещанная ставка и не рассчитанная компенсация.' : 'При выходе на выбранном горизонте компенсацию по итогам пятилетнего периода нельзя считать уже полученной.';
    q('Personal').textContent = `Личные взносы за ${r.years} ${yearsWord(r.years)}: ${money(r.personal)}. Налоговый возврат показан отдельно от счёта ПДС.`;
    q('TimingDetails').textContent = `Выбран план на ${r.years} ${yearsWord(r.years)}. Отсчёт — от нового договора; оценка по полным годам возраста. Выбор срока в калькуляторе не означает, что этот срок уже прошёл.`;
  }
  function yearsWord(n) {
    const tens = n % 100, units = n % 10;
    return tens >= 11 && tens <= 14 ? 'лет' : units === 1 ? 'год' : units >= 2 && units <= 4 ? 'года' : 'лет';
  }
  if (location.hash === '#pds') window.showProductPage('pds');
}
