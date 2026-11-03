(function(){
  const colors={'Денежный рынок':'#41414d','ОФЗ с фиксированным купоном':'#65439d','Рублевые корпоративные и секьюритизированные облигации':'#9698d0','Валютные облигации':'#d4d5e2','Золото':'#ffcf24','Российские акции':'#c9c7ff'};
  const sourceUrl='https://www.tbank.ru/invest/research/strategy/2026-summer-update/';
  const fallback={"updatedAt":"2026-11-03","sourceTitle":"Изображение модельных портфелей, предоставленное владельцем сайта","sourceType":"user-provided-image","note":"Доли представленных классов пропорционально приведены к 100%. Промежуточные профили — среднее 50/50 соседних моделей.","profiles":[{"id":"conservative","name":"Консервативный","basis":"Консервативная модель по предоставленному изображению","interpolated":false,"assets":{"Денежный рынок":19.0,"ОФЗ с фиксированным купоном":10.0,"Рублевые корпоративные и секьюритизированные облигации":35.0,"Валютные облигации":15.0,"Золото":8.0,"Российские акции":13.0},"sourceAssets":{"Денежный рынок":18.1,"ОФЗ с фиксированным купоном":9.5,"Рублевые корпоративные и секьюритизированные облигации":33.3,"Валютные облигации":14.3,"Золото":7.6,"Российские акции":12.4}},{"id":"moderately-conservative","name":"Умеренно-консервативный","basis":"Среднее 50/50 между консервативным и сбалансированным портфелями","interpolated":true,"assets":{"Денежный рынок":13.5,"ОФЗ с фиксированным купоном":11.0,"Рублевые корпоративные и секьюритизированные облигации":27.5,"Валютные облигации":16.5,"Золото":10.0,"Российские акции":21.5}},{"id":"balanced","name":"Сбалансированный","basis":"Сбалансированная модель по предоставленному изображению","interpolated":false,"assets":{"Денежный рынок":8.0,"ОФЗ с фиксированным купоном":12.0,"Рублевые корпоративные и секьюритизированные облигации":20.0,"Валютные облигации":18.0,"Золото":12.0,"Российские акции":30.0},"sourceAssets":{"Денежный рынок":7.6,"ОФЗ с фиксированным купоном":11.4,"Рублевые корпоративные и секьюритизированные облигации":19,"Валютные облигации":17.1,"Золото":11.4,"Российские акции":28.5}},{"id":"moderately-aggressive","name":"Умеренно-агрессивный","basis":"Среднее 50/50 между сбалансированным портфелем и портфелем роста","interpolated":true,"assets":{"Денежный рынок":4.0,"ОФЗ с фиксированным купоном":11.0,"Рублевые корпоративные и секьюритизированные облигации":15.0,"Валютные облигации":19.0,"Золото":13.5,"Российские акции":37.5}},{"id":"growth","name":"Агрессивный (портфель роста)","basis":"Портфель роста по предоставленному изображению","interpolated":false,"assets":{"Денежный рынок":0.0,"ОФЗ с фиксированным купоном":10.0,"Рублевые корпоративные и секьюритизированные облигации":10.0,"Валютные облигации":20.0,"Золото":15.0,"Российские акции":45.0},"sourceAssets":{"Денежный рынок":0,"ОФЗ с фиксированным купоном":9.5,"Рублевые корпоративные и секьюритизированные облигации":9.5,"Валютные облигации":19,"Золото":14.3,"Российские акции":42.8}}],"normalizationMethod":"Исключены альтернативные инвестиции. Остальные доли нормализованы до 100% и округлены до 0,1 п.п. методом наибольших остатков. Затем рассчитаны и аналогично округлены промежуточные профили."};
  let config=fallback,recommendations={classes:{}};
  const nav=document.querySelector('.product-nav');
  const dropdown=document.createElement('div');
  dropdown.className='smart-sales-nav';
  dropdown.innerHTML='<button class="smart-sales-trigger" type="button" aria-haspopup="true" aria-expanded="false">Умные продажи</button><div class="smart-sales-menu"><button class="active" type="button" data-smart-page="model"><b>Модельный портфель</b><small>Калькулятор</small></button><div class="smart-sales-divider"></div><div class="smart-sales-caption">Будущие разделы</div><button type="button" disabled><b>Карточки компаний</b><small>Скоро</small></button><button type="button" disabled><b>Сценарии разговора</b><small>Скоро</small></button><button type="button" disabled><b>Подбор продукта</b><small>Скоро</small></button></div>';
  if(nav)nav.appendChild(dropdown);

  const page=document.createElement('section');
  page.id='modelPage';page.className='product-page model-page';
  page.innerHTML='<section class="model-hero"><h1>Рассчитайте модельный портфель</h1><p>Распределение суммы по классам активов с учётом инвестиционного профиля клиента.</p></section><section class="model-calculator"><div class="model-controls"><label class="model-field"><span>Сумма для инвестирования, ₽</span><input id="modelAmount" class="money-input" inputmode="numeric" value="1 000 000"></label><label class="model-field"><span>Инвестиционный профиль</span><select id="modelProfile"></select></label><button id="modelCalculate" class="model-calculate" type="button">Рассчитать портфель</button><p id="modelDemoNote" class="model-demo-note"></p></div><div class="model-structure"><h2>Структура портфеля</h2><div class="model-chart-layout"><div id="modelDonut" class="model-donut"><div class="model-donut-center"><b id="modelTotal">—</b><small>Общая сумма</small></div></div><div id="modelLegend" class="model-legend"></div></div></div></section><section class="model-buy"><h2>Что нужно докупить</h2><div id="modelBuyList" class="model-buy-list"></div><div id="modelDetails" class="model-details" hidden></div><div class="model-buy-footer"><a id="modelSource" target="_blank" rel="noreferrer">Источник: стратегия аналитиков Т‑Инвестиций</a><button id="modelCopy" class="model-copy" type="button">Скопировать распределение</button></div></section>';
  const modelHero=page.querySelector('.model-hero');
  modelHero.classList.add('model-hero-image');
  modelHero.innerHTML='<div><h1>Рассчитайте модельный портфель</h1><p>Распределение суммы по классам активов с учётом инвестиционного профиля клиента.</p></div><div class="model-hero-visual"><img src="assets/smart-model-portfolio-hero.webp" alt=""></div>';
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
  const assetLabel=name=>name==='ОФЗ с фиксированным купоном'?'ОФЗ':name;
  const dateLabel=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value.split('-').reverse().join('.'):null;
  const amount=()=>Math.max(0,Math.round(Number((document.getElementById('modelAmount').value||'').replace(/[\s\u00a0]/g,''))||0));
  function formatAmount(){const el=document.getElementById('modelAmount'),n=amount();el.value=n?Math.round(n).toLocaleString('ru-RU'):''}
  function fillProfiles(){const select=document.getElementById('modelProfile'),previous=select.value;select.innerHTML=config.profiles.map(p=>'<option value="'+p.id+'">'+p.name+'</option>').join('');if(config.profiles.some(p=>p.id===previous))select.value=previous;else select.value=config.profiles[0].id}
  function currentProfile(){return config.profiles.find(p=>p.id===document.getElementById('modelProfile').value)||config.profiles[0]}
  function allocations(profile,total){
    const entries=Object.entries(profile.assets).filter(([,share])=>Number(share)>0).sort((a,b)=>Number(b[1])-Number(a[1]));
    const sum=entries.reduce((s,[,v])=>s+Number(v),0);
    const rows=entries.map(([name,share])=>({name,share,exact:total*share/sum,value:Math.floor(total*share/sum)}));
    const remaining=total-rows.reduce((s,r)=>s+r.value,0);
    [...rows].sort((a,b)=>(b.exact-b.value)-(a.exact-a.value)).slice(0,remaining).forEach(r=>r.value++);
    return rows;
  }
  function render(){
    const total=amount(),profile=currentProfile();if(!profile)return;
    const entries=Object.entries(profile.assets).filter(([,share])=>Number(share)>0).sort((a,b)=>Number(b[1])-Number(a[1])),sum=entries.reduce((s,[,v])=>s+Number(v),0);
    let cursor=0;const parts=entries.map(([name,share])=>{const start=cursor;cursor+=Number(share)/sum*100;return (colors[name]||'#777')+' '+start+'% '+cursor+'%'});
    document.getElementById('modelDonut').style.background='conic-gradient('+parts.join(',')+')';
    document.getElementById('modelTotal').textContent=money(total);
    document.getElementById('modelLegend').innerHTML=allocations(profile,total).map(({name,share,value})=>'<div class="model-legend-row"><i class="model-color" style="background:'+(colors[name]||'#777')+'"></i><span>'+assetLabel(name)+'</span><span>'+pct(share)+'</span><b>'+money(value)+'</b></div>').join('');
    document.getElementById('modelBuyList').innerHTML=allocations(profile,total).map(({name,share,value})=>'<div class="model-buy-row" data-asset="'+name+'"><span class="model-buy-name"><i class="model-color" style="background:'+(colors[name]||'#777')+'"></i>'+assetLabel(name)+'</span><span>'+pct(share)+'</span><b>'+money(value)+'</b><button type="button" class="model-open" data-asset="'+name+'">Посмотреть фонды ›</button></div>').join('');
    document.getElementById('modelDemoNote').textContent=profile.basis+(profile.interpolated?' · Промежуточный профиль рассчитан математически и не является отдельным портфелем с изображения.':'')+(config.note?' · '+config.note:'');
    const source=document.getElementById('modelSource');
    if(config.sourceUrl){source.href=config.sourceUrl;source.target='_blank'}else{source.removeAttribute('href');source.removeAttribute('target')}
    source.textContent='Источник: '+(config.sourceTitle||'модельные портфели')+' · дата внесения '+dateLabel(config.updatedAt);
    document.getElementById('modelDetails').hidden=true;
  }
  function detailCardFund(f){return '<article class="model-fund-card"><div><b>'+f.name+'</b><small>'+f.ticker+'</small><small>'+(((window.fundReference||{})[f.ticker]||{}).type||'Тип уточняется')+' · '+(((window.fundReference||{})[f.ticker]||{}).access||'Доступ уточняется')+'</small></div><button type="button" onclick="showProductPage(\'funds\');setTimeout(function(){var s=document.getElementById(\'search\');if(s){s.value=\''+f.ticker+'\';s.dispatchEvent(new Event(\'input\',{bubbles:true}))}},50)">Открыть</button></article>'}
  function detailCardRecommendation(r){return '<article class="model-rec-card"><b>'+r.name+'</b><span>Доходность к погашению — до '+r.yield+'</span><span>Валюта — '+r.currency+' · погашение '+r.maturity+'</span></article>'}
  function openDetails(asset){
    const data=recommendations.classes&&recommendations.classes[asset]||{funds:[],recommendations:[]},box=document.getElementById('modelDetails');
    let list=(data.funds||[]).filter(f=>f.ticker!=='TSEC'&&!(asset==='Денежный рынок'&&f.ticker==='TSAV'));if(asset==='Российские акции'){list=list.filter(f=>f.ticker!=='TITR'&&f.ticker!=='TRUR');if(!list.some(f=>f.ticker==='RU000A109KH9'))list.push({ticker:'RU000A109KH9',name:'Баланс акций и облигаций — смешанный фонд'});}let funds=list.map(detailCardFund).join('')||'<p class="model-empty">Подходящие фонды пока не добавлены.</p>';
    if(asset==='Золото') funds += '<article class="model-fund-card"><div><b>Биржевое золото</b><small>Покупка золота на бирже через брокерский счёт</small><small>Отдельный инструмент, не пай фонда</small></div><button type="button" onclick="showProductPage(\'smart-precious-metals\')">Подробнее</button></article>';
    const recommendationDate=dateLabel(data.updatedAt||recommendations.updatedAt),publishedDate=dateLabel(data.sourcePublishedAt||recommendations.sourcePublishedAt);
    const dateNote=recommendationDate?' · данные от '+recommendationDate:' · дата данных не указана';
    const recs=(data.recommendations||[]).map(detailCardRecommendation).join('')||'<p class="model-empty">Отдельные рекомендации аналитиков для этого класса не опубликованы в сохранённых данных.</p>';
    box.innerHTML='<div class="model-details-head"><div><h3>'+assetLabel(asset)+'</h3><p>Подходящие инструменты и рекомендации из сохранённой подборки</p></div><button type="button" class="model-details-close" aria-label="Закрыть">×</button></div><h4>'+(asset==='Золото'?'Фонд на золото и биржевое золото':'Фонды Т‑Капитала')+'</h4><div class="model-detail-grid">'+funds+'</div><h4>Рекомендации аналитиков'+dateNote+'</h4><div class="model-detail-grid">'+recs+'</div><p class="model-detail-note">Рекомендации сохранены со страницы стратегии Т‑Инвестиций.'+(recommendationDate?' Дата обновления сохранённой подборки: '+recommendationDate+'.':'')+(publishedDate?' Дата публикации источника: '+publishedDate+'.':' Дата публикации источника не указана.')+' Доходность к погашению, состав и условия могут измениться. <a href="'+(recommendations.sourceUrl||sourceUrl)+'" target="_blank" rel="noreferrer">Открыть источник ↗</a></p>';
    box.hidden=false;box.querySelector('.model-details-close').addEventListener('click',()=>box.hidden=true);box.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function copy(){const p=currentProfile(),total=amount(),lines=['Модельный портфель — '+p.name,'Сумма: '+money(total),''];allocations(p,total).forEach(({name,share,value})=>lines.push(assetLabel(name)+': '+pct(share)+' · '+money(value)));const done=()=>{const b=document.getElementById('modelCopy'),old=b.textContent;b.textContent='Скопировано';setTimeout(()=>b.textContent=old,1600)};navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(lines.join('\n')).then(done):window.prompt('Скопируйте распределение:',lines.join('\n'))}
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
