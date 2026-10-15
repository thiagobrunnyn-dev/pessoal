export function propertyNumber(value:unknown){return typeof value==='number'&&Number.isSafeInteger(value)&&value>0?String(value).padStart(2,'0'):'';}
export function propertyLabel(p:{name?:string;control_number?:unknown;state_code?:string}){return [propertyNumber(p.control_number),p.name].filter(Boolean).join(' · ');}
