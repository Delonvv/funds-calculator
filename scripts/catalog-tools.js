(()=>{'use strict';
const page=document.getElementById('fundsPage'),grid=document.getElementById('grid'),search=document.getElementById('search'),panel=page.querySelector('.filter-panel');if(!panel||!grid)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let favorites=new Set(),mode='all',selection=null,placements=[],placementError=false;
try{const saved=JSON.parse(localStorage.getItem('funds-favorites-v1')||'[]');if(Array.isArray(saved))favorites=new Set(saved.filter(x=>typeof x==='string'));}catch(e){}
const knownFundFrequency={TPAY:'monthly',TRBR:'semiannual'};
const frequencyLabels={monthly:'Ежемесячно',quarterly:'Ежеквартально',semiannual:'Раз в полгода',annual:'Раз в год',maturity:'В конце срока'};
const toolbar=document.createElement('div');toolbar.className='ct-toolbar';toolbar.innerHTML='<div class="ct-tabs"><button type="button" data-catalog-mode="all" aria-pressed="true" class="selected">Все фонды</button><button type="button" data-catalog-mode="favorites" aria-pressed="false">★ Избранное <span id="ctFavoriteCount"></span></button></div><button type="button" id="ctFilterToggle" aria-expanded="false" aria-controls="ctFilters">☷ Фильтры</button><button type="button" id="ctReset">Сбросить</button>';
panel.before(toolbar);panel.id='ctFilters';panel.classList.add('ct-filter-popup');panel.hidden=true;
const popup=document.createElement('section');popup.id='ctPayout';popup.className='ct-popup';popup.hidden=true;popup.setAttribute('aria-label','Подбор выплат');popup.innerHTML='<div class="ct-popup-head"><b>Подбор выплат</b><button type="button" id="ctClose" aria-label="Закрыть подбор выплат">×</button></div><div class="ct-fields"><label>Доходность от, % годовых<input id="ctMin" inputmode="decimal" placeholder="Например, 18"></label><label>Периодичность<select id="ctFrequency"><option value="monthly">Ежемесячно</option><option value="quarterly">Ежеквартально</option><option value="semiannual">Раз в полгода</option><option value="maturity">В конце срока</option></select></label><label>Тип инструмента<select id="ctType"><option value="all">Все инструменты</option><option value="funds">Фонды</option><option value="placements">Размещения</option><option value="products">Другие продукты</option></select></label></div><small>Купон и ожидаемая доходность обозначены отдельно. Неизвестные значения не считаем нулевыми.</small><div class="ct-popup-actions"><button type="button" id="ctApply" class="ct-primary">Показать подборку</button><button type="button" id="ctPopupReset">Сбросить</button></div><p id="ctError" role="status"></p>';
toolbar.after(popup);const chips=document.createElement('div');chips.className='ct-active';popup.after(chips);const results=document.createElement('section');results.className='ct-placement-results';grid.after(results);const note=document.createElement('p');note.className='ct-note';results.after(note);
let popupAnchor=null,positionFrame=0;
function close(restoreFocus=false,immediate=false){
  const anchor=popupAnchor;
  panel.hidden=true;popup.hidden=true;popupAnchor=null;
  document.getElementById('ctFilterToggle').setAttribute('aria-expanded','false');
  document.getElementById('ctPayoutToggle').setAttribute('aria-expanded','false');
  if(immediate)for(const element of [panel,popup])element.getAnimations().forEach(animation=>animation.cancel());
  if(restoreFocus&&anchor&&page.classList.contains('active'))anchor.focus({preventScroll:true});
}
function positionPopup(){
  const current=!popup.hidden?popup:!panel.hidden?panel:null;
  if(!current||!popupAnchor)return;
  const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
  const width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight;
  const bounds=popupAnchor.getBoundingClientRect(),gap=10,padding=12;
  current.style.maxWidth=Math.max(0,width-padding*2)+'px';
  current.style.maxHeight=Math.max(0,height-padding*2)+'px';
  current.style.width='';
  let box=current.getBoundingClientRect(),y=bounds.bottom+gap;
  if(y+box.height>top+height-padding)y=bounds.top-gap-box.height;
  let x=bounds.right-box.width;
  // Keep the toolbar reachable when a short desktop viewport places the popup above the banner.
  const tools=toolbar.getBoundingClientRect();
  if(current===popup&&width>=850&&y<tools.bottom&&y+box.height>tools.top){
    const edge=Math.max(...[...toolbar.querySelectorAll('button')].map(button=>button.getBoundingClientRect().right))+padding;
    const room=left+width-padding-edge;
    if(room>=360){
      current.style.width=Math.min(box.width,room)+'px';box=current.getBoundingClientRect();
      x=left+width-padding-box.width;y=bounds.top-gap-box.height;
    }
  }
  current.style.top=Math.max(top+padding,Math.min(y,top+height-box.height-padding))+'px';
  current.style.left=Math.max(left+padding,Math.min(x,left+width-box.width-padding))+'px';
}
function schedulePosition(){
  if(positionFrame||!popupAnchor)return;
  positionFrame=requestAnimationFrame(()=>{positionFrame=0;positionPopup();});
}
function openPopup(current,anchor){
  const open=current.hidden;close(false,open);
  if(!open)return;
  current.hidden=false;popupAnchor=anchor;anchor.setAttribute('aria-expanded','true');
  positionPopup();
  if(current===popup)document.getElementById('ctMin').focus({preventScroll:true});
  else panel.querySelector('#filters button')?.focus({preventScroll:true});
}

function store(){try{localStorage.setItem('funds-favorites-v1',JSON.stringify([...favorites]));return true;}catch(e){note.textContent='Браузер не разрешил сохранить избранное. Выбор останется только до закрытия страницы.';return false;}}
function rateNumber(value){if(typeof value==='number')return Number.isFinite(value)?value:null;const text=String(value||'');if(/rusfar|ключев|\+|плавающ|переменн/i.test(text))return null;const m=text.match(/(?:до\s*)?(\d+(?:[.,]\d+)?)\s*%/i);return m?Number(m[1].replace(',','.')):null;}
function fundRate(x){return x.cm==='total'||typeof x.cr!=='number'?null:x.cr;}
function fundFrequency(x){return x.payoutFrequency||knownFundFrequency[x.t]||null;}
function commonMatch(x){return typeof matches==='function'?matches(x):true;}
window.catalogAcceptFund=x=>{if(mode==='favorites'&&!favorites.has('fund:'+x.t))return false;if(!selection)return true;if(selection.type==='placements'||selection.type==='products')return false;const rate=fundRate(x);return(selection.min===null||(rate!==null&&rate>=selection.min))&&(selection.frequency==='any'||fundFrequency(x)===selection.frequency);};
function favoriteButton(key){const active=favorites.has(key);return '<button type="button" class="ct-star '+(active?'saved':'')+'" data-favorite="'+esc(key)+'" aria-pressed="'+active+'" aria-label="'+(active?'Убрать из избранного':'Добавить в избранное')+'">'+(active?'★':'☆')+'</button>';}
function placementMatches(x){if(/смарт[\s‑–—-]*процент|smart[\s-]*percent|структурн/i.test([x.issuer,x.title,x.issueName].join(' ')))return false;if(mode==='favorites'&&!favorites.has('placement:'+x.id))return false;const q=search.value.trim().toLowerCase();if(q&&!((x.issuer||'')+' '+(x.issueName||'')+' '+(x.title||'')).toLowerCase().includes(q))return false;const access=x.isQual===true?'Только квалам':x.isQual===false?'Неквалам':null;if(state.access.size&&(!access||!state.access.has(access)))return false;const currency=String(x.currency||'').toUpperCase(),category=currency==='RUB'?'Облигации РФ':currency?'Валютные облигации':null;if(state.category.size&&(!category||!state.category.has(category)))return false;if(state.exit.size||state.risk.size)return false;
if(!selection)return true;if(selection.type==='funds'||selection.type==='products')return false;const frequency=x.payoutFrequency||'monthly',rate=typeof x.couponAnnualRate==='number'?x.couponAnnualRate:x.rateBasis==='annual'?rateNumber(x.coupon):null;return(selection.frequency==='any'||frequency===selection.frequency)&&(selection.min===null||(rate!==null&&rate>=selection.min));}
function placementHtml(x){const image=typeof x.image==='string'&&/^https:\/\//.test(x.image)?'<img src="'+esc(x.image)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'';return '<article class="ct-placement">'+favoriteButton('placement:'+x.id)+'<small>Первичное размещение · '+esc(x.currency||'Валюта не указана')+'</small><div class="ct-issuer">'+image+'<h3>'+esc(x.issuer||x.title||'Размещение')+'</h3></div><p>'+esc(x.issueName||'')+'</p><b>'+esc(x.coupon||'Доходность не указана')+'</b><p>Выплаты: '+esc(frequencyLabels[x.payoutFrequency]||'Ежемесячно — временно, график не подтверждён')+'</p>'+(x.deadline?'<p>'+esc(x.deadline)+'</p>':'')+'<a href="https://www.tbank.ru/invest/recommendations/" target="_blank" rel="noopener noreferrer">К размещениям ↗</a></article>';}
function run(){render();}
function reset(){selection=null;mode='all';search.value='';Object.values(state).forEach(s=>s.clear());document.getElementById('ctMin').value='';document.getElementById('ctFrequency').value='monthly';document.getElementById('ctType').value='all';close(true);renderFilters();run();toolbar.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
window.catalogAfterRender=()=>{grid.querySelectorAll('[data-fund-ticker]').forEach(card=>{const key='fund:'+card.dataset.fundTicker;let star=card.querySelector('.ct-star');
if(!star){card.insertAdjacentHTML('afterbegin',favoriteButton(key));}else{
 const active=favorites.has(key);if(star.textContent!==(active?'★':'☆'))star.textContent=active?'★':'☆';star.classList.toggle('saved',active);star.setAttribute('aria-pressed',String(active));star.setAttribute('aria-label',active?'Убрать из избранного':'Добавить в избранное');
}});document.getElementById('ctFavoriteCount').textContent=favorites.size||'';toolbar.querySelectorAll('[data-catalog-mode]').forEach(b=>{const active=b.dataset.catalogMode===mode;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});const activeCount=Object.values(state).reduce((n,s)=>n+s.size,0);document.getElementById('ctFilterToggle').textContent='☷ Фильтры'+(activeCount?' · '+activeCount:'');
chips.replaceChildren();if(selection){for(const label of [selection.min===null?null:'От '+selection.min+'% годовых',selection.frequency==='any'?'Любые выплаты':frequencyLabels[selection.frequency],({all:'Все инструменты',funds:'Фонды',placements:'Размещения',products:'Другие продукты'})[selection.type]])if(label){const chip=document.createElement('span');chip.textContent=label;chips.append(chip);}}
const showPlacements=!!selection||mode==='favorites',items=showPlacements?placements.filter(placementMatches):[];results.innerHTML=items.length?'<h2>Первичные размещения · '+items.length+'</h2><div class="ct-placement-grid">'+items.map(placementHtml).join('')+'</div>':'';
const fundCount=grid.children.length,total=fundCount+items.length;document.getElementById('count').textContent='Показано: '+total;document.getElementById('empty').hidden=total>0;document.getElementById('empty').textContent=mode==='favorites'&&!favorites.size?'Избранное пока пусто. Нажмите звёздочку на карточке фонда.':selection?'Нет инструментов с подтверждёнными данными под выбранные условия. Измените параметры или сбросьте подбор.':'Ничего не найдено. Сбросьте фильтры или измените запрос.';
note.textContent=selection?'Для подбора используем годовой ориентир фонда либо подтверждённый годовой купон. Это разные показатели. DCM без графика временно включены в ежемесячную подборку; периодичность нужно подтвердить. При неизвестной годовой доходности фильтр по проценту исключает выпуск.'+(placementError?' Размещения не удалось загрузить.':''):mode==='favorites'?'Избранное сохраняется в этом браузере, без синхронизации между устройствами.':'';
};
toolbar.addEventListener('click',e=>{const modeButton=e.target.closest('[data-catalog-mode]');if(modeButton){mode=modeButton.dataset.catalogMode;if(mode==='all')selection=null;close();run();}});
document.getElementById('ctFilterToggle').onclick=e=>openPopup(panel,e.currentTarget);
document.getElementById('ctClose').onclick=()=>close(true);
for(const id of ['ctReset','ctPopupReset'])document.getElementById(id).onclick=reset;document.getElementById('reset').onclick=reset;
document.getElementById('ctApply').onclick=()=>{const text=document.getElementById('ctMin').value.trim(),min=text===''?null:Number(text.replace(',','.'));if(min!==null&&(!Number.isFinite(min)||min<0||min>100)){document.getElementById('ctError').textContent='Укажите доходность от 0 до 100%.';return;}document.getElementById('ctError').textContent='';selection={min,frequency:document.getElementById('ctFrequency').value,type:document.getElementById('ctType').value};close(true);run();(document.querySelector('.ct-carousel:not([hidden])')||grid).scrollIntoView({behavior:'smooth',block:'start'});};
page.addEventListener('click',e=>{const b=e.target.closest('[data-favorite]');if(!b)return;const key=b.dataset.favorite;favorites.has(key)?favorites.delete(key):favorites.add(key);store();run();});document.addEventListener('keydown',e=>{if(e.key==='Escape')close(true);});document.addEventListener('click',e=>{if(!panel.contains(e.target)&&!popup.contains(e.target)&&!toolbar.contains(e.target)&&!e.target.closest('#ctPayoutToggle'))close();});
window.addEventListener('storage',e=>{if(e.key==='funds-favorites-v1'){try{const list=JSON.parse(e.newValue||'[]');if(Array.isArray(list))favorites=new Set(list.filter(x=>typeof x==='string'));run();}catch(err){}}});
fetch('./dcm.json?v='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(c=>{const seen=new Set();placements=(c.placements||[]).filter(x=>{if(!x.id||seen.has(x.sourceId||x.id))return false;seen.add(x.sourceId||x.id);return true;});run();}).catch(()=>{placementError=true;run();});run();
function createBanner(){
  const banner=document.createElement('section');banner.className='ct-banner';
  banner.setAttribute('aria-label','Возможности каталога');banner.setAttribute('aria-roledescription','карусель');
  banner.innerHTML=`
    <button class="ct-banner-arrow ct-banner-prev" type="button" aria-label="Предыдущий слайд"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m14 6-6 6 6 6"/></svg></button>
    <div class="ct-banner-window"><div class="ct-banner-track">
      <div class="ct-banner-slide" role="group" aria-roledescription="слайд" aria-label="1 из 2">
        <svg class="ct-banner-art" viewBox="0 0 96 96" aria-hidden="true"><defs><linearGradient id="ct-calendar-gold" x2="1" y2="1"><stop stop-color="#fff3ce"/><stop offset="1" stop-color="#d4a047"/></linearGradient></defs><rect x="16" y="20" width="66" height="64" rx="12" fill="url(#ct-calendar-gold)" stroke="#c69643"/><path d="M16 40h66M34 13v18M65 13v18" fill="none" stroke="#b98226" stroke-width="5" stroke-linecap="round"/><g fill="#fff9e9"><rect x="29" y="50" width="10" height="10" rx="2"/><rect x="46" y="50" width="10" height="10" rx="2"/><rect x="63" y="50" width="10" height="10" rx="2"/><rect x="29" y="67" width="10" height="10" rx="2"/><rect x="46" y="67" width="10" height="10" rx="2"/></g></svg>
        <div class="ct-banner-copy"><h2>Подбор под задачу клиента</h2><p>Инструменты по доходности и периодичности выплат</p></div>
        <button type="button" id="ctPayoutToggle" class="ct-banner-cta" aria-expanded="false" aria-controls="ctPayout">Открыть подбор</button>
      </div>
      <div class="ct-banner-slide" role="group" aria-roledescription="слайд" aria-label="2 из 2" inert aria-hidden="true">
        <img class="ct-banner-art" src="assets/investloan-pie-20261014.webp" alt="" width="80" height="80">
        <div class="ct-banner-copy"><h2>Модельный портфель</h2><p>Распределите сумму по классам активов</p></div>
        <button type="button" class="ct-banner-cta" data-open-model>Открыть портфель <span aria-hidden="true">→</span></button>
      </div>
    </div></div>
    <button class="ct-banner-arrow ct-banner-next" type="button" aria-label="Следующий слайд"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m10 6 6 6-6 6"/></svg></button>
    <div class="ct-banner-dots"><button type="button" aria-label="Слайд 1: Подбор под задачу клиента" aria-current="true"></button><button type="button" aria-label="Слайд 2: Модельный портфель" aria-current="false"></button></div>
    <span class="ct-banner-status" role="status" aria-live="polite"></span>`;
  grid.before(banner);
  const slides=[...banner.querySelectorAll('.ct-banner-slide')],dots=[...banner.querySelectorAll('.ct-banner-dots button')];
  let slide=0,start=null;
  function showSlide(value,keyboard=false){
    const next=(value+slides.length)%slides.length;
    if(next===slide)return;
    const moveFocus=keyboard&&slides[slide].contains(document.activeElement);
    close(false,true);slide=next;
    banner.style.setProperty('--ct-slide',String(slide));
    slides.forEach((item,i)=>{item.inert=i!==slide;item.setAttribute('aria-hidden',String(i!==slide));});
    dots.forEach((dot,i)=>dot.setAttribute('aria-current',String(i===slide)));
    banner.querySelector('.ct-banner-status').textContent='Слайд '+(slide+1)+' из 2: '+slides[slide].querySelector('h2').textContent;
    if(moveFocus)slides[slide].querySelector('button').focus({preventScroll:true});
  }
  banner.querySelector('.ct-banner-prev').onclick=()=>showSlide(slide-1);
  banner.querySelector('.ct-banner-next').onclick=()=>showSlide(slide+1);
  dots.forEach((dot,i)=>dot.onclick=()=>showSlide(i));
  banner.querySelector('[data-open-model]').onclick=()=>{close();window.showProductPage('model');};
  banner.querySelector('#ctPayoutToggle').onclick=e=>openPopup(popup,e.currentTarget);
  banner.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();showSlide(slide+(e.key==='ArrowRight'?1:-1),true);}});
  const viewport=banner.querySelector('.ct-banner-window');
  viewport.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'||e.target.closest('button'))return;
    start={x:e.clientX,y:e.clientY,id:e.pointerId};viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointerup',e=>{
    if(!start||e.pointerId!==start.id)return;
    const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;
    if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.25)showSlide(slide+(dx<0?1:-1));
  });
  viewport.addEventListener('pointercancel',()=>{start=null;});
  banner.addEventListener('animationend',schedulePosition);
}
// Единая лента подбора; полный каталог сохраняет прежние карточки.
const heroCopy=page.querySelector('.hero-copy');if(heroCopy)heroCopy.append(toolbar,chips);
// Fixed overlays live outside animated sections, so ancestors cannot clip or move them.
panel.classList.add('ct-anchored-popup');popup.classList.add('ct-anchored-popup');
panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Фильтры фондов');
popup.setAttribute('role','dialog');
const filterClose=document.createElement('button');filterClose.type='button';filterClose.className='ct-filter-close';
filterClose.setAttribute('aria-label','Закрыть фильтры');filterClose.textContent='×';filterClose.onclick=()=>close(true);
const filterActions=document.createElement('div');filterActions.className='ct-filter-actions';
filterActions.append(document.getElementById('reset'),filterClose);panel.querySelector('.filter-head').append(filterActions);
document.body.append(popup,panel);
window.addEventListener('resize',schedulePosition);
window.addEventListener('scroll',schedulePosition,{capture:true,passive:true});
window.visualViewport?.addEventListener('resize',schedulePosition);
window.visualViewport?.addEventListener('scroll',schedulePosition);
new MutationObserver(()=>{if(!page.classList.contains('active'))close(false,true);}).observe(page,{attributes:true,attributeFilter:['class']});
createBanner();

