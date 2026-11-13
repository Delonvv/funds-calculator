// Dated scenario, separate from programme terms and actual payout instructions.
export const DEFAULT_PDS_SCENARIO_RATE = 15;
const DAY = 86400000;
const iso = time => new Date(time).toISOString().slice(0,10);
function dateTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw Error('Укажите корректные даты сценария');
  const [year,month,day] = value.split('-').map(Number), time = Date.UTC(year,month-1,day);
  if(year<2024 || iso(time)!==value) throw Error('Укажите корректные даты сценария');
  return time;
}
export function scenarioAnniversary(startDate,years) {
  const start=dateTime(startDate),d=new Date(start),year=d.getUTCFullYear()+Number(years);
  if(!Number.isInteger(year)||year>9999)throw Error('Некорректный срок сценария');
  const month=d.getUTCMonth(),day=Math.min(d.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());
  return iso(Date.UTC(year,month,day));
}
function monthDate(start,offset) {
  const d=new Date(start),first=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+offset,1));
  const day=Math.min(d.getUTCDate(),new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate());
  return Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),day);
}
function annualIrr(flows,dates,end) {
  if(flows.every(x=>x===0))return null;
  if(!flows.some(x=>x>0))return -1;
  const value=rate=>flows.reduce((sum,cash,i)=>sum+cash*(1+rate)**((end-dates[i])/DAY/365),0);
  let low=-.999999999999,high=1;
  while(value(high)>0&&high<1023)high=high*2+1;
  if(value(low)<0||value(high)>0)return null;
  for(let i=0;i<100;i++){const middle=(low+high)/2;if(value(middle)>0)low=middle;else high=middle;}
  const result=(low+high)/2;return Math.abs(result)<1e-12?0:result;
}
export function projectPdsScenario(plan, {
  investmentRatePercent=DEFAULT_PDS_SCENARIO_RATE, period='annual',
  startDate=`${plan.contractYear}-01-01`, endDate=scenarioAnniversary(startDate,plan.years),
  firstBenefitDate=`${Number(startDate.slice(0,4))+1}-07-31`
}={}) {
  if(!Number.isFinite(investmentRatePercent)||investmentRatePercent< -100||investmentRatePercent>100)throw Error('Укажите инвестдоход в сценарии от −100 до 100% годовых');
  if(!['annual','monthly'].includes(period))throw Error('Некорректный период взноса');
  const start=dateTime(startDate),end=dateTime(endDate),firstBenefit=dateTime(firstBenefitDate),startYear=new Date(start).getUTCFullYear(),endYear=new Date(end).getUTCFullYear();
  if(startYear!==plan.contractYear)throw Error('Год первого взноса не совпадает с годом договора');
  if(end<=start||end>dateTime(scenarioAnniversary(startDate,30)))throw Error('Выберите дату выхода после первого взноса, не далее 30 лет');
  if(new Date(firstBenefit).getUTCFullYear()!==startYear+1)throw Error('Первая доплата в сценарии — в следующем календарном году');
  const cutoff=Date.UTC(endYear,0,1),minimumTaxDate=scenarioAnniversary(startDate,plan.minimumTaxYears),taxTermMet=end>=dateTime(minimumTaxDate),rules=plan.conditions;
  if(!rules)throw Error('Не загружены условия сценария');
  const eligibilityDate=scenarioAnniversary(startDate,plan.wait);
  const dates={startDate,endDate,lastIncomeDate:iso(cutoff-DAY),minimumTaxDate,firstBenefitDate,eligibilityDate,eligibleAtEnd:endDate>=eligibilityDate};
  const holdingYears=(end-start)/DAY/365,holdingDays=(end-start)/DAY;
  let guaranteeCycles=0;
  for(let years=rules.guaranteeYears;years<=30;years+=rules.guaranteeYears)if(end>=dateTime(scenarioAnniversary(startDate,years)))guaranteeCycles++;
  const events=new Map(),byYear=new Map();
  const event=time=>{if(!events.has(time))events.set(time,{contribution:0,support:0,tax:0});return events.get(time);};
  let personal=0,exposure=0;
  for(let month=0;month<360;month++){
    const time=monthDate(start,month);if(time>=end)break;
    if(period==='annual'&&month%12!==0)continue;
    const contribution=period==='annual'?plan.annual:plan.annual/12,year=new Date(time).getUTCFullYear();
    event(time).contribution+=contribution;personal+=contribution;
    exposure+=contribution*(end-time)/DAY/365;
    byYear.set(year,(byYear.get(year)||0)+contribution);
  }
  if(plan.supportAnnual===null)return {available:false,...dates,personal,holdingYears,holdingDays,taxTermMet,guaranteeCycles};
  let supportPotential=0,taxPotential=0;
  for(const [year,contribution] of byYear){
    const support=year<startYear+rules.supportYears&&contribution+1e-7>=rules.supportMinimum?Math.min(rules.supportCap,contribution/rules.supportDivisor):0;
    const tax=Math.min(contribution,rules.taxLimit)*rules.taxRate;
    supportPotential+=support;taxPotential+=tax;
    const time=dateTime(scenarioAnniversary(firstBenefitDate,year-startYear));
    if(time<=end){event(time).support+=support;event(time).tax+=taxTermMet?tax:0;}
  }
  event(end);
  const times=[...events.keys()].sort((a,b)=>a-b),cashFlows=[],cashFlowDates=[],schedule=[];
  let account=0,previous=start,support=0,taxTotal=0;
  for(const time of times){
    // Current exit-year income (positive or negative) is excluded from the payout model.
    const days=Math.max(0,Math.min(time,cutoff)-Math.min(previous,cutoff))/DAY;
    if(days)account*=(1+investmentRatePercent/100)**(days/365);
    const row=events.get(time);
    account+=row.contribution+row.support;support+=row.support;taxTotal+=row.tax;
    cashFlows.push(-row.contribution+row.tax+(time===end?account:0));cashFlowDates.push(iso(time));
    schedule.push({date:iso(time),...row,account});previous=time;
  }
  const investment=account-personal-support,additional=account+taxTotal-personal;
  return {available:true,...dates,account,personal,support,supportPotential,taxPotential,taxTotal,taxTermMet,
    investment:Math.abs(investment)<1e-7?0:investment,additional,
    annualized:annualIrr(cashFlows,times,end),simpleAnnual:exposure>0?additional/exposure:null,
    averageAnnualGain:additional/holdingYears,averageInvested:exposure/holdingYears,holdingDays,holdingYears,
    cashFlows,cashFlowDates,schedule,investmentRatePercent,period,
    guaranteeCycles
  };
}
