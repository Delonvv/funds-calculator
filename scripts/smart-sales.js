(function(){
  const colors={'Денежный рынок':'#41414d','ОФЗ с фиксированным купоном':'#65439d','Рублевые корпоративные и секьюритизированные облигации':'#9698d0','Валютные облигации':'#d4d5e2','Золото':'#ffcf24','Российские акции':'#c9c7ff'};
  const sourceUrl='https://www.tbank.ru/invest/research/strategy/2026-summer-update/';
  const fallback={updatedAt:'2026-10-07',sourceUrl,note:'Доли представленных классов пропорционально нормализованы до 100%.',profiles:[{id:'conservative',name:'Консервативный',basis:'Консервативный портфель аналитиков',interpolated:false,assets:{'Денежный рынок':15.1,'ОФЗ с фиксированным купоном':14,'Рублевые корпоративные и секьюритизированные облигации':34.9,'Валютные облигации':10,'Золото':16,'Российские акции':10}}]};
  let config=fallback,recommendations={classes:{}};
  const nav=document.querySelector('.product-nav');
  const dropdown=document.createElement('div');
  dropdown.className='smart-sales-nav';
  dropdown.innerHTML='<button class="smart-sales-trigger" type="button" aria-haspopup="true" aria-expanded="false">Умные продажи</button><div class="smart-sales-menu"><button class="active" type="button" data-smart-page="model"><b>Модельный портфель</b><small>Калькулятор</small></button><div class="smart-sales-divider"></div><div class="smart-sales-caption">Будущие разделы</div><button type="button" disabled><b>Карточки компаний</b><small>Скоро</small></button><button type="button" disabled><b>Сценарии разговора</b><small>Скоро</small></button><button type="button" disabled><b>Подбор продукта</b><small>Скоро</small></button></div>';
  if(nav)nav.appendChild(dropdown);

  const page=document.createElement('section');
  page.id='modelPage';page.className='product-page model-page';
  page.innerHTML='<section class="model-hero"><h1>Рассчитайте модельный портфель</h1><p>Распределение суммы по классам активов с учётом инвестиционного профиля клиента.</p></section><section class="model-calculator"><div class="model-controls"><label class="model-field"><span>Сумма для инвестирования, ₽</span><input id="modelAmount" class="money-input" inputmode="numeric" value="1 000 000"></label><label class="model-field"><span>Инвестиционный профиль</span><select id="modelProfile"></select></label><button id="modelCalculate" class="model-calculate" type="button">Рассчитать портфель</button><p id="modelDemoNote" class="model-demo-note"></p></div><div class="model-structure"><h2>Структура портфеля</h2><div class="model-chart-layout"><div id="modelDonut" class="model-donut"><div class="model-donut-center"><b id="modelTotal">—</b><small>Общая сумма</small></div></div><div id="modelLegend" class="model-legend"></div></div></div></section><section class="model-buy"><h2>Что нужно докупить</h2><div id="modelBuyList" class="model-buy-list"></div><div id="modelDetails" class="model-details" hidden></div><div class="model-buy-footer"><a id="modelSource" target="_blank" rel="noreferrer">Источник: стратегия аналитиков Т‑Инвестиций</a><button id="modelCopy" class="model-copy" type="button">Скопировать распределение</button></div></section>';
  const footer=document.querySelector('main .product-pages-note');
  if(footer)footer.before(page);else document.querySelector('main').appendChild(page);

  const oldShow=window.showProductPage;
  window.showProductPage=function(name){
    if(name!=='model'){dropdown.classList.remove('open');dropdown.querySelector('.smart-sales-trigger').classList.remove('active');return oldShow(name)}
    document.querySelectorAll('.product-page').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.product-tab').forEach(x=>x.classList.remove('active'));
    dropdown.querySelector('.smart-sales-trigger').classList.add('active');page.classList.add('active');
    history.replaceState(null,'','#model');window.scrollTo({top:0,behavior:'smooth'});render();
  };
  const trigger=dropdown.querySelector('.smart-sales-trigger');
  trigger.addEventListener('click',()=>{const open=dropdown.classList.toggle('open');trigger.setAttribute('aria-expanded',String(open))});
  dropdown.querySelector('[data-smart-page="model"]').addEventListener('click',()=>window.showProductPage('model'));
  document.addEventListener('click',e=>{if(!dropdown.contains(e.target)){dropdown.classList.remove('open');trigger.setAttribute('aria-expanded','false')}});

  const money=n=>Math.round(n).toLocaleString('ru-RU')+' ₽';
  const pct=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
  const amount=()=>Number((document.getElementById('modelAmount').value||'').replace(/[\s\u00a0]/g,''))||0;
  function formatAmount(){const el=document.getElementById('modelAmount'),n=amount();el.value=n?Math.round(n).toLocaleString('ru-RU'):''}
  function fillProfiles(){const select=document.getElementById('modelProfile'),previous=select.value;select.innerHTML=config.profiles.map(p=>'<option value="'+p.id+'">'+p.name+'</option>').join('');if(config.profiles.some(p=>p.id===previous))select.value=previous;else select.value=config.profiles[0].id}
  function currentProfile(){return config.profiles.find(p=>p.id===document.getElementById('modelProfile').value)||config.profiles[0]}
  function render(){
    const total=amount(),profile=currentProfile();if(!profile)return;
    const entries=Object.entries(profile.assets).filter(([,share])=>Number(share)>0),sum=entries.reduce((s,[,v])=>s+Number(v),0);
    let cursor=0;const parts=entries.map(([name,share])=>{const start=cursor;cursor+=Number(share)/sum*100;return (colors[name]||'#777')+' '+start+'% '+cursor+'%'});
    document.getElementById('modelDonut').style.background='conic-gradient('+parts.join(',')+')';
    document.getElementById('modelTotal').textContent=money(total);
    document.getElementById('modelLegend').innerHTML=entries.map(([name,share])=>'<div class="model-legend-row"><i class="model-color" style="background:'+(colors[name]||'#777')+'"></i><span>'+name+'</span><span>'+pct(share)+'</span><b>'+money(total*share/100)+'</b></div>').join('');
    document.getElementById('modelBuyList').innerHTML=entries.map(([name,share])=>'<div class="model-buy-row" data-asset="'+name+'"><span class="model-buy-name"><i class="model-color" style="background:'+(colors[name]||'#777')+'"></i>'+name+'</span><span>'+pct(share)+'</span><b>'+money(total*share/100)+'</b><button type="button" class="model-open" data-asset="'+name+'">Посмотреть фонды ›</button></div>').join('');
    document.getElementById('modelDemoNote').textContent=profile.basis+(profile.interpolated?' · Промежуточный профиль рассчитан математически и не является отдельным портфелем из публикации.':'')+(config.note?' · '+config.note:'');
    document.getElementById('modelSource').href=config.sourceUrl||sourceUrl;
    document.getElementById('modelSource').textContent='Источник: стратегия аналитиков Т‑Инвестиций · обновлено '+new Date(config.updatedAt+'T00:00:00').toLocaleDateString('ru-RU');
    document.getElementById('modelDetails').hidden=true;
  }
  function detailCardFund(f){return '<article class="model-fund-card"><div><b>'+f.name+'</b><small>'+f.ticker+'</small></div><button type="button" onclick="showProductPage(\'funds\');setTimeout(function(){var s=document.getElementById(\'search\');if(s){s.value=\''+f.ticker+'\';s.dispatchEvent(new Event(\'input\',{bubbles:true}))}},50)">Открыть</button></article>'}
  function detailCardRecommendation(r){return '<article class="model-rec-card"><b>'+r.name+'</b><span>Доходность к погашению — '+r.yield+'</span><span>Валюта — '+r.currency+' · погашение '+r.maturity+'</span></article>'}
  function openDetails(asset){
    const data=recommendations.classes&&recommendations.classes[asset]||{funds:[],recommendations:[]},box=document.getElementById('modelDetails');
    const funds=(data.funds||[]).map(detailCardFund).join('')||'<p class="model-empty">Подходящие фонды пока не добавлены.</p>';
    const recs=(data.recommendations||[]).map(detailCardRecommendation).join('')||'<p class="model-empty">Отдельные рекомендации аналитиков для этого класса не опубликованы в сохранённых данных.</p>';
    box.innerHTML='<div class="model-details-head"><div><h3>'+asset+'</h3><p>Подходящие фонды и актуальный выбор аналитиков</p></div><button type="button" class="model-details-close" aria-label="Закрыть">×</button></div><h4>Фонды Т‑Капитала</h4><div class="model-detail-grid">'+funds+'</div><h4>Рекомендации аналитиков</h4><div class="model-detail-grid">'+recs+'</div><p class="model-detail-note">Рекомендации сохранены со страницы стратегии Т‑Инвестиций. Доходность к погашению, состав и условия могут измениться. <a href="'+(recommendations.sourceUrl||sourceUrl)+'" target="_blank" rel="noreferrer">Открыть источник ↗</a></p>';
    box.hidden=false;box.querySelector('.model-details-close').addEventListener('click',()=>box.hidden=true);box.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function copy(){const p=currentProfile(),total=amount(),lines=['Модельный портфель — '+p.name,'Сумма: '+money(total),''];Object.entries(p.assets).filter(([,v])=>Number(v)>0).forEach(([n,v])=>lines.push(n+': '+pct(v)+' · '+money(total*v/100)));const done=()=>{const b=document.getElementById('modelCopy'),old=b.textContent;b.textContent='Скопировано';setTimeout(()=>b.textContent=old,1600)};navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(lines.join('\n')).then(done):window.prompt('Скопируйте распределение:',lines.join('\n'))}
  document.getElementById('modelAmount').addEventListener('input',()=>{formatAmount();render()});
  document.getElementById('modelProfile').addEventListener('change',render);
  document.getElementById('modelCalculate').addEventListener('click',render);
  document.getElementById('modelCopy').addEventListener('click',copy);
  document.getElementById('modelBuyList').addEventListener('click',e=>{const b=e.target.closest('.model-open');if(b)openDetails(b.dataset.asset)});
  formatAmount();fillProfiles();render();
  Promise.all([
    fetch('./model-portfolios.json?ts='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()),
    fetch('./model-recommendations.json?ts='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).catch(()=>({classes:{}}))
  ]).then(([portfolioData,recommendationData])=>{if(portfolioData&&Array.isArray(portfolioData.profiles)&&portfolioData.profiles.length)config=portfolioData;recommendations=recommendationData||{classes:{}};fillProfiles();render()}).catch(()=>{});
  if(location.hash==='#model')window.showProductPage('model');
})();
