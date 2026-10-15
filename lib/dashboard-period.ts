export const PERIODS={day:'Diário',week:'Semanal',fortnight:'Quinzenal',month:'Mensal'} as const;
export type Period=keyof typeof PERIODS;
export const DASHBOARD_TIMEZONE='America/Belem';
export function belemToday(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:DASHBOARD_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function periodBounds(period:Period,date:string){
 if(!Object.hasOwn(PERIODS,period)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date<'1900-01-01'||date>'2200-12-31')throw new Error('Selecione um período e uma data válidos.');
 const anchor=new Date(date+'T12:00:00Z'),start=new Date(anchor),end=new Date(anchor);
 if(period==='day'){end.setUTCDate(end.getUTCDate()+1);}else if(period==='week'){const offset=(start.getUTCDay()+6)%7;start.setUTCDate(start.getUTCDate()-offset);end.setTime(start.getTime());end.setUTCDate(end.getUTCDate()+7);}else if(period==='fortnight'){start.setUTCDate(anchor.getUTCDate()<=15?1:16);end.setTime(start.getTime());if(start.getUTCDate()===1)end.setUTCDate(16);else{end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+1);}}else{start.setUTCDate(1);end.setTime(start.getTime());end.setUTCMonth(end.getUTCMonth()+1);}
 const iso=(d:Date)=>d.toISOString().slice(0,10),days:string[]=[];for(const d=new Date(start);d<end;d.setUTCDate(d.getUTCDate()+1))days.push(iso(d));
 return {period,date,start:iso(start),end:iso(end),last:days.at(-1)!,days,timeZone:DASHBOARD_TIMEZONE};
}
