import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const SOURCE='https://www.tbank.ru/invest/recommendations/';
const FILE=new URL('../dcm.json',import.meta.url);
export function extract(html){
 const match=html.match(/<script\b[^>]*id=["']__REACT_QUERY_STATE__invest["'][^>]*>([\s\S]*?)<\/script>/i);
 if(!match)throw new Error('Нет встроенного каталога __REACT_QUERY_STATE__invest');
 const state=JSON.parse(match[1]);
 const data=state.queries?.map(q=>q.state?.data).find(d=>Array.isArray(d?.shelves));
 if(!data)throw new Error('Не найден список shelves');
 const titles={'Первичные размещения от Т-Банка':'primary','Сейчас размещаются':'current'};
 const found=new Set();const placements=[];
 for(const shelf of data.shelves){
  const section=titles[shelf.shelfName?.replace(/‑|–/g,'-')];if(!section)continue;found.add(section);
  if(!Array.isArray(shelf.shelfSections))throw new Error(`Неполный блок ${shelf.shelfName}`);
  for(const x of shelf.shelfSections){
   if(x.type!=='Issuance')continue;
   if(!x.id||!x.name||!x.shortDescription)throw new Error('Неполная карточка размещения');
   const logo=x.security?.asset?.logoName;
   const image=logo?`https://invest-brands.cdn-tinkoff.ru/${logo.replace(/\.png$/i,'x160.png')}`:'';
   const text=`${x.name} ${x.shortDescription}`;
   placements.push({id:`${section}-${x.id}`,sourceId:x.id,section,issuer:x.name.replace(/^Облигации\s+/i,''),title:x.name,issueName:x.security?.asset?.showName||'',coupon:x.shortDescription,currency:/CNY|юан/i.test(text)?'CNY':/USD|доллар/i.test(text)?'USD':/EUR|евро/i.test(text)?'EUR':'RUB',deadline:x.bar?.text||'',image,isQual:x.security?.isQual??null,missingChecks:0});
  }
 }
 if(!found.has('primary')||!found.has('current'))throw new Error('Один из двух блоков отсутствует; старые данные сохранены');
 return placements;
}
export function reconcile(old,fresh){
 const incoming=new Map(fresh.map(x=>[x.id,x]));const result=[...incoming.values()];
 for(const x of old.placements||[]){
  // Older parser used unrelated identifiers: migrate to verified source IDs once.
  if(!x.sourceId||incoming.has(x.id))continue;
  const missingChecks=(x.missingChecks||0)+1;
  if(missingChecks<2)result.push({...x,missingChecks});
 }
 return result;
}
async function collect(){
 let lastError;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const r=await fetch(SOURCE,{signal:AbortSignal.timeout(35000),headers:{'user-agent':'Mozilla/5.0','accept':'text/html'}});
   if(!r.ok)throw new Error(`HTTP ${r.status}`);
   const html=await r.text();const cards=extract(html);return cards;
  }catch(e){lastError=e;console.warn(`DCM: запрос ${attempt+1}/3: ${e.message}`);}
 }
 console.log('DCM: обычный запрос не дал каталог; проверяю HTML через Chromium');
 const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 try{
  await page.goto(SOURCE,{waitUntil:'commit',timeout:45000}).catch(()=>{});
  await page.waitForSelector('script[id="__REACT_QUERY_STATE__invest"]',{state:'attached',timeout:45000});
  return extract(await page.content());
 }catch(e){
  await fs.writeFile('dcm-debug.html',await page.content().catch(()=>''));
  await page.screenshot({path:'dcm-debug.png',fullPage:true}).catch(()=>{});
  throw new Error(`${lastError?.message}; Chromium: ${e.message}`);
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
 }catch(e){console.error(`DCM: старый dcm.json сохранён: ${e.message}`);await fs.writeFile('dcm-debug-error.txt',String(e.stack||e));process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
