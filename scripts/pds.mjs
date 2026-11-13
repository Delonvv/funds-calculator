import {calculatePds} from './pds-model.mjs';
import {projectPdsScenario, DEFAULT_PDS_SCENARIO_RATE} from './pds-scenario.mjs?v=20261113-scenario';

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
  let config, loading = false, annual = 36000, period = 'annual', scenarioRatePercent = DEFAULT_PDS_SCENARIO_RATE;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Number(value).toLocaleString('ru-RU', {maximumFractionDigits:2});
  const money = value => number(value) + ' ₽';
  const scenarioMoney = value => '≈ ' + Math.round(value).toLocaleString('ru-RU') + ' ₽';
  const scenarioPercent = value => value === null ? '—' : '≈ ' + (value * 100).toLocaleString('ru-RU', {maximumFractionDigits:1}) + '% годовых';
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
    const values = [c.support?.minimumAnnual,c.support?.annualCap,c.support?.years,c.tax?.scenarioRate,c.tax?.annualContributionLimit,c.payments?.years,c.payments?.ages?.female,c.payments?.ages?.male,c.guarantee?.years,...Object.values(c.support?.divisors || {}),c.returns?.historicalPercent,c.returns?.forecastMaxPercent,c.promo?.nominalPercent,c.promo?.capitalizedPercent,c.promo?.months,c.promo?.minimumAmount,c.promo?.maximumBoostedAmount,c.promo?.fundingDays,c.promo?.activationDays];
    if (values.some(x => !Number.isFinite(x) || x <= 0) || c.tax.scenarioRate > 1 || ['low','middle','high'].some(x => !c.support.divisors[x])) throw Error('Некорректные числа в условиях');
    if (!c.sources?.program || !c.sources?.help || !c.promo?.termsUrl) throw Error('Нет источника условий');
  }
  async function load() {
    if (config || loading) return;
    loading = true;
    try {
      const response = await fetch('./pds-config.json?v=' + Date.now(), {cache:'no-store'});
      if (!response.ok) throw Error('HTTP ' + response.status);
      const next = await response.json(); validate(next);
      // A navigation refresh may have populated the form while this request waited.
      if (!config) { config = next; mount(); }
    } catch {
      if (config) return;
      page.innerHTML = '<h1 id="pdsTitle">ПДС · Т‑Пенсия</h1><p role="status">Не удалось загрузить условия. Расчёт недоступен, чтобы не подставлять неподтверждённые значения.</p><button type="button" class="pds-calculate" id="pdsRetry">Повторить загрузку</button><p><a href="https://www.tbank.ru/pension/" target="_blank" rel="noopener noreferrer">Условия Т‑Пенсии ↗</a></p>';
      q('Retry').onclick = load;
    } finally { loading = false; }
  }
  function mount() {
    const p = config.promo, sources = config.sources;
    page.innerHTML = `
      <div class="pds-heading"><div><h1 id="pdsTitle">ПДС · Т‑Пенсия</h1><p class="pds-lead">Расчёт накоплений и срока начала выплат</p></div><button type="button" class="pds-promo-shortcut" id="pdsPromoShortcut" aria-controls="pdsPromo">ПДС + вклад · акция <span aria-hidden="true">↓</span></button></div>
      <div class="pds-layout">
      <form id="pdsForm" class="pds-form" novalidate aria-labelledby="pdsParametersTitle">
        <h2 id="pdsParametersTitle">Параметры расчёта</h2>
        <div class="pds-form-fields">
        <div class="pds-field pds-field-amount"><div class="pds-amount-head"><label for="pdsAmount">Взнос, ₽</label><span class="pds-period" role="group" aria-label="Период взноса"><button type="button" data-pds-period="monthly" aria-pressed="false">В месяц</button><button type="button" data-pds-period="annual" aria-pressed="true">В год</button></span></div><input id="pdsAmount" inputmode="decimal" value="36 000" aria-describedby="pdsTaxAssumption"></div>
        <label class="pds-field">Срок, лет<input id="pdsYears" type="number" min="1" max="30" step="1" value="5"></label>
        <label class="pds-field pds-field-income">Доход в месяц<select id="pdsIncome"><option value="">Выберите доход</option><option value="low">До 80 000 ₽</option><option value="middle">Свыше 80 до 150 тыс. ₽</option><option value="high">Свыше 150 000 ₽</option></select></label>
        </div>
        <section class="pds-parameters" aria-labelledby="pdsClientTitle">
          <div class="pds-client-heading"><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></svg><div><h3 id="pdsClientTitle">Возраст и пол</h3><p>Чтобы определить срок выплат</p></div><span class="pds-optional">Необязательно</span></div>
          <div class="pds-parameter-fields"><label class="pds-field">Возраст<input id="pdsAge" type="number" min="18" max="110" step="1" placeholder="Укажите возраст"></label><label class="pds-field">Пол<select id="pdsSex"><option value="">Выберите</option><option value="female">Женщина</option><option value="male">Мужчина</option></select></label></div>
        </section>
        <button class="pds-calculate" type="submit">Рассчитать</button>
        <section class="pds-scenario" aria-label="Сценарная доходность">
          <div class="pds-scenario-main" aria-live="polite" aria-atomic="true"><span id="pdsScenarioTitle"></span><strong id="pdsScenarioAnnual">—</strong></div>
          <div class="pds-scenario-actions"><p id="pdsScenarioAssumption"></p><button type="button" id="pdsScenarioDetailsToggle" aria-controls="pdsBreakdown" aria-expanded="false">Из чего складывается <span aria-hidden="true">⌄</span></button></div>
          <p class="pds-scenario-prompt" id="pdsScenarioPrompt"></p>
        </section>
        <p class="pds-small" id="pdsTaxAssumption">НДФЛ для оценки возврата — 13% по умолчанию.</p>
        <p class="pds-assumption" id="pdsAssumption"></p>
        <p class="pds-error" id="pdsError" role="alert"></p>
      </form>
      <section class="pds-results" aria-labelledby="pdsResultsTitle">
      <section class="pds-status" id="pdsStatus" aria-live="polite" aria-atomic="true"><span class="pds-status-icon" aria-hidden="true" id="pdsStatusIcon">◷</span><div><span class="pds-status-label">Когда можно начать получать выплаты</span><strong id="pdsEligibility"></strong><p id="pdsEligibilityNote"></p></div></section>
      <h2 id="pdsResultsTitle">По выбранному плану</h2>
      <div class="pds-benefits" id="pdsBenefits">
        <section class="pds-benefit"><h3>Софинансирование</h3><strong id="pdsSupport"></strong><p id="pdsSupportNote"></p><details><summary>Подробнее</summary><p>Это потенциальная доплата за взносные годы, а не уже доступная к выводу сумма. От ${money(config.support.minimumAnnual)} личных взносов в календарный год; максимум ${money(config.support.annualCap)} за год, до ${config.support.years} лет. Пропорция зависит от среднего дохода: 1:1, 1:2 или 1:4. Доход и условия проверяются ежегодно.</p><p>Зачисление происходит позднее взносов — как правило, в следующем году. Перед назначением выплат нужно проверить фактические зачисления и действующие условия. Вывод может прекратить право на будущую господдержку, в том числе по другим договорам.</p><p>${link(sources.support,'Правила софинансирования')}</p></details></section>
        <section class="pds-benefit"><h3>Налоговый возврат</h3><strong id="pdsTax"></strong><p id="pdsTaxNote"></p><details><summary>Подробнее</summary><p id="pdsTaxDetails"></p><p>Оценка условная: необходимы подходящий доход, достаточный уплаченный НДФЛ и соблюдение остальных условий НК РФ. Не более трёх договоров ПДС одновременно. Общий лимит взносов для вычета по ПДС, НПО, ИИС‑3 и другим учитываемым долгосрочным продуктам — ${money(config.tax.annualContributionLimit)} в год; использованную часть лимита нужно учитывать отдельно.</p><p>Возврат поступает отдельно и не зачисляется в ПДС автоматически. Фактическая ставка НДФЛ может отличаться от принятых в примере 13%.</p><p>${link(sources.tax,'Условия налогового вычета')}</p></details><details class="pds-incomes"><summary>Какие доходы подходят для вычета?</summary><div><p>Официальная зарплата, выплаты по ГПХ и доход от аренды — при обложении НДФЛ по основной налоговой базе.</p><p>Только государственная пенсия или доход самозанятого на НПД сами по себе такого возврата не дают. Налог с дивидендов и процентов по вкладам не считается автоматически подходящим НДФЛ для этого вычета.</p><p>Проверьте налоговое резидентство, базу и фактически уплаченный налог. ${link(sources.incomes,'Разъяснение ФНС')}</p></div></details></section>
        <section class="pds-benefit"><h3>Безубыточность НПФ</h3><strong id="pdsGuarantee"></strong><p id="pdsGuaranteeNote"></p><details><summary>Подробнее</summary><p>По предоставленному материалу НПФ компенсирует убытки от инвестирования по итогам каждого пятилетнего периода. Дату фиксации, базу компенсации и применимость к конкретному договору проверяют по правилам фонда.</p><p>Это не ежегодная гарантия доходности, не компенсация инфляции и не обещание свободного вывода всей суммы. Страхование АСВ — отдельная защита при гарантийном случае.</p><p>${link(sources.help,'Разъяснение Т‑Пенсии')}</p></details></section>

      </div>
      <div class="pds-scenario-totals" id="pdsScenarioTotals" hidden>
        <div class="pds-scenario-amounts"><section><h3>Счёт ПДС · накопления</h3><strong id="pdsScenarioAccount"></strong><p id="pdsScenarioAccountNote"></p></section><section><h3>Дополнительный результат<br>с отдельным возвратом НДФЛ</h3><strong id="pdsScenarioAdditional"></strong><p id="pdsScenarioAdditionalNote"></p></section></div>
        <div class="pds-scenario-irr"><div>Сценарная среднегодовая доходность (IRR)<small>Не гарантированная ставка и не обещание банка.</small></div><strong id="pdsScenarioIrrBadge"></strong></div>
      </div>
      <p class="pds-small" id="pdsPersonal"></p><p class="pds-small">Расчётный пример при выполнении условий. Сценарий до возможных удержаний при выплате; накопления по модели — не сумма, доступная к выводу сегодня. Формат выплаты и фактические зачисления проверяются отдельно.</p>
      </section>
      </div>
      <details class="pds-lower pds-breakdown" id="pdsBreakdown"><summary>Из чего складывается сценарий</summary><div class="pds-detail-body">
        <div class="pds-scenario-rate"><label class="pds-field" for="pdsScenarioRate">Инвестдоход в сценарии, % годовых<input id="pdsScenarioRate" type="number" min="-100" max="100" step="0.1" value="15" aria-describedby="pdsScenarioRateHint"></label><p id="pdsScenarioRateHint">Условное постоянное допущение на выбранный срок, а не прогноз банка. Можно изменить, в том числе проверить нулевой или отрицательный результат.</p></div>
        <p id="pdsBreakdownState" role="status"></p>
        <div id="pdsBreakdownFigures" hidden><div class="pds-scenario-table"><table aria-label="Состав результата сценария ПДС"><tbody><tr><th scope="row">Личные взносы</th><td id="pdsBreakdownPersonal"></td></tr><tr><th scope="row">Софинансирование</th><td id="pdsBreakdownSupport"></td></tr><tr><th scope="row">Инвестдоход в сценарии</th><td id="pdsBreakdownInvestment"></td></tr><tr><th scope="row">Возврат НДФЛ отдельно</th><td id="pdsBreakdownTax"></td></tr></tbody><tfoot><tr><th scope="row">Дополнительный результат</th><td id="pdsBreakdownAdditional"></td></tr></tfoot></table></div>
        <p id="pdsBreakdownTaxNote"></p><p id="pdsBreakdownTiming"></p>
        <p>Годовые (IRR) рассчитаны по денежным потокам с учётом времени взносов и возврата налога, а не сложением процентов. Софинансирование и инвестдоход увеличивают счёт ПДС; возврат НДФЛ поступает отдельно и не реинвестируется автоматически. Итоговый дополнительный результат — счёт ПДС плюс отдельный возврат налога минус личные взносы.</p>
        <p>Накопления оцениваются на конец горизонта, без предположения о свободном выводе всей суммы. Инвестдоход не гарантирован. Модель не рассчитывает компенсацию НПФ по безубыточности, итоговые удержания, инфляцию и правовые ограничения на получение средств.</p></div>
      </div></details>
      <div class="pds-history">${number(config.returns.historicalPercent)}% годовых — результат за ${config.returns.historicalYear} · до ${number(config.returns.forecastMaxPercent)}% годовых — прогноз на ${config.returns.forecastYear}<small>Доходность не гарантирована. Прогноз относится только к указанному году. Постоянный инвестдоход в сценарии — отдельное условное допущение, которое можно изменить в подробностях.</small></div>
      <details class="pds-lower"><summary>Условия выплат и расчёт срока</summary><div class="pds-detail-body"><p id="pdsTimingDetails"></p><p>Право обратиться за назначением выплат возникает по возрасту (55 лет для женщин, 60 для мужчин) либо через 15 лет участия — что наступит раньше. Возраст без даты рождения даёт только приблизительный срок, не точную дату перечисления.</p><p>Возрастное право не означает возможность получить все средства единовременно. У Т‑Пенсии возможны регулярные выплаты на срок от года; получение всей суммы по возрасту связано с установленным критерием размера пожизненной выплаты. После 15 лет условия единовременной выплаты отличаются. Проверяйте правила договора, фактическое поступление господдержки и налоговые последствия.</p><p>Этот экран предполагает новый личный договор в текущем году. Для ранее открытого договора и иных оснований (особые жизненные ситуации, договор в пользу другого лица) нужен отдельный расчёт по документам.</p><p>${link(sources.program,'Условия Т‑Пенсии')} · ${link(sources.help,'Порядок выплат')}</p></div></details>

      <details class="pds-lower pds-promo" id="pdsPromo"><summary>ПДС + вклад · акция</summary><div class="pds-detail-body"><p>Условия из присланного предложения. Доступность акции и текущую ставку проверяйте перед оформлением.</p><div class="pds-promo-facts"><div><strong>${number(p.nominalPercent)}% годовых</strong><span>Номинальная ставка вклада на ${p.months} месяцев</span></div><div><strong>${number(p.capitalizedPercent)}%</strong><span>Доходность при капитализации процентов</span></div></div><ol><li>Открыть новый ПДС и пополнить его от ${money(p.minimumAmount)} в течение ${p.fundingDays} дней.</li><li>Открыть непополняемый вклад на ${p.months} месяцев от ${money(p.minimumAmount)} и пополнить его в течение ${p.fundingDays} дней с открытия ПДС.</li><li>Повышенная ставка подключается автоматически в течение ${p.activationDays} дней после выполнения условий — на сумму не больше пополнения ПДС, остатка вклада и ${money(p.maximumBoostedAmount)}.</li></ol><p>Пример из материала: ПДС ${money(150000)}, вклад ${money(200000)} — повышенная ставка на ${money(150000)}, на оставшиеся ${money(50000)} действует базовая ставка.</p><p>Один ПДС и один акционный вклад; только для клиентов, у которых ранее не было ПДС на дату начала акции. Вклад на 12 месяцев, без пополнения, кроме первого месяца; продление — по стандартной ставке.</p><p>При закрытии ПДС или любом выводе из него ставка по вкладу становится базовой. Повторное участие не предусмотрено. Не сравнивайте номинальные 15% и доходность 16,07% как две разные акционные ставки.</p><p>${link(p.termsUrl,'Полные условия акции')} · ${link(sources.promo,'Страница предложения')}</p><p class="pds-small">Источник: предоставленный PDF, стр. 1–2. Ставки не обновляются автоматически и не включены в расчёт льгот ПДС.</p></div></details>
      <details class="pds-lower" id="pdsMemo"><summary>Памятка менеджеру</summary><div class="pds-detail-body"><p>По присланному материалу ПДС сочетает личные взносы, господдержку при выполнении условий и инвестиционный результат. Налоговый возврат зависит от права на вычет и уплаченного НДФЛ. Он не является инвестиционной доходностью.</p><p>Материал указывает возможность назначить правопреемников, пятилетнюю безубыточность и государственное гарантирование личных средств с инвестдоходом до 2,8 млн ₽ на этапе накопления. Условия, состав защищённых средств, исключения и правовые ограничения проверяют по правилам программы; это не гарантия инвестиционной ставки.</p><p>Условия защиты при разводе или аресте и освобождения инвестдохода от НДФЛ применяются с предусмотренными законом ограничениями. Для конкретного клиента нужно сверить договор и актуальные правила.</p><p>${link(sources.program,'Официальная страница программы')}</p></div></details>
      <p class="pds-small">Источники проверены ${esc(config.checkedAt.split('-').reverse().join('.'))}. Суммы льгот — условные ориентиры, не гарантированная выплата.</p>`;
    q('PromoShortcut').onclick = () => {
      const promo = q('Promo');
      promo.open = true;
      promo.querySelector('summary').focus({preventScroll:true});
      promo.scrollIntoView({block:'start', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    };
    const breakdown=q('Breakdown'),toggle=q('ScenarioDetailsToggle');
    toggle.onclick=()=>{
      breakdown.open=!breakdown.open;
      if(breakdown.open){breakdown.querySelector('summary').focus({preventScroll:true});breakdown.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
    };
    breakdown.addEventListener('toggle',()=>{toggle.setAttribute('aria-expanded',String(breakdown.open));toggle.querySelector('span').textContent=breakdown.open?'⌃':'⌄';});
    q('ScenarioRate').addEventListener('input',()=>{scenarioRatePercent=q('ScenarioRate').value.trim()===''?NaN:Number(q('ScenarioRate').value);render();});
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
    let r, scenario;
    try {
      r = calculatePds({annual, years:q('Years').value, income:q('Income').value, age:q('Age').value, sex:q('Sex').value, contractYear:currentYear()}, config);
      scenario=projectPdsScenario(r,{investmentRatePercent:scenarioRatePercent,period});
      q('Error').textContent = ''; q('Benefits').hidden = false;
    } catch (error) {
      q('Error').textContent = error.message;
      q('Benefits').hidden = true;
      resetScenario('Проверьте параметры расчёта.');
      q('ScenarioAssumption').textContent='Сценарий не рассчитан.';
      q('Status').dataset.state = 'unknown'; q('Eligibility').textContent = 'Проверьте параметры расчёта';
      q('EligibilityNote').textContent = ''; q('StatusIcon').textContent = '◷'; q('Personal').textContent = '';
      if (focusError) { q('Error').tabIndex = -1; q('Error').focus({preventScroll:true}); }
      return;
    }
    q('Assumption').textContent = `Новый договор ${r.contractYear} года. Одинаковый годовой взнос на всём горизонте.`;
    q('Status').dataset.state = r.ageMetNow ? 'met' : r.ageWait === null ? 'unknown' : 'future'; q('StatusIcon').textContent = r.ageMetNow ? '✓' : '◷';
    q('Eligibility').textContent = r.ageWait === null ? 'Укажите возраст и пол клиента' : r.ageMetNow ? 'Возрастное условие выполнено' : r.wait === 15 ? 'По сроку участия — ориентировочно через 15 лет' : `По возрасту — ориентировочно через ${r.wait} ${yearsWord(r.wait)}`;
    q('EligibilityNote').textContent = r.ageWait === null ? 'Без этих параметров учитывается только срок участия — 15 лет. Формат выплат и условия проверяются отдельно.' : r.ageMetNow ? 'Можно обратиться за назначением выплат. Формат и сумма определяются отдельно.' : `${r.eligibleAtEnd ? 'К концу выбранного срока основание для назначения выплат возникнет.' : 'К концу выбранного срока основание по возрасту или 15-летнему участию ещё не наступит.'}${r.ageWait === null ? ' Для проверки возраста укажите возраст и пол.' : ''} Господдержка и единовременный вывод проверяются отдельно.`;
    q('Support').textContent = r.support === null ? 'Укажите средний доход' : `до ${money(r.support)} за ${r.supportYears} ${yearsWord(r.supportYears)}`;
    q('SupportNote').textContent = r.support === null ? 'Выберите доход слева — от него зависит господдержка.' : r.annual < config.support.minimumAnnual ? `Для господдержки нужно внести от ${money(config.support.minimumAnnual)} за календарный год.` : `При ежегодном выполнении условий — до ${money(r.supportAnnual)} за взносный год. Зачисление позднее взносов.`;
    q('Tax').textContent = r.taxTermMet ? `до ${money(r.taxPotential)} за ${r.years} ${yearsWord(r.years)}` : 'При таком выходе льгота не сохраняется';
    q('TaxNote').textContent = r.taxTermMet ? 'При подходящем доходе и достаточном уплаченном НДФЛ. Возврат отдельно.' : `До минимального срока ещё ${r.taxRemaining} ${yearsWord(r.taxRemaining)}. Ранее полученные вычеты нужно вернуть при таком выходе; возрастное право не отменяет срок.`;
    q('TaxDetails').textContent = `Для нового договора ${r.contractYear} года минимальный срок до обращения за выплатами для сохранения вычета — ${r.minimumTaxYears} ${yearsWord(r.minimumTaxYears)}. Потенциальный возврат за один год при принятых 13% — до ${money(r.taxAnnual)}. Вычет можно заявлять за соответствующие годы при соблюдении условий; если выйти раньше минимума, льгота не сохраняется.`;
    q('Guarantee').textContent = r.guaranteeCycles ? 'Пятилетний период' : 'Пятилетний период не завершён';
    q('GuaranteeNote').textContent = r.guaranteeCycles ? 'Компенсация по итогам пятилетнего периода — по условиям фонда.' : 'При выходе на выбранном горизонте компенсацию по итогам пятилетнего периода нельзя считать уже полученной.';
    q('Personal').textContent = `Личные взносы за ${r.years} ${yearsWord(r.years)}: ${money(r.personal)}. Налоговый возврат показан отдельно от счёта ПДС.`;
    renderScenario(r,scenario);
    q('TimingDetails').textContent = `Выбран план на ${r.years} ${yearsWord(r.years)}. Отсчёт — от нового договора; оценка по полным годам возраста. Выбор срока в калькуляторе не означает, что этот срок уже прошёл.`;
  }
  function resetScenario(message){
    q('ScenarioAnnual').textContent='—';q('ScenarioTotals').hidden=true;q('BreakdownFigures').hidden=true;
    q('ScenarioPrompt').textContent=message;q('BreakdownState').textContent=message;
  }
  function renderScenario(r,s){
    q('ScenarioTitle').textContent=`Сценарий на ${r.years} ${yearsWord(r.years)}`;
    q('ScenarioAssumption').textContent=`При ${number(scenarioRatePercent)}% инвестдохода в год — условное допущение.`;
    if(!s.available){resetScenario('Выберите доход — от него зависит софинансирование.');return;}
    q('ScenarioTotals').hidden=false;q('BreakdownFigures').hidden=false;
    q('ScenarioPrompt').textContent=s.annualized===null?'При нулевых взносах годовые не определяются.':'';
    q('BreakdownState').textContent='';
    for(const id of ['ScenarioAnnual','ScenarioIrrBadge'])q(id).textContent=scenarioPercent(s.annualized);
    q('ScenarioAccount').textContent=scenarioMoney(s.account);
    q('ScenarioAdditional').textContent=scenarioMoney(s.additional);
    q('ScenarioAdditional').dataset.sign=s.additional<0?'negative':'positive';
    q('ScenarioAccountNote').textContent=`Личные взносы, господдержка и инвестдоход за ${r.years} ${yearsWord(r.years)}.`;
    q('ScenarioAdditionalNote').textContent=`Изменение к личным взносам ${money(r.personal)}. Возврат НДФЛ отдельно — до ${money(s.taxTotal)}.`;
    q('BreakdownPersonal').textContent=money(r.personal);
    q('BreakdownSupport').textContent=`до ${money(s.support)} · до ${money(r.supportAnnual)} за взносный год, не более ${r.supportYears} ${yearsWord(r.supportYears)}`;
    q('BreakdownInvestment').textContent=scenarioMoney(s.investment);
    q('BreakdownTax').textContent=`до ${money(s.taxTotal)}`;
    q('BreakdownAdditional').textContent=`${scenarioMoney(s.additional)} за ${r.years} ${yearsWord(r.years)}`;
    q('BreakdownTaxNote').textContent=r.taxTermMet?`Возврат оценён по ставке 13% при достаточном подходящем НДФЛ и свободном общем лимите. Минимальный срок для нового договора ${r.contractYear} года — ${r.minimumTaxYears} ${yearsWord(r.minimumTaxYears)}; остальные условия вычета также должны соблюдаться.`:`При выходе раньше ${r.minimumTaxYears} ${yearsWord(r.minimumTaxYears)} для договора ${r.contractYear} года возврат НДФЛ не включён в сценарий. Ранее полученные вычеты при таком выходе нужно вернуть. Возрастное право на выплаты не отменяет налоговый срок.`;
    q('BreakdownTiming').textContent=`Условные даты: ${period==='monthly'?'взносы в начале каждого месяца':'взнос в начале каждого года'}; софинансирование и возврат налога — в конце каждого взносного года. Инвестдоход начисляется на фактический модельный остаток; ${number(scenarioRatePercent)}% — эффективный годовой темп. Фактические даты зачислений изменят результат. Право на господдержку и её зачисление проверяются отдельно; это не обещание выплаты к концу горизонта.`;
  }
  function yearsWord(n) {
    const tens = n % 100, units = n % 10;
    return tens >= 11 && tens <= 14 ? 'лет' : units === 1 ? 'год' : units >= 2 && units <= 4 ? 'года' : 'лет';
  }
  window.pageDataRefresh?.register({pages:['pds'],file:'pds-config.json',current:()=>config,validate:c=>{validate(c);return true;},apply:c=>{
    const fields=Object.fromEntries(['Amount','Years','Income','Age','Sex','ScenarioRate'].map(id=>[id,q(id)?.value]));
    const open=[...page.querySelectorAll('details')].map((x,i)=>x.open?i:-1).filter(i=>i>=0);
    config=c;mount();
    for(const [id,value] of Object.entries(fields))if(value!==undefined)q(id).value=value;
    page.querySelectorAll('[data-pds-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pdsPeriod===period)));
    const details=page.querySelectorAll('details');open.forEach(i=>{if(details[i])details[i].open=true;});render();
  }});
  if (location.hash === '#pds') window.showProductPage('pds');
}
