import fs from 'node:fs/promises';
import dns from 'node:dns';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
dns.setDefaultResultOrder('ipv4first');
const runFile=promisify(execFile);
const diagnostics=[];
function describe(e){return [e.message,e.cause?.code,e.cause?.message].filter(Boolean).join(' | ');}
function record(message){diagnostics.push(message);console.warn(message);}
import { pathToFileURL } from 'node:url';
const SOURCE='https://www.tbank.ru/invest/recommendations/';
const FILE=new URL('../dcm.json',import.meta.url);
export function extract(html){
 const match=html.match(/<script\b[^>]*id=["']__REACT_QUERY_STATE__invest["'][^>]*>([\s\S]*?)<\/script>/i);
 if(!match)throw new Error('Нет встроенного каталога __REACT_QUERY_STATE__invest');
 const state=JSON.parse(match[1]);
 const catalogues=state.queries?.map(q=>q.state?.data).filter(d=>Array.isArray(d?.shelves));
 if(!catalogues?.length)throw new Error('Не найден список shelves; старые данные сохранены');
 const normalizeTitle=value=>String(value??'').normalize('NFKC').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/\s+/g,' ').trim();
 const sectionFor=title=>title==='Первичные размещения от Т-Банка'?'primary':title==='Сейчас размещаются'?'current':/аналитик/i.test(title)?'analysts':'other';
 const placements=[];
 // Follow typed placement cards, including cards nested in analyst lists.
 // Plain stocks, traded bonds and editorial articles are not placements.
 function issuanceCards(value){
  if(!value||typeof value!=='object')return [];
  if(Array.isArray(value))return value.flatMap(issuanceCards);
  if(value.type==='Issuance')return [value];
  return Object.values(value).flatMap(issuanceCards);
 }
 for(const shelf of catalogues.flatMap(d=>d.shelves)){
  if(!shelf||typeof shelf!=='object')throw new Error('Повреждённый блок каталога; старые данные сохранены');
  const title=normalizeTitle(shelf.shelfName),section=sectionFor(title);
  if(!Array.isArray(shelf.shelfSections)){
   if('shelfSections' in shelf||section!=='other')throw new Error(`Неполный блок ${title}; старые данные сохранены`);
   continue;
  }
  for(const x of issuanceCards(shelf.shelfSections)){
   if(!x.id||!x.name||!x.shortDescription)throw new Error(`Неполная карточка размещения в блоке ${title}; старые данные сохранены`);
   const logo=x.security?.asset?.logoName;
   const image=logo?`https://invest-brands.cdn-tinkoff.ru/${logo.replace(/\.png$/i,'x160.png')}`:'';
   const text=`${x.name} ${x.shortDescription}`;
   placements.push({id:`${section}-${x.id}`,sourceId:x.id,section,sourceSections:[section],sourceShelves:[title||'Без названия'],issuer:x.name.replace(/^Облигации\s+/i,''),title:x.name,issueName:x.security?.asset?.showName||'',coupon:x.shortDescription,currency:/CNY|юан/i.test(text)?'CNY':/USD|доллар/i.test(text)?'USD':/(?<![A-Za-zА-Яа-яЁё])(?:EUR|евро)(?![A-Za-zА-Яа-яЁё])/i.test(text)?'EUR':'RUB',deadline:x.bar?.text||'',image,isQual:x.security?.isQual??null,missingChecks:0});
  }
 }
 // An available catalogue may legitimately contain no placement cards.
 return reconcile([],placements);
}
export function reconcile(_old,fresh){
 const unique=new Map();
 for(const x of fresh){
  const key=x.sourceId||x.id;
  if(!key)throw new Error('Карточка без идентификатора; старые данные сохранены');
  const previous=unique.get(key);
  if(!previous){unique.set(key,{...x,missingChecks:0});continue;}
  previous.sourceSections=[...new Set([...(previous.sourceSections||[previous.section]),...(x.sourceSections||[x.section])])];
  previous.sourceShelves=[...new Set([...(previous.sourceShelves||[]),...(x.sourceShelves||[])])];
 }
 return [...unique.values()];
}
async function collect(){
 let lastError;
 for(let attempt=0;attempt<2;attempt++){
  try{
   const r=await fetch(SOURCE,{signal:AbortSignal.timeout(30000),headers:{'user-agent':'Mozilla/5.0','accept':'text/html'}});
   record(`DCM: fetch HTTP ${r.status}; URL ${r.url}`);
   if(!r.ok)throw new Error(`HTTP ${r.status}`);
   const html=await r.text();await fs.writeFile('dcm-debug.html',html);
   return extract(html);
  }catch(e){lastError=e;record(`DCM: запрос ${attempt+1}/2: ${describe(e)}`);}
 }
 // Independent HTTP client: useful if Node's connection fails before receiving HTML.
 try{
  const {stdout}=await runFile('curl',['-4','--location','--fail-with-body','--connect-timeout','15','--max-time','45','--user-agent','Mozilla/5.0','--output','dcm-debug.html','--write-out','HTTP %{http_code}; URL %{url_effective}',SOURCE],{timeout:50000,maxBuffer:1024*1024});
  record(`DCM: curl ${stdout}`);
  return extract(await fs.readFile('dcm-debug.html','utf8'));
 }catch(e){record(`DCM: curl: ${describe(e)} ${e.stderr||''}`);}
 console.log('DCM: HTTP-клиенты не дали каталог; проверяю Chromium');
 const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({locale:'ru-RU'});
 page.on('requestfailed',r=>{if(r.isNavigationRequest())record(`DCM: navigation failed ${r.url()}: ${r.failure()?.errorText}`);});
 try{
  // Do not swallow navigation errors: a blank page can never contain the catalog.
  const response=await page.goto(SOURCE,{waitUntil:'domcontentloaded',timeout:60000});
  record(`DCM: Chromium HTTP ${response?.status()}; URL ${page.url()}; title ${await page.title()}`);
  if(response&&response.status()>=400)throw new Error(`HTTP ${response.status()}`);
  const html=await response?.text().catch(()=>'');
  if(html){await fs.writeFile('dcm-debug.html',html);try{return extract(html);}catch(e){record(`DCM: HTML ответа: ${describe(e)}`);}}
  const state=await page.locator('script[id="__REACT_QUERY_STATE__invest"]').textContent({timeout:15000});
  // Read only the data node, avoiding page.content() during page navigation.
  return extract(`<script id="__REACT_QUERY_STATE__invest">${state}</script>`);
 }catch(e){
  const html=await page.content().catch(()=>'');
  if(html)await fs.writeFile('dcm-debug.html',html);
  record(`DCM: Chromium: ${describe(e)}; final URL ${page.url()}; title ${await page.title().catch(()=>'unavailable')}`);
  await page.screenshot({path:'dcm-debug.png',fullPage:true,timeout:10000}).catch(()=>{});
  throw new Error(`${describe(lastError)}; Chromium: ${describe(e)}`);
 }finally{await browser.close();}
}
async function main(){
 try{
  const previous=JSON.parse(await fs.readFile(FILE,'utf8').catch(()=>'{"placements":[]}'));
  const fresh=await collect();
  const placements=reconcile(previous,fresh);
  const payload={updatedAt:new Date().toISOString(),source:SOURCE,placements};
  await fs.writeFile(new URL('../dcm.json.tmp',import.meta.url),JSON.stringify(payload,null,2)+'\n');
  await fs.rename(new URL('../dcm.json.tmp',import.meta.url),FILE);
  console.log(`DCM: получено ${fresh.length} размещений, сохранено ${placements.length}`);
 }catch(e){console.error(`DCM: старый dcm.json сохранён: ${e.message}`);await fs.writeFile('dcm-debug-error.txt',diagnostics.join('\n')+'\n\n'+String(e.stack||e));process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
