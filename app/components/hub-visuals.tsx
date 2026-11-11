import type {ReactNode} from 'react';

/** One slice of a part-to-whole visual. `tone` maps to a `tone-*` class in hub-theme.css. */
export type VisualPart={key:string;label:string;value:number;tone:string};

const share=(value:number)=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));

/**
 * Native SVG and CSS only: no chart library, extra request or image.
 * Every number these visuals encode is also written as text next to them.
 */

/** Single-value gauge. Decorative: the caller writes the percentage beside it. */
export function HubRing({value,size=56,stroke=6}:{value:number;size?:number;stroke?:number}){
 const radius=(size-stroke)/2,length=2*Math.PI*radius,filled=length*share(value),center=size/2;
 return <svg className="hub-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
  <circle className="hub-ring-track" cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke}/>
  <circle className="hub-ring-value" cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${filled} ${length-filled}`} transform={`rotate(-90 ${center} ${center})`}/>
 </svg>;
}

/** Part-to-whole ring with a 2px gap between slices; the total goes in the middle. */
export function HubDonut({parts,size=128,stroke=15,children}:{parts:VisualPart[];size?:number;stroke?:number;children?:ReactNode}){
 const visible=parts.filter(part=>part.value>0),total=visible.reduce((sum,part)=>sum+part.value,0);
 const radius=(size-stroke)/2,length=2*Math.PI*radius,center=size/2,gap=visible.length>1?2:0;
 // Each slice starts where the previous one ended.
 const slices=visible.reduce<{part:VisualPart;start:number;full:number}[]>((list,part)=>{
  const previous=list[list.length-1];
  return [...list,{part,start:previous?previous.start+previous.full:0,full:length*part.value/total}];
 },[]);
 return <div className="hub-donut" style={{width:size,height:size}}>
  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={parts.map(part=>`${part.label}: ${part.value}`).join('; ')}>
   <circle className="hub-ring-track" cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke}/>
   {slices.map(({part,start,full})=>{
    const drawn=Math.max(0,full-gap);
    return <circle key={part.key} className={'hub-donut-part tone-'+part.tone} cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} strokeDasharray={`${drawn} ${length-drawn}`} strokeDashoffset={-start} transform={`rotate(-90 ${center} ${center})`}><title>{`${part.label}: ${part.value}`}</title></circle>;
   })}
  </svg>
  {children&&<div className="hub-donut-center">{children}</div>}
 </div>;
}

/** Thin segmented bar. Decorative: values are listed as text by the caller. */
export function HubSegments({parts}:{parts:VisualPart[]}){
 const visible=parts.filter(part=>part.value>0);
 return <span className={'hub-segments'+(visible.length?'':' is-empty')} aria-hidden="true">{visible.map(part=><span key={part.key} className={'tone-'+part.tone} style={{flexGrow:part.value}} title={`${part.label}: ${part.value}`}/>)}</span>;
}
