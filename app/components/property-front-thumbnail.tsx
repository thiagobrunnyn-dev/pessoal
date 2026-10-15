'use client';
import {useEffect,useRef,useState} from 'react';
import {Building2} from 'lucide-react';

/** Only the existing private image endpoint; defer bytes until close to the viewport. */
export default function PropertyFrontThumbnail({propertyId,name,assetId}:{propertyId:string;name:string;assetId?:string|null}){
 const anchor=useRef<HTMLAnchorElement>(null),[visible,setVisible]=useState(false),[failed,setFailed]=useState(false);
 const hasPhoto=typeof assetId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(assetId);
 useEffect(()=>{if(!hasPhoto)return;if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'120px'});if(anchor.current)observer.observe(anchor.current);return()=>observer.disconnect();},[hasPhoto,assetId]);
 return <a ref={anchor} href={'/imoveis/'+encodeURIComponent(propertyId)} className="property-front-thumbnail" aria-label={'Abrir ficha do imóvel '+name}>
  {hasPhoto&&visible&&!failed?<img src={'/api/property-front-photo/'+assetId} alt={'Fachada de '+name} loading="lazy" decoding="async" fetchPriority="low" width={72} height={72} onError={()=>setFailed(true)}/>:<span className="property-thumbnail-placeholder"><Building2 size={22} aria-hidden="true"/><small>{failed?'Indisponível':hasPhoto?'Fachada':'Sem foto'}</small></span>}
 </a>;
}