const carousel=document.createElement('section');carousel.className='ct-carousel';carousel.hidden=true;carousel.innerHTML='<div class="ct-carousel-head"><h2>Подборка инструментов</h2><div><button type="button" id="ctPrev" aria-label="Предыдущие инструменты">‹</button><button type="button" id="ctNext" aria-label="Следующие инструменты">›</button></div></div><div class="ct-rail" id="ctRail" tabindex="0" aria-label="Подборка инструментов"></div>';grid.before(carousel);const rail=carousel.querySelector('.ct-rail');let productConfig=null,rentierConfig=null,monthlyLoanConfig=null;
function productOptions(key){const source=key==='investLoan'&&selection?.frequency==='monthly'?monthlyLoanConfig:productConfig&&productConfig[key];if(!source||!source.rates)return [];const out=[];for(const unit of ['months','days'])for(const [term,value] of Object.entries(source.rates[unit]||{})){const rate=Number(value&&typeof value==='object'?value.rate:value);if(Number.isFinite(rate))out.push({term:Number(term),unit,rate});}return out.sort((a,b)=>a.unit.localeCompare(b.unit)||a.term-b.term);}
function productCard(id,title,target,options,description){const chosen=selection?.frequency||'any',min=selection?.min??null,rows=options.filter(o=>min===null||o.rate>=min);if(!rows.length)return null;if(mode==='favorites'&&!favorites.has('product:'+id))return null;const q=search.value.trim().toLowerCase();if(q&&!title.toLowerCase().includes(q))return null;if(Object.values(state).some(v=>v.size))return null;const article=document.createElement('article');article.className='ct-placement ct-product';article.innerHTML=favoriteButton('product:'+id)+'<small>Продукт · '+esc(title)+'</small><h3>'+esc(title)+'</h3><p>'+esc(description)+'</p><label>Срок и доходность<select aria-label="Срок и доходность '+esc(title)+'">'+rows.map(o=>'<option value="'+o.unit+':'+o.term+'">'+o.term+' '+(o.unit==='years'?'лет':o.unit==='days'?'дн.':'мес.')+' · '+String(o.rate).replace('.',',')+'% годовых</option>').join('')+'</select></label><p class="ct-product-period">'+esc(chosen==='maturity'&&id==='rentier'?'В конце срока — возврат взноса; доход выплачивается по графику.':'Суммы и порядок выплат — в калькуляторе продукта.')+'</p><button type="button" class="ct-open-product" data-product-target="'+target+'" data-payout-mode="'+(chosen==='monthly'?'monthly':'maturity')+'" data-rentier="'+(id==='rentier')+'">Рассчитать доход</button>';return article;}
function addProducts(container=rail){if((!selection&&mode!=='favorites')||selection?.type==='funds'||selection?.type==='placements')return;const f=selection?.frequency||'any',include=(values)=>f==='any'||values.includes(f);if(include(['maturity'])){const card=productCard('taccount','Т‑Счёт','taccount',productOptions('tAccount'),'Доход выплачивается в конце срока. Доходность зависит от срока.');if(card)container.append(card);}if(include(['monthly','maturity'])){const card=productCard('investloan','Инвестзайм','investloan',productOptions('investLoan'),'Доход — ежемесячно или в конце срока. Условия выбранного варианта уточняются при оформлении.');if(card)container.append(card);}if(rentierConfig&&include(['monthly','quarterly','semiannual','maturity'])){const frequency=({monthly:12,quarterly:4,semiannual:2})[f]||12,options=(rentierConfig.rates[frequency]||[]).map((rate,i)=>({term:i+1,unit:'years',rate}));const card=productCard('rentier','НСЖ «Рантье»','nszh',options,'Регулярные выплаты без капитализации. Взнос возвращается в конце срока. Условия по файлу от 01.10.2026.');if(card)container.append(card);}}
function arrows(){const max=Math.max(0,rail.scrollWidth-rail.clientWidth),left=rail.scrollLeft;document.getElementById('ctPrev').disabled=left<=2;document.getElementById('ctNext').disabled=left>=max-2;}
for(const [id,direction] of [['ctPrev',-1],['ctNext',1]])document.getElementById(id).onclick=()=>rail.scrollBy({left:direction*((rail.firstElementChild?.getBoundingClientRect().width||320)+18),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});rail.addEventListener('scroll',arrows,{passive:true});window.addEventListener('resize',arrows);
const oldAfter=window.catalogAfterRender;window.catalogAfterRender=()=>{oldAfter();rail.replaceChildren();carousel.hidden=!selection;grid.hidden=!!selection;if(selection){for(const card of [...grid.children])rail.append(card);for(const card of [...results.querySelectorAll('.ct-placement')])rail.append(card);results.replaceChildren();addProducts();const total=rail.children.length;document.getElementById('count').textContent='Показано: '+total;document.getElementById('empty').hidden=total>0;rail.scrollLeft=0;requestAnimationFrame(arrows);}else{
  grid.hidden=false;
  if(mode==='favorites'){
    const products=document.createElement('div');products.className='ct-placement-grid';addProducts(products);
    if(products.children.length)results.append(products);
    const total=grid.children.length+results.querySelectorAll('.ct-placement').length;
    document.getElementById('count').textContent='Показано: '+total;document.getElementById('empty').hidden=total>0;
  }
  arrows();
}};
page.addEventListener('click',async e=>{
  const button=e.target.closest('[data-product-target]');if(!button)return;
  const offer=button.closest('.ct-product').querySelector('select').value,target=button.dataset.productTarget;
  window.showProductPage(target);
  const prefix=target==='taccount'?'tacc':target==='investloan'?'loan':null;
  if(prefix){
    // The catalogue and calculators fetch their configurations independently.
    await window.productRatesReady;
    if(target==='investloan')window.setLoanPayoutMode?.(button.dataset.payoutMode);
    const term=document.getElementById(prefix+'Term');
    if([...term.options].some(option=>option.value===offer)){
      term.value=offer;term.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }
  if(button.dataset.rentier==='true')document.querySelector('[data-program="rentier"]')?.click();
});
Promise.allSettled([fetch('./investloan-monthly-rates.json?v=20261020-1',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(c=>{monthlyLoanConfig=c;}),fetch('./rates.json?v='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(c=>{productConfig=c;}),fetch('./rentier-config.json?v='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(c=>{rentierConfig=c;})]).then(run);
run();

})();
