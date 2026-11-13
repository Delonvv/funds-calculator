// Same-origin data refresh on section entry. No timers or full-page reloads.
(() => {
  'use strict';
  const entries = [], pending = new Map();
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  function rememberCatalogue() {
    const choices=[...document.querySelectorAll('.ct-product')].map(card=>[card.querySelector('[data-favorite]')?.dataset.favorite,card.querySelector('select')?.value]);
    const rail=document.querySelector('#ctRail'),left=rail?.scrollLeft||0;
    const focused=document.activeElement,focusId=focused?.id,start=focused?.selectionStart,end=focused?.selectionEnd;
    return ()=>{
      for(const card of document.querySelectorAll('.ct-product')) {
        const key=card.querySelector('[data-favorite]')?.dataset.favorite,value=choices.find(x=>x[0]===key)?.[1],select=card.querySelector('select');
        if(select&&[...select.options].some(x=>x.value===value))select.value=value;
      }
      if(rail)rail.scrollLeft=left;
      if(focusId&&!focused.isConnected){const next=document.getElementById(focusId);next?.focus({preventScroll:true});if(start!==null&&next?.setSelectionRange)try{next.setSelectionRange(start,end);}catch{}}
    };
  }
  function request(file, decode, requests=pending) {
    if (requests.has(file)) return requests.get(file);
    const work = fetch('./' + file + '?refresh=' + Date.now(), {cache:'no-store',signal:AbortSignal.timeout(12000)})
      .then(r => {if (!r.ok) throw Error('HTTP ' + r.status);return decode ? r.text().then(decode) : r.json();})
      .finally(() => requests.delete(file));
    requests.set(file,work);return work;
  }
  const api = window.pageDataRefresh = {
    register(entry) { entries.push(entry); },
    async refresh(name) {
      const requests = new Map();
      const results = await Promise.allSettled(entries.filter(e=>e.pages.includes(name)).map(async e=>{
        const revision = e.revision = (e.revision || 0) + 1;
        const next = await request(e.file,e.decode,requests);
        if (e.revision !== revision) return false;
        if (!e.validate(next)) throw Error('Invalid ' + e.file);
        if (same(e.current(),next)) return false;
        const restore=rememberCatalogue();
        e.apply(next);restore();return true;
      }));
      return {changed:results.some(r=>r.status==='fulfilled'&&r.value),failed:results.some(r=>r.status==='rejected')};
    }
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const previous = window.showProductPage;
    if (typeof previous !== 'function') return;
    let visit = 0;
    const signature = doc => JSON.stringify([
      ...[...doc.querySelectorAll('script')].filter(s=>!s.src||new URL(s.src,location.href).origin===location.origin).map(s=>s.getAttribute('src')||s.textContent),
      ...[...doc.querySelectorAll('link[rel="stylesheet"]')].map(s=>s.getAttribute('href'))
    ]);
    const initialSignature = signature(document);
    async function releaseChanged() {
      try {
        const html = await request('index.html',text=>text);
        const doc = new DOMParser().parseFromString(html,'text/html');
        if (!doc.querySelector('#fundsPage') || !doc.querySelector('script[src]')) return false;
        // Purely static Sber reference has no bound controls to reinitialize.
        const reference = doc.querySelector('#premiumSberPage'),current=document.querySelector('#premiumSberPage');
        if (reference && current && current.innerHTML !== reference.innerHTML) current.innerHTML=reference.innerHTML;
        return signature(doc) !== initialSignature;
      } catch { return false; }
    }
    const banner = document.createElement('div');banner.className='page-data-status';banner.hidden=true;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
    document.querySelector('main').prepend(banner);
    window.showProductPage = function(name) {
      const result = previous(name), token = ++visit;
      banner.hidden = true;
      // Nested route wrappers have completed; only the final destination refreshes.
      queueMicrotask(async()=>{
        if (token !== visit) return;
        const current = location.hash.slice(1) || 'funds';
        const [state,newRelease] = await Promise.all([api.refresh(current),releaseChanged()]);
        if (token !== visit) return;
        if (state.failed || state.changed || newRelease) {
          banner.textContent = state.failed ? 'Часть данных не удалось обновить. Для недоступных источников сохранены предыдущие значения; повторите переход позже.' : 'Данные раздела обновлены. Проверьте актуальные ставки в расчёте.';
          if (newRelease) {
            if (!state.failed && !state.changed) banner.textContent='Опубликована новая версия интерфейса. Данные раздела проверены; обновить интерфейс можно в удобный момент. ';
            const button=document.createElement('button');button.type='button';button.textContent='Обновить интерфейс';button.onclick=()=>location.reload();banner.append(' ',button);
          }
          banner.hidden = false;
        }
      });
      return result;
    };
  },{once:true});
})();
